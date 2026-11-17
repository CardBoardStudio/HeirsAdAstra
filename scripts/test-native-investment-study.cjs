const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {play,bridge}=require('./native-investment-study.cjs'),{factory}=require('./strategic-bot-study.cjs');
const {readArchive,SimulationArchive,hash}=require('./lib/simulation-archive.cjs');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const binary=process.env.GR_NATIVE_POLICY_BIN;if(!binary)throw Error('Set GR_NATIVE_POLICY_BIN to the compiled policy-study example');
const directory=process.env.GR_SIMULATION_ARCHIVE_DIR||path.join(root,'output/native-instrumentation');
const sources={app:read('prototypes/galactic-reach/app.js'),adapter:read('prototypes/galactic-reach/adapter.js'),rulebook:read('prototypes/galactic-reach/rulebook.html'),rust:read('crates/galactic-reach/src/lib.rs'),bridge:read('crates/galactic-reach/examples/policy-study.rs'),lock:read('Cargo.lock')};
const task={id:0,mode:'updated',variant:'native-reproducibility',seed:430010,rotation:0,target:30,profiles:['market','economy','expansion','military'],maxRound:45,maxSteps:40,protocol:{test:true,tacticalForecast:'all',militaryHorizon:'all',productionDiscipline:'all',marketFilter:'off',colonyPlanning:'all',protectedMarketBudget:'all',subjectMarket:'points-only',orderBenefits:'all',fleetDiscipline:'all',colonyExecution:'all'}};
(async()=>{
 const a=await play(task,sources,directory,binary),b=await play(task,sources,directory,binary);
 assert.deepEqual(JSON.parse(JSON.stringify(a.players)),JSON.parse(JSON.stringify(b.players)));
 const aa=readArchive(a.archive),bb=readArchive(b.archive);
 assert.equal(JSON.stringify(aa.state),JSON.stringify(bb.state));
 assert.deepEqual(aa.records.filter(r=>r.type==='random'),bb.records.filter(r=>r.type==='random'));
 const choices=aa.records.filter(r=>r.type==='event'&&r.event.type==='native-choice');assert.equal(choices.length,40);assert(choices.every(r=>r.event.nativeRandomDraws===0));
 let seed=task.seed;const recorder=new SimulationArchive({directory,metadata:{kind:'native-action-replay'},rulebookSource:sources.rulebook});
 const replay=factory(sources.app,sources.adapter)({simulationArchive:recorder,victoryTarget:30,random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32)});
 replay.e.state.players.forEach((p,id)=>p.strategy=task.profiles[id]);let count=0;const native=bridge(binary);
 try{
  for(const r of aa.records){if(r.type!=='after-decision')continue;
   assert.equal(r.command.method,'applyAction');
   const choice=choices[count].event;const observation=replay.a.observe(r.command.actor);observation.singleFleetForecast=true;observation.militaryHorizon=true;observation.productionDiscipline=true;if(task.profiles[r.command.actor]==='market')observation.marketOpportunityFilter=false;observation.colonyPlanning=true;observation.colonyExecutionPlanning=true;observation.protectedMarketBudget=true;if(r.command.actor===(4-task.rotation)%4)observation.marketPurchasePolicy='points-only';observation.orderBenefitPlanning=true;observation.fleetInvestmentDiscipline=true;assert.equal(hash(observation),choice.observationHash);const legal=replay.a.legalActions(r.command.actor);assert.equal(hash(legal),choice.legalHash);assert.deepEqual(JSON.parse(JSON.stringify(legal[choice.index])),r.command.action);
   const metadataBase=JSON.parse(JSON.stringify(observation));metadataBase.colonyPlanning=false;metadataBase.colonyExecutionPlanning=false;metadataBase.orderBenefitPlanning=false;const stripped=JSON.parse(JSON.stringify(metadataBase));for(const stats of Object.values(stripped.cardStats))for(const field of ['range','assault','pathfinder','secondBuild','colonyCost','keepSettler','colonyPrestige','buyEffect','trashSelf','trashStarters'])delete stats[field];
   const baseline=await native.choose(task.profiles[r.command.actor],metadataBase,legal),unchanged=await native.choose(task.profiles[r.command.actor],stripped,legal);assert.equal(unchanged.index,baseline.index,'With Colony and order planning disabled, added metadata must not change this policy decision');
   replay.a.applyAction(r.command.actor,r.command.action);count++;
   assert.equal(JSON.stringify(replay.e.state),JSON.stringify(r.position),'Recorded native actions reproduce each full private position');assert.equal(replay.e.turnSerial,r.counters.turnSerial);assert.equal(replay.e.cardSerial,r.counters.cardSerial);
  }
  assert.equal(count,40);
 }finally{native.close();recorder.finish({reason:'native-replay-verification',incomplete:true});}
 console.log('Native study: 40 flag-aware decisions repeat exactly; with Colony and order planning off, added metadata leaves choices unchanged; recorded actions reproduce every full private state and counter; engine RNG and deterministic native choices are retained.');
})().catch(error=>{console.error(error);process.exitCode=1;});
