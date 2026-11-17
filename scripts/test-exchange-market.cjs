const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=n=>fs.readFileSync(path.join(__dirname,'../prototypes/galactic-reach',n),'utf8'),plain=x=>JSON.parse(JSON.stringify(x));
function game(options={}){const ctx=vm.createContext({});vm.runInContext(read('adapter.js')+read('app.js'),ctx);let e;const create=ctx.createGalacticAdapter;ctx.createGalacticAdapter=p=>{e=p;return create(p);};let seed=241;const a=ctx.createGalacticReach({headless:true,random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32),...options});return {e,a,s:e.state,p:e.state.players[0]};}
const rich=p=>{p.resources={matter:30,energy:30,biomass:30,data:30};p.resourceLimits={matter:30,energy:30,biomass:30,data:30};};
function play(g,key,resource,id='exchange'){g.s.phase='operations';g.s.activePlayer=0;g.p.passed=false;g.p.hand=[{id,key}];const action=g.a.legalActions(0).find(a=>a.type==='special'&&a.card===id&&a.resource===resource);assert(action);g.a.applyAction(0,action);}
{
 const g=game();g.p.resources={matter:4,energy:4,biomass:4,data:0};g.s.phase='operations';g.s.activePlayer=0;g.p.hand=[{id:'exchange',key:'exchangeProtocol'}];
 const choices=g.a.legalActions(0).filter(a=>a.type==='special'&&a.card==='exchange');assert.equal(choices.length,4);const before=JSON.stringify(g.a.snapshotState());assert.throws(()=>g.a.applyAction(0,{...choices[0],resource:'credits'}),/Illegal/);assert.equal(JSON.stringify(g.a.snapshotState()),before);
 g.a.applyAction(0,choices.find(a=>a.resource==='biomass'));assert.equal(g.e.bankTradeRate(0,'biomass'),2);assert.equal(g.e.bankTradeRate(1,'biomass'),4);assert.equal(g.e.bankTradeRate(0,'energy'),4);assert(g.p.inPlay.some(c=>c.id==='exchange'));assert.equal(g.s.activePlayer,1,'Playing uses the Operations action');
 for(let i=0;i<2;i++)g.a.applyAction(0,{type:'bank_trade',giveType:'biomass',getType:'data'});assert.equal(g.p.resources.biomass,0);assert.equal(g.p.resources.data,2,'Off-turn exchanges repeat at2:1');
 const resumed=game({resume:g.a.snapshotState()});assert.equal(resumed.e.bankTradeRate(0,'biomass'),2);assert.equal(resumed.a.privateState(1).players[0].bankExchangeResources[0],'biomass');
 play(g,'clearingHouse','energy','second');assert.equal(g.e.bankTradeRate(0,'energy'),2);assert.equal(g.e.bankTradeRate(0,'biomass'),2);
 play(g,'barterNetwork','energy','third');assert.equal(g.p.bankExchangeResources.length,2,'Duplicate selection never stacks below2:1');
 g.s.phase='buy';g.s.activePlayer=0;g.e.nextBuyPlayer();assert.equal(g.e.bankTradeRate(0,'biomass'),4);assert.equal(g.e.bankTradeRate(0,'energy'),4,'Both choices expire at Buy end');
}
{
 const g=game();g.p.resources={matter:4,energy:4,biomass:2,data:4};play(g,'exchangeProtocol','biomass');g.a.applyAction(0,{type:'bank_trade',giveType:'biomass',getType:'data'});assert.equal(g.p.resources.biomass,0);assert.equal(g.p.resources.data,4,'Normal automatic overflow still applies');
}
{
 const g=game();rich(g.p);g.s.phase='buy';const before=JSON.stringify(g.a.snapshotState());assert(!g.a.legalActions(0).some(a=>a.source==='catalog'));assert.throws(()=>g.a.applyAction(0,{type:'buy',source:'catalog',key:'strategyCore'}),/Illegal/);assert.equal(JSON.stringify(g.a.snapshotState()),before);assert.equal(g.a.observe(0).market.length,9,'Ordinary games retain three rows');
}
{
 const g=game({simulationCatalogMarket:true});rich(g.p);g.s.phase='buy';const obs=g.a.observe(0);assert.equal(obs.market.length,28);assert.equal(g.s.market.length,9);assert.equal(obs.marketCosts.length,28);assert.equal(obs.marketPaymentCosts.length,28);assert(Object.values(obs.catalogCounts).every(n=>n===2));
 const key=Object.keys(g.e.MARKET_CARDS).find(k=>!g.s.market.some(c=>c.key===k));assert(key);const cost=g.e.ALL_CARDS[key].cost,stock={...g.p.resources};
 g.a.applyAction(0,{type:'buy',source:'catalog',key});for(const r of g.e.RESOURCES)assert.equal(g.p.resources[r],stock[r]-(cost[r]||0));assert.equal(g.e.marketCopiesRemaining(key),1);
 const p1=g.s.players[1];rich(p1);g.s.activePlayer=1;g.a.applyAction(1,{type:'buy',source:'catalog',key});assert.equal(g.e.marketCopiesRemaining(key),0);assert(!g.a.observe(1).market.some(c=>c.key===key));
 const before=JSON.stringify(g.a.snapshotState());assert.throws(()=>g.a.applyAction(1,{type:'buy',source:'catalog',key}),/Illegal/);assert.equal(JSON.stringify(g.a.snapshotState()),before);
 for(const card of g.a.observe(1).market)assert(!('position'in card)&&!('deckIndex'in card));
 assert(Object.values(g.a.privateState(0).marketDecks).flat().every(c=>c.hidden===true),'Catalog permission never exposes shuffled deck order');
 const resumed=game({resume:g.a.snapshotState(),simulationCatalogMarket:true});assert.equal(resumed.e.marketCopiesRemaining(key),0);assert.equal(resumed.a.observe(0).market.length,27);
}
{
 const g=game({simulationCatalogMarket:true});rich(g.p);g.s.phase='buy';g.p.hand=[{id:'coupon',key:'tradeSyndicate'}];g.a.applyAction(0,{type:'buy_effect',card:'coupon'});const before={...g.p.resources};g.a.applyAction(0,{type:'buy',source:'catalog',key:'exchangeProtocol'});assert.equal(g.p.resources.energy,before.energy-1);assert.equal(g.p.resources.data,before.data);assert(g.p.discard.some(c=>c.key==='exchangeProtocol'),'Catalog normal card enters discard');
 g.a.applyAction(0,{type:'buy',source:'catalog',key:'railBattery'});assert(g.p.military.some(c=>c.key==='railBattery'),'Catalog military card enters military deck');
}
console.log('Exchange orders and simulation catalog: choices,authority,timing,off-turn rates,repeat/stack/expiry,reload,overflow,finite stock,prices,discounts,piles and deck privacy passed.');
