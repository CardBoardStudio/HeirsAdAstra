// Actual production stocks and overflow by round; conditional surviving-game cohorts are explicit.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {hash}=require('./lib/simulation-archive.cjs');const RES=['matter','energy','biomass','data'];
const blank=()=>({events:0,before:0,gross:0,lost:0,after:0});
function analyze(directory){
 const rows=fs.readFileSync(path.join(directory,'results.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse),rounds={},windows={},games=[];
 for(const g of rows){
  const seat=g.subjectSeat??(4-g.rotation)%4,m=JSON.parse(fs.readFileSync(path.join(g.archive,'manifest.json'))),bytes=fs.readFileSync(path.join(g.archive,m.trace));assert.equal(hash(bytes),m.traceHash);const total=Object.fromEntries(RES.map(k=>[k,blank()]));let events=0;
  for(const line of zlib.gunzipSync(bytes).toString().split('\n')){
   if(!line)continue;const record=JSON.parse(line),e=record.event;if(record.type!=='event'||e.type!=='production')continue;
   const before=e.before.find(x=>x.id===seat),after=e.after.find(x=>x.id===seat);assert(before&&after);events++;
   const window=e.round<=6?'rounds1-6':e.round<=12?'rounds7-12':'rounds13plus';rounds[e.round]??=Object.fromEntries(RES.map(k=>[k,blank()]));windows[window]??=Object.fromEntries(RES.map(k=>[k,blank()]));
   for(const k of RES){const values={before:before.stock[k],gross:e.gross[seat][k],lost:e.lost[seat][k],after:after.stock[k]};assert(Object.values(values).every(n=>Number.isFinite(n)&&n>=0));assert.equal(values.after,values.before+values.gross-values.lost,'Production stock conservation');assert(values.lost<=values.gross);for(const bucket of [total[k],rounds[e.round][k],windows[window][k]]){bucket.events++;for(const f of Object.keys(values))bucket[f]+=values[f];}}
  }
  assert(events>0,'Missing production events');for(const k of RES){assert(total[k].gross<=g.players[seat].gained[k],'Production exceeds all gained resources');assert(total[k].lost<=g.players[seat].lost[k],'Production overflow exceeds all recorded overflow');}
  games.push({id:g.id,seed:g.seed,rotation:g.rotation,events,total});
 }
 const finish=groups=>Object.fromEntries(Object.entries(groups).map(([label,resources])=>[label,Object.fromEntries(RES.map(k=>{const v=resources[k];return[k,{...v,meanBefore:v.before/v.events,meanGross:v.gross/v.events,meanLost:v.lost/v.events,meanBeginningOperationsStock:v.after/v.events,overflowFraction:v.gross?v.lost/v.gross:null}];}))]));
 return {directory,sourceHash:hash(fs.readFileSync(__filename)),scope:'Subject production events only, not conversions/relic gains. Beginning Operations stock is immediately after production. Per-round means condition on games reaching that round; event counts expose changing cohorts. Windows1-6,7-12,13+ are descriptive, not causal stages or intrinsic resource values. Trace hashes and production conservation/metric bounds checked.',rounds:finish(rounds),windows:finish(windows),games};
}
if(require.main===module){const[directory,out]=process.argv.slice(2),r=analyze(directory);fs.writeFileSync(out,JSON.stringify(r,null,2));console.log(JSON.stringify(Object.fromEntries(Object.entries(r.windows).map(([w,rs])=>[w,Object.fromEntries(RES.map(k=>[k,{events:rs[k].events,overflow:rs[k].overflowFraction}]))]))));}
module.exports={analyze};
