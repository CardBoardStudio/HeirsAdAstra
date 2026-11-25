const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {SimulationArchive,readArchive,resultDirectory,patch,applyPatch,hash}=require('./lib/simulation-archive.cjs');
const {factory}=require('./strategic-bot-study.cjs');
// Corruption fixtures must never touch a caller's production source pool.
const originalSourcePool=process.env.GR_SIMULATION_SOURCE_POOL_DIR;delete process.env.GR_SIMULATION_SOURCE_POOL_DIR;
const root=fs.mkdtempSync(path.join(os.tmpdir(),'gr-archive-tests-')),read=name=>fs.readFileSync(path.join(__dirname,'../prototypes/galactic-reach',name),'utf8');
const results=path.join(root,'results');const run1=resultDirectory(results);assert.equal(path.dirname(run1),results);fs.writeFileSync(path.join(results,'prior.json'),'kept');assert.notEqual(resultDirectory(results),run1);assert.equal(fs.readFileSync(path.join(results,'prior.json'),'utf8'),'kept');
const before={a:1,b:2,nested:{x:1,list:[1,2]}},after={b:2,a:1,nested:{list:[3],z:{'__proto__':7}}};
assert.equal(JSON.stringify(applyPatch(JSON.parse(JSON.stringify(before)),patch(before,after))),JSON.stringify(after));
const app=read('app.js'),adapter=read('adapter.js');
let sa=818,sb=818;const valuesA=[],valuesB=[];
const random=(which)=>()=>{const v=which==='a'?(sa=(Math.imul(sa,1664525)+1013904223)>>>0):(sb=(Math.imul(sb,1664525)+1013904223)>>>0);const value=v/2**32;(which==='a'?valuesA:valuesB).push(value);return value;};
// Independent original runtime: no archive wrappers or telemetry.
const c=vm.createContext({});vm.runInContext(adapter+app.replace(" || state.activePlayer === ME || state.winner !== null) return;"," || state.winner !== null) return;").replace('      clone, deckContents,','      runAiOperation,runAiBuy,chooseCombatAction,clone,deckContents,'),c);
let control;const create=c.createGalacticAdapter;c.createGalacticAdapter=port=>{control=port;return create(port);};c.createGalacticReach({headless:true,random:random('b')});
const counters=[];
const game=factory(app,adapter)({random:random('a'),archiveDirectory:root,archiveMetadata:{fixture:true,seed:818}}),states=[];
const pool=path.join(root,'source-pool'),pooledRecorder=new SimulationArchive({directory:root,sourcePool:pool});let pooledSeed=818;const pooledValues=[];
const pooled=factory(app,adapter)({simulationArchive:pooledRecorder,random:()=>{pooledSeed=(Math.imul(pooledSeed,1664525)+1013904223)>>>0;const value=pooledSeed/2**32;pooledValues.push(value);return value;}});
assert.equal(JSON.stringify(game.e.state),JSON.stringify(control.state));
function step(e){if(e.state.pendingCombat){const actor=e.combatActor();e.applyCombatAction(actor,e.chooseCombatAction(e.combatView(actor),e.combatActions(actor)));}else if(e.state.phase==='operations')e.runAiOperation();else e.runAiBuy();}
for(let n=0;n<180&&control.state.winner===null;n++){step(control);step(game.e);step(pooled.e);assert.equal(JSON.stringify(game.e.state),JSON.stringify(control.state),'Archive must not change any decision/state');assert.equal(JSON.stringify(pooled.e.state),JSON.stringify(control.state),'Source pooling must not change any decision/state');states.push(hash(control.state));counters.push({turnSerial:control.turnSerial,cardSerial:control.cardSerial});}
game.archive.finish({reason:'fixture-limit',incomplete:game.e.state.winner===null});
pooled.archive.finish({reason:'fixture-limit',incomplete:pooled.e.state.winner===null});const pooledResult=readArchive(pooled.archive.directory);
assert.deepEqual(pooledResult.records.filter(r=>r.type==='after-decision').map(r=>r.stateHash),states);assert.deepEqual(pooledResult.records.filter(r=>r.type==='after-decision').map(r=>r.counters),counters);assert.deepEqual(pooledValues,valuesA);
const result=readArchive(game.archive.directory),decisions=result.records.filter(r=>r.type==='after-decision');
assert.deepEqual(decisions.map(r=>r.stateHash),states);assert.deepEqual(decisions.map(r=>r.counters),counters);assert.deepEqual(valuesA,valuesB);assert.deepEqual(result.records.filter(r=>r.type==='random').map(r=>r.value),valuesA);
assert(result.records.some(r=>r.type==='event'&&r.event.type==='round-end'));
assert(result.records.some(r=>r.type==='event'&&r.event.type==='production'));
assert(result.records.some(r=>r.type==='event'&&r.event.type==='draw'));
assert(Array.isArray(result.state.players[0].deck));assert(Array.isArray(result.state.players[0].hand));assert(result.manifest.sourceHashes['rulebook.html']);
const source=path.join(game.archive.directory,'sources/rulebook.html'),original=fs.readFileSync(source);fs.appendFileSync(source,'corrupt');assert.throws(()=>readArchive(game.archive.directory),/source hash mismatch/);fs.writeFileSync(source,original);
const failure=new SimulationArchive({directory:root,metadata:{fixture:'failure'}});let s={winner:null,privateHand:['hidden'],resources:{data:1}};failure.attach(()=>s);assert.throws(()=>failure.invoke({type:'crash'},()=>{s.resources.data=2;throw Error('fixture failure');}),/fixture failure/);assert.equal(readArchive(failure.directory).manifest.status,'failed');assert.equal(readArchive(failure.directory).state.resources.data,2);
const frozenRules='<p>Frozen candidate rulebook, independent of later working-tree edits.</p>';
const frozen=new SimulationArchive({directory:root,rulebookSource:frozenRules});frozen.attach(()=>({winner:null}));frozen.finish({reason:'fixture',incomplete:true});
assert.equal(fs.readFileSync(path.join(frozen.directory,'sources/rulebook.html'),'utf8'),frozenRules);assert.equal(readArchive(frozen.directory).manifest.sourceHashes['rulebook.html'],hash(frozenRules));
const content='const frozen = "shared source";',pooledA=new SimulationArchive({directory:root,sourcePool:pool,sources:{'fixture.js':content,'alias.js':content}}),pooledB=new SimulationArchive({directory:root,sourcePool:pool,sources:{'fixture.js':content}}),different=new SimulationArchive({directory:root,sourcePool:pool,sources:{'fixture.js':'different frozen source'}});
const inode=(a,name)=>fs.statSync(path.join(a.directory,'sources',name),{bigint:true}).ino;
assert.equal(inode(pooledA,'fixture.js'),inode(pooledB,'fixture.js'));assert.equal(inode(pooledA,'fixture.js'),inode(pooledA,'alias.js'));assert.notEqual(inode(pooledA,'fixture.js'),inode(different,'fixture.js'));
const savedPool=process.env.GR_SIMULATION_SOURCE_POOL_DIR;process.env.GR_SIMULATION_SOURCE_POOL_DIR=pool;let fromEnvironment;
try{fromEnvironment=new SimulationArchive({directory:root});fromEnvironment.attach(()=>({winner:null}));fromEnvironment.finish({reason:'environment-pool-fixture',incomplete:true});}finally{if(savedPool===undefined)delete process.env.GR_SIMULATION_SOURCE_POOL_DIR;else process.env.GR_SIMULATION_SOURCE_POOL_DIR=savedPool;}
assert.equal(fromEnvironment.manifest.sourceStorage.pool,pool);assert.equal(inode(fromEnvironment,'recorder.cjs'),inode(pooledA,'recorder.cjs'));
assert.throws(()=>pooledA.addSources({'fixture.js':'changed'}),/source collision/);assert.equal(fs.readFileSync(path.join(pooledB.directory,'sources/fixture.js'),'utf8'),content);
for(const a of [pooledA,pooledB,different]){a.attach(()=>({winner:null,secret:['pool fixture']}));a.finish({reason:'pool-fixture',incomplete:true});}
const guard=new SimulationArchive({directory:root,sourcePool:pool});guard.attach(()=>({winner:null}));const blob=path.join(pool,hash(content)+'.source');fs.writeFileSync(blob,'corrupt');
assert.throws(()=>guard.addSources({'fixture.js':content}),/source pool hash mismatch/);assert.throws(()=>readArchive(pooledA.directory),/source hash mismatch/);fs.writeFileSync(blob,content);guard.finish({reason:'pool-integrity-fixture',incomplete:true});
const copied=path.join(root,'copied-archive');fs.cpSync(pooledA.directory,copied,{recursive:true});fs.renameSync(pool,pool+'-moved');assert.deepEqual(readArchive(copied).state.secret,['pool fixture']);assert.deepEqual(readArchive(pooledB.directory).state.secret,['pool fixture']);
// Separate processes race to publish the same complete blob. No partial blob is reusable.
const workerCode=`const {SimulationArchive}=require(${JSON.stringify(path.join(__dirname,'lib/simulation-archive.cjs'))});const a=new SimulationArchive({directory:${JSON.stringify(root)},sourcePool:${JSON.stringify(path.join(root,'concurrent-pool'))},sources:{'large.js':'shared immutable source\\n'.repeat(50000)}});a.attach(()=>({winner:null,private:['kept']}));a.finish({reason:'concurrent-pool-fixture',incomplete:true});process.stdout.write(a.directory);`;
const concurrent=spawnSync(process.execPath,['-e',`const {spawn}=require('node:child_process');Promise.all(Array.from({length:4},()=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,['-e',${JSON.stringify(workerCode)}]);let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('error',reject);p.on('close',code=>code===0?resolve(out):reject(Error(err)));}))).then(x=>process.stdout.write(JSON.stringify(x))).catch(e=>{console.error(e);process.exitCode=1;});`],{encoding:'utf8'});
assert.equal(concurrent.status,0,concurrent.stderr);const concurrentArchives=JSON.parse(concurrent.stdout);assert.equal(concurrentArchives.length,4);
const sharedInodes=concurrentArchives.map(directory=>{assert.deepEqual(readArchive(directory).state.private,['kept']);return fs.statSync(path.join(directory,'sources/large.js'),{bigint:true}).ino;});assert(sharedInodes.every(n=>n===sharedInodes[0]));
const modulePath=path.join(__dirname,'lib/simulation-archive.cjs');
const child=spawnSync(process.execPath,['-e',`const fs=require('node:fs'),{SimulationArchive}=require(${JSON.stringify(modulePath)});const a=new SimulationArchive({directory:${JSON.stringify(root)},sourcePool:${JSON.stringify(pool+'-moved')}}),s={winner:null,secret:['a']};a.attach(()=>s);a.invoke({method:'fixture'},()=>s.secret.push('b'));fs.writeSync(1,a.directory);fs.writeSync(a.fd,'{"type":"event","event":');process.kill(process.pid,'SIGKILL');`],{encoding:'utf8'});
assert.equal(child.signal,'SIGKILL');const partial=readArchive(child.stdout);assert.deepEqual(partial.state.secret,['a','b']);assert.equal(partial.manifest.status,'running');
const {makeGame}=require('./balance-simulations.cjs');
const originalDirectory=process.env.GR_SIMULATION_ARCHIVE_DIR;process.env.GR_SIMULATION_ARCHIVE_DIR=root;
for(const fleetProduction of [false,true]){
 const g=makeGame(818,['military','economy','expansion','military'],fleetProduction),s=g.getState(),home=s.clusters[0].center;
 s.fleets[home]={0:{settler:0,explorer:0,fleet:1}};
 for(let i=0;i<40&&s.winner===null;i++)g.step();g.archive.finish({reason:'fixture',incomplete:s.winner===null});
 const a=readArchive(g.archive.directory),production=a.records.filter(r=>r.type==='event'&&r.event.type==='production');assert(production.length>1);
 for(const {event} of production)for(let id=0;id<4;id++)for(const r of ['matter','energy','biomass','data'])assert.equal(event.before[id].stock[r]+event.gross[id][r]-event.lost[id][r],event.after[id].stock[r],'Actual production reconciles with fleet toggle');
 assert.equal(JSON.stringify(a.state),JSON.stringify(s));
}
if(originalDirectory===undefined)delete process.env.GR_SIMULATION_ARCHIVE_DIR;else process.env.GR_SIMULATION_ARCHIVE_DIR=originalDirectory;
if(originalSourcePool!==undefined)process.env.GR_SIMULATION_SOURCE_POOL_DIR=originalSourcePool;
console.log('Simulation archives: 180 decisions/counters/RNG unchanged with and without source pooling; concurrent immutable blob publication, source collisions/corruption, standalone reads, full private positions, resources, crash diagnostics and truncated hard-kill recovery passed.');
// Only test-generated data is removed. Production archives have no automatic deletion.
fs.rmSync(root,{recursive:true,force:true});
