// Pure helpers for the PR mixer (docs/pr-mixer.md). No I/O here, so
// pr-mixer.test.mjs can cover every rule without git, Docker or GitHub.
import { createHash } from 'node:crypto';

/** Settings from the environment, with the defaults docs/pr-mixer.md lists. */
export function config(env) {
  const list = (v, d) => (v ?? d).split(',').map((s) => s.trim()).filter(Boolean);
  const int = (name, d) => {
    const n = Number(env[name] ?? d);
    if (!Number.isInteger(n) || n < 0) throw new Error(`${name} must be a whole number`);
    return n;
  };
  const port = int('MIXER_PORT', 3300);
  const origin = env.MIXER_ORIGIN ?? `http://127.0.0.1:${port}`;
  const url = new URL(origin);
  if (url.origin !== origin) throw new Error('MIXER_ORIGIN must be an exact origin with no path or trailing slash');
  const auth = list(env.MIXER_AUTH, 'dev-site');
  for (const a of auth) if (!['dev-site', 'local', 'tailnet'].includes(a)) throw new Error(`MIXER_AUTH: unknown mode ${a}`);
  const local = url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  // `local` admits anyone who can reach the port. Only a laptop origin may use it:
  // behind `tailscale serve` the origin is https and every tailnet member could build.
  if (auth.includes('local') && !local) throw new Error('MIXER_AUTH=local needs a loopback http MIXER_ORIGIN');
  if (auth.includes('tailnet') && (url.protocol !== 'https:' || !url.hostname.endsWith('.ts.net')))
    throw new Error('MIXER_AUTH=tailnet needs a Tailscale Serve HTTPS origin (*.ts.net)');
  const bind = env.MIXER_BIND ?? '127.0.0.1';
  // Loopback only: `tailscale serve` is the way in. Bound wider, mix
  // containers and the LAN could reach the mixer directly.
  if (!['127.0.0.1', '::1'].includes(bind)) throw new Error('MIXER_BIND must be a loopback address');
  const [lo, hi] = (env.MIXER_PORT_RANGE ?? '3400-3449').split('-').map(Number);
  if (!(lo > 0 && hi >= lo)) throw new Error('MIXER_PORT_RANGE must look like 3400-3449');
  return {
    port,
    bind,
    origin,
    https: url.protocol === 'https:',
    auth,
    devSite: (env.DEV_SITE_URL ?? 'http://127.0.0.1:3200').replace(/\/$/, ''),
    devSitePublic: env.DEV_SITE_PUBLIC_URL ?? `${url.protocol}//${url.hostname}:3200/`,
    devCookie: env.DEV_SESSION_COOKIE ?? 'drawing_board_alien_v11_session',
    repo: env.MIXER_REPO ?? 'CardBoardStudio/drawing_board',
    approved: list(env.MIXER_APPROVED_AUTHORS, 'bitswell,maxhays8,willemneal').map((s) => s.toLowerCase()),
    data: env.MIXER_DATA ?? `${env.HOME}/.local/share/pr-mixer`,
    githubTokenFile: env.GITHUB_TOKEN_FILE || null,
    builder: env.MIXER_BUILDER ?? 'pr-mixer',
    maxRunning: int('MIXER_MAX_RUNNING', 3),
    maxKept: int('MIXER_MAX_KEPT', 8),
    idleHours: int('MIXER_IDLE_HOURS', 6),
    buildMinutes: int('MIXER_BUILD_MINUTES', 60),
    ports: [lo, hi],
    buildCache: env.MIXER_BUILD_CACHE ?? '30gb',
    memory: env.MIXER_MEMORY ?? '1g',
    cpus: env.MIXER_CPUS ?? '2',
    nidoWalletHost: env.NIDO_WALLET_HOST ?? 'test.nido.fyi',
  };
}

/**
 * The cache key of a mix: main plus every selected PR at an exact head. The
 * same PRs at the same heads on the same main always reuse one build; any new
 * push or main merge makes a new key.
 */
