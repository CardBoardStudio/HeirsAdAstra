// Opening-Buy exposure audit from retained full positions; never replays a game.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {archiveRecords}=require('./lib/simulation-archive.cjs');
const keys=['matter','energy','biomass','data'];
function payable(resources,limits,cost){
 if(keys.some(k=>cost[k]>limits[k]))return false;
 const missing=keys.reduce((n,k)=>n+Math.max(0,cost[k]-resources[k]),0),exchanges=keys.reduce((n,k)=>n+Math.floor(Math.max(0,resources[k]-cost[k])/4),0);
 return missing<=exchanges;
}
function audit(directory){
 const app=fs.readFileSync(path.join(directory,'sources/app.js'),'utf8'),defs={};
 for(const name of ['ADVANCED_CARDS','MARKET_MILITARY']){const match=app.match(new RegExp('const '+name+' = (\\{[\\s\\S]*?\\n  \\});'));if(!match)throw Error('Printed catalog changed');Object.assign(defs,vm.runInNewContext('('+match[1]+')'));}
 const games=fs.readFileSync(path.join(directory,'results.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse),cards={};
 let buys=0;
 for(const g of games){const subject=g.subjectSeat??(4-g.rotation)%4,seen=new Set();
  for(const rec of archiveRecords(g.archive)){
   if(rec.type!=='before-decision'||rec.command?.method!=='runAiBuy'||rec.position.activePlayer!==subject)continue;
   buys++;const s=rec.position,p=s.players[subject],yard=Object.values(s.planets).some(x=>x.owner===subject&&x.upgrade==='starbase');
   for(const c of s.market){if(!c)continue;const def=defs[c.key];if(!def)throw Error('Missing market definition: '+c.key);
    const row=cards[c.key]??={visibleBuyStarts:0,gamesVisible:0,withShipyard:0,withinLimits:0,payableBeforeEffects:0,bought:0,firstVisibleRound:s.round};
    row.visibleBuyStarts++;row.firstVisibleRound=Math.min(row.firstVisibleRound,s.round);if(!seen.has(c.key)){row.gamesVisible++;seen.add(c.key);}if(!yard)continue;row.withShipyard++;
    const discount=(p.buyDiscountEach>0?1:0)+(p.buyHubDiscounts>0?1:0),cost=Object.fromEntries(keys.map(k=>[k,Math.max(0,(def.cost[k]||0)-discount)]));
    if(keys.some(k=>cost[k]>p.resourceLimits[k]))continue;row.withinLimits++;
    if(payable(p.resources,p.resourceLimits,cost))row.payableBeforeEffects++;
   }
  }
  for(const [key,n] of Object.entries(g.players[subject].marketBuys)){cards[key]??={visibleBuyStarts:0,gamesVisible:0,withShipyard:0,withinLimits:0,payableBeforeEffects:0,bought:0,firstVisibleRound:null};cards[key].bought+=n;}
 }
 return {directory,games:games.length,buyStarts:buys,scope:'Subject opening Buy positions only. Payability includes 4:1 banking and existing discounts, before playing held Buy effects, storage management, upgrades or refills. It ignores strategic payment reserves. Bought includes later refills, so purchases need not be a subset of these opening offers.',cards};
}
if(require.main===module){const [directory,out]=process.argv.slice(2);if(!directory||!out)throw Error('Usage: node audit-market-exposure.cjs run-directory output.json');const result=audit(directory);fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
module.exports={audit,payable};
