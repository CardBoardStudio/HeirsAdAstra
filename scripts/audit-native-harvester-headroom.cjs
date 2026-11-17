// Frozen-engine Harvester income/headroom and next production markers; not a waste counterfactual.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),vm=require('node:vm'),assert=require('node:assert/strict');
const {hash,applyPatch}=require('./lib/simulation-archive.cjs'),{payment}=require('./audit-native-harvester-spending.cjs');
const RES=['matter','energy','biomass','data'],zero=()=>Object.fromEntries(RES.map(k=>[k,0]));
function audit(directory){
 const protocol=JSON.parse(fs.readFileSync(path.join(directory,'protocol.json'))),app=fs.readFileSync(path.join(directory,'sources/app.js'),'utf8'),adapter=fs.readFileSync(path.join(directory,'sources/adapter.js'),'utf8');assert.equal(hash(app),protocol.sourceHashes.app);assert.equal(hash(adapter),protocol.sourceHashes.adapter);
 const anchor='      clone, deckContents,';assert.equal(app.split(anchor).length,2);const exposed=app.replace(anchor,'      aiIncome, clone, deckContents,');
 const context=vm.createContext({});vm.runInContext(adapter+'\n'+exposed,context);let port;const original=context.createGalacticAdapter;context.createGalacticAdapter=e=>{port=e;return original(e);};
 const inspect=(state,counters,seat)=>{context.createGalacticReach({headless:true,resume:{state,...counters},random:()=>{throw Error('Headroom query must not draw RNG');}});const before=hash(port.state),income=JSON.parse(JSON.stringify(port.aiIncome(seat))),limits=JSON.parse(JSON.stringify(port.resourceLimits(seat)));assert.equal(hash(port.state),before,'Income/limit query mutated state');return {income,limits};};
 const rows=fs.readFileSync(path.join(directory,'results.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse),games=[],resources={};
 for(const g of rows){
  const seat=g.subjectSeat??(4-g.rotation)%4,m=JSON.parse(fs.readFileSync(path.join(g.archive,'manifest.json'))),bytes=fs.readFileSync(path.join(g.archive,m.trace));assert.equal(hash(bytes),m.traceHash);let state=null,active=null;const builds=[];
  for(const line of zlib.gunzipSync(bytes).toString().split('\n')){
   if(!line)continue;const r=JSON.parse(line);if('state'in r)state=r.state;if(r.patch)state=applyPatch(state,r.patch);const c=r.command,a=c?.action;
   if(r.type==='before-decision'){
    assert.equal(active,null);
    if(c?.method==='applyAction'&&c.actor===seat&&['build','second_build','colony_build'].includes(a?.type)&&a.kind==='harvester'){
     const resource=state.planets[a.coord].type,q=inspect(state,r.counters,seat);assert(RES.includes(resource));active={command:c,round:state.round,coord:a.coord,key:a.key||a.type,resource,stockBefore:state.players[seat].resources[resource],incomeBefore:q.income[resource],limitBefore:q.limits[resource],paid:zero(),paymentEvents:0,nextProduction:null};
    }
   }
   if(active&&r.type==='event'&&r.event.player===seat){const cost=payment(r.event);if(cost){active.paymentEvents++;for(const k of RES)active.paid[k]+=cost[k];}}
   if(active&&r.type==='after-decision'){
    assert.deepEqual(c,active.command);assert(active.paymentEvents>0,'Missing Harvester payment evidence');const q=inspect(state,r.counters,seat);active.stockAfter=state.players[seat].resources[active.resource];active.incomeAfter=q.income[active.resource];active.limitAfter=q.limits[active.resource];active.incomeIncrement=active.incomeAfter-active.incomeBefore;assert(active.incomeIncrement>=0);active.free=RES.every(k=>active.paid[k]===0);delete active.command;builds.push(active);active=null;
   }
   if(r.type==='event'&&r.event.type==='production'){
    const e=r.event;for(const b of builds)if(!b.nextProduction&&e.round>b.round)b.nextProduction={round:e.round,gross:e.gross[seat][b.resource],lost:e.lost[seat][b.resource],before:e.before.find(p=>p.id===seat).stock[b.resource],after:e.after.find(p=>p.id===seat).stock[b.resource]};
   }
  }
  assert.equal(active,null);assert.equal(hash(state),m.finalStateHash);assert.equal(builds.length,g.players[seat].harvestersBuilt,'Independent Harvester count mismatch');
  for(const b of builds){const v=resources[b.resource]??={paid:0,free:0,paidAtFullStock:0,paidWithNoHeadroomAbsentSpending:0,paidWithNextProduction:0,paidNextOverflowAtLeastIncrement:0,paidWithoutNextProduction:0};v[b.free?'free':'paid']++;if(!b.free){v.paidAtFullStock+=Number(b.stockBefore>=b.limitBefore);v.paidWithNoHeadroomAbsentSpending+=Number(b.stockAfter+b.incomeBefore>=b.limitAfter);if(b.nextProduction){v.paidWithNextProduction++;v.paidNextOverflowAtLeastIncrement+=Number(b.incomeIncrement>0&&b.nextProduction.lost>=b.incomeIncrement);}else v.paidWithoutNextProduction++;}}
  games.push({id:g.id,seed:g.seed,rotation:g.rotation,completed:g.completed,builds});
 }
 return {directory,sourceHash:hash(fs.readFileSync(__filename)),originalAppHash:hash(app),scope:'Subject paid/free Harvester commands, actual frozen-engine income/limits, stock and first later production. Full stock/absent-spending headroom and next-overflow markers are descriptive, not causal wasted production: later spending, ownership changes and other builds matter. Multiple builds may reference one production event; absent next production stays null. Queries consume no RNG/mutation; source/trace/final hashes and independent build counts checked.',resources,games};
}
if(require.main===module){const[directory,out]=process.argv.slice(2),r=audit(directory);fs.writeFileSync(out,JSON.stringify(r,null,2));console.log(JSON.stringify(r.resources));}
module.exports={audit};
