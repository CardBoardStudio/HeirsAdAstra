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
 assert(g.e.resolveHumanSpecial(g.p.hand[0],g.e.ALL_CARDS.foldedWarehouse,0));assert.deepEqual(plain(g.p.resourceLimits),{matter:15,energy:15,biomass:15,data:5});
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
 assert.equal(g.p.cardPrestigeSources.ascendancyCodex,2);assert.equal(g.p.cardPrestige,2);
 const snap=g.adapter.snapshotState();assert.equal(snap.state.players[0].cardPrestigeSources.ascendancyCodex,2);
}
{
 const g=game('move');g.s.players[1].cardPrestige=10;assert.equal(g.e.aiLeaderPressure(0,1),24);assert.equal(g.e.aiLeaderPressure(0,2),0);
 g.s.players[2].cardPrestige=10;assert.equal(g.e.aiLeaderPressure(0,2),24);assert.equal(g.e.aiLeaderPressure(1,2),0);
}
console.log('Capacity ceiling/headroom, single-use Chorus, hostile summoning, card Prestige persistence and public leader priority passed.');
