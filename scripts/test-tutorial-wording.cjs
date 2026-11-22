// Learn to play's notes say what is true and what is lit (prototypes/galactic-reach/tutorial.js,
// docs/rules/tutorial.md): the winning rule is the real one, a note follows its step's state,
// and a step that rings one card is the only card ringed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../prototypes/galactic-reach/tutorial.js'), 'utf8');
const RULES = /const RULES = '([^']+)'/.exec(source)[1];
const PROGRESS = 'galactic-reach-tutorial-progress-v1';

// The page as far as the walkthrough reads it: `found` answers querySelector by selector text.
// Progress resumes by step id, so any saved index is moved to the named step.
// Once `ids` is known the place is saved at its real index, so Back can then review the step before it.
let ids = null;
function open({ stepId, found = () => null, all = () => [] }) {
  const step = ids ? ids.indexOf(stepId) : 1, view = step;
  const store = { [PROGRESS]: JSON.stringify({ rules: RULES, step, view, stepId, base: null, staged: {}, cardFirst: true }) };
  const localStorage = {
    getItem: key => (Object.hasOwn(store, key) ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: key => { delete store[key]; },
  };
  const element = { classList: { add() {} }, addEventListener() {}, hidden: false, textContent: '' };
  const context = {
    URLSearchParams, JSON, Number, Object, Math, Boolean, String, Array,
    localStorage,
    location: { search: '?tutorial=1', pathname: '/galactic-reach/', reload() {} },
    performance: { getEntriesByType: () => [{ type: 'reload' }] },
    document: { readyState: 'complete', title: 'Heirs Ad Astra', body: element, querySelector: found, querySelectorAll: all, addEventListener() {} },
    addEventListener() {},
  };
  context.globalThis = context;
  context.galacticReachGuide = { handCard: () => null, hex: () => null, turnButton: () => null };
  vm.runInNewContext(source, context);
  const tutorial = context.galacticReachTutorial;
  return { tutorial, step: tutorial.steps.find(s => s.id === stepId) };
}
ids = open({ stepId: 'first-construct' }).tutorial.steps.map(s => s.id);
const player = (extra = {}) => ({ resources: { matter: 1, energy: 1, biomass: 3, data: 1 }, hand: [], deck: [], discard: [], inPlay: [], ...extra });
const table = (extra = {}) => ({ tutorialRules: RULES, pendingCombat: null, phase: 'operations', activePlayer: 0, winner: null, round: 1, players: [player()], planets: {}, clusters: [], fleets: {}, ...extra });
const port = state => ({ state, colonyCost: 3, excavationCost: { energy: 1, data: 3 }, canAfford: () => true, victoryTarget: () => 40, structures: { harvester: { cost: { energy: 1 } } }, turnSerial: () => 1, stage: () => true });

// Step 1 leads with the card it lights.
{
  const { step } = open({ stepId: 'first-construct' });
  assert.match(step.title, /Move/);
  assert.match(step.text(), /^Convert this Move into 1 Energy/);
}
// The score track teaches the real winning rule, as "How to win" does: no race to the goal.
{
  const { step } = open({ stepId: 'track' });
  const text = step.text({ victoryTarget: 40 });
  assert.match(text, /When a round ends with anyone at 40★ or more, the highest score wins/);
  assert.doesNotMatch(text, /Race|First to/);
  assert.ok(step.show().callouts.every(c => !/First to/.test(c.label)), 'no callout says first to the goal wins');
}
// The battle note names the tactics as their cards do, without a hedge or a rule that does not apply.
{
  const { step } = open({ stepId: 'tactics' });
  assert.match(step.text(), /Choose Stay and fight/);
  assert.match(step.text(), /Concentrated Fire adds 1 hit; Defensive Screen blocks 2/);
  assert.doesNotMatch(step.text(), /If asked|Settler/);
}
// Buy a card rings one card: the one it asks you to buy.
{
  const affordable = { id: 'clearing-house' };
  const { step } = open({ stepId: 'buy-card', found: selector => (selector === '[data-buy-market]:not([disabled])' ? affordable : /market|#market-row/.test(selector) ? { id: selector } : null) });
  const callouts = step.show().callouts;
  assert.equal(callouts.length, 1);
  assert.equal(callouts[0].el, affordable);
}
// Excavate is named for what the player does: with the Probe / Excavate card in play, finishing the round.
{
  const { tutorial, step } = open({ stepId: 'excavate' });
  tutorial.tip(port(table()), null);
  const probe = { id: 'probe-1', key: 'probe' };
  assert.equal(step.title(table({ players: [player({ inPlay: [probe] })] })), 'Finish the round');
  assert.equal(step.title(table({ players: [player({ hand: [probe] })] })), 'Excavate');
  const tip = tutorial.tip(port(table({ players: [player({ inPlay: [probe] })] })), null);
  assert.equal(tip.title, 'Finish the round');
  assert.match(tip.text, /Pass & buy/);
  // Seen again with Back from the next step, its title is still text.
  const later = open({ stepId: 'choose-relic' }).tutorial;
  later.coachAction('back');
  assert.equal(later.tip(port(table({ players: [player({ inPlay: [probe] })] })), null).title, 'Finish the round');
}
// Found a Colony follows its state: with the Sector Scan offering Found Colony, it says to choose it.
{
  const scan = { matches: selector => selector === ':popover-open' };
  const button = { disabled: false, textContent: 'Found ColonyColonize' };
  let open_ = false;
  const { tutorial, step } = open({
    stepId: 'colonize',
    found: selector => (selector === '#sector-popover' && open_ ? scan : null),
    all: selector => (selector === '#sector-popover button' ? [button] : []),
  });
  tutorial.tip(port(table()), null);
  assert.match(step.text(), /^Drag the Colonize card onto your Settler/);
  open_ = true;
  assert.equal(step.text(), 'Choose Found Colony: 3 Life, +3★.');
}
// An order aimed with its corner button: the note says what is left (choose the ringed hex), not the
// drag it began with.
{
  const ringed = { id: 'data-hex', matches: () => false, closest: () => null };
  const found = selector => (/data-coord="1,0"/.test(selector) || selector === '.hex.cf-drop-target, .hex.target' ? ringed : null);
  const { tutorial } = open({ stepId: 'harvester-aim', found });
  const planets = { '0,0': { owner: 0, hasColony: true, cluster: 0, type: 'matter' }, '1,0': { owner: null, cluster: 0, type: 'data' } };
  const construct = { id: 'construct-1', key: 'construct' };
  const state = table({ planets, actionMode: 'construct', players: [player({ hand: [construct] })] });
  const tip = tutorial.tip(port(state), null);
  assert.equal(tip.anchor, ringed);
  assert.equal(tip.text, 'Now choose the ringed hex. (Escape cancels.)');
  // Moving: the lit destination is not the step's own target, so any lit hex will do.
  const elsewhere = { id: 'other-hex', matches: () => false, closest: () => null };
  const moving = open({ stepId: 'move-explorer', found: selector => (selector === '.hex.cf-drop-target, .hex.target' ? elsewhere : null) });
  const move = { id: 'move-1', key: 'move' };
  const flight = moving.tutorial.tip(port(table({ actionMode: 'move', moveSource: '0,0', players: [player({ hand: [move] })] })), null);
  assert.equal(flight.text, 'Now choose a lit hex to move to. (Escape cancels.)');
}
console.log('tutorial wording: ok');
