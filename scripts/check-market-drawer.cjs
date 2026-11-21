// The market drawer (rulebook #shared-board), in Chrome against the real page: the supply is
// closed by default and the map takes its room; the Market handle opens it as the side panel and
// closes it, and the choice stays; your Buy turn brings the whole-card view and its end restores
// what you had; choosing a relic for Excavate opens the relics while it lasts; a guidance note
// never rides along with the moving panel; phones move the Supply drawer the same way; Max's
// table keeps its card banks.
//   node scripts/check-market-drawer.cjs
//   CHECK_SIZES=1440x900,390x844 node scripts/check-market-drawer.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { findChrome, launch, operationsState, buyState } = require('./check-viewport-fit.cjs');
const ROOT = path.resolve(__dirname, '../prototypes');
const APP = fs.readFileSync(path.join(ROOT, 'galactic-reach/app.js'), 'utf8');
const KEY = `galactic-reach-save-v${APP.match(/const SAVE_FORMAT_VERSION = (\d+)/)[1]}`;
const SIZES = process.env.CHECK_SIZES ? process.env.CHECK_SIZES.split(',').map(v => v.split('x').map(Number)) : [[1280, 720], [1440, 900], [1920, 1080], [1024, 768], [820, 1180], [390, 844], [844, 390]];
const isPhone = ([w, h]) => Math.min(w, h) < 600;
const source = value => JSON.stringify(value);
const MARKET = ['worldEngine', 'ascendancyCodex', 'aegisLattice', 'deflectorGrid', 'torpedoSpread', 'railBattery', 'colonyPods', 'prefabYards', 'signalRelay'];

