// Read recorded battle results; never infer a hidden choice or regenerate a game.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {hash,applyPatch}=require('./lib/simulation-archive.cjs');
const MILITARY=new Set(['railBattery','deflectorGrid','flakScreen','torpedoSpread','hardlightBulwark','phaseLance','novaBarrage','aegisLattice','victoryDoctrine']);
function aggregate(battles,subject){
 const tactics={};
 for(const b of battles)for(const side of ['attacker','defender']){
  if(b[side+'Id']!==subject)continue;
  for(const v of b.volleys){const own=v[side],enemy=v[side==='attacker'?'defender':'attacker'],raw=enemy.base+enemy.bonus,prevented=enemy.pierce?0:Math.min(raw,own.shields),a=tactics[own.tactic]??={plays:0,printedPlusReactionShield:0,incoming:0,prevented:0,pierced:0,unusedShield:0};
   a.plays++;a.printedPlusReactionShield+=own.shields;a.incoming+=raw;a.prevented+=prevented;a.pierced+=Number(enemy.pierce);a.unusedShield+=own.shields-prevented;
  }
 }
 return tactics;
}
function audit(directory){
 const games=fs.readFileSync(path.join(directory,'results.jsonl'),'utf8').trim().split('\n').map(JSON.parse),tactics={};let count=0;const purchaseTiming=[];
 for(const g of games){const m=JSON.parse(fs.readFileSync(path.join(g.archive,'manifest.json'))),compressed=fs.readFileSync(path.join(g.archive,m.trace));if(hash(compressed)!==m.traceHash)throw Error('Trace hash mismatch');
  let state={pendingCombat:null,lastCombat:null,round:1};const battles=[],battlePositions=[],purchases=[];let position=0;const subject=g.subjectSeat??(4-g.rotation)%4;
  for(const line of zlib.gunzipSync(compressed).toString().split('\n')){if(!line)continue;const r=JSON.parse(line),pending=state.pendingCombat;position++;
   if(r.state)state={pendingCombat:r.state.pendingCombat,lastCombat:r.state.lastCombat,round:r.state.round};
   else if(r.patch){const relevant=r.patch.filter(p=>!p.path.length||['pendingCombat','lastCombat','round'].includes(p.path[0]));state=applyPatch(state,relevant);}
   if(pending&&!state.pendingCombat&&state.lastCombat){const battle=JSON.parse(JSON.stringify(state.lastCombat));battles.push(battle);if([battle.attackerId,battle.defenderId].includes(subject))battlePositions.push({position,round:state.round});}
   const action=r.command?.action;
   if(r.type==='after-decision'&&r.command.actor===subject&&action?.type==='buy'&&action.source==='market'&&MILITARY.has(action.key))purchases.push({key:action.key,position,round:state.round});
  }
  count+=battles.length;
  for(const p of purchases)purchaseTiming.push({game:g.id,key:p.key,round:p.round,subsequentBattles:battlePositions.filter(b=>b.position>p.position).length});
  const observed=aggregate(battles,subject);
  if(g.completed)for(const [key,plays] of Object.entries(g.players[subject].militaryTacticPlays))if((observed[key]?.plays??0)!==plays)throw Error('Battle extraction mismatch: '+key);
  for(const [key,a] of Object.entries(aggregate(battles,g.subjectSeat??(4-g.rotation)%4))){const total=tactics[key]??=Object.fromEntries(Object.keys(a).map(k=>[k,0]));for(const k of Object.keys(a))total[k]+=a[k];}
 }
 return {directory,sourceHash:hash(fs.readFileSync(__filename)),games:games.length,battles:count,purchaseTiming,subsequentBattlePurchases:purchaseTiming.filter(p=>p.subsequentBattles>0).length,totalMilitaryPurchases:purchaseTiming.length,scope:'Subject volley totals from completed battles. Shield totals include any reaction bonus, not only printed tactic shields. Unused shield includes bypassed shields. No causal estimate of purchase value.',tactics};
}
if(require.main===module){const [directory,out]=process.argv.slice(2),result=audit(directory);fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));}
module.exports={aggregate,audit};
