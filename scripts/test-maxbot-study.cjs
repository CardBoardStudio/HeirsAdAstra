// Bootstrap fixture only: no production game. Prove each archive is self-contained
// even when the deployed harness has no prototypes directory beside it.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {play}=require('./maxbot-study.cjs'),{hash}=require('./lib/simulation-archive.cjs');
(async()=>{
 const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
 const sources=Object.fromEntries(Object.entries({app:'prototypes/galactic-reach/app.js',adapter:'prototypes/galactic-reach/adapter.js',rulebook:'prototypes/galactic-reach/rulebook.html',rust:'crates/galactic-reach/src/lib.rs',bridge:'crates/galactic-reach/examples/policy-study.rs',lock:'Cargo.lock'}).map(([k,f])=>[k,read(f)]));
 const directory=path.join(root,'output/maxbot-study-fixtures');fs.mkdirSync(directory,{recursive:true});
 const game=await play({id:0,seed:73,rotation:0,profiles:['maxbot','military','economy','expansion'],opponents:'browser',target:30,maxRound:60,maxSteps:0,protocol:{catalogMarket:false}},sources,directory,null);
 const manifest=JSON.parse(fs.readFileSync(path.join(game.archive,'manifest.json')));
 assert.equal(manifest.status,'incomplete');assert.equal(manifest.sourceHashes['rulebook.html'],hash(sources.rulebook));assert.equal(fs.readFileSync(path.join(game.archive,'sources/rulebook.html'),'utf8'),sources.rulebook);
 assert.equal(game.players[0].name,'MaxBot');assert.equal(game.players[0].profile,'maxbot');assert.equal(game.completed,false);
 console.log('MaxBot study: standalone canonical rulebook retained, profile/name initialization recorded and zero-step fixture marked incomplete.');
})().catch(e=>{console.error(e);process.exitCode=1;});
