const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {factory}=require('./strategic-bot-study.cjs');
const {instrument}=require('./market-investment-study.cjs');
const {readArchive}=require('./lib/simulation-archive.cjs');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'prototypes/galactic-reach');
const app=fs.readFileSync(path.join(dir,'app.js'),'utf8'),adapter=fs.readFileSync(path.join(dir,'adapter.js'),'utf8');
const directory=process.env.GR_SIMULATION_ARCHIVE_DIR||path.join(root,'output/study-instrumentation-checks');
const streams=[[],[]],random=i=>{let seed=9181;return()=>{const x=(seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32;streams[i].push(x);return x;};};
const control=factory(app,adapter)({random:random(0),victoryTarget:30,archiveDirectory:directory,archiveMetadata:{kind:'instrumentation-control'}});
const metrics=Array.from({length:4},()=>({marketBuys:{},marketPlays:{},militaryTacticPlays:{},harvestersBuilt:0,firstHarvesterRound:null,firstMarketRound:null,buyTurns:0,affordableOffers:0,valuableOffers:0}));
const zero=()=>({matter:0,energy:0,biomass:0,data:0});
const studyMetrics=Array.from({length:4},()=>({gained:zero(),lost:zero(),spent:zero(),bankGiven:zero(),bankReceived:zero(),ships:{settler:0,explorer:0,fleet:0},draws:0,upgrades:0,colonizations:0,captures:0}));
const measured=factory(instrument(app),adapter)({random:random(1),victoryTarget:30,marketMetrics:metrics,studyMetrics,archiveDirectory:directory,archiveMetadata:{kind:'instrumentation-measured'},archiveSources:{'market-study.cjs':fs.readFileSync(path.join(__dirname,'market-investment-study.cjs'),'utf8')}});
for(const game of [control,measured])game.e.state.players.forEach((p,i)=>p.strategy=['market','economy','expansion','military'][i]);
function step(e){if(e.state.pendingCombat){const id=e.combatActor();e.applyCombatAction(id,e.chooseCombatAction(e.combatView(id),e.combatActions(id)));}else if(e.state.phase==='operations')e.runAiOperation();else e.runAiBuy();}
let decisions=0;
try{
  assert.equal(JSON.stringify(control.e.state),JSON.stringify(measured.e.state));
  for(;decisions<160&&control.e.state.winner===null;decisions++){
    step(control.e);step(measured.e);
    assert.equal(JSON.stringify(measured.e.state),JSON.stringify(control.e.state),'Metrics must preserve every decision, payment and private state');
    assert.equal(measured.e.turnSerial,control.e.turnSerial);assert.equal(measured.e.cardSerial,control.e.cardSerial);
  }
  assert.deepEqual(streams[1],streams[0],'Metrics must not add or remove RNG calls');
  for(const m of studyMetrics){assert.equal(m.resourceAccounting,'receipt-ledger-v2');for(const k of Object.keys(zero())){const v=m.resourceLedger;assert.equal(m.spent[k],v.paidCosts[k]+v.starterUpgrades[k]+v.trashing[k]+v.escape[k]+v.consortiumGiven[k]);}}
  assert(metrics.some(m=>m.harvestersBuilt>0));assert(metrics.some(m=>m.buyTurns>0));
}finally{for(const game of [control,measured])game.archive.finish({reason:'instrumentation-verification',incomplete:game.e.state.winner===null});}
for(const game of [control,measured])assert.equal(JSON.stringify(readArchive(game.archive.directory).state),JSON.stringify(game.e.state));
console.log(`Market study instrumentation: ${decisions} decisions, all private states, payments, counters and RNG unchanged; archives retained at ${directory}.`);
// Switching identical policies must preserve the full trajectory, including pending combat.
const {play}=require('./market-investment-study.cjs');
const sources={app,adapter,rulebook:fs.readFileSync(path.join(dir,'rulebook.html'),'utf8')};
const task={id:0,variant:'identical-policy-handoff',seed:170010,rotation:1,target:30,profiles:['economy','expansion','military','economy'],maxRound:45,maxSteps:180,protocol:{validation:true}};
const uniform=play(task,sources,directory),mixed=play(task,{...sources,opponent:{app,adapter}},directory);
assert.deepEqual(JSON.parse(JSON.stringify(mixed.players)),JSON.parse(JSON.stringify(uniform.players)),'Identical handoffs preserve payments, purchases, draws and scoring');
assert.equal(mixed.steps,uniform.steps);assert.equal(mixed.winner,uniform.winner);
const ua=readArchive(uniform.archive),ma=readArchive(mixed.archive);
assert.equal(JSON.stringify(ma.state),JSON.stringify(ua.state),'Identical policies preserve full final private state across handoffs');
console.log('Market study: identical-policy seat handoffs preserve full results and private state.');
