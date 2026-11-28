// Learn to play's saved place (prototypes/galactic-reach/tutorial.js, docs/rules/tutorial.md):
// choosing Learn to play resumes only a walkthrough left part-way; otherwise it deals the practice
// game again before app.js reads it. Reloads keep the walkthrough, the guest save is never
// touched, unreadable stored data never breaks the page, and a restart in another tab is followed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../prototypes/galactic-reach/tutorial.js'), 'utf8');
const PROGRESS = 'galactic-reach-tutorial-progress-v1';
const RULES = /const RULES = '([^']+)'/.exec(source)[1];
const PRACTICE = ['galactic-reach-tutorial-save-v39', 'galactic-reach-tutorial-history-v39', 'galactic-reach-tutorial-turn-history-v39'];
const GUEST = ['galactic-reach-save-v39', 'galactic-reach-history-v39', 'galactic-reach-turn-history-v39', 'galactic-reach-guide-v1'];

// localStorage keeps its entries as own enumerable keys: tutorial.js lists them with Object.keys.
function storage(entries, { blocked = false } = {}) {
  const store = {};
  const method = fn => ({ value: blocked ? () => { throw new Error('blocked'); } : fn });
  Object.defineProperties(store, {
    getItem: method(key => (Object.hasOwn(store, key) ? store[key] : null)),
    setItem: method((key, value) => { store[key] = String(value); }),
    removeItem: method(key => { delete store[key]; }),
  });
  Object.assign(store, entries);
  return store;
}

