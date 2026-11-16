// Headless Galactic Reach for the card-evolution study. It runs the browser engine
// (prototypes/galactic-reach/app.js) in a vm, as the balance studies do, with three
// source patches and no rule changes:
//   1. every seat is played by the rival policy;
//   2. options.cardPool replaces the market and relic catalogs before the market decks
//      are dealt (generated cards only use fields the engine already reads);
//   3. options.evolutionMetrics records offers, purchases, plays and relic picks.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const { SimulationArchive, instrumentSource, hash } = require('../lib/simulation-archive.cjs');
const ENGINE_SOURCE = fs.readFileSync(__filename, 'utf8');
const ROOT = path.resolve(__dirname, '../..');
const ENGINE_FILES = ['app', 'adapter'];

// Rules source: the working tree (ref omitted or "WORKTREE") or any git ref / commit.
function loadSources(ref) {
  const sources = {};
  for (const name of ENGINE_FILES) {
    const rel = `prototypes/galactic-reach/${name}.js`;
    sources[name] = !ref || ref === 'WORKTREE'
      ? fs.readFileSync(path.join(ROOT, rel), 'utf8')
      : execFileSync('git', ['show', `${ref}:${rel}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 50e6 });
  }
  return sources;
}

function resolveRef(ref) {
  if (!ref || ref === 'WORKTREE') {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--', 'prototypes/galactic-reach'], { cwd: ROOT, encoding: 'utf8' }).trim();
    return { ref: 'WORKTREE', commit: head, dirty: Boolean(dirty) };
  }
  return { ref, commit: execFileSync('git', ['rev-parse', `${ref}^{commit}`], { cwd: ROOT, encoding: 'utf8' }).trim(), dirty: false };
}

// The commit of this tooling, so a report names the exact study code it ran.
function toolingCommit() {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['status', '--porcelain', '--', 'scripts/card-evolution'], { cwd: ROOT, encoding: 'utf8' }).trim();
  return dirty ? `${head} (with uncommitted study edits)` : head;
}

function replaceOnce(source, search, replacement, label) {
  const at = source.indexOf(search);
  if (at < 0) throw new Error(`card-evolution engine patch not found: ${label}. The engine changed; review scripts/card-evolution/engine.cjs.`);
  return source.slice(0, at) + replacement + source.slice(at + search.length);
}

const POOL_MARKET = `
  // card-evolution: replace the market catalog with the study's pool.
  if (options.cardPool) {
    for (const key of Object.keys(ADVANCED_CARDS)) delete ADVANCED_CARDS[key];
    for (const key of Object.keys(MARKET_MILITARY)) delete MARKET_MILITARY[key];
    Object.assign(ADVANCED_CARDS, options.cardPool.normal);
    Object.assign(MARKET_MILITARY, options.cardPool.military);
  }
`;
const POOL_RELICS = `
  // card-evolution: replace the relic catalog with the study's pool.
  if (options.cardPool) {
    for (const key of Object.keys(RELIC_CARDS)) delete RELIC_CARDS[key];
    Object.assign(RELIC_CARDS, options.cardPool.relics);
  }
`;
// Function declarations are mutable bindings inside createGalacticReach, so rebinding
// them here also wraps every internal call (the strategic-bot study uses the same seam).
const METRICS = `
  const evo = options.evolutionMetrics;
  if (evo) {
    const baseRunAiBuy = runAiBuy;
    runAiBuy = function () {
      const id = state.activePlayer, seen = new Set(state.market.map(card => card.key));
      evo.turn = { id, seen };
      try { return baseRunAiBuy.apply(this, arguments); }
      finally { for (const key of seen) evo.offer(id, key); evo.turn = null; }
    };
    const baseBuyCard = buyCard;
    buyCard = function (playerId, source, index) {
      const card = source === 'market' ? state.market[index] : null;
      const ok = baseBuyCard.apply(this, arguments);
      if (ok && card) {
        evo.buy(playerId, card.key, state.round);
        if (evo.turn) state.market.forEach(c => evo.turn.seen.add(c.key));
      }
      return ok;
    };
    const baseExcavate = excavate;
    excavate = function (playerId, coord, cardId, relicId, dryRun = false) {
      const row = state.relicRow.map(card => ({ id: card.id, key: card.key }));
      const ok = baseExcavate.apply(this, arguments);
      if (ok && !dryRun) evo.relic(playerId, row.map(r => r.key), row.find(r => r.id === relicId)?.key, state.round);
      return ok;
    };
    // A military card is "played" when chosen as a battle tactic (rules #combat).
    const baseApplyCombatAction = applyCombatAction;
    applyCombatAction = function (seat, action) {
      const ok = baseApplyCombatAction.apply(this, arguments);
      if (ok && action?.type === 'combat_tactic' && MARKET_MILITARY[action.tactic]) evo.play(seat, action.tactic);
      return ok;
    };
    const baseRemoveHandCard = removeHandCard;
    removeHandCard = function (player, cardId, destination = 'inPlay') {
      const card = baseRemoveHandCard.apply(this, arguments);
      if (card && !card.starter && (destination === 'inPlay' || (destination === 'trash' && state.phase === 'operations'))) evo.play(player.id, card.key);
      return card;
    };
  }
`;

function patchApp(app) {
  app = replaceOnce(app,
    "if (state.pendingCombat || state.phase !== 'operations' || state.activePlayer === ME || state.winner !== null) return;",
    "if (state.pendingCombat || state.phase !== 'operations' || state.winner !== null) return;",
    'AI operation guard (every seat is a rival)');
  app = replaceOnce(app, '      clone, deckContents,', '      runAiOperation, runAiBuy, chooseCombatAction, clone, deckContents,', 'headless port exports');
  app = replaceOnce(app, '  const MARKET_CARDS = { ...ADVANCED_CARDS, ...MARKET_MILITARY };', POOL_MARKET + '  const MARKET_CARDS = { ...ADVANCED_CARDS, ...MARKET_MILITARY };', 'market catalog');
  app = replaceOnce(app, '  Object.assign(CARD_BY_TAG,', POOL_RELICS + '  Object.assign(CARD_BY_TAG,', 'relic catalog');
  app = replaceOnce(app, '  if (headless && options.resume) {', METRICS + '\n  if (headless && options.resume) {', 'metrics seam');
  return app;
}

// Returns create(options) -> { e: headless port, a: adapter }.
function engineFactory(sources) {
  let activeArchive;
  const executable = instrumentSource(patchApp(sources.app));
  const context = vm.createContext({ console: Object.fromEntries(['log','warn','error'].map(level => [level,(...args)=>activeArchive?.event({type:'console',level,args})])), setTimeout: () => 0, clearTimeout() {} });
  vm.runInContext(sources.adapter + '\n' + executable, context);
  let port;
  const original = context.createGalacticAdapter;
  context.createGalacticAdapter = p => { port = p; return original(p); };
  return {
    create(options) {
      const archive = new SimulationArchive({ directory: options.archiveDirectory, metadata: {kind:'card-evolution', ...(options.archiveMetadata||{})}, sources: {
        'engine.js': executable, 'adapter.js': sources.adapter, 'evolution-engine.cjs': ENGINE_SOURCE,
        'card-pool.json': JSON.stringify(options.cardPool||null),
        ...Object.fromEntries(['run.cjs','generator.cjs','scoring.cjs','default.config.json'].map(name=>[name,fs.readFileSync(path.join(__dirname,name),'utf8')]))
      }});
      activeArchive = archive;
      try {
        const adapter = context.createGalacticReach({ ...options, headless: true, random: archive.random(options.random||Math.random), simulationArchiveEvent:event=>archive.event(event) });
        const e=port;
        archive.attach(()=>e.state,{engineHash:hash(executable),adapterHash:hash(sources.adapter),target:options.victoryTarget},()=>({turnSerial:e.turnSerial,cardSerial:e.cardSerial}));
        for(const name of ['runAiOperation','runAiBuy','applyCombatAction']){const fn=e[name];e[name]=(...args)=>archive.invoke({method:name,actor:e.state.pendingCombat?e.combatActor():e.state.activePlayer,args},()=>fn(...args));}
        const apply=adapter.applyAction;adapter.applyAction=(...args)=>archive.invoke({method:'applyAction',actor:args[0],action:args[1]},()=>apply(...args));
        return {e,a:adapter,archive};
      } catch(error) {archive.finish({reason:'initialization-error',incomplete:true,error:{message:error.message,stack:error.stack}});throw error;}
    },
    catalog() { return context.createGalacticReach({ catalog: true }); },
  };
}

// The current printed catalog (market + relics) of a rules source, as plain data.
function currentCatalog(sources) {
  const c = engineFactory(sources).catalog();
  const plain = v => JSON.parse(JSON.stringify(v));
  return { normal: plain(c.ADVANCED_CARDS), military: plain(c.MARKET_MILITARY), relics: plain(c.RELIC_CARDS), marketTiers: c.MARKET_TIERS ? plain(c.MARKET_TIERS) : null, rulesVersion: c.rulesVersion };
}

function lcg(seed) {
  let value = seed >>> 0;
  return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

// Plays one all-rival game with the given pool and returns a compact record.
function playGame(factory, task) {
  const seats = [0, 1, 2, 3];
  const blank = () => seats.map(() => ({}));
  const rec = { offers: blank(), buys: blank(), plays: blank(), firstBuyRound: blank(), relicOffers: blank(), relicPicks: blank() };
  const bump = (table, seat, key, n = 1) => { table[seat][key] = (table[seat][key] || 0) + n; };
  const metrics = {
    turn: null,
    offer: (seat, key) => bump(rec.offers, seat, key),
    buy: (seat, key, round) => { bump(rec.buys, seat, key); if (rec.firstBuyRound[seat][key] === undefined) rec.firstBuyRound[seat][key] = round; },
    play: (seat, key) => bump(rec.plays, seat, key),
    relic: (seat, row, picked) => { row.forEach(key => bump(rec.relicOffers, seat, key)); if (picked) bump(rec.relicPicks, seat, picked); },
  };
  const started = Date.now();
  const game = factory.create({ random: lcg(task.seed), evolutionMetrics: metrics, victoryTarget: task.victoryTarget, cardPool: task.pool, archiveMetadata: task });
  try {
  const { e } = game;
  e.state.players.forEach((p, i) => { p.strategy = task.profiles[i]; });
  let steps = 0, stalled = false;
  while (e.state.winner === null && e.state.round <= task.maxRound && steps < task.maxSteps) {
    const s = e.state, actor = s.pendingCombat ? e.combatActor() : s.activePlayer;
    const before = JSON.stringify([s.activePlayer, s.phase, s.pendingCombat, s.players[actor].hand, e.turnSerial]);
    if (s.pendingCombat) { const id = e.combatActor(); e.applyCombatAction(id, e.chooseCombatAction(e.combatView(id), e.combatActions(id))); }
    else if (s.phase === 'operations') e.runAiOperation();
    else if (s.phase === 'buy') e.runAiBuy();
    else throw new Error('Unexpected phase ' + s.phase);
    steps++;
    const after = JSON.stringify([e.state.activePlayer, e.state.phase, e.state.pendingCombat, e.state.players[actor].hand, e.turnSerial]);
    if (before === after) { stalled = true; break; }
  }
  const s = e.state;
  const result = {
    archive: game.archive.directory, seed: task.seed, index: task.index, profiles: task.profiles, completed: s.winner !== null, winner: s.winner, round: s.round, steps, stalled,
    milliseconds: Date.now() - started,
    players: s.players.map((p, seat) => ({ seat, profile: task.profiles[seat], points: e.calculatePrestige(seat), cardsPurchased: p.cardsPurchased || 0, relics: p.relicsExcavated || 0 })),
    ...rec,
  };
  game.archive.finish({reason:result.completed?'victory':stalled?'stalled':'limit',incomplete:!result.completed,summary:result});
  return result;
  } catch(error) {game.archive.finish({reason:'error',incomplete:true,error:{message:error.message,stack:error.stack}});throw error;}
}

module.exports = { ROOT, loadSources, resolveRef, toolingCommit, patchApp, engineFactory, currentCatalog, playGame, lcg };
