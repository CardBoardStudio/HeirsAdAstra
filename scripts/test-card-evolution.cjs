// Card-evolution study tooling (scripts/card-evolution). The study must not change the
// rules it measures: the engine seam is behavior-neutral, generated cards use only fields
// the engine resolves (rules #cards, #market, #combat), and scoring is what the README says.
const assert = require('node:assert/strict');
const engine = require('./card-evolution/engine.cjs');
const gen = require('./card-evolution/generator.cjs');
const scoring = require('./card-evolution/scoring.cjs');
const run = require('./card-evolution/run.cjs');

const sources = engine.loadSources();
const catalog = engine.currentCatalog(sources);
const printedPool = { normal: catalog.normal, military: catalog.military, relics: catalog.relics };
const lineup = ['military', 'economy', 'expansion', 'economy'];
const short = (pool, maxRound = 7, seed = 4242) => engine.playGame(engine.engineFactory(sources), { seed, index: 0, profiles: lineup, victoryTarget: 40, maxRound, maxSteps: 6000, pool });

// The printed catalog is read from the engine, not copied.
assert.equal(Object.keys(catalog.normal).length + Object.keys(catalog.military).length, 31, 'market designs');
assert.equal(Object.keys(catalog.relics).length, 15, 'relics');

// Injecting the printed pool plays exactly the game the unpatched catalog plays.
{
  const injected = short(printedPool), native = short(undefined);
  assert.deepEqual([injected.round, injected.steps, injected.buys, injected.relicPicks], [native.round, native.steps, native.buys, native.relicPicks], 'the pool seam is behavior-neutral');
  const {readArchive}=require('./lib/simulation-archive.cjs');
  const archived=readArchive(injected.archive);
  assert.equal(archived.state.round,injected.round);assert(archived.records.some(r=>r.type==='event'&&r.event.type==='round-end'));
  assert(archived.manifest.sourceHashes['card-pool.json'],'the full generated/printed pool is frozen');
  assert(Object.values(injected.offers[0]).some(n => n > 0), 'offers are recorded');
}

// Generated cards: deterministic, priced inside their tier, printed-market cost shape, readable text.
const allowed = new Set(['code', 'name', 'kind', 'accent', 'cost', 'order', 'tag', 'text', 'origin', 'power', 'lore', 'affinity',
  'range', 'pathfinder', 'assault', 'buildDiscount', 'secondBuild', 'buildGain', 'colonyCost', 'keepSettler', 'colonyPrestige',
  'effect', 'buyEffect', 'gainPrestige', 'military', 'attack', 'shield', 'pierce', 'victoryPrestige', 'loot', 'reaction', 'strength', 'requiresFleet']);
function batch(seed) {
  let i = 0; const ctx = { rng: engine.lcg(seed), gen: 1, index: () => ++i, usedNames: new Set() }, out = [];
  for (const role of Object.keys(gen.MARKET_ROLES)) for (const tier of Object.keys(gen.TIERS)) { const c = gen.generateMarketCard(ctx, role, tier); if (c) out.push({ c, tier }); }
  for (const a of Object.keys(gen.RELIC_SHAPES)) for (let n = 0; n < 4; n++) out.push({ c: gen.generateRelic(ctx, a), tier: null });
  return out;
}
{
  const a = batch(7), b = batch(7);
  assert.deepEqual(a.map(x => x.c.card), b.map(x => x.c.card), 'same seed, same cards');
  assert(a.length > 30);
  const names = new Set();
  for (const { c, tier } of a) {
    const card = c.card;
    for (const field of Object.keys(card)) assert(allowed.has(field), `${card.name}: unknown field ${field}`);
    for (const field of Object.keys(card.effect || {})) assert(['draw', 'trashStarters', 'limits', 'trashSelf', 'produce', 'gain', 'prestige'].includes(field), `${card.name}: unknown effect ${field}`);
    assert(card.text && !/undefined|NaN|null/.test(card.text), `${card.name}: text "${card.text}"`);
    assert(!names.has(card.name)); names.add(card.name);
    if (!card.military) assert.equal(card.tag, c.key, 'move/construct/colonize fields are looked up by tag');
    if (c.pool === 'market') {
      const price = gen.priceOf(card.cost), [lo, hi] = gen.TIERS[tier], most = Math.max(...Object.values(card.cost));
      assert(price >= lo && price <= hi, `${card.name}: price ${price} outside ${tier}`);
      assert(most >= 5 || (price <= 4 && most <= 3), `${card.name}: ${JSON.stringify(card.cost)} breaks the printed cost shape`);
    } else {
      assert(card.power >= gen.RELIC_POWER[0] && card.power <= gen.RELIC_POWER[1]);
    }
  }
}

