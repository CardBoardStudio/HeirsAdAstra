// Browser-policy laboratory. Uses the canonical lossless recorder, including interrupted games.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const { factory } = require('./strategic-bot-study.cjs');
const { SimulationArchive, resultDirectory, hash } = require('./lib/simulation-archive.cjs');
const ROOT = path.resolve(__dirname, '..');
const RUNNER = fs.readFileSync(__filename, 'utf8');
const RES = ['matter', 'energy', 'biomass', 'data'];
const blank = () => Object.fromEntries(RES.map(r => [r, 0]));

function instrument(app) {
  const anchor = '  if (headless && options.resume) {';
  if (app.split(anchor).length !== 2) throw Error('Study bootstrap anchor changed');
  return app.replace(anchor, `
  const lab=options.marketMetrics;
  if(lab){
    const buy=buyCard;
    buyCard=(id,source,index)=>{const card=source==='market'?state.market[index]:source==='catalog'?marketOffers().find(c=>c.key===index):null,ok=buy(id,source,index);if(ok&&card){lab[id].marketBuys[card.key]=(lab[id].marketBuys[card.key]||0)+1;lab[id].firstMarketRound??=state.round;}return ok;};
    const build=constructAt;
    constructAt=(...args)=>{const [id,coord,kind,discount,dry=false]=args,ok=build(...args);if(ok&&!dry&&kind==='harvester'){lab[id].harvestersBuilt++;lab[id].firstHarvesterRound??=state.round;}return ok;};
    const buyTurn=runAiBuy;
    runAiBuy=()=>{const id=state.activePlayer,p=state.players[id];lab[id].buyTurns++;const offers=marketOffers().map(c=>({key:c.key,value:aiBuyValue(id,c.key),affordable:!!bankPlanForCost(p,purchaseCost(p,c.key),aiStorageProtection(id))}));lab[id].affordableOffers+=offers.filter(c=>c.affordable).length;lab[id].valuableOffers+=offers.filter(c=>c.value>0).length;return buyTurn();};
    const play=removeHandCard;
    removeHandCard=(p,id,...args)=>{const card=p.hand.find(c=>c.id===id);const result=play(p,id,...args);if(card&&!card.starter&&ALL_CARDS[card.key].cost&&!['probe','colonize','capacityModule'].includes(card.key))lab[p.id].marketPlays[card.key]=(lab[p.id].marketPlays[card.key]||0)+1;return result;};
    const combat=applyCombatAction;
    applyCombatAction=(...args)=>{const [id,action]=args,ok=combat(...args);if(ok&&action?.type==='combat_tactic'&&MARKET_MILITARY[action.tactic])lab[id].militaryTacticPlays[action.tactic]=(lab[id].militaryTacticPlays[action.tactic]||0)+1;return ok;};
  }
` + anchor);
}

