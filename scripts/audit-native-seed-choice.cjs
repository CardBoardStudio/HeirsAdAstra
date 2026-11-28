// Actual Seed Ark orders and draws for all seats; does not infer card value from use counts.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {archiveRecords,hash}=require('./lib/simulation-archive.cjs'),{payment}=require('./audit-native-harvester-spending.cjs');
const RES=['matter','energy','biomass','data'],zero=()=>Object.fromEntries(RES.map(k=>[k,0]));
const blank=()=>({purchases:0,colonizeUses:0,drawUses:0,requestedDraws:0,receivedDraws:0,partialDraws:0,purchasePaid:zero(),colonyPaid:zero()});
function audit(directory){
 const protocol=JSON.parse(fs.readFileSync(path.join(directory,'protocol.json'))),source=fs.readFileSync(path.join(directory,'sources/app.js'),'utf8');assert.equal(hash(source),protocol.sourceHashes.app);
 const match=source.match(/const ADVANCED_CARDS = (\{[\s\S]*?\n  \});/);assert(match);const def=vm.runInNewContext('('+match[1]+')').seedArk;assert.equal(def.cost.biomass,4);assert([0,2].includes(def.fallbackDraw||0));
 const rows=fs.readFileSync(path.join(directory,'results.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);assert.equal(rows.length,protocol.seeds*protocol.rotations.length,'Scheduled batch unfinished');assert(rows.every(g=>g.completed),'Cutoffs require separate reporting');const profiles={},games=[];
 for(const g of rows){
  const manifest=JSON.parse(fs.readFileSync(path.join(g.archive,'manifest.json')));assert.equal(manifest.sourceHashes['original-app.js'],protocol.sourceHashes.app);let active=null,lastState;const choices=[],seats=g.players.map(()=>blank());
  for(const r of archiveRecords(g.archive)){
   const state=r.position,c=r.command,a=c?.action;lastState=state;
   if(r.type==='before-decision'){
    assert.equal(active,null);if(c?.method!=='applyAction')continue;
    const p=state.players[c.actor],card=p.hand.find(x=>x.id===a.card),buy=a.type==='buy'&&a.source==='market'&&state.market[a.index]?.key==='seedArk';
    if(buy||(['colonize','order_draw'].includes(a.type)&&card?.key==='seedArk')){
     assert.equal(state.activePlayer,c.actor);assert.equal(state.phase,buy?'buy':'operations');if(a.type==='order_draw')assert.equal(def.fallbackDraw,2);
     active={command:c,round:state.round,seat:c.actor,profile:g.players[c.actor].profile,type:buy?'buy':a.type,card:a.card||null,coord:a.coord||null,settlersBefore:state.fleets[a.coord]?.[c.actor]?.settler||0,fleetsBefore:state.fleets[a.coord]?.[c.actor]?.fleet||0,capture:a.type==='colonize'&&state.planets[a.coord].owner!==null,paid:zero(),payments:0,draws:[],committed:false,stockBefore:{...p.resources}};
    }
   }
   if(active&&r.type==='event'){
    const p=state.players[active.seat];active.committed||=p.inPlay.some(x=>x.id===active.card);
    if(r.event.player===active.seat){
     const cost=payment(r.event);if(cost){active.payments++;for(const k of RES)active.paid[k]+=cost[k];}
     if(r.event.type==='draw'&&r.event.requested===2){
      assert.equal(active.type,'order_draw','Colonize must not also draw two');assert(p.inPlay.some(x=>x.id===active.card),'Commit before drawing');assert(!r.event.cards.some(x=>x.id===active.card),'The played copy cannot redraw itself');assert(r.event.cards.length<=2);
      for(const k of RES)assert.equal(p.resources[k],active.stockBefore[k],'Drawing has no resource payment');active.draws.push(r.event.cards.map(x=>({id:x.id,key:x.key})));
     }
    }
   }
   if(active&&r.type==='after-decision'){
    assert.deepEqual(c,active.command);assert.notEqual(r.result,false);const s=seats[active.seat];
    if(active.type==='buy'){assert(active.payments>0);s.purchases++;for(const k of RES)s.purchasePaid[k]+=active.paid[k];assert(RES.filter(k=>k!=='biomass').every(k=>active.paid[k]===0));assert(active.paid.biomass<=4);}
    else{
     assert(active.committed,'Used Seed Ark must enter in play');
     if(active.type==='order_draw'){assert.equal(active.payments,0);assert.equal(active.draws.length,1);s.drawUses++;s.requestedDraws+=2;s.receivedDraws+=active.draws[0].length;s.partialDraws+=Number(active.draws[0].length<2);}
     else{assert(active.payments>0);assert.deepEqual(active.paid,{matter:0,energy:0,biomass:1,data:0});assert.equal(state.planets[active.coord].owner,active.seat);assert(active.settlersBefore>=1);assert.equal(state.fleets[active.coord]?.[active.seat]?.settler||0,active.settlersBefore-1);if(active.capture){assert(active.fleetsBefore>=1);assert.equal(state.fleets[active.coord]?.[active.seat]?.fleet||0,active.fleetsBefore);}s.colonizeUses++;for(const k of RES)s.colonyPaid[k]+=active.paid[k];}
    }
    delete active.command;choices.push(active);active=null;
   }
  }
  assert.equal(active,null);assert.equal(hash(lastState),manifest.finalStateHash);
  for(const p of g.players){const s=seats[p.seat];assert.equal(s.purchases,p.marketBuys.seedArk||0);assert.equal(s.colonizeUses+s.drawUses,p.marketPlays.seedArk||0,'Independent Seed use metric differs');const total=profiles[p.profile]??=blank();for(const k of ['purchases','colonizeUses','drawUses','requestedDraws','receivedDraws','partialDraws'])total[k]+=s[k];for(const field of ['purchasePaid','colonyPaid'])for(const k of RES)total[field][k]+=s[field][k];}
  games.push({id:g.id,seed:g.seed,rotation:g.rotation,seats,choices});
 }
 return {directory,sourceHash:hash(fs.readFileSync(__filename)),appHash:hash(source),scope:'All seats in completed scheduled games. Actual Seed purchases/payments and mutually exclusive Colony/draw orders,with requested/received cards. Archive reader verifies source/trace/state/counter/RNG hashes;run source and final manifest hashes match. Independent purchase/use metrics match. Commitment before draw,no self-redraw,no draw payment,Settler consumption,capture Fleet requirement/retention and no draw-two bonus on Colony use checked. Counts and nominal payments are descriptive,not causal card value or displaced scoring.',profiles,games};
}
if(require.main===module){const[directory,out]=process.argv.slice(2),r=audit(directory);fs.writeFileSync(out,JSON.stringify(r,null,2));console.log(JSON.stringify(r.profiles));}
module.exports={audit};
