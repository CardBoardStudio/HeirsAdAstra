#!/usr/bin/env node
// PR mixer (docs/pr-mixer.md): pick open PRs, merge them onto main, build the
// combination in Docker and play it, each mix with its own throwaway database.
// A dev-only service beside the dev host; normal players never reach it.
// Node 20+, standard library only.
import http from 'node:http';
import net from 'node:net';
import { spawn, execFile } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm, open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as lib from './lib.mjs';
import * as G from './git.mjs';

const cfg = lib.config(process.env);
const here = fileURLToPath(new URL('.', import.meta.url));
const mirror = `${cfg.data}/repo.git`;
const log = (...a) => console.log(new Date().toISOString(), ...a);

// --- State ------------------------------------------------------------------
// One JSON file: the mixes, by key. Containers, images and volumes are named
// after the key, so the file can always be reconciled with Docker.
let state = { mixes: {} };
const statePath = `${cfg.data}/state.json`;
async function load() {
  try { state = JSON.parse(await readFile(statePath, 'utf8')); } catch { /* first run */ }
  for (const m of Object.values(state.mixes)) {
    // A build interrupted by a restart never finished.
    if (m.status === 'queued' || m.status === 'building') Object.assign(m, { status: 'failed', error: 'interrupted by a mixer restart; apply again' });
  }
  state.tableRoutes = lib.pruneTableRoutes(state.tableRoutes, state.mixes);
}
let saving = Promise.resolve();
function save() {
  saving = saving.then(async () => {
    await writeFile(`${statePath}.tmp`, JSON.stringify(state, null, 1));
    await rename(`${statePath}.tmp`, statePath);
  }).catch((e) => log('state save failed', e.message));
  return saving;
}

// --- Docker -------------------------------------------------------------------
// Docker and the build see only these variables: no tokens, no dev.env.
const dockerEnv = Object.fromEntries(['PATH', 'HOME', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG']
  .filter((k) => process.env[k]).map((k) => [k, process.env[k]]));
const docker = (args, okCodes = [0]) => new Promise((resolve, reject) => {
  execFile('docker', args, { env: dockerEnv, maxBuffer: 16 << 20 }, (err, stdout, stderr) => {
    const code = err ? (typeof err.code === 'number' ? err.code : -1) : 0;
    if (okCodes.includes(code)) resolve({ code, stdout: stdout.trim() });
    else reject(new Error(`docker ${args[0]}: ${stderr.trim() || err.message}`));
  });
});
const names = (key) => ({ image: `pr-mix:${key}`, container: `pr-mix-${key}`, volume: `pr-mix-${key}` });

async function containerRunning(key) {
  const r = await docker(['container', 'inspect', '-f', '{{.State.Running}}', names(key).container], [0, 1]);
  return r.code === 0 && r.stdout === 'true';
}

// --- GitHub -------------------------------------------------------------------
// Reads only. Unauthenticated by default (60 requests/hour for the host), so
// every response is cached by ETag: a 304 does not count against the limit.
const etags = new Map();
let token = null;
async function gh(path) {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'drawing-board-pr-mixer', 'x-github-api-version': '2022-11-28' };
  if (token) headers.authorization = `Bearer ${token}`;
  const hit = etags.get(path);
  if (hit) headers['if-none-match'] = hit.etag;
  const res = await fetch(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(15000) });
  if (res.status === 304 && hit) return hit.body;
  if (!res.ok) {
    const reset = res.headers.get('x-ratelimit-reset');
    const limited = res.status === 403 || res.status === 429;
    throw new Error(limited && reset ? `GitHub rate limit reached until ${new Date(reset * 1000).toISOString()}` : `GitHub ${res.status} for ${path}`);
  }
  const body = await res.json();
  if (res.headers.get('etag')) etags.set(path, { etag: res.headers.get('etag'), body });
  return body;
}

