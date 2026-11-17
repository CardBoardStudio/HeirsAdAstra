// Actual subject Colony commands, payments and Settler retention; no counterfactual value claim.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {hash,applyPatch}=require('./lib/simulation-archive.cjs');
const RES=['matter','energy','biomass','data'],zero=()=>Object.fromEntries(RES.map(r=>[r,0]));
function audit(directory){
 const rows=fs.readFileSync(path.join(directory,'results.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse),games=[],cards={};
 for(const g of rows){
  const seat=g.subjectSeat??(4-g.rotation)%4,m=JSON.parse(fs.readFileSync(path.join(g.archive,'manifest.json'))),bytes=fs.readFileSync(path.join(g.archive,m.trace));assert.equal(hash(bytes),m.traceHash);let state=null,active=null;const actions=[];
  for(const line of zlib.gunzipSync(bytes).toString().split('\n')){
   if(!line)continue;const r=JSON.parse(line);if('state'in r)state=r.state;if(r.patch)state=applyPatch(state,r.patch);
   const c=r.command,a=c?.action;
   if(r.type==='before-decision'){
    assert.equal(active,null);
    if(c?.method==='applyAction'&&c.actor===seat&&a?.type==='colonize'){
     const card=state.players[seat].hand.find(x=>x.id===a.card);assert(card,'Selected Colony card absent');
     active={command:c,round:state.round,key:card.key,card:card.id,coord:a.coord,capture:state.planets[a.coord].owner!==null&&state.planets[a.coord].owner!==seat,settlersBefore:state.fleets[a.coord]?.[seat]?.settler||0,cardPointsBefore:state.players[seat].cardPrestige||0,paid:zero(),paymentEvents:0};
    }
   }
   if(active&&r.type==='event'&&r.event.type==='resource-payment'&&r.event.player===seat&&r.event.result===true){active.paymentEvents++;for(const k of RES){const n=(r.event.before[k]||0)-(r.event.after[k]||0);assert(n>=0);active.paid[k]+=n;}}
   if(active&&r.type==='after-decision'){
    assert.deepEqual(c,active.command);assert(active.paymentEvents>0,'Missing Colony payment evidence');assert.equal(state.planets[active.coord].owner,seat);
    active.settlersAfter=state.fleets[active.coord]?.[seat]?.settler||0;assert(active.settlersAfter===active.settlersBefore||active.settlersAfter===active.settlersBefore-1);
    active.keptSettler=active.settlersAfter===active.settlersBefore;active.cardPointsGained=(state.players[seat].cardPrestige||0)-active.cardPointsBefore;delete active.command;actions.push(active);active=null;
   }
  }
  assert.equal(active,null);assert.equal(hash(state),m.finalStateHash);assert.equal(actions.length,g.players[seat].colonizations,'Independent Colony metric mismatch');assert.equal(actions.filter(a=>a.capture).length,g.players[seat].captures,'Capture metric mismatch');
  for(const a of actions){const v=cards[a.key]??={uses:0,neutral:0,captures:0,keptSettler:0,cardPointsGained:0,paid:zero()};v.uses++;v[a.capture?'captures':'neutral']++;v.keptSettler+=Number(a.keptSettler);v.cardPointsGained+=a.cardPointsGained;for(const k of RES)v.paid[k]+=a.paid[k];}
  games.push({id:g.id,seed:g.seed,rotation:g.rotation,actions});
 }
 return {directory,sourceHash:hash(fs.readFileSync(__filename)),scope:'Actual successful subject Colony commands, associated payment events, actual local Settler counts and immediate card Prestige. Basic/relic/market orders included. Hashes and independent Colony/capture metrics checked; no modeled strategic savings or future deck-thinning benefit.',cards,games};
}
if(require.main===module){const[directory,out]=process.argv.slice(2),r=audit(directory);fs.writeFileSync(out,JSON.stringify(r,null,2));console.log(JSON.stringify(r.cards));}
module.exports={audit};
