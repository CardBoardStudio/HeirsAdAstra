const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'../prototypes/galactic-reach',f),'utf8');
function game(){const c=vm.createContext({});let e,n=73;vm.runInContext(read('adapter.js')+read('app.js').replace('      clone, deckContents,','      maxBotLate, maxBotWarehouse, runAiOperation, chooseAiBuild, aiCardUtility, clone, deckContents,'),c);const real=c.createGalacticAdapter;c.createGalacticAdapter=p=>{e=p;return real(p);};const a=c.createGalacticReach({headless:true,maxbot:true,random:()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/2**32)});return {c,e,a,s:e.state};}
{
 const {e,a,s}=game(),p=s.players[2];assert.equal(p.name,'MaxBot');assert.equal(p.strategy,'maxbot');assert.equal(s.players.filter(p=>p.strategy==='maxbot').length,1);
 const restored=game().c.createGalacticReach({headless:true,resume:a.snapshotState()}).snapshotState().state;assert.equal(restored.players[2].name,'MaxBot');assert.equal(restored.players[2].strategy,'maxbot');
 assert(!e.maxBotLate(2));s.round=10;assert(e.maxBotLate(2));assert(!e.maxBotLate(1));s.round=1;s.players[1].cardPrestige=20;assert(e.maxBotLate(2));
}
{
 const {e,s}=game(),p=s.players[2];s.activePlayer=2;s.phase='operations';s.fleets={};s.players.forEach(p=>{p.hand=[];p.deck=[];p.discard=[];p.inPlay=[];});
 p.resources={matter:20,energy:20,biomass:20,data:20};p.resourceLimits={matter:12,energy:12,biomass:12,data:12};
 const value=e.aiCardUtility(2,'foldedWarehouse');p.discard=[{id:'warehouse',key:'foldedWarehouse'}];assert(e.maxBotWarehouse(2));assert(value>e.aiCardUtility(2,'foldedWarehouse')+50,'Seek the first reusable warehouse, not duplicates');
 p.discard=[];p.hand=[{id:'warehouse',key:'foldedWarehouse'}];const before={...p.resourceLimits};e.runAiOperation();for(const r of e.RESOURCES)assert.equal(p.resourceLimits[r],before[r]+1);assert(p.inPlay.some(c=>c.id==='warehouse'));
}
{
 const {e,s}=game(),p=s.players[2];s.activePlayer=2;s.phase='operations';p.resources={matter:20,energy:20,biomass:20,data:20};p.resourceLimits={matter:12,energy:12,biomass:12,data:12};p.hand=[{id:'build',key:'construct',starter:true}];
 const home=s.clusters[2],yard=home.coords.find(c=>c!==home.center);Object.assign(s.planets[yard],{owner:2,upgrade:'starbase'});
 const colony=s.clusters[4];Object.assign(s.planets[colony.center],{owner:2,hasColony:true});s.fleets={};
 const build=e.chooseAiBuild(2);assert.equal(build.kind,'starbase');assert.equal(s.planets[build.coord].cluster,s.planets[colony.center].cluster,'Provide local defence production on the newly held world');
}
console.log('MaxBot: optional name/profile, saved identity, late scoring switch, reusable storage valuation/play and per-colony Shipyards passed.');