let prCache = { at: 0, prs: [], error: null };
async function listPrs(force = false) {
  if (!force && Date.now() - prCache.at < 60_000) return prCache;
  try {
    const repo = `/repos/${cfg.repo}`;
    const raw = await gh(`${repo}/pulls?state=open&per_page=100&sort=created&direction=asc`);
    const prs = await Promise.all(raw.map(async (p) => {
      const sha = p.head.sha;
      const [runs, status] = await Promise.all([
        gh(`${repo}/commits/${sha}/check-runs?per_page=100`).catch(() => ({ check_runs: [] })),
        gh(`${repo}/commits/${sha}/status`).catch(() => ({ statuses: [] })),
      ]);
      // Render previews only PRs into its service branch (docs/pr-previews.md),
      // so only those look up a deployment.
      let preview = null;
      if (p.base.ref !== 'main') {
        const deps = await gh(`${repo}/deployments?sha=${sha}&per_page=1`).catch(() => []);
        if (deps[0]) {
          const st = await gh(`${repo}/deployments/${deps[0].id}/statuses?per_page=1`).catch(() => []);
          if (st[0]?.state === 'success') preview = st[0].environment_url || null;
        }
      }
      const pr = {
        number: p.number, title: p.title, author: p.user.login, draft: p.draft, url: p.html_url,
        base: p.base.ref, headRef: p.head.ref, headRepo: p.head.repo?.full_name ?? '(deleted fork)', sha,
        labels: p.labels.map((l) => l.name), updated: p.updated_at,
        ci: lib.ciState(runs.check_runs, status.statuses), preview,
      };
      pr.eligible = lib.eligibility(pr, cfg);
      return pr;
    }));
    prCache = { at: Date.now(), prs, error: null };
  } catch (e) {
    prCache = { ...prCache, at: Date.now(), error: e.message };
  }
  return prCache;
}

// --- Planning and building -----------------------------------------------------
let gitLock = Promise.resolve();
const withGit = (fn) => { const r = gitLock.then(fn); gitLock = r.catch(() => {}); return r; };

/** Resolve PR numbers to the listed heads and plan their merge onto main. */
async function planFor(numbers) {
  const { prs } = await listPrs();
  const chosen = [...new Set(numbers)].map((n) => {
    const pr = prs.find((p) => p.number === n);
    if (!pr) throw Object.assign(new Error(`#${n} is not an open PR`), { status: 400 });
    if (!pr.eligible.ok) throw Object.assign(new Error(`#${n} cannot be built: ${pr.eligible.why}`), { status: 403 });
    return pr;
  });
  return withGit(async () => {
    await G.ensureMirror(mirror, cfg.repo);
    const mainSha = await G.fetchHeads(mirror, chosen.map((p) => p.number));
    for (const p of chosen) {
      if (!(await G.hasCommit(mirror, p.sha))) throw Object.assign(new Error(`#${p.number} moved since the list loaded; refresh and apply again`), { status: 409 });
    }
    const plan = await G.plan(mirror, mainSha, chosen);
    plan.key = lib.mixKey(mainSha, chosen);
    plan.prs = lib.mergeOrder(chosen).map(({ number, sha, title, labels }) => ({ number, sha, title, labels }));
    return plan;
  });
}

const queue = [];
let building = null;
function enqueue(plan) {
  const existing = state.mixes[plan.key];
  if (existing && existing.status !== 'failed') { existing.lastUsed = Date.now(); save(); return existing; }
  const mix = {
    key: plan.key, repo: cfg.repo, mainSha: plan.mainSha, mergeSha: plan.mergeSha, prs: plan.prs,
    status: 'queued', created: Date.now(), lastUsed: Date.now(), port: null, error: null,
    // Sign-in code for the mix's disposable preview identities (docs/pr-previews.md).
    accessCode: randomBytes(24).toString('base64url'),
  };
  state.mixes[plan.key] = mix;
  queue.push(plan.key);
  save();
  pump();
  return mix;
}

