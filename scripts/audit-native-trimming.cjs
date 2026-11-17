// Count completed native decommission commands, with trace integrity and paired command checks.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {hash}=require('./lib/simulation-archive.cjs');
function audit(directory){
 const rows=fs.readFileSync(path.join(directory,'results.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse),all={},subject={},games=[];
 for(const g of rows){
  const m=JSON.parse(fs.readFileSync(path.join(g.archive,'manifest.json'))),bytes=fs.readFileSync(path.join(g.archive,m.trace));
  assert.equal(hash(bytes),m.traceHash,'Trace integrity mismatch');let pending=null;const commands=[];
  for(const line of zlib.gunzipSync(bytes).toString().split('\n')){
   if(!line)continue;const r=JSON.parse(line),c=r.command;
   if(r.type==='before-decision'){
    assert.equal(pending,null,'Unfinished trimming command');
    if(c?.method==='applyAction'&&c.action?.type==='decommission')pending=c;
   }
   if(pending&&r.type==='after-decision'){
    assert.deepEqual(c,pending,'Trimming command pair mismatch');
    const id=c.action.card;assert(/-\d+$/.test(id),'Expected stable generated card id');
    const key=id.replace(/-\d+$/,'');all[key]=(all[key]||0)+1;
    if(c.actor===g.subjectSeat)subject[key]=(subject[key]||0)+1;
    commands.push({actor:c.actor,key,card:id,resource:c.action.resource});pending=null;
   }
  }
  assert.equal(pending,null,'Trace ended inside trimming command');games.push({id:g.id,seed:g.seed,rotation:g.rotation,traceHash:m.traceHash,commands});
 }
 return {directory,sourceHash:hash(fs.readFileSync(__filename)),scope:'Completed before/after decommission command pairs, all actors and designated subject. Keys derived from generated card-id prefixes. Full payment/state effects are not separately reconstructed by this command audit.',all,subject,games};
}
if(require.main===module){const [directory,out]=process.argv.slice(2),result=audit(directory);fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify({all:result.all,subject:result.subject}));}
module.exports={audit};
