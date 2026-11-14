// 33.38 Split Moves: a Move order moves any chosen units of one hex (rules #movement, #split-moves).
// Checks the engine and adapter, the browser order flow, browser rivals, the shared-table
// command shape, and that 32.37 stays pinned to its archive.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const plain = x => JSON.parse(JSON.stringify(x));
const rng = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);

function game(prefix = 'prototypes/galactic-reach/', keepMap = false) {
  const c = vm.createContext({});
  vm.runInContext(read(prefix + 'adapter.js') + read(prefix + 'app.js').replace('      clone, deckContents,', '      chooseAiMove, clone, deckContents,'), c);
  let e; const factory = c.createGalacticAdapter; c.createGalacticAdapter = x => { e = x; return factory(x); };
  c.createGalacticReach({ headless: true, random: rng(37) });
  const s = e.state, a = () => factory(e);
  s.phase = 'operations'; s.activePlayer = 0; if (!keepMap) s.planets = {};
  s.players.forEach(p => { p.resourceLimits = { matter: 50, energy: 50, biomass: 50, data: 50 }; p.hand = []; });
  return { e, s, a, p: s.players[0] };
}
const moves = (g, source, seat = 0) => g.a().legalActions(seat).filter(x => x.type === 'move' && x.source === source);
const units = (settler, explorer, fleet) => ({ settler, explorer, fleet });
const farthest = list => Math.max(0, ...list.map(x => hexDistance(x.source, x.destination)));
function hexDistance(a, b) {
  const [aq, ar] = a.split(',').map(Number), [bq, br] = b.split(',').map(Number);
  return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs(aq + ar - bq - br)) / 2;
}
const record = [];

// Subset move: Fleets leave the Settler behind and travel at Fleet speed; the Settler stays.
{
  const g = game(); g.p.hand = [{ key: 'move', id: 'm1' }];
  g.s.fleets = { '0,0': { 0: units(1, 0, 2) } };
  const legal = moves(g, '0,0'), same = u => x => JSON.stringify(x.units) === JSON.stringify(u);
  assert.equal(farthest(legal.filter(same(units(1, 0, 2)))), 1, 'The whole group moves at the Settler’s speed');
  assert.equal(farthest(legal.filter(same(units(0, 0, 2)))), 2, 'Fleets without the Settler move 2');
  assert.equal(farthest(legal.filter(same(units(0, 0, 1)))), 2, 'One Fleet moves 2');
  assert.equal(farthest(legal.filter(same(units(1, 0, 0)))), 1, 'The Settler alone moves 1');
  assert.deepEqual(plain(legal[0].units), units(1, 0, 2), 'The whole group is listed first');
  const go = legal.find(x => same(units(0, 0, 2))(x) && x.destination === '2,0');
  assert(go); assert.equal(go.moveGroup, 'ships');
  g.a().applyAction(0, go);
  assert.deepEqual(plain(g.s.fleets['0,0'][0]), units(1, 0, 0), 'The unchosen Settler stays');
  assert.equal(g.s.fleets['2,0'][0].fleet, 2);
  assert.match(g.s.log.join('\n'), /moved 2 Fleets from/);
  assert(g.p.inPlay.some(c => c.id === 'm1'), 'The Move card was used');
  record.push('subset');
}

// Speed of the chosen units, with Move II and a movement card added to that order.
{
  const g = game(); g.s.fleets = { '0,0': { 0: units(1, 0, 3) } };
  g.p.hand = [{ key: 'move', id: 'up', upgraded: true, starter: true }];
  const legal = moves(g, '0,0');
  assert.equal(farthest(legal.filter(x => x.units.settler)), 2, 'Move II: Settler group 1 + 1');
  assert.equal(farthest(legal.filter(x => !x.units.settler)), 3, 'Move II: Fleets 2 + 1');
  g.p.hand = [{ key: 'ionThrusters', id: 'ion' }];
  const bonus = g.e.ALL_CARDS.ionThrusters.range || 0;
  assert(bonus > 0, 'Ion Thrusters prints extra range');
  assert.equal(farthest(moves(g, '0,0').filter(x => !x.units.settler)), 2 + bonus, 'A movement card adds its range to the chosen units');
  assert.equal(g.e.movementRange(units(0, 0, 2), { key: 'move' }), 2);
  assert.equal(g.e.movementRange(units(1, 0, 2), { key: 'move', upgraded: true }), 2);
  record.push('speed');
}

