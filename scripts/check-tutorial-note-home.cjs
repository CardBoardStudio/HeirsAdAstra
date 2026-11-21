// Learn to play's note has one home (prototypes/galactic-reach/guide.js noteHome): on a desktop or
// tablet table it lies over the map key in the left column, its top fixed, and stays there for
// every step and within every step. Pointing at a hand card does not move it. A reading step labels
// all of its parts at once and keeps its text and its Next button still: nothing changes on a
// timer, with reduced motion on or off, and rivals' turns show in the table's status line, not in
// the note. Drives headless Chrome (check-viewport-fit.cjs) with real pointer input, Next and Skip
// lesson, sampling the note every 100 ms.
//   node scripts/check-tutorial-note-home.cjs
//   CHECK_ONLY='1280x720' node scripts/check-tutorial-note-home.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { findChrome, launch } = require('./check-viewport-fit.cjs');

const dir = path.resolve(__dirname, '../prototypes/galactic-reach');
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname.endsWith('/channel.js')) { res.setHeader('content-type', 'text/javascript'); res.end('globalThis.galacticReachChannel=null;'); return; }
  if (u.pathname.endsWith('/zk/seat.js')) { res.setHeader('content-type', 'text/javascript'); res.end('export {};'); return; }
  const relative = u.pathname.replace(/^\/galactic-reach\/?/, '') || 'index.html';
  const file = path.resolve(dir, relative);
  if (!file.startsWith(dir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

// Desktop and tablet sizes; one with reduced motion.
const CASES = [
  { size: [1440, 900] }, { size: [1280, 720] }, { size: [1024, 768] }, { size: [1440, 900], reduced: true },
].filter(c => !process.env.CHECK_ONLY || new RegExp(process.env.CHECK_ONLY).test(`${c.size.join('x')}${c.reduced ? ' reduced' : ''}`));

// One look at the note, its Next button, the map key and the stage's labels.
const LOOK_FN = `() => {
  const box = e => { if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) }; };
  const note = document.querySelector('#gr-coach');
  const visible = Boolean(note && !note.hidden && note.getClientRects().length && getComputedStyle(note).visibility !== 'hidden');
  const progress = galacticReachTutorial.progress();
  return { step: galacticReachTutorial.steps[progress.step]?.id || 'finished', visible, inDialog: Boolean(note?.classList.contains('in-dialog')), note: visible ? box(note) : null, key: box(document.querySelector('#map-legend-corner')),
    next: visible ? box(note.querySelector('[data-coach="next"]')) : null, text: note?.querySelector('.gr-coach-text')?.textContent || '',
    labels: [...document.querySelectorAll('.gr-stage-label')].map(l => ({ text: l.textContent, ...box(l) })),
    rings: document.querySelectorAll('.gr-stage-ring').length, status: document.querySelector('#turn-instruction')?.textContent || '' };
}`;
const LOOK = `(${LOOK_FN})()`;

async function main() {
  const chrome = findChrome();
  assert(chrome, 'Chrome is required');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await launch(chrome);
  const evaluate = expression => browser.evaluate(expression);
  const wait = async (condition, what, ms = 30000) => {
    const start = Date.now();
    while (!(await evaluate(condition))) { if (Date.now() - start > ms) throw new Error(`Timed out: ${what}`); await new Promise(r => setTimeout(r, 100)); }
  };
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const pointAt = async selector => {
    const point = await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 30) }; })()`);
    assert(point, `Nothing to point at: ${selector}`);
    for (const [x, y] of [[point.x, point.y - 120], [point.x, point.y]]) await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  };
  const press = action => evaluate(`(() => { const b = document.querySelector('#gr-coach [data-coach="${action}"]'); if (!b || b.disabled) throw new Error('No ${action} on the note'); b.click(); })()`);
  // Watches the note for a while: it must stay at home, with the same text, Next and labels.
  async function hold(name, ms, home) {
    // Sampled in the page, so a slow machine still sees every 100 ms.
    await evaluate(`window.__looks = []; window.__watch = setInterval(() => window.__looks.push((${LOOK_FN})()), 100); true`);
    await pause(ms);
    const looks = await evaluate('(() => { clearInterval(window.__watch); return window.__looks; })()');
    const shown = looks.filter(l => l.visible && !l.inDialog);
    assert(shown.length > looks.length / 2, `${name}: the note is showing`);
    const first = shown[0];
    for (const look of shown) {
      assert.equal(look.step, first.step, `${name}: still on one step`);
      assert.deepEqual([look.note.left, look.note.top], [home.left, home.top], `${name}: the note stays at home (${home.left},${home.top}), found ${look.note.left},${look.note.top}`);
      assert.equal(look.text, first.text, `${name}: the note's text does not change`);
      assert.deepEqual(look.next, first.next, `${name}: Next does not move`);
      assert.deepEqual(look.labels.map(l => l.text), first.labels.map(l => l.text), `${name}: the same labels throughout`);
      assert.doesNotMatch(look.text, /Rivals are taking their turns/, `${name}: rivals' turns are not in the note`);
    }
    // Every ringed part is labelled at once, and no label lies over another or over the note.
    assert.equal(first.labels.length, first.rings, `${name}: every part is labelled at once`);
    const over = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    first.labels.forEach((a, i) => {
      assert(!over(a, first.note), `${name}: label "${a.text}" is clear of the note`);
      first.labels.slice(i + 1).forEach(b => assert(!over(a, b), `${name}: labels "${a.text}" and "${b.text}" do not overlap`));
    });
    return first;
  }

  try {
    for (const { size: [width, height], reduced } of CASES) {
      const name = `${width}x${height}${reduced ? ' reduced motion' : ''}`;
      await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] });
      await browser.navigate(`${origin}/galactic-reach/rulebook.html`);
      await evaluate('localStorage.clear()');
      await browser.navigate(`${origin}/galactic-reach/?tutorial=1`);
      await evaluate('document.fonts.ready.then(() => true)');
      await wait(`document.querySelector('.gr-coach-card-cue') && galacticReachTutorial.progress().step === 0`, `${name}: the first card cue`);
      // Pointing at the cued card reveals the note at home: the map key's top-left corner.
      await pointAt('.gr-coach-card-cue');
      await wait(`!document.querySelector('#gr-coach').hidden`, `${name}: the note appears`);
      const first = await evaluate(LOOK);
      assert(first.key, `${name}: the map key is on the table`);
      assert.deepEqual([first.note.left, first.note.top], [first.key.left, first.key.top], `${name}: the note lies over the map key`);
      const home = first.note;
      await hold(`${name} first step`, 800, home);
      // Pointing at other hand cards (they rise) does not move it.
      for (const index of [1, 2, 4]) { await pointAt(`#hand-row > .game-card:nth-child(${index})`); await pause(300); }
      await hold(`${name} after pointing at other cards`, 600, home);
      // The reading steps: the score track, your home world and the mat, past two lessons.
      await press('skip'); await pause(700); await press('skip');
      await wait(`galacticReachTutorial.steps[galacticReachTutorial.progress().step]?.id === 'track' && !document.querySelector('#gr-coach').hidden`, `${name}: the score track step`);
      // Longer than the 2.4 s the labels used to take turns over.
      const track = await hold(`${name} score track`, 5200, home);
      assert.equal(track.labels.length, 2, `${name}: the score track labels both parts`);
      await press('next');
      await wait(`galacticReachTutorial.steps[galacticReachTutorial.progress().step]?.id === 'home'`, `${name}: the home world step`);
      await hold(`${name} home world`, 1500, home);
      await press('next');
      await wait(`galacticReachTutorial.steps[galacticReachTutorial.progress().step]?.id === 'mat'`, `${name}: the mat step`);
      const mat = await hold(`${name} mat`, 5200, home);
      assert.equal(mat.labels.length, 4, `${name}: the mat labels its four parts`);
      // Every later lesson's opening note is at the same home.
      for (let lesson = 0; lesson < 10; lesson++) {
        await press('skip');
        await pause(900);
        const look = await evaluate(LOOK);
        if (look.step === 'finished') break;
        if (look.visible && !look.inDialog) assert.deepEqual([look.note.left, look.note.top], [home.left, home.top], `${name}: ${look.step} opens at home`);
        if (!look.visible) { await pointAt('.gr-coach-card-cue'); await wait(`!document.querySelector('#gr-coach').hidden`, `${name}: ${look.step} note`); }
        const shown = await evaluate(LOOK);
        if (shown.visible && !shown.inDialog) assert.deepEqual([shown.note.left, shown.note.top], [home.left, home.top], `${name}: ${shown.step} stays at home`);
        if (shown.step === 'final-track') { await hold(`${name} how to win`, 3000, home); break; }
      }
      console.log(`ok ${name}: the note stays at ${home.left},${home.top}`);
    }
    assert.deepEqual(browser.errors, [], 'No runtime exceptions');
  } finally { browser.close(); server.close(); }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
