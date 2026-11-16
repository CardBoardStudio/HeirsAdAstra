// Matched solo-browser policies. No tactical outcomes, legal actions, costs or RNG are replaced.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {SimulationArchive,instrumentSource,hash,resultDirectory}=require('./lib/simulation-archive.cjs');
const RUNNER_SOURCE=fs.readFileSync(__filename,'utf8');
const root=path.resolve(__dirname,'..'),profiles=['military','economy','expansion'];
const baseDefault='d3e3ab6a672e330aa3a69eddd9c2d5b537ab76fa';
const plain=v=>JSON.parse(JSON.stringify(v));
function factory(app,adapter) {
  const guard="if (state.pendingCombat || state.phase !== 'operations' || state.activePlayer === ME || state.winner !== null) return;";
  if(!app.includes(guard))throw Error('Browser policy guard changed; review harness');
  app=app.replace(guard,guard.replace(' || state.activePlayer === ME',''));
  app=app.replace('      clone, deckContents,','      runAiOperation, runAiBuy, chooseCombatAction, aiIncome, clone, deckContents,');
  const metrics=`
  const m=options.studyMetrics;
  if(m) {
    const add=addResources;addResources=(p,g)=>{const r=add(p,g);for(const k of RESOURCES){m[p.id].gained[k]+=(g[k]||0);m[p.id].lost[k]+=r.lost[k]||0;}return r;};
    const pay=payCost;payCost=(p,...args)=>{const b={...p.resources};const r=pay(p,...args);for(const k of RESOURCES)m[p.id].spent[k]+=b[k]-p.resources[k];return r;};
    const draw=drawCards;drawCards=(p,n)=>{const b=p.hand.length;const r=draw(p,n);m[p.id].draws+=p.hand.length-b;return r;};
    const upgrade=upgradeStarter;upgradeStarter=(id,card,r)=>{const p=state.players[id],b=p.resources[r],ok=upgrade(id,card,r);if(ok){m[id].spent[r]+=b-p.resources[r];m[id].upgrades++;}return ok;};
    const trade=bankTrade;bankTrade=(id,give,get)=>{const ok=trade(id,give,get);if(ok){m[id].bankGiven[give]+=4;m[id].bankReceived[get]++;}return ok;};
    const ship=buildShip;buildShip=(id,coord,type,...args)=>{const ok=ship(id,coord,type,...args);if(ok&&!args[1])m[id].ships[type]++;return ok;};
    const settle=colonizePlanet;colonizePlanet=(id,coord,opts={},dry=false)=>{const owner=state.planets[coord]?.owner,ok=settle(id,coord,opts,dry);if(ok&&!dry){m[id].colonizations++;if(owner!==null&&owner!==undefined)m[id].captures++;}return ok;};
  }
`;
  if(!app.includes('  if (headless && options.resume) {'))throw Error('Resume bootstrap changed');
  app=app.replace('  if (headless && options.resume) {',metrics+'\n  if (headless && options.resume) {');
  app=instrumentSource(app);
  let activeArchive;
  const c=vm.createContext({console:Object.fromEntries(['log','warn','error'].map(level=>[level,(...args)=>activeArchive?.event({type:'console',level,args})])),setTimeout:()=>0,clearTimeout(){}});
  vm.runInContext(adapter+'\n'+app,c);
  let e;const original=c.createGalacticAdapter;c.createGalacticAdapter=port=>{e=port;return original(port);};
  return options=>{
    const configuration=Object.fromEntries(Object.entries(options).filter(([key,value])=>!['random','simulationArchive','studyMetrics','reconstruction','resume','archiveSources','archiveMetadata'].includes(key)&&typeof value!=='function'));
    const recorder=options.simulationArchive||new SimulationArchive({directory:options.archiveDirectory,metadata:options.archiveMetadata||{kind:'browser-policy',victoryTarget:options.victoryTarget||40},sources:{'study-runner.cjs':RUNNER_SOURCE}});
    activeArchive=recorder;const engineHash=hash(app),adapterHash=hash(adapter);
    recorder.addSources({'study-runner.cjs':RUNNER_SOURCE,...(options.archiveSources||{}),['engine-'+engineHash+'.js']:app,['adapter-'+adapterHash+'.js']:adapter});
    try{
      const a=c.createGalacticReach({...options,headless:true,random:recorder.random(options.random||Math.random),simulationArchiveEvent:event=>recorder.event(event)});
      recorder.attach(()=>e.state,{engineHash,adapterHash,policy:options.archivePolicy||null,configuration:{...configuration,headless:true}},()=>({turnSerial:e.turnSerial,cardSerial:e.cardSerial}));
      for(const name of ['runAiOperation','runAiBuy','applyCombatAction']){const fn=e[name];e[name]=(...args)=>recorder.invoke({method:name,actor:e.state.pendingCombat?e.combatActor():e.state.activePlayer,args},()=>fn(...args));}
      const apply=a.applyAction;a.applyAction=(...args)=>recorder.invoke({method:'applyAction',actor:args[0],action:args[1]},()=>apply(...args));
      return {e,a,archive:recorder};
    }catch(error){recorder.finish({reason:'initialization-error',incomplete:true,error:{message:error.message,stack:error.stack}});throw error;}
  };
}
function simulate(task,sources) {
  const recorder=new SimulationArchive({metadata:{kind:'strategic-study',target:40,maxRound:50,maxSteps:12000,...task},sources:Object.fromEntries(Object.entries(sources).flatMap(([policy,s])=>[[policy+'-app.js',s.app],[policy+'-adapter.js',s.adapter]]))});
  try{
  let seed=task.seed>>>0;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  const resources=()=>({matter:0,energy:0,biomass:0,data:0});
  const metrics=Array.from({length:4},()=>({gained:resources(),lost:resources(),spent:resources(),bankGiven:resources(),bankReceived:resources(),ships:{settler:0,explorer:0,fleet:0},draws:0,upgrades:0,colonizations:0,captures:0}));
  const build={};for(const key of new Set(task.policies))build[key]=factory(sources[key].app,sources[key].adapter);
  let current=task.policies[0],game=build[current]({random,studyMetrics:metrics,victoryTarget:40,simulationArchive:recorder,archivePolicy:current});
  game.e.state.players.forEach((p,i)=>{p.strategy=task.profiles[i];});
  const mapHash=crypto.createHash('sha256').update(JSON.stringify({planets:game.e.state.planets,clusters:game.e.state.clusters})).digest('hex');
  let steps=0,stalled=false;
  const started=Date.now();
  while(game.e.state.winner===null&&game.e.state.round<=50&&steps<12000) {
    const {e}=game,s=e.state,actor=s.pendingCombat?e.combatActor():s.activePlayer,policy=task.policies[actor];
    if(policy!==current){const resume=game.a.snapshotState();current=policy;game=build[policy]({random,studyMetrics:metrics,resume,simulationArchive:recorder,archivePolicy:policy});}
    const before=JSON.stringify([game.e.state.activePlayer,game.e.state.phase,game.e.state.pendingCombat,game.e.state.players[actor].hand,game.e.turnSerial]);
    if(game.e.state.pendingCombat){const id=game.e.combatActor();game.e.applyCombatAction(id,game.e.chooseCombatAction(game.e.combatView(id),game.e.combatActions(id)));}
    else if(game.e.state.phase==='operations')game.e.runAiOperation();
    else if(game.e.state.phase==='buy')game.e.runAiBuy();
    else throw Error('Unexpected phase '+game.e.state.phase);
    steps++;
    const after=JSON.stringify([game.e.state.activePlayer,game.e.state.phase,game.e.state.pendingCombat,game.e.state.players[actor].hand,game.e.turnSerial]);
    if(before===after){stalled=true;break;}
  }
  const {e}=game,s=e.state;
  const result={...task,archive:recorder.directory,mapHash,completed:s.winner!==null,winner:s.winner,round:s.round,steps,stalled,milliseconds:Date.now()-started,
    players:s.players.map((p,id)=>({seat:id,profile:p.strategy,policy:task.policies[id],points:e.calculatePrestige(id),colonies:e.colonyPlanets(id).length,relics:p.relicsExcavated,combatWins:p.combatVictories,cardPoints:p.cardPrestige,
      levelIII:e.deckContents(p).filter(c=>c.level===3).reduce((n,c)=>n+c.count,0)+[...p.hand,...p.discard,...p.inPlay].filter(c=>c.level===3).length,
      cards:p.hand.length+p.deck.length+p.discard.length+p.inPlay.length,limits:e.resourceLimits(id),production:e.aiIncome(id),resources:p.resources,cardsPurchased:p.cardsPurchased,...metrics[id]}))};
  recorder.finish({reason:result.completed?'victory':result.stalled?'stalled':'limit',incomplete:!result.completed,summary:result});return result;
  }catch(error){recorder.finish({reason:'error',incomplete:true,error:{message:error.message,stack:error.stack}});throw error;}
}
function summarize(games) {
  const mean=xs=>xs.reduce((a,b)=>a+b,0)/(xs.length||1),result={games:games.length,completed:games.filter(g=>g.completed).length,incomplete:games.filter(g=>!g.completed).map(g=>({seed:g.seed,rotation:g.rotation,mode:g.mode,stalled:g.stalled,round:g.round,steps:g.steps})),profiles:{},policies:{},seats:{}};
  result.meanRounds=mean(games.filter(g=>g.completed).map(g=>g.round));
  for(const [group,keys] of [['profiles',profiles],['policies',['baseline','updated']],['seats',[0,1,2,3]]])for(const key of keys) {
    const rows=games.flatMap(g=>g.players.filter(p=>p[group==='profiles'?'profile':group==='policies'?'policy':'seat']===key).map(p=>({...p,win:g.completed&&g.winner===p.seat,complete:g.completed})));
    const completed=rows.filter(p=>p.complete);
    result[group][key]={seats:rows.length,wins:completed.filter(p=>p.win).length,winRate:completed.filter(p=>p.win).length/(completed.length||1),meanPoints:mean(rows.map(p=>p.points)),meanDraws:mean(rows.map(p=>p.draws)),meanIII:mean(rows.map(p=>p.levelIII)),meanPurchases:mean(rows.map(p=>p.cardsPurchased)),meanColony:mean(rows.map(p=>p.colonies)),meanCombat:mean(rows.map(p=>p.combatWins)),resources:{}};
    for(const r of ['matter','energy','biomass','data'])result[group][key].resources[r]=Object.fromEntries(['gained','spent','lost','bankGiven','bankReceived'].map(stat=>[stat,mean(rows.map(p=>p[stat][r]))]));
  }
  return result;
}
if(!isMainThread) {
  parentPort.on('message',task=>{try{parentPort.postMessage({game:simulate(task,workerData.sources)});}catch(e){parentPort.postMessage({error:e.stack,task});}});
} else if(require.main===module) {
  const args=process.argv.slice(2),arg=(name,fallback)=>{const at=args.indexOf('--'+name);return at<0?fallback:args[at+1];};
  const baseline=arg('baseline',baseDefault);if(!/^[0-9a-f]{40}$/.test(baseline))throw Error('Baseline must be an exact commit');
  const count=Number(arg('seeds',8)),seedStart=Number(arg('seed-start',910701)),rotations=arg('rotations','0,1,2,3').split(',').map(Number),duplicates=arg('duplicates',profiles.join(',')).split(','),modes=arg('modes','baseline,updated,mixed').split(',');
  const out=resultDirectory(arg('out','analysis/strategic-bots-results')),runId=crypto.randomUUID();console.log('Study output: '+out);
  const sources={baseline:{},updated:{}};
  for(const asset of ['app','adapter']){sources.baseline[asset]=execFileSync('git',['show',`${baseline}:prototypes/galactic-reach/${asset}.js`],{cwd:root,encoding:'utf8',maxBuffer:20e6});sources.updated[asset]=fs.readFileSync(path.join(root,`prototypes/galactic-reach/${asset}.js`),'utf8');}
  const tasks=[];
  for(let n=0;n<count;n++)for(const duplicate of duplicates)for(const rotation of rotations)for(const mode of modes)for(let complement=0;complement<(mode==='mixed'?2:1);complement++) {
    const base=[duplicate,...profiles],seatProfiles=base.map((_,i)=>base[(i+rotation)%4]);
    tasks.push({runId,baselineRef:baseline,seed:seedStart+n*7919,duplicate,rotation,mode,complement,profiles:seatProfiles,policies:seatProfiles.map((_,i)=>mode==='mixed'?(i+complement*2)%4<2?'updated':'baseline':mode)});
  }
  const metadata={runId,baseline,seeds:count,seedStart,rotations,duplicates,modes,target:40,maxRound:50,maxSteps:12000,sourceHashes:Object.fromEntries(Object.entries(sources).map(([k,s])=>[k,crypto.createHash('sha256').update(s.app+s.adapter).digest('hex')])),tasks:tasks.length};
  tasks.forEach(task=>{task.studyProtocol=metadata;});
  fs.writeFileSync(path.join(out,'protocol.json'),JSON.stringify(metadata,null,2));
  const raw=path.join(out,'games.jsonl');fs.writeFileSync(raw,'');const games=[];let next=0,failed=false;
  const workers=Array.from({length:Math.min(Number(arg('workers',4)),tasks.length)},()=>new Worker(__filename,{workerData:{sources}}));
  workers.forEach(worker=>{
    worker.on('message',message=>{
      if(message.error){fs.appendFileSync(path.join(out,'errors.jsonl'),JSON.stringify(message)+'\n');failed=true;console.error(message.error,JSON.stringify(message.task));process.exitCode=1;workers.forEach(w=>w.terminate());return;}
      games.push(message.game);fs.appendFileSync(raw,JSON.stringify(message.game)+'\n');
      console.log(`${games.length}/${tasks.length} ${message.game.mode} seed=${message.game.seed} r=${message.game.round} winner=${message.game.winner} ${message.game.milliseconds}ms`);
      if(next<tasks.length)worker.postMessage(tasks[next++]);else worker.terminate();
      if(games.length===tasks.length&&!failed){const summaries=Object.fromEntries(modes.map(mode=>[mode,summarize(games.filter(g=>g.mode===mode))]));fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summaries,null,2));console.log(JSON.stringify(summaries));}
    });worker.on('error',e=>{console.error(e);process.exitCode=1;workers.forEach(w=>w.terminate());});worker.postMessage(tasks[next++]);
  });
}
module.exports={factory,simulate,summarize};
