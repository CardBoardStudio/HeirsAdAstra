// Inspect actual Fleet commands; low combat counts alone do not establish waste.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {hash,applyPatch}=require('./lib/simulation-archive.cjs');
const RES=['matter','energy','biomass','data'],zero=()=>Object.fromEntries(RES.map(r=>[r,0]));
const count=(s,id)=>Object.values(s.fleets||{}).reduce((n,g)=>n+(g[id]?.fleet||0),0);
function audit(directory){
 const rows=fs.readFileSync(path.join(directory,'results.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse),games=[],profiles={};
 for(const g of rows){
  const m=JSON.parse(fs.readFileSync(path.join(g.archive,'manifest.json'))),bytes=fs.readFileSync(path.join(g.archive,m.trace));assert.equal(hash(bytes),m.traceHash);
  let state=null,active=null;const commands=[];
  for(const line of zlib.gunzipSync(bytes).toString().split('\n')){
   if(!line)continue;const r=JSON.parse(line);if('state' in r)state=r.state;if(r.patch)state=applyPatch(state,r.patch);
   const c=r.command,a=c?.action;
   if(r.type==='before-decision'){
    assert.equal(active,null);
    if(c?.method==='applyAction'&&['build','second_build','colony_build'].includes(a?.type)&&a.kind==='fleet'){
     const p=state.players[c.actor],card=p.hand.find(x=>x.id===a.card);
     active={command:c,actor:c.actor,round:state.round,profile:g.players[c.actor].profile,key:a.key||card?.key||a.type,level:card?.level||null,ownFleetsBefore:count(state,c.actor),publicEnemyFleets:state.players.reduce((n,p)=>n+(p.id===c.actor?0:count(state,p.id)),0),paid:zero(),paymentEvents:0};
    }
   }
   if(active&&r.type==='event'&&r.event.type==='resource-payment'&&r.event.player===active.actor&&r.event.result===true){
    active.paymentEvents++;for(const k of RES){const n=(r.event.before[k]||0)-(r.event.after[k]||0);assert(n>=0);active.paid[k]+=n;}
   }
   if(active&&r.type==='after-decision'){
    assert.deepEqual(c,active.command);assert(active.paymentEvents>0,'Missing Fleet payment evidence');
    active.free=RES.every(k=>active.paid[k]===0);delete active.command;commands.push(active);active=null;
   }
  }
  assert.equal(active,null);assert.equal(hash(state),m.finalStateHash);
  for(const p of g.players){
   const cs=commands.filter(c=>c.actor===p.seat);assert.equal(cs.length,p.ships.fleet,'Command count/ship metric mismatch');
   const v=profiles[p.profile]??={games:0,commands:0,paidCommands:0,freeCommands:0,paidResources:zero(),combatWins:0,survivors:0,paidWithNoPublicEnemyFleet:0};
   v.games++;v.commands+=cs.length;v.paidCommands+=cs.filter(c=>!c.free).length;v.freeCommands+=cs.filter(c=>c.free).length;v.combatWins+=p.combatWins;v.survivors+=count(state,p.seat);v.paidWithNoPublicEnemyFleet+=cs.filter(c=>!c.free&&c.publicEnemyFleets===0).length;
   for(const c of cs)for(const k of RES)v.paidResources[k]+=c.paid[k];
  }
  games.push({id:g.id,seed:g.seed,rotation:g.rotation,commands});
 }
 return {directory,sourceHash:hash(fs.readFileSync(__filename)),scope:'Completed native Fleet build commands, associated successful actor payments, opening public Fleet counts and final survivors. Does not classify strategic waste, route threats, lost Fleets or deterrence. Final state/trace hashes and independent ship counters checked.',profiles,games};
}
if(require.main===module){const[directory,out]=process.argv.slice(2),r=audit(directory);fs.writeFileSync(out,JSON.stringify(r,null,2));console.log(JSON.stringify(r.profiles));}
module.exports={audit};
