// Reanalyze retained results; the designated subject is original lineup slot zero.
const fs=require('node:fs'),path=require('node:path');
function analyze(directory){
  const protocol=JSON.parse(fs.readFileSync(path.join(directory,'protocol.json')));
  const rows=fs.readFileSync(path.join(directory,'results.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const games=rows.filter(g=>g.completed),subjects=games.map(g=>g.players[g.subjectSeat??(4-g.rotation)%4]);
  const mean=f=>subjects.reduce((n,p)=>n+f(p),0)/(subjects.length||1);
  const wins=games.filter(g=>g.winner===(g.subjectSeat??(4-g.rotation)%4)).length,n=games.length;
  const rate=wins/(n||1),z=1.96,den=1+z*z/(n||1),center=(rate+z*z/(2*(n||1)))/den,half=z*Math.sqrt(rate*(1-rate)/(n||1)+z*z/(4*(n||1)**2))/den;
  const resources=Object.fromEntries(['matter','energy','biomass','data'].map(r=>[r,{grossGain:mean(p=>p.gained[r]),spent:mean(p=>p.spent[r]),overflow:mean(p=>p.lost[r]),bankGiven:mean(p=>p.bankGiven[r]),bankReceived:mean(p=>p.bankReceived[r]),overflowFraction:subjects.reduce((n,p)=>n+p.lost[r],0)/Math.max(1,subjects.reduce((n,p)=>n+p.gained[r],0))}]));
  const cards={};for(const p of subjects)for(const field of ['marketBuys','marketPlays','militaryTacticPlays'])for(const [key,count] of Object.entries(p[field]||{})){cards[key]??={buys:0,plays:0,tacticPlays:0,buyers:0};cards[key][{marketBuys:'buys',marketPlays:'plays',militaryTacticPlays:'tacticPlays'}[field]]+=count;if(field==='marketBuys')cards[key].buyers++;}
  return {directory,variant:protocol.variant,sourceHashes:protocol.sourceHashes,scheduled:protocol.seeds*protocol.rotations.length,recorded:rows.length,completed:n,incomplete:rows.filter(g=>!g.completed).map(g=>g.id),subject:{wins,winRate:rate,wilson95:[Math.max(0,center-half),Math.min(1,center+half)],points:mean(p=>p.points),harvesters:mean(p=>p.harvestersBuilt),marketBuys:mean(p=>Object.values(p.marketBuys).reduce((a,b)=>a+b,0)),colonies:mean(p=>p.colonies),relics:mean(p=>p.relics),combatWins:mean(p=>p.combatWins),resources,cards},maps:games.map(g=>({seed:g.seed,rotation:g.rotation,hash:g.mapHash}))};
}
if(require.main===module){const [out,...directories]=process.argv.slice(2);if(!out||!directories.length)throw Error('Usage: node analyze-market-investment.cjs output.json run-directory...');const reports=directories.map(analyze);fs.writeFileSync(out,JSON.stringify({generatedAt:new Date().toISOString(),reports},null,2));for(const r of reports)console.log(`${r.variant}: ${r.subject.wins}/${r.completed}; points ${r.subject.points.toFixed(2)}, buys ${r.subject.marketBuys.toFixed(2)}, Harvesters ${r.subject.harvesters.toFixed(2)}`);}
module.exports={analyze};
