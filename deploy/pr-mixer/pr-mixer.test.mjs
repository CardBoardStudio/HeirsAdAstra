// node --test deploy/pr-mixer/
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import net from 'node:net';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import * as lib from './lib.mjs';
import * as G from './git.mjs';

const cfg = lib.config({ HOME: '/home/t', MIXER_AUTH: 'local' });

test('config refuses open access, non-loopback binds and unknown modes', () => {
  assert.throws(() => lib.config({ MIXER_AUTH: 'local', MIXER_ORIGIN: 'https://bitswell.example.ts.net:3300' }), /loopback http/);
  assert.throws(() => lib.config({ MIXER_BIND: '0.0.0.0' }), /loopback/);
  assert.throws(() => lib.config({ MIXER_AUTH: 'tailscale' }), /unknown mode/);
  assert.throws(() => lib.config({ MIXER_AUTH: 'everyone' }), /unknown mode/);
  assert.throws(() => lib.config({ MIXER_ORIGIN: 'https://h.example/' }), /exact origin/);
  const c = lib.config({ MIXER_ORIGIN: 'https://bitswell.example.ts.net:3300' });
  assert.deepEqual(c.auth, ['dev-site']);
  assert.equal(c.https, true);
  assert.equal(c.devSitePublic, 'https://bitswell.example.ts.net:3200/');
});

test('tailnet mode is explicit and requires Serve HTTPS with a loopback backend', () => {
  const env = { MIXER_AUTH: 'tailnet', MIXER_ORIGIN: 'https://mai.example.ts.net:3113' };
  assert.deepEqual(lib.config(env).auth, ['tailnet']);
  assert.throws(() => lib.config({ MIXER_AUTH: 'tailnet' }), /Tailscale Serve HTTPS/);
  for (const origin of ['http://mai.example.ts.net', 'https://public.example', 'https://mai.example.ts.net.evil.example'])
    assert.throws(() => lib.config({ ...env, MIXER_ORIGIN: origin }), /Tailscale Serve HTTPS/);
  assert.throws(() => lib.config({ ...env, MIXER_BIND: '0.0.0.0' }), /loopback/);
  assert.throws(() => lib.config({ ...env, MIXER_AUTH: 'tailnet,local' }), /loopback http/);
});

test('tailnet access needs the Serve user header, never an ordinary account or proxy hint', () => {
  assert.equal(lib.tailnetIdentity({ 'tailscale-user-login': 'player@example.com' }), 'tailnet:player@example.com');
  for (const headers of [{}, { cookie: 'drawing_board_alien_v11_session=ordinary' }, { 'x-forwarded-for': '100.64.0.1' },
    { 'tailscale-user-name': 'Player' }, ...['', ' ', 'one,two', 'line\nbreak', 'x'.repeat(321), ['one','two']].map(login => ({ 'tailscale-user-login': login }))])
    assert.equal(lib.tailnetIdentity(headers), null);
});

test('tailnet HTTP access works without a game account and preserves POST origin checks', async (t) => {
  const root = mkdtempSync(`${tmpdir()}/pr-mixer-http-`);
  const reservation = net.createServer().listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const origin = `https://mixer.example.ts.net:${port}`, base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [fileURLToPath(new URL('./pr-mixer.mjs', import.meta.url))], {
    env: { PATH: process.env.PATH, HOME: root, MIXER_AUTH: 'tailnet', MIXER_MANAGERS: 'tester@example.com', MIXER_ORIGIN: origin, MIXER_PORT: String(port), MIXER_DATA: root },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    rmSync(root, { recursive: true, force: true });
  });
  await once(child.stdout, 'data', { signal: AbortSignal.timeout(5000) });
  const request = async (path, options) => {
    const r = await fetch(base + path, options); await r.text(); return r.status;
  };
  assert.equal(await request('/__mixer/'), 403);
  assert.equal(await request('/__mixer/', { headers: { cookie: 'drawing_board_alien_v11_session=ordinary' } }), 403);
  const guest = { 'tailscale-user-login': 'guest@example.com', cookie: 'drawing_board_tabletop_fake=paired' };
  assert.equal(await request('/__mixer/', { headers: guest }), 403);
  assert.equal(await request('/__mixer/api/mixes', { headers: guest }), 403);
  assert.equal(await request('/__mixer/api/apply', { method: 'POST', headers: {...guest, origin}, body: '{}' }), 403);
  const identity = { 'tailscale-user-login': 'tester@example.com' };
  assert.equal(await request('/__mixer/', { headers: identity }), 200);
  assert.equal(await request('/__mixer/api/mixes', { headers: identity }), 200);
  assert.equal(await request('/__mixer/api/apply', { method: 'POST', headers: { ...identity, origin: 'https://foreign.example' }, body: '{}' }), 403);
  assert.equal(await request('/__mixer/api/unknown', { method: 'POST', headers: { ...identity, origin }, body: '{}' }), 404);
});

