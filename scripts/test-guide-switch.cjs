// The Guidance switch on the table (prototypes/galactic-reach/guide.js, index.html): one click turns
// Guidance on or off, the menu entry and every switch show the same state at once, the stored
// setting is the only source of truth (it survives a reload), and Learn to play hides them all, as
// it hides the menu entry. The markup gives each switch a name, a pressed state and both state words.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const GAME = path.join(__dirname, '../prototypes/galactic-reach');
const source = fs.readFileSync(path.join(GAME, 'guide.js'), 'utf8');
const markup = fs.readFileSync(path.join(GAME, 'index.html'), 'utf8');
const STORE = 'galactic-reach-guide-v1';

// Just enough of an element for guide.js's menu and switches.
function element(id) {
  const attributes = {}, listeners = {};
  return {
    id, hidden: false, textContent: '', dataset: {}, style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute(name, value) { attributes[name] = String(value); },
    getAttribute: name => (name in attributes ? attributes[name] : null),
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    click() { (listeners.click || []).forEach(fn => fn({ target: this })); },
    matches: () => false, hidePopover() {}, showPopover() {}, appendChild() {},
  };
}

function open({ stored, tutorial = false } = {}) {
  const store = stored === undefined ? {} : { [STORE]: JSON.stringify(stored) };
  const localStorage = { getItem: key => (key in store ? store[key] : null), setItem: (key, value) => { store[key] = String(value); } };
  const menu = element('guide-toggle'), table = element('guide-switch'), phone = element('guide-switch-phone');
  for (const button of [table, phone]) button.dataset.guideSwitch = '';
  const byPart = part => ({ '#guide-toggle': [menu], '[data-guide-switch]': [table, phone] })[part.trim()] || [];
  const document = {
    readyState: 'complete', body: element('body'),
    querySelector: selector => byPart(selector)[0] || null,
    querySelectorAll: selector => selector.split(',').flatMap(byPart),
    createElement: () => element(''), addEventListener() {},
  };
  let frames = [];
  const context = {
    JSON, Object, Math, Boolean, String, Array, Number, console,
    localStorage, document,
    location: { pathname: '/galactic-reach/', search: '' },
    addEventListener() {}, setTimeout() {}, setInterval() {},
    requestAnimationFrame: fn => frames.push(fn),
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    matchMedia: () => ({ matches: false }),
    galacticReachTutorial: tutorial ? { active: true } : undefined,
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  const flush = () => { const run = frames; frames = []; run.forEach(fn => fn()); };
  const saved = () => JSON.parse(store[STORE] || 'null');
  return { menu, table, phone, flush, saved, guide: context.galacticReachGuide };
}

// Every control shows the stored state: pressed for on, the menu's words for its own text.
function inStep(page, on, message) {
  assert.equal(page.guide.prefs.enabled, on, message);
  assert.equal(page.menu.textContent, on ? 'Guidance: on' : 'Guidance: off', message);
  for (const button of [page.menu, page.table, page.phone]) assert.equal(button.getAttribute('aria-pressed'), String(on), `${message}: ${button.id}`);
}

// A first visit: Guidance is on, and every control says so.
{
  const page = open();
  inStep(page, true, 'first visit');
  assert.equal(page.saved(), null, 'nothing is stored until the player chooses');
  // The table switch turns it off at once; the menu entry follows without a render.
  page.table.click();
  inStep(page, false, 'table switch off');
  assert.equal(page.saved().enabled, false, 'the switch stores the setting');
  page.flush();
  inStep(page, false, 'still off after the next frame');
  // The menu entry turns it back on; the switch follows.
  page.menu.click();
  inStep(page, true, 'menu on');
  assert.equal(page.saved().enabled, true);
  // A phone's switch is the same switch.
  page.phone.click();
  inStep(page, false, 'phone switch off');
  page.table.click();
  inStep(page, true, 'table switch on again');
}
// The stored setting is kept across a reload, and what was already seen is not forgotten.
{
  const page = open({ stored: { enabled: false, seen: { welcome: true } } });
  inStep(page, false, 'reloaded while off');
  page.table.click();
  inStep(page, true, 'turned on after a reload');
  assert.deepEqual(page.saved(), { enabled: true, seen: { welcome: true } });
}
// Learn to play hides the menu entry and the switches alike; nothing else changes.
{
  const page = open({ tutorial: true });
  for (const button of [page.menu, page.table, page.phone]) assert.equal(button.hidden, true, `${button.id} hidden during Learn to play`);
  const outside = open();
  for (const button of [outside.menu, outside.table, outside.phone]) assert.equal(button.hidden, false, `${button.id} shown outside Learn to play`);
}

// The markup: a real button with a name and a pressed state, the same words in one slot for on
// and off (so it is the same size either way), and an icon that shows the state without colour.
{
  const switches = [...markup.matchAll(/<button\b[^>]*\bdata-guide-switch\b[^>]*>[\s\S]*?<\/button>/g)].map(m => m[0]);
  assert.equal(switches.length, 2, 'one switch on the table, one on a phone\'s turn buttons');
  for (const button of switches) {
    assert.match(button, /type="button"/);
    assert.match(button, /aria-label="Guidance"/);
    assert.match(button, /aria-pressed="true"/);
    assert.match(button, /class="guide-switch-on">on</);
    assert.match(button, /class="guide-switch-off">off</);
    assert.match(button, /class="guide-switch-slash"/);
  }
  assert.match(markup, /<div class="map-tools">[^]*?id="guide-switch"[^]*?id="open-map-key"/, 'the table switch stands with the map tools');
  assert.match(markup, /<div class="hand-tools"><button[^>]*id="guide-switch-phone"/, 'the phone switch starts the turn\'s buttons');
}
console.log('Guidance switch: toggles in one click, stays in step with the menu, keeps the stored setting, and hides during Learn to play.');
