const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const {audit}=require('./audit-native-fleet-spending.cjs'),{hash}=require('./lib/simulation-archive.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'fleet-audit-test-'));
const zero={matter:0,energy:0,biomass:0,data:0};
function fixture(mode='valid'){
 const dir=fs.mkdtempSync(path.join(root,'case-')),archive=path.join(dir,'game');fs.mkdirSync(archive);
 const state={round:4,players:[{id:0,hand:[]}],fleets:{}};
 const records=[{type:'initial',state}];
 for(const [i,paid] of [true,false].entries()){
  const command={method:'applyAction',actor:0,action:{type:'build',kind:'fleet',coord:'0,0',key:paid?'construct':'worldEngine'}};
  records.push({type:'before-decision',command});
  if(!(mode==='missing-payment'&&!paid))records.push({type:'event',event:{type:'resource-payment',player:0,result:true,before:paid?{matter:2,energy:1,biomass:1,data:0}:zero,after:mode==='resource-gain'&&paid?{...zero,matter:3}:zero}});
  records.push({type:'after-decision',command,patch:[{path:['fleets'],value:{'0,0':{'0':{fleet:i+1}}}}]});
 }
 const final={...state,fleets:{'0,0':{'0':{fleet:2}}}};
 const bytes=zlib.gzipSync(records.map(r=>JSON.stringify(r)).join('\n'));fs.writeFileSync(path.join(archive,'trace.jsonl.gz'),bytes);
 fs.writeFileSync(path.join(archive,'manifest.json'),JSON.stringify({trace:'trace.jsonl.gz',traceHash:mode==='bad-trace'?'bad':hash(bytes),finalStateHash:mode==='bad-final'?'bad':hash(final)}));
 fs.writeFileSync(path.join(dir,'results.jsonl'),JSON.stringify({id:0,seed:1,rotation:0,archive,players:[{seat:0,profile:'market',ships:{fleet:mode==='bad-counter'?3:2},combatWins:0}]}));return dir;
}
try{
 const r=audit(fixture()).profiles.market;
 assert.equal(r.commands,2);assert.equal(r.paidCommands,1);assert.equal(r.freeCommands,1);assert.equal(r.survivors,2);assert.deepEqual(r.paidResources,{matter:2,energy:1,biomass:1,data:0});
 for(const mode of ['missing-payment','resource-gain','bad-trace','bad-final','bad-counter'])assert.throws(()=>audit(fixture(mode)),undefined,mode);
 console.log('Fleet audit: actual paid/free commands and survivors verified; missing payment, gains, corrupt trace/final state and metric mismatch rejected.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
