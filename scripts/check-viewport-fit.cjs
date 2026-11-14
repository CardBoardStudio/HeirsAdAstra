// Galactic Reach screens must fit the viewport at 1280x720 and larger: no scrolling may be
// required to view or play (AGENTS.md). This drives a headless Chrome over the DevTools
// protocol (Node built-ins only) through the key play states and fails when the document
// scrolls, a game panel or card clips its content, a control leaves the viewport, or a
// map tool covers a hex. Reference content (game log, playtest notes, rulebook) may scroll.
//
//   node scripts/check-viewport-fit.cjs              # 1280x720, 1440x900 and 1920x1080
//   CHROME_PATH=/path/to/chrome node scripts/check-viewport-fit.cjs
//   SHOTS=dir node scripts/check-viewport-fit.cjs    # also save a screenshot per state
//   CHECK_ORIGIN=https://preview CHECK_ONLY='operations|buy' node scripts/check-viewport-fit.cjs
//     # run the save-based cases against a deployed origin (cases needing mocked APIs are skipped)
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const GAME_DIR = path.join(ROOT, 'prototypes/galactic-reach');
const LAB_DIR = path.join(ROOT, 'prototypes/lab');
const VIEWPORTS = [[1280, 720], [1440, 900], [1920, 1080]];
const TABLE_ID = 'a'.repeat(32);
const SHOTS = process.env.SHOTS;

