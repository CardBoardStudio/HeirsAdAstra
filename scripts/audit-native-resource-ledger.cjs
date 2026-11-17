// Reconstruct resource flows from retained receipts without changing games or old results.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {archiveRecords,hash}=require('./lib/simulation-archive.cjs');
const RES=['matter','energy','biomass','data'],zero=()=>Object.fromEntries(RES.map(k=>[k,0]));
const fields=['gained','lost','paidCosts','starterUpgrades','trashing','escape','consortiumGiven','bankGiven','peerGiven','peerReceived','voluntaryDiscarded','trimmed'];
const blank=()=>Object.fromEntries(fields.map(k=>[k,zero()]));
function account(ledger,e){
 const add=(id,field,k,n)=>{assert(Number.isFinite(n)&&n>=0,`${field}: invalid ${n}`);ledger[id][field][k]+=n;};
 if(e.type==='resource-gain')for(const k of RES){add(e.player,'gained',k,e.requested[k]||0);add(e.player,'lost',k,e.result.lost[k]||0);}
 if(e.type==='resource-payment'&&e.result===true)for(const k of RES)add(e.player,'paidCosts',k,e.before[k]-e.after[k]);
 if(e.type!=='action')return;
 const [id,a,b]=e.args;
 if(e.name==='trimResourcesToCapacity')for(const k of RES)add(id,'trimmed',k,e.before.find(p=>p.id===id).stock[k]-e.after.find(p=>p.id===id).stock[k]);
 if(e.result!==true)return;
 if(e.name==='upgradeStarter')add(id,'starterUpgrades',b,e.before.find(p=>p.id===id).stock[b]-e.after.find(p=>p.id===id).stock[b]);
 if(e.name==='decommission')add(id,'trashing',b,3);
 if(e.name==='bankTrade')add(id,'bankGiven',a,4);
 if(e.name==='consortiumExchange')add(id,'consortiumGiven',a,2);
 if(e.name==='applyCombatAction'&&a.type==='combat_escape')add(id,'escape','energy',a.amount);
 if(e.name==='discardResources')add(id,'voluntaryDiscarded',a,b);
 if(e.name==='respondTrade'&&b==='accept')for(const p of e.before)for(const k of RES){const delta=e.after.find(x=>x.id===p.id).stock[k]-p.stock[k];add(p.id,delta>=0?'peerReceived':'peerGiven',k,Math.abs(delta));}
}
function net(v,k){return v.gained[k]+v.peerReceived[k]-v.lost[k]-v.peerGiven[k]-v.bankGiven[k]-v.voluntaryDiscarded[k]-v.trimmed[k]-v.paidCosts[k]-v.starterUpgrades[k]-v.trashing[k]-v.escape[k]-v.consortiumGiven[k];}
function balanced(before,after,ledger,prior,label){for(const p of before){const q=after.find(x=>x.id===p.id);for(const k of RES)assert.equal(q.stock[k]-p.stock[k],net(ledger[p.id],k)-net(prior[p.id],k),`${label}: seat${p.id} ${k}`);}}
const stocks=s=>s.players.map(p=>({id:p.id,stock:p.resources}));
function audit(directory){
 const rows=fs.readFileSync(path.join(directory,'results.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse),games=[],profiles={};
 for(const g of rows){
  const ledger=g.players.map(blank),start=g.players.map(blank);let initial=null,last=null,decision=null,checked=0;
  for(const r of archiveRecords(g.archive)){
   if(r.position)last=r.position;
   if(r.type==='before-decision')decision={stocks:stocks(r.position),ledger:structuredClone(ledger),command:r.command};
   if(r.type==='event'){
    const e=r.event;account(ledger,e);
    if(e.type==='production'&&!initial){initial=e.before;/* Opening production precedes the first attached state. */}
   }
   if(r.type==='after-decision'){
    assert(decision);assert.deepEqual(decision.command,r.command);balanced(decision.stocks,stocks(r.position),ledger,decision.ledger,`${g.id} decision${checked}`);checked++;decision=null;
   }
  }
  assert(initial&&last);assert.equal(decision,null);const manifest=JSON.parse(fs.readFileSync(path.join(g.archive,'manifest.json')));assert.equal(hash(last),manifest.finalStateHash);
  balanced(initial,stocks(last),ledger,start,`${g.id} whole game`);
  const players=g.players.map(p=>{
   const v=ledger[p.seat];for(const k of RES){assert.equal(v.gained[k],p.gained[k]);assert.equal(v.lost[k],p.lost[k]);assert.equal(v.bankGiven[k],p.bankGiven[k]);assert.equal(v.paidCosts[k]+v.starterUpgrades[k],p.spent[k],'Historical spent definition changed; review auditor');}
   const correctedSpent=Object.fromEntries(RES.map(k=>[k,v.paidCosts[k]+v.starterUpgrades[k]+v.trashing[k]+v.escape[k]+v.consortiumGiven[k]]));
   const aggregate=profiles[p.profile]??={games:0,...blank(),correctedSpent:zero(),historicalSpent:zero()};aggregate.games++;for(const field of fields)for(const k of RES)aggregate[field][k]+=v[field][k];for(const k of RES){aggregate.correctedSpent[k]+=correctedSpent[k];aggregate.historicalSpent[k]+=p.spent[k];}
   return {seat:p.seat,profile:p.profile,initial:initial.find(x=>x.id===p.seat).stock,final:last.players[p.seat].resources,...v,correctedSpent};
  });games.push({id:g.id,seed:g.seed,rotation:g.rotation,checkedDecisions:checked,players});
 }
 return {directory,sourceHash:hash(fs.readFileSync(__filename)),accounting:'receipt-ledger-v2',scope:'Verified full archive sources/trace/state/counter/RNG and final hash. Every decision and whole-game resource conservation checked. Gross gained includes bank/Consortium receipts; bank received is not added twice. Direct trash, escape and Consortium payments augment historical spent. Peer transfers, manual discards and standalone trimming are separate. Historical files remain unchanged.',profiles,games};
}
if(require.main===module){const[directory,out]=process.argv.slice(2),r=audit(directory);fs.writeFileSync(out,JSON.stringify(r,null,2));console.log(JSON.stringify(r.profiles));}
module.exports={account,net,balanced,blank,audit};