// Each order moves one group; leftovers need another Move card on a later turn.
{
  const g = game(); g.p.hand = [{ key: 'move', id: 'only' }];
  g.s.fleets = { '0,0': { 0: units(0, 0, 3) } };
  g.a().applyAction(0, moves(g, '0,0').find(x => x.units.fleet === 1 && x.destination === '1,0'));
  assert.equal(g.s.fleets['0,0'][0].fleet, 2); assert.equal(g.s.fleets['1,0'][0].fleet, 1);
  assert.notEqual(g.s.activePlayer, 0, 'A Move order is the turn’s action');
  g.s.activePlayer = 0;
  assert.equal(moves(g, '0,0').length, 0, 'No Move card, no further move');
  g.p.hand = [{ key: 'move', id: 'second' }];
  g.a().applyAction(0, moves(g, '0,0').find(x => x.units.fleet === 2 && x.destination === '0,1'));
  assert.equal(g.s.fleets['0,0'], undefined, 'The second order moved the rest');
  assert(['only', 'second'].every(id => g.p.inPlay.some(c => c.id === id)), 'One Move card per order');
  record.push('card-per-order');
}

// Explorers split from each other but never travel with combat ships.
{
  const g = game(); g.p.hand = [{ key: 'move', id: 'm' }];
  g.s.fleets = { '0,0': { 0: units(1, 2, 1) } };
  const legal = moves(g, '0,0');
  assert(legal.every(x => !(x.units.explorer && (x.units.settler || x.units.fleet))), 'Explorers never join combat ships');
  assert.equal(farthest(legal.filter(x => x.units.explorer === 1)), 3);
  assert(legal.some(x => x.units.explorer === 1 && x.moveGroup === 'explorer'));
  assert(!g.e.performMoveOrder(0, '0,0', '1,0', g.p.hand[0], { units: units(0, 1, 1) }), 'An Explorer with a Fleet is refused');
  assert(!g.e.performMoveOrder(0, '0,0', '1,0', g.p.hand[0], { units: units(0, 0, 2) }), 'More Fleets than are there is refused');
  assert(!g.e.performMoveOrder(0, '0,0', '1,0', g.p.hand[0], { units: units(0, 0, 0.5) }), 'Fractions are refused');
  assert(!g.e.performMoveOrder(0, '0,0', '1,0', g.p.hand[0], { units: units(0, 0, 0) }), 'An empty choice is refused');
  assert.deepEqual(plain(g.s.fleets['0,0'][0]), units(1, 2, 1), 'Refused orders change nothing');
  g.a().applyAction(0, legal.find(x => x.units.explorer === 1 && x.destination === '3,0'));
  assert.deepEqual(plain(g.s.fleets['0,0'][0]), units(1, 1, 1)); assert.equal(g.s.fleets['3,0'][0].explorer, 1);
  record.push('explorer-team');
}

// Shared-table commands: the browser sends `units`; a command with only `moveGroup` (the
// pre-33.38 shape) still means the whole group; malformed choices are illegal.
{
  const g = game(); g.p.hand = [{ key: 'move', id: 'm' }];
  g.s.fleets = { '0,0': { 0: units(2, 1, 1) } };
  const a = g.a(), before = JSON.stringify(g.s);
  for (const bad of [units(0, 0, 2), units(0, 1, 1), { fleet: 1.5 }, { fleet: '1' }, units(0, 0, 0)])
    assert.throws(() => a.applyAction(0, { type: 'move', card: 'm', key: 'move', source: '0,0', destination: '1,0', units: bad }), /Illegal/);
  assert.equal(JSON.stringify(g.s), before);
  a.applyAction(0, { type: 'move', card: 'm', key: 'move', source: '0,0', destination: '1,0', units: { fleet: 1 } });
  assert.deepEqual(plain(g.s.fleets['0,0'][0]), units(2, 1, 0), 'A partial units object fills missing types with 0');
  const h = game(); h.p.hand = [{ key: 'move', id: 'm' }]; h.s.fleets = { '0,0': { 0: units(2, 1, 1) } };
  h.a().applyAction(0, { type: 'move', card: 'm', key: 'move', source: '0,0', destination: '1,0', moveGroup: 'ships' });
  assert.deepEqual(plain(h.s.fleets['1,0'][0]), units(2, 0, 1), 'moveGroup alone moves every combat ship');
  assert.deepEqual(plain(h.s.fleets['0,0'][0]), units(0, 1, 0));
  record.push('commands');
}

// Combat and hostile hexes are unchanged: the chosen units stop and fight; leftovers are not involved.
{
  const g = game(); g.p.hand = [{ key: 'move', id: 'm' }];
  g.s.fleets = { '0,0': { 0: units(1, 0, 2) }, '2,0': { 1: units(0, 0, 1) } };
  assert(!moves(g, '0,0').some(x => x.destination === '3,0'), 'Hostile hexes still block movement through them');
  g.a().applyAction(0, moves(g, '0,0').find(x => x.units.fleet === 2 && !x.units.settler && x.destination === '2,0'));
  assert(g.s.pendingCombat, 'Entering a hostile hex starts combat');
  assert.equal(g.s.pendingCombat.attackerPieces.length, 2, 'Only the chosen units attack');
  assert.equal(g.s.fleets['0,0'][0].settler, 1);
  record.push('combat');
}

