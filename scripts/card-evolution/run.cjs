#!/usr/bin/env node
// Card-evolution study: generate a market + relic pool, play N all-rival games per
// generation, score every card, keep the best half of each pool and refill the rest with
// new generated cards. Writes a dated folder with per-generation logs and report.md.
//
//   node scripts/card-evolution/run.cjs [--config file.json] [--rules <git ref>]
//        [--generations N] [--games N] [--baseline-games N] [--workers N] [--out dir] [--name label]
//
// See scripts/card-evolution/README.md. Nothing here changes the shipped card set.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const engine = require('./engine.cjs');
const gen = require('./generator.cjs');
const scoring = require('./scoring.cjs');
const { writeReport } = require('./report.cjs');

const PROFILES = ['military', 'economy', 'expansion'];

if (!isMainThread) {
  // Worker: one engine context per worker. app.js keeps all game state inside
  // createGalacticReach, so games stay independent; a fresh vm context per game crashed
  // Node (SIGSEGV) after ~100 games.
  const factory = engine.engineFactory(workerData.sources);
  parentPort.on('message', task => {
    try { parentPort.postMessage({ game: engine.playGame(factory, task) }); }
    catch (error) { parentPort.postMessage({ error: error.stack, seed: task.seed }); }
  });
  return;
}

// ---------- config ----------
function deepMerge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' ? deepMerge(base[k], v) : v;
  return out;
}
function loadConfig(argv) {
  const arg = (name, fallback) => { const at = argv.indexOf('--' + name); return at < 0 ? fallback : argv[at + 1]; };
  let cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'default.config.json'), 'utf8'));
  const file = arg('config');
  if (file) cfg = deepMerge(cfg, JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')));
  const num = (name, key) => { const v = arg(name); if (v !== undefined) cfg[key] = Number(v); };
  if (arg('rules')) cfg.rules = { ...cfg.rules, ref: arg('rules') };
  if (arg('name')) cfg.name = arg('name');
  if (arg('out')) cfg.out = arg('out');
  num('generations', 'generations'); num('games', 'gamesPerGeneration'); num('baseline-games', 'baselineGames'); num('workers', 'workers'); num('seed', 'seed');
  if (!cfg.workers) cfg.workers = Math.max(1, (os.availableParallelism?.() || os.cpus().length) - 2);
  return cfg;
}

function outputDir(cfg) {
  const stamp = new Date().toISOString().slice(0, 10);
  const root = path.resolve(engine.ROOT, cfg.out);
  for (let n = 1; ; n++) {
    const dir = path.join(root, `${stamp}-${cfg.name}${n > 1 ? `-${n}` : ''}`);
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); return dir; }
  }
}

// ---------- pools ----------
const tierOfEntry = e => (e.pool === 'market' ? gen.tierOf(gen.priceOf(e.card.cost)) : null);
const groupOf = e => (e.pool === 'relic' ? e.card.affinity : e.role);
function toEnginePool(entries) {
  const pool = { normal: {}, military: {}, relics: {} };
  for (const e of entries) (e.pool === 'relic' ? pool.relics : e.card.military ? pool.military : pool.normal)[e.key] = e.card;
  return pool;
}
function printedEntries(catalog) {
  const entries = [];
  for (const [key, card] of Object.entries({ ...catalog.normal, ...catalog.military })) entries.push({ key, card: { ...card, origin: { generation: 0, source: 'printed' } }, role: gen.roleOfPrinted(card), pool: 'market' });
  for (const [key, card] of Object.entries(catalog.relics)) entries.push({ key, card: { ...card, origin: { generation: 0, source: 'printed' } }, role: 'Relic', pool: 'relic' });
  return entries;
}

