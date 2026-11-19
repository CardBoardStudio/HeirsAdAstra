// Actual market discounts and payments; unused coupons are not resource gains.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),vm=require('node:vm'),assert=require('node:assert/strict');
const {hash,applyPatch}=require('./lib/simulation-archive.cjs'),{payment}=require('./audit-native-harvester-spending.cjs');
const RES=['matter','energy','biomass','data'],KEYS=['procurementHub','tradeSyndicate'],zero=()=>Object.fromEntries(RES.map(k=>[k,0]));
function audit(directory){
 const protocol=JSON.parse(fs.readFileSync(path.join(directory,'protocol.json'))),app=fs.readFileSync(path.join(directory,'sources/app.js'),'utf8'),adapter=fs.readFileSync(path.join(directory,'sources/adapter.js'),'utf8');
 assert.equal(hash(app),protocol.sourceHashes.app);assert.equal(hash(adapter),protocol.sourceHashes.adapter);
 const context=vm.createContext({});vm.runInContext(adapter+'\n'+app,context);let port;const original=context.createGalacticAdapter;context.createGalacticAdapter=e=>{port=e;return original(e);};
 const inspect=(state,counters,seat,key)=>{context.createGalacticReach({headless:true,resume:{state,...counters},random:()=>{throw Error('Discount audit must not draw RNG');}});const before=hash(port.state),cost=JSON.parse(JSON.stringify(port.purchaseCost(port.state.players[seat],key))),printed=JSON.parse(JSON.stringify(port.ALL_CARDS[key].cost));assert.equal(hash(port.state),before,'Price query mutated state');return {cost,printed};};
 const rows=fs.readFileSync(path.join(directory,'results.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse),games=[];
 const totals={plays:Object.fromEntries(KEYS.map(k=>[k,0])),marketPurchases:0,discountedPurchases:0,saved:zero(),playedRounds:0,playedRoundsWithoutDiscountedPurchase:0};
 for(const g of rows){
  const seat=g.subjectSeat??(4-g.rotation)%4,m=JSON.parse(fs.readFileSync(path.join(g.archive,'manifest.json'))),bytes=fs.readFileSync(path.join(g.archive,m.trace));assert.equal(hash(bytes),m.traceHash);let state=null,active=null;const plays=[],purchases=[];
  for(const line of zlib.gunzipSync(bytes).toString().split('\n')){
   if(!line)continue;const r=JSON.parse(line);if('state'in r)state=r.state;if(r.patch)state=applyPatch(state,r.patch);const c=r.command,a=c?.action;
   if(r.type==='before-decision'){
    assert.equal(active,null);
    if(c?.method==='applyAction'&&c.actor===seat&&a.type==='buy_effect'){
     const card=state.players[seat].hand.find(x=>x.id===a.card);assert(card&&KEYS.includes(card.key),'Unknown Buy-effect card');active={command:c,type:'play',round:state.round,key:card.key};
    }else if(c?.method==='applyAction'&&c.actor===seat&&a.type==='buy'&&a.source!=='capacity'){
     const key=state.market[a.index].key,q=inspect(state,r.counters,seat,key);active={command:c,type:'purchase',round:state.round,key,...q,hubCoupons:state.players[seat].buyHubDiscounts||0,syndicateActive:(state.players[seat].buyDiscountEach||0)>0,paid:zero(),paymentEvents:0};
    }
   }
   if(active?.type==='purchase'&&r.type==='event'&&r.event.player===seat){const cost=payment(r.event);if(cost){active.paymentEvents++;for(const k of RES)active.paid[k]+=cost[k];}}
   if(active&&r.type==='after-decision'){
    assert.deepEqual(c,active.command);assert.notEqual(r.result,false);delete active.command;
    if(active.type==='play'){plays.push(active);totals.plays[active.key]++;}
    else{
     assert(active.paymentEvents>0,'Market purchase needs an actual payment event, even when free');active.saved=zero();
     for(const k of RES){assert.equal(active.paid[k],active.cost[k]||0,'Actual payment differs from frozen discounted price');active.saved[k]=(active.printed[k]||0)-active.paid[k];assert(active.saved[k]>=0);totals.saved[k]+=active.saved[k];}
     active.discounted=RES.some(k=>active.saved[k]>0);totals.marketPurchases++;totals.discountedPurchases+=Number(active.discounted);purchases.push(active);
    }
    active=null;
   }
  }
  assert.equal(active,null);assert.equal(hash(state),m.finalStateHash);
  for(const key of KEYS)assert.equal(plays.filter(p=>p.key===key).length,g.players[seat].marketPlays[key]||0,'Independent Buy-effect use count differs');
  assert.equal(purchases.length,Object.values(g.players[seat].marketBuys).reduce((a,b)=>a+b,0),'Independent market purchase count differs');
  const playedRounds=[...new Set(plays.map(p=>p.round))],without=playedRounds.filter(round=>!purchases.some(p=>p.round===round&&p.discounted));totals.playedRounds+=playedRounds.length;totals.playedRoundsWithoutDiscountedPurchase+=without.length;
  games.push({id:g.id,seed:g.seed,rotation:g.rotation,completed:g.completed,plays,purchases,playedRoundsWithoutDiscountedPurchase:without});
 }
 return {directory,sourceHash:hash(fs.readFileSync(__filename)),protocolSourceHashes:protocol.sourceHashes,scope:'Subject actual Buy-effect plays, paid market purchases and combined printed-minus-paid savings. Capacity purchases/upgrades do not consume market discounts. Combined savings are not assigned individually when both discount types apply, and are not a causal profit/win estimate. Played rounds without a discounted market purchase are descriptive. Sources, trace/final hashes, independent use/purchase metrics and nonmutating RNG-free frozen price queries checked.',totals,games};
}
if(require.main===module){const[directory,out]=process.argv.slice(2),r=audit(directory);fs.writeFileSync(out,JSON.stringify(r,null,2));console.log(JSON.stringify(r.totals));}
module.exports={audit};
