// Learn to play's steps 5 and 17 (prototypes/galactic-reach/tutorial.js, docs/rules/tutorial.md):
// - "Your home world" invites the player to select a hex: the Sector Scan they open stays open.
//   Only a scan left open from the step before is closed, once, as a step begins.
// - "Explorers fly alone": the Explorer has its hex to itself when the step begins, so the Move
//   dropped there flies the Explorer, and the walkthrough aims only while the Explorer is moving.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../prototypes/galactic-reach/tutorial.js'), 'utf8');
const PROGRESS = 'galactic-reach-tutorial-progress-v1';
const RULES = /const RULES = '([^']+)'/.exec(source)[1];
const SHIP_STATS = { settler: { name: 'Settler', move: 1 }, explorer: { name: 'Explorer', move: 3 }, fleet: { name: 'Fleet', move: 2 } };

// Just enough of an element for the walkthrough's anchors.
const element = (props = {}) => ({ closest: () => null, matches: () => false, ...props });

// The page at a saved step (a reload, so the place is kept), with a Sector Scan that can open and close.
function open(stepId, staged = {}) {
  const store = { [PROGRESS]: JSON.stringify({ rules: RULES, step: 1, view: 1, base: null, staged, cardFirst: true, stepId }) };
  const localStorage = {
    getItem: key => (key in store ? store[key] : null), setItem: (key, value) => { store[key] = String(value); }, removeItem: key => { delete store[key]; },
  };
  const scan = { open: false, closes: 0 };
  scan.el = element({ id: 'sector-popover', matches: selector => selector === ':popover-open' && scan.open, hidePopover() { scan.open = false; scan.closes += 1; } });
  const lit = new Set();
  const hexes = {};
  const hex = coord => (hexes[coord] ||= element({ coord }));
  const querySelector = selector => {
    if (selector === '#sector-popover') return scan.el;
    const one = /^\.hex\.cf-drop-target\[data-coord="([^"]+)"\]/.exec(selector);
    if (one) return lit.has(one[1]) ? hex(one[1]) : null;
    if (selector === '.hex.cf-drop-target, .hex.target') return lit.size ? hex([...lit][0]) : null;
    return null;
  };
  const context = {
    URLSearchParams, JSON, Number, Object, Math, Boolean, String, Array,
    localStorage, Object_keys: Object.keys,
    location: { search: '?tutorial=1', pathname: '/galactic-reach/', reload() {} },
    performance: { getEntriesByType: () => [{ type: 'reload' }] },
    document: { readyState: 'complete', title: 'Heirs Ad Astra', body: element({ classList: { add() {} } }), querySelector, querySelectorAll: () => [], addEventListener() {} },
    addEventListener() {},
  };
  context.globalThis = context;
  context.galacticReachGuide = { handCard: id => (id ? element({ cardId: id }) : null), hex, turnButton: () => null };
  vm.runInNewContext(source, context);
  const tutorial = context.galacticReachTutorial;
  const port = (state, log = []) => ({
    state, turnSerial: () => 1, limits: () => ({}), canAfford: () => true, structures: {}, ships: SHIP_STATS,
    stage(change) {
      change({ state, SHIP_STATS, logEvent: message => log.push(message), ensureFleet: (coord, player) => { ((state.fleets[coord] ||= {})[player] ||= { settler: 0, explorer: 0, fleet: 0 }); return state.fleets[coord][player]; } });
      return true;
    },
  });
  return { tutorial, scan, lit, hex, port, progress: () => tutorial.progress() };
}

// Your home world (a Colony, a Shipyard and three empty hexes) and a free world two hexes on.
function table({ fleets = {}, hand = [] } = {}) {
  const planets = {
    '0,0': { cluster: 0, owner: 0, hasColony: true, type: 'matter' },
    '1,0': { cluster: 0, owner: 0, upgrade: 'starbase', type: 'energy' },
    '0,1': { cluster: 0, owner: null, type: 'biomass' }, '1,-1': { cluster: 0, owner: null, type: 'data' }, '0,-1': { cluster: 0, owner: null, type: 'matter' },
    '3,-1': { cluster: 1, owner: null, type: 'biomass' }, '3,-2': { cluster: 1, owner: null, type: 'matter' },
  };
  const player = { resources: { matter: 1, energy: 1, biomass: 1, data: 1 }, hand, deck: [], discard: [], inPlay: [] };
  return {
    tutorialRules: RULES, round: 2, phase: 'operations', activePlayer: 0, winner: null, pendingCombat: null, players: [player], planets,
    clusters: [{ id: 0, kind: 'home', center: '0,0', coords: ['0,0', '1,0', '0,1', '1,-1', '0,-1'] }, { id: 1, kind: 'world', name: 'Vesta', center: '3,-2', coords: ['3,-1', '3,-2'] }],
    fleets, actionMode: null, moveSource: null, actionOptions: {},
  };
}
const unitsOf = state => Object.entries(state.fleets).flatMap(([coord, f]) => Object.entries(f[0] || {}).filter(([, n]) => n > 0).map(([type]) => `${type}@${coord}`)).sort();

