// Rules #building/#ownership-colours: capture permits paid replacement, never free transfer.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'../prototypes/galactic-reach',f),'utf8');
function game(){
 const c=vm.createContext({});let e,n=1729;
 vm.runInContext(read('adapter.js')+read('app.js').replace('      clone, deckContents,','      produceAll, aiIncome, clone, deckContents,'),c);
 const factory=c.createGalacticAdapter;c.createGalacticAdapter=p=>{e=p;return factory(p);};
 const a=c.createGalacticReach({headless:true,random:()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/2**32)}),s=e.state;
 for(const p of s.players){p.resources={matter:10,energy:10,biomass:10,data:10};p.resourceLimits={matter:100,energy:100,biomass:100,data:100};}
 const center=s.clusters[1].center,coord=s.clusters[1].coords.find(x=>x!==center),p=s.planets[coord];
 Object.assign(p,{owner:1,upgrade:'harvester',upgradeLevel:1,hasColony:false});
 s.fleets[center]={0:{settler:1,fleet:1}};
 return {e,a,s,center,coord,p};
}
{
 const {e,a,s,center,coord,p}=game();
 assert(!e.constructAt(0,coord,'harvester',null,true),'Cannot overwrite before capturing');
 assert(e.colonizePlanet(0,center));assert.equal(p.owner,1,'Capture alone preserves enemy production');
 const before=JSON.stringify(s);assert(e.constructAt(0,coord,'harvester',null,true));assert.equal(JSON.stringify(s),before,'Dry run is pure');
 assert(!e.constructAt(0,coord,'starbase',null,true));assert(!e.constructAt(0,center,'harvester',null,true));
 const income=e.aiIncome(0)[p.type],enemyIncome=e.aiIncome(1)[p.type],resources={...s.players[0].resources};
 const action=a.legalActions(0).find(x=>x.type==='build'&&x.kind==='harvester'&&x.coord===coord);assert(action,'Adapter exposes replacement');
 assert(!a.legalActions(0).some(x=>x.type==='build'&&x.kind==='starbase'&&x.coord===coord));
 a.applyAction(0,action);assert.equal(p.owner,0);assert.equal(p.upgrade,'harvester');assert.equal(p.upgradeLevel,1);
 for(const r of e.RESOURCES)assert.equal(s.players[0].resources[r],resources[r]-(e.STRUCTURES.harvester.cost[r]||0));
 assert.equal(e.aiIncome(0)[p.type],income+e.HARVESTER_YIELD);assert.equal(e.aiIncome(1)[p.type],enemyIncome-e.HARVESTER_YIELD);
 const gains=s.players.map((_,id)=>JSON.parse(JSON.stringify(e.aiIncome(id))));
 for(const player of s.players)player.resources={matter:0,energy:0,biomass:0,data:0};
 e.produceAll();for(let id=0;id<4;id++)assert.deepEqual(JSON.parse(JSON.stringify(s.players[id].resources)),gains[id],'Actual round production follows ownership');
 assert(!e.constructAt(0,coord,'harvester',null,true),'Cannot rebuild own Harvester');
 const resumed=captureResume(a.snapshotState());assert.equal(resumed.state.planets[coord].owner,0);
}
function captureResume(resume){const c=vm.createContext({});vm.runInContext(read('adapter.js')+read('app.js'),c);return c.createGalacticReach({headless:true,resume}).snapshotState();}
{
 const {e,s,center,coord,p}=game();assert(e.colonizePlanet(0,center));s.players[0].resources={matter:0,energy:0,biomass:0,data:0};
 const before=JSON.stringify(s);assert(!e.constructAt(0,coord,'harvester'));assert.equal(JSON.stringify(s),before,'Unaffordable replacement is atomic');
 p.upgrade='starbase';assert(!e.constructAt(0,coord,'harvester',null,true),'Cannot replace enemy Shipyard');
 p.upgrade='harvester';s.planets[center].owner=1;assert(!e.constructAt(0,coord,'harvester','free',true),'Recapture revokes permission');
}
console.log('Captured Harvesters: capture, legal adapter action, normal payment, production transfer, save/resume and atomic rejection passed.');
