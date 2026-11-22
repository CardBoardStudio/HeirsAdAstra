// Learn to play inside windows (prototypes/galactic-reach/tutorial.js, guide.js): in the Trash
// window, the capacity window, the battle and its report, the note lights the control to use
// next, that control is on screen, the note keeps its place while the battle goes on, and every
// note offers Skip lesson. Driven through the real walkthrough with real clicks; nothing is staged
// here. Sizes: desktop 1440x900 and 1280x720, and a phone held sideways (844x390, touch).
// CHECK_SIZES=WxH,... limits the sizes; SHOTS=dir saves a capture of each window.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { findChrome, launch } = require('./check-viewport-fit.cjs');

const GAME = path.join(__dirname, '../prototypes/galactic-reach');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json' };
const SIZES = (process.env.CHECK_SIZES || '1440x900,1280x720,844x390').split(',').map(size => size.split('x').map(Number));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const server = http.createServer((request, response) => {
  const url = decodeURIComponent(request.url.split('?')[0]);
  const file = path.join(GAME, url.replace(/^\/galactic-reach\/?/, '') || 'index.html');
  if (!file.startsWith(GAME) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
});

// The note as the player sees it, and what it lights.
const NOTE = `(() => {
  const c = document.querySelector('#gr-coach');
  if (!c || c.hidden) return null;
  const onScreen = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth; };
  const r = c.getBoundingClientRect();
  return {
    window: c.parentElement.closest('dialog')?.id || null, step: galacticReachTutorial.progress().stepId,
    title: c.querySelector('.gr-coach-title')?.textContent, text: c.querySelector('.gr-coach-text')?.textContent,
    buttons: [...c.querySelectorAll('[data-coach]:not([hidden])')].map(b => b.textContent),
    lit: [...document.querySelectorAll('.gr-coach-target')].map(e => ({ id: e.id, text: e.textContent.trim().replace(/\\s+/g, ' '), onScreen: onScreen(e) })),
    marked: [...document.querySelectorAll('.gr-coach-goal')].map(e => ({ id: e.id, onScreen: onScreen(e) })),
    rect: [r.left, r.top, r.width, r.height].map(Math.round),
  };
})()`;

async function page(origin, [width, height]) {
  const browser = await launch(findChrome());
  const touch = Math.min(width, height) < 600;
  await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: touch });
  if (touch) await browser.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await browser.navigate(`${origin}/galactic-reach/?tutorial=1`);
  const click = selector => browser.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (e) e.click(); return Boolean(e); })()`);
  const note = () => browser.evaluate(NOTE);
  const step = () => browser.evaluate('galacticReachTutorial.progress().stepId');
  const until = async (expression, what) => {
    for (let i = 0; i < 80; i++) { if (await browser.evaluate(expression)) return; await sleep(150); }
    throw new Error(`${width}x${height}: never reached ${what}`);
  };
  // Skip lesson, lesson by lesson, as a player would (the first step's note shows once its card is pointed at).
  const skipTo = async id => {
    const target = await browser.evaluate(`galacticReachTutorial.steps.find(s => s.id === ${JSON.stringify(id)}).lessonIndex`);
    for (let i = 0; i < 40 && await browser.evaluate(`galacticReachTutorial.steps[galacticReachTutorial.progress().step].lessonIndex`) < target; i++) {
      await browser.evaluate(`document.querySelector('.gr-coach-card-cue')?.dispatchEvent(new Event('pointerover', { bubbles: true }))`);
      await sleep(250);
      await click('#gr-coach [data-coach="skip"]');
      await sleep(500);
    }
    assert.equal(await step(), id, `${width}x${height}: Skip lesson reaches ${id}`);
  };
  const shot = async name => {
    if (!process.env.SHOTS) return;
    fs.mkdirSync(process.env.SHOTS, { recursive: true });
    const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(process.env.SHOTS, `${width}x${height}-${name}.png`), Buffer.from(data, 'base64'));
  };
  return { browser, click, note, step, until, skipTo, shot, size: `${width}x${height}` };
}

// A note inside its window that lights exactly the named controls, all on screen, with Skip lesson.
function inWindow(seen, size, window, lit) {
  assert(seen, `${size}: a note shows in #${window}`);
  assert.equal(seen.window, window, `${size}: the note sits inside #${window}`);
  assert.deepEqual(seen.lit.map(e => e.text), lit, `${size}: #${window} lights ${lit.join(', ')}`);
  for (const e of [...seen.lit, ...seen.marked]) assert(e.onScreen, `${size}: ${e.text || e.id} is on screen in #${window}`);
  assert(seen.buttons.includes('Skip lesson'), `${size}: the note in #${window} offers Skip lesson`);
  assert(!/Close this window/.test(seen.text), `${size}: no stray-window note in #${window}`);
}

