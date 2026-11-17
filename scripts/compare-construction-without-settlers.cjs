// Full bundle minus the same Fleet/finish bundle without the Settler preference.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {compare}=require('./compare-market-studies.cjs'),{hash}=require('./lib/simulation-archive.cjs');
function audit(without,full){
 const r=compare(without,full),a=r.protocols.left,b=r.protocols.right;
 assert.equal(a.constructionDiscipline,'none');assert.equal(a.fleetDiscipline,'subject');assert.equal(a.optionalConstruction,'subject');
 assert.equal(b.constructionDiscipline,'subject');assert.equal(b.fleetDiscipline,'none');assert.equal(b.optionalConstruction,'none');assert.equal(a.resourceAccounting,'receipt-ledger-v2');
 const omit=p=>Object.fromEntries(Object.entries(p).filter(([k])=>!['constructionDiscipline','fleetDiscipline','optionalConstruction','variant','binary'].includes(k)));assert.deepEqual(omit(a),omit(b),'Unrelated study protocol differs');
 let reference=null,archives=0;
 for(const directory of [without,full])for(const g of fs.readFileSync(path.join(directory,'results.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)){
  assert.deepEqual(g.protocol,JSON.parse(fs.readFileSync(path.join(directory,'protocol.json'))),'Per-game protocol differs from declared run');
  const archivedProtocol=fs.readFileSync(path.join(g.archive,'sources/protocol.json'));assert.deepEqual(JSON.parse(archivedProtocol),g.protocol,'Archived protocol differs from result');
  const m=JSON.parse(fs.readFileSync(path.join(g.archive,'manifest.json'))),tooling={};
  assert.equal(hash(archivedProtocol),m.sourceHashes['protocol.json']);
  for(const name of ['study-runner.cjs','native-study.cjs','recorder.cjs','resource-ledger.cjs']){const bytes=fs.readFileSync(path.join(g.archive,'sources',name));assert.equal(hash(bytes),m.sourceHashes[name]);tooling[name]=m.sourceHashes[name];}
  if(!reference)reference=tooling;assert.deepEqual(tooling,reference,'Executed tooling differs');archives++;
 }
 return {...r,comparisonSourceHash:hash(fs.readFileSync(__filename)),toolingHashes:reference,archives,scope:'Right(full)minus left(Fleet and optional-finish only):effective Settler preference added to the same subject. All eight previously used confirmation galaxies,not new independent confirmation. Does not isolate Settler-only performance without Fleet/finish.'};
}
if(require.main===module){const[out,without,full]=process.argv.slice(2),r=audit(without,full);fs.writeFileSync(out,JSON.stringify(r,null,2));console.log(JSON.stringify({delta:r.delta,seedBootstrap95:r.seedBootstrap95}));}
module.exports={audit};
