// Actual paid/free Settlers and bundled Colonize cards; excess-to-target is not a waste verdict.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {archiveRecords,hash}=require('./lib/simulation-archive.cjs'),{payment}=require('./audit-native-harvester-spending.cjs');
const RES=['matter','energy','biomass','data'],zero=()=>Object.fromEntries(RES.map(k=>[k,0]));
const units=(s,id,kind)=>Object.values(s.fleets).reduce((n,g)=>n+(g[id]?.[kind]||0),0),cards=p=>[...p.hand,...p.deck,...p.discard,...p.inPlay];
const blank=()=>({games:0,builds:0,paid:0,free:0,paidBeyondTarget:0,paidBeyondTargetWithoutNeutralWorlds:0,paidBeyondTargetWithTenFleets:0,paidResources:zero(),paidBeyondTargetResources:zero(),bundledColonize:0,paidColonizeTrashes:0,colonizeTrashPaid:zero(),trashesFromPaidBeyondTarget:0,trashPaidFromPaidBeyondTarget:zero(),finalSettlers:0,finalColonizeCards:0,roundEndEvents:0,unplayedColonizeAtRoundEnd:0});
function audit(directory){
 const protocol=JSON.parse(fs.readFileSync(path.join(directory,'protocol.json'))),rust=fs.readFileSync(path.join(directory,'sources/rust.txt'),'utf8');assert.equal(hash(rust),protocol.sourceHashes.rust);assert(/"settler" => \{\s*if bot_units\(view, seat, "settler"\)\s*< if matches!\(self.strategy, Strategy::Expansion\) \{\s*2\.0\s*\} else \{\s*1\.0\s*\}/.test(rust),'Desired Settler targets changed;review the audit');
 const rows=fs.readFileSync(path.join(directory,'results.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);assert.equal(rows.length,protocol.seeds*protocol.rotations.length);assert(rows.every(g=>g.completed));const profiles={},games=[];
 for(const g of rows){
  const manifest=JSON.parse(fs.readFileSync(path.join(g.archive,'manifest.json')));assert.equal(manifest.sourceHashes['native-policy.rs'],protocol.sourceHashes.rust);let active=null,lastState,initialSeen=false;const commissions=[],trashes=[],ends=[],initialColonize=new Set();
  for(const r of archiveRecords(g.archive)){
   const s=r.position,c=r.command,a=c?.action;lastState=s;if(s&&!initialSeen){initialSeen=true;for(const p of s.players)for(const card of cards(p))if(card.key==='colonize')initialColonize.add(card.id);}
   if(r.type==='before-decision'){
    assert.equal(active,null);if(c?.method!=='applyAction')continue;const p=s.players[c.actor],card=cards(p).find(x=>x.id===a.card);
    if(['build','second_build','colony_build'].includes(a.type)&&a.kind==='settler')active={type:'commission',command:c,actor:c.actor,round:s.round,profile:g.players[c.actor].profile,key:a.key||a.type,coord:a.coord,settlersBefore:units(s,c.actor,'settler'),fleetsBefore:units(s,c.actor,'fleet'),desiredTarget:g.players[c.actor].profile==='expansion'?2:1,neutralWorlds:s.clusters.filter(w=>w.kind==='world'&&s.planets[w.center].owner===null).length,colonizeBefore:cards(p).filter(x=>x.key==='colonize').length,paid:zero(),paymentEvents:0,gainedColonize:[]};
    else if(a.type==='decommission'&&card?.key==='colonize')active={type:'trash',command:c,actor:c.actor,round:s.round,profile:g.players[c.actor].profile,card:card.id,paid:zero(),paymentEvents:0};
   }
   if(active&&r.type==='event'){
    if(active.type==='commission'&&r.event.player===active.actor){const paid=payment(r.event);if(paid){active.paymentEvents++;for(const k of RES)active.paid[k]+=paid[k];}}
    if(active.type==='trash'&&r.event.type==='action'&&r.event.name==='decommission'&&r.event.args[0]===active.actor&&r.event.args[1]===active.card&&r.event.result===true){const before=r.event.before.find(p=>p.id===active.actor).stock,after=r.event.after.find(p=>p.id===active.actor).stock;active.paymentEvents++;for(const k of RES){const n=before[k]-after[k];assert(n>=0);active.paid[k]+=n;}assert.equal(RES.reduce((n,k)=>n+active.paid[k],0),3);}
    if(active.type==='commission'&&r.event.type==='action'&&r.event.name==='gainCard'&&r.event.args[0]?.player===active.actor&&r.event.args[1]?.key==='colonize')active.gainedColonize.push(r.event.args[1].id);
   }
   if(active&&r.type==='after-decision'){
    assert.deepEqual(c,active.command);assert.notEqual(r.result,false);assert(active.paymentEvents>0);active.free=RES.every(k=>active.paid[k]===0);delete active.command;
    if(active.type==='commission'){assert.equal(active.gainedColonize.length,1,'One Colonize card per commission');active.beyondTarget=active.settlersBefore>=active.desiredTarget;commissions.push(active);}else{const origin=commissions.find(c=>c.actor===active.actor&&c.gainedColonize.includes(active.card));assert(origin||initialColonize.has(active.card),'Colonize trash has no recorded origin');active.origin=origin?{kind:'commission',round:origin.round,free:origin.free,beyondTarget:origin.beyondTarget}: {kind:'initial'};trashes.push(active);}active=null;
   }
   if(r.type==='event'&&r.event.type==='round-end')ends.push({round:r.event.round,players:r.event.players.map(p=>({id:p.id,unplayedColonize:p.hand.filter(c=>c.key==='colonize').length}))});
  }
  assert.equal(active,null);assert.equal(hash(lastState),manifest.finalStateHash);
  for(const p of g.players){
   const cs=commissions.filter(c=>c.actor===p.seat),ts=trashes.filter(c=>c.actor===p.seat),v=profiles[p.profile]??=blank();assert.equal(cs.length,p.ships.settler,'Independent Settler commission counter differs');v.games++;v.builds+=cs.length;v.finalSettlers+=units(lastState,p.seat,'settler');v.finalColonizeCards+=cards(lastState.players[p.seat]).filter(c=>c.key==='colonize').length;
   for(const c of cs){v[c.free?'free':'paid']++;v.bundledColonize+=c.gainedColonize.length;if(!c.free&&c.beyondTarget){v.paidBeyondTarget++;v.paidBeyondTargetWithoutNeutralWorlds+=Number(c.neutralWorlds===0);v.paidBeyondTargetWithTenFleets+=Number(c.fleetsBefore>=10);for(const k of RES)v.paidBeyondTargetResources[k]+=c.paid[k];}for(const k of RES)v.paidResources[k]+=c.paid[k];}
   for(const t of ts){v.paidColonizeTrashes+=Number(!t.free);const linked=t.origin.kind==='commission'&&!t.origin.free&&t.origin.beyondTarget;v.trashesFromPaidBeyondTarget+=Number(linked);for(const k of RES){v.colonizeTrashPaid[k]+=t.paid[k];if(linked)v.trashPaidFromPaidBeyondTarget[k]+=t.paid[k];}}
   for(const e of ends){v.roundEndEvents++;v.unplayedColonizeAtRoundEnd+=e.players.find(x=>x.id===p.seat).unplayedColonize;}
  }
  games.push({id:g.id,seed:g.seed,rotation:g.rotation,commissions,trashes,ends});
 }
 return {directory,sourceHash:hash(fs.readFileSync(__filename)),rustHash:hash(rust),scope:'All seats,actual successful paid/free Settler commissions,bundled Colonize gains and paid Colonize decommissions linked by card id to their commission. Beyond-target uses the audited native normal replacement target(Expansion2,others1);it does not prove no future capture or combat role. No-neutral-world and ten-Fleet markers are context,not causal waste. Repeated round-end hand counts are not distinct cards or missed legal actions. Archive source/trace/private-state/counter/RNG/final hashes and independent successful-commission metrics checked.',profiles,games};
}
if(require.main===module){const[directory,out]=process.argv.slice(2),r=audit(directory);fs.writeFileSync(out,JSON.stringify(r,null,2));console.log(JSON.stringify(r.profiles));}
module.exports={audit};
