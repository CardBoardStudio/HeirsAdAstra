// 31.36 Capacity Cards: the market, military deck, card effects, Prestige target and rivals.
// Rules: rulebook #capacity-cards, #buy, #military-deck, #cards, #victory-target, #rival-cards.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const app = read('prototypes/galactic-reach/app.js'), adapterSource = read('prototypes/galactic-reach/adapter.js');
const rng = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);

function game(options = {}) {
  const c = vm.createContext({});
  vm.runInContext(adapterSource + app.replace('      clone, deckContents,', '      runAiBuy, runAiOperation, aiTargetCard, aiBuyValue, resolveCardEffect, clone, deckContents,'), c);
  let e; const factory = c.createGalacticAdapter; c.createGalacticAdapter = x => { e = x; return factory(x); };
  c.createGalacticReach({ headless: true, random: rng(31), ...options });
  return { e, s: e.state, p: e.state.players[0], adapter: () => factory(e) };
}
function act(g, seat, type, match = () => true) {
  const a = g.adapter(), action = a.legalActions(seat).find(x => x.type === type && match(x));
  assert(action, `Expected a legal ${type}`); a.applyAction(seat, action); return action;
}
const big = p => { p.resourceLimits = { matter: 30, energy: 30, biomass: 30, data: 30 }; p.resources = { matter: 20, energy: 20, biomass: 20, data: 20 }; };

// Catalog: 36 designs with stable ids, every one priced above the starting limit of 4.
const catalog = vm.runInContext(app + ';createGalacticReach({catalog:true})', vm.createContext({}));
const cards = { ...catalog.ADVANCED_CARDS, ...catalog.MARKET_MILITARY };
const codes = Object.values(cards).map(c => c.code);
assert.equal(Object.keys(catalog.ADVANCED_CARDS).length, 26); assert.equal(Object.keys(catalog.MARKET_MILITARY).length, 10);
assert.equal(new Set(codes).size, 36, 'Card ids are unique');
assert.deepEqual(codes.filter(c => c[0] === 'N').sort(), Array.from({ length: 26 }, (_, i) => `N${String(i + 1).padStart(2, '0')}`));
assert.deepEqual(codes.filter(c => c[0] === 'M').sort(), Array.from({ length: 10 }, (_, i) => `M${String(i + 1).padStart(2, '0')}`));
for (const [key, def] of Object.entries(cards)) {
  assert(Object.values(def.cost).some(n => n > catalog.STARTING_LIMIT), `${key} must need a raised limit`);
  assert.equal(!!def.military, def.code[0] === 'M');
}
const prices = Object.values(cards).map(c => Object.values(c.cost).reduce((n, x) => n + x, 0));
// 32.37 (Cheaper Cards): about 30% cheaper, from exactly 5 of one resource (one upgrade) to 14.
assert.equal(Math.min(...prices), 5, 'The cheapest cards cost exactly 5 of one resource');
assert.equal(Math.max(...prices), 14, 'Top cards stay aspirational');
assert.equal(prices.reduce((n, p) => n + p, 0), 266, 'The set costs 266 resources (31.36: 376, 29% less)');
assert.equal(catalog.rulesVersion, 'galactic-reach/33.38');

