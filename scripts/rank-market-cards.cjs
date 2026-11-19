// Controlled full-catalog self-play: one baseline per map, then one-card purchase omissions.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const assert=require('node:assert/strict'),{Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),ROOT=path.resolve(__dirname,'..');
function tasksFor(protocol){
 const tasks=[],common={mode:'updated',target:protocol.target,profiles:['market','market','market','market'],maxRound:protocol.maxRound,maxSteps:18000};
 const add=(seed,rotation,excludeCard)=>{const id=tasks.length,variant=excludeCard?'catalog-omit-'+excludeCard:'catalog-baseline';tasks.push({...common,id,seed,rotation,variant,kind:excludeCard?'omission':'baseline',card:excludeCard,protocol:{...protocol,variant,excludeCard}});};
 for(const seed of protocol.seedList)add(seed,0,null);
 for(const card of protocol.cards)for(const seed of protocol.seedList)for(const rotation of [0,1,2,3])add(seed,rotation,card);
 return tasks;
}
function frozenSources(out){return Object.fromEntries(['app','adapter','rulebook','rust','bridge','lock'].map(k=>[k,fs.readFileSync(path.join(out,'sources',k==='rulebook'?'rulebook.html':['app','adapter'].includes(k)?k+'.js':k+'.txt'),'utf8')]));}
function atomic(file,data){fs.writeFileSync(file+'.tmp',JSON.stringify(data,null,2));fs.renameSync(file+'.tmp',file);}
async function main(){
 const argv=process.argv.slice(2),arg=(k,d)=>{const i=argv.indexOf('--'+k);return i<0?d:argv[i+1];},resume=arg('resume',null);let out,protocol,sources;
 if(resume){out=path.resolve(resume);protocol=JSON.parse(fs.readFileSync(path.join(out,'protocol.json')));sources=frozenSources(out);}
 else{
  const outputRoot=path.resolve(arg('out',path.join(ROOT,'output/card-ranking')));fs.mkdirSync(outputRoot,{recursive:true});out=fs.mkdtempSync(path.join(outputRoot,'run-'));
  fs.mkdirSync(path.join(out,'sources'));const harness=path.join(out,'harness');fs.mkdirSync(path.join(harness,'scripts/lib'),{recursive:true});fs.mkdirSync(path.join(harness,'prototypes/galactic-reach'),{recursive:true});
  const sourceFiles={app:'prototypes/galactic-reach/app.js',adapter:'prototypes/galactic-reach/adapter.js',rulebook:'prototypes/galactic-reach/rulebook.html',rust:'crates/galactic-reach/src/lib.rs',bridge:'crates/galactic-reach/examples/policy-study.rs',lock:'Cargo.lock'};
  sources=Object.fromEntries(Object.entries(sourceFiles).map(([k,file])=>[k,fs.readFileSync(path.join(ROOT,file),'utf8')]));
  for(const [k,content] of Object.entries(sources))fs.writeFileSync(path.join(out,'sources',k==='rulebook'?'rulebook.html':['app','adapter'].includes(k)?k+'.js':k+'.txt'),content);
  fs.writeFileSync(path.join(harness,'prototypes/galactic-reach/rulebook.html'),sources.rulebook);
  for(const asset of ['rulebook.css','index.html','styles.css'])fs.copyFileSync(path.join(ROOT,'prototypes/galactic-reach',asset),path.join(out,'sources',asset));
  fs.copyFileSync(path.join(ROOT,'prototypes/galactic-reach/rulebook.css'),path.join(harness,'prototypes/galactic-reach/rulebook.css'));
  const toolingHashes={};for(const file of ['native-investment-study.cjs','strategic-bot-study.cjs','market-investment-study.cjs','audit-native-resource-ledger.cjs','lib/simulation-archive.cjs']){const bytes=fs.readFileSync(path.join(ROOT,'scripts',file));fs.writeFileSync(path.join(harness,'scripts',file),bytes);toolingHashes[file]=hash(bytes);}
  const binary=arg('native-bin',process.env.GR_NATIVE_POLICY_BIN);if(!binary)throw Error('--native-bin required');fs.copyFileSync(binary,path.join(out,'sources/policy-study'));fs.chmodSync(path.join(out,'sources/policy-study'),0o755);
  const catalogContext=vm.createContext({});vm.runInContext(sources.app,catalogContext);
  let catalog=vm.runInContext('createGalacticReach({catalog:true}).MARKET_CARDS',catalogContext);
  catalog=JSON.parse(JSON.stringify(catalog));
  const count=Number(arg('seeds',32)),start=Number(arg('seed-start',2410010)),target=Number(arg('target',30));assert(Number.isInteger(count)&&count>0&&[30,40].includes(target));
  protocol={kind:'full-catalog-card-ranking',target,maxRound:80,seedList:Array.from({length:count},(_,i)=>start+7919*i),cards:Object.keys(catalog),catalog,catalogMarket:true,resourceAccounting:'receipt-ledger-v2',profiles:['market','market','market','market'],mode:'updated',productionDiscipline:'all',protectedMarketBudget:'all',constructionDiscipline:'all',marketFilter:'off',subjectMarket:'normal',tacticalForecast:'none',militaryHorizon:'none',harvesterHeadroom:'none',optionalConstruction:'none',buyDiscount:'none',colonyPlanning:'none',colonyExecution:'none',orderBenefits:'none',fleetDiscipline:'none',sourceHashes:Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,hash(v)])),toolingHashes,binaryHash:hash(fs.readFileSync(path.join(out,'sources/policy-study'))),driverHash:hash(fs.readFileSync(__filename)),scope:'Four identical Market policies;full finite catalog,two copies per design. Baselines once per seed;one subject card-purchase omission per seed/seat/design. No hidden-deck-order information or free costs. All archives retained.'};
  atomic(path.join(out,'protocol.json'),protocol);fs.copyFileSync(__filename,path.join(out,'rank-driver.cjs'));
 }
 for(const [k,v] of Object.entries(sources))assert.equal(hash(v),protocol.sourceHashes[k]);assert.equal(hash(fs.readFileSync(path.join(out,'sources/policy-study'))),protocol.binaryHash);
 for(const [file,expected] of Object.entries(protocol.toolingHashes))assert.equal(hash(fs.readFileSync(path.join(out,'harness/scripts',file))),expected);
 assert.equal(hash(fs.readFileSync(path.join(out,'rank-driver.cjs'))),protocol.driverHash);
 const tasks=tasksFor(protocol),resultFile=path.join(out,'results.jsonl'),existing=fs.existsSync(resultFile)?fs.readFileSync(resultFile,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[],seen=new Set();
 for(const g of existing){assert(g.completed,'Review incomplete outcomes before resuming');assert(!seen.has(g.id),'Duplicate completed case');seen.add(g.id);assert.deepEqual(g.protocol,tasks[g.id].protocol);assert.equal(g.seed,tasks[g.id].seed);assert.equal(g.rotation,tasks[g.id].rotation);}
 const pending=tasks.filter(t=>!seen.has(t.id));if(fs.existsSync(path.join(out,'tasks.json')))assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out,'tasks.json'))),tasks);else atomic(path.join(out,'tasks.json'),tasks);console.log('Card ranking study: '+out+'; '+existing.length+'/'+tasks.length+' recorded; '+pending.length+' pending');
 if(arg('plan-only','false')==='true'){console.log('Frozen plan only; use --resume '+out+' to execute.');return;}
 let next=0,done=existing.length,failed=0,stopped=false;const workers=[],active=new Map();
 const progress=()=>atomic(path.join(out,'progress.json'),{recorded:done,scheduled:tasks.length,failures:failed,active:[...active.values()].map(t=>({id:t.id,kind:t.kind,card:t.card,seed:t.seed,subjectSeat:(4-t.rotation)%4})),stopped,complete:done===tasks.length&&failed===0});
 if(!pending.length){progress();return;}
 const maxWorkers=Math.min(Number(arg('workers',8)),pending.length);assert(Number.isInteger(maxWorkers)&&maxWorkers>0);
 for(let i=0;i<maxWorkers;i++){
  const w=new Worker(path.join(out,'rank-driver.cjs'),{workerData:{runner:path.join(out,'harness/scripts/native-investment-study.cjs'),sources,archiveRoot:path.join(out,'games'),binary:path.join(out,'sources/policy-study')}});workers.push(w);
  const send=()=>{if(stopped||next>=pending.length){active.delete(w);progress();w.terminate();return;}const task=pending[next++];active.set(w,task);w.postMessage(task);progress();};
  w.on('message',m=>{const task=active.get(w);assert(task);active.delete(w);
   if(m.error){failed++;stopped=true;fs.appendFileSync(path.join(out,'errors.jsonl'),JSON.stringify({task,error:m.error})+'\n');console.error(m.error);process.exitCode=1;}
   else{assert.equal(m.game.id,task.id);assert.deepEqual(m.game.protocol,task.protocol);fs.appendFileSync(resultFile,JSON.stringify(m.game)+'\n');done++;if(!m.game.completed){stopped=true;process.exitCode=1;console.error('Incomplete game '+task.id+' retained; review before continuing.');}if(done%16===0||task.kind==='baseline'||done===tasks.length)console.log(done+'/'+tasks.length+' completed; latest '+task.kind+' '+(task.card||'')+' seed='+task.seed+' seat='+((4-task.rotation)%4));}
   send();
  });
  w.on('error',error=>{failed++;stopped=true;console.error(error);process.exitCode=1;progress();});send();
 }
 process.on('SIGINT',()=>{stopped=true;progress();console.log('Stopping new scheduling; current games finish and all archives remain.');});
}
if(!isMainThread){const {play}=require(workerData.runner);parentPort.on('message',async task=>{try{parentPort.postMessage({game:await play(task,workerData.sources,workerData.archiveRoot,workerData.binary)});}catch(e){parentPort.postMessage({error:e.stack});}});}
else if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={tasksFor};
