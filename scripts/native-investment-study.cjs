// Actual native standard policies over the authoritative browser adapter, with full archives.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),readline=require('node:readline');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {factory,RESOURCE_ACCOUNTING}=require('./strategic-bot-study.cjs'),{instrument,summarize}=require('./market-investment-study.cjs');
const {SimulationArchive,resultDirectory,hash}=require('./lib/simulation-archive.cjs');
const ROOT=path.resolve(__dirname,'..'),RUNNER=fs.readFileSync(__filename,'utf8'),RES=['matter','energy','biomass','data'];
const blank=()=>Object.fromEntries(RES.map(r=>[r,0]));
function bridge(binary){
 if(globalThis.process.env.GR_ALLOW_ARCHIVED_RUST_BOTS!=='1')throw Error('Rust bots are archived. Use scripts/browser-bot-study.cjs for new studies. Only historical reproduction may set GR_ALLOW_ARCHIVED_RUST_BOTS=1.');
 const process=spawn(binary,[],{stdio:['pipe','pipe','pipe']});let pending=null,serial=0,closed=false,stderr='';
 const fail=error=>{closed=true;if(pending){clearTimeout(pending.timer);pending.reject(error);pending=null;}};
 process.stdin.on('error',fail);process.on('error',fail);process.on('exit',(code,signal)=>fail(Error(`Native bridge exited (${code}/${signal}): ${stderr}`)));process.stderr.on('data',s=>stderr=(stderr+s).slice(-8000));
 readline.createInterface({input:process.stdout}).on('line',line=>{
  try{const response=JSON.parse(line);if(!pending||response.id!==pending.id)throw Error('Native response ID mismatch');const p=pending;pending=null;clearTimeout(p.timer);p.resolve(response);}catch(error){fail(error);process.kill();}
 });
 return {choose(profile,observation,legal){
  if(closed)return Promise.reject(Error('Native bridge is closed'));if(pending)return Promise.reject(Error('Concurrent native request'));
  return new Promise((resolve,reject)=>{const id=serial++,timer=setTimeout(()=>{fail(Error('Native decision exceeded 60 seconds'));process.kill();},60000);pending={id,timer,resolve,reject};process.stdin.write(JSON.stringify({id,profile,observation,legal})+'\n',error=>{if(error)fail(error);});});
 },close(){process.kill();}};
}
async function play(task,sources,directory,binary){
 const recorder=new SimulationArchive({directory,metadata:task,rulebookSource:sources.rulebook,sources:{...(fs.existsSync(path.join(ROOT,'crates/galactic-reach/src/archived_rust.rs'))?{'archived-rust.rs':fs.readFileSync(path.join(ROOT,'crates/galactic-reach/src/archived_rust.rs'),'utf8')}:{}),'native-study.cjs':RUNNER,'native-policy.rs':sources.rust,'native-bridge.rs':sources.bridge,'Cargo.lock':sources.lock}});
 let seed=task.seed>>>0;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
 const metrics=Array.from({length:4},()=>({gained:blank(),lost:blank(),spent:blank(),bankGiven:blank(),bankReceived:blank(),ships:{settler:0,explorer:0,fleet:0},draws:0,upgrades:0,colonizations:0,captures:0}));
 const market=Array.from({length:4},()=>({marketBuys:{},marketPlays:{},militaryTacticPlays:{},harvestersBuilt:0,firstHarvesterRound:null,firstMarketRound:null,buyTurns:0,affordableOffers:0,valuableOffers:0}));
 let native,game,steps=0;const started=Date.now(),subjectSeat=(4-task.rotation)%4,buyStarts=new Set();
 try{
  native=bridge(binary);game=factory(instrument(sources.app),sources.adapter)({random,victoryTarget:task.target,studyMetrics:metrics,marketMetrics:market,simulationCatalogMarket:task.protocol.catalogMarket===true,simulationArchive:recorder,archiveSources:{'original-app.js':sources.app,'original-adapter.js':sources.adapter,'protocol.json':JSON.stringify(task.protocol)}});
  const {e,a}=game;e.state.players.forEach((p,id)=>p.strategy=task.profiles[id]);const mapHash=hash({planets:e.state.planets,clusters:e.state.clusters});let stalled=false;
  while(e.state.winner===null&&e.state.round<=task.maxRound&&steps<task.maxSteps){
   const actor=a.activeSeat(),observation=a.observe(actor),legal=a.legalActions(actor);if(!legal.length)throw Error('No legal native action');
   if(actor===subjectSeat&&task.protocol.excludeCard)observation.excludedMarketCards=[task.protocol.excludeCard];
   const updated=task.mode==='updated'||task.mode==='mixed'&&actor===subjectSeat;
   if(!updated){delete observation.investmentPlanning;delete observation.marketPaymentCosts;}
   if(task.protocol.tacticalForecast==='all'||task.protocol.tacticalForecast==='subject'&&actor===subjectSeat)observation.singleFleetForecast=true;
   if(task.protocol.militaryHorizon==='all'||task.protocol.militaryHorizon==='subject'&&actor===subjectSeat)observation.militaryHorizon=true;
   if(task.protocol.productionDiscipline==='all'||task.protocol.productionDiscipline==='subject'&&actor===subjectSeat)observation.productionDiscipline=true;
   if(task.protocol.harvesterHeadroom==='all'||task.protocol.harvesterHeadroom==='subject'&&actor===subjectSeat)observation.harvesterHeadroomPlanning=true;
   if(task.protocol.optionalConstruction==='all'||task.protocol.optionalConstruction==='subject'&&actor===subjectSeat)observation.optionalConstructionPlanning=true;
   if(task.protocol.buyDiscount==='all'||task.protocol.buyDiscount==='subject'&&actor===subjectSeat)observation.buyDiscountPlanning=true;
   if(task.protocol.marketFilter==='off'&&task.profiles[actor]==='market')observation.marketOpportunityFilter=false;
   if(task.protocol.colonyPlanning==='all'||task.protocol.colonyPlanning==='subject'&&actor===subjectSeat)observation.colonyPlanning=true;
   if(task.protocol.colonyExecution==='all'||task.protocol.colonyExecution==='subject'&&actor===subjectSeat)observation.colonyExecutionPlanning=true;
   if(task.protocol.protectedMarketBudget==='all'||task.protocol.protectedMarketBudget==='subject'&&actor===subjectSeat)observation.protectedMarketBudget=true;
   if(actor===subjectSeat&&task.protocol.subjectMarket&&task.protocol.subjectMarket!=='normal')observation.marketPurchasePolicy=task.protocol.subjectMarket;
   if(task.protocol.orderBenefits==='all'||task.protocol.orderBenefits==='subject'&&actor===subjectSeat)observation.orderBenefitPlanning=true;
   if(task.protocol.constructionDiscipline==='all'||task.protocol.constructionDiscipline==='subject'&&actor===subjectSeat){observation.settlerInvestmentDiscipline=true;observation.fleetInvestmentDiscipline=true;observation.optionalConstructionPlanning=true;}
   if(task.protocol.fleetDiscipline==='all'||task.protocol.fleetDiscipline==='subject'&&actor===subjectSeat)observation.fleetInvestmentDiscipline=true;
   const buyKey=e.state.round+':'+actor;if(e.state.phase==='buy'&&!buyStarts.has(buyKey)){buyStarts.add(buyKey);market[actor].buyTurns++;}
   const response=await native.choose(task.profiles[actor],observation,legal);
   if(response.nativeRandomDraws!==0||!Number.isInteger(response.index)||!legal[response.index])throw Error('Invalid native policy result');
   recorder.event({type:'native-choice',step:steps,actor,updated,profile:task.profiles[actor],policy:response.policy,observationHash:hash(observation),legalHash:hash(legal),index:response.index,nativeRandomDraws:0});
   const selected=legal[response.index];
   if(actor===subjectSeat&&selected.type==='buy'&&['market','catalog'].includes(selected.source)){
    if(task.protocol.subjectMarket==='none')throw Error('No-market policy attempted a market purchase');
    if(task.protocol.subjectMarket==='points-only'&&!(e.ALL_CARDS[selected.key]?.gainPrestige>0))throw Error('Points-only policy attempted a non-purchase-Prestige card');
   }
   if(actor===subjectSeat&&selected.type==='buy'&&selected.key===task.protocol.excludeCard)throw Error('Omitted card was purchased');
   const before=JSON.stringify(a.snapshotState());a.applyAction(actor,selected);steps++;
   if(before===JSON.stringify(a.snapshotState())){stalled=true;break;}
  }
  const s=e.state,result={...task,subjectSeat,mapHash,archive:recorder.directory,completed:s.winner!==null,winner:s.winner,rounds:s.round,steps,stalled,milliseconds:Date.now()-started,
   players:s.players.map((p,id)=>({seat:id,profile:p.strategy,points:e.calculatePrestige(id),colonies:e.colonyPlanets(id).length,relics:p.relicsExcavated,combatWins:p.combatVictories,cardPoints:p.cardPrestige||0,production:e.aiIncome(id),resources:p.resources,limits:e.resourceLimits(id),cards:p.hand.length+p.deck.length+p.discard.length+p.inPlay.length,...metrics[id],...market[id]}))};
  recorder.finish({reason:result.completed?'victory':stalled?'stalled':'limit',incomplete:!result.completed,summary:result});return result;
 }catch(error){recorder.finish({reason:'error',incomplete:true,error:{message:error.message,stack:error.stack},steps});throw error;}finally{native?.close();}
}
if(!isMainThread&&require.main===module){parentPort.on('message',async task=>{try{parentPort.postMessage({game:await play(task,workerData.sources,workerData.archiveRoot,workerData.binary)});}catch(error){parentPort.postMessage({error:error.stack,task});}});}
else if(require.main===module){
 const args=process.argv.slice(2),arg=(k,d)=>{const i=args.indexOf('--'+k);return i<0?d:args[i+1];};
 const binary=arg('native-bin',process.env.GR_NATIVE_POLICY_BIN||path.join(ROOT,'target/debug/examples/policy-study')),mode=arg('mode','mixed'),variant=arg('variant','native-'+mode),target=Number(arg('target',30)),seedStart=Number(arg('seed-start',430010)),seeds=Number(arg('seeds',1)),maxRound=Number(arg('max-round',45)),rotations=arg('rotations','0,1,2,3').split(',').map(Number),profiles=arg('profiles','economy,economy,expansion,military').split(',');
 if(![20,30,40,50,60].includes(target)||!['control','mixed','updated'].includes(mode)||profiles.length!==4||profiles.some(p=>!['economy','market','military','expansion'].includes(p)))throw Error('Invalid native protocol');
 const sourceDir=arg('source-dir',path.join(ROOT,'prototypes/galactic-reach')),nativeDir=arg('native-source-dir',null);
 const sources={app:fs.readFileSync(path.join(sourceDir,'app.js'),'utf8'),adapter:fs.readFileSync(path.join(sourceDir,'adapter.js'),'utf8'),rulebook:fs.readFileSync(path.join(sourceDir,'rulebook.html'),'utf8'),rust:fs.readFileSync(nativeDir?path.join(nativeDir,'rust.txt'):path.join(ROOT,'crates/galactic-reach/src/lib.rs'),'utf8'),bridge:fs.readFileSync(nativeDir?path.join(nativeDir,'bridge.txt'):path.join(ROOT,'crates/galactic-reach/examples/policy-study.rs'),'utf8'),lock:fs.readFileSync(nativeDir?path.join(nativeDir,'lock.txt'):path.join(ROOT,'Cargo.lock'),'utf8')};
 const out=resultDirectory(arg('out',path.join(ROOT,'output/native-investment'))),archiveRoot=path.join(out,'games');fs.mkdirSync(path.join(out,'sources'));const frozenBinary=path.join(out,'sources/policy-study');fs.copyFileSync(binary,frozenBinary);fs.chmodSync(frozenBinary,0o755);
 for(const [k,v] of Object.entries(sources))fs.writeFileSync(path.join(out,'sources',k==='rulebook'?'rulebook.html':k==='app'||k==='adapter'?k+'.js':k+'.txt'),v);fs.writeFileSync(path.join(out,'sources/runner.cjs'),RUNNER);
 const tacticalForecast=arg('tactical-forecast','none');if(!['none','subject','all'].includes(tacticalForecast))throw Error('Invalid tactical forecast mode');
 const militaryHorizon=arg('military-horizon','none');if(!['none','subject','all'].includes(militaryHorizon))throw Error('Invalid military horizon mode');
 const productionDiscipline=arg('production-discipline','none');if(!['none','subject','all'].includes(productionDiscipline))throw Error('Invalid production discipline mode');
 const marketFilter=arg('market-filter','on');if(!['on','off'].includes(marketFilter))throw Error('Invalid market filter mode');
 const colonyPlanning=arg('colony-planning','none');if(!['none','subject','all'].includes(colonyPlanning))throw Error('Invalid Colony planning mode');
 const protectedMarketBudget=arg('protected-market-budget','none');if(!['none','subject','all'].includes(protectedMarketBudget))throw Error('Invalid protected market budget mode');
 const subjectMarket=arg('subject-market','normal');if(!['normal','points-only','none'].includes(subjectMarket))throw Error('Invalid subject market policy');
 const orderBenefits=arg('order-benefits','none');if(!['none','subject','all'].includes(orderBenefits))throw Error('Invalid order benefit mode');
 const fleetDiscipline=arg('fleet-discipline','none');if(!['none','subject','all'].includes(fleetDiscipline))throw Error('Invalid Fleet discipline mode');
 const colonyExecution=arg('colony-execution','none');if(!['none','subject','all'].includes(colonyExecution))throw Error('Invalid Colony execution mode');
 const harvesterHeadroom=arg('harvester-headroom','none');if(!['none','subject','all'].includes(harvesterHeadroom))throw Error('Invalid Harvester headroom mode');
 const optionalConstruction=arg('optional-construction','none');if(!['none','subject','all'].includes(optionalConstruction))throw Error('Invalid optional construction mode');
 const buyDiscount=arg('buy-discount','none');if(!['none','subject','all'].includes(buyDiscount))throw Error('Invalid Buy discount planning mode');
 const constructionDiscipline=arg('construction-discipline','none');if(!['none','subject','all'].includes(constructionDiscipline))throw Error('Invalid construction discipline mode');
 const catalogMarket=arg('catalog-market','false')==='true';
 const protocol={catalogMarket,constructionDiscipline,kind:'native-investment',resourceAccounting:RESOURCE_ACCOUNTING,variant,mode,buyDiscount,optionalConstruction,fleetDiscipline,colonyExecution,harvesterHeadroom,tacticalForecast,militaryHorizon,productionDiscipline,marketFilter,colonyPlanning,protectedMarketBudget,subjectMarket,orderBenefits,target,seedStart,seeds,rotations,profiles,maxRound,binaryHash:hash(fs.readFileSync(frozenBinary)),binary:frozenBinary,sourceHashes:Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,hash(v)])),nativeRandomness:'Deterministic standard policies; zero native RNG draws. Engine RNG recorded in full.'};
 fs.writeFileSync(path.join(out,'protocol.json'),JSON.stringify(protocol,null,2));console.log('Study output: '+out);
 const tasks=[];for(let i=0;i<seeds;i++)for(const rotation of rotations)tasks.push({id:tasks.length,variant,mode,seed:seedStart+7919*i,rotation,target,profiles:profiles.map((_,j)=>profiles[(j+rotation)%4]),maxRound,maxSteps:18000,protocol});
 let next=0,failures=0;const games=[];
 for(let i=0;i<Math.min(Number(arg('workers',1)),tasks.length);i++){
  const worker=new Worker(__filename,{workerData:{sources,archiveRoot,binary:frozenBinary}});
  worker.on('message',msg=>{if(msg.error){failures++;fs.appendFileSync(path.join(out,'errors.jsonl'),JSON.stringify(msg)+'\n');console.error(msg.error);}else{games.push(msg.game);fs.appendFileSync(path.join(out,'results.jsonl'),JSON.stringify(msg.game)+'\n');console.log(`${games.length+failures}/${tasks.length} ${mode} seed=${msg.game.seed} rotation=${msg.game.rotation} rounds=${msg.game.rounds} winner=${msg.game.winner} steps=${msg.game.steps}`);}
   fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({...summarize(games),failures,scheduled:tasks.length},null,2));if(next<tasks.length)worker.postMessage(tasks[next++]);else worker.terminate();if(games.length+failures===tasks.length&&failures)process.exitCode=1;
  });worker.on('error',error=>{console.error(error);process.exitCode=1;});worker.postMessage(tasks[next++]);
 }
}
module.exports={bridge,play};
