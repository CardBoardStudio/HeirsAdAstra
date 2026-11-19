// Matched browser-versus-native free-for-all games over identical current rules.
// Retain every source, random draw, private state and decision through the common archive.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {factory,RESOURCE_ACCOUNTING}=require('./strategic-bot-study.cjs');
const {instrument}=require('./market-investment-study.cjs');
const {bridge}=require('./native-investment-study.cjs');
const {SimulationArchive,hash}=require('./lib/simulation-archive.cjs');
const RES=['matter','energy','biomass','data'],blank=()=>Object.fromEntries(RES.map(r=>[r,0]));
async function play(task,sources,directory,binary){
 if(task.profiles.length!==4||task.profiles.some(p=>!['market','military','economy','expansion'].includes(p))
   ||task.implementations.length!==4||task.implementations.filter(x=>x==='browser').length!==2
   ||task.implementations.filter(x=>x==='native').length!==2)throw Error('Tournament requires four known roles and two of each implementation');
 const recorder=new SimulationArchive({directory,metadata:task,rulebookSource:sources.rulebook,sources:{'rulebook.html':sources.rulebook,'bot-family-study.cjs':fs.readFileSync(__filename,'utf8'),'native-policy.rs':sources.rust,'native-bridge.rs':sources.bridge,'Cargo.lock':sources.lock}});
 const metrics=Array.from({length:4},()=>({gained:blank(),lost:blank(),spent:blank(),bankGiven:blank(),bankReceived:blank(),ships:{settler:0,explorer:0,fleet:0},draws:0,upgrades:0,colonizations:0,captures:0}));
 const market=Array.from({length:4},()=>({marketBuys:{},marketPlays:{},militaryTacticPlays:{},harvestersBuilt:0,firstHarvesterRound:null,firstMarketRound:null,buyTurns:0,affordableOffers:0,valuableOffers:0}));
 let seed=task.seed>>>0,steps=0,native;const started=Date.now();
 try{
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  const {e,a}=factory(instrument(sources.app).replace('ALL_CARDS[card.key].cost&&','(ALL_CARDS[card.key].cost||RELIC_CARDS[card.key])&&'),sources.adapter)({random,victoryTarget:task.target,studyMetrics:metrics,marketMetrics:market,simulationArchive:recorder,archiveSources:{'original-app.js':sources.app,'original-adapter.js':sources.adapter,'protocol.json':JSON.stringify(task.protocol)}});
  const mapHash=hash({planets:e.state.planets,clusters:e.state.clusters});
  recorder.invoke({method:'study-lineup',profiles:task.profiles},()=>e.state.players.forEach((p,id)=>{p.strategy=task.profiles[id];p.name=(task.implementations[id]==='browser'?'Browser':'Rust')+' '+p.strategy; }));
  if(task.maxSteps>0&&task.implementations.includes('native'))native=bridge(binary);
  // Direct browser orders bypass the adapter's command cache. A fresh command
  // port per decision prevents a native opponent from seeing the previous seat's legal list.
  const freshAdapter=vm.runInNewContext(sources.adapter+';createGalacticAdapter',{});
  const buyStarts=new Set();
  while(e.state.winner===null&&e.state.round<=task.maxRound&&steps<task.maxSteps){
   const commands=freshAdapter(e),actor=commands.activeSeat(),observation=commands.observe(actor),legal=commands.legalActions(actor);if(!legal.length)throw Error('No legal action');
   const buyKey=e.state.round+':'+actor;if(e.state.phase==='buy'&&!buyStarts.has(buyKey)){buyStarts.add(buyKey);if(task.implementations[actor]==='native')market[actor].buyTurns++;}
   const before=JSON.stringify(a.snapshotState());
   if(task.implementations[actor]==='browser'){
    recorder.event({type:'browser-choice',step:steps,actor,profile:task.profiles[actor],observationHash:hash(observation),legalHash:hash(legal)});
    if(e.state.pendingCombat)e.applyCombatAction(actor,e.chooseCombatAction(e.combatView(actor),e.combatActions(actor)));
    else if(e.state.phase==='operations')e.runAiOperation();
    else if(e.state.phase==='buy')e.runAiBuy();
    else throw Error('Unexpected phase '+e.state.phase);
   }else{
    const response=await native.choose(task.profiles[actor],observation,legal);
    if(response.nativeRandomDraws!==0||!Number.isInteger(response.index)||!legal[response.index])throw Error('Invalid native choice');
    recorder.event({type:'native-choice',step:steps,actor,profile:task.profiles[actor],policy:response.policy,observationHash:hash(observation),legalHash:hash(legal),index:response.index,nativeRandomDraws:0});
    recorder.invoke({method:'applyAction',actor,action:legal[response.index]},()=>commands.applyAction(actor,legal[response.index]));
   }
   steps++;if(before===JSON.stringify(a.snapshotState()))throw Error('Stalled game at step '+steps);
  }
  const s=e.state;
  const result={...task,mapHash,resourceAccounting:RESOURCE_ACCOUNTING,archive:recorder.directory,completed:s.winner!==null,winner:s.winner,rounds:s.round,steps,stalled:false,milliseconds:Date.now()-started,
   players:s.players.map((p,id)=>({seat:id,name:p.name,profile:p.strategy,implementation:task.implementations[id],points:e.calculatePrestige(id),colonies:e.colonyPlanets(id).length,relics:p.relicsExcavated,combatWins:p.combatVictories,cardPoints:p.cardPrestige||0,production:e.aiIncome(id),resources:p.resources,limits:e.resourceLimits(id),cards:p.hand.length+p.deck.length+p.discard.length+p.inPlay.length,...metrics[id],...market[id]}))};
  recorder.finish({reason:result.completed?'victory':'limit',incomplete:!result.completed,summary:result});return result;
 }catch(error){recorder.finish({reason:'error',incomplete:true,error:{message:error.message,stack:error.stack},steps});throw error;}finally{native?.close();}
}
module.exports={play};