test('admins are Nido-wallet administrators of the sign-in server, nothing else', () => {
  const nido = { id: 'nido:C' + 'A'.repeat(55), name: 'Captain', development: false, is_admin: true };
  assert.equal(lib.isAdmin(nido), true);
  assert.equal(lib.isAdmin({ ...nido, is_admin: false }), false);
  assert.equal(lib.isAdmin({ ...nido, development: true }), false, 'temporary identity');
  assert.equal(lib.isAdmin({ ...nido, id: 'acct_123' }), false, 'recovery-key account');
  assert.equal(lib.isAdmin({ ...nido, is_admin: 'true' }), false);
  assert.equal(lib.isAdmin(null), false, 'signed out');
});

test('mix key: same PRs at the same heads reuse one build, in any order', () => {
  const a = { number: 3, sha: 'a'.repeat(40) }, b = { number: 9, sha: 'b'.repeat(40) };
  assert.equal(lib.mixKey('m', [a, b]), lib.mixKey('m', [b, a]));
  assert.match(lib.mixKey('m', [a]), /^[0-9a-f]{12}$/);
  assert.notEqual(lib.mixKey('m', [a]), lib.mixKey('m', [{ ...a, sha: 'c'.repeat(40) }]), 'a new push is a new mix');
  assert.notEqual(lib.mixKey('m', [a]), lib.mixKey('n', [a]), 'a new main is a new mix');
});

test('only repository branches and approved authors are buildable', () => {
  const pr = (author, headRepo) => ({ author, headRepo });
  assert.equal(lib.eligibility(pr('stranger', 'CardBoardStudio/drawing_board'), cfg).ok, true);
  assert.equal(lib.eligibility(pr('MaxHays8', 'maxhays8/drawing_board'), cfg).ok, true);
  const no = lib.eligibility(pr('stranger', 'stranger/drawing_board'), cfg);
  assert.equal(no.ok, false);
  assert.match(no.why, /not an approved author/);
});

test('CI state: any failure fails, anything running is pending', () => {
  const run = (status, conclusion) => ({ status, conclusion });
  assert.equal(lib.ciState([], []), 'none');
  assert.equal(lib.ciState([run('completed', 'success'), run('completed', 'skipped')], []), 'success');
  assert.equal(lib.ciState([run('completed', 'success'), run('in_progress', null)], []), 'pending');
  assert.equal(lib.ciState([run('in_progress', null), run('completed', 'failure')], []), 'failure');
  assert.equal(lib.ciState([run('completed', 'success')], [{ state: 'error' }]), 'failure');
});

test('presets: ready means non-draft and green; ineligible PRs never appear', () => {
  const pr = (number, draft, ci, ok = true) => ({ number, draft, ci, eligible: { ok } });
  const p = lib.presets([pr(1, false, 'success'), pr(2, true, 'success'), pr(3, false, 'failure'), pr(4, false, 'success', false)]);
  assert.deepEqual(p, { main: [], ready: [1], everything: [1, 2, 3] });
});