export function mixKey(mainSha, prs) {
  const lines = [`main ${mainSha}`, ...[...prs].sort((a, b) => a.number - b.number).map((p) => `pr ${p.number} ${p.sha}`)];
  return createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 12);
}

/**
 * Whether a PR's code may be built. Builds run PR code, so only branches in the
 * repository itself (their authors have write access) or approved authors.
 */
export function eligibility(pr, cfg) {
  if (pr.headRepo === cfg.repo) return { ok: true, why: 'branch in this repository' };
  if (cfg.approved.includes(pr.author.toLowerCase())) return { ok: true, why: `approved author ${pr.author}` };
  return { ok: false, why: `fork by ${pr.author}, who is not an approved author` };
}

/** One CI state from GitHub check runs and commit statuses. */
export function ciState(checkRuns, statuses) {
  const bad = new Set(['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure', 'stale']);
  const states = [
    ...checkRuns.map((c) => (c.status !== 'completed' ? 'pending' : bad.has(c.conclusion) ? 'failure' : 'success')),
    ...statuses.map((s) => (s.state === 'pending' ? 'pending' : s.state === 'success' ? 'success' : 'failure')),
  ];
  if (!states.length) return 'none';
  if (states.includes('failure')) return 'failure';
  if (states.includes('pending')) return 'pending';
  return 'success';
}

/** PR numbers each one-click preset turns on. Ineligible PRs never appear. */
export function presets(prs) {
  const ok = prs.filter((p) => p.eligible.ok);
  return {
    main: [],
    ready: ok.filter((p) => !p.draft && p.ci === 'success').map((p) => p.number),
    everything: ok.map((p) => p.number),
  };
}

/** The stable merge order: ascending PR number, so older PRs land first. */
export const mergeOrder = (prs) => [...prs].sort((a, b) => a.number - b.number);

// --- Proxy cookie isolation -------------------------------------------------
// Every mix is served on the mixer's own origin, which shares a hostname (and
// so a cookie jar) with the dev site. The proxy renames a mix's cookies to
// `mx<key>_<name>` on the way out and back on the way in, and forwards no other
// cookie, so PR code never sees the dev site's session and mixes never
// overwrite it or each other.

export const cookiePrefix = (key) => `mx${key}_`;

/** Tailscale Serve replaces this header with the connected user's identity.
 * Trust only behind Serve with a loopback backend; never a general HTTP proxy.
 * Funnel and tagged devices supply no user identity and are refused.
 */
export function tailnetIdentity(headers) {
  const login = headers['tailscale-user-login'];
  return typeof login === 'string' && login.length <= 320 && /^[^\s,]+$/.test(login)
    ? `tailnet:${login}` : null;
}

/** The Cookie header to forward to mix `key`, or null when none apply. */
export function inboundCookies(header, key) {
  if (!header) return null;
  const prefix = cookiePrefix(key);
  const kept = header
    .split(';')
    .map((c) => c.trim())
    .filter((c) => c.startsWith(prefix))
    .map((c) => c.slice(prefix.length));
  return kept.length ? kept.join('; ') : null;
}

/** A mix's Set-Cookie value, renamed into its namespace. */
export function outboundCookie(setCookie, key) {
  return cookiePrefix(key) + setCookie.trimStart();
}

/**
 * Whether a sign-in server's `GET /api/account` reply is a mixer administrator:
 * an administrator signed in with a Nido wallet. Never a temporary identity,
 * nor a recovery-key account, even one an open host made an administrator.
 */
export function isAdmin(account) {
  return account?.is_admin === true && account.development === false
    && typeof account.id === 'string' && account.id.startsWith('nido:');
}

