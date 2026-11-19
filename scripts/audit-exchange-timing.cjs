// Reconstruct baseline histories and count exchange activations that expire unused.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const [root,out]=process.argv.slice(2);assert(root&&out&&!fs.existsSync(out));
const {archiveRecords}=require(path.join(path.resolve(root),'harness/scripts/lib/simulation-archive.cjs'));
const protocol=JSON.parse(fs.readFileSync(path.join(root,'protocol.json'))),rows=fs.readFileSync(path.join(root,'results.jsonl'),'utf8').trim().split('\n').map(JSON.parse).filter(g=>g.kind==='baseline');
assert.equal(rows.length,protocol.seedList.length,'Wait for every planned baseline');
const keys=protocol.cards.filter(k=>protocol.catalog[k].effect?.bankRate===2),hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const byCard=Object.fromEntries(keys.map(k=>[k,{activations:0,unused:0,discountedTrades:0}])),games=[];
for(const g of rows){assert(g.completed);const active=Array.from({length:4},()=>new Map()),activations=[];let last,ordinaryTrades=0;
 for(const r of archiveRecords(g.archive)){last=r.position;const e=r.event;
  if(e?.type==='action'&&e.name==='bankTrade'&&e.result===true){const[seat,give]=e.args,cost=e.before.find(p=>p.id===seat).stock[give]-e.after.find(p=>p.id===seat).stock[give];assert([2,4].includes(cost));if(cost===2){const activation=active[seat].get(give);assert(activation);activation.trades++;byCard[activation.key].discountedTrades++;}else ordinaryTrades++;}
  if(r.type==='after-decision'){const a=r.command?.action,seat=r.command?.actor;if(a?.type==='special'&&keys.includes(a.key)){const activation={key:a.key,card:a.card,seat,resource:a.resource,round:r.position.round,trades:0};activations.push(activation);assert(!active[seat].has(a.resource),'Baseline bot redundantly played an already active rate');active[seat].set(a.resource,activation);byCard[a.key].activations++;}
   for(const p of r.position.players)for(const resource of active[p.id].keys())if(!(p.bankExchangeResources||[]).includes(resource))active[p.id].delete(resource);
  }
 }
 const manifest=JSON.parse(fs.readFileSync(path.join(g.archive,'manifest.json')));assert.equal(hash(last),manifest.finalStateHash);
 for(const a of activations)if(!a.trades)byCard[a.key].unused++;
 for(const key of keys)assert.equal(activations.filter(a=>a.key===key).length,g.players.reduce((n,p)=>n+(p.marketPlays[key]||0),0));
 games.push({id:g.id,seed:g.seed,archive:g.archive,ordinaryTrades,activations});
}
const total=Object.values(byCard).reduce((n,c)=>({activations:n.activations+c.activations,unused:n.unused+c.unused,discountedTrades:n.discountedTrades+c.discountedTrades}),{activations:0,unused:0,discountedTrades:0});
const result={scope:'Baseline-only timing audit;full state/counter/RNG streams and final hashes checked. Different-policy/map cohorts are descriptive,not a paired strength estimate.',baselineGames:rows.length,byCard,total,unusedFraction:total.activations?total.unused/total.activations:null,games};fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify({baselineGames:rows.length,total,unusedFraction:result.unusedFraction}));