function findChrome() {
  const candidates = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'];
  const playwright = path.join(os.homedir(), process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright');
  try {
    for (const dir of fs.readdirSync(playwright).filter(d => d.startsWith('chromium_headless_shell-')).sort().reverse())
      for (const sub of fs.readdirSync(path.join(playwright, dir))) candidates.push(path.join(playwright, dir, sub, 'chrome-headless-shell'));
  } catch { /* no Playwright browsers installed */ }
  return candidates.find(file => file && fs.existsSync(file));
}

// ---- Fixtures: real engine states, built headless exactly like the dialog suite does. ----
const source = fs.readFileSync(path.join(GAME_DIR, 'app.js'), 'utf8');
const adapterSource = fs.readFileSync(path.join(GAME_DIR, 'adapter.js'), 'utf8');
const FORMAT = source.match(/const SAVE_FORMAT_VERSION = (\d+);/)[1];
const SAVE_KEY = `galactic-reach-save-v${FORMAT}`;
const RULES = `galactic-reach/${FORMAT}.${source.match(/const RULES_REVISION = (\d+);/)[1]}`;
// Market cards ranked by how much text they print, so every market state is a worst case.
const MARKET = [...source.matchAll(/^ {4}(\w+): \{ code: '([NM]\d\d)', name: '([^']+)'.*?text: '((?:[^'\\]|\\.)*)'/gm)]
  .map(([, key, code, name, text]) => ({ key, code, weight: text.length + name.length * 2 }))
  .sort((a, b) => b.weight - a.weight);

function seeded(seed) { let v = seed >>> 0; return () => { v = (v * 1664525 + 1013904223) >>> 0; return v / 0x100000000; }; }
function freshEngine(seed = 1729) {
  const context = vm.createContext({});
  vm.runInContext(adapterSource + source, context);
  let engine; const factory = context.createGalacticAdapter;
  context.createGalacticAdapter = e => { engine = e; return factory(e); };
  const adapter = context.createGalacticReach({ headless: true, random: seeded(seed) });
  return { adapter, engine, state: engine.state };
}
const clone = value => JSON.parse(JSON.stringify(value));
let serial = 0;
const card = (key, extra = {}) => ({ key, id: `fit-${serial++}`, ...extra });

function operationsState(handKeys) {
  const { state } = freshEngine();
  Object.assign(state, { phase: 'operations', activePlayer: 0, turnStage: 'action', actionMode: null, actionCardId: null, pendingCombat: null });
  state.players[0].hand = handKeys.map(key => card(key, { starter: key === 'move' || key === 'construct' }));
  state.players[0].resources = { matter: 3, energy: 2, biomass: 4, data: 1 };
  return state;
}
function buyState(marketKeys) {
  const state = operationsState([]);
  const me = state.players[0];
  Object.assign(state, { phase: 'buy', turnStage: 'buy' });
  me.passed = true; me.bought = 0;
  me.resources = { matter: 4, energy: 4, biomass: 2, data: 1 };
  me.hand = [card('move', { starter: true })];
  me.discard = [card('construct', { starter: true }), card('move', { starter: true }), card('construct', { starter: true }), card('colonize')];
  me.inPlay = [card('move', { starter: true }), card('construct', { starter: true })];
  me.buyStartDiscardIds = me.discard.map(c => c.id); me.buyStartInPlayIds = me.inPlay.map(c => c.id);
  state.market = marketKeys.map(key => card(key));
  return state;
}
function combatState(stage) {
  const { adapter, engine, state } = freshEngine();
  state.activePlayer = 0; state.phase = 'operations'; state.turnStage = 'action';
  state.fleets = { '10,-10': { 0: { fleet: 3, explorer: 0, settler: 1 } }, '9,-10': { 1: { fleet: 2, explorer: 1, settler: 0 } } };
  state.players.forEach((p, id) => { p.hand = id === 0 ? [card('move', { starter: true })] : []; p.resources = { matter: 0, energy: 0, biomass: 0, data: 0 }; });
  const move = adapter.legalActions(0).find(x => x.type === 'move' && x.source === '10,-10' && x.destination === '9,-10');
  adapter.applyAction(0, move);
  if (stage === 'tactic') { engine.applyCombatAction(0, { type: 'combat_stay' }); engine.applyCombatAction(1, { type: 'combat_stay' }); }
  return state;
}

// A shared table mid-game: two people, two rivals, two-digit standings and a seat bar.
function sharedView(state) {
  state.round = 13;
  state.players.forEach((p, id) => { p.cardsPurchased = [11, 12, 9, 10][id]; });
  return { id: TABLE_ID, name: 'for all mankind', seat: 0, active: 0, seq: 476, rules_version: RULES, client_path: '/galactic-reach/',
    status: 'active', authority: 'server', ai_error: null, hints: {}, undo: { available: false },
    seats: [{ seat: 0, name: 'Stacked Pilot', you: true, human: true }, { seat: 1, name: 'Pilot 5J3FGA', human: true },
      { seat: 2, name: 'Violet Assembly' }, { seat: 3, name: 'Helios Compact' }], state };
}

const longHand = ['move', 'construct', ...MARKET.filter(c => c.code.startsWith('N')).slice(0, 6).map(c => c.key)];
const chunks = [0, 10, 20, 26].map(start => MARKET.slice(start, start + 10).map(c => c.key));

// Each case: a save to load, then optional page actions before measuring.
const CASES = [
  { name: 'operations, 5-card hand', save: operationsState(['move', 'construct', 'move', 'construct', 'move']) },
  { name: 'operations, 8-card hand', save: operationsState(longHand) },
  { name: 'operations, raised hand card (long text)', save: operationsState(['move', 'construct', 'probe', 'construct', 'move']), focus: '#hand-row .game-card:nth-child(3) button' },
  { name: 'operations, 8-card hand raised', save: operationsState(longHand), focus: '#hand-row .game-card:nth-child(5) button' },
  { name: 'operations, market tab (shaded)', save: operationsState(['move', 'construct']), click: ['#market-tab'] },
  ...chunks.map((keys, i) => ({ name: `buy, market ${i + 1}/4 with upgrades`, save: buyState(keys), click: ['#market-tab'] })),
  { name: 'buy, upgrade chooser', save: buyState(chunks[0]), click: ['#market-tab', '[data-upgrade-offer="move"]'] },
  { name: 'buy, trash dialog', save: buyState(chunks[0]), click: ['#market-tab', '#open-trash'] },
  { name: 'trade tab', save: operationsState(['move']), click: ['#trade-tab'] },
  { name: 'fleet tab', save: operationsState(['move']), click: ['#fleet-tab'] },
  { name: 'relics tab', save: operationsState(['move']), click: ['#relics-tab'] },
  { name: 'battle: escape choice', save: combatState('escape') },
  { name: 'battle: tactic choice', save: combatState('tactic') },
  { name: 'saved table bar', save: operationsState(['move', 'construct', 'move', 'construct', 'move']), table: true },
  { name: 'shared table, hand', shared: sharedView(operationsState(['move', 'construct', 'probe', 'construct', 'move'])) },
  { name: 'shared table, market', shared: sharedView(buyState(chunks[1])), click: ['#market-tab'] },
  { name: 'waiting room', lobby: true },
];

// ---- A tiny static server with just enough API for the table bar and waiting room. ----
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const LAB_API = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/viewport-lab-api.json'), 'utf8'));
let tableSave = null, sharedTable = null, lastSlack = { px: 99 };
function serve(request, response) {
  const url = new URL(request.url, 'http://local');
  const json = (body, status = 200) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(body)); };
  if (url.pathname === `/api/tables/${TABLE_ID}`) return json({ id: TABLE_ID, name: 'Fit check table', owner_id: 'fit', revision: 1, rules_version: RULES, save: tableSave, lobby: null, settings: {}, shared_url: null });
  if (url.pathname.startsWith('/api/tables/') && url.pathname.endsWith('/lobby')) return json(LAB_API.lobby);
  if (url.pathname === `/api/shared/${TABLE_ID}`) return json(sharedTable);
  if (url.pathname === `/api/shared/${TABLE_ID}/stream`) { response.writeHead(200, { 'content-type': 'text/event-stream' }); return response.write(': open\n\n'); }
  if (url.pathname.startsWith('/api/')) return Object.hasOwn(LAB_API, url.pathname) ? json(LAB_API[url.pathname]) : json({ error: 'not in fixture' }, 404);
  const [dir, rel] = url.pathname.startsWith('/galactic-reach/') ? [GAME_DIR, url.pathname.slice('/galactic-reach/'.length) || 'index.html']
    : [LAB_DIR, url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/(lab\/)?/, '')];
  const file = path.join(dir, rel);
  if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404); return response.end(); }
  response.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
}

