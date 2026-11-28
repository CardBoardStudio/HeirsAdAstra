// Reanalyze complete action checkpoints; no match is replayed or regenerated.
const fs=require('node:fs'),path=require('node:path');
const {archiveRecords,hash}=require('./lib/simulation-archive.cjs');
function audit(directory){
 const results=fs.readFileSync(path.join(directory,'results.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse),games=[];
 for(const g of results){
  const id=g.subjectSeat??(4-g.rotation)%4,row={id:g.id,seed:g.seed,rotation:g.rotation,completed:g.completed,firstMarketRound:g.players[id].firstMarketRound,firstIII:null,firstConstructIII:null,allSixIII:null,upgradeResources:{}};
  for(const r of archiveRecords(g.archive)){
   if(r.type!=='after-decision'||r.command?.method!=='applyAction'||r.command.actor!==id||r.command.action.type!=='upgrade')continue;
   const p=r.position.players[id],cards=[...p.hand,...p.deck,...p.discard,...p.inPlay],card=cards.find(c=>c.id===r.command.action.card),round=r.position.round;
   row.upgradeResources[r.command.action.resource]=(row.upgradeResources[r.command.action.resource]||0)+1;
   if(card?.level===3){row.firstIII??=round;if(card.key==='construct')row.firstConstructIII??=round;}
   if(cards.filter(c=>c.starter&&c.level===3).length===6)row.allSixIII??=round;
  }
  games.push(row);
 }
 const means=Object.fromEntries(['firstMarketRound','firstIII','firstConstructIII','allSixIII'].map(k=>{const values=games.map(g=>g[k]).filter(x=>x!==null);return[k,{observed:values.length,mean:values.length?values.reduce((a,b)=>a+b,0)/values.length:null}];}));
 return {directory,sourceHash:hash(fs.readFileSync(__filename)),scope:'Observed upgrade checkpoints, including final limits when not reached. No inference from final upgrade count.',games,means};
}
if(require.main===module){const [directory,out]=process.argv.slice(2);const result=audit(directory);fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result.means));}
module.exports={audit};