// The power model reproduces printed normal-deck prices within 1.
for (const card of Object.values(catalog.normal)) assert(Math.abs(gen.power(card) - gen.priceOf(card.cost)) <= 1, `${card.name}: model ${gen.power(card)} vs ${gen.priceOf(card.cost)}`);

// A generated pool fills to its role and tier quotas and plays.
{
  const cfg = run.loadConfig([]);
  const pool = run.refill(cfg, 1, [], {}, engine.lcg(99), new Set());
  const market = pool.filter(e => e.pool === 'market'), relics = pool.filter(e => e.pool === 'relic');
  assert.equal(market.length, cfg.pool.market.size); assert.equal(relics.length, cfg.pool.relics.size);
  for (const [role, n] of Object.entries(cfg.pool.market.roles)) assert.equal(market.filter(e => e.role === role).length, n, role);
  for (const [tier, n] of Object.entries(cfg.pool.market.tiers)) assert(Math.abs(market.filter(e => run.tierOfEntry(e) === tier).length - n) <= 2, tier);
  const g = short(run.toEnginePool(pool), 22);
  const keys = new Set(pool.map(e => e.key));
  assert(Object.keys(g.offers[0]).every(k => keys.has(k)), 'only generated cards are offered');
  assert(g.buys.some(b => Object.keys(b).length), 'rivals buy generated cards');
}

// Scoring on a hand-made record: pick rate, lift and the dominance flag.
{
  const seat = (o = {}) => o;
  const game = (winner, offers, buys) => ({ completed: true, winner, round: 20, offers, buys, plays: [{}, {}, {}, {}], firstBuyRound: [{}, {}, {}, {}], relicOffers: [{}, {}, {}, {}], relicPicks: [{}, {}, {}, {}] });
  const entries = [{ key: 'strong', role: 'Deckcraft', pool: 'market', card: {} }, { key: 'weak', role: 'Deckcraft', pool: 'market', card: {} }];
  // 'strong' is bought by seat 0 every game and seat 0 always wins; 'weak' is offered to all, bought by seat 1.
  const games = Array.from({ length: 40 }, () => game(0, [seat({ strong: 2, weak: 2 }), seat({ strong: 2, weak: 2 }), seat({ weak: 2 }), seat({ weak: 2 })], [seat({ strong: 1 }), seat({ weak: 1 }), seat(), seat()]));
  const stats = scoring.cardStats(games, 'market', entries);
  const cfg = run.loadConfig([]);
  scoring.score(stats, entries, cfg);
  assert.equal(stats.strong.pickRate, 40 / 160); assert.equal(stats.weak.pickRate, 40 / 320);
  assert.equal(stats.strong.buyerWinRate, 1); assert.equal(stats.weak.buyerWinRate, 0);
  assert(stats.strong.lift > 0.8 && stats.weak.lift < 0);
  assert(stats.strong.dominant && !stats.weak.dominant, 'near-always-winning card is flagged');
  const { kept, dropped } = scoring.selectSurvivors(entries, stats, 2, { groupOf: e => e.role, quota: () => 2 });
  assert.deepEqual(kept.map(e => e.key), ['weak'], 'a dominant card is never kept as best');
  assert.match(dropped[0].reason, /dominant/);
}

console.log('Card-evolution tooling: neutral engine seam, valid generated cards, quotas, scoring and dominance checks passed.');