// ---- Chrome DevTools protocol over Node's WebSocket. ----
async function launch(chrome) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gr-fit-'));
  const proc = spawn(chrome, ['--headless', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  let port;
  for (let i = 0; i < 150 && !port; i++) {
    await new Promise(r => setTimeout(r, 100));
    try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch { /* starting */ }
  }
  if (!port) throw new Error('Chrome did not start');
  const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
  let id = 0; const pending = new Map(); const events = [];
  ws.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); } else events.forEach(listener => listener(message));
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, m => m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const errors = [];
  events.push(m => { if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); });
  await send('Page.enable'); await send('Runtime.enable');
  const navigate = async url => {
    const loaded = new Promise(resolve => { const l = m => { if (m.method === 'Page.loadEventFired') { events.splice(events.indexOf(l), 1); resolve(); } }; events.push(l); });
    await send('Page.navigate', { url }); await loaded;
  };
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  return { send, navigate, evaluate, errors, close: () => { ws.close(); proc.kill(); fs.rmSync(profile, { recursive: true, force: true }); } };
}

// Runs in the page: everything a player needs must be inside the viewport and unclipped.
const MEASURE = `(() => {
  const W = innerWidth, H = innerHeight, problems = [];
  const label = e => (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/).join('.') : e.tagName.toLowerCase()) + (e.textContent.trim() ? ' "' + e.textContent.trim().replace(/\\s+/g, ' ').slice(0, 40) + '"' : '');
  const shown = e => e.checkVisibility({ visibilityProperty: true, opacityProperty: false });
  const doc = document.scrollingElement;
  if (doc.scrollHeight > H + 1 || doc.scrollWidth > W + 1) problems.push('page scrolls: ' + doc.scrollWidth + 'x' + doc.scrollHeight);
  // Containers allowed to scroll their own reference content.
  const scrollers = '#game-log, .playtest-changes, .combat-history, .discard-scroll, .pile-dialog, #rules-dialog, #map-key-dialog, #relic-catalog-dialog, .sector-popover, .chain-details, .board-stage.map-zoomed .board-map-region';
  const modal = document.querySelector('dialog[open]');
  const scope = modal || document;
  // Hand cards are held as card tops that clip on purpose; a raised (pointed-at or focused)
  // card is checked like any other. Each top must still show its name and gain/cost row.
  const folded = e => e.closest('#hand-row .game-card:not(:hover):not(:focus-within)');
  for (const top of document.querySelectorAll('#hand-row .game-card:not(:hover):not(:focus-within)')) {
    if (!shown(top)) continue;
    const t = top.getBoundingClientRect();
    if (t.top < -1 || t.bottom > H + 1) problems.push('card top outside viewport: ' + label(top));
    for (const part of top.querySelectorAll('.card-name, .card-footer, .card-effect')) {
      const p = part.getBoundingClientRect();
      if (p.height < 4 || p.top < t.top - 1 || p.bottom > t.bottom + 1) { problems.push('card top hides ' + label(part) + ' in ' + label(top)); break; }
    }
  }
  for (const e of scope.querySelectorAll('*')) {
    if (!shown(e) || e.closest(scrollers) || folded(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.width <= 1 && r.height <= 1) continue; // empty or visually hidden (sr-only)
    const clips = /(auto|scroll|hidden|clip)/.test(getComputedStyle(e).overflowY + getComputedStyle(e).overflowX);
    if (clips && (e.scrollHeight > e.clientHeight + 2 || e.scrollWidth > e.clientWidth + 2) && !e.matches('.board-map-region, .galaxy-board, .score-name, .card-type, .card-art, [aria-hidden="true"], input, textarea'))
      problems.push('clipped content: ' + label(e) + ' ' + e.scrollWidth + 'x' + e.scrollHeight + ' in ' + e.clientWidth + 'x' + e.clientHeight);
    if (e.matches('button, a[href], select, input, textarea, .game-card, .score-card, .resource-box, .hex, dialog[open], .lobby-seat') && !e.closest('.sr-only, .skip-link, .skip')) {
      if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) problems.push('outside viewport: ' + label(e) + ' [' + [r.left, r.top, r.right, r.bottom].map(Math.round) + ']');
    }
    // Cards may not clip their own text (buttons hide overflow inside their box).
    if (e.matches('.game-card, .military-card, .trade-offer, .score-card, .resource-box, .combat-options .button') && e.scrollHeight > e.clientHeight + 2)
      problems.push('card text cut: ' + label(e) + ' ' + e.scrollHeight + ' > ' + e.clientHeight);
    // Overflow above a box (centred button content) is not counted by scrollHeight.
    if (e.matches('.game-card, .score-card, .resource-box')) for (const child of e.children) {
      const c = child.getBoundingClientRect();
      if (child.textContent.trim() && shown(child) && child.getAttribute('aria-hidden') !== 'true' && c.height < 4) { problems.push('card line squeezed: ' + label(e) + ' (' + label(child) + ')'); break; }
      if (c.height && (c.top < r.top - 1 || c.bottom > r.bottom + 1)) { problems.push('card content escapes: ' + label(e) + ' (' + label(child) + ')'); break; }
    }
  }
  if (!modal && !document.querySelector('#hand-row .game-card:focus-within')) for (const hex of document.querySelectorAll('.hex')) {
    const r = hex.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    if (!hit || !hex.contains(hit) && !hit.closest('.sector-popover')) { problems.push('hex covered at ' + Math.round(x) + ',' + Math.round(y) + ' by ' + (hit ? label(hit) : 'nothing')); break; }
  }
  // Spare height in the tightest card: how far wider fonts can push before text is cut.
  const natural = document.createElement('style');
  natural.textContent = '.game-card > * { flex-grow: 0 !important; margin-bottom: 0 !important; }';
  document.head.append(natural);
  let slack = { px: 99, card: '' };
  for (const card of [...scope.querySelectorAll('.game-card')].filter(card => shown(card) && !folded(card))) {
    const last = [...card.children].filter(shown).at(-1);
    const pad = parseFloat(getComputedStyle(card).paddingBottom) + parseFloat(getComputedStyle(card).borderBottomWidth);
    const px = last ? Math.round(card.getBoundingClientRect().bottom - pad - last.getBoundingClientRect().bottom) : 99;
    if (px < slack.px) slack = { px, card: card.querySelector('.card-name')?.textContent || '' };
  }
  natural.remove();
  return { problems: problems.slice(0, 12), slack };
})()`;

