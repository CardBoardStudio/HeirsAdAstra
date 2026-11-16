// Rules #setup and #round: the opening hand is dealt at setup, and each later hand is
// drawn at Cleanup & draw, after the victory check, only while the game continues.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', 'prototypes/galactic-reach', file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function game(seed = 1729) {
  const source = read('app.js')
    .replace('      clone, deckContents,', '      cleanupRound, phaseLabel, runAiOperation, runAiBuy, clone, deckContents,')
    // Let every seat play as a rival, as the balance simulations do.
    .replace("if (state.pendingCombat || state.phase !== 'operations' || state.activePlayer === ME || state.winner !== null) return;",
      "if (state.pendingCombat || state.phase !== 'operations' || state.winner !== null) return;");
  const context = vm.createContext({ setTimeout: () => 0, clearTimeout: () => {} });
  vm.runInContext(read('adapter.js') + source, context);
  let e;
  const factory = context.createGalacticAdapter;
  context.createGalacticAdapter = port => { e = port; return factory(port); };
  const a = context.createGalacticReach({ headless: true, random: () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32) });
  return { e, a, s: e.state };
}
const card = (key, id) => ({ key, id, starter: false, upgraded: false });
const ids = cards => plain(cards.map(c => c.id)).sort();

// Setup: each faction holds its opening five before Round 1 Production; the sixth starter waits.
{
  const { s } = game();
  assert.equal(s.round, 1);
  assert.equal(s.phase, 'operations');
  s.players.forEach(p => {
    assert.equal(p.hand.length, 5, 'opening hand of five');
    assert.equal(p.deck.length, 1, 'the sixth starter stays in the deck');
    assert.equal(p.discard.length + p.inPlay.length, 0);
  });
  const log = [...s.log].reverse();
  const opening = log.findIndex(line => line.includes('drew its opening five cards'));
  const production = log.findIndex(line => line.includes('Controlled planets produced'));
  assert(opening >= 0 && production > opening, 'the opening draw is logged before Round 1 Production');
  assert(!log.some(line => line.includes('drew five cards')), 'Production no longer draws');
}

// Cleanup & draw: discard hand and in play, check victory, then draw the next five.
{
  const { e, s } = game();
  const p = s.players[0];
  p.hand = [card('move', 'kept-move')];
  p.inPlay = [card('construct', 'used-construct')];
  p.deck = [card('move', 'last-deck-card')];
  p.discard = [card('signalRelay', 'bought-this-round'), ...[1, 2, 3, 4].map(n => card('construct', `old-${n}`))];
  const pool = ids([...p.hand, ...p.inPlay, ...p.deck, ...p.discard]);
  e.cleanupRound();
  assert.equal(s.winner, null);
  assert.equal(s.round, 2, 'the next round begins');
  assert.equal(s.phase, 'operations');
  assert.equal(p.hand.length, 5);
  assert(p.hand.some(c => c.id === 'last-deck-card'), 'the old deck is drawn before the reshuffle');
  assert.deepEqual(ids([...p.hand, ...p.deck, ...p.discard, ...p.inPlay]), pool, 'no card is lost or duplicated');
  assert.equal(p.inPlay.length, 0);
  assert.equal(p.discard.length, 0, 'the discard (including this round’s purchase) reshuffled into the deck');
  s.players.slice(1).forEach(other => assert.equal(other.hand.length, 5, 'every faction draws at cleanup'));
  const log = [...s.log].reverse();
  const drew = log.findIndex(line => line === 'R1 · Every faction drew its next five cards.');
  const ended = log.findIndex(line => line.endsWith('Round 1 ended. The first-player marker rotated.'));
  const produced = log.findIndex((line, index) => index > ended && line.startsWith('R2 · Controlled planets produced'));
  assert(drew >= 0 && ended > drew && produced > ended, 'draw belongs to Round 1 cleanup, before Round 2 Production');
  assert.equal(e.phaseLabel('cleanup'), 'Cleanup & draw');
  assert.equal(e.phaseLabel('operations'), 'Operations');
}

// Victory: the game ends at cleanup with no pointless draw.
{
  const { e, s } = game();
  s.players[2].cardPrestige = e.victoryTarget();
  e.cleanupRound();
  assert.equal(s.winner, 2);
  assert.equal(s.round, 1);
  s.players.forEach(p => assert.equal(p.hand.length, 0, 'no hand is drawn after the game ends'));
  assert(!s.log.some(line => line.includes('drew its next five cards')));
  assert.equal(e.phaseLabel('cleanup'), 'Cleanup', 'a finished game shows plain Cleanup');
}

// Hidden information: the next hand is drawn privately; other seats see only its size.
{
  const { e, a, s } = game();
  e.cleanupRound();
  const mine = plain(a.observe(0)), theirs = plain(a.observe(1));
  assert.deepEqual(ids(mine.players[0].hand), ids(s.players[0].hand));
  assert.equal(theirs.players[0].hand, undefined, 'another seat never receives the new hand');
  assert.equal(theirs.players[0].handCount, 5);
}

// AI-vs-AI: rival-only games still finish, and the last cleanup draws nothing.
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
  s.players.forEach(p => assert.equal(p.hand.length + p.inPlay.length, 0, 'the final cleanup leaves every hand empty'));
}

console.log('Cleanup & draw: opening hand, cleanup reshuffle and draw, no draw after victory, private hands, and AI-vs-AI completion passed.');
