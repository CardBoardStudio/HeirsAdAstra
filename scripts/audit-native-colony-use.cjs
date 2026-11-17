// Query authoritative frozen legality at retained Operations positions. No game is advanced.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),vm=require('node:vm'),assert=require('node:assert/strict');
const {hash,applyPatch}=require('./lib/simulation-archive.cjs');
const KEYS=new Set(['seedArk','colonyPods','genesisCharter']);
function audit(directory){
 const protocol=JSON.parse(fs.readFileSync(path.join(directory,'protocol.json'))),app=fs.readFileSync(path.join(directory,'sources/app.js'),'utf8'),adapter=fs.readFileSync(path.join(directory,'sources/adapter.js'),'utf8');
 assert.equal(hash(app),protocol.sourceHashes.app);assert.equal(hash(adapter),protocol.sourceHashes.adapter);
 const context=vm.createContext({});vm.runInContext(adapter+'\n'+app,context);let port;const original=context.createGalacticAdapter;context.createGalacticAdapter=e=>{port=e;return original(e);};
 const rows=fs.readFileSync(path.join(directory,'results.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse),games=[];
 for(const g of rows){
  const seat=g.subjectSeat??(4-g.rotation)%4;if(!Object.keys(g.players[seat].marketBuys).some(k=>KEYS.has(k)))continue;
  const m=JSON.parse(fs.readFileSync(path.join(g.archive,'manifest.json'))),bytes=fs.readFileSync(path.join(g.archive,m.trace));assert.equal(hash(bytes),m.traceHash);let state=null;const cards={},cases=[];
  const track=c=>cards[c.id]??={id:c.id,key:c.key,firstSeenRound:state?.round??null,firstSeenNeutralWorlds:state?.clusters.filter(c=>c.kind==='world'&&state.planets[c.center]?.owner===null).length??null,draws:0,handDecisions:0,normalOrderDecisions:0,legalDecisions:0,ownOrders:0,otherColonyChosen:0,otherActionsChosen:0,noAvailableCenterDecisions:0,settlerMovesWithQuietArrivalAlternative:0};
  for(const line of zlib.gunzipSync(bytes).toString().split('\n')){
   if(!line)continue;const r=JSON.parse(line);if('state'in r)state=r.state;if(r.patch)state=applyPatch(state,r.patch);
   if(r.type==='event'&&r.event.type==='draw'&&r.event.player===seat)for(const c of r.event.cards)if(KEYS.has(c.key))track(c).draws++;
   if(state)for(const pile of ['deck','discard','hand','inPlay'])for(const c of state.players[seat][pile]||[])if(KEYS.has(c.key))track(c);
   const command=r.command;if(r.type!=='before-decision'||command?.method!=='applyAction'||command.actor!==seat||state.phase!=='operations')continue;
   const held=state.players[seat].hand.filter(c=>KEYS.has(c.key));if(!held.length)continue;
   const a=context.createGalacticReach({headless:true,resume:{state,turnSerial:r.counters.turnSerial,cardSerial:r.counters.cardSerial},random:()=>{throw Error('Legality audit must not consume RNG');}});
   const before=hash(port.state),legal=a.legalActions(seat);assert.equal(hash(port.state),before,'Legality query mutated state');
   const normal=legal.some(x=>['build','move','colonize','probe','excavate','pass','construct_draw'].includes(x.type));
   for(const card of held){
    const v=track(card),orders=legal.filter(x=>x.type==='colonize'&&x.card===card.id),chosen=command.action;
    const availableCenters=state.clusters.filter(c=>c.kind==='world'&&state.planets[c.center]?.owner!==seat&&(state.fleets[c.center]?.[seat]?.settler||0)>0).map(c=>c.center);
    v.handDecisions++;v.normalOrderDecisions+=Number(normal);v.legalDecisions+=Number(orders.length>0);v.noAvailableCenterDecisions+=Number(normal&&!availableCenters.length);
    if(orders.length){if(chosen.type==='colonize'&&chosen.card===card.id)v.ownOrders++;else if(chosen.type==='colonize')v.otherColonyChosen++;else v.otherActionsChosen++;}
    const quietArrivals=legal.filter(x=>x.type==='move'&&(x.units?.settler||0)>0&&state.clusters.some(c=>c.kind==='world'&&c.center===x.destination)&&state.planets[x.destination]?.owner===null&&!Object.entries(state.fleets[x.destination]||{}).some(([id,group])=>Number(id)!==seat&&Object.values(group).some(n=>n>0)));
    const skippedQuietArrival=chosen.type==='move'&&(chosen.units?.settler||0)>0&&quietArrivals.length>0&&!quietArrivals.some(x=>x.source===chosen.source&&x.destination===chosen.destination);
    v.settlerMovesWithQuietArrivalAlternative+=Number(skippedQuietArrival);

    if(cases.length<24)cases.push({round:state.round,card:card.id,normalOrderDecision:normal,availableCenters,quietArrivalDestinations:[...new Set(quietArrivals.map(x=>x.destination))],skippedQuietArrival,legalOrders:orders.length,chosen,biomass:state.players[seat].resources.biomass,settlers:Object.values(state.fleets).reduce((n,x)=>n+(x[seat]?.settler||0),0)});
   }
  }
  assert.equal(hash(state),m.finalStateHash);
  for(const key of KEYS)assert.equal(Object.values(cards).filter(c=>c.key===key).reduce((n,c)=>n+c.ownOrders,0),g.players[seat].marketPlays[key]||0,'Use count differs from independent play metric');
  games.push({id:g.id,seed:g.seed,rotation:g.rotation,seat,cards:Object.values(cards),cases});
 }
 const totals={};for(const g of games)for(const c of g.cards){const t=totals[c.key]??={cards:0,neverDrawn:0,draws:0,handDecisions:0,normalOrderDecisions:0,legalDecisions:0,ownOrders:0,otherColonyChosen:0,otherActionsChosen:0,noAvailableCenterDecisions:0,settlerMovesWithQuietArrivalAlternative:0};t.cards++;t.neverDrawn+=Number(c.draws===0);for(const k of ['draws','handDecisions','normalOrderDecisions','legalDecisions','ownOrders','otherColonyChosen','otherActionsChosen','noAvailableCenterDecisions','settlerMovesWithQuietArrivalAlternative'])t[k]+=c[k];}
 return {directory,sourceHash:hash(fs.readFileSync(__filename)),protocolSourceHashes:protocol.sourceHashes,scope:'Purchased subject Colony designs only. Frozen engine legality queried at recorded private Operations decisions without applying actions or drawing RNG. Decision counts repeat held cards; they are not independent opportunities. Non-normal pending choices are distinguished. Trace/final hashes and independent played counts checked.',totals,games};
}
if(require.main===module){const[directory,out]=process.argv.slice(2),r=audit(directory);fs.writeFileSync(out,JSON.stringify(r,null,2));console.log(JSON.stringify(r.totals));}
module.exports={audit};
