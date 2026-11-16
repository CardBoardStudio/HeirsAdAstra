// #buy: only phase, turn, market supply and resource payment restrict purchases.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const plain = value => JSON.parse(JSON.stringify(value));
function game(resume) {
  const context = vm.createContext({});
  const read = file => fs.readFileSync(path.join(__dirname,'..','prototypes/galactic-reach',file),'utf8');
  vm.runInContext(read('adapter.js')+read('app.js').replace('      clone, deckContents,','      runAiBuy, clone, deckContents,'),context);
  let e, seed=1729;
  const factory=context.createGalacticAdapter;
  context.createGalacticAdapter=port=>{e=port;return factory(port);};
  const a=context.createGalacticReach({headless:true,resume,random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32)});
  if(!resume) {
    Object.assign(e.state,{phase:'buy',activePlayer:0});
    const p=e.state.players[0];Object.assign(p,{hand:[],deck:[],discard:[],inPlay:[],passed:true,resources:{matter:0,energy:10,biomass:0,data:5},resourceLimits:{matter:30,energy:30,biomass:30,data:30}});
    // One Cheap row of three with two cards left in its deck; the other tiers have run out (rules #market).
    e.state.market=Array.from({length:3},(_,n)=>({key:'signalRelay',id:`market-${n}`}));
    e.state.marketDecks={expensive:[],medium:[],cheap:[{key:'signalRelay',id:'refill-1'},{key:'signalRelay',id:'refill-2'}]};
  }
  return {e,a,s:e.state,p:e.state.players[0]};
}
const buy = g => {
  const action=g.a.legalActions(0).find(a=>a.type==='buy');assert(action);
  g.a.applyAction(0,action);
};
{
  let g=game();g.p.buyLimit=1; // Obsolete saved counter cannot reinstate a cap in this ruleset.
  buy(g);assert.equal(g.s.market.length,3,'Purchased slots refill immediately from their tier deck');
  g=game(g.a.snapshotState());
  for(let n=1;n<5;n++) {buy(g);assert.equal(g.p.bought,n+1);assert.equal(g.s.phase,'buy');assert.equal(g.s.activePlayer,0);}
  assert.deepEqual(plain(g.p.resources),{matter:0,energy:0,biomass:0,data:0},'Every purchase pays its own price');
  assert.equal(g.p.cardsPurchased,5);assert.equal(g.p.discard.length,5);
  assert(g.p.discard.some(c=>c.id==='refill-1')&&g.p.discard.some(c=>c.id==='refill-2'),'Newly refilled cards can be bought this turn');
  assert.equal(g.s.market.length,0);assert(!g.a.legalActions(0).some(a=>a.type==='buy'));
  g.a.applyAction(0,{type:'finish_buy'});assert.equal(g.s.phase,'operations');assert.equal(g.s.activePlayer,1);
}
{
  const g=game();g.p.resources={matter:0,energy:3,biomass:0,data:1};buy(g);
  const before=JSON.stringify(g.a.snapshotState());
  assert(!g.a.legalActions(0).some(a=>a.type==='buy'),'Insufficient resources still prevent another purchase');
  assert(!g.e.buyCard(0,'market',0));assert.equal(JSON.stringify(g.a.snapshotState()),before);
  g.p.resources.energy=10;g.p.resources.data=5;g.s.activePlayer=1;
  assert(!g.e.buyCard(0,'market',0),'Cannot buy during another seat’s Buy turn');
  assert(!g.a.legalActions(0).some(a=>a.type==='buy'));
  g.s.activePlayer=0;g.s.phase='operations';assert(!g.e.buyCard(0,'market',0),'Cannot buy during Operations');
}
{
  const g=game();g.s.market=['signalRelay','surveyNetwork','tacticalBriefing'].map(key=>({key,id:key}));g.s.marketDecks={expensive:[],medium:[],cheap:[]};
  g.p.resources={matter:24,energy:24,biomass:24,data:24};
  const yard=g.s.clusters[0].coords[1];Object.assign(g.s.planets[yard],{owner:0,upgrade:'starbase'});
  g.e.runAiBuy();assert.equal(g.p.bought,3,'Browser rival can buy more than two cards');
  assert.equal(g.p.discard.length,3);assert.equal(g.s.market.length,0);
  assert.equal(g.s.phase,'operations');assert.equal(g.s.activePlayer,1,'Finite supply lets the rival finish its Buy turn');
}
console.log('Unlimited buys: five paid purchases with immediate refills, resumed counters, resource/phase/seat guards, depleted supply and rival continuation passed.');
