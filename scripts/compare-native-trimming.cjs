// Compare the audited native trimming correction; accept no other production policy changes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {hash}=require('./lib/simulation-archive.cjs'),{compareRows}=require('./compare-market-studies.cjs');
function compare(left,right){
 const read=d=>{
  const protocol=JSON.parse(fs.readFileSync(path.join(d,'protocol.json'))),raw=fs.readFileSync(path.join(d,'results.jsonl'),'utf8'),rows=raw.trim().split('\n').filter(Boolean).map(JSON.parse),sources={};
  assert.equal(rows.length,protocol.seeds*protocol.rotations.length,'Unfinished scheduled batch');
  for(const [k,h] of Object.entries(protocol.sourceHashes)){
   const n=k==='rulebook'?'rulebook.html':['app','adapter'].includes(k)?k+'.js':k+'.txt';
   sources[k]=fs.readFileSync(path.join(d,'sources',n),'utf8');assert.equal(hash(sources[k]),h,'Source hash mismatch: '+k);
  }
  assert.equal(hash(fs.readFileSync(path.join(d,'sources/policy-study'))),protocol.binaryHash);
  return {protocol,raw,rows,sources};
 };
 const a=read(left),b=read(right);
 for(const k of ['target','mode','tacticalForecast','militaryHorizon','productionDiscipline','harvesterHeadroom','marketFilter','colonyPlanning','colonyExecution','protectedMarketBudget','subjectMarket','orderBenefits','seedStart','seeds','rotations','profiles','maxRound'])assert.deepEqual(a.protocol[k],b.protocol[k],'Protocol mismatch: '+k);
 for(const k of ['app','adapter','bridge','lock'])assert.equal(a.sources[k],b.sources[k],'Unrelated source change: '+k);
 const production=s=>{assert(s.includes('#[cfg(test)]'));return s.split('#[cfg(test)]')[0];};
 const old='                if redundant\n                    && card["upgraded"] != true';
 const fix='                let basic = matches!(\n                    card["key"].as_str().unwrap_or(""),\n                    "construct" | "move" | "colonize" | "excavate" | "probe"\n                );\n                if redundant\n                    && (view["investmentPlanning"] != true || basic)\n                    && card["upgraded"] != true';
 assert(production(a.sources.rust).includes(old),'Expected pre-fix trimming');
 assert.equal(production(b.sources.rust),production(a.sources.rust).replace(old,fix),'Unexpected native production policy change');
 return {left,right,change:'Native investment-planning redundancy trimming preserves named orders for every actor. Game/adapter/bridge/lock identical; native binary and rulebook intentionally differ.',sourceHash:hash(fs.readFileSync(__filename)),leftResultsHash:hash(a.raw),rightResultsHash:hash(b.raw),protocols:{left:a.protocol,right:b.protocol},...compareRows(a.rows,b.rows)};
}
if(require.main===module){const[out,left,right]=process.argv.slice(2),r=compare(left,right);fs.writeFileSync(out,JSON.stringify(r,null,2));console.log(JSON.stringify({delta:r.delta,seedBootstrap95:r.seedBootstrap95}));}
module.exports={compare};
