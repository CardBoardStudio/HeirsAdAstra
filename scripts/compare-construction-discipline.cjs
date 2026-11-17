const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {compare}=require('./compare-market-studies.cjs'),{hash}=require('./lib/simulation-archive.cjs');
function audit(left,right){
 const result=compare(left,right),a=result.protocols.left,b=result.protocols.right;
 assert.equal(a.constructionDiscipline,'none');assert.equal(b.constructionDiscipline,'subject');assert.equal(a.resourceAccounting,'receipt-ledger-v2');
 const omit=p=>Object.fromEntries(Object.entries(p).filter(([k])=>!['constructionDiscipline','variant','binary'].includes(k)));assert.deepEqual(omit(a),omit(b),'Only the declared subject construction preference may differ');
 let reference=null,archives=0;
 for(const directory of [left,right])for(const g of fs.readFileSync(path.join(directory,'results.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)){
  const m=JSON.parse(fs.readFileSync(path.join(g.archive,'manifest.json'))),sources={};
  for(const name of ['study-runner.cjs','native-study.cjs','recorder.cjs','resource-ledger.cjs']){const bytes=fs.readFileSync(path.join(g.archive,'sources',name));assert.equal(hash(bytes),m.sourceHashes[name]);sources[name]=m.sourceHashes[name];}
  if(!reference)reference=sources;assert.deepEqual(sources,reference,'Instrumentation differs across arms/games');archives++;
 }
 return {...result,comparisonSourceHash:hash(fs.readFileSync(__filename)),toolingHashes:reference,archives,scope:'Combined subject-only Settler/Fleet/optional-finish preference. Same sources,binary,schedule and complete resource accounting. No attribution to individual components.'};
}
if(require.main===module){const[out,left,right]=process.argv.slice(2),r=audit(left,right);fs.writeFileSync(out,JSON.stringify(r,null,2));console.log(JSON.stringify({delta:r.delta,seedBootstrap95:r.seedBootstrap95}));}
module.exports={audit};
