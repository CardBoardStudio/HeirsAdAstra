// Full browser-policy games for CPU profiling and deterministic optimization checks.
// No rules, costs, hidden-information access or RNG calls are substituted.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{performance}=require('node:perf_hooks'),inspector=require('node:inspector');
const {factory}=require('./strategic-bot-study.cjs');
const root=path.resolve(__dirname,'..'),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const baseline=(ref='HEAD')=>execFileSync('git',['show',`${ref}:prototypes/galactic-reach/app.js`],{cwd:root,encoding:'utf8',maxBuffer:20e6});
const current=()=>fs.readFileSync(path.join(root,'prototypes/galactic-reach/app.js'),'utf8');
const adapter=()=>fs.readFileSync(path.join(root,'prototypes/galactic-reach/adapter.js'),'utf8');
function simulate(app,task,{trace=true,counters=false}={}){
  let seed=task.seed>>>0,rngCalls=0;
  const random=()=>{rngCalls++;return((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);};
  const counts={};
  if(counters){
    const hook=['aiFundingPlan','chooseAiBuild','chooseAiMove','aiPath','travelSearch','movementRoutes','travelDistance','aiThreat'].map(name=>`{const fn=${name};${name}=(...args)=>{options.searchCounts['${name}']=(options.searchCounts['${name}']||0)+1;return fn(...args);};}`).join('\n');
    app=app.replace('  if (headless && options.resume) {',hook+'\n  if (headless && options.resume) {');
  }
  const start=performance.now(),{e}=factory(app,adapter())({random,victoryTarget:40,searchCounts:counts,studyPolicies:task.studyPolicies});
  e.state.players.forEach((p,id)=>p.strategy=task.profiles[id]);
  const stream=crypto.createHash('sha256'),states=[];
  const record=()=>{if(trace){const hash=sha(JSON.stringify(e.state));stream.update(hash+':'+rngCalls+'\n');states.push(hash);}};
  record();let steps=0;
  while(e.state.winner===null&&e.state.round<=100&&steps<30000){
    if(e.state.pendingCombat){const id=e.combatActor();e.applyCombatAction(id,e.chooseCombatAction(e.combatView(id),e.combatActions(id)));}
    else if(e.state.phase==='operations')e.runAiOperation();
    else if(e.state.phase==='buy')e.runAiBuy();
    else throw Error('Unexpected phase '+e.state.phase);
    steps++;record();
  }
  assert.notEqual(e.state.winner,null,'Game did not finish');
  return {...task,steps,round:e.state.round,winner:e.state.winner,points:Array.from(e.state.players,(_,id)=>e.calculatePrestige(id)),rngCalls,stateHash:sha(JSON.stringify(e.state)),traceHash:trace?stream.digest('hex'):null,states,counts,milliseconds:performance.now()-start};
}
const tasks=Array.from({length:4},(_,i)=>({seed:2026112501+i*7919,profiles:['military','military','economy','expansion'].map((_,j)=>['military','military','economy','expansion'][(i+j)%4])}));
async function main(){
  const args=process.argv.slice(2),get=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
  const mode=get('--mode','compare'),out=path.resolve(get('--out','output/search-performance')),baselineRef=get('--baseline','HEAD');
  fs.mkdirSync(out,{recursive:true});
  if(mode==='profile'){
    const variant=get('--variant','baseline'),app=variant==='baseline'?baseline(baselineRef):current();
    assert(['baseline','optimized'].includes(variant),'Variant must be baseline or optimized');
    const session=new inspector.Session();session.connect();
    const post=(name,params={})=>new Promise((resolve,reject)=>session.post(name,params,(err,result)=>err?reject(err):resolve(result)));
    await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:1000});await post('Profiler.start');
    const game=simulate(app,tasks[0],{trace:false});
    const {profile}=await post('Profiler.stop');session.disconnect();
    fs.writeFileSync(path.join(out,variant+'.cpuprofile'),JSON.stringify(profile));
    const counted=simulate(app,tasks[0],{trace:false,counters:true});
    assert.equal(counted.stateHash,game.stateHash);assert.equal(counted.rngCalls,game.rngCalls);
    delete counted.states;delete game.states;
    fs.writeFileSync(path.join(out,variant+'-profile.json'),JSON.stringify({baselineRef,sourceHash:sha(app),game,counts:counted.counts},null,2));
    console.log(JSON.stringify({variant,milliseconds:game.milliseconds,counts:counted.counts}));
  }else if(mode==='compare'){
    const optimizedRef=get('--optimized-ref',null),results=[],original=baseline(baselineRef),optimized=optimizedRef?baseline(optimizedRef):current(),count=Number(get('--games',8));
    assert(Number.isInteger(count)&&count>0&&count<=128,'Games must be an integer from 1 to 128');
    for(let i=0;i<count;i++){
      const task=i<4?tasks[i]:{seed:2026112501+i*7919,profiles:tasks[i%4].profiles};
      // Alternate ordering to reduce warmup/host-load bias.
      const pair={};for(const variant of (i%2?['optimized','baseline']:['baseline','optimized']))pair[variant]=simulate(variant==='baseline'?original:optimized,task);
      const a=pair.baseline,b=pair.optimized;
      assert.deepEqual(b.states,a.states,`Per-decision state differs for seed ${task.seed}`);
      for(const k of ['traceHash','stateHash','rngCalls','winner','round','steps','points'])assert.deepEqual(b[k],a[k],`${k} differs for seed ${task.seed}`);
      delete a.states;delete b.states;results.push(pair);
      fs.writeFileSync(path.join(out,'comparison.json'),JSON.stringify({baselineRef,optimizedRef,baselineSourceHash:sha(original),optimizedSourceHash:sha(optimized),games:results.length,results},null,2));
      console.log(`${i+1}/${count} seed=${task.seed}: identical ${a.steps} decisions, RNG=${a.rngCalls}; ${a.milliseconds.toFixed(0)} -> ${b.milliseconds.toFixed(0)} ms`);
    }
  }else throw Error('Unknown mode '+mode);
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={simulate,tasks};
