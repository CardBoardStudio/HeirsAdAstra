// Rules #buy (Decommission): during your Buy turn you may trash, for 3 of one resource each,
// any card that was in your hand, discard or in play when that Buy turn began and is still
// there. Cards gained, drawn, explicitly discarded or put in play during this Buy are not.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', 'prototypes/galactic-reach', file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function game(seed = 1729) {
  const source = read('app.js')
    .replace('      clone, deckContents,', '      runAiOperation, runAiBuy, startBuyPhase, clone, deckContents,')
    // Let every seat play as a rival, as the balance simulations do.
    .replace("if (state.pendingCombat || state.phase !== 'operations' || state.activePlayer === ME || state.winner !== null) return;",
      "if (state.pendingCombat || state.phase !== 'operations' || state.winner !== null) return;");
  const context = vm.createContext({ setTimeout: () => 0, clearTimeout: () => {} });
  vm.runInContext(read('adapter.js') + source, context);
  let e;
  const factory = context.createGalacticAdapter;
  context.createGalacticAdapter = port => { e = port; return factory(port); };
  context.createGalacticReach({ headless: true, random: () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32) });
  return { e, s: e.state, adapter: () => factory(e) };
}
const card = (key, id, extra = {}) => ({ key, id, starter: false, upgraded: false, ...extra });
const all = p => [...p.hand, ...p.deck, ...p.discard, ...p.inPlay];
const trashable = g => new Set(g.adapter().legalActions(0).filter(a => a.type === 'decommission').map(a => a.card));

// A starter or bought card left in hand when Buy begins can be trashed from hand.
{
  const g = game(), { s } = g, p = s.players[0];
  Object.assign(s, { phase: 'operations', activePlayer: 0 });
  Object.assign(p, {
    hand: [card('move', 'hand-starter', { starter: true }), card('monumentOfAccord', 'hand-wonder'), card('procurementHub', 'hand-buy-effect'), card('construct', 'hand-converted', { starter: true })],
    deck: [], discard: [card('construct', 'old-discard', { starter: true })], inPlay: [card('move', 'old-play', { starter: true })],
    resources: { matter: 9, energy: 3, biomass: 0, data: 0 }, resourceLimits: { matter: 20, energy: 20, biomass: 20, data: 20 },
  });
  // Convert before passing: that card is in play when Buy begins, so it stays eligible.
  g.adapter().applyAction(0, g.adapter().legalActions(0).find(a => a.type === 'resource' && a.card === 'hand-converted'));
  g.adapter().applyAction(0, { type: 'pass' });
  assert.equal(s.phase, 'buy');
  assert.deepEqual(plain(p.buyStartHandIds).sort(), ['hand-buy-effect', 'hand-starter', 'hand-wonder']);
  assert.deepEqual([...trashable(g)].sort(), ['hand-buy-effect', 'hand-converted', 'hand-starter', 'hand-wonder', 'old-discard', 'old-play']);
  const options = plain(g.adapter().legalActions(0).filter(a => a.type === 'decommission' && a.card === 'hand-starter').map(a => a.resource)).sort();
  assert.deepEqual(options, ['energy', 'matter'], 'pay 3 of any one resource you hold 3 of');

  const before = p.resources.matter;
  g.adapter().applyAction(0, { type: 'decommission', card: 'hand-wonder', resource: 'matter' });
  assert(!all(p).some(c => c.id === 'hand-wonder'), 'the hand card is gone for good');
  assert.equal(p.resources.matter, before - 3, 'same price as any other trash');

  // A hand card used in this Buy turn moves to play and is no longer eligible.
  g.adapter().applyAction(0, { type: 'buy_effect', card: 'hand-buy-effect' });
  assert(p.inPlay.some(c => c.id === 'hand-buy-effect'));
  assert(!trashable(g).has('hand-buy-effect'), 'a card put in play during this Buy cannot be trashed');
  assert.equal(g.e.decommission(0, 'hand-buy-effect', 'matter'), false);
  assert(trashable(g).has('hand-starter'), 'other hand cards stay eligible');
}

