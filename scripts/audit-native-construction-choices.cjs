// Actual optional-construction decisions and payments, queried against their frozen engine.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),vm=require('node:vm'),assert=require('node:assert/strict');
const {hash,applyPatch}=require('./lib/simulation-archive.cjs');
const {payment}=require('./audit-native-harvester-spending.cjs');
const RES=['matter','energy','biomass','data'],zero=()=>Object.fromEntries(RES.map(k=>[k,0]));
function audit(directory){
 const protocol=JSON.parse(fs.readFileSync(path.join(directory,'protocol.json'))),app=fs.readFileSync(path.join(directory,'sources/app.js'),'utf8'),adapter=fs.readFileSync(path.join(directory,'sources/adapter.js'),'utf8');
 assert.equal(hash(app),protocol.sourceHashes.app);assert.equal(hash(adapter),protocol.sourceHashes.adapter);
 const context=vm.createContext({});vm.runInContext(adapter+'\n'+app,context);let port;const original=context.createGalacticAdapter;context.createGalacticAdapter=e=>{port=e;return original(e);};
 const rows=fs.readFileSync(path.join(directory,'results.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse),games=[];
 const totals={pendingDecisions:0,finishes:0,finishesWithLegalBuild:0,secondBuilds:0,paidSecondBuilds:0,freeSecondBuilds:0,paidResources:zero(),buildKinds:{},otherActions:{}};
 for(const g of rows){
  const seat=g.subjectSeat??(4-g.rotation)%4,m=JSON.parse(fs.readFileSync(path.join(g.archive,'manifest.json'))),bytes=fs.readFileSync(path.join(g.archive,m.trace));assert.equal(hash(bytes),m.traceHash);let state=null,active=null;const choices=[];
  for(const line of zlib.gunzipSync(bytes).toString().split('\n')){
   if(!line)continue;const r=JSON.parse(line);if('state'in r)state=r.state;if(r.patch)state=applyPatch(state,r.patch);const c=r.command;
   if(r.type==='before-decision'){
    assert.equal(active,null);
    if(c?.method==='applyAction'&&c.actor===seat&&state.pendingConstruct&&!state.pendingCombat){
     assert.equal(state.pendingConstruct.playerId,seat);
     const a=context.createGalacticReach({headless:true,resume:{state,...r.counters},random:()=>{throw Error('Construction audit must not draw RNG');}}),before=hash(port.state),legal=JSON.parse(JSON.stringify(a.legalActions(seat)));assert.equal(hash(port.state),before,'Legality query mutated state');
     assert(legal.some(a=>a.type==='finish_construct'),'Optional construction must allow finishing');assert(legal.some(a=>hash(a)===hash(c.action)),'Recorded choice is not legal in frozen state');
     active={command:c,round:state.round,cardId:state.pendingConstruct.cardId,cardName:state.pendingConstruct.cardName,action:c.action,legalBuilds:legal.filter(a=>a.type==='second_build').length,legalBuildKinds:[...new Set(legal.filter(a=>a.type==='second_build').map(a=>a.kind))],stockBefore:JSON.parse(JSON.stringify(state.players[seat].resources)),paid:zero(),paymentEvents:0};
    }
   }
   if(active&&r.type==='event'&&r.event.player===seat&&active.action.type==='second_build'){
    const cost=payment(r.event);if(cost){active.paymentEvents++;for(const k of RES)active.paid[k]+=cost[k];}
   }
   if(active&&r.type==='after-decision'){
    assert.deepEqual(c,active.command);assert.notEqual(r.result,false,'Failed choices are not completed construction');
    totals.pendingDecisions++;const type=active.action.type;
    if(type==='finish_construct'){totals.finishes++;totals.finishesWithLegalBuild+=Number(active.legalBuilds>0);assert.equal(state.pendingConstruct,null,'Finish must clear the pending choice');}
    else if(type==='second_build'){
     assert(active.paymentEvents>0,'Successful second build needs an actual payment event, even when free');assert.equal(state.pendingConstruct,null,'Second build must clear the pending choice');totals.secondBuilds++;const free=RES.every(k=>active.paid[k]===0);totals[free?'freeSecondBuilds':'paidSecondBuilds']++;totals.buildKinds[active.action.kind]=(totals.buildKinds[active.action.kind]||0)+1;for(const k of RES)totals.paidResources[k]+=active.paid[k];
    }else totals.otherActions[type]=(totals.otherActions[type]||0)+1;
    delete active.command;choices.push(active);active=null;
   }
  }
  assert.equal(active,null);assert.equal(hash(state),m.finalStateHash);games.push({id:g.id,seed:g.seed,rotation:g.rotation,completed:g.completed,choices});
 }
 return {directory,sourceHash:hash(fs.readFileSync(__filename)),protocolSourceHashes:protocol.sourceHashes,scope:'Subject pending Construct decisions, frozen legal alternatives and actual second-build resource payments. Repeated trades/conversions count as decisions, not separate construction opportunities. A finish with legal builds is an option exercised, not a causal estimate of saved spending. Frozen sources, trace/final hashes, nonmutating RNG-free legality, successful payments and pending-choice completion checked.',totals,games};
}
if(require.main===module){const[directory,out]=process.argv.slice(2),r=audit(directory);fs.writeFileSync(out,JSON.stringify(r,null,2));console.log(JSON.stringify(r.totals));}
module.exports={audit};
