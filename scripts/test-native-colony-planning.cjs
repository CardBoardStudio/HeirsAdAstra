// Historical Rust policy compatibility fixture only. New studies use browser-bot-study.cjs.
process.env.GR_ALLOW_ARCHIVED_RUST_BOTS='1';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {bridge}=require('./native-investment-study.cjs');
const root=path.resolve(__dirname,'../prototypes/galactic-reach');
function fixture(capture=false,fleet=true){
 const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'adapter.js'),'utf8')+fs.readFileSync(path.join(root,'app.js'),'utf8'),ctx);
 let e;const create=ctx.createGalacticAdapter;ctx.createGalacticAdapter=p=>{e=p;return create(p);};
 const a=ctx.createGalacticReach({headless:true,random:()=>.3}),s=e.state,p=s.players[0];s.phase='operations';s.activePlayer=0;s.turnStage='prep';
 const coord=s.clusters.find(c=>c.kind==='world'&&(capture?s.planets[c.center].owner===1:s.planets[c.center].owner===null)).center;
 s.fleets={[coord]:{0:{settler:1,fleet:capture&&fleet?1:0,explorer:0}}};s.planets[coord].upgrade=null;
 p.hand=[{key:'seedArk',id:'seed'},{key:'colonyPods',id:'pods'},...(capture?[{key:'genesisCharter',id:'charter'}]:[])];p.deck=[];p.discard=[];p.inPlay=[];p.resources={matter:4,energy:4,biomass:4,data:4};
 return {e,a,s,p,coord};
}
(async()=>{
 const native=bridge(process.env.GR_NATIVE_POLICY_BIN||path.resolve(__dirname,'../target/debug/examples/policy-study'));
 try{
  for(const capture of [false,true]){
   const g=fixture(capture),legal=g.a.legalActions(0),view=g.a.observe(0);view.colonyPlanning=true;
   assert(legal.some(a=>a.type==='colonize'&&a.key==='seedArk'));assert(legal.some(a=>a.type==='colonize'&&a.key==='colonyPods'));
   const before=g.e.calculatePrestige(0),choice=await native.choose('economy',view,legal),action=legal[choice.index];
   assert.equal(action.type,'colonize');assert.equal(action.key,capture?'genesisCharter':'colonyPods');g.a.applyAction(0,action);
   assert.equal(g.s.planets[g.coord].owner,0);assert.equal(g.s.fleets[g.coord][0].settler,1);assert.equal(g.p.resources.biomass,capture?4:3);
   assert.equal(g.e.calculatePrestige(0)-before,capture?5:3);assert(g.p.inPlay.some(c=>c.key===action.key));assert(g.p.hand.some(c=>c.key==='seedArk'));
  }
  const unescorted=fixture(true,false);assert(!unescorted.a.legalActions(0).some(a=>a.type==='colonize'),'Printed bonuses never bypass the capture Fleet rule');
  console.log('Actual native Colonize choices preserve the Settler, pay the printed cost, award bonus Prestige, keep played cards in play, and respect capture escorts.');
 }finally{native.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