function open({ entries = {}, navigation = 'navigate', search = '?tutorial=1', blocked = false, performance } = {}) {
  const localStorage = storage(entries, { blocked });
  const listeners = {};
  let reloads = 0;
  const element = { classList: { add() {} }, addEventListener() {}, hidden: false, textContent: '' };
  const context = {
    URLSearchParams, JSON, Number, Object, Math, Boolean, String, Array,
    localStorage,
    location: { search, pathname: '/galactic-reach/', reload: () => { reloads += 1; } },
    performance: performance !== undefined ? performance : { getEntriesByType: type => (type === 'navigation' && navigation ? [{ type: navigation }] : []) },
    document: { readyState: 'complete', title: 'Heirs Ad Astra', body: element, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return { context, localStorage, keys: () => Object.keys(localStorage).sort(), fire: (type, event) => (listeners[type] || []).forEach(fn => fn(event)), reloads: () => reloads };
}

const practice = progress => ({
  [PROGRESS]: typeof progress === 'string' ? progress : JSON.stringify({ rules: RULES, view: progress.step, base: null, staged: { 'first-construct': true }, cardFirst: true, ...progress }),
  ...Object.fromEntries(PRACTICE.map(key => [key, '{"round":2}'])),
  ...Object.fromEntries(GUEST.map(key => [key, '{"guest":true}'])),
});
const guestOnly = GUEST.slice().sort();
const everything = [...GUEST, ...PRACTICE, PROGRESS].sort();

// A walkthrough still on its first step (the player may have played on, Lesson 1 never advanced):
// choosing Learn to play deals the practice game again, as its "Learn to play" label promises.
{
  const page = open({ entries: practice({ step: 0, stepId: 'first-construct' }) });
  assert.deepEqual(page.keys(), guestOnly, 'a new walkthrough must not inherit the earlier practice table');
  assert.equal(page.context.galacticReachTutorial.progress().step, 0);
  assert.equal(JSON.stringify(page.context.galacticReachTutorial.progress().staged), '{}', 'the opening hand is staged again');
}
// A finished walkthrough: Learn to play starts it again.
assert.deepEqual(open({ entries: practice({ step: 36, stepId: 'finished' }) }).keys(), guestOnly);
// Left part-way ("Continue Learn to play"): the place and the practice game are resumed.
{
  const page = open({ entries: practice({ step: 8, stepId: 'convert-rest' }) });
  assert.deepEqual(page.keys(), everything);
  assert.equal(page.context.galacticReachTutorial.progress().stepId, 'convert-rest');
}
// A place saved at Lesson 1's former second step (its Move conversion, now part of the first step)
// was left part-way: it resumes on the same practice game, at Lesson 1.
{
  const page = open({ entries: practice({ step: 1, stepId: 'convert-move' }) });
  assert.deepEqual(page.keys(), everything);
  // The smallest table the first step reads: your Move not yet converted (no Energy).
  page.context.galacticReachGuide = { handCard: () => null, hex: () => null, turnButton: () => null };
  const player = { resources: { matter: 1, energy: 0, biomass: 1, data: 1 }, hand: [], deck: [], discard: [], inPlay: [] };
  const state = { tutorialRules: RULES, pendingCombat: null, phase: 'operations', activePlayer: 0, winner: null, players: [player], planets: {}, clusters: [], fleets: {} };
  const tip = page.context.galacticReachTutorial.tip({ state, structures: { harvester: { cost: { energy: 1 } } }, turnSerial: () => 1, stage: () => true }, null);
  assert.match(tip.eyebrow, /^Lesson 1 of /);
  assert.equal(page.context.galacticReachTutorial.progress().stepId, 'first-construct');
}
// A place saved before steps were named still resumes.
assert.deepEqual(open({ entries: practice({ step: 3, stepId: undefined }) }).keys(), everything);
// A reload or Back/Forward keeps the same walkthrough, even on its first step or once finished.
for (const navigation of ['reload', 'back_forward']) {
  assert.deepEqual(open({ entries: practice({ step: 0, stepId: 'first-construct' }), navigation }).keys(), everything, navigation);
  assert.deepEqual(open({ entries: practice({ step: 36, stepId: 'finished' }), navigation }).keys(), everything, navigation);
}
// Browsers without navigation timing treat the page as newly chosen.
assert.deepEqual(open({ entries: practice({ step: 0 }), performance: null }).keys(), guestOnly);
assert.deepEqual(open({ entries: practice({ step: 0 }), performance: { getEntriesByType: () => { throw new Error('unsupported'); } } }).keys(), guestOnly);
// Unreadable or older stored places cannot be resumed: the page still loads and starts clean.
for (const stored of ['{not json', 'null', '5', '"text"', '[]', '{"step":"8"}', '{"step":-1}', '{"step":1.5}']) {
  const page = open({ entries: practice(stored) });
  assert.deepEqual(page.keys(), guestOnly, stored);
  assert.equal(page.context.galacticReachTutorial.progress().step, 0, stored);
}
// Blocked storage never stops the walkthrough from loading.
assert.equal(open({ entries: {}, blocked: true }).context.galacticReachTutorial.active, true);
// Outside Learn to play nothing is read, cleared or watched, whatever is saved.
{
  const page = open({ entries: practice({ step: 0 }), search: '' });
  assert.equal(page.context.galacticReachTutorial.active, false);
  assert.deepEqual(page.keys(), everything);
  page.fire('storage', { key: PROGRESS, newValue: null });
  assert.equal(page.reloads(), 0);
}
// Another tab restarted the walkthrough (its place removed): this tab reloads onto the new one
// instead of writing the old practice game back. Its ordinary saves do not reload it.
{
  const page = open({ entries: practice({ step: 12, stepId: 'shipyard-aim' }) });
  page.fire('storage', { key: PROGRESS, newValue: JSON.stringify({ step: 13 }) });
  page.fire('storage', { key: 'galactic-reach-tutorial-save-v39', newValue: null });
  page.fire('storage', { key: 'galactic-reach-save-v39', newValue: null });
  assert.equal(page.reloads(), 0);
  page.fire('storage', { key: PROGRESS, newValue: null });
  assert.equal(page.reloads(), 1);
}
// A place saved at the former Pass step (an empty hand passes by itself, so it was never shown)
// resumes at its successor, Finish Buy.
{
  const page = open({ entries: practice({ step: 8, stepId: 'pass' }) });
  assert.deepEqual(page.keys(), everything);
  page.context.galacticReachGuide = { handCard: () => null, hex: () => null, turnButton: () => null, shown: () => false };
  const player = { resources: { matter: 2, energy: 1, biomass: 1, data: 0 }, hand: [], deck: [], discard: [], inPlay: [], passed: true };
  const state = { tutorialRules: RULES, pendingCombat: null, phase: 'buy', activePlayer: 0, round: 1, winner: null, players: [player], planets: {}, clusters: [], fleets: {} };
  const tip = page.context.galacticReachTutorial.tip({ state, turnSerial: () => 1, stage: () => true }, null);
  assert.equal(page.context.galacticReachTutorial.progress().stepId, 'buy-empty');
  assert.match(tip.eyebrow, /The round · step 2 of 3$/, 'the step counter counts only steps that are shown');
  assert.match(tip.text, /^No cards left, so the table passed you to Buy\./);
}

// The round's flow on a small table: a hand, the mat rows and the notices, read by selector.
function roundTable({ hand, resources, notices = {}, log = [] }) {
  const page = open({ entries: {} });
  const el = (props = {}) => ({ dataset: {}, textContent: '', getBoundingClientRect: () => ({ width: 200, height: 20 }), closest: () => null, querySelector: () => null, ...props });
  const rows = Object.fromEntries(['matter', 'energy', 'biomass', 'data'].map(r => [r, el({ id: `row-${r}` })]));
  const cards = hand.map(c => { const corner = el({ id: `corner-${c.id}` }); return el({ id: `card-${c.id}`, dataset: { cardId: c.id }, querySelector: sel => (sel === '[data-resource-card]' ? corner : null) }); });
  const noticeEls = Object.fromEntries(Object.entries(notices).map(([id, text]) => [id, el({ id, textContent: text })]));
  const logEls = log.map(text => el({ textContent: text, closest: sel => (sel === '#game-log' ? {} : null) }));
  page.context.document.querySelector = sel => {
    const row = /data-resource="(\w+)"/.exec(sel); if (row) return rows[row[1]];
    const id = /^#([\w-]+)$/.exec(sel); return (id && noticeEls[id[1]]) || null;
  };
  page.context.document.querySelectorAll = sel => (sel === '#hand-row > .game-card' ? cards : sel === '#game-log .log-entry' ? logEls : []);
  page.context.galacticReachGuide = { handCard: id => cards.find(c => c.dataset.cardId === id) || null, hex: () => null, turnButton: () => el({ id: 'turn-button' }), shown: e => Boolean(e) };
  const player = { resources: { ...resources }, hand: hand.map(c => ({ ...c })), deck: [], discard: [], inPlay: [], passed: false };
  const state = { tutorialRules: RULES, phase: 'operations', activePlayer: 0, round: 1, winner: null, players: [player], planets: {}, clusters: [], fleets: {}, market: [] };
  const port = { state, limits: () => ({ matter: 4, energy: 4, biomass: 4, data: 4 }), canConvertCard: c => c.key !== 'probe', cards: { construct: { resource: { matter: 1 } }, move: { resource: { energy: 1 } }, probe: {} } };
  const step = id => page.context.galacticReachTutorial.steps.find(s => s.id === id);
  return { page, state, player, port, step, rows };
}
// Converting the rest of the hand lights one card's convert corner at a time (the rightmost, whose
// corner no card covers), never the convert-everything button, and the ghost goes to that card's row.
{
  const { state, player, port, step, rows } = roundTable({ hand: [{ id: 'construct-6', key: 'construct' }, { id: 'move-5', key: 'move' }], resources: { matter: 1, energy: 0, biomass: 1, data: 0 } });
  const convert = step('convert-rest');
  assert.equal(convert.anchor(state, port).id, 'corner-move-5');
  assert.equal(convert.show(state, port).ghost.to, rows.energy, 'a Move converts to Energy');
  player.hand.pop();
  assert.equal(convert.anchor(state, port).id, 'corner-construct-6');
  assert.equal(convert.show(state, port).ghost.to, rows.matter, 'a Construct converts to Matter');
  player.resources.matter = 4;
  assert.equal(convert.done(state, {}, port), true, 'a card whose resource is full is left in hand');
}
// The round has no Pass step the player cannot reach: an empty hand passes by itself, and Finish Buy
// says so and lights the table's notice; cards kept back still get Pass & buy.
{
  const { page, state, player, port, step } = roundTable({ hand: [], resources: {}, log: ['R1 · You had no cards left, so the table passed you to Buy.'] });
  const steps = page.context.galacticReachTutorial.steps;
  assert.equal(steps.some(s => s.id === 'pass'), false);
  assert.deepEqual(page.context.galacticReachTutorial.lessons.find(l => l.id === 'round').steps.map(s => s.id).join(' '), 'convert-rest buy-empty deck');
  const buy = step('buy-empty');
  Object.assign(state, { phase: 'buy' }); player.passed = true;
  assert.match(buy.text(state), /^No cards left, so the table passed you to Buy\./);
  assert.match(buy.show(state).callouts[0].el.textContent, /no cards left/, 'the Comms line about the automatic pass is lit');
  Object.assign(state, { phase: 'operations' }); player.passed = false; player.hand.push({ id: 'construct-6', key: 'construct' });
  assert.match(buy.text(state), /choose Pass & buy/);
}
// Relics: the Probe / Excavate card stays in play until the round ends, so its round's hand is it and
// a Move. Reaching the ◈ empties the hand; nobody is told to pass with cards in hand.
{
  const { state, player, step } = roundTable({ hand: [], resources: {} });
  const make = (key, n) => ({ id: `${key}-${n}`, key });
  player.hand = [make('construct', 1), make('construct', 2), make('move', 3), make('construct', 4), make('move', 5)];
  player.deck = [make('move', 6)];
  player.discard = [make('probe', 9)];
  const stagePort = { state, ensureFleet: () => ({ explorer: 0 }) };
  state.planets = { '0,0': { owner: 0, upgrade: 'starbase' } };
  state.fleets = { '0,0': { 0: { explorer: 1 } } };
  const message = step('probe').prepare(stagePort);
  assert.equal(player.hand.map(c => c.key).sort().join(' '), 'move probe');
  assert.equal(player.deck.map(c => c.id).join(' '), 'move-6 construct-1 construct-2 construct-4 move-5', 'the rest go on top of the deck, drawn next round');
  assert.match(message, /^Staged: /);
  const excavate = step('excavate');
  player.hand = []; player.inPlay = [make('probe', 9)];
  Object.assign(state, { phase: 'buy' });
  assert.match(excavate.text(state), /excavate next round\. Choose Finish Buy\.$/);
  Object.assign(state, { phase: 'operations' }); player.hand = [make('construct', 1)];
  assert.doesNotMatch(excavate.text(state), /Pass & buy|Finish Buy/, 'cards in hand are never to be thrown away');
  player.hand = [];
  assert.match(excavate.text(state), /Choose Pass & buy, then Finish Buy\.$/, 'an empty hand still in Operations (the table has not passed yet)');
}

// The smallest table Lessons 1 to 3 read: a home Colony with an empty Data hex beside it, your
// Move converted, a Construct in hand. `stagings` counts every change the walkthrough makes to it.
function table(page) {
  page.context.galacticReachGuide = { handCard: id => ({ card: id }), hex: coord => ({ hex: coord }), turnButton: () => ({ button: 'turn' }) };
  const player = { resources: { matter: 2, energy: 1, biomass: 1, data: 2 }, hand: [{ id: 'construct-4', key: 'construct' }], deck: [], discard: [], inPlay: [] };
  const state = {
    tutorialRules: RULES, pendingCombat: null, phase: 'operations', activePlayer: 0, winner: null, round: 1, victoryTarget: 40, players: [player], fleets: {},
    planets: { '0,0': { cluster: 0, owner: 0, hasColony: true, type: 'matter', upgrade: null }, '1,0': { cluster: 0, owner: null, hasColony: false, type: 'data', upgrade: null } },
    clusters: [{ id: 0, kind: 'home', center: '0,0', coords: ['0,0', '1,0'] }],
  };
  const port = { state, stagings: 0, structures: { harvester: { cost: { matter: 1, energy: 1, data: 1 } } }, turnSerial: () => 1, stage: () => { port.stagings += 1; return true; } };
  return port;
}
// What a note lights on the table: a ring, a goal ring, a ghost drag or callouts, a pointer, the card cue.
const lit = tip => ['anchor', 'marks', 'show', 'followCallouts', 'revealOnInspect', 'bringIntoView']
  .filter(key => (Array.isArray(tip[key]) ? tip[key].some(Boolean) : Boolean(tip[key])));

// Back shows a finished step's note and lights nothing on the table: its action is done, so no
// ring, goal ring or ghost drag invites it again. The note holds its place, says it is a look back,
// and offers the way back to the current step. Next walks forward to it without staging anything.
{
  const page = open({ entries: practice({ step: 3, stepId: 'track' }) });
  const tutorial = page.context.galacticReachTutorial, port = table(page);
  assert.equal(tutorial.tip(port, null).id, 'track');
  for (const id of ['harvester-build', 'harvester-aim', 'first-construct']) {
    tutorial.coachAction('back');
    const tip = tutorial.tip(port, null);
    assert.equal(tip.id, id);
    assert.match(tip.eyebrow, / · done$/, id);
    assert.deepEqual(lit(tip), [], `reviewing ${id} lights nothing`);
    assert.equal(tip.hold, true, `reviewing ${id} keeps the note in place`);
    assert.match(tip.aside, /Looking back/, id);
    assert.deepEqual([...tip.buttons.map(b => b.action)], ['back', 'next', 'resume', 'exit', 'skip'], id);
  }
  for (const id of ['harvester-aim', 'harvester-build', 'track']) {
    tutorial.coachAction('next');
    assert.equal(tutorial.tip(port, null).id, id);
    assert.equal(tutorial.progress().step, 3, 'Next through review never re-enters a finished step');
  }
  assert.equal(tutorial.progress().view, 3);
  assert.equal(port.stagings, 0, 'Next through review stages nothing again');
  assert.equal(JSON.stringify(tutorial.progress().staged), JSON.stringify({ 'first-construct': true }));
  // Return to current step goes straight back from any earlier step.
  tutorial.coachAction('back'); tutorial.coachAction('back');
  tutorial.coachAction('resume');
  assert.equal(tutorial.tip(port, null).id, 'track');
  assert.equal(port.stagings, 0);
}
// Reloading while reviewing returns to the current step, not the one being looked at.
for (const navigation of ['reload', 'back_forward', 'navigate']) {
  const page = open({ entries: practice({ step: 3, stepId: 'track', view: 1 }), navigation });
  assert.equal(page.context.galacticReachTutorial.progress().view, 3, navigation);
  assert.equal(page.context.galacticReachTutorial.tip(table(page), null).id, 'track', navigation);
}
// Doing the current step's action while looking back still counts: the review ends at the step it reaches.
{
  const page = open({ entries: practice({ step: 1, stepId: 'harvester-aim' }) });
  const tutorial = page.context.galacticReachTutorial, port = table(page);
  assert.equal(tutorial.tip(port, null).id, 'harvester-aim');
  tutorial.coachAction('back');
  assert.equal(tutorial.tip(port, null).id, 'first-construct');
  Object.assign(port.state.planets['1,0'], { owner: 0, upgrade: 'harvester' });
  assert.equal(tutorial.tip(port, null).id, 'track');
  assert.equal(tutorial.progress().view, tutorial.progress().step);
}
console.log('Learn to play progress: new walkthroughs start clean, part-way places resume, reloads keep their place, guest saves and unreadable data are safe, other tabs follow a restart, Back reviews without lighting anything, a reload or the current action ends a review.');
console.log('Learn to play round flow: one lit convert corner at a time, no unreachable Pass step, an excavation that never asks to throw cards away.');