async function trash(origin, size) {
  const t = await page(origin, size);
  try {
    await t.skipTo('pass-buy');
    await t.click('#board-primary'); await t.until(`galacticReachTutorial.progress().stepId === 'buy-card'`, 'Buy a card');
    await t.click('[data-buy-market]:not([disabled])'); await t.until(`galacticReachTutorial.progress().stepId === 'upgrade'`, 'Upgrade');
    await t.click('[data-upgrade-offer]:not([disabled])'); await t.until(`document.querySelector('#upgrade-dialog').open`, 'the upgrade window');
    await t.click('[data-upgrade-card]'); await t.until(`galacticReachTutorial.progress().stepId === 'capacity'`, 'Capacity Module');
    await t.click('[data-capacity-offer]'); await t.until(`galacticReachTutorial.progress().stepId === 'trash'`, 'Trash a card');
    await t.click('[data-trash-pile]:not([disabled])'); await t.until(`document.querySelector('#trash-dialog').open`, 'the Trash window');
    await t.click('[data-trash]:not([disabled])'); await t.until(`galacticReachTutorial.progress().stepId === 'finish-buy'`, 'the card trashed');
    await sleep(400);
    // The card is gone: the note stays in the Trash window and lights its Done.
    const done = await t.note();
    inWindow(done, t.size, 'trash-dialog', ['Done']);
    assert.match(done.text, /Choose Done/, `${t.size}: the note names Done`);
    await t.shot('trash-done');
    await t.click('#close-trash'); await sleep(500);
    const table = await t.note();
    assert.equal(table.window, null, `${t.size}: with the Trash window closed the note returns to the table`);
    assert.deepEqual(table.lit.map(e => e.text), ['Finish Buy'], `${t.size}: then Finish Buy is lit`);
    // A window the step does not use (the deck, opened to look): its note still offers Skip lesson.
    await t.click('#deck-button'); await t.until(`[...document.querySelectorAll('dialog[open]')].some(d => d.id === 'deck-dialog')`, 'the deck window');
    await sleep(400);
    const stray = await t.note();
    assert.equal(stray.window, 'deck-dialog', `${t.size}: a stray window carries its note`);
    assert(stray.buttons.includes('Skip lesson'), `${t.size}: the stray-window note offers Skip lesson`);
  } finally { t.browser.close(); }
}

async function capacity(origin, size) {
  const t = await page(origin, size);
  try {
    await t.skipTo('play-module');
    await t.until(`galacticReachTutorial.progress().stepId === 'play-module' && [...document.querySelectorAll('#hand-row .game-card')].some(c => /Capacity/.test(c.textContent) && c.querySelector('[data-order-card]'))`, 'the Capacity Module card in hand');
    await t.browser.evaluate(`[...document.querySelectorAll('#hand-row .game-card')].find(c => /Capacity/.test(c.textContent)).querySelector('[data-order-card]').click()`);
    await t.until(`document.querySelector('#storage-allocation-dialog').open`, 'the capacity window');
    await sleep(400);
    const seen = await t.note();
    inWindow(seen, t.size, 'storage-allocation-dialog', ['Play Capacity Module']);
    assert.deepEqual(seen.marked.map(e => e.id), ['storage-allocation-options'], `${t.size}: the split it names is marked`);
    await t.shot('capacity');
  } finally { t.browser.close(); }
}