async function runCase(browser, origin, testCase, [width, height]) {
  await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  if (testCase.lobby) {
    await browser.navigate(`${origin}/?game=galactic-reach#lobby/${TABLE_ID}`);
  } else {
    await browser.navigate(`${origin}/galactic-reach/rulebook.html`);
    await browser.evaluate(`localStorage.clear(); ${testCase.table ? '' : `localStorage.setItem(${JSON.stringify(SAVE_KEY)}, ${JSON.stringify(JSON.stringify(testCase.save))});`} true`);
    tableSave = testCase.table ? { state: clone(testCase.save), turnHistory: { pending: null, undo: null } } : null;
    sharedTable = testCase.shared || null;
    await browser.navigate(`${origin}/galactic-reach/${testCase.table ? `?table=${TABLE_ID}` : testCase.shared ? `?shared=${TABLE_ID}` : ''}`);
  }
  await browser.evaluate('new Promise(r => setTimeout(r, 400))');
  for (const selector of testCase.click || []) {
    const ok = await browser.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e || e.disabled) return false; e.click(); return true; })()`);
    if (!ok) { lastSlack = { px: 99 }; return [`could not click ${selector}`]; }
    await browser.evaluate('new Promise(r => setTimeout(r, 150))');
  }
  if (testCase.focus) {
    const ok = await browser.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(testCase.focus)}); if (!e) return false; e.focus(); return document.activeElement === e; })()`);
    if (!ok) return [`could not focus ${testCase.focus}`];
    await browser.evaluate('new Promise(r => setTimeout(r, 250))');
  }
  const { problems, slack } = await browser.evaluate(MEASURE);
  lastSlack = slack;
  if (testCase.lobby && !(await browser.evaluate('!!document.querySelector(".lobby-seats")'))) problems.push('waiting room did not render');
  if (testCase.shared && !(await browser.evaluate('!!document.querySelector("#shared-seats li") && !document.querySelector(".app-shell").inert'))) problems.push('shared table did not open');
  if (!testCase.lobby && testCase.save?.pendingCombat && !(await browser.evaluate('document.querySelector("#combat-dialog").open'))) problems.push('battle dialog did not open');
  if (SHOTS) {
    fs.mkdirSync(SHOTS, { recursive: true });
    const shot = await browser.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, `${width}x${height}-${testCase.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`), Buffer.from(shot.data, 'base64'));
  }
  return problems;
}

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    const message = 'check-viewport-fit: no Chrome found; set CHROME_PATH.';
    if (process.env.CI) { console.error(message); process.exit(1); }
    console.log(`${message} Skipped.`); return;
  }
  const server = http.createServer(serve);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = process.env.CHECK_ORIGIN || `http://127.0.0.1:${server.address().port}`;
  const only = process.env.CHECK_ONLY ? new RegExp(process.env.CHECK_ONLY) : null;
  const browser = await launch(chrome);
  let failures = 0, checks = 0;
  try {
    for (const viewport of VIEWPORTS) for (const testCase of CASES) {
      if (only && !only.test(testCase.name)) continue;
      if (process.env.CHECK_ORIGIN && (testCase.lobby || testCase.table || testCase.shared)) continue;
      checks++;
      browser.errors.length = 0;
      const problems = await runCase(browser, origin, testCase, viewport);
      problems.push(...browser.errors.filter(e => !/seat\.js|zk\/|Failed to fetch dynamically imported module/.test(e)).map(e => `page error: ${e.split('\n')[0]}`));
      if (problems.length) { failures++; console.log(`not ok - ${viewport.join('x')} ${testCase.name}\n  ${problems.join('\n  ')}`); }
      else console.log(`ok - ${viewport.join('x')} ${testCase.name}${lastSlack.px < 99 ? ` (tightest card: ${lastSlack.card}, ${lastSlack.px}px spare)` : ''}`);
    }
  } finally { browser.close(); server.close(); }
  console.log(`${checks - failures}/${checks} viewport-fit checks passed.`);
  if (failures) process.exit(1);
}
main().catch(error => { console.error(error); process.exit(1); });