function play(task, sources, archiveRoot) {
  let seed = task.seed >>> 0;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const metrics = Array.from({ length: 4 }, () => ({ gained: blank(), lost: blank(), spent: blank(), bankGiven: blank(), bankReceived: blank(), ships: { settler: 0, explorer: 0, fleet: 0 }, draws: 0, upgrades: 0, colonizations: 0, captures: 0 }));
  const market = Array.from({ length: 4 }, () => ({ marketBuys: {}, marketPlays: {}, militaryTacticPlays: {}, harvestersBuilt: 0, firstHarvesterRound: null, firstMarketRound: null, buyTurns: 0, affordableOffers: 0, valuableOffers: 0 }));
  const recorder = new SimulationArchive({ directory: archiveRoot, metadata: task, rulebookSource: sources.rulebook, sources: { 'market-study.cjs': RUNNER } });
  const builds={subject:factory(instrument(sources.app),sources.adapter)};
  if(sources.opponent)builds.opponent=factory(instrument(sources.opponent.app),sources.opponent.adapter);
  let policy='subject';
  const options={random,studyMetrics:metrics,marketMetrics:market,simulationArchive:recorder,victoryTarget:task.target};
  let game = builds.subject({ random, victoryTarget: task.target, studyMetrics: metrics, marketMetrics: market, simulationArchive: recorder, archiveMetadata: task, archiveSources: { 'market-study.cjs': RUNNER, 'original-app.js': sources.app, 'original-adapter.js': sources.adapter, 'protocol.json': JSON.stringify(task.protocol) } });
  const started = Date.now(); let steps = 0, stalled = false;
  try {
    let e=game.e;
    e.state.players.forEach((p, i) => { p.strategy = task.profiles[i]; });
    const mapHash = hash({ planets: e.state.planets, clusters: e.state.clusters });
    while (e.state.winner === null && e.state.round <= task.maxRound && steps < task.maxSteps) {
      const actor=e.state.pendingCombat?e.combatActor():e.state.activePlayer;
      const nextPolicy=sources.opponent&&actor!==(-task.rotation+4)%4?'opponent':'subject';
      if(nextPolicy!==policy){const resume=game.a.snapshotState();policy=nextPolicy;game=builds[policy]({...options,resume,archivePolicy:policy});e=game.e;}
      const s=e.state;
      const before = JSON.stringify([s.activePlayer, s.phase, s.pendingCombat, s.pendingConstruct, s.players[actor].hand, e.turnSerial]);
      if (s.pendingCombat) e.applyCombatAction(actor, e.chooseCombatAction(e.combatView(actor), e.combatActions(actor)));
      else if (s.phase === 'operations') e.runAiOperation();
      else if (s.phase === 'buy') e.runAiBuy();
      else throw Error('Unexpected phase ' + s.phase);
      steps++;
      const next = e.state;
      if (before === JSON.stringify([next.activePlayer, next.phase, next.pendingCombat, next.pendingConstruct, next.players[actor].hand, e.turnSerial])) { stalled = true; break; }
    }
    const s = e.state;
    const result = { id: task.id, variant: task.variant, seed: task.seed, rotation: task.rotation, target: task.target, profiles: task.profiles, subjectSeat:(4-task.rotation)%4, mixedPolicies:!!sources.opponent, mapHash, archive: game.archive.directory, completed: s.winner !== null, winner: s.winner, rounds: s.round, steps, stalled, milliseconds: Date.now() - started,
      players: s.players.map((p, id) => ({ seat: id, profile: p.strategy, points: e.calculatePrestige(id), colonies: e.colonyPlanets(id).length, relics: p.relicsExcavated, combatWins: p.combatVictories, cardPoints: p.cardPrestige || 0, production: e.aiIncome(id), resources: p.resources, limits: e.resourceLimits(id), cards: p.hand.length + p.deck.length + p.discard.length + p.inPlay.length, ...metrics[id], ...market[id] })) };
    game.archive.finish({ reason: result.completed ? 'victory' : stalled ? 'stalled' : 'limit', incomplete: !result.completed, summary: result });
    return result;
  } catch (error) { game.archive.finish({ reason: 'error', incomplete: true, error: { message: error.message, stack: error.stack } }); throw error; }
}

function summarize(games) {
  const mean = a => a.reduce((n, x) => n + x, 0) / (a.length || 1), out = { games: games.length, completed: games.filter(g => g.completed).length, profiles: {} };
  out.meanRounds = mean(games.filter(g => g.completed).map(g => g.rounds));
  for (const profile of new Set(games.flatMap(g => g.profiles))) {
    const rows = games.flatMap(g => g.players.filter(p => p.profile === profile).map(p => ({ ...p, win: g.completed && g.winner === p.seat, complete: g.completed })));
    const completed = rows.filter(p => p.complete);
    out.profiles[profile] = { seats: rows.length, wins: completed.filter(p => p.win).length, winRate: completed.filter(p => p.win).length / (completed.length || 1), meanPoints: mean(rows.map(p => p.points)), meanHarvesters: mean(rows.map(p => p.harvestersBuilt)), meanMarketBuys: mean(rows.map(p => Object.values(p.marketBuys).reduce((a, b) => a + b, 0))), meanMarketPlays: mean(rows.map(p => Object.values(p.marketPlays).reduce((a, b) => a + b, 0))), resources: Object.fromEntries(RES.map(r => [r, Object.fromEntries(['gained', 'spent', 'lost', 'bankGiven', 'bankReceived'].map(k => [k, mean(rows.map(p => p[k][r]))]))])) };
  }
  return out;
}