test('cookies: a mix sees only its own, renamed back; the dev session never passes', () => {
  const key = 'abcdef012345';
  const header = `drawing_board_alien_v11_session=DEV; pr_mixer_mix=${key}; mx${key}_drawing_board_alien_v11_session=MIX; mx000000000000_x=OTHER`;
  assert.equal(lib.inboundCookies(header, key), 'drawing_board_alien_v11_session=MIX');
  assert.equal(lib.inboundCookies('drawing_board_alien_v11_session=DEV', key), null);
  assert.equal(lib.outboundCookie('drawing_board_alien_v11_session=T; HttpOnly; Path=/', key), `mx${key}_drawing_board_alien_v11_session=T; HttpOnly; Path=/`);
  assert.equal(lib.cookieValue(header, 'pr_mixer_mix'), key);
  assert.equal(lib.cookieValue(header, 'missing'), null);
});

test('table routing pins pages, commands, streams and assets independently of browser selection', () => {
  const key = 'abcdef012345', other = '000000000000', table = '1'.repeat(32);
  const state = { mixes: { [key]: { status: 'running' }, [other]: {status:'built'} } };
  for (const [method, path, status] of [
    ['GET', `/api/tabletop/${table}/host-phone`, 200], ['POST', `/api/tabletop/${table}/host-phone`, 403],
    ['POST', `/api/tabletop/${table}/approve`, 200], ['POST', '/api/tabletop/invalid/host-phone', 200],
  ]) assert.equal(lib.recordTableRoute(state, method, path, status, key), false);
  assert.equal(lib.recordTableRoute(state, 'POST', `/api/tabletop/${table}/phone-invite`, 200, key), true);
  const route = (path, method = 'GET', ref) => lib.tabletopRoute(state, method, new URL(path, 'https://test.example'), other, Date.now(), ref);
  for (const path of [`/tabletop/phone.html?table=${table}`, `/tabletop/board.html?table=${table}`, `/tabletop/host.html?table=${table}`,
    `/api/tabletop/${table}/seat`, `/api/tabletop/${table}/client/app.js`, `/api/tabletop/${table}/player-stream`, `/api/tables/${table}/lobby`])
    assert.deepEqual(route(path), {key});
  assert.deepEqual(route(`/api/tabletop/${table}/act`, 'POST'), {key});
  assert.deepEqual(route('/tabletop/pairing.js', 'GET', `https://test.example/tabletop/phone.html?table=${table}`), {key});
  assert.equal(route('/tabletop/pairing.js', 'GET', `https://foreign.example/tabletop/phone.html?table=${table}`), null);
  assert.deepEqual(route(`/tabletop/phone.html?table=${table}&table=${table}`), {missing:true});
  assert.deepEqual(route('/tabletop/phone.html?table=bad'), {missing:true});
  assert.deepEqual(route(`/tabletop/phone.html?table=${'2'.repeat(32)}`), {missing:true});
  // No timeout or size eviction of live table routes. Deleted builds are pruned.
  assert.deepEqual(lib.pruneTableRoutes(state.tableRoutes, state.mixes, Number.MAX_SAFE_INTEGER), state.tableRoutes);
  lib.recordTableRoute(state, 'POST', `/api/tabletop/${table}/phone-invite`, 200, other);
  assert.deepEqual(route(`/tabletop/phone.html?table=${table}`), {ambiguous:true}, 'selection cannot resolve a cloned table');
  delete state.mixes[other];
  assert.deepEqual(Object.keys(lib.pruneTableRoutes(state.tableRoutes, state.mixes)[table]), [key]);
});

