// Rules #market-tiers and #cards: approved prices and a 10:6 draw/exchange supply.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {freshEngine}=require('./check-viewport-fit.cjs');
const expected={signalRelay:{matter:1,energy:2},surveyNetwork:{energy:1,biomass:2},tacticalBriefing:{matter:1,data:2},exchangeProtocol:{matter:2,biomass:1},barterNetwork:{biomass:2,data:1},clearingHouse:{energy:1,data:2},cargoExpansion:{matter:1,biomass:5},flakScreen:{matter:1,biomass:5},logisticsBriefing:{matter:2,energy:1},livingArchives:{matter:1,biomass:2}};
const plain=x=>JSON.parse(JSON.stringify(x));
const book=fs.readFileSync(path.join(__dirname,'../prototypes/galactic-reach/rulebook.html'),'utf8');
const {engine:e,state:s}=freshEngine();
for(const [key,cost] of Object.entries(expected)){
 assert.deepEqual(plain(e.MARKET_CARDS[key].cost),cost,key);
 const row=book.match(new RegExp('<tr data-card="'+key+'">.*?</tr>'))?.[0];assert(row,key);
 const label=e.RESOURCES.filter(r=>cost[r]).map(r=>cost[r]+' '+({matter:'Matter',energy:'Energy',biomass:'Life',data:'Data'}[r])).join(', ');assert(row.includes('aria-label="'+label+'"'),key+' printed cost');
}
const cheap=Object.values(e.MARKET_CARDS).filter(d=>Object.values(d.cost).reduce((a,b)=>a+b,0)===3);
assert.equal(cheap.filter(d=>d.effect?.draw===2).length,5);assert.equal(cheap.filter(d=>d.effect?.bankRate===2).length,3);
const supply=[...s.market,...Object.values(s.marketDecks).flat()];assert.equal(supply.length,58);
for(const key of ['logisticsBriefing','livingArchives']){
 assert.equal(supply.filter(c=>c.key===key).length,2);assert.equal(e.marketTier(key),'cheap');
 const g=freshEngine(),p=g.state.players[0],def=g.engine.MARKET_CARDS[key];Object.assign(g.state,{phase:'buy',activePlayer:0});p.passed=true;p.resources={matter:0,energy:0,biomass:0,data:0,...def.cost};g.state.market=[{id:'new-purchase',key}];g.state.marketDecks={expensive:[],medium:[],cheap:[]};
 assert(g.engine.buyCard(0,'market',0));assert(p.discard.some(c=>c.id==='new-purchase'));assert(Object.values(p.resources).every(n=>n===0));
 Object.assign(g.state,{phase:'operations',activePlayer:0,turnStage:'action'});p.passed=false;p.hand=[p.discard.pop()];p.deck=[{id:'draw-a',key:'move'},{id:'draw-b',key:'construct'}];p.discard=[];assert(g.engine.resolveHumanSpecial(p.hand[0],def,0));assert.equal(p.hand.length,2);assert(p.inPlay.some(c=>c.id==='new-purchase'));
}
console.log('Resource market: exact prices, canonical printed costs, two copies per new design, 10:6 supply, normal purchases and Draw 2 resolution passed.');