// Setup: ten face-up cards from one 72-card supply that mixes both decks; target defaults to 40.
{
  const g = game(), { s } = g;
  assert.equal(s.market.length, 10); assert.equal(s.market.length + s.advancedDeck.length, 72); assert.equal(s.victoryTarget, 40);
  const supply = [...s.market, ...s.advancedDeck].map(c => c.key);
  for (const key of Object.keys(cards)) assert.equal(supply.filter(k => k === key).length, 2, `${key} has two copies`);
  assert.equal(game({ victoryTarget: 30 }).s.victoryTarget, 30); assert.equal(game({ victoryTarget: 35 }).s.victoryTarget, 40, 'Unlisted targets fall back to 40');
  assert.equal(game({ newGameSettings: { victoryTarget: 60 } }).s.victoryTarget, 60, 'Table settings choose the target');
}
// Starting limits cannot hold any market card, so nothing is buyable until capacity rises.
{
  const g = game(), { s, p } = g; s.phase = 'buy'; s.activePlayer = 0; p.passed = true; p.resources = { matter: 4, energy: 4, biomass: 4, data: 4 };
  assert(!g.adapter().legalActions(0).some(a => a.type === 'buy'), 'No card is affordable at starting limits');
  s.market = [{ key: 'ionThrusters', id: 'ion' }];
  act(g, 0, 'increase_storage', a => a.allocation.energy === 4);
  assert.equal(p.resourceLimits.energy, 8); p.resources.energy = 5; p.resources.data = 1;
  act(g, 0, 'buy', a => a.key === 'ionThrusters');assert(p.discard.some(c => c.id === 'ion'));assert.equal(p.resources.energy, 0);
}
// Military cards join the military deck; Wonders pay Prestige; Buy cards add a purchase and a discount.
{
  const g = game(), { s, p } = g; s.phase = 'buy'; s.activePlayer = 0; p.passed = true; big(p);
  s.market = [{ key: 'novaBarrage', id: 'nova' }, { key: 'dysonLattice', id: 'dyson' }, { key: 'railBattery', id: 'rail' }];
  p.hand = [{ key: 'procurementHub', id: 'hub' }, { key: 'tradeSyndicate', id: 'syn' }];
  p.resources.energy = 25;
  act(g, 0, 'buy_effect', a => a.card === 'hub'); assert.equal(p.buyLimit, 2);
  act(g, 0, 'buy_effect', a => a.card === 'syn'); assert.deepEqual(JSON.parse(JSON.stringify(g.e.purchaseCost(p, 'dysonLattice'))), { matter: 3, energy: 7, data: 1 });
  act(g, 0, 'buy', a => a.key === 'dysonLattice');
  assert.equal(p.cardPrestige, 6); assert.equal(g.e.calculatePrestige(0), 9, 'Colony 3 + Dyson Lattice 6');
  assert.equal(p.resources.energy, 18, 'Trade Syndicate took 1 off each resource of the next purchase');
  assert.equal(p.buyDiscountEach, 0, 'The discount is used up');
  act(g, 0, 'buy', a => a.key === 'novaBarrage');
  assert(p.military.some(c => c.id === 'nova')); assert(!p.discard.some(c => c.id === 'nova'), 'Military cards never enter discard');
  assert.equal(s.market.length, 10, 'Each bought slot refills from the supply, back to ten cards');
  assert(!g.adapter().legalActions(0).some(a => a.type === 'buy'), 'Two purchases used');
}
// One-step orders: gains, draws, limits, Prestige, production, starter trash.
{
  const g = game(), { s, p, e } = g; s.activePlayer = 0; s.phase = 'operations';
  p.resourceLimits = { matter: 4, energy: 4, biomass: 4, data: 4 }; p.resources = { matter: 0, energy: 0, biomass: 0, data: 0 };
  p.hand = [{ key: 'cargoExpansion', id: 'cargo' }]; p.deck = []; p.discard = [];
  act(g, 0, 'special', a => a.card === 'cargo');
  assert.deepEqual(JSON.parse(JSON.stringify(p.resourceLimits)), { matter: 5, energy: 5, biomass: 5, data: 5 }, 'Cargo Expansion raises every limit');
  assert.equal(p.storagePurchases || 0, 0, 'Card capacity does not raise the next paid price');
  s.activePlayer = 0; p.hand = [{ key: 'ascendancyCodex', id: 'codex' }]; p.deck = [{ key: 'move', id: 'drawn' }];
  act(g, 0, 'special', a => a.card === 'codex'); assert.equal(p.cardPrestige, 2); assert(p.hand.some(c => c.id === 'drawn'));
  s.activePlayer = 0; p.hand = [{ key: 'miningCharter', id: 'mine' }];
  act(g, 0, 'special', a => a.card === 'mine'); assert.equal(p.resources.matter, 3); assert.equal(p.resources.energy, 1);
  s.activePlayer = 0; p.resources = { matter: 0, energy: 0, biomass: 0, data: 0 }; p.hand = [{ key: 'harvestCycle', id: 'harvest' }];
  act(g, 0, 'special', a => a.card === 'harvest'); assert.equal(p.resources.matter, 1, 'Harvest Cycle collects the home Colony’s production again');
  s.activePlayer = 0; p.hand = [{ key: 'commandNexus', id: 'nexus' }]; p.deck = [1, 2, 3, 4, 5].map(n => ({ key: 'move', id: `d${n}` }));
  act(g, 0, 'special', a => a.card === 'nexus'); assert.equal(p.hand.length, 4);
  assert(p.inPlay.some(c => c.id === 'nexus'), 'Used orders stay in play until cleanup');
}
// Construct cards print their discount; the build bonus follows a successful build only.
{
  const g = game(), { s, p, e } = g; s.activePlayer = 0; s.phase = 'operations';
  const site = s.clusters[0].coords[1]; p.resources = { matter: 0, energy: 0, biomass: 0, data: 0 };
  p.hand = [{ key: 'worldEngine', id: 'engine' }];
  const build = act(g, 0, 'build', a => a.card === 'engine' && a.coord === site && a.kind === 'starbase');
  assert.equal(build.discountResource, 'free'); assert.equal(s.planets[site].upgrade, 'starbase', 'World Engine builds at no cost');
  s.activePlayer = 0; p.resources = { matter: 1, energy: 0, biomass: 0, data: 0 }; p.hand = [{ key: 'orbitalFoundry', id: 'foundry' }];
  const harvest = s.clusters[0].coords[2];
  act(g, 0, 'build', a => a.card === 'foundry' && a.coord === harvest && a.kind === 'harvester');
  assert.equal(p.resources.matter, 3, 'A 1/1/1 Harvester at −1 of each costs nothing; Orbital Foundry then adds 2 Matter');
}
// 32.37 economy: a Harvester hex produces 2 (was 1); issue #41 costs and opening resources.
{
  const g = game(), { s, e } = g;
  assert.equal(e.HARVESTER_YIELD, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(e.SHIP_STATS.settler.cost)), { matter: 1, energy: 1, biomass: 1 });
  assert.deepEqual(JSON.parse(JSON.stringify(e.STRUCTURES.harvester.cost)), { matter: 1, energy: 1, data: 1 });
  for (const p of s.players) assert.deepEqual({ biomass: p.resources.biomass, data: p.resources.data }, { biomass: 1, data: 1 }, 'Every faction starts with 1 Biomass and 1 Data');
  const hex = s.clusters[0].coords[1]; Object.assign(s.planets[hex], { owner: 0, upgrade: 'harvester', occupiedBy: null });
  const type = s.planets[hex].type, before = s.players[0].resources[type];
  s.players[0].resourceLimits[type] = 20; s.phase = 'buy'; s.activePlayer = 0;
  for (const p of s.players) { p.passed = true; p.hand = []; }
  let guard = 0; while (s.round === 1 && guard++ < 20) { const a = g.adapter(); const seat = a.activeSeat(); a.applyAction(seat, a.legalActions(seat).find(x => x.type === 'finish_buy') || a.legalActions(seat)[0]); }
  assert.equal(s.round, 2);
  const view = g.adapter().observe(0);
  assert.equal(view.harvesterYield, 2); assert.equal(view.marketCosts.length, view.market.length, 'Server rivals read printed prices');
  assert(s.players[0].resources[type] >= before + 2, 'The Harvester hex produced 2 at the round start');
}
// Rivals: value, save toward and raise capacity for a target card, then buy it.
{
  const g = game(), { s, e } = g, bot = s.players[1];
  Object.assign(s.planets[s.clusters[1].coords[1]], { owner: 1, upgrade: 'starbase' });
  s.market = [{ key: 'ascendancyCodex', id: 'codex' }, { key: 'ionThrusters', id: 'ion' }];
  assert(e.aiBuyValue(1, 'ascendancyCodex') > e.aiBuyValue(1, 'ionThrusters'), 'Printed Prestige makes a card worth more');
  assert.equal(e.aiTargetCard(1).id, 'codex');
  s.market = [{ key: 'foldSpaceGate', id: 'gate' }];
  Object.assign(bot, { hand: [], deck: [], discard: [], inPlay: [], passed: true, resources: { matter: 4, energy: 4, biomass: 4, data: 4 } });
  s.phase = 'buy'; s.activePlayer = 1; e.runAiBuy();
  assert(bot.storagePurchases >= 1 && bot.resourceLimits.energy > 4, 'The rival raised its Energy limit toward Fold-Space Gate');
}
// A full game of four browser rivals reaches the 40-point target with the new cards.
{
  const c = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
  const guard = "if (state.pendingCombat || state.phase !== 'operations' || state.activePlayer === ME || state.winner !== null) return;";
  assert(app.includes(guard), 'The rival guard this simulation lifts must still exist');
  let src = app.replace(guard, "if (state.pendingCombat || state.phase !== 'operations' || state.winner !== null) return;");
  src = src.replace(/\n  if \(headless\) \{[\s\S]*$/, `\n  state=newState();state.players[0].strategy='economy';fillMarket();beginRound();
  return {state:()=>state,step(){ if(state.winner!==null)return; if(state.pendingCombat){const seat=combatActor();applyCombatAction(seat,chooseCombatAction(combatView(seat),combatActions(seat)));return;}
    if(state.phase==='operations')runAiOperation();else if(state.phase==='buy')runAiBuy(); }, prestige:id=>calculatePrestige(id)};
}`);
  vm.runInContext(src, c);
  const sim = c.createGalacticReach({ headless: true, random: rng(20261114) });
  let steps = 0; while (sim.state().winner === null && steps++ < 20000) sim.step();
  const st = sim.state();
  assert.notEqual(st.winner, null, 'Rivals finish a 40-point game');
  assert(sim.prestige(st.winner) >= 40); assert(st.round > 10, 'A 40-point game takes many rounds');
  assert(st.players.some(p => p.cardsPurchased >= 3), 'Rivals buy market cards'); assert(st.players.every(p => (p.storagePurchases || 0) >= 1), 'Every rival raises its limits');
}
console.log('Capacity Cards: 36 stable ids priced above starting limits, ten-card mixed market, military deck purchases, Buy cards and Wonders, one-step orders, printed Construct discounts, rival capacity targeting and a full 40-point rival game passed.');
