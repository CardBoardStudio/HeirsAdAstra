const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {SimulationArchive,readArchive,resultDirectory,patch,applyPatch,hash}=require('./lib/simulation-archive.cjs');
const {factory}=require('./strategic-bot-study.cjs');
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
assert.equal(JSON.stringify(game.e.state),JSON.stringify(control.state));
function step(e){if(e.state.pendingCombat){const actor=e.combatActor();e.applyCombatAction(actor,e.chooseCombatAction(e.combatView(actor),e.combatActions(actor)));}else if(e.state.phase==='operations')e.runAiOperation();else e.runAiBuy();}
for(let n=0;n<180&&control.state.winner===null;n++){step(control);step(game.e);assert.equal(JSON.stringify(game.e.state),JSON.stringify(control.state),'Archive must not change any decision/state');states.push(hash(control.state));counters.push({turnSerial:control.turnSerial,cardSerial:control.cardSerial});}
game.archive.finish({reason:'fixture-limit',incomplete:game.e.state.winner===null});
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
const modulePath=path.join(__dirname,'lib/simulation-archive.cjs');
const child=spawnSync(process.execPath,['-e',`const fs=require('node:fs'),{SimulationArchive}=require(${JSON.stringify(modulePath)});const a=new SimulationArchive({directory:${JSON.stringify(root)}}),s={winner:null,secret:['a']};a.attach(()=>s);a.invoke({method:'fixture'},()=>s.secret.push('b'));fs.writeSync(1,a.directory);fs.writeSync(a.fd,'{"type":"event","event":');process.kill(process.pid,'SIGKILL');`],{encoding:'utf8'});
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
console.log('Simulation archives: 180 decision states and RNG stream unchanged; full private positions, round resources, source integrity, crash diagnostics and truncated hard-kill recovery passed.');
// Only test-generated data is removed. Production archives have no automatic deletion.
fs.rmSync(root,{recursive:true,force:true});
