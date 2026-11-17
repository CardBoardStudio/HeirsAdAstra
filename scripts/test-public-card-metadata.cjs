const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../prototypes/galactic-reach'),ctx=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root,'adapter.js'),'utf8')+fs.readFileSync(path.join(root,'app.js'),'utf8'),ctx);
let e;const create=ctx.createGalacticAdapter;ctx.createGalacticAdapter=p=>{e=p;return create(p);};
const a=ctx.createGalacticReach({headless:true,random:()=>.3}),view=a.observe(0);
assert.equal(JSON.stringify(view.harvesterCost),JSON.stringify(e.STRUCTURES.harvester.cost));
view.harvesterCost.matter=99;assert.equal(e.STRUCTURES.harvester.cost.matter,1);assert.equal(a.observe(1).harvesterCost.matter,1,'Printed costs are cloned public metadata');
let checked=0;
for(const [key,card] of Object.entries(e.ALL_CARDS)){
 const stats=view.cardStats[key];
 for(const field of ['range','assault','colonyPrestige'])assert.equal(stats[field],card[field]||0,key+': '+field);
 for(const field of ['pathfinder','secondBuild','keepSettler'])assert.equal(stats[field],!!card[field],key+': '+field);
 assert.equal(stats.colonyCost,card.colonyCost??null,key+': preserve free versus unspecified cost');
 assert.equal(stats.buyEffect,card.buyEffect||null);
 assert.equal(stats.trashSelf,!!card.effect?.trashSelf);assert.equal(stats.trashStarters,card.effect?.trashStarters||0);checked++;
}
assert.equal(view.cardStats.genesisCharter.colonyCost,0);assert.equal(view.cardStats.colonyPods.keepSettler,true);assert.equal(view.cardStats.seedArk.keepSettler,false);
assert.equal(view.cardStats.foldSpaceGate.range,5);assert.equal(view.cardStats.strikeVector.assault,2);assert.equal(view.cardStats.prefabYards.secondBuild,true);
// Printed descriptors must not reveal the enemy hand or the private draw-pile order.
e.state.players[1].hand=[{id:'secret',key:'novaBarrage'}];
assert.equal(a.observe(0).players[1].hand,undefined);assert.equal(a.observe(0).players[1].deckContents,undefined);
assert.equal(JSON.stringify(a.observe(0).cardStats),JSON.stringify(view.cardStats));
console.log(`${checked} printed card descriptors match their definitions, preserve zero costs, and expose no enemy hand or draw order.`);
