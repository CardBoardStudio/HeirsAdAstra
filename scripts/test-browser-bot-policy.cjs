// Decision parity and archival guards, with bounded fixtures and complete retention.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {factory}=require('./strategic-bot-study.cjs'),{play}=require('./browser-bot-study.cjs');
const root=path.resolve(__dirname,'..'),sources=Object.fromEntries(['app','adapter','rulebook'].map(k=>[k,fs.readFileSync(path.join(root,'prototypes/galactic-reach',k+(k==='rulebook'?'.html':'.js')),'utf8')]));
const archive=JSON.parse(fs.readFileSync(path.join(root,'docs/rules/archived-rust-policy.json'),'utf8'));
assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,archive.source))).digest('hex'),archive.sha256,'Archived native policy is immutable');
const directory=process.env.GR_SIMULATION_ARCHIVE_DIR||path.join(root,'output/browser-policy-fixtures');
function game(browserPolicy,profiles){let seed=1729;const g=factory(sources.app,sources.adapter)({browserPolicy,victoryTarget:30,archiveDirectory:directory,random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32)});g.e.state.players.forEach((p,id)=>p.strategy=profiles[id]);return g;}
for(const profiles of [['market','military','economy','expansion'],['militaryFocused','military','economy','expansion']]){
const direct=game(false,profiles),server=game(true,profiles);
try{
 for(let step=0;step<60;step++){
  assert.equal(JSON.stringify(server.a.snapshotState()),JSON.stringify(direct.a.snapshotState()));
  const actor=server.a.activeSeat();if(actor===null)break;
  const before=JSON.stringify(server.a.snapshotState());
  assert.throws(()=>server.a.browserStep((actor+1)%4,'market'),/Invalid browser policy/);
  assert.throws(()=>server.a.browserStep(actor,'rust'),/Invalid browser policy/);
  assert.equal(JSON.stringify(server.a.snapshotState()),before);
  server.a.legalActions(actor); // Populate the cache before direct mutations.
  server.a.browserStep(actor,server.e.state.players[actor].strategy);
  if(direct.e.state.pendingCombat)direct.e.applyCombatAction(actor,direct.e.chooseCombatAction(direct.e.combatView(actor),direct.e.combatActions(actor)));
  else if(direct.e.state.phase==='operations')direct.e.runAiOperation();else direct.e.runAiBuy();
  assert.equal(JSON.stringify(server.a.snapshotState()),JSON.stringify(direct.a.snapshotState()),`Browser/server policy drift at ${step}`);
 }
}finally{direct.archive.finish({reason:'parity-fixture',incomplete:true});server.archive.finish({reason:'parity-fixture',incomplete:true});}
}
const {bridge}=require('./native-investment-study.cjs');const prior=process.env.GR_ALLOW_ARCHIVED_RUST_BOTS;delete process.env.GR_ALLOW_ARCHIVED_RUST_BOTS;
try{assert.throws(()=>bridge('/never-spawn-this'),/Rust bots are archived/);}finally{if(prior!==undefined)process.env.GR_ALLOW_ARCHIVED_RUST_BOTS=prior;}
const result=play({id:0,seed:1729,target:30,maxRound:2,maxSteps:3,profiles:['militaryFocused','military','economy','expansion']},sources,directory);
assert.equal(result.policyFamily,'browser');assert.equal(result.steps,3);assert(!result.completed);assert(fs.existsSync(path.join(result.archive,'manifest.json')));
console.log('Browser policies: 120 matched decisions/state/counter parity including both military profiles, forged profiles and wrong seats rejected, stale-command cache invalidated, native bridge blocked, bounded incomplete history retained.');
