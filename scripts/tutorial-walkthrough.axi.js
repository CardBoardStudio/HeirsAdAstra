// Galactic Reach Learn to play, end to end with real input. Run against a served build:
//
//   chrome-devtools-axi open 'http://127.0.0.1:3117/galactic-reach/?tutorial=1'
//   TUTORIAL_URL=... chrome-devtools-axi run < scripts/tutorial-walkthrough.axi.js
//
// It starts a fresh tutorial and, step by step, does what the coach mark asks: it clicks the
// pulsing element (a hand card's own Use order or Convert button, a lit hex, a Sector Scan
// choice, a dialog's control) with real pointer clicks, never by calling the game. It fails
// when a step does not advance, and prints each step it completed.
const url = globalThis.process?.env?.TUTORIAL_URL || 'http://127.0.0.1:3117/galactic-reach/?tutorial=1';
const log = (...parts) => console.log(parts.join(' '));
const read = () => page.eval(() => {
  const coach = document.querySelector('#gr-coach');
  const target = document.querySelector('.gr-coach-target');
  const tutorial = globalThis.galacticReachTutorial;
  const progress = tutorial.progress();
  const step = tutorial.steps[progress.step];
  const dialog = [...document.querySelectorAll('dialog[open]')].find(d => d.matches(':modal'));
  return {
    step: progress.step, total: tutorial.steps.length, id: step?.id || 'finished', title: coach?.querySelector('.gr-coach-title')?.textContent || '',
    text: coach?.querySelector('.gr-coach-text')?.textContent || '', dialog: dialog?.id || null,
    scan: Boolean(document.querySelector('#sector-popover')?.matches(':popover-open')),
    target: target ? { tag: target.tagName, id: target.id, card: target.closest('#hand-row') ? target.dataset.cardId : null, coord: target.dataset.coord || null,
      cls: target.className } : null,
    lit: [...document.querySelectorAll('.hex.cf-drop-target, .hex.target')].map(h => h.dataset.coord),
    picker: Boolean(document.querySelector('#sector-popover .move-picker')),
  };
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const q = value => JSON.stringify(value);

const CLOSE = { 'prestige-dialog': '#close-prestige', 'deck-dialog': '#close-deck', 'trash-dialog': '#close-trash', 'upgrade-dialog': '#close-upgrade', 'message-dialog': '#message-continue' };
async function act(s) {
  // A window the coach asks you to close first (it says "Close this window").
  if (s.dialog && /^Close this window/.test(s.text)) return CLOSE[s.dialog] ? page.click(CLOSE[s.dialog]) : page.press('Escape');
  // Dialog steps: use the dialog's own controls.
  if (s.dialog === 'prestige-dialog') return page.click('#close-prestige');
  if (s.dialog === 'deck-dialog') return page.click('#close-deck');
  if (s.dialog === 'combat-dialog') {
    const choice = await page.eval(() => { const b = [...document.querySelectorAll('#combat-dialog [data-combat-action]:not([disabled])')].find(x => /Concentrated Fire|Stay and fight/i.test(x.textContent)) || document.querySelector('#combat-dialog [data-combat-action]'); document.querySelectorAll('[data-e2e]').forEach(e => e.removeAttribute('data-e2e')); if (b) b.dataset.e2e = 'go'; return b?.textContent.trim() || null; });
    if (choice) return page.click('#combat-dialog [data-e2e="go"]');
    return;
  }
  if (s.dialog === 'message-dialog') return page.click('#message-continue');
  if (s.dialog === 'upgrade-dialog') {
    await page.eval(() => { const b = [...document.querySelectorAll('[data-upgrade-card]:not([disabled])')][0]; document.querySelectorAll('[data-e2e]').forEach(e => e.removeAttribute('data-e2e')); if (b) b.dataset.e2e = 'go'; });
    return page.click('[data-e2e="go"]');
  }
  if (s.dialog === 'trash-dialog') {
    // Pay with a resource you hold 3 of: choose it in the dialog's own selector first.
    const ready = await page.eval(() => {
      const select = document.querySelector('#trash-resource');
      const rows = [...document.querySelectorAll('#resource-grid [data-mat-trade]')].map(b => [b.dataset.matTrade, Number(/: (\d+) of/.exec(b.getAttribute('aria-label'))?.[1] || 0)]);
      const pay = rows.find(([, n]) => n >= 3)?.[0];
      if (select && pay && select.value !== pay) return { select: pay };
      const b = [...document.querySelectorAll('#trash-dialog [data-trash]:not([disabled])')].at(-1);
      document.querySelectorAll('[data-e2e]').forEach(e => e.removeAttribute('data-e2e')); if (b) b.dataset.e2e = 'go';
      return { go: Boolean(b) };
    });
    if (ready.select) return page.fill('#trash-resource', ready.select);
    if (ready.go) return page.click('[data-e2e="go"]');
    return null;
  }
  if (s.dialog === 'storage-allocation-dialog') return page.click('#storage-allocation-confirm');
  if (s.dialog) return page.press('Escape');
  if (s.id === 'scan-close') return page.click('#close-sector-scan');
  // A split move: untick the slow Settler first, then fly to a lit hex two steps away.
  if (s.picker && s.id === 'move-split') {
    const ticked = await page.eval(() => document.querySelector('[data-move-unit="settler"]')?.checked);
    if (ticked) return page.click('[data-move-unit="settler"]');
  }
  if (!s.target) return null;
  if (s.target.card) {
    const convert = /^convert-/.test(s.id);
    const selector = convert ? `[data-resource-card="${s.target.card}"]`
      : s.id === 'excavate' ? `[data-order-card="${s.target.card}"][data-order-mode="excavate"]`
      : `[data-order-card="${s.target.card}"]`;
    return page.click(selector);
  }
  if (s.target.coord) return page.click(`.hex[data-coord="${s.target.coord}"]`);
  if (s.id === 'bank-trade') {
    // Tap the Energy Now row, then the Data resource (the mat's no-drag trade).
    const picked = await page.eval(() => document.querySelector('#resource-grid .mat-picked')?.dataset.resource || null);
    if (!picked) return page.click('#resource-grid [data-mat-trade="energy"]');
    return page.click(`#resource-grid [data-mat-trade="${picked === 'energy' ? 'data' : picked}"]`);
  }
  return page.click('.gr-coach-target');
}

await page.open(url);
await page.eval(() => { for (const key of Object.keys(localStorage)) if (key.startsWith('galactic-reach-tutorial-')) localStorage.removeItem(key); });
await page.open(url);
await sleep(1500);
let last = -1, stuck = 0;
for (let i = 0; i < 400; i++) {
  const s = await read();
  if (s.id === 'finished') { log(`PASS tutorial finished: ${s.total} steps`); break; }
  if (s.step !== last) { log(`step ${s.step + 1}/${s.total} ${s.id}: ${s.title}`); last = s.step; stuck = 0; }
  else if (++stuck > 12) { log(`FAIL stuck at ${s.id}: ${q(s)}`); break; }
  // This chrome-devtools-axi build reports "fn is not a function" after a click that landed.
  try { await act(s); } catch (error) { if (!/fn is not a function/.test(error.message)) log(`  (retry ${s.id}: ${error.message})`); }
  await sleep(700);
}
