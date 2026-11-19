// #destroyed-shipyards: real combat removes the claim, then ordinary Construct can reclaim it.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'../prototypes/galactic-reach',name),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
function game(resume){
 const c=vm.createContext({});vm.runInContext(read('adapter.js')+read('app.js').replace('      clone, deckContents,','      syncCombatPieces, clone, deckContents,'),c);
 let e,seed=94;const factory=c.createGalacticAdapter;c.createGalacticAdapter=port=>{e=port;return factory(port);};
 const a=c.createGalacticReach({headless:true,resume,random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32)}),s=e.state;
 if(!resume){s.phase='operations';s.activePlayer=0;s.turnStage='prep';s.fleets={};s.players.forEach(p=>{p.hand=[];p.inPlay=[];p.resources={matter:10,energy:10,biomass:10,data:10};p.resourceLimits={matter:20,energy:20,biomass:20,data:20};p.passed=false;});}
 return {e,a,s};
}
function finish(g){
 let n=0;while(g.s.pendingCombat){assert(n++<16);const seat=g.e.combatActor(),actions=g.e.combatActions(seat);assert(g.e.applyCombatAction(seat,actions.find(a=>a.type==='combat_stay')||actions.find(a=>a.tactic==='concentratedFire')||actions[0]));}
}
for(const kind of ['world','moon']){
 const g=game(),home=g.s.clusters.find(c=>g.s.planets[c.center].hasColony&&g.s.planets[c.center].owner===0);
 const coord=kind==='world'?home.coords.find(c=>c!==home.center):g.s.clusters.find(c=>c.kind==='moon').center;
 const [q,r]=coord.split(',').map(Number),source=kind==='world'?home.center:`${q+1},${r}`;
 Object.assign(g.s.planets[coord],{owner:1,upgrade:'starbase',hasColony:false});
 const others=Object.fromEntries(Object.entries(g.s.planets).filter(([at])=>at!==coord).map(([at,p])=>[at,p.owner]));
 g.s.fleets[source]={0:{fleet:1,settler:0,explorer:0}};g.s.players[0].hand=[{id:'rebuild',key:'construct',starter:true}];
 assert(g.e.executeMove(0,source,coord,{moveGroup:'ships'}));assert(g.s.pendingCombat);finish(g);
 assert.equal(g.s.planets[coord].owner,null,kind+' Shipyard destruction clears its hex owner');assert.equal(g.s.planets[coord].upgrade,null);
 assert.deepEqual(plain(Object.fromEntries(Object.entries(g.s.planets).filter(([at])=>at!==coord).map(([at,p])=>[at,p.owner]))),others,'Other claims, including Colonies, stay unchanged');
 const resumed=game(g.a.snapshotState());assert.equal(resumed.s.planets[coord].owner,null,'The cleared claim survives reload');
 Object.assign(resumed.s,{phase:'operations',activePlayer:0,turnStage:'prep'});resumed.s.players[0].passed=false;
 const build=resumed.a.legalActions(0).find(a=>a.type==='build'&&a.coord===coord&&a.kind==='starbase');assert(build,kind+' can be claimed and rebuilt through the authoritative command');
 const before=plain(resumed.s.players[0].resources);resumed.a.applyAction(0,build);
 assert.equal(resumed.s.planets[coord].owner,0);assert.equal(resumed.s.planets[coord].upgrade,'starbase');
 for(const resource of resumed.e.RESOURCES)assert.equal(resumed.s.players[0].resources[resource],before[resource]-(resumed.e.STRUCTURES.starbase.cost[resource]||0),'Rebuilding pays the normal '+resource+' cost');
}
// Even a mutual wipe clears the destroyed Shipyard's owner.
{
 const g=game(),home=g.s.clusters.find(c=>g.s.planets[c.center].hasColony&&g.s.planets[c.center].owner===0),coord=home.coords.find(c=>c!==home.center);
 Object.assign(g.s.planets[coord],{owner:1,upgrade:'starbase',hasColony:false});g.s.fleets[home.center]={0:{settler:1,explorer:0,fleet:0}};
 g.s.players[0].military=[{id:'rail',key:'railBattery'}];assert(g.e.executeMove(0,home.center,coord,{moveGroup:'ships'}));
 while(g.s.pendingCombat?.stage==='escape')assert(g.e.applyCombatAction(g.e.combatActor(),{type:'combat_stay'}));
 assert(g.e.applyCombatAction(0,{type:'combat_tactic',tactic:'railBattery'}));assert(g.e.applyCombatAction(1,{type:'combat_tactic',tactic:'concentratedFire'}));
 assert(!g.s.pendingCombat);assert(!g.s.fleets[coord]);assert.equal(g.s.planets[coord].owner,null);assert.equal(g.s.planets[coord].upgrade,null);
}
// A surviving Shipyard and unrelated owned terrain never lose their claims.
for(const [upgrade,pieces] of [['starbase',[{type:'starbase',hull:3,damage:2}]],['harvester',[{type:'fleet',hull:7,damage:7}]], [null,[{type:'fleet',hull:7,damage:7}]]]){
 const g=game(),coord=g.s.clusters[0].coords[1];Object.assign(g.s.planets[coord],{owner:1,upgrade});g.e.syncCombatPieces(1,coord,pieces);assert.equal(g.s.planets[coord].owner,1);assert.equal(g.s.planets[coord].upgrade,upgrade);
}
console.log('Destroyed Shipyards: world/moon combat, cleared claims across reload, normal paid rebuilding, mutual wipe, surviving yards and unrelated claims passed.');