test('fresh phone links select their mix through the proxy and survive a mixer restart', async (t) => {
  const root = mkdtempSync(`${tmpdir()}/pr-mixer-pairing-`);
  const key = 'abcdef012345', table = '1'.repeat(32), other = '2'.repeat(32);
  const received = [];
  let status = 200, child, html = false;
  const upstream = http.createServer((req, res) => {
    received.push({ url: req.url, cookie: req.headers.cookie, identity: req.headers['tailscale-user-login'] });
    req.resume();
    if (req.url === '/api/tables') {res.writeHead(200, {'content-type':'application/json'});res.end(JSON.stringify({id:other}));return;}
    if (html) { res.writeHead(status, {'content-type':'text/html'}); res.end('<html><body><h1>Your game</h1></body></html>'); return; }
    res.writeHead(status, { 'content-type': 'application/json', 'set-cookie': 'seat=fixture; Path=/' });
    res.end(JSON.stringify({ url: `/tabletop/phone.html?table=${table}#pair=TEST_SECRET` }));
  }).listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const reservation = net.createServer().listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const origin = `https://mixer.example.ts.net:${port}`, base = `http://127.0.0.1:${port}`;
  // No Docker daemon or GitHub access: the fixture backend is already running.
  writeFileSync(`${root}/docker`, '#!/bin/sh\n[ "$1 $2 $3" = "container inspect -f" ] || exit 1\necho true\n', { mode: 0o700 });
  writeFileSync(`${root}/state.json`, JSON.stringify({ mixes: { [key]: { key, status: 'running', port: upstream.address().port } } }));
  const stop = async () => { if (child?.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; } };
  const start = async () => {
    child = spawn(process.execPath, [fileURLToPath(new URL('./pr-mixer.mjs', import.meta.url))], {
      env: { PATH: `${root}:${process.env.PATH}`, HOME: root, MIXER_AUTH: 'tailnet', MIXER_MANAGERS: 'tester@example.com', MIXER_ORIGIN: origin, MIXER_PORT: String(port), MIXER_DATA: root },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await once(child.stdout, 'data', { signal: AbortSignal.timeout(5000) });
  };
  t.after(async () => { await stop(); await new Promise(resolve => upstream.close(resolve)); rmSync(root, { recursive: true, force: true }); });
  await start();
  const identity = { 'tailscale-user-login': 'tester@example.com' };
  const cookie = `pr_mixer_mix=${key}; mx${key}_seat=RIGHT; mx000000000000_seat=WRONG; dev_session=SECRET`;
  const request = async (path, options = {}) => {
    const r = await fetch(base + path, { redirect: 'manual', ...options, headers: { ...identity, ...options.headers } });
    await r.text(); return r;
  };
  const phone = `/tabletop/phone.html?table=${table}`;
  assert.equal((await request(phone)).status, 404, 'a missing route stays in game recovery');
  const issued = await request(`/api/tabletop/${table}/host-phone`, { method: 'POST', headers: { cookie } });
  assert.equal(issued.status, 200);
  assert.equal(issued.headers.get('set-cookie'), `mx${key}_seat=fixture; Path=/`);
  assert.deepEqual(received.at(-1), { url: `/api/tabletop/${table}/host-phone`, cookie: 'seat=RIGHT', identity: undefined });
  const persisted = readFileSync(`${root}/state.json`, 'utf8');
  assert(!persisted.includes('TEST_SECRET'));
  assert(JSON.parse(persisted).tableRoutes[table][key] > 0);
  status = 403;
  await request(`/api/tabletop/${other}/phone-invite`, { method: 'POST', headers: { cookie } });
  assert.equal((await request(`/tabletop/phone.html?table=${other}`)).status, 404);
  status = 200;
  await stop(); await start();
  for (const headers of [{}, { cookie: 'pr_mixer_mix=000000000000' }]) {
    const r = await request(phone, { headers });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('location'), null, 'guest never leaves the requested game');
    assert(r.headers.getSetCookie().includes(`pr_mixer_mix=${key}; Path=/; HttpOnly; SameSite=Lax; Secure`));
    assert.equal(r.headers.get('cache-control'), 'no-store');
  }
  assert.equal((await request(phone, { headers: { cookie } })).status, 200);
  assert.equal(received.at(-1).url, phone);
  assert.equal((await request(`/api/tabletop/${table}/seat`)).status, 200, 'API uses the table route, upstream still checks credentials');
  assert.equal(received.at(-1).cookie, undefined, 'routing does not manufacture credentials');
  await request('/api/tables', {method:'POST',headers:{cookie},body:'{}'});
  assert.equal((await request(`/tabletop/host.html?table=${other}`)).status,200,'created table is routable before any lobby fetch');
  assert.equal((await request('/tabletop/pairing.js',{headers:{referer:`${origin}/tabletop/host.html?table=${other}`}})).status,200,'first setup script has the table route');
  html = true;
  const page = await fetch(base + phone, {headers:{'tailscale-user-login':'guest@example.com',cookie:'pr_mixer_mix=000000000000'}});
  assert.equal(page.status, 200);
  assert.equal(await page.text(), '<html><body><h1>Your game</h1></body></html>', 'no banner or developer links injected');
  const missing = await fetch(base + '/tabletop/phone.html?table=bad', {headers:identity});
  assert.equal(missing.status,404);
  const recovery = await missing.text(); assert(!recovery.includes('/__mixer')); assert.match(recovery,/fresh invitation/);
  const denied = await fetch(base + phone, { redirect: 'manual' });
  assert.equal(denied.status, 403); await denied.text();
});

test('authorized launch signs in server-side, preserves an existing identity, and excludes guests', async t => {
  const root = mkdtempSync(`${tmpdir()}/pr-mixer-launch-`), key = '123456abcdef';
  let logins = 0;
  const upstream = http.createServer((req,res) => {
    if (req.url === '/api/account') { res.writeHead(req.headers.cookie === 'session=existing' ? 200 : 401, {'content-type':'application/json'}); res.end('{}'); return; }
    assert.equal(req.url, '/api/auth/preview');
    assert.equal(req.headers['x-drawing-board'], '1');
    let body=''; req.on('data', b=>body+=b); req.on('end',()=>{
      assert.deepEqual(JSON.parse(body), {name:'Host',code:'fixture-only-code'}); logins++;
      res.writeHead(200, {'content-type':'application/json','set-cookie':'session=new; HttpOnly; Path=/; Secure'}); res.end('{}');
    });
  }).listen(0,'127.0.0.1');
  await once(upstream,'listening');
  const portServer=net.createServer().listen(0,'127.0.0.1'); await once(portServer,'listening'); const port=portServer.address().port; await new Promise(r=>portServer.close(r));
  const origin=`https://mixer.example.ts.net:${port}`, base=`http://127.0.0.1:${port}`;
  writeFileSync(`${root}/docker`, '#!/bin/sh\necho true\n',{mode:0o700});
  writeFileSync(`${root}/state.json`,JSON.stringify({mixes:{[key]:{key,status:'running',port:upstream.address().port,accessCode:'fixture-only-code'}}}));
  const child=spawn(process.execPath,[fileURLToPath(new URL('./pr-mixer.mjs',import.meta.url))],{env:{PATH:`${root}:${process.env.PATH}`,HOME:root,MIXER_AUTH:'tailnet',MIXER_MANAGERS:'operator@example.com',MIXER_ORIGIN:origin,MIXER_PORT:String(port),MIXER_DATA:root},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(child.exitCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await exited;} await new Promise(r=>upstream.close(r));rmSync(root,{recursive:true,force:true});});
  await once(child.stdout,'data',{signal:AbortSignal.timeout(5000)});
  const launch=async(login,cookie='')=>fetch(`${base}/__mixer/api/mixes/${key}/open`,{method:'POST',headers:{'tailscale-user-login':login,origin,cookie}});
  const guest=await launch('guest@example.com');assert.equal(guest.status,403);await guest.text();assert.equal(logins,0);
  const first=await launch('operator@example.com');assert.equal(first.status,200);assert(first.headers.getSetCookie().some(c=>c.startsWith(`mx${key}_session=new`)));
  assert.deepEqual(await first.json(),{url:'/?game=galactic-reach#tables'});assert.equal(logins,1);
  const again=await launch('operator@example.com',`mx${key}_session=existing`);assert.equal(again.status,200);await again.text();assert.equal(logins,1,'reopening preserves table ownership');
});

test('game recovery contains no developer destinations or raw HTML', () => {
  const html = lib.gameError('Connection <script>lost</script>');
  assert(!html.includes('/__mixer/'));
  assert(!html.includes('<script>'));
  assert.match(html, /Try again/);
});

test('POST origin check', () => {
  const o = 'https://h.example:3300';
  assert.equal(lib.sameOrigin({ origin: o }, o), true);
  assert.equal(lib.sameOrigin({ origin: 'https://h.example:3200' }, o), false);
  assert.equal(lib.sameOrigin({ 'sec-fetch-site': 'same-site' }, o), false);
});

test('planner merges in PR order and names the conflicting pairs', async (t) => {
  const root = mkdtempSync(`${tmpdir()}/pr-mixer-test-`);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const work = `${root}/work`;
  const sh = (...args) => execFileSync('git', ['-C', work, ...args], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim();
  execFileSync('git', ['init', '-q', '-b', 'main', work]);
  const put = (file, text) => writeFileSync(`${work}/${file}`, text);
  put('a.txt', 'one\n'); put('b.txt', 'one\n'); put('c.txt', 'one\n');
  sh('add', '.'); sh('commit', '-qm', 'base');
  const branch = (name, file, text) => {
    sh('checkout', '-q', '-b', name, 'main'); put(file, text); sh('commit', '-qam', name);
    const sha = sh('rev-parse', 'HEAD'); sh('checkout', '-q', 'main'); return sha;
  };
  const pr10 = branch('p10', 'a.txt', 'ten\n');
  const pr11 = branch('p11', 'b.txt', 'eleven\n');
  const pr12 = branch('p12', 'a.txt', 'twelve\n'); // clashes with #10
  const pr13 = branch('p13', 'c.txt', 'thirteen\n'); // clashes with main below
  put('c.txt', 'main moved\n'); sh('commit', '-qam', 'main moves');
  const main = sh('rev-parse', 'HEAD');

  const dir = `${root}/work/.git`;
  const clean = await G.plan(dir, main, [{ number: 11, sha: pr11 }, { number: 10, sha: pr10 }]);
  assert.equal(clean.clean, true);
  assert.deepEqual(clean.results.map((r) => r.number), [10, 11], 'merged in PR-number order');
  const tree = execFileSync('git', ['--git-dir', dir, 'show', `${clean.mergeSha}:a.txt`], { encoding: 'utf8' });
  assert.equal(tree, 'ten\n');
  const again = await G.plan(dir, main, [{ number: 10, sha: pr10 }, { number: 11, sha: pr11 }]);
  assert.equal(again.mergeSha, clean.mergeSha, 'the merged source is reproducible');

  const mainOnly = await G.plan(dir, main, []);
  assert.deepEqual([mainOnly.clean, mainOnly.mergeSha], [true, main]);

  const bad = await G.plan(dir, main, [{ number: 10, sha: pr10 }, { number: 11, sha: pr11 }, { number: 12, sha: pr12 }, { number: 13, sha: pr13 }]);
  assert.equal(bad.clean, false);
  assert.equal(bad.mergeSha, null);
  const by = Object.fromEntries(bad.results.map((r) => [r.number, r]));
  assert.equal(by[10].status, 'merged');
  assert.deepEqual([by[12].status, by[12].conflictsWith, by[12].withMain, by[12].files], ['conflict', [10], false, ['a.txt']]);
  assert.deepEqual([by[13].status, by[13].withMain, by[13].conflictsWith], ['conflict', true, []]);
});
