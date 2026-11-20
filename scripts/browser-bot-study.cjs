// Canonical current-browser study runner. No separate policy, native bridge or binary.
const fs=require('node:fs'),path=require('node:path');
const {factory}=require('./strategic-bot-study.cjs');
const {SimulationArchive,resultDirectory,hash}=require('./lib/simulation-archive.cjs');
const ROOT=path.resolve(__dirname,'..'),PROFILES=['military','economy','market','expansion'];
function play(task,sources,directory){
 if(task.profiles.length!==4||task.profiles.some(p=>!PROFILES.includes(p)))throw Error('Choose four browser profiles');
 const recorder=new SimulationArchive({directory,metadata:{...task,policyFamily:'browser'},rulebookSource:sources.rulebook,sources:{'browser-study.cjs':fs.readFileSync(__filename,'utf8'),'original-app.js':sources.app,'original-adapter.js':sources.adapter}});
 let seed=task.seed>>>0,steps=0;
 try{
  const {e,a}=factory(sources.app,sources.adapter)({browserPolicy:true,random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32),victoryTarget:task.target,simulationArchive:recorder});
  e.state.players.forEach((p,id)=>p.strategy=task.profiles[id]);
  while(e.state.winner===null&&e.state.round<=task.maxRound&&steps<task.maxSteps){
   const actor=a.activeSeat(),before=JSON.stringify(a.snapshotState());
   a.browserStep(actor,task.profiles[actor]);steps++;
   if(JSON.stringify(a.snapshotState())===before)throw Error('Browser policy made no progress');
  }
  const result={...task,archive:recorder.directory,policyFamily:'browser',completed:e.state.winner!==null,winner:e.state.winner,rounds:e.state.round,steps,players:e.state.players.map((p,id)=>({seat:id,profile:p.strategy,points:e.calculatePrestige(id),production:e.aiIncome(id),resources:p.resources,limits:e.resourceLimits(id)}))};
  recorder.finish({reason:result.completed?'victory':'limit',incomplete:!result.completed,summary:result});return result;
 }catch(error){recorder.finish({reason:'error',incomplete:true,steps,error:{message:error.message,stack:error.stack}});throw error;}
}
if(require.main===module){
 const args=process.argv.slice(2),arg=(key,fallback)=>{const at=args.indexOf('--'+key);return at<0?fallback:args[at+1];};
 if(args.includes('--native-bin'))throw Error('Rust bots are archived; this runner uses browser policies only');
 const seeds=Number(arg('seeds',1)),start=Number(arg('seed-start',2026111801)),target=Number(arg('target',30)),maxRound=Number(arg('max-round',100)),maxSteps=Number(arg('max-steps',50000)),profiles=arg('profiles','market,military,economy,expansion').split(',');
 if(!Number.isInteger(seeds)||seeds<1||![20,30,40,50,60].includes(target)||!Number.isInteger(maxRound)||maxRound<1||!Number.isInteger(maxSteps)||maxSteps<1||profiles.length!==4||profiles.some(p=>!PROFILES.includes(p)))throw Error('Invalid browser study options');
 const sources=Object.fromEntries(['app','adapter','rulebook'].map(k=>[k,fs.readFileSync(path.join(ROOT,'prototypes/galactic-reach',k+(k==='rulebook'?'.html':'.js')),'utf8')]));
 const out=resultDirectory(arg('out',process.env.GR_SIMULATION_ARCHIVE_DIR||path.join(ROOT,'output/browser-study'))),tasks=[];
 for(let map=0;map<seeds;map++)for(let rotation=0;rotation<4;rotation++)tasks.push({id:tasks.length,seed:start+map*7919,rotation,target,maxRound,maxSteps,profiles:profiles.map((_,i)=>profiles[(i+rotation)%4])});
 fs.writeFileSync(path.join(out,'protocol.json'),JSON.stringify({policyFamily:'browser',target,tasks,sourceHashes:Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,hash(v)]))},null,2));
 for(const task of tasks){const result=play(task,sources,path.join(out,'games'));fs.appendFileSync(path.join(out,'games.jsonl'),JSON.stringify(result)+'\n');console.log(JSON.stringify({id:task.id,completed:result.completed,winner:result.winner,archive:result.archive}));}
}
module.exports={play};
