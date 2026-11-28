const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {comparePrice}=require('./compare-market-price.cjs'),{hash}=require('./lib/simulation-archive.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'price-provenance-'));
function pair(mode='valid'){
 const base=fs.mkdtempSync(path.join(root,'pair-')),dirs=[];
 for(const [i,cost] of [[0,'biomass:1,data:2'],[1,'biomass:2,energy:1']]){
  const d=path.join(base,String(i)),archive=path.join(d,'game');dirs.push(d);fs.mkdirSync(path.join(d,'sources'),{recursive:true});fs.mkdirSync(path.join(archive,'sources'),{recursive:true});
  const app=`before\n    surveyNetwork: { cost:{${cost}}, effect:{draw:2} },\nafter\n`,sources={app,adapter:'adapter',rulebook:'book'+i,rust:'rust',bridge:'bridge',lock:'lock'};
  for(const [k,v] of Object.entries(sources)){const n=k==='rulebook'?'rulebook.html':['app','adapter'].includes(k)?k+'.js':k+'.txt';fs.writeFileSync(path.join(d,'sources',n),v);}
  fs.writeFileSync(path.join(d,'sources/runner.cjs'),'runner');fs.writeFileSync(path.join(d,'sources/policy-study'),'binary');
  const protocol={target:30,mode:'updated',seeds:1,rotations:[0],seedStart:1,binaryHash:hash('binary'),sourceHashes:Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,hash(v)]))};fs.writeFileSync(path.join(d,'protocol.json'),JSON.stringify(protocol));
  const content={'engine-demo.js':mode==='engine-effect'&&i===1?app.replace('draw:2','draw:3'):app,'adapter-demo.js':mode==='adapter'&&i===1?'changed':'adapter','study-runner.cjs':mode==='factory'&&i===1?'changed':'factory','recorder.cjs':'recorder','native-study.cjs':mode==='runner'?'different':'runner'},hashes={};
  for(const [n,v] of Object.entries(content)){fs.writeFileSync(path.join(archive,'sources',n),v);hashes[n]=hash(v);}
  if(mode==='corrupt'&&i===1)fs.writeFileSync(path.join(archive,'sources/recorder.cjs'),'corrupt');
  fs.writeFileSync(path.join(archive,'manifest.json'),JSON.stringify({sourceHashes:hashes}));fs.writeFileSync(path.join(d,'results.jsonl'),JSON.stringify({seed:1,rotation:0,subjectSeat:0,completed:true,winner:0,players:[{points:10}],mapHash:'same',archive}));
 }
 return dirs;
}
try{
 const run=dirs=>comparePrice(...dirs,'surveyNetwork',{biomass:1,data:2},{biomass:2,energy:1});assert.equal(run(pair()).archiveProvenance.pairedCases,1);
 for(const mode of ['engine-effect','adapter','factory','runner','corrupt'])assert.throws(()=>run(pair(mode)),undefined,mode);
 console.log('Price archive provenance: paired price-only engine accepted; hidden effect/adapter/factory/runner changes and corrupt archived source rejected.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