async function main() {
  const chrome = findChrome(); assert(chrome, 'Chrome is required; set CHROME_PATH.');
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(ROOT, '.' + decodeURIComponent(pathname), pathname.endsWith('/') ? 'index.html' : '');
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.webp': 'image/webp' }[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`, browser = await launch(chrome);
  const evaluate = expression => browser.evaluate(expression);
  const wait = ms => evaluate(`new Promise(r => setTimeout(r, ${ms}))`);
  // Settled: the panel has stopped moving and the map has re-fitted.
  const settled = () => evaluate(`new Promise(done => {
    let last = '', calm = 0, frames = 0;
    const tick = () => {
      const r = document.querySelector('#galaxy-board').getBoundingClientRect(), now = [r.x, r.y, r.width].map(Math.round).join();
      calm = now === last && !document.documentElement.classList.contains('market-moving') ? calm + 1 : 0; last = now;
      if (calm >= 8 || ++frames >= 240) done(); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })`);
  let touch = false;
  async function load(state, { stars = false, guide = false, view = null, reduce = false } = {}) {
    await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduce ? 'reduce' : 'no-preference' }] });
    await browser.navigate(origin + '/galactic-reach/rulebook.html');
    await evaluate(`localStorage.clear(); localStorage.setItem('galactic-reach-guide-v1', ${source(JSON.stringify(guide ? { enabled: true, seen: { welcome: true, 'hand-lifetime': true } } : { enabled: false }))}); localStorage.setItem(${source(KEY)}, ${source(JSON.stringify(state))}); localStorage.setItem('galactic-reach-background', ${source(stars ? 'stars' : 'green')}); ${view ? `localStorage.setItem('galactic-reach-market-view', ${source(view)});` : ''} true`);
    browser.errors.length = 0;
    await browser.navigate(origin + '/galactic-reach/');
    await evaluate('document.fonts.ready');
    await settled(); await wait(150);
  }
  async function click(selector) {
    const point = await evaluate(`(() => { const e = document.querySelector(${source(selector)}); if (!e?.checkVisibility() || e.disabled) return null; const r = e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`);
    assert(point, 'visible, enabled control: ' + selector);
    if (touch) {
      await browser.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, radiusX: 2, radiusY: 2, force: 1, id: 1 }] });
      await browser.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
      await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
    }
    await wait(30); await settled();
  }
  async function key(name) {
    const code = { Escape: 27, Enter: 13 }[name];
    await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: name, windowsVirtualKeyCode: code, ...(name === 'Enter' ? { text: '\r' } : {}) });
    await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: code });
    await wait(30); await settled();
  }
  const view = () => evaluate(`(() => { const c = document.documentElement.classList; return c.contains('market-drawer') ? ['closed','side','full'].find(v => c.contains('market-' + v)) : 'none'; })()`);
  const shown = selector => evaluate(`!!document.querySelector(${source(selector)})?.checkVisibility()`);
  const mapWidth = () => evaluate(`Math.round(document.querySelector('#galaxy-board').getBoundingClientRect().width)`);
  const drawer = () => evaluate('document.body.dataset.drawer');
  const clean = () => assert.deepEqual(browser.errors.filter(e => !/seat\.js|zk\/|channel\.js/.test(e)), []);
  const fitsWindow = async () => {
    const problems = await evaluate(`(() => {
      const out = [];
      if (document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1) out.push('page scrolls');
      for (const e of document.querySelectorAll('.market-handles button, #market-row .game-card, #upgrade-market .game-card')) {
        if (!e.checkVisibility()) continue;
        const r = e.getBoundingClientRect();
        if (r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1) out.push('outside the window: ' + (e.id || e.textContent.trim().slice(0, 30)));
      }
      return out.concat(window.galacticReachRenderErrors || []);
    })()`);
    assert.deepEqual(problems, []);
  };

  const ops = () => operationsState(['move', 'construct', 'move', 'construct', 'move']);
  const buy = () => buyState(MARKET, { matter: 8, energy: 8, biomass: 8, data: 8 });
  const excavating = () => { const s = operationsState(['move', 'construct']); s.actionMode = 'excavate'; return s; };
  try {
    for (const size of SIZES) {
      const [width, height] = size, phone = isPhone(size);
      touch = phone || width < 1100;
      await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: touch });
      await browser.send('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: touch ? 5 : 1 });
      const label = `${width}x${height}`;
      if (phone) {
        // Phones: the Supply drawer is closed by default, comes forward for the Buy turn and goes
        // back to the drawer you had when it ends; Excavate opens it on the relics.
        await load(ops());
        assert.equal(await view(), 'none', `${label}: phones use the drawers, not the handle`);
        assert.equal(await shown('#market-handle'), false, `${label}: no table handle on a phone`);
        assert.equal(await drawer(), 'hand', `${label}: Operations opens the hand`);
        assert.equal(await shown('#market-row > .game-card'), false, `${label}: the market starts closed`);
        await click('.phone-drawers [data-drawer="supply"]');
        assert.equal(await shown('#market-row > .game-card'), true, `${label}: the Supply drawer opens on demand`);
        await click('.phone-drawers [data-drawer="supply"]');
        assert.equal(await shown('#market-row > .game-card'), false, `${label}: and closes again`);
        await click('.phone-drawers [data-drawer="hand"]');
        await click('#board-primary');
        assert.equal(await drawer(), 'supply', `${label}: the Buy turn brings the Supply drawer forward`);
        assert.equal(await shown('#market-row > .game-card'), true, `${label}: on the market`);
        await click('#board-primary');
        assert.equal(await drawer(), 'hand', `${label}: Finish Buy returns the drawer you had`);
        await load(excavating());
        assert.equal(await drawer(), 'supply', `${label}: Excavate opens the Supply drawer`);
        assert.equal(await shown('#relic-row .game-card'), true, `${label}: on the relics`);
        await click('#cancel-excavate');
        assert.equal(await drawer(), 'hand', `${label}: cancelling returns the drawer you had`);
        clean();
        console.log(`ok - ${label} phone Supply drawer: closed, on demand, Buy turn, Excavate`);
        continue;
      }
      if (height > width) {
        // An upright table: the supply band under the map, closed by default, opened by the handle,
        // by the Buy turn (there is no whole-card view) and by Excavate.
        await load(ops());
        assert.equal(await view(), 'closed', `${label}: the band starts closed`);
        assert.equal(await shown('#market-row > .game-card'), false, `${label}: no market cards on the table`);
        const closedMap = await mapWidth();
        await click('#market-handle');
        assert.equal(await view(), 'side', `${label}: the handle opens the band`);
        assert.equal(await shown('#market-row > .game-card'), true, `${label}: with the market`);
        assert.equal(await shown('#market-size'), false, `${label}: no size button upright`);
        assert((await mapWidth()) <= closedMap, `${label}: the map makes room for the band`);
        await fitsWindow();
        await click('#market-handle');
        await click('#board-primary');
        assert.equal(await view(), 'side', `${label}: the Buy turn opens the band`);
        await fitsWindow();
        await click('#board-primary');
        assert.equal(await view(), 'closed', `${label}: Finish Buy closes it again`);
        await load(excavating());
        assert.equal(await view(), 'side', `${label}: Excavate opens the band`);
        assert.equal(await shown('#relic-row .game-card'), true, `${label}: with the relics`);
        clean();
        console.log(`ok - ${label} upright market band: closed, handle, Buy turn, Excavate`);
        continue;
      }
      // Closed by default: no supply on the table and a larger map; the handle is a real button.
      await load(ops());
      assert.equal(await view(), 'closed', `${label}: the market starts closed`);
      for (const part of ['#market-row', '#relic-row', '#upgrade-market']) assert.equal(await shown(part), false, `${label}: ${part} is off the table`);
      assert.equal(await shown('#market-handle'), true, `${label}: the Market handle shows`);
      const handle = await evaluate(`(() => { const b = document.querySelector('#market-handle'), r = b.getBoundingClientRect(); return { tag: b.tagName, expanded: b.getAttribute('aria-expanded'), name: b.getAttribute('aria-label'), w: r.width, h: r.height }; })()`);
      assert.equal(handle.tag, 'BUTTON'); assert.equal(handle.expanded, 'false'); assert.match(handle.name, /market/i);
      assert(handle.h >= 44, `${label}: the handle is at least a finger tall`);
      assert.equal(await shown('#market-size'), false, `${label}: no size button while closed`);
      await fitsWindow();
      const closedMap = await mapWidth();
      // Open as the side panel: the map re-fits once, smaller; the choice survives a reload.
      await click('#market-handle');
      assert.equal(await view(), 'side', `${label}: the handle opens the side panel`);
      assert.equal(await evaluate(`document.querySelector('#market-handle').getAttribute('aria-expanded')`), 'true');
      for (const part of ['#market-row', '#relic-row', '#upgrade-market', '#market-size']) assert.equal(await shown(part), true, `${label}: ${part} shows in the side panel`);
      { const sideMap = await mapWidth(); assert(sideMap <= closedMap, `${label}: the map makes room for the side panel (${sideMap} > ${closedMap})`); }
      await fitsWindow();
      await load(ops(), { view: 'side' });
      assert.equal(await view(), 'side', `${label}: the side panel stays open across a reload`);
      await click('#market-handle');
      assert.equal(await view(), 'closed', `${label}: the handle closes it`);
      assert(Math.abs(await mapWidth() - closedMap) <= 2, `${label}: and the map takes the room back`);
      // Keyboard: Enter on the handle opens it, Escape inside it closes it and returns focus.
      await evaluate(`document.querySelector('#market-handle').focus()`);
      await key('Enter');
      assert.equal(await view(), 'side', `${label}: Enter on the handle opens the market`);
      await evaluate(`document.querySelector('#market-size').focus()`);
      await key('Escape');
      assert.equal(await view(), 'closed', `${label}: Escape on the market's controls closes it`);
      assert.equal(await evaluate('document.activeElement?.id'), 'market-handle', `${label}: focus returns to the handle`);
      clean();

      // Your Buy turn: whole cards (63:88, picture shown), then back to how you left it.
      for (const before of ['closed', 'side']) {
        await load(ops(), { view: before });
        const opsMap = await mapWidth();
        await click('#board-primary');
        assert.equal(await view(), 'full', `${label}: the Buy turn shows whole cards (from ${before})`);
        assert(Math.abs(await mapWidth() - opsMap) <= 2, `${label}: the map stays put under the whole cards`);
        await fitsWindow();
        const cards = await evaluate(`[...document.querySelectorAll('#market-row > .game-card')].map(c => { const r = c.getBoundingClientRect(), art = c.querySelector('.card-art.has-picture'); return { ratio: r.height / r.width, art: art ? art.getBoundingClientRect().height : 0 }; })`);
        assert.equal(cards.length, 9, `${label}: nine market cards`);
        for (const c of cards) assert(Math.abs(c.ratio - 88 / 63) < 0.06, `${label}: a whole card is card-shaped (${c.ratio.toFixed(2)})`);
        assert(cards.filter(c => c.art > 30).length >= 6, `${label}: the cards show their pictures`);
        assert.equal(await shown('#upgrade-market .trash-pile'), true, `${label}: Upgrades and the Trash pile are in reach`);
        await click('#board-primary');
        assert.equal(await view(), before, `${label}: Finish Buy returns the market to ${before}`);
        assert(Math.abs(await mapWidth() - opsMap) <= 2, `${label}: and the map to its place`);
      }
      // During the Buy turn the player may close, reopen and shrink it; the next Buy turn starts whole again.
      await load(buy());
      assert.equal(await view(), 'full', `${label}: a saved Buy turn opens whole`);
      await click('#market-handle');
      assert.equal(await view(), 'closed', `${label}: the handle closes it during the Buy turn`);
      await click('#market-handle');
      assert.equal(await view(), 'full', `${label}: and reopens it whole`);
      await click('#market-size');
      assert.equal(await view(), 'side', `${label}: Smaller shows the side panel`);
      await click('#market-size');
      assert.equal(await view(), 'full', `${label}: Larger shows whole cards again`);
      assert.equal(await evaluate(`localStorage.getItem('galactic-reach-market-view')`), null, `${label}: choices during the Buy turn are not kept after it`);
      clean();

      // A guidance note keeps its place while the panel moves and is placed once it settles.
      await load(buy(), { guide: true });
      const trail = await evaluate(`new Promise(done => {
        const note = () => document.querySelector('#gr-coach');
        const at = () => { const n = note(); if (!n || n.hidden || getComputedStyle(n).visibility === 'hidden') return 'hidden'; const r = n.getBoundingClientRect(); return Math.round(r.left) + ',' + Math.round(r.top); };
        const out = [], start = performance.now();
        document.querySelector('#market-size').click();
        const tick = () => { out.push([document.documentElement.classList.contains('market-moving'), at()]); performance.now() - start < 700 ? requestAnimationFrame(tick) : done(out); };
        tick();
      })`);
      const moving = new Set(trail.filter(([m]) => m).map(([, at]) => at)), after = new Set(trail.filter(([m]) => !m).map(([, at]) => at));
      assert(moving.size <= 1, `${label}: the note does not move with the panel (${[...moving]})`);
      assert(after.size <= 1, `${label}: the note is placed once after the panel settles (${[...after]})`);
      clean();

      // Excavate opens the relics (in the side panel) while you choose, then restores the table.
      await load(excavating());
      assert.equal(await view(), 'side', `${label}: Excavate opens the side panel`);
      assert.equal(await shown('#relic-row'), true, `${label}: with the relics`);
      await click('#cancel-excavate');
      assert.equal(await view(), 'closed', `${label}: cancelling closes it again`);
      // Reduced motion: the same states with no slide.
      await load(ops(), { reduce: true });
      const classes = await evaluate(`new Promise(done => { const seen = new Set(); const o = new MutationObserver(() => document.documentElement.classList.forEach(c => seen.add(c))); o.observe(document.documentElement, { attributes: true }); document.querySelector('#market-handle').click(); setTimeout(() => { o.disconnect(); done([...seen]); }, 300); })`);
      assert(!classes.includes('market-in') && !classes.includes('market-out'), `${label}: no slide under reduced motion`);
      assert.equal(await view(), 'side');
      // Max's table keeps its card banks and has no drawer.
      await load(ops(), { stars: true });
      assert.equal(await view(), 'none', `${label}: Max's table has no market drawer`);
      assert.equal(await shown('#market-handle'), false);
      clean();
      console.log(`ok - ${label} market drawer: closed, side panel, Buy turn whole cards and restore, notes, Excavate, keyboard, reduced motion`);
    }
  } finally { browser.close(); server.close(); }
}
main().catch(error => { console.error(error); process.exit(1); });
