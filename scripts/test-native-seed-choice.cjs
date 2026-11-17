// Exercise the actual frozen executable, not only the Rust unit-test build.
const assert=require('node:assert/strict');
const {bridge}=require('./native-investment-study.cjs');
const binary=process.argv[2]||process.env.GR_NATIVE_POLICY_BIN;assert(binary,'Supply frozen policy-study executable');
const view={seat:0,phase:'operations',round:1,victoryTarget:30,investmentPlanning:true,players:[{id:0,prestige:3,deckCount:2,handCount:1,hand:[{id:'seed',key:'seedArk'}],discard:[],inPlay:[],deckContents:[],resources:{},resourceLimits:{matter:4,energy:4,biomass:4,data:4},military:[]},{id:1,prestige:3},{id:2,prestige:3},{id:3,prestige:3}],planets:{},clusters:[],fleets:{},market:[],cardStats:{seedArk:{order:'colonize',fallbackDraw:2}},relicRow:[]};
const legal=[{type:'pass'},{type:'order_draw',card:'seed',key:'seedArk'}];
(async()=>{const native=bridge(binary);try{
 for(const profile of ['market','economy','military','expansion']){const result=await native.choose(profile,view,legal);assert.equal(result.index,1,profile+': use Seed Ark draw instead of passing');assert.equal(result.nativeRandomDraws,0);}
 view.cardStats.seedArk.fallbackDraw=0;assert.equal((await native.choose('market',view,legal)).index,0,'Missing alternative has no invented draw value');
 console.log('Frozen native executable: all four profiles use the printed Seed Ark draw alternative; zero fallback preserves Pass.');
}finally{native.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