/** Value of cookie `name` in a Cookie header. */
export function cookieValue(header, name) {
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

// A new phone has no mix-selection cookie. Remember which mix issued its
// table's pairing links, without reading or storing the secret link itself.
const TABLE_ROUTE_LIFETIME = 30 * 24 * 60 * 60_000;
export function pruneTableRoutes(routes, mixes, now = Date.now()) {
  return Object.fromEntries(Object.entries(routes ?? {}).map(([table, keys]) => [table,
    Object.fromEntries(Object.entries(keys).filter(([key, until]) => mixes[key] && until > now)),
  ]).filter(([, keys]) => Object.keys(keys).length)
    .sort((a, b) => Math.max(...Object.values(b[1])) - Math.max(...Object.values(a[1])))
    .slice(0, 4096));
}

/** Only successful host-authorized link issuance establishes table ownership. */
export function recordTableRoute(state, method, path, status, key, now = Date.now()) {
  const match = path.match(/^\/api\/tabletop\/([0-9a-f]{32})\/(?:host-phone|phone-invite|board-grant|repair)$/);
  if (method !== 'POST' || status < 200 || status >= 300 || !match || !state.mixes[key]) return false;
  const routes = state.tableRoutes ?? {};
  routes[match[1]] = { ...routes[match[1]], [key]: now + TABLE_ROUTE_LIFETIME };
  state.tableRoutes = pruneTableRoutes(routes, state.mixes, now);
  return true;
}

/** Route only bootstrap pages. Credentials and all API access stay mix-scoped. */
export function tabletopRoute(state, method, url, selected, now = Date.now()) {
  if (method !== 'GET' || !/^\/tabletop\/(?:phone|board)\.html$/.test(url.pathname)) return null;
  const tables = url.searchParams.getAll('table');
  if (tables.length !== 1 || !/^[0-9a-f]{32}$/.test(tables[0])) return null;
  const keys = Object.entries(state.tableRoutes?.[tables[0]] ?? {})
    .filter(([key, until]) => until > now && ['built', 'running'].includes(state.mixes[key]?.status))
    .map(([key]) => key);
  if (!keys.length) return null;
  if (keys.includes(selected)) return { key: selected };
  return keys.length === 1 ? { key: keys[0] } : { ambiguous: true };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export { esc as escapeHtml };

/** The fixed banner every proxied HTML page of a mix carries. */
export function banner(mix) {
  const prs = mix.prs.length
    ? mix.prs.map((p) => `<a href="https://github.com/${esc(mix.repo)}/pull/${p.number}" target="_blank" rel="noopener" style="color:#ffe9a8">#${p.number}</a> ${esc(p.title)}`).join(' · ')
    : 'main only';
  return `<div id="pr-mixer-banner" style="position:fixed;left:0;right:0;bottom:0;z-index:2147483647;display:flex;gap:10px;align-items:center;padding:3px 10px;font:12px/1.4 system-ui,sans-serif;background:rgba(60,20,90,.92);color:#fff;pointer-events:auto">`
    + `<b>PR mix ${esc(mix.key)}</b><span style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis" title="${esc(mix.prs.map((p) => `#${p.number} ${p.title}`).join('\n') || 'main only')}">main ${esc(mix.mainSha.slice(0, 7))} + ${prs}</span>`
    + `<a href="/__mixer/" style="color:#ffe9a8">Mixer</a>`
    + `<button type="button" onclick="this.parentNode.remove()" style="background:none;border:0;color:#fff;cursor:pointer" aria-label="Hide the PR mix banner">×</button></div>`;
}

/** HTML with the banner placed before </body>, or appended. */
export function injectBanner(html, mix) {
  const b = banner(mix);
  const i = html.lastIndexOf('</body>');
  return i < 0 ? html + b : html.slice(0, i) + b + html.slice(i);
}

/** Origin check for the mixer's own POST API (plain CSRF defence). */
export function sameOrigin(headers, origin) {
  if (headers.origin) return headers.origin === origin;
  const site = headers['sec-fetch-site'];
  return site === 'same-origin' || site === 'none';
}