// Step 5: a scan the player opens by selecting a hex stays open, however often the note is drawn.
{
  const page = open('home');
  const state = table();
  const tip = page.tutorial.tip(page.port(state), null);
  assert.equal(tip.id, 'home');
  assert.match(tip.text, /Select any hex/);
  page.scan.open = true; // the player selects a hex: its Sector Scan opens
  for (let i = 0; i < 5; i++) page.tutorial.tip(page.port(state), null);
  assert.equal(page.scan.open, true, 'the Sector Scan the step invites the player to open must stay open');
  assert.equal(page.scan.closes, 0);
}
// A scan left open from the step before (a build's scan) is still closed once, as the step begins;
// one opened again during the step then stays open.
{
  const page = open('home');
  const state = table();
  page.scan.open = true;
  page.tutorial.tip(page.port(state), null);
  assert.equal(page.scan.open, false, 'a leftover Sector Scan is closed as the step begins');
  page.scan.open = true;
  page.tutorial.tip(page.port(state), null);
  assert.equal(page.scan.open, true);
  assert.equal(page.scan.closes, 1);
}

// Step 17: Settler and Explorer share the Shipyard (step 16 left the Settler behind). When the step
// begins, the Settler steps aside to a free hex of the same world, toward the next world to settle,
// and the walkthrough says so; the Explorer is alone, so a dropped Move chooses it.
{
  const page = open('move-explorer', { 'move-split': true });
  const log = [];
  const state = table({ fleets: { '1,0': { 0: { settler: 1, explorer: 1, fleet: 0 } }, '2,-1': { 0: { settler: 0, explorer: 0, fleet: 1 } } }, hand: [{ id: 'move-5', key: 'move' }] });
  const tip = page.tutorial.tip(page.port(state, log), null);
  assert.equal(tip.id, 'move-explorer');
  assert.deepEqual(unitsOf(state), ['explorer@1,0', 'fleet@2,-1', 'settler@1,-1'], 'the Explorer has its hex to itself; the Settler waits on a free hex of the home world');
  assert.match(log.join(' '), /Settler stepped 1 hex aside, so your Explorer has its hex to itself/);
  assert.match(tip.aside, /Settler stepped 1 hex aside/);
  // Staged once: drawing the note again (or a reload) moves nothing more.
  page.tutorial.tip(page.port(state, log), null);
  assert.equal(log.length, 1);
  assert.equal(page.progress().stepId, 'move-explorer');
}
// An Explorer already alone (step 16's Fleet took the Settler along) is left as it is.
{
  const page = open('move-explorer', { 'move-split': true });
  const log = [];
  const state = table({ fleets: { '1,0': { 0: { settler: 0, explorer: 1, fleet: 0 } }, '2,-1': { 0: { settler: 1, explorer: 0, fleet: 1 } } }, hand: [{ id: 'move-5', key: 'move' }] });
  page.tutorial.tip(page.port(state, log), null);
  assert.deepEqual(unitsOf(state), ['explorer@1,0', 'fleet@2,-1', 'settler@2,-1']);
  assert.deepEqual(log, []);
}
// The aimed pointer follows only the Explorer: while other units are the ones chosen to move, the
// note stays on the step's own cue and never lights their destinations; with the Explorer chosen,
// it aims at the Explorer's lit hexes.
{
  const page = open('move-explorer', { 'move-split': true });
  const state = table({ fleets: { '1,0': { 0: { settler: 1, explorer: 1, fleet: 0 } } }, hand: [{ id: 'move-5', key: 'move' }] });
  page.tutorial.tip(page.port(state), null); // staging done
  Object.assign(state, { actionMode: 'move', actionCardId: 'move-5', moveSource: '1,-1', actionOptions: { units: { settler: 1, explorer: 0, fleet: 0 } } });
  page.lit.add('0,-1');
  let tip = page.tutorial.tip(page.port(state), null);
  assert.notEqual(tip.anchor, page.hex('0,-1'), 'no aim at a Settler destination in the Explorer step');
  assert.doesNotMatch(tip.text, /choose a lit hex/);
  Object.assign(state, { moveSource: '1,0', actionOptions: { units: { settler: 0, explorer: 1, fleet: 0 } } });
  page.lit.clear(); page.lit.add('2,0');
  tip = page.tutorial.tip(page.port(state), null);
  assert.equal(tip.anchor, page.hex('2,0'));
  assert.match(tip.text, /choose a lit hex/);
}
console.log('Learn to play steps 5 and 17: a selected hex keeps its Sector Scan open, a leftover scan still closes, the Explorer flies from a hex of its own and the pointer follows only it.');
