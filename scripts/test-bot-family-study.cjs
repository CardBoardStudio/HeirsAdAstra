const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {play}=require('./bot-family-study.cjs'),{hash}=require('./lib/simulation-archive.cjs');
(async()=>{
 const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
 const sources=Object.fromEntries(Object.entries({app:'prototypes/galactic-reach/app.js',adapter:'prototypes/galactic-reach/adapter.js',rulebook:'prototypes/galactic-reach/rulebook.html',rust:'crates/galactic-reach/src/lib.rs',bridge:'crates/galactic-reach/examples/policy-study.rs',lock:'Cargo.lock'}).map(([k,f])=>[k,read(f)]));
 const directory=path.join(root,'output/bot-family-bootstrap');fs.mkdirSync(directory,{recursive:true});
 const task={id:0,seed:2026111801,rotation:0,profiles:['market','military','economy','expansion'],implementations:['browser','native','browser','native'],target:30,maxRound:60,maxSteps:0,protocol:{catalogMarket:false}};
 const g=await play(task,sources,directory,null),m=JSON.parse(fs.readFileSync(path.join(g.archive,'manifest.json')));
 assert.equal(g.completed,false);assert.equal(m.status,'incomplete');assert.equal(m.sourceHashes['rulebook.html'],hash(sources.rulebook));
 assert.deepEqual(JSON.parse(JSON.stringify(g.players.map(p=>p.implementation))),task.implementations);assert.deepEqual(JSON.parse(JSON.stringify(g.players.map(p=>p.profile))),task.profiles);
 assert.deepEqual(JSON.parse(JSON.stringify(g.players.map(p=>p.name))),['Browser market','Rust military','Browser economy','Rust expansion']);
 await assert.rejects(play({...task,implementations:['browser','browser','browser','native']},sources,directory,null),/two of each/);
 console.log('Family tournament: correct role/implementation assignment, names, frozen rulebook, incomplete fixture and invalid-allocation rejection passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
