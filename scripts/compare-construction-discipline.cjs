const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {compare}=require('./compare-market-studies.cjs'),{hash}=require('./lib/simulation-archive.cjs');
function audit(left,right){
 const result=compare(left,right),a=result.protocols.left,b=result.protocols.right;
 assert.equal(a.constructionDiscipline,'none');assert.equal(b.constructionDiscipline,'subject');assert.equal(a.resourceAccounting,'receipt-ledger-v2');
 const omit=p=>Object.fromEntries(Object.entries(p).filter(([k])=>!['constructionDiscipline','variant','binary'].includes(k)));assert.deepEqual(omit(a),omit(b),'Only the declared subject construction preference may differ');
 let reference=null,ledgerPrefix=null,ledgerExports=null,archives=0;const ledgerVersions={};
 const allowedLedgers=new Set(['ce5afaa8a9ffe54168082398c4d5e8f8b3557c233863c6f39d9d6fadcf8668ad','773c03a5ed35a36eb533518139bb92aacff95f799b8bf9ca4be38927d9e06c0f']);
 for(const directory of [left,right])for(const g of fs.readFileSync(path.join(directory,'results.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)){
  assert.deepEqual(g.protocol,JSON.parse(fs.readFileSync(path.join(directory,'protocol.json'))),'Per-game protocol differs from declared run');
  const archivedProtocol=fs.readFileSync(path.join(g.archive,'sources/protocol.json'));assert.deepEqual(JSON.parse(archivedProtocol),g.protocol,'Archived protocol differs from result');
  const m=JSON.parse(fs.readFileSync(path.join(g.archive,'manifest.json'))),sources={};
  assert.equal(hash(archivedProtocol),m.sourceHashes['protocol.json']);
  for(const name of ['study-runner.cjs','native-study.cjs','recorder.cjs']){const bytes=fs.readFileSync(path.join(g.archive,'sources',name));assert.equal(hash(bytes),m.sourceHashes[name]);sources[name]=m.sourceHashes[name];}
  const ledger=fs.readFileSync(path.join(g.archive,'sources/resource-ledger.cjs'),'utf8'),ledgerHash=hash(ledger);assert.equal(ledgerHash,m.sourceHashes['resource-ledger.cjs']);assert(allowedLedgers.has(ledgerHash),'Unreviewed resource helper source');
  const prefix=ledger.split('function audit(directory){')[0],exports=ledger.slice(ledger.indexOf('module.exports='));if(ledgerPrefix===null){ledgerPrefix=prefix;ledgerExports=exports;}assert.equal(prefix,ledgerPrefix,'Executed accounting functions differ');assert.equal(exports,ledgerExports,'Accounting exports differ');ledgerVersions[ledgerHash]=(ledgerVersions[ledgerHash]||0)+1;
  const factory=fs.readFileSync(path.join(g.archive,'sources/study-runner.cjs'),'utf8');assert(factory.includes("{account:accountResources,blank:blankLedger}=require('./audit-native-resource-ledger.cjs')"));
  if(!reference)reference=sources;assert.deepEqual(sources,reference,'Instrumentation differs across arms/games');archives++;
 }
 return {...result,comparisonSourceHash:hash(fs.readFileSync(__filename)),toolingHashes:reference,ledgerVersions,ledgerProvenance:Object.keys(ledgerVersions).length===1?'All archived accounting helper sources are exactly identical.':'Reviewed helper source difference is confined to unused read-only audit(). Used account/blank functions and exports are byte-identical; exact source variants are pinned and retained.',archives,scope:'Combined subject-only Settler/Fleet/optional-finish preference. Same game/native sources,binary,schedule and executed resource-accounting functions; reviewed unused audit-only helper snapshot difference is reported. No attribution to individual components.'};
}
if(require.main===module){const[out,left,right]=process.argv.slice(2),r=audit(left,right);fs.writeFileSync(out,JSON.stringify(r,null,2));console.log(JSON.stringify({delta:r.delta,seedBootstrap95:r.seedBootstrap95}));}
module.exports={audit};