// Fill a pool to its quotas: mutations of top survivors first, then fresh cards for the
// role (market) or affinity (relics) and price tier furthest below target.
function refill(cfg, generation, survivors, statsByKey, rng, usedNames) {
  const pool = [...survivors];
  let counter = 0;
  const ctx = { rng, gen: generation, index: () => ++counter, usedNames, markup: cfg.generator.markup };
  const count = (list, fn, v) => list.filter(e => fn(e) === v).length;
  const marketQ = cfg.pool.market, relicQ = cfg.pool.relics;
  const deficit = (poolName, group) => poolName === 'market' ? (marketQ.roles[group] || 0) - count(pool.filter(e => e.pool === 'market'), groupOf, group)
    : (relicQ.affinities[group] || 0) - count(pool.filter(e => e.pool === 'relic'), groupOf, group);
  const sizeOf = name => pool.filter(e => e.pool === name).length;
  const target = { market: marketQ.size, relic: relicQ.size };
  for (const poolName of ['market', 'relic']) {
    const parents = survivors.filter(e => e.pool === poolName).sort((a, b) => (statsByKey[b.key]?.score || 0) - (statsByKey[a.key]?.score || 0));
    const mutations = Math.round((target[poolName] - sizeOf(poolName)) * cfg.selection.mutationShare);
    for (let n = 0, made = 0; parents.length && made < mutations && n < mutations * 4; n++) {
      const parent = parents[n % parents.length];
      if (deficit(poolName, groupOf(parent)) <= 0) continue;
      const child = gen.mutate(ctx, parent);
      if (child) { pool.push(child); made++; }
    }
    let guard = 0;
    while (sizeOf(poolName) < target[poolName] && guard++ < 500) {
      const groups = Object.keys(poolName === 'market' ? marketQ.roles : relicQ.affinities).map(g => [g, deficit(poolName, g) + rng() * 0.5]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
      let made = null;
      for (const group of groups) {
        if (poolName === 'relic') { made = gen.generateRelic(ctx, group); }
        else {
          const tiers = Object.keys(marketQ.tiers).map(t => [t, marketQ.tiers[t] - count(pool.filter(e => e.pool === 'market'), tierOfEntry, t) + rng() * 0.5]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
          for (const tier of tiers) { made = gen.generateMarketCard(ctx, group, tier); if (made) break; }
        }
        if (made) break;
      }
      if (!made) throw new Error(`could not generate a ${poolName} card`);
      pool.push(made);
    }
  }
  return pool;
}

// ---------- games ----------
function tasksFor(cfg, entries, games) {
  const pool = toEnginePool(entries);
  return Array.from({ length: games }, (_, i) => {
    const base = [PROFILES[i % 3], ...PROFILES], rotation = Math.floor(i / 3) % 4;
    return { studyConfig: cfg, index: i, seed: (cfg.seed + i * 7919) >>> 0, profiles: base.map((_, s) => base[(s + rotation) % 4]), victoryTarget: cfg.victoryTarget, maxRound: cfg.maxRound, maxSteps: cfg.maxSteps, pool };
  });
}
// Plays every task on the pool. A worker that dies (crash, OOM) is replaced and its game
// re-queued; a game that throws twice stops the run.
function runGames(pool, tasks, label, logFile) {
  return new Promise((resolve, reject) => {
    const games = new Array(tasks.length), queue = [...tasks.keys()], inflight = new Map(), retries = {};
    let done = 0, failed = false;
    const started = Date.now();
    const finish = error => { if (failed) return; failed = Boolean(error); pool.slots.forEach(slot => slot.detach()); error ? reject(error) : resolve({ games, seconds: (Date.now() - started) / 1000, restarts: pool.restarts }); };
    const feed = slot => { if (!queue.length || failed) return; const i = queue.shift(); inflight.set(slot, i); slot.worker.postMessage({...tasks[i],studyLabel:label,resultsDirectory:path.dirname(logFile)}); };
    const requeue = (slot, why) => {
      const i = inflight.get(slot); inflight.delete(slot);
      if (i === undefined) return;
      retries[i] = (retries[i] || 0) + 1;
      if (retries[i] > 2) return finish(new Error(`game seed ${tasks[i].seed} failed ${retries[i]} times: ${why}`));
      process.stdout.write(`  ${label}: worker lost (${why}); replaying seed ${tasks[i].seed}\n`);
      queue.unshift(i);
    };
    pool.slots.forEach(slot => slot.attach({
      message: message => {
        if (message.error) { requeue(slot, message.error.split('\n')[0]); feed(slot); return; }
        inflight.delete(slot);
        games[message.game.index] = message.game; done++;
        fs.appendFileSync(logFile, JSON.stringify(message.game) + '\n');
        if (done % 20 === 0 || done === tasks.length) process.stdout.write(`  ${label}: ${done}/${tasks.length} games, ${((Date.now() - started) / 1000).toFixed(0)}s\n`);
        if (done === tasks.length) finish(); else feed(slot);
      },
      lost: why => { requeue(slot, why); pool.respawn(slot); feed(slot); },
    }));
    pool.slots.forEach(feed);
  });
}

function workerPool(size, sources) {
  const pool = { slots: [], restarts: 0 };
  const spawn = slot => {
    const worker = new Worker(__filename, { workerData: { sources } });
    slot.worker = worker;
    worker.on('message', m => slot.handlers?.message(m));
    worker.on('error', e => { if (slot.worker === worker) slot.handlers?.lost(e.message); });
    worker.on('exit', code => { if (slot.worker === worker && !pool.closing) slot.handlers?.lost(`exit ${code}`); });
  };
  for (let n = 0; n < size; n++) {
    const slot = { attach(h) { this.handlers = h; }, detach() { this.handlers = null; } };
    spawn(slot); pool.slots.push(slot);
  }
  pool.respawn = slot => { pool.restarts++; const old = slot.worker; slot.worker = null; old.terminate().catch(() => {}); spawn(slot); };
  pool.close = () => { pool.closing = true; return Promise.all(pool.slots.map(s => s.worker.terminate())); };
  return pool;
}

// ---------- evaluation ----------
function evaluate(cfg, entries, games) {
  const market = entries.filter(e => e.pool === 'market'), relics = entries.filter(e => e.pool === 'relic');
  const marketStats = scoring.cardStats(games, 'market', market), relicStats = scoring.cardStats(games, 'relic', relics);
  const marketPool = scoring.score(marketStats, market, cfg), relicPool = scoring.score(relicStats, relics, cfg);
  const done = games.filter(g => g.completed);
  const buysByTier = { expensive: 0, medium: 0, cheap: 0 };
  for (const e of market) buysByTier[tierOfEntry(e)] += marketStats[e.key].buys;
  return {
    stats: { ...marketStats, ...relicStats },
    summary: {
      games: games.length, completed: done.length, stalled: games.filter(g => g.stalled).length,
      meanRounds: scoring.mean(done.map(g => g.round)), medianRounds: scoring.median(done.map(g => g.round)),
      buysPerGame: scoring.mean(games.map(g => g.players.reduce((n, p) => n + p.cardsPurchased, 0))),
      relicsPerGame: scoring.mean(games.map(g => g.players.reduce((n, p) => n + p.relics, 0))),
      winsByProfile: Object.fromEntries(PROFILES.map(p => [p, done.filter(g => g.profiles[g.winner] === p).length])),
      marketPick: marketPool.poolPick, marketMedianLift: marketPool.poolLift, relicPick: relicPool.poolPick, relicMedianLift: relicPool.poolLift,
      buysByTier,
      dominant: entries.filter(e => (marketStats[e.key] || relicStats[e.key]).dominant).map(e => e.key),
    },
  };
}

const csvCell = v => v === null || v === undefined ? '' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(4)) : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
const CSV_COLUMNS = ['generation', 'pool', 'key', 'code', 'name', 'role', 'tier', 'cost', 'price', 'power', 'source', 'parent', 'offers', 'buys', 'pickRate', 'buyerSeats', 'buyerWinRate', 'nonBuyerSeats', 'nonBuyerWinRate', 'lift', 'adjLift', 'score', 'dominant', 'autoPick', 'playsPerCopy', 'meanFirstBuyRound', 'kept', 'text'];
function csvRows(generation, entries, stats, keptKeys) {
  return entries.map(e => {
    const s = stats[e.key], c = e.card;
    const row = { generation, pool: e.pool, key: e.key, code: c.code || '', name: c.name, role: groupOf(e), tier: tierOfEntry(e) || '', cost: c.cost ? Object.entries(c.cost).map(([r, n]) => `${n} ${r}`).join(' + ') : '', price: c.cost ? gen.priceOf(c.cost) : '', power: c.power ?? '', source: c.origin?.source || '', parent: c.origin?.parent || '',
      offers: s.offers, buys: s.buys, pickRate: s.pickRate, buyerSeats: s.buyerSeats, buyerWinRate: s.buyerWinRate, nonBuyerSeats: s.nonBuyerSeats, nonBuyerWinRate: s.nonBuyerWinRate, lift: s.lift, adjLift: s.adjLift, score: s.score, dominant: s.dominant, autoPick: s.autoPick, playsPerCopy: s.playsPerCopy, meanFirstBuyRound: s.meanFirstBuyRound, kept: keptKeys ? keptKeys.has(e.key) : '', text: c.text };
    return CSV_COLUMNS.map(k => csvCell(row[k])).join(',');
  });
}
const strip = s => { const { firstRounds, buyerGameRounds, ...rest } = s; return rest; };

// ---------- main ----------
async function main() {
  const cfg = loadConfig(process.argv.slice(2));
  const rules = engine.resolveRef(cfg.rules.ref);
  const sources = engine.loadSources(cfg.rules.ref);
  const catalog = engine.currentCatalog(sources);
  const out = outputDir(cfg);
  const startedAt = new Date();
  console.log(`card-evolution "${cfg.name}" on ${rules.ref} (${rules.commit.slice(0, 12)}${rules.dirty ? ', uncommitted engine edits' : ''}), ${catalog.rulesVersion}, ${catalog.marketTiers ? 'tiered market' : 'single market'}`);
  console.log(`  ${cfg.generations} generations x ${cfg.gamesPerGeneration} games, baseline ${cfg.baselineGames}, ${cfg.workers} workers -> ${path.relative(engine.ROOT, out)}`);
  fs.writeFileSync(path.join(out, 'config.json'), JSON.stringify(cfg, null, 2));
  const workers = workerPool(cfg.workers, sources);
  const rng = engine.lcg(cfg.seed ^ 0x5eed);
  const usedNames = new Set([...Object.values(catalog.normal), ...Object.values(catalog.military), ...Object.values(catalog.relics)].map(c => c.name));
  const run = { name: cfg.name, startedAt: startedAt.toISOString(), rules: { ...rules, rulesVersion: catalog.rulesVersion, tieredMarket: Boolean(catalog.marketTiers), extra: cfg.rules.description || null }, node: process.version, workers: cfg.workers, tooling: engine.toolingCommit(), generations: [], baseline: null };
  const allRows = [CSV_COLUMNS.join(',')];
  try {
    if (cfg.baselineGames > 0) {
      const dir = path.join(out, 'gen-0-printed'); fs.mkdirSync(dir);
      const entries = printedEntries(catalog);
      fs.writeFileSync(path.join(dir, 'pool.json'), JSON.stringify(entries, null, 2));
      const { games, seconds } = await runGames(workers, tasksFor(cfg, entries, cfg.baselineGames), 'G0 printed cards', path.join(dir, 'games.jsonl'));
      const ev = evaluate(cfg, entries, games);
      fs.writeFileSync(path.join(dir, 'cards.json'), JSON.stringify(Object.values(ev.stats).map(strip), null, 2));
      const rows = csvRows(0, entries, ev.stats, null);
      fs.writeFileSync(path.join(dir, 'cards.csv'), [CSV_COLUMNS.join(','), ...rows].join('\n') + '\n'); allRows.push(...rows);
      run.baseline = { generation: 0, seconds, summary: ev.summary, entries, stats: ev.stats };
    }
    let pool = refill(cfg, 1, [], {}, rng, usedNames);
    for (let g = 1; g <= cfg.generations; g++) {
      const dir = path.join(out, `gen-${g}`); fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'pool.json'), JSON.stringify(pool, null, 2));
      const { games, seconds } = await runGames(workers, tasksFor(cfg, pool, cfg.gamesPerGeneration), `G${g}`, path.join(dir, 'games.jsonl'));
      const ev = evaluate(cfg, pool, games);
      const keepMarket = Math.floor(cfg.pool.market.size * cfg.selection.keepFraction), keepRelic = Math.floor(cfg.pool.relics.size * cfg.selection.keepFraction);
      const capOf = (q, share, keep) => group => Math.max(1, Math.min(q[group] || 0, Math.ceil(keep * share)));
      const sm = scoring.selectSurvivors(pool.filter(e => e.pool === 'market'), ev.stats, keepMarket, { groupOf, quota: capOf(cfg.pool.market.roles, cfg.selection.maxRoleShare, keepMarket) });
      const sr = scoring.selectSurvivors(pool.filter(e => e.pool === 'relic'), ev.stats, keepRelic, { groupOf, quota: capOf(cfg.pool.relics.affinities, cfg.selection.maxRoleShare, keepRelic) });
      const kept = new Set([...sm.kept, ...sr.kept].map(e => e.key));
      fs.writeFileSync(path.join(dir, 'cards.json'), JSON.stringify(Object.values(ev.stats).map(strip), null, 2));
      fs.writeFileSync(path.join(dir, 'selection.json'), JSON.stringify({ kept: [...kept], dropped: [...sm.dropped, ...sr.dropped] }, null, 2));
      const rows = csvRows(g, pool, ev.stats, kept);
      fs.writeFileSync(path.join(dir, 'cards.csv'), [CSV_COLUMNS.join(','), ...rows].join('\n') + '\n'); allRows.push(...rows);
      run.generations.push({ generation: g, seconds, summary: ev.summary, entries: pool, stats: ev.stats, kept: [...kept], dropped: [...sm.dropped, ...sr.dropped] });
      console.log(`  G${g}: ${ev.summary.completed}/${ev.summary.games} finished, ${ev.summary.meanRounds.toFixed(1)} rounds, ${ev.summary.buysPerGame.toFixed(1)} buys/game, dominant: ${ev.summary.dominant.length}`);
      if (g < cfg.generations) pool = refill(cfg, g + 1, [...sm.kept, ...sr.kept], ev.stats, rng, usedNames);
    }
  } finally {
    await workers.close();
  }
  run.workerRestarts = workers.restarts;
  run.finishedAt = new Date().toISOString();
  run.wallSeconds = (Date.now() - startedAt.getTime()) / 1000;
  fs.writeFileSync(path.join(out, 'generations.csv'), allRows.join('\n') + '\n');
  const report = writeReport(cfg, run, out);
  fs.writeFileSync(path.join(out, 'run.json'), JSON.stringify({ ...run, baseline: run.baseline && { ...run.baseline, entries: undefined, stats: undefined }, generations: run.generations.map(g => ({ generation: g.generation, seconds: g.seconds, summary: g.summary, kept: g.kept, dropped: g.dropped })), shortlist: report.shortlist }, null, 2));
  console.log(`done in ${(run.wallSeconds / 60).toFixed(1)} min -> ${path.join(out, 'report.md')}`);
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { loadConfig, refill, tasksFor, evaluate, toEnginePool, printedEntries, groupOf, tierOfEntry };
