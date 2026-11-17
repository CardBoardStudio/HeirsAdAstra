// Archive-only draw audit. Request size is observed, not a guessed card effect.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {hash}=require('./lib/simulation-archive.cjs');
function summarize(events,seat){
 const sizes={},rounds={};
 for(const e of events){
  if(e.type!=='draw'||e.player!==seat)continue;
  const a=sizes[e.requested]??={calls:0,requested:0,received:0,shortCalls:0};
  a.calls++;a.requested+=e.requested;a.received+=e.cards.length;a.shortCalls+=Number(e.cards.length<e.requested);
  const r=rounds[e.round]??={requested:0,received:0};r.requested+=e.requested;r.received+=e.cards.length;
 }
 return {sizes,rounds};
}
function audit(directory){
 const results=fs.readFileSync(path.join(directory,'results.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse),games=[];
 for(const g of results){
  const m=JSON.parse(fs.readFileSync(path.join(g.archive,'manifest.json'))),compressed=fs.readFileSync(path.join(g.archive,m.trace));
  if(hash(compressed)!==m.traceHash)throw Error('Trace hash mismatch');
  const events=[];
  for(const line of zlib.gunzipSync(compressed).toString().split('\n')){if(!line)continue;const r=JSON.parse(line);if(r.type==='event'&&r.event.type==='draw')events.push(r.event);}
  games.push({id:g.id,seed:g.seed,rotation:g.rotation,...summarize(events,g.subjectSeat??(4-g.rotation)%4)});
 }
 const sizes={};for(const g of games)for(const [n,a] of Object.entries(g.sizes)){const total=sizes[n]??={calls:0,requested:0,received:0,shortCalls:0};for(const k of Object.keys(total))total[k]+=a[k];}
 return {directory,sourceHash:hash(fs.readFileSync(__filename)),scope:'Subject draw requests and actual cards, by requested count. Request size does not identify the source card. Trace hashes verified; no replay or regeneration.',games,sizes};
}
if(require.main===module){const [directory,out]=process.argv.slice(2),result=audit(directory);fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result.sizes));}
module.exports={summarize,audit};
