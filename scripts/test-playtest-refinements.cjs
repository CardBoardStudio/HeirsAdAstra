// Rules #resources, #storage-allocation, #relic-targeting, #relic-purchases and #victory.
const assert=require('node:assert/strict');
const {freshEngine}=require('./check-viewport-fit.cjs');
let serial=0;const card=key=>({id:`refinement-${serial++}`,key});
const plain=x=>JSON.parse(JSON.stringify(x));
function game(key){const g=freshEngine(171);g.s=g.state;g.e=g.engine;g.p=g.s.players[0];g.s.phase='operations';g.s.activePlayer=0;g.s.turnStage='prep';g.s.fleets={};for(const p of g.s.players){p.hand=[];p.inPlay=[];p.deck=[];p.discard=[];p.resources={matter:0,energy:0,biomass:0,data:0};p.passed=false;}g.p.hand=[card(key)];return g;}
{
 const g=game('capacityModule');g.p.resourceLimits={matter:14,energy:15,biomass:15,data:14};
 const choices=g.e.capacityAllocations(0,4);assert.equal(choices.length,1);assert.deepEqual(plain(choices[0]),{matter:1,energy:0,biomass:0,data:1});
 assert(!g.e.validCapacityAllocation(0,{matter:2,energy:0,biomass:0,data:2},4));
 assert(g.e.resolveHumanSpecial(g.p.hand[0],g.e.ALL_CARDS.capacityModule,0,choices[0]));
 assert(Object.values(g.p.resourceLimits).every(n=>n===15));assert.equal(g.p.storage.length,1);
 g.s.phase='buy';g.s.activePlayer=0;g.p.resources={matter:1,energy:1,biomass:1,data:1};assert(!g.e.canBuyCapacity(0));
}
{
 const g=game('foldedWarehouse');g.p.resourceLimits={matter:15,energy:14,biomass:15,data:4};
 assert(g.e.resolveHumanSpecial(g.p.hand[0],g.e.ALL_CARDS.foldedWarehouse,0));assert.deepEqual(plain(g.p.resourceLimits),{matter:15,energy:15,biomass:15,data:6});
}
{
 const g=game('omniscientChorus'),id=g.p.hand[0].id;g.p.deck=[card('move')];
 assert(g.e.resolveHumanSpecial(g.p.hand[0],g.e.ALL_CARDS.omniscientChorus,0));assert.equal(g.p.hand.length,1);
 for(const zone of ['hand','inPlay','deck','discard','storage'])assert(!g.p[zone].some(c=>c.id===id));
}
{
 const g=game('gravityScepter'),coords=Object.keys(g.s.planets).filter(at=>!g.s.planets[at].hasColony&&!g.s.planets[at].upgrade);
 const destination=coords[0],source=coords.find(at=>at!==destination&&g.e.travelDistance(at,destination)<=3);
 g.s.fleets[destination]={0:{settler:0,explorer:0,fleet:2}};g.s.fleets[source]={1:{settler:0,explorer:0,fleet:1}};
 const choice=g.e.relicOperations(0).find(a=>a.source===source&&a.destination===destination);assert(choice);
 assert(g.e.applyRelicAction(0,choice));assert(g.s.pendingCombat);assert.equal(g.s.pendingCombat.attackerId,1);assert.equal(g.s.pendingCombat.defenderId,0);assert.equal(g.s.pendingMove.playerId,0);
 assert(!g.s.fleets[source]?.[1]);assert.equal(g.s.fleets[destination][1].fleet,1);
}
{
 const g=game('ascendancyCodex');g.p.deck=[card('move')];assert(g.e.resolveHumanSpecial(g.p.hand[0],g.e.ALL_CARDS.ascendancyCodex,0));
 assert.equal(g.p.cardPrestigeSources.ascendancyCodex,1);assert.equal(g.p.cardPrestige,1);assert.equal(g.p.deck.length,1,'Codex grants Prestige without drawing the waiting card');
 const snap=g.adapter.snapshotState();assert.equal(snap.state.players[0].cardPrestigeSources.ascendancyCodex,1);
}
// #relic-targeting: every nonempty subset is legal, ownership and unchosen ships stay put.
for(const units of [{settler:0,explorer:0,fleet:1},{settler:1,explorer:1,fleet:1}]) {
 const g=game('gravityScepter'),source='0,0',destination='2,0';
 for(const at of [source,destination])if(g.s.planets[at])Object.assign(g.s.planets[at],{owner:null,hasColony:false,upgrade:null});
 g.s.fleets[source]={1:{settler:1,explorer:1,fleet:2}};
 const choices=g.e.relicOperations(0).filter(a=>a.source===source&&a.destination===destination);
 assert.equal(choices.length,11);const choice=choices.find(a=>JSON.stringify(a.units)===JSON.stringify(units));assert(choice);
 const before=JSON.stringify(g.s);
 for(const invalid of [{...choice,owner:0},{...choice,source:'1,0'},{...choice,destination:'5,0'},{...choice,units:{settler:0,explorer:0,fleet:0}},{...choice,units:{settler:0,explorer:0,fleet:3}}])assert(!g.e.applyRelicAction(0,invalid));
 assert.equal(JSON.stringify(g.s),before);
 assert(g.e.applyRelicAction(0,choice));assert.deepEqual(plain(g.s.fleets[destination][1]),units);
 assert.deepEqual(plain(g.s.fleets[source][1]),{settler:1-units.settler,explorer:1-units.explorer,fleet:2-units.fleet});
 assert.equal(g.p.inPlay.filter(c=>c.key==='gravityScepter').length,1);assert.equal(g.s.activePlayer,1);
 const snapshot=JSON.parse(JSON.stringify(g.adapter.snapshotState()));Object.assign(g.s,snapshot.state);assert.deepEqual(plain(g.s.fleets[destination][1]),units);
}
{
 const g=game('move');g.s.players[1].cardPrestige=10;assert.equal(g.e.aiLeaderPressure(0,1),24);assert.equal(g.e.aiLeaderPressure(0,2),0);
 g.s.players[2].cardPrestige=10;assert.equal(g.e.aiLeaderPressure(0,2),24);assert.equal(g.e.aiLeaderPressure(1,2),0);
}
// The discussed battle redesign is not part of these refinements (#combat).
{
 const g=game('move'),{e,s}=g;
 assert.deepEqual(plain(Object.fromEntries(Object.entries(e.SHIP_STATS).map(([key,v])=>[key,[v.power,v.hull,v.defendingHull||v.hull]]))),{settler:[1,2,4],explorer:[1,1,1],fleet:[3,7,7]});
 const coord=s.clusters[4].center;Object.assign(s.planets[coord],{owner:null,hasColony:false,upgrade:null});
 s.fleets[coord]={0:{settler:0,explorer:0,fleet:1},1:{settler:0,explorer:0,fleet:1}};
 assert(e.executeMove(0,coord,coord,{units:{settler:0,explorer:0,fleet:1},moveGroup:'ships'}));
 const battle=s.pendingCombat;assert.deepEqual(plain(battle.hands.attacker),{concentratedFire:2,defensiveScreen:2});
 while(s.pendingCombat?.stage==='escape')assert(e.applyCombatAction(e.combatActor(),{type:'combat_stay'}));
 for(const tactic of ['defensiveScreen','defensiveScreen','concentratedFire']){
  assert(e.applyCombatAction(0,{type:'combat_tactic',tactic}));assert(e.applyCombatAction(1,{type:'combat_tactic',tactic}));
 }
 assert.equal(battle.volleys.length,3,'The battle still permits three volleys, with one ship per side');
 for(const side of ['attacker','defender']){assert.deepEqual(plain(battle.volleys.map(v=>v[side].base)),[3,3,3],'Base attack applies in every volley');assert.deepEqual(plain(battle.volleys.map(v=>v[side].damage)),[1,1,4]);}
}
console.log('Capacity ceiling/headroom, single-use Chorus, hostile summoning, card Prestige persistence and public leader priority passed.');
