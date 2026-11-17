// Intentional game-source comparison: accept only the predeclared World Engine price change.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {hash}=require('./lib/simulation-archive.cjs');
const {compareRows}=require('./compare-market-studies.cjs');
function validateSources(left,right){
 const line=/worldEngine: \{[^\n]+/;
 const a=left.match(line),b=right.match(line);
 assert(a&&b,'World Engine definition required');
 assert(a[0].includes('cost: {"matter": 6, "energy": 1, "biomass": 1}'),'Control must have price v1');
 const candidate=a[0].replace('cost: {"matter": 6, "energy": 1, "biomass": 1}','cost: {"matter": 4, "energy": 1, "biomass": 1}');
 assert.equal(b[0],candidate,'Unexpected World Engine change');
 assert.equal(right,left.replace(a[0],candidate),'Unrelated game-source changes');
}
function compare(left,right){
 const read=d=>{
  const protocol=JSON.parse(fs.readFileSync(path.join(d,'protocol.json')));
  const raw=fs.readFileSync(path.join(d,'results.jsonl'),'utf8');
  const rows=raw.trim().split('\n').filter(Boolean).map(JSON.parse);
  assert.equal(rows.length,protocol.seeds*protocol.rotations.length,'Unfinished scheduled batch');
  const sourceDir=path.join(d,'sources');
  const sources={};
  for(const [key,expected] of Object.entries(protocol.sourceHashes)){
   const name=key==='rulebook'?'rulebook.html':['app','adapter'].includes(key)?key+'.js':key+'.txt';
   sources[key]=fs.readFileSync(path.join(sourceDir,name),'utf8');
   assert.equal(hash(sources[key]),expected,'Frozen source hash mismatch: '+key);
  }
  assert.equal(hash(fs.readFileSync(path.join(sourceDir,'policy-study'))),protocol.binaryHash,'Frozen binary mismatch');
  return {protocol,raw,rows,sources};
 };
 const a=read(left),b=read(right);
 for(const key of ['target','mode','tacticalForecast','militaryHorizon','productionDiscipline','marketFilter','colonyPlanning','protectedMarketBudget','subjectMarket','orderBenefits','seedStart','seeds','rotations','profiles','maxRound','binaryHash'])assert.deepEqual(a.protocol[key],b.protocol[key],'Protocol mismatch: '+key);
 for(const key of ['adapter','rust','bridge','lock'])assert.equal(a.sources[key],b.sources[key],'Unrelated source mismatch: '+key);
 validateSources(a.sources.app,b.sources.app);
 return {left,right,change:'World Engine 6M1E1B to 4M1E1B; identical policy binary and adapter/native sources. Canonical rulebooks differ to document the intended price/tier.',analysisSourceHash:hash(fs.readFileSync(__filename)),leftResultsHash:hash(a.raw),rightResultsHash:hash(b.raw),protocols:{left:a.protocol,right:b.protocol},...compareRows(a.rows,b.rows)};
}
if(require.main===module){const[out,left,right]=process.argv.slice(2);const result=compare(left,right);fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify({delta:result.delta,seedBootstrap95:result.seedBootstrap95,galaxies:result.galaxies}));}
module.exports={validateSources,compare};
