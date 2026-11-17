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
function compare(left,right,validateApp=validateSources,changeText='World Engine 6M1E1B to 4M1E1B; identical policy binary and adapter/native sources. Canonical rulebooks differ to document the intended price/tier.'){
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
 for(const key of ['target','mode','tacticalForecast','militaryHorizon','productionDiscipline','harvesterHeadroom','optionalConstruction','marketFilter','colonyPlanning','colonyExecution','protectedMarketBudget','subjectMarket','orderBenefits','fleetDiscipline','seedStart','seeds','rotations','profiles','maxRound','binaryHash'])assert.deepEqual(a.protocol[key],b.protocol[key],'Protocol mismatch: '+key);
 for(const key of ['adapter','rust','bridge','lock'])assert.equal(a.sources[key],b.sources[key],'Unrelated source mismatch: '+key);
 validateApp(a.sources.app,b.sources.app);
 const runnerA=fs.readFileSync(path.join(left,'sources/runner.cjs'),'utf8'),runnerB=fs.readFileSync(path.join(right,'sources/runner.cjs'),'utf8');
 assert.equal(runnerA,runnerB,'Native runner differs');
 const archived=g=>{
  const m=JSON.parse(fs.readFileSync(path.join(g.archive,'manifest.json')));
  const readSource=name=>{const content=fs.readFileSync(path.join(g.archive,'sources',name),'utf8');assert.equal(hash(content),m.sourceHashes[name],'Archive source hash mismatch: '+name);return content;};
  const one=prefix=>{const names=Object.keys(m.sourceHashes).filter(n=>n.startsWith(prefix)&&n.endsWith('.js'));assert.equal(names.length,1,'Expected one archived '+prefix);return readSource(names[0]);};
  return {engine:one('engine-'),adapter:one('adapter-'),factory:readSource('study-runner.cjs'),recorder:readSource('recorder.cjs'),runner:readSource('native-study.cjs')};
 };
 const cases=new Map(a.rows.map(g=>[`${g.seed}/${g.rotation}`,g]));
 for(const g of b.rows){const x=cases.get(`${g.seed}/${g.rotation}`);assert(x,'Missing archive pair');const aa=archived(x),bb=archived(g);validateApp(aa.engine,bb.engine);for(const key of ['adapter','factory','recorder','runner'])assert.equal(aa[key],bb[key],'Archived tooling differs: '+key);assert.equal(aa.runner,runnerA,'Archive and run runner differ');}
 return {left,right,archiveProvenance:{pairedCases:b.rows.length,nativeRunnerHash:hash(runnerA),scope:'Every paired archived instrumented engine matches the declared price-only transformation; adapter,factory,recorder,native runner match and source hashes verify.'},change:changeText,analysisSourceHash:hash(fs.readFileSync(__filename)),leftResultsHash:hash(a.raw),rightResultsHash:hash(b.raw),protocols:{left:a.protocol,right:b.protocol},...compareRows(a.rows,b.rows)};
}
if(require.main===module){const[out,left,right]=process.argv.slice(2);const result=compare(left,right);fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify({delta:result.delta,seedBootstrap95:result.seedBootstrap95,galaxies:result.galaxies}));}
module.exports={validateSources,compare};
