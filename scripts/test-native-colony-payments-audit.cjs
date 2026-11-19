const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {audit}=require('./audit-native-colony-payments.cjs'),{hash,applyPatch}=require('./lib/simulation-archive.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'colony-audit-test-')),zero={matter:0,energy:0,biomass:0,data:0};
function fixture(mode='valid'){
 const dir=fs.mkdtempSync(path.join(root,'case-')),archive=path.join(dir,'game');fs.mkdirSync(archive);
 const initial={round:4,players:[{hand:[{id:'basic',key:'colonize'},{id:'relic',key:'evergreenArk'}],cardPrestige:0}],planets:{'0,0':{owner:null},'1,0':{owner:1}},fleets:{'0,0':{'0':{settler:1}},'1,0':{'0':{settler:1,fleet:1}}}};
 let final=JSON.parse(JSON.stringify(initial));const records=[{type:'initial',state:initial}];
 for(const [card,key,coord,cost,patch] of [
  ['basic','colonize','0,0',2,[{path:['planets','0,0','owner'],value:0},{path:['fleets','0,0','0','settler'],value:0}]],
  ['relic','evergreenArk','1,0',0,[{path:['planets','1,0','owner'],value:0},{path:['fleets','1,0','0','settler'],value:mode==='bad-retention'?3:1}]]
 ]){
  const command={method:'applyAction',actor:0,action:{type:'colonize',card,key,coord}};records.push({type:'before-decision',command});
  if(!(mode==='missing-payment'&&cost===0))records.push({type:'event',event:{type:'resource-payment',player:0,result:true,before:{...zero,biomass:cost},after:mode==='payment-gain'?{...zero,biomass:3}:zero}});
  records.push({type:'after-decision',command,patch});final=applyPatch(final,patch);
 }
 const bytes=zlib.gzipSync(records.map(r=>JSON.stringify(r)).join('\n'));fs.writeFileSync(path.join(archive,'trace.jsonl.gz'),bytes);
 fs.writeFileSync(path.join(archive,'manifest.json'),JSON.stringify({trace:'trace.jsonl.gz',traceHash:mode==='bad-trace'?'bad':hash(bytes),finalStateHash:mode==='bad-final'?'bad':hash(final)}));
 fs.writeFileSync(path.join(dir,'results.jsonl'),JSON.stringify({id:0,seed:1,rotation:0,subjectSeat:0,archive,players:[{colonizations:mode==='bad-counter'?3:2,captures:mode==='bad-capture'?0:1}]}));return dir;
}
try{
 const cards=audit(fixture()).cards;assert.equal(cards.colonize.paid.biomass,2);assert.equal(cards.colonize.neutral,1);assert.equal(cards.colonize.keptSettler,0);assert.equal(cards.evergreenArk.captures,1);assert.equal(cards.evergreenArk.keptSettler,1);assert.deepEqual(cards.evergreenArk.paid,zero);
 for(const mode of ['missing-payment','payment-gain','bad-retention','bad-trace','bad-final','bad-counter','bad-capture'])assert.throws(()=>audit(fixture(mode)),undefined,mode);
 console.log('Colony audit: neutral/capture payments and free retained Settler verified; missing/corrupt/inconsistent payment, retention and counters rejected.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
