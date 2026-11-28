// Publicly affordable scoring cards taken before the subject enters Buy.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {archiveRecords,hash}=require('./lib/simulation-archive.cjs');
const RES=['matter','energy','biomass','data'];
function audit(directory){
 const protocol=JSON.parse(fs.readFileSync(path.join(directory,'protocol.json'))),source=fs.readFileSync(path.join(directory,'sources/app.js'),'utf8'),adapter=fs.readFileSync(path.join(directory,'sources/adapter.js'),'utf8');assert.equal(hash(source),protocol.sourceHashes.app);assert.equal(hash(adapter),protocol.sourceHashes.adapter);
 const match=source.match(/const ADVANCED_CARDS = (\{[\s\S]*?\n  \});/);assert(match);const defs=Object.fromEntries(Object.entries(vm.runInNewContext('('+match[1]+')')).filter(([,d])=>d.gainPrestige>0));
 const context=vm.createContext({});vm.runInContext(adapter+'\n'+source,context);let port;const original=context.createGalacticAdapter;context.createGalacticAdapter=e=>{port=e;return original(e);};
 const rows=fs.readFileSync(path.join(directory,'results.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);assert.equal(rows.length,protocol.seeds*protocol.rotations.length);assert(rows.every(g=>g.completed));const games=[],totals={affordableOperationDecisions:0,offersTaken:0,lastVisibleCopyTaken:0,unavailableAtOwnBuy:0,unavailableAndStillAffordable:0,strongPublicTimingMarkers:0};
 const yard=(s,id)=>Object.values(s.planets).some(p=>p.owner===id&&p.upgrade==='starbase');
 const affordable=(s,id,d)=>yard(s,id)&&RES.every(k=>s.players[id].resources[k]>=(d.cost[k]||0)&&s.players[id].resourceLimits[k]>=(d.cost[k]||0));
 function pureFleetMerge(s,id,a){
  if(a.type!=='move'||a.source===a.destination||a.moveGroup==='explorer'||!a.units?.fleet||a.units.settler||a.units.explorer||(s.fleets[a.source]?.[id]?.settler||0)>0||!(s.fleets[a.destination]?.[id]?.fleet>0)||(s.planets[a.destination]?.upgrade==='starbase'&&s.planets[a.destination].owner!==id))return false;
  const enemyPositions=Object.entries(s.fleets).filter(([,groups])=>Object.keys(groups).some(owner=>Number(owner)!==id));
  if(enemyPositions.some(([at])=>port.travelDistance(a.destination,at)<port.travelDistance(a.source,at)))return false;
  const protectedSites=[a.source,a.destination,...Object.entries(s.planets).filter(([,p])=>p.owner===id&&p.hasColony).map(([at])=>at),...Object.entries(s.fleets).filter(([,g])=>g[id]?.settler>0).map(([at])=>at)];
  return !enemyPositions.some(([at,groups])=>Object.entries(groups).some(([owner,f])=>Number(owner)!==id&&f.fleet>0)&&protectedSites.some(site=>port.travelDistance(at,site)<=3));
 }
 for(const g of rows){
  const seat=g.subjectSeat??(4-g.rotation)%4,offers=new Map(),losses=[],buyRounds=new Map();let activeBuy=null,geometry=null,lastState;
  const resolveOwnBuy=x=>{const opening=buyRounds.get(x.round);if(opening){x.unavailableAtOwnBuy=!opening.keys.includes(x.key);x.affordableAtOwnBuy=opening.affordable[x.key];}};
  const manifest=JSON.parse(fs.readFileSync(path.join(g.archive,'manifest.json')));assert.equal(manifest.sourceHashes['original-app.js'],protocol.sourceHashes.app);
  for(const r of archiveRecords(g.archive)){
   const s=r.position;if(!s)continue;lastState=s;
   if(s.phase==='buy'&&s.activePlayer===seat&&!buyRounds.has(s.round)){
    buyRounds.set(s.round,{keys:s.market.map(c=>c.key),affordable:Object.fromEntries(Object.entries(defs).map(([key,def])=>[key,affordable(s,seat,def)]))});for(const loss of losses.filter(x=>x.round===s.round&&x.unavailableAtOwnBuy===null))resolveOwnBuy(loss);
    offers.clear();
   }
   for(const [id,o] of offers)if(o.round!==s.round)offers.delete(id);
   const c=r.command,a=c?.action;
   if(r.type==='before-decision'){
    assert.equal(activeBuy,null);if(c?.method!=='applyAction')continue;
    if(a.type==='buy'&&a.source==='market'&&c.actor!==seat){const card=s.market[a.index],offer=offers.get(card?.id);if(offer)activeBuy={command:c,offer:{...offer},buyer:c.actor,affordableWhenTaken:affordable(s,seat,defs[card.key]),cardsPurchasedBefore:s.players[c.actor].cardsPurchased};}
    if(c.actor!==seat||s.phase!=='operations'||s.activePlayer!==seat||s.players[seat].passed||a.type==='pass'||s.pendingCombat||s.pendingCombatReport||s.pendingMove||s.pendingConstruct||s.pendingColonyBuild||s.pendingConsortium)continue;
    const p=s.players[seat],owned=[...p.hand,...p.deck,...p.discard,...p.inPlay],established=owned.some(c=>c.key==='construct'&&c.starter&&(c.upgraded||c.level>=2));if(!established)continue;
    const available=s.market.filter(card=>defs[card.key]&&affordable(s,seat,defs[card.key])&&!owned.some(c=>c.key===card.key));if(!available.length)continue;
    if(!geometry){context.createGalacticReach({headless:true,resume:{state:s,...r.counters},random:()=>{throw Error('Timing query must not draw RNG');}});geometry=hash(s.portalLinks);}
    assert.equal(hash(s.portalLinks),geometry);const before=hash(port.state),merge=pureFleetMerge(s,seat,a);assert.equal(hash(port.state),before,'Public geometry query mutated state');
    totals.affordableOperationDecisions++;
    for(const card of available){const prior=offers.get(card.id),threats=s.players.filter(p=>p.id!==seat&&!p.passed&&affordable(s,p.id,defs[card.key])).map(p=>p.id),decision={decision:r.index,privateStateHash:r.stateHash,chosen:a,pureFleetMerge:merge,harvesterBuild:a.type==='build'&&a.kind==='harvester',paidHarvesterBuild:a.type==='build'&&a.kind==='harvester'&&!['free','each'].includes(a.discountResource),chosenCard:owned.find(c=>c.id===a.card)||null,stock:{...p.resources},publiclyFundedUnpassedOpponents:threats};offers.set(card.id,{id:card.id,key:card.key,round:s.round,firstDecision:prior?.firstDecision??r.index,lastDecision:r.index,operationDecisions:(prior?.operationDecisions||0)+1,...decision,history:[...(prior?.history||[]),decision]});}
   }
   if(activeBuy&&r.type==='after-decision'){
    assert.deepEqual(c,activeBuy.command);assert.equal(s.players[activeBuy.buyer].cardsPurchased,activeBuy.cardsPurchasedBefore+1);assert(!s.market.some(card=>card.id===activeBuy.offer.id));
    const loss={...activeBuy.offer,buyer:activeBuy.buyer,buyerProfile:g.players[activeBuy.buyer].profile,affordableWhenTaken:activeBuy.affordableWhenTaken,lastVisibleCopyTaken:!s.market.some(card=>card.key===activeBuy.offer.key),unavailableAtOwnBuy:null,affordableAtOwnBuy:null};resolveOwnBuy(loss);losses.push(loss);offers.delete(activeBuy.offer.id);activeBuy=null;
   }
  }
  assert.equal(activeBuy,null);assert.equal(hash(lastState),manifest.finalStateHash);
  for(const x of losses){totals.offersTaken++;totals.lastVisibleCopyTaken+=Number(x.lastVisibleCopyTaken);totals.unavailableAtOwnBuy+=Number(x.lastVisibleCopyTaken&&x.unavailableAtOwnBuy===true);const unavailable=x.lastVisibleCopyTaken&&x.unavailableAtOwnBuy===true&&x.affordableAtOwnBuy;totals.unavailableAndStillAffordable+=Number(unavailable);x.publicTimingDecisions=x.history.filter(h=>h.publiclyFundedUnpassedOpponents.includes(x.buyer)&&(h.pureFleetMerge||h.paidHarvesterBuild)).map(h=>h.decision);x.strongPublicTimingMarker=!!(unavailable&&x.affordableWhenTaken&&x.publicTimingDecisions.length);totals.strongPublicTimingMarkers+=Number(x.strongPublicTimingMarker);}
  games.push({id:g.id,seed:g.seed,rotation:g.rotation,losses});
 }
 return {directory,sourceHash:hash(fs.readFileSync(__filename)),appHash:hash(source),scope:'Subject first-copy scoring-card opportunities with Construct II established and full printed price already in stock,ignoring discounts. Retains every qualifying Operations decision per offer,not only the last. Tracks a rival taking the card before subject Buy,and whether its design is still absent/affordable at the next own Buy. Repeated decisions are not independent chances. Pure Fleet merges exclude stationary moves,enemy Shipyards,enemy approaches and all public nearby Colony/Settler threats,using frozen weighted geometry without RNG/state mutation. Paid Harvester markers exclude free/each discounts;these can still be useful investments. Neither marker proves passing would improve the outcome. No hidden opponent hand information is used. Archive source/trace/state/counter/RNG and final hashes checked.',totals,games};
}
if(require.main===module){const[directory,out]=process.argv.slice(2),r=audit(directory);fs.writeFileSync(out,JSON.stringify(r,null,2));console.log(JSON.stringify(r.totals));}
module.exports={audit};
