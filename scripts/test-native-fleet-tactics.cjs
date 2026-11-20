// Historical Rust policy compatibility fixture only. New studies use browser-bot-study.cjs.
process.env.GR_ALLOW_ARCHIVED_RUST_BOTS='1';
// Branch every public defender reply while choosing attackers through the real Rust bridge.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {bridge}=require('./native-investment-study.cjs');
const root=path.resolve(__dirname,'../prototypes/galactic-reach'),ctx=vm.createContext({}),plain=x=>JSON.parse(JSON.stringify(x));
vm.runInContext(fs.readFileSync(path.join(root,'adapter.js'),'utf8')+fs.readFileSync(path.join(root,'app.js'),'utf8'),ctx);
let e;const create=ctx.createGalacticAdapter;ctx.createGalacticAdapter=p=>{e=p;return create(p);};
async function main(){
 const native=bridge(process.env.GR_NATIVE_POLICY_BIN||path.resolve(__dirname,'../target/debug/examples/policy-study'));let terminals=0,decisions=0;
 async function follow(snapshot){
  const adapter=ctx.createGalacticReach({headless:true,resume:snapshot,random:()=>.3}),engine=e,b=engine.state.pendingCombat;
  if(!b){assert.equal(engine.state.lastCombat.prestigeWinner,0);terminals++;return;}
  const observation=plain(adapter.observe(0)),legal=plain(adapter.legalActions(0));observation.singleFleetForecast=true;
  const choice=await native.choose('market',observation,legal);assert.equal(choice.nativeRandomDraws,0);const action=legal[choice.index];assert.equal(action.type,'combat_tactic');decisions++;
  const saved=plain(adapter.snapshotState());
  for(const [reply,n] of Object.entries(b.hands.defender))if(n){
   const branch=ctx.createGalacticReach({headless:true,resume:saved,random:()=>.3}),current=e;
   assert(current.applyCombatAction(0,action));assert(current.applyCombatAction(1,{type:'combat_tactic',tactic:reply}));await follow(plain(branch.snapshotState()));
  }
 }
 try{
  for(const owned of [['torpedoSpread'],['novaBarrage'],['phaseLance','aegisLattice']]){
   const adapter=ctx.createGalacticReach({headless:true,random:()=>.3}),s=e.state;
   s.planets={};s.fleets={'0,0':{0:{fleet:1}},'1,0':{1:{fleet:1}}};s.activePlayer=0;s.phase='operations';s.turnStage='prep';
   for(const p of s.players){p.hand=[];p.military=[];p.resources={matter:0,energy:0,biomass:0,data:0};}
   s.players[0].military=owned.map((key,id)=>({key,id:'t'+id}));assert(e.executeMove(0,'0,0','1,0',{moveGroup:'all'}));
   while(s.pendingCombat.stage==='escape')assert(e.applyCombatAction(e.combatActor(),{type:'combat_stay'}));await follow(plain(adapter.snapshotState()));
  }
  console.log(`Actual native planner: ${decisions} tactic decisions, ${terminals} complete defender branches, all surviving wins; engine reload at every volley.`);
 }finally{native.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