async function battle(origin, size) {
  const t = await page(origin, size);
  try {
    await t.skipTo('attack');
    // Move order on the Fleet, then onto the enemy Explorer.
    const id = await t.browser.evaluate(`document.querySelector('.gr-coach-card-cue, #hand-row .gr-coach-target')?.dataset.cardId`);
    await t.click(`#hand-row .game-card[data-card-id="${id}"] [data-order-card]`);
    const [fleet, enemy] = await t.browser.evaluate(`(() => { const save = JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('galactic-reach-tutorial-save')))); const at = test => Object.keys(save.fleets).find(c => test(save.fleets[c])); return [at(f => f?.[0]?.fleet), at(f => f?.[1]?.explorer)]; })()`);
    await t.click(`.hex[data-coord="${fleet}"]`); await sleep(400);
    await t.click(`.hex[data-coord="${enemy}"]`); await t.until(`document.querySelector('#combat-dialog').open`, 'the battle');
    await sleep(500);
    // Each control in turn as the player acts: Stay and fight, a tactic, Commit.
    const stay = await t.note();
    inWindow(stay, t.size, 'combat-dialog', ['Stay and fight']);
    await t.shot('battle-stay');
    await t.click('[data-combat-action]'); await t.until(`document.querySelector('[data-combat-tactic]:not(:disabled)')`, 'the tactics'); await sleep(400);
    const tactic = await t.note();
    inWindow(tactic, t.size, 'combat-dialog', await t.browser.evaluate(`[...document.querySelectorAll('[data-combat-tactic]:not(:disabled)')].map(b => b.textContent.trim().replace(/\\s+/g, ' '))`));
    const names = await t.browser.evaluate(`[...document.querySelectorAll('.gr-coach-target strong')].map(e => e.textContent)`);
    assert(names.length === tactic.lit.length && names.every(name => tactic.text.includes(name)), `${t.size}: the note names each tactic it lights (${names.join(', ')})`);
    await t.shot('battle-tactic');
    await t.click('[data-combat-tactic]:not(:disabled)'); await sleep(400);
    const commit = await t.note();
    inWindow(commit, t.size, 'combat-dialog', [await t.browser.evaluate(`document.querySelector('[data-combat-action]:not(:disabled)').textContent.trim()`)]);
    assert.match(commit.lit[0].text, /^Commit /, `${t.size}: Commit is lit once a tactic is picked`);
    await t.shot('battle-commit');
    // The note keeps its place and size while the battle goes on.
    assert.deepEqual(tactic.rect, stay.rect, `${t.size}: the battle note does not move (Stay and fight → tactic)`);
    assert.deepEqual(commit.rect, stay.rect, `${t.size}: the battle note does not move (tactic → Commit)`);
    await t.click('[data-combat-action]:not(:disabled)'); await t.until(`document.querySelector('#message-dialog').open`, 'the battle report'); await sleep(400);
    inWindow(await t.note(), t.size, 'message-dialog', ['Continue']);
    await t.shot('report');
  } finally { t.browser.close(); }
}

(async () => {
  if (!findChrome()) { if (process.env.CI) throw new Error('Chrome is required; set CHROME_PATH.'); console.log('check-tutorial-windows: no Chrome found; skipped.'); return; }
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const size of SIZES) for (const run of [trash, capacity, battle]) { await run(origin, size); console.log(`ok - ${size[0]}x${size[1]} ${run.name}`); }
  } finally { server.close(); }
  console.log('Learn to play lights the controls inside its windows.');
})().catch(error => { console.error(error); process.exit(1); });
