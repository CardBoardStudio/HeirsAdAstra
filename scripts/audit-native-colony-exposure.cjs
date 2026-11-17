// Opening Buy opportunities from retained native traces, without replaying a game.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib');
const {hash,applyPatch}=require('./lib/simulation-archive.cjs'),{payable}=require('./audit-market-exposure.cjs');
const resources=['matter','energy','biomass','data'];
function classify(s,id,def){
 const p=s.players[id],units=kind=>Object.values(s.fleets).reduce((n,g)=>n+(g[id]?.[kind]||0),0),settler=units('settler')>0,fleet=units('fleet')>0;
 const yard=Object.values(s.planets).some(p=>p.owner===id&&p.upgrade==='starbase');
 const prospect=s.clusters.some(c=>c.kind==='world'&&s.planets[c.center]&&s.planets[c.center].owner!==id&&(s.planets[c.center].owner===null||fleet));
 const established=['hand','deck','discard','inPlay'].some(k=>(p[k]||[]).some(c=>c.starter&&c.key==='construct'&&(c.upgraded||c.level>=2)));
 const discount=Number(p.buyDiscountEach>0)+Number(p.buyHubDiscounts>0),cost=Object.fromEntries(resources.map(r=>[r,Math.max(0,(def.cost[r]||0)-discount)]));
 const limits=resources.every(r=>cost[r]<=p.resourceLimits[r]),fundable=payable(p.resources,p.resourceLimits,cost);
 const colonizeKeys=new Set(['colonize','dropColonyModules','genesisSeedVault','seedArk','colonyPods','genesisCharter','evergreenArk']);
 const ownsOrder=['hand','deck','discard','inPlay'].some(k=>(p[k]||[]).some(c=>colonizeKeys.has(c.key)));
 const colonyReserve=ownsOrder?s.clusters.reduce((keep,c)=>{const planet=s.planets[c.center],group=s.fleets[c.center]?.[id];return planet&&planet.owner!==id&&(group?.settler||0)>0?Math.max(keep,planet.owner===null?2:1):keep;},0):0;
 return {withShipyard:yard,withSettler:settler,withProspect:prospect,withConstructII:established,withinLimits:limits,fundable,fundableWithShipAndProspect:fundable&&yard&&settler&&prospect,fundableWithEstablishedPlan:fundable&&yard&&settler&&prospect&&established,priceFitsButColonyReserveDoesNot:cost.biomass>0&&cost.biomass<=p.resourceLimits.biomass&&cost.biomass+colonyReserve>p.resourceLimits.biomass,priceFundableButColonyReserveShort:fundable&&cost.biomass>0&&p.resources.biomass<cost.biomass+colonyReserve};
}
function audit(directory,{all=false}={}){
 const source=fs.readFileSync(path.join(directory,'sources/app.js'),'utf8'),match=source.match(/const ADVANCED_CARDS = (\{[\s\S]*?\n  \});/);if(!match)throw Error('Printed catalog changed');
 const catalog=vm.runInNewContext('('+match[1]+')');if(all){const military=source.match(/const MARKET_MILITARY = (\{[\s\S]*?\n  \});/);if(!military)throw Error('Military catalog changed');Object.assign(catalog,vm.runInNewContext('('+military[1]+')'));}
 const defs=Object.fromEntries(Object.entries(catalog).filter(([,c])=>all||c.order==='colonize')),rows=fs.readFileSync(path.join(directory,'results.jsonl'),'utf8').trim().split('\n').map(JSON.parse),cards=Object.fromEntries(Object.keys(defs).map(key=>[key,{visibleBuyStarts:0,firstVisibleRound:null,firstFundableRound:null,bought:0}])),games=[];
 const fields=['round','phase','activePlayer','players','market','fleets','planets','clusters'],pick=s=>Object.fromEntries(fields.map(k=>[k,s[k]]));
 for(const g of rows){const id=g.subjectSeat??(4-g.rotation)%4,m=JSON.parse(fs.readFileSync(path.join(g.archive,'manifest.json'))),bytes=fs.readFileSync(path.join(g.archive,m.trace));if(hash(bytes)!==m.traceHash)throw Error('Trace hash mismatch');let s,starts=0;const seen=new Set(),firstVisible=new Map(),firstFundable=new Map(),traceBuys={};
  for(const line of zlib.gunzipSync(bytes).toString().split('\n')){if(!line)continue;const r=JSON.parse(line);if(r.state)s=pick(r.state);else if(r.patch)s=pick(applyPatch(s,r.patch.filter(p=>!p.path.length||fields.includes(p.path[0]))));
   if(r.type==='after-decision'&&r.command?.method==='applyAction'&&r.command.actor===id&&r.command.action.type==='buy'&&r.command.action.source==='market'&&defs[r.command.action.key]){const key=r.command.action.key;traceBuys[key]=(traceBuys[key]||0)+1;}
   if(r.type!=='before-decision'||r.command?.method!=='applyAction'||r.command.actor!==id||s.phase!=='buy'||s.activePlayer!==id||seen.has(s.round))continue;
   seen.add(s.round);starts++;const offered=new Set();
   for(const card of s.market){const def=defs[card?.key];if(!def||offered.has(card.key))continue;offered.add(card.key);const a=cards[card.key]??={visibleBuyStarts:0,firstVisibleRound:s.round,firstFundableRound:null,bought:0};a.visibleBuyStarts++;a.firstVisibleRound=Math.min(a.firstVisibleRound??s.round,s.round);if(!firstVisible.has(card.key))firstVisible.set(card.key,s.round);const flags=classify(s,id,def);const included=def.order==='colonize'?Object.keys(flags):['withShipyard','withConstructII','withinLimits','fundable'];for(const k of included)a[k]=(a[k]||0)+Number(flags[k]);if(def.military)a.withFleet=(a.withFleet||0)+Number(Object.values(s.fleets).some(g=>(g[id]?.fleet||0)>0));if(flags.fundable){a.firstFundableRound=Math.min(a.firstFundableRound??s.round,s.round);if(!firstFundable.has(card.key))firstFundable.set(card.key,s.round);}}
  }
  for(const key of Object.keys(defs)){const reported=g.players[id].marketBuys[key]||0,traced=traceBuys[key]||0;if(reported!==traced)throw Error('Purchase trace/metric mismatch: '+key);cards[key].bought+=traced;}
  for(const [key,round]of firstVisible){const a=cards[key];a.gamesVisible=(a.gamesVisible||0)+1;a.firstVisibleRoundTotal=(a.firstVisibleRoundTotal||0)+round;}
  for(const [key,round]of firstFundable){const a=cards[key];a.gamesWithFundableOffer=(a.gamesWithFundableOffer||0)+1;a.firstFundableRoundTotal=(a.firstFundableRoundTotal||0)+round;}
  games.push({id:g.id,buyStarts:starts,recordedBuyTurns:g.players[id].buyTurns});
 }
 for(const a of Object.values(cards)){a.gamesVisible??=0;a.gamesWithFundableOffer??=0;a.meanFirstVisibleRound=a.gamesVisible?a.firstVisibleRoundTotal/a.gamesVisible:null;a.meanFirstFundableRound=a.gamesWithFundableOffer?a.firstFundableRoundTotal/a.gamesWithFundableOffer:null;}
 return {directory,catalogScope:all?'all market designs':'Colonize market designs',sourceHash:hash(fs.readFileSync(__filename)),payabilitySourceHash:hash(fs.readFileSync(require.resolve('./audit-market-exposure.cjs'))),appHash:hash(source),scope:'Distinct designs at opening own Buy decisions only, current Fleet-capture rules. Colony-reserve counters use the maximum owned-order/Settler-center payment; they exclude excavation and defense reserves and are not a complete purchase-eligibility test. Prospect means a public future world, not a legal Colonize action now. Fundability includes 4:1 banking and existing discounts, ignores protected payments and tactical filters, and precedes held effects/upgrades/refills. Later refill purchases need not be in these opening offers. First-round means are conditional on games with an observed offer; never-observed values stay null. Trace hashes verified; purchase commands cross-checked against per-game metrics; no game replay.',games,cards};
}
if(require.main===module){const [directory,out]=process.argv.slice(2),result=audit(directory);fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result.cards));}
module.exports={classify,audit};
