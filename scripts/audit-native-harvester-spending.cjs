// Attribute actual payment events to successful native Harvester commands.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {hash}=require('./lib/simulation-archive.cjs'),resources=['matter','energy','biomass','data'];
const zero=()=>Object.fromEntries(resources.map(r=>[r,0]));
function payment(event){
 if(event.type!=='resource-payment'||event.result!==true)return null;
 const paid=Object.fromEntries(resources.map(r=>[r,(event.before[r]||0)-(event.after[r]||0)]));
 assert(resources.every(r=>paid[r]>=0),'Payment must not create resources');return paid;
}
function audit(directory){
 const rows=fs.readFileSync(path.join(directory,'results.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse),games=[],total={builds:0,paidBuilds:0,freeBuilds:0,paidResources:zero()},byCard={};
 for(const g of rows){const id=g.subjectSeat??(4-g.rotation)%4,m=JSON.parse(fs.readFileSync(path.join(g.archive,'manifest.json'))),bytes=fs.readFileSync(path.join(g.archive,m.trace));assert.equal(hash(bytes),m.traceHash,'Trace hash mismatch');let active=null;const row={id:g.id,builds:0,paidBuilds:0,freeBuilds:0,paidResources:zero()};
  for(const line of zlib.gunzipSync(bytes).toString().split('\n')){if(!line)continue;const r=JSON.parse(line),c=r.command,a=c?.action;
   if(r.type==='before-decision'){active=c?.method==='applyAction'&&c.actor===id&&['build','second_build','colony_build'].includes(a?.type)&&a.kind==='harvester'?{command:JSON.stringify(c),key:a.key||a.type,events:0,paid:zero()}:null;}
   if(active&&r.type==='event'&&r.event.player===id){const cost=payment(r.event);if(cost){active.events++;for(const k of resources)active.paid[k]+=cost[k];}}
   if(active&&r.type==='after-decision'){
    assert.equal(JSON.stringify(c),active.command);assert(active.events>0,'A successful Harvester needs a recorded payment, including a free one');
    const paid=resources.some(k=>active.paid[k]>0),card=byCard[active.key]??={builds:0,paidBuilds:0,freeBuilds:0,paidResources:zero()};
    for(const counter of [row,total,card]){counter.builds++;counter[paid?'paidBuilds':'freeBuilds']++;for(const k of resources)counter.paidResources[k]+=active.paid[k];}active=null;
   }
  }
  assert.equal(row.builds,g.players[id].harvestersBuilt,'Command count must match the independent build metric');games.push(row);
 }
 return {directory,sourceHash:hash(fs.readFileSync(__filename)),scope:'Subject successful Harvester commands and actual stock deductions in their payment events. Failed/no-payment actions are not silently called free. Pending second/colony builds without a card key are labeled by command type. Game RNG and state are not replayed.',games,total,byCard};
}
if(require.main===module){const [directory,out]=process.argv.slice(2),result=audit(directory);fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result.total));}
module.exports={payment,audit};