// Cards that reach your hand during Buy, and newly bought cards, stay ineligible.
{
  const g = game(), { e, s } = g, p = s.players[0];
  Object.assign(s, { phase: 'operations', activePlayer: 0 });
  Object.assign(p, { hand: [card('move', 'kept')], deck: [], discard: [], inPlay: [], resources: { matter: 20, energy: 20, biomass: 20, data: 20 }, resourceLimits: { matter: 40, energy: 40, biomass: 40, data: 40 } });
  g.adapter().applyAction(0, { type: 'pass' });
  p.hand.push(card('construct', 'drawn-in-buy'));
  const bought = s.market[0].id;
  assert(e.buyCard(0, 'market', 0));
  const now = trashable(g);
  assert(now.has('kept'));
  assert(!now.has('drawn-in-buy'), 'a card drawn during this Buy was not in hand when it began');
  assert(!now.has(bought), 'a newly bought card cannot be trashed');
  assert.equal(e.decommission(0, 'drawn-in-buy', 'matter'), false);
}

// Another seat's Buy and Operations never offer hand trash; nor does a Buy you have not begun.
{
  const g = game(), { s } = g, p = s.players[0];
  Object.assign(s, { phase: 'operations', activePlayer: 0 });
  p.resources = { matter: 9, energy: 9, biomass: 9, data: 9 };
  assert.equal(trashable(g).size, 0, 'no trashing during Operations');
  assert.equal(g.e.decommission(0, p.hand[0].id, 'matter'), false);
}

// Saves made before hand trashing have no buyStartHandIds: their hands simply are not eligible.
{
  const g = game(), { s } = g, p = s.players[0];
  Object.assign(s, { phase: 'buy', activePlayer: 0 });
  p.resources = { matter: 9, energy: 9, biomass: 9, data: 9 };
  delete p.buyStartHandIds;
  p.buyStartDiscardIds = []; p.buyStartInPlayIds = [];
  assert.equal(trashable(g).size, 0);
}

// Browser rivals weigh hand cards with the same priorities as discard and in-play cards.
{
  const g = game(), { e, s } = g, bot = s.players[1];
  s.market = [];
  Object.assign(s, { phase: 'buy', activePlayer: 1 });
  const moves = [1, 2, 3, 4, 5, 6, 7, 8].map(n => card('move', `m${n}`, { starter: true }));
  Object.assign(bot, {
    hand: [moves[0], card('construct', 'hand-construct', { starter: true })], deck: moves.slice(1), discard: [], inPlay: [],
    resources: { matter: 12, energy: 12, biomass: 12, data: 12 }, resourceLimits: { matter: 20, energy: 20, biomass: 20, data: 20 }, passed: true,
  });
  e.startBuyPhase();
  assert.equal(s.activePlayer, 1);
  e.runAiBuy();
  assert(!all(bot).some(c => c.id === 'm1'), 'a surplus Move in hand is trashed');
  assert(all(bot).some(c => c.id === 'hand-construct'), 'a Construct the rival still needs is kept');
}

// AI-vs-AI: rival-only games still finish.
for (const seed of [20261115, 20261116, 20261117]) {
  const { e, s } = game(seed);
  let steps = 0;
  while (s.winner === null && steps++ < 4000) {
    if (s.pendingCombat) { const seat = e.combatActor(); e.applyCombatAction(seat, e.combatActions(seat)[0]); continue; }
    if (s.phase === 'operations') e.runAiOperation();
    else if (s.phase === 'buy') e.runAiBuy();
    else throw new Error(`Unexpected phase ${s.phase}`);
  }
  assert.notEqual(s.winner, null, `seed ${seed} finishes`);
}

console.log('Trash from hand: hand cards at Buy start are eligible at 3 of one resource; cards used, drawn or bought this Buy are not; old saves, browser rivals and AI-vs-AI completion passed.');