async function pump() {
  if (building || !queue.length) return;
  building = queue.shift();
  const mix = state.mixes[building];
  try {
    if (mix) await build(mix);
  } catch (e) {
    if (mix) Object.assign(mix, { status: 'failed', error: e.message });
    log('build failed', building, e.message);
  } finally {
    building = null;
    save();
    await gc().catch((e) => log('gc failed', e.message));
    pump();
  }
}

function run(cmd, args, { stdout, stdin, timeoutMs, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: env ?? dockerEnv, stdio: [stdin ? 'pipe' : 'ignore', stdout ?? 'ignore', stdout ?? 'ignore'] });
    const timer = timeoutMs && setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.on('error', reject);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args[0]} exited ${signal ?? code}`));
    });
    if (stdin) stdin(child.stdin);
  });
}

async function build(mix) {
  mix.status = 'building';
  mix.started = Date.now();
  save();
  const dir = `${cfg.data}/builds/${mix.key}`;
  await rm(dir, { recursive: true, force: true });
  await mkdir(`${dir}/src`, { recursive: true });
  const logFile = await open(`${dir}/build.log`, 'w');
  try {
    await logFile.write(`mix ${mix.key}: main ${mix.mainSha}\n${mix.prs.map((p) => `  + #${p.number} ${p.sha} ${p.title}`).join('\n')}\nmerge ${mix.mergeSha}\n\n`);
    // Export the merged tree: no .git, no remote, no credentials in the context.
    const archive = spawn('git', ['--git-dir', mirror, 'archive', '--format=tar', mix.mergeSha], { stdio: ['ignore', 'pipe', 'inherit'] });
    const archived = new Promise((resolve, reject) => archive.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`git archive exited ${code}`)))));
    await Promise.all([archived, run('tar', ['-x', '-C', `${dir}/src`], { stdin: (s) => archive.stdout.pipe(s) })]);
    const { image } = names(mix.key);
    // A dedicated BuildKit builder keeps PR code away from the dev host's
    // build cache: the Dockerfile's cache mounts would otherwise be shared.
    const args = cfg.builder
      ? ['buildx', 'build', '--builder', cfg.builder, '--load']
      : ['build'];
    args.push('--progress', 'plain', '-t', image, '--label', `pr-mixer.key=${mix.key}`, `${dir}/src`);
    await run('docker', args, { stdout: logFile.fd, timeoutMs: cfg.buildMinutes * 60_000 });
    mix.status = 'built';
    mix.built = Date.now();
    await rm(`${dir}/src`, { recursive: true, force: true });
    if (cfg.builder) await docker(['buildx', 'prune', '--builder', cfg.builder, '--force', '--keep-storage', cfg.buildCache], [0, 1]);
  } catch (e) {
    throw new Error(`${e.message}; see the build log`);
  } finally {
    await logFile.close();
  }
}

// --- Running mixes ---------------------------------------------------------------
async function freePort() {
  const used = new Set(Object.values(state.mixes).map((m) => m.port));
  for (let p = cfg.ports[0]; p <= cfg.ports[1]; p++) {
    if (used.has(p)) continue;
    const free = await new Promise((resolve) => {
      const s = net.createServer().once('error', () => resolve(false)).listen(p, '127.0.0.1', () => s.close(() => resolve(true)));
    });
    if (free) return p;
  }
  throw new Error(`no free port in ${cfg.ports.join('-')}`);
}

const starting = new Map();
/** Make sure the mix's container is up; start or create it on demand. */
function ensureRunning(mix) {
  if (!starting.has(mix.key)) starting.set(mix.key, start(mix).finally(() => starting.delete(mix.key)));
  return starting.get(mix.key);
}
async function start(mix) {
  if (await containerRunning(mix.key)) return;
  const { image, container, volume } = names(mix.key);
  const running = Object.values(state.mixes).filter((m) => m.status === 'running' && m.key !== mix.key).sort((a, b) => a.lastUsed - b.lastUsed);
  while (running.length >= cfg.maxRunning) await stop(running.shift());
  const exists = (await docker(['container', 'inspect', container], [0, 1])).code === 0;
  if (!exists) {
    if ((await docker(['image', 'inspect', image], [0, 1])).code !== 0) throw new Error('its image was removed; apply the same PRs again to rebuild');
    mix.port = await freePort();
    // Throwaway data: a fresh named volume per mix, never the dev data/ dir.
    // The sign-in code on the mixer page opens the mix: on https as preview
    // sign-in (disposable identities, docs/pr-previews.md), on a laptop's
    // loopback http as the enrollment code (the server allows it only there).
    const env = cfg.https
      ? ['RENDER=true', 'IS_PULL_REQUEST=true', 'PREVIEW_AUTH=1', `RENDER_EXTERNAL_URL=${cfg.origin}`, `PREVIEW_ACCESS_CODE=${mix.accessCode}`]
      : [`APP_ORIGIN=${cfg.origin}`, `ACCOUNT_REGISTRATION_CODE=${mix.accessCode}`];
    env.push('GALACTIC_REACH_CHANNEL=dev', `GIT_COMMIT=${mix.mergeSha}`, `NIDO_WALLET_HOST=${cfg.nidoWalletHost}`, 'RUST_LOG=info');
    await docker(['run', '-d', '--name', container, '--label', `pr-mixer.key=${mix.key}`,
      '-p', `127.0.0.1:${mix.port}:3000`,
      '--mount', `type=volume,src=${volume},dst=/app/data`,
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '512',
      '--memory', cfg.memory, '--cpus', cfg.cpus,
      ...env.flatMap((e) => ['-e', e]), image]);
  } else {
    await docker(['start', container]);
  }
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${mix.port}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) { mix.status = 'running'; mix.error = null; save(); return; }
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  const tail = await docker(['logs', '--tail', '20', container], [0, 1]).catch(() => ({ stdout: '' }));
  throw new Error(`the mix server did not become healthy: ${tail.stdout.slice(-800)}`);
}

async function stop(mix) {
  await docker(['stop', '-t', '10', names(mix.key).container], [0, 1]);
  if (mix.status === 'running') mix.status = 'built';
  save();
}

async function remove(mix) {
  const { image, container, volume } = names(mix.key);
  await docker(['rm', '-f', container], [0, 1]);
  await docker(['volume', 'rm', '-f', volume], [0, 1]);
  await docker(['image', 'rm', '-f', image], [0, 1]);
  await rm(`${cfg.data}/builds/${mix.key}`, { recursive: true, force: true });
  delete state.mixes[mix.key];
  state.tableRoutes = lib.pruneTableRoutes(state.tableRoutes, state.mixes);
  save();
}

/** Stop idle mixes and delete the least recently used beyond the limit. */
async function gc() {
  const idle = Date.now() - cfg.idleHours * 3_600_000;
  for (const m of Object.values(state.mixes)) {
    if (m.status === 'running' && m.lastUsed < idle) { log('stopping idle mix', m.key); await stop(m); }
  }
  const done = Object.values(state.mixes).filter((m) => !['queued', 'building'].includes(m.status)).sort((a, b) => a.lastUsed - b.lastUsed);
  while (done.length > cfg.maxKept) { const m = done.shift(); log('removing old mix', m.key); await remove(m); }
}

// --- Access ------------------------------------------------------------------------
// The mixer keeps no accounts of its own. `dev-site`: the
// sign-in server's session cookie (sent here too: cookies are per host, not per
// port) must belong to one of its administrators who signed in with Nido
// (lib.isAdmin). `local`: laptop only (lib.config refuses it on https).
// `tailnet`: any user who can reach this service through Tailscale Serve.
const adminCache = new Map();
async function whoIsAdmin(req) {
  for (const mode of cfg.auth) {
    if (mode === 'local') return 'local';
    if (mode === 'tailnet') {
      const identity = lib.isTailnetManager(req.headers, cfg);
      if (identity) return identity;
    }
    if (mode === 'dev-site') {
      const session = lib.cookieValue(req.headers.cookie, cfg.devCookie);
      if (!session) continue;
      const id = createHash('sha256').update(session).digest('hex');
      const hit = adminCache.get(id);
      if (hit && hit.until > Date.now()) { if (hit.name) return hit.name; continue; }
      let name = null;
      try {
        const r = await fetch(`${cfg.devSite}/api/account`, { headers: { cookie: `${cfg.devCookie}=${session}` }, signal: AbortSignal.timeout(5000) });
        const a = r.ok ? await r.json() : null;
        if (lib.isAdmin(a)) name = a.name || a.id;
      } catch { /* sign-in server down: no decision cached */ continue; }
      adminCache.set(id, { name, until: Date.now() + 60_000 });
      if (name) return name;
    }
  }
  return null;
}

// --- HTTP ------------------------------------------------------------------------
const MIX_COOKIE = 'pr_mixer_mix';
const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};
const readJson = (req) => new Promise((resolve, reject) => {
  let data = '';
  req.on('data', (c) => { data += c; if (data.length > 1e5) req.destroy(); });
  req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(Object.assign(new Error('bad JSON'), { status: 400 })); } });
});
const numbersOf = (body) => {
  if (!Array.isArray(body.prs) || !body.prs.every(Number.isInteger)) throw Object.assign(new Error('prs must be a list of PR numbers'), { status: 400 });
  return body.prs;
};
const publicMix = (m) => ({ ...m, open: `/mix/${m.key}/`, queuePosition: queue.indexOf(m.key) + 1 || null });

let ui = '';
async function handle(req, res) {
  const url = new URL(req.url, cfg.origin);
  const p = url.pathname;
  const management = p.startsWith('/__mixer') || /^\/mix\//.test(p);
  // Management never follows from a player cookie or from tailnet membership.
  const admin = management ? await whoIsAdmin(req) : null;
  if (management && !admin) {
    if (p.startsWith('/__mixer/api/')) return send(res, 403, { error: 'Playtest management requires operator access.' });
    return send(res, 403, '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Playtests · Access required</title><h1>Playtest management requires operator access</h1><p>Players should open the invitation from their host. Operators: configure MIXER_MANAGERS for your Tailscale login, or use the configured Nido administrator session.</p>', 'text/html; charset=utf-8');
  }
  if (!management && cfg.auth.includes('tailnet') && !lib.tailnetIdentity(req.headers))
    return gameFailure(req, res, 403, 'Connect to Tailscale on this device, then try your invitation again.');
  if (p === '/__mixer' || p === '/__mixer/') return send(res, 200, ui, 'text/html; charset=utf-8');
  if (p.startsWith('/__mixer/api/')) {
    if (req.method !== 'GET' && !lib.sameOrigin(req.headers, cfg.origin)) return send(res, 403, { error: 'cross-origin request refused' });
    try { return await api(req, res, p.slice('/__mixer/api/'.length), url, admin); } catch (e) {
      return send(res, e.status ?? 500, { error: e.message });
    }
  }
  const enter = p.match(/^\/mix\/([0-9a-f]{12})\/?$/);
  if (enter) {
    const mix = state.mixes[enter[1]];
    if (!mix) return send(res, 404, 'No such mix. <a href="/__mixer/">Back to the mixer</a>', 'text/html; charset=utf-8');
    res.writeHead(302, { location: '/', 'set-cookie': `${MIX_COOKIE}=${mix.key}; Path=/; HttpOnly; SameSite=Lax${cfg.https ? '; Secure' : ''}`, 'cache-control': 'no-store' });
    return res.end();
  }
  if (p === '/__mixer/leave') {
    res.writeHead(302, { location: '/__mixer/', 'set-cookie': `${MIX_COOKIE}=; Path=/; Max-Age=0`, 'cache-control': 'no-store' });
    return res.end();
  }
  const selected = lib.cookieValue(req.headers.cookie, MIX_COOKIE);
  const route = lib.tabletopRoute(state, req.method, url, selected, Date.now(), req.headers.referer);
  if (route?.ambiguous || route?.missing)
    return gameFailure(req, res, 404, 'This game link is no longer available. Ask your host for a fresh invitation.');
  const mix = state.mixes[route?.key ?? selected];
  if (!mix || !['built', 'running'].includes(mix.status))
    return gameFailure(req, res, 503, 'This game is temporarily unavailable. Your host can bring it back online.');
  try {
    mix.lastUsed = Date.now();
    await ensureRunning(mix);
  } catch (e) {
    log('game unavailable', mix.key, e.message);
    return gameFailure(req, res, 503, 'This game is temporarily unavailable. Please try again shortly.');
  }
  // Only a fallback for pages without a table ID (for example the manual).
  // A table-specific request always uses the durable route above.
  proxy(req, res, mix, route && route.key !== selected);
}

function gameFailure(req, res, status, message) {
  return req.url.startsWith('/api/')
    ? send(res, status, { error: message })
    : send(res, status, lib.gameError(message), 'text/html; charset=utf-8');
}

function proxy(req, res, mix, remember = false) {
  const headers = { ...req.headers };
  // Strip what the mix must not see: other cookies (the sign-in session among them) and Tailscale's identity headers.
  delete headers.cookie;
  for (const h of Object.keys(headers)) if (h.startsWith('tailscale-')) delete headers[h];
  const cookies = lib.inboundCookies(req.headers.cookie, mix.key);
  if (cookies) headers.cookie = cookies;
  const up = http.request({ host: '127.0.0.1', port: mix.port, method: req.method, path: req.url, headers }, async (upRes) => {
    if (lib.recordTableRoute(state, req.method, new URL(req.url, cfg.origin).pathname, upRes.statusCode, mix.key)) await save();
    const out = { ...upRes.headers };
    if (out['set-cookie']) out['set-cookie'] = out['set-cookie'].map((c) => lib.outboundCookie(c, mix.key));
    // Every mix shares this origin and its URLs: never let the browser reuse
    // one mix's file for another.
    out['cache-control'] = 'no-store';
    delete out.etag; delete out['last-modified'];
    // The game is a player surface, even in the organizer's browser. Never
    // inject build navigation or PR details into any upstream HTML.
    if (remember) out['set-cookie'] = [...(out['set-cookie'] ?? []), `${MIX_COOKIE}=${mix.key}; Path=/; HttpOnly; SameSite=Lax${cfg.https ? '; Secure' : ''}`];
    res.writeHead(upRes.statusCode, out);
    upRes.pipe(res);
  });
  up.on('error', (e) => {
    log('game connection failed', mix.key, e.message);
    if (!res.headersSent) gameFailure(req, res, 503, 'Connection interrupted. Try again to return to the same game.');
    else res.destroy();
  });
  req.pipe(up);
  res.on('close', () => up.destroy());
}

async function api(req, res, route, url, admin) {
  if (route === 'prs' && req.method === 'GET') {
    const list = await listPrs(url.searchParams.has('refresh'));
    return send(res, 200, { ...list, presets: lib.presets(list.prs), repo: cfg.repo, approved: cfg.approved, admin });
  }
  if (route === 'mixes' && req.method === 'GET') {
    return send(res, 200, { mixes: Object.values(state.mixes).sort((a, b) => b.created - a.created).map(publicMix), building, limits: { maxRunning: cfg.maxRunning, maxKept: cfg.maxKept, idleHours: cfg.idleHours } });
  }
  if (route === 'plan' && req.method === 'POST') return send(res, 200, await planFor(numbersOf(await readJson(req))));
  if (route === 'apply' && req.method === 'POST') {
    const plan = await planFor(numbersOf(await readJson(req)));
    if (!plan.clean) return send(res, 409, { plan });
    log(`${admin} applied`, plan.key, plan.prs.map((p) => `#${p.number}`).join(' ') || 'main only');
    return send(res, 200, { plan, mix: publicMix(enqueue(plan)) });
  }
  const m = route.match(/^mixes\/([0-9a-f]{12})\/(log|stop|delete|open)$/);
  const mix = m && state.mixes[m[1]];
  if (mix && m[2] === 'open' && req.method === 'POST') {
    if (!['built', 'running'].includes(mix.status)) return send(res, 409, { error: 'This playtest is not ready yet.' });
    await ensureRunning(mix);
    mix.lastUsed = Date.now();
    const cookies = [`${MIX_COOKIE}=${mix.key}; Path=/; HttpOnly; SameSite=Lax${cfg.https ? '; Secure' : ''}`];
    const upstream = `http://127.0.0.1:${mix.port}`;
    const existing = lib.inboundCookies(req.headers.cookie, mix.key);
    const account = await fetch(`${upstream}/api/account`, { headers: existing ? { cookie: existing } : {}, signal: AbortSignal.timeout(5000) });
    await account.body?.cancel();
    if (!account.ok && account.status !== 401) return send(res, 502, { error: 'Could not check your game session. Try again shortly.' });
    if (account.status === 401 && cfg.https) {
      const signed = await fetch(`${upstream}/api/auth/preview`, {
        method: 'POST', headers: { 'content-type': 'application/json', origin: cfg.origin, 'x-drawing-board': '1' },
        body: JSON.stringify({ name: 'Host', code: mix.accessCode }), signal: AbortSignal.timeout(5000),
      });
      if (!signed.ok) return send(res, 502, { error: 'Could not open this playtest. Check its sign-in settings in Details.' });
      cookies.push(...signed.headers.getSetCookie().map(c => lib.outboundCookie(c, mix.key)));
      await signed.body?.cancel();
    }
    res.setHeader('set-cookie', cookies);
    return send(res, 200, { url: '/?game=galactic-reach#tables' });
  }
  if (mix && m[2] === 'log' && req.method === 'GET') {
    const text = await readFile(`${cfg.data}/builds/${mix.key}/build.log`, 'utf8').catch(() => 'No build log.');
    return send(res, 200, text.slice(-200_000), 'text/plain; charset=utf-8');
  }
  if (mix && m[2] === 'stop' && req.method === 'POST') { await stop(mix); return send(res, 200, publicMix(mix)); }
  if (mix && m[2] === 'delete' && req.method === 'POST') {
    if (building === mix.key) return send(res, 409, { error: 'the mix is building' });
    const i = queue.indexOf(mix.key); if (i >= 0) queue.splice(i, 1);
    await remove(mix); return send(res, 200, { deleted: mix.key });
  }
  return send(res, 404, { error: 'not found' });
}

// --- Start --------------------------------------------------------------------------
await mkdir(`${cfg.data}/builds`, { recursive: true });
await load();
ui = await readFile(`${here}/ui.html`, 'utf8');
if (cfg.githubTokenFile) token = (await readFile(cfg.githubTokenFile, 'utf8')).trim();
const server = http.createServer((req, res) => handle(req, res).catch((e) => {
  log('request failed', req.url, e.message);
  if (!res.headersSent) send(res, 500, { error: e.message }); else res.destroy();
}));
server.listen(cfg.port, cfg.bind, () => log(`PR mixer on ${cfg.bind}:${cfg.port} as ${cfg.origin} (auth: ${cfg.auth.join(', ')})`));
setInterval(() => gc().catch((e) => log('gc failed', e.message)), 5 * 60_000).unref();
const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
