const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {solve}=require('./audit-single-fleet-tactics.cjs');
const root=path.resolve(__dirname,'../prototypes/galactic-reach'),ctx=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root,'adapter.js'),'utf8')+fs.readFileSync(path.join(root,'app.js'),'utf8'),ctx);
let e;const create=ctx.createGalacticAdapter;ctx.createGalacticAdapter=p=>{e=p;return create(p);};
ctx.createGalacticReach({headless:true,random:()=>.3});const catalog=JSON.parse(JSON.stringify(e.MILITARY_CARDS));let checked=0;
for(const [x,u] of Object.entries(catalog))for(const [y,v] of Object.entries(catalog)){
 ctx.createGalacticReach({headless:true,random:()=>.3});const s=e.state;
 s.planets={};s.fleets={'0,0':{0:{fleet:1}},'1,0':{1:{fleet:1}}};s.activePlayer=0;s.phase='operations';s.turnStage='prep';
 for(const p of s.players){p.hand=[];p.military=[];p.resources={matter:0,energy:0,biomass:0,data:0};}
 if(e.MARKET_CARDS[x])s.players[0].military=[{key:x,id:'a'}];if(e.MARKET_CARDS[y])s.players[1].military=[{key:y,id:'b'}];
 assert(e.executeMove(0,'0,0','1,0',{moveGroup:'all'}));
 while(s.pendingCombat.stage==='escape')assert(e.applyCombatAction(e.combatActor(),{type:'combat_stay'}));
 assert(e.applyCombatAction(0,{type:'combat_tactic',tactic:x}));assert(e.applyCombatAction(1,{type:'combat_tactic',tactic:y}));
 const volley=(s.pendingCombat?.volleys??s.lastCombat.volleys)[0];
 assert.equal(volley.attacker.damage,Math.max(0,3+u.attack-(u.pierce?0:v.shield)));
 assert.equal(volley.defender.damage,Math.max(0,3+v.attack-(v.pierce?0:u.shield)));checked++;
}
assert.equal(solve(catalog).lowerBound,-1);
assert.equal(solve(catalog,['torpedoSpread']).lowerBound,1);
assert.equal(solve(catalog,['aegisLattice']).lowerBound,0);
assert.equal(solve(catalog,['phaseLance','aegisLattice']).lowerBound,1);
console.log(`${checked} tactic-pair damage calculations match the authoritative engine; bounded solver baseline/advantage checks pass.`);

// Validate every defender branch of each predicted winning strategy in real continuations.
const plain=x=>JSON.parse(JSON.stringify(x));let terminals=0;
function follow(snapshot){
 const a=ctx.createGalacticReach({headless:true,resume:snapshot,random:()=>.3}),engine=e,b=engine.state.pendingCombat;
 if(!b){assert.equal(engine.state.lastCombat.prestigeWinner,0);terminals++;return;}
 const expand=h=>Object.entries(h).flatMap(([k,n])=>Array(n).fill(k));
 const prediction=solve(catalog,[],[],{a:7-b.attackerPieces[0].damage,b:7-b.defenderPieces[0].damage,ours:expand(b.hands.attacker),theirs:expand(b.hands.defender),volley:b.volley});
 assert.equal(prediction.lowerBound,1);assert(prediction.tactic);
 const saved=plain(a.snapshotState());
 for(const [reply,n] of Object.entries(b.hands.defender))if(n){
  const branch=ctx.createGalacticReach({headless:true,resume:saved,random:()=>.3}),current=e;
  assert(current.applyCombatAction(0,{type:'combat_tactic',tactic:prediction.tactic}));
  assert(current.applyCombatAction(1,{type:'combat_tactic',tactic:reply}));
  follow(plain(branch.snapshotState()));
 }
}
for(const owned of [['torpedoSpread'],['novaBarrage'],['phaseLance','aegisLattice']]){
 const a=ctx.createGalacticReach({headless:true,random:()=>.3}),s=e.state;
 s.planets={};s.fleets={'0,0':{0:{fleet:1}},'1,0':{1:{fleet:1}}};s.activePlayer=0;s.phase='operations';s.turnStage='prep';
 for(const p of s.players){p.hand=[];p.military=[];p.resources={matter:0,energy:0,biomass:0,data:0};}
 s.players[0].military=owned.map((key,id)=>({key,id:'t'+id}));
 assert(e.executeMove(0,'0,0','1,0',{moveGroup:'all'}));
 while(s.pendingCombat.stage==='escape')assert(e.applyCombatAction(e.combatActor(),{type:'combat_stay'}));
 follow(plain(a.snapshotState()));
}
console.log(`${terminals} complete winning-strategy branches match the engine, including save/resume at every volley.`);
