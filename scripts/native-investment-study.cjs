// Actual native standard policies over the authoritative browser adapter, with full archives.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),readline=require('node:readline');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {factory}=require('./strategic-bot-study.cjs'),{instrument,summarize}=require('./market-investment-study.cjs');
const {SimulationArchive,resultDirectory,hash}=require('./lib/simulation-archive.cjs');
const ROOT=path.resolve(__dirname,'..'),RUNNER=fs.readFileSync(__filename,'utf8'),RES=['matter','energy','biomass','data'];
const blank=()=>Object.fromEntries(RES.map(r=>[r,0]));
function bridge(binary){
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
 const recorder=new SimulationArchive({directory,metadata:task,rulebookSource:sources.rulebook,sources:{'native-study.cjs':RUNNER,'native-policy.rs':sources.rust,'native-bridge.rs':sources.bridge,'Cargo.lock':sources.lock}});
 let seed=task.seed>>>0;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
 const metrics=Array.from({length:4},()=>({gained:blank(),lost:blank(),spent:blank(),bankGiven:blank(),bankReceived:blank(),ships:{settler:0,explorer:0,fleet:0},draws:0,upgrades:0,colonizations:0,captures:0}));
 const market=Array.from({length:4},()=>({marketBuys:{},marketPlays:{},militaryTacticPlays:{},harvestersBuilt:0,firstHarvesterRound:null,firstMarketRound:null,buyTurns:0,affordableOffers:0,valuableOffers:0}));
 let native,game,steps=0;const started=Date.now(),subjectSeat=(4-task.rotation)%4,buyStarts=new Set();
 try{
  native=bridge(binary);game=factory(instrument(sources.app),sources.adapter)({random,victoryTarget:task.target,studyMetrics:metrics,marketMetrics:market,simulationArchive:recorder,archiveSources:{'original-app.js':sources.app,'original-adapter.js':sources.adapter,'protocol.json':JSON.stringify(task.protocol)}});
  const {e,a}=game;e.state.players.forEach((p,id)=>p.strategy=task.profiles[id]);const mapHash=hash({planets:e.state.planets,clusters:e.state.clusters});let stalled=false;
  while(e.state.winner===null&&e.state.round<=task.maxRound&&steps<task.maxSteps){
   const actor=a.activeSeat(),observation=a.observe(actor),legal=a.legalActions(actor);if(!legal.length)throw Error('No legal native action');
   const updated=task.mode==='updated'||task.mode==='mixed'&&actor===subjectSeat;
   if(!updated){delete observation.investmentPlanning;delete observation.marketPaymentCosts;}
   const buyKey=e.state.round+':'+actor;if(e.state.phase==='buy'&&!buyStarts.has(buyKey)){buyStarts.add(buyKey);market[actor].buyTurns++;}
   const response=await native.choose(task.profiles[actor],observation,legal);
   if(response.nativeRandomDraws!==0||!Number.isInteger(response.index)||!legal[response.index])throw Error('Invalid native policy result');
   recorder.event({type:'native-choice',step:steps,actor,updated,profile:task.profiles[actor],policy:response.policy,observationHash:hash(observation),legalHash:hash(legal),index:response.index,nativeRandomDraws:0});
   const before=JSON.stringify(a.snapshotState());a.applyAction(actor,legal[response.index]);steps++;
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
 if(![20,30,40,50,60].includes(target)||!['control','mixed','updated'].includes(mode)||profiles.length!==4||profiles.some(p=>!['economy','military','expansion'].includes(p)))throw Error('Invalid native protocol');
 const sourceDir=arg('source-dir',path.join(ROOT,'prototypes/galactic-reach')),nativeDir=arg('native-source-dir',null);
 const sources={app:fs.readFileSync(path.join(sourceDir,'app.js'),'utf8'),adapter:fs.readFileSync(path.join(sourceDir,'adapter.js'),'utf8'),rulebook:fs.readFileSync(path.join(sourceDir,'rulebook.html'),'utf8'),rust:fs.readFileSync(nativeDir?path.join(nativeDir,'rust.txt'):path.join(ROOT,'crates/galactic-reach/src/lib.rs'),'utf8'),bridge:fs.readFileSync(nativeDir?path.join(nativeDir,'bridge.txt'):path.join(ROOT,'crates/galactic-reach/examples/policy-study.rs'),'utf8'),lock:fs.readFileSync(nativeDir?path.join(nativeDir,'lock.txt'):path.join(ROOT,'Cargo.lock'),'utf8')};
 const out=resultDirectory(arg('out',path.join(ROOT,'output/native-investment'))),archiveRoot=path.join(out,'games');fs.mkdirSync(path.join(out,'sources'));const frozenBinary=path.join(out,'sources/policy-study');fs.copyFileSync(binary,frozenBinary);fs.chmodSync(frozenBinary,0o755);
 for(const [k,v] of Object.entries(sources))fs.writeFileSync(path.join(out,'sources',k==='rulebook'?'rulebook.html':k==='app'||k==='adapter'?k+'.js':k+'.txt'),v);fs.writeFileSync(path.join(out,'sources/runner.cjs'),RUNNER);
 const protocol={kind:'native-investment',variant,mode,target,seedStart,seeds,rotations,profiles,maxRound,binaryHash:hash(fs.readFileSync(frozenBinary)),binary:frozenBinary,sourceHashes:Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,hash(v)])),nativeRandomness:'Deterministic standard policies; zero native RNG draws. Engine RNG recorded in full.'};
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