// Browser rivals leave a safe Settler behind when the Fleets need their speed, and keep it
// escorted when an enemy Fleet could reach it.
{
  const g = game(undefined, true), bot = g.s.players[1]; bot.strategy = 'military'; g.s.activePlayer = 1;
  bot.hand = [{ key: 'move', id: 'bm' }];
  g.s.fleets = { '0,0': { 1: units(1, 0, 3) }, '7,0': { 2: units(0, 0, 1) } };
  const split = g.e.chooseAiMove(1, bot.hand[0]);
  assert(split, 'The rival moves'); assert.equal(split.source, '0,0');
  assert.deepEqual(plain(split.units), units(0, 0, 3), 'Fleets leave the safe Settler behind');
  assert.equal(hexDistance(split.source, split.destination), 2, 'They move at Fleet speed');
  g.s.fleets['2,0'] = { 2: units(0, 0, 2) };
  const guarded = g.e.chooseAiMove(1, bot.hand[0]);
  assert(!guarded || guarded.source !== '0,0' || guarded.units.settler === 1, 'An exposed Settler is not abandoned');
  record.push('rival-split');
}

// Human order flow: selecting a hex ticks every combat ship; unticking changes the speed.
{
  const source = read('prototypes/galactic-reach/app.js');
  const boot = source.indexOf('\n  if (headless) {\n    state = newState();'); assert(boot > 0);
  const context = vm.createContext({ console, setTimeout: () => 0, clearTimeout: () => {}, document: { querySelector: () => ({ open: false }), querySelectorAll: () => [] } });
  vm.runInContext(source.slice(0, boot) + `
  render=()=>{};toast=()=>{};showMessage=()=>{};scheduleAiTurn=()=>{};saveGame=()=>{};
  return {get state(){return state;},set state(s){state=s;},newState,makeCard,humanSelectHex,setMoveUnits,playOrder};
}`, context);
  const r = context.createGalacticReach({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });
  r.state = r.newState(); const s = r.state; s.phase = 'operations'; s.activePlayer = 0; s.turnStage = 'prep'; s.planets = {};
  s.fleets = { '0,0': { 0: units(1, 1, 2) } };
  const card = r.makeCard('move', true); s.players[0].hand = [card];
  r.playOrder(card.id); r.humanSelectHex('0,0');
  assert.equal(s.moveSource, '0,0');
  assert.deepEqual(plain(s.actionOptions.units), units(1, 0, 2), 'Default: every combat ship, as before');
  assert(s.reachable.includes('1,0') && !s.reachable.includes('2,0'), 'Speed 1 with the Settler');
  assert(r.setMoveUnits('settler', 0));
  assert(s.reachable.includes('2,0') && !s.reachable.includes('3,0'), 'Speed 2 once the Settler is unticked');
  assert(r.setMoveUnits('fleet', 1)); assert.deepEqual(plain(s.actionOptions.units), units(0, 0, 1));
  assert(!r.setMoveUnits('fleet', 0), 'At least one unit stays ticked'); assert.equal(s.actionOptions.units.fleet, 1);
  assert(r.setMoveUnits('explorer', 1)); assert.deepEqual(plain(s.actionOptions.units), units(0, 1, 0), 'Ticking an Explorer switches to the Explorer team');
  assert(s.reachable.includes('3,0'));
  assert(r.setMoveUnits('fleet', 2)); assert.deepEqual(plain(s.actionOptions.units), units(0, 0, 2), 'Ticking a Fleet switches back to combat ships');
  r.humanSelectHex('2,0');
  assert.deepEqual(plain(s.fleets['0,0'][0]), units(1, 1, 0), 'Settler and Explorer stay');
  assert.equal(s.fleets['2,0'][0].fleet, 2); assert.equal(s.activePlayer, 1);
  record.push('human-flow');
}

// 32.37 stays the exact archive: whole-group moves only.
{
  const g = game('crates/galactic-reach/rules/v32-'); g.p.hand = [{ key: 'move', id: 'm' }];
  g.s.fleets = { '0,0': { 0: units(1, 0, 2) } };
  assert.equal(g.a().rulesVersion, 'galactic-reach/32.37');
  const legal = moves(g, '0,0');
  assert(legal.every(x => !('units' in x)), '32.37 lists no unit choices');
  assert.equal(farthest(legal), 1, '32.37 moves the whole group at Settler speed');
  record.push('archive');
}

console.log(`Split Moves: ${record.join(', ')} passed.`);
