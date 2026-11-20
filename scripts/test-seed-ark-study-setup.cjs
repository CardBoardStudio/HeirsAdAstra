// Historical Rust policy compatibility fixture only. New studies use browser-bot-study.cjs.
process.env.GR_ALLOW_ARCHIVED_RUST_BOTS='1';
// Frozen-arm setup equality and full retained-baseline neutrality, not balance games.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {play}=require('./native-investment-study.cjs'),{archiveRecords,hash}=require('./lib/simulation-archive.cjs');
const {validateSources}=require('./compare-seed-ark-choice.cjs');
const [fixture,reference]=process.argv.slice(2);assert(fixture&&reference,'Supply prepared fixture and retained reference run');
const load=arm=>Object.fromEntries(Object.entries({app:'app.js',adapter:'adapter.js',rulebook:'rulebook.html',rust:'rust.txt',bridge:'bridge.txt',lock:'lock.txt'}).map(([k,n])=>[k,fs.readFileSync(path.join(fixture,arm,n),'utf8')]));
const control=load('control'),candidate=load('candidate'),binary=path.join(fixture,'control/policy-study');
validateSources(control.app,candidate.app);for(const k of ['adapter','rust','bridge','lock'])assert.equal(control[k],candidate[k]);assert.equal(hash(fs.readFileSync(binary)),hash(fs.readFileSync(path.join(fixture,'candidate/policy-study'))));
const retained=fs.readFileSync(path.join(reference,'results.jsonl'),'utf8').trim().split('\n').map(JSON.parse).find(g=>g.seed===610010&&g.rotation===0&&g.target===30);assert(retained?.completed);
const protocol=sources=>({...retained.protocol,variant:'seed-framework-validation',binary,binaryHash:hash(fs.readFileSync(binary)),sourceHashes:Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,hash(v)]))});
const task=(sources,maxSteps,variant)=>({id:0,mode:'updated',variant,seed:610010,rotation:0,target:30,profiles:['market','economy','expansion','military'],maxRound:80,maxSteps,protocol:protocol(sources)});
function finalState(directory){let state;for(const r of archiveRecords(directory))state=r.position;return state;}
function* tape(directory){for(const r of archiveRecords(directory)){if(r.type==='random'){const {position,...event}=r;yield {random:event};}else if(r.type==='after-decision')yield Object.fromEntries(['command','result','stateHash','snapshotHash','counters','rngCalls'].map(k=>[k,r[k]]));}}
function equalTape(a,b){const x=tape(a),y=tape(b);let n=0;for(;;){const u=x.next(),v=y.next();assert.equal(u.done,v.done,'Different action/RNG count');if(u.done)break;assert.deepEqual(u.value,v.value,'Action/private-state/counter/RNG divergence at record '+n);n++;}return n;}
(async()=>{
 const directory=path.join(fixture,'validation-games'),a=await play(task(control,0,'seed-control-setup'),control,directory,binary),b=await play(task(candidate,0,'seed-candidate-setup'),candidate,directory,binary);
 assert.equal(a.mapHash,b.mapHash);assert.deepEqual(finalState(a.archive),finalState(b.archive));equalTape(a.archive,b.archive);
 const full=await play(task(control,18000,'seed-control-neutrality'),control,directory,binary);assert(full.completed);assert.equal(full.winner,retained.winner);assert.deepEqual(JSON.parse(JSON.stringify(full.players)),retained.players);assert.deepEqual(finalState(full.archive),finalState(retained.archive));const matched=equalTape(full.archive,retained.archive);
 const report={sourceHash:hash(fs.readFileSync(__filename)),scope:'Setup positions,opening hands and RNG match between prepared arms. One full common-framework control game reproduces retained baseline commands,private states,counters and RNG exactly. Validation games are not additional balance samples.',setup:{control:a.archive,candidate:b.archive},baseline:{reference:retained.archive,control:full.archive,matchedRecords:matched,steps:full.steps}};
 fs.writeFileSync(path.join(fixture,'validation-summary.json'),JSON.stringify(report,null,2));console.log('Seed Ark preparation: identical setup/hands/RNG; full '+full.steps+'-decision control reproduces retained private states,commands,counters and RNG.');
})().catch(error=>{console.error(error);process.exitCode=1;});