if (!isMainThread && require.main === module) {
  parentPort.on('message', task => { try { parentPort.postMessage({ game: play(task, workerData.sources, workerData.archiveRoot) }); } catch (error) { parentPort.postMessage({ error: error.stack, task }); } });
} else if (require.main === module) {
  const args = process.argv.slice(2), arg = (k, fallback) => { const i = args.indexOf('--' + k); return i < 0 ? fallback : args[i + 1]; };
  const variant = arg('variant', 'baseline'), seedStart = Number(arg('seed-start', 170010)), seeds = Number(arg('seeds', 2)), rotations = arg('rotations', '0,1,2,3').split(',').map(Number), profiles = arg('profiles', 'military,economy,expansion,military').split(','), target = Number(arg('target', 30));
  if (profiles.length !== 4 || ![20, 30, 40, 50, 60].includes(target)) throw Error('Invalid lineup/target');
  const sourceDir = arg('source-dir', path.join(ROOT, 'prototypes/galactic-reach'));
  const sources = Object.fromEntries(['app', 'adapter'].map(k => [k, fs.readFileSync(path.join(sourceDir, k + '.js'), 'utf8')]));
  sources.rulebook = fs.readFileSync(path.join(sourceDir, 'rulebook.html'), 'utf8');
  const opponentDir=arg('opponent-source-dir',null);
  if(opponentDir){
    sources.opponent=Object.fromEntries(['app','adapter'].map(k=>[k,fs.readFileSync(path.join(opponentDir,k+'.js'),'utf8')]));
    const catalog=app=>{const a=app.indexOf('  const BASIC_CARDS ='),b=app.indexOf('  const ALL_CARDS =');if(a<0||b<=a)throw Error('Card catalog anchors changed');return app.slice(a,b);};
    if(!catalog(sources.app)||catalog(sources.app)!==catalog(sources.opponent.app))throw Error('Mixed policies require identical printed card definitions');
  }
  const out = resultDirectory(arg('out', path.join(ROOT, 'output/market-investment'))), archiveRoot = path.join(out, 'games');
  const protocol = { run: crypto.randomUUID(), kind: 'market-investment-pilot', variant, target, seedStart, seeds, rotations, profiles, maxRound: 45, maxSteps: 10000, opponentHashes:sources.opponent?Object.fromEntries(Object.entries(sources.opponent).map(([k,v])=>[k,hash(v)])):null, sourceHashes: { app: hash(sources.app), adapter: hash(sources.adapter), rulebook: hash(sources.rulebook) }, startedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(out, 'protocol.json'), JSON.stringify(protocol, null, 2));
  fs.mkdirSync(path.join(out, 'sources')); for (const [k, content] of Object.entries(sources).filter(([k])=>k!=='opponent')) fs.writeFileSync(path.join(out, 'sources', k === 'rulebook' ? 'rulebook.html' : k + '.js'), content);
  if(sources.opponent)for(const [k,v] of Object.entries(sources.opponent))fs.writeFileSync(path.join(out,'sources','opponent-'+k+'.js'),v);
  fs.writeFileSync(path.join(out, 'sources', 'runner.cjs'), RUNNER);
  const tasks = []; for (let i = 0; i < seeds; i++) for (const rotation of rotations) tasks.push({ id: tasks.length, variant, target, seed: seedStart + 7919 * i, rotation, profiles: profiles.map((_, j) => profiles[(j + rotation) % 4]), maxRound: protocol.maxRound, maxSteps: protocol.maxSteps, protocol });
  console.log('Study output: ' + out); const games = [], workers = []; let next = 0, failures = 0;
  for (let i = 0; i < Math.min(Number(arg('workers', 2)), tasks.length); i++) {
    const worker = new Worker(__filename, { workerData: { sources, archiveRoot } }); workers.push(worker);
    worker.on('message', msg => {
      if (msg.error) { fs.appendFileSync(path.join(out, 'errors.jsonl'), JSON.stringify(msg) + '\n'); failures++; console.error(msg.error); }
      else { games.push(msg.game); fs.appendFileSync(path.join(out, 'results.jsonl'), JSON.stringify(msg.game) + '\n'); console.log(`${games.length + failures}/${tasks.length} ${variant} seed=${msg.game.seed} rotation=${msg.game.rotation} rounds=${msg.game.rounds} winner=${msg.game.winner} ms=${msg.game.milliseconds}`); }
      fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ ...summarize(games), failures, scheduled: tasks.length }, null, 2));
      if (next < tasks.length) worker.postMessage(tasks[next++]); else worker.terminate();
      if (games.length + failures === tasks.length) { console.log(JSON.stringify(summarize(games))); if (failures) process.exitCode = 1; }
    });
    worker.on('error', error => { console.error(error); process.exitCode = 1; workers.forEach(w => w.terminate()); });
    worker.postMessage(tasks[next++]);
  }
}
module.exports = { instrument, play, summarize };
