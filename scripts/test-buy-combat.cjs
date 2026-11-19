// #combat-tactics, #exchange-orders, #buy: protect civilians and keep Buy exchanges in Buy.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'../prototypes/galactic-reach',name),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
function game(resume){
 const c=vm.createContext({});vm.runInContext(read('adapter.js')+read('app.js').replace('      clone, deckContents,','      applyCombatHits, runAiBuy, clone, deckContents,'),c);
 let e,seed=741,calls=0;const factory=c.createGalacticAdapter;c.createGalacticAdapter=port=>{e=port;return factory(port);};
 const a=c.createGalacticReach({headless:true,resume,random:()=>{calls++;return((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);}}),s=e.state,p=s.players[0];
 if(!resume){s.phase='buy';s.activePlayer=0;s.turnStage='buy';p.passed=true;p.hand=[];p.inPlay=[];p.discard=[];p.resources={matter:0,energy:0,biomass:0,data:0};}
 return {e,a,s,p,calls:()=>calls};
}
const piece=(type,hull,damage=0)=>({type,hull,damage,power:1});
{
 const {e}=game(),pieces=[piece('explorer',1),piece('settler',2,1),piece('fleet',7),piece('fleet',7,6),piece('starbase',3)];
 assert.deepEqual(plain(e.applyCombatHits(pieces,2)).map(p=>p.type),['fleet']);
 assert.deepEqual(pieces.map(p=>p.damage),[0,1,1,7,0],'Finish the wounded Fleet and keep shielding a wounded Settler');
 e.applyCombatHits(pieces,6);assert.equal(pieces[2].damage,7);assert.equal(pieces[1].damage,1);
 e.applyCombatHits(pieces,2);assert.equal(pieces[1].damage,2);assert.equal(pieces[0].damage,1);assert.equal(pieces[4].damage,0,'Settlers follow Fleets; Explorers follow Settlers');
 e.applyCombatHits(pieces,20);assert.equal(pieces[4].damage,3,'Remaining hits reach the Shipyard');
}
for(const key of ['exchangeProtocol','barterNetwork','clearingHouse']){
 const g=game();g.p.hand=[{id:'exchange',key}];
 const choices=g.a.legalActions(0).filter(a=>a.type==='special');assert.equal(choices.length,4);
 const before=JSON.stringify(g.a.snapshotState()),rng=g.calls();assert.throws(()=>g.a.applyAction(0,{...choices[0],resource:'credits'}),/Illegal/);assert.equal(JSON.stringify(g.a.snapshotState()),before);assert.equal(g.calls(),rng);
 g.a.applyAction(0,choices.find(a=>a.resource==='energy'));
 assert.equal(g.s.phase,'buy');assert.equal(g.s.activePlayer,0);assert.equal(g.s.turnStage,'buy');assert(g.p.passed);
 assert(g.p.inPlay.some(c=>c.id==='exchange'));assert.equal(g.e.bankTradeRate(0,'energy'),2);assert.equal(g.e.bankTradeRate(1,'energy'),4);
 const used=JSON.stringify(g.s);assert.throws(()=>g.a.applyAction(0,choices[0]),/Illegal/);assert.equal(JSON.stringify(g.s),used,'A played exchange cannot be played twice');
 assert(!g.a.legalActions(0).some(a=>a.type==='special'&&a.card==='exchange'),'A played card cannot activate twice');
 const resumed=game(g.a.snapshotState());assert.equal(resumed.e.bankTradeRate(0,'energy'),2);assert(resumed.p.inPlay.some(c=>c.id==='exchange'));
 resumed.a.applyAction(0,{type:'finish_buy'});assert.equal(resumed.e.bankTradeRate(0,'energy'),4,'The rate expires when this Buy ends');
}
{
 const g=game();g.p.resources={matter:0,energy:4,biomass:3,data:0};
 g.p.hand=[{id:'first',key:'exchangeProtocol'},{id:'second',key:'barterNetwork'},{id:'starter',key:'construct',starter:true}];
 g.p.buyStartHandIds=g.p.hand.map(c=>c.id);g.p.buyStartInPlayIds=[];g.p.buyStartDiscardIds=[];g.s.market=[{id:'new-copy',key:'exchangeProtocol'}];
 g.a.applyAction(0,{type:'special',card:'first',key:'exchangeProtocol',resource:'energy'});
 g.a.applyAction(0,{type:'bank_trade',giveType:'energy',getType:'data'});
 g.a.applyAction(0,g.a.legalActions(0).find(a=>a.type==='buy'&&a.key==='exchangeProtocol'));
 assert(g.p.discard.some(c=>c.id==='new-copy'));assert(!g.a.legalActions(0).some(a=>a.type==='special'&&a.card==='new-copy'),'A purchase stays in discard');
 g.a.applyAction(0,{type:'special',card:'second',key:'barterNetwork',resource:'biomass'});
 assert.equal(g.s.activePlayer,0);assert.equal(g.e.bankTradeRate(0,'biomass'),2,'A second held copy can choose another resource');
 assert(!g.a.legalActions(0).some(a=>a.type==='decommission'&&['first','second'].includes(a.card)),'Playing during Buy does not make a new in-play card eligible for trashing');
 g.a.applyAction(0,{type:'decommission',card:'starter',resource:'biomass'});assert.equal(g.p.resources.biomass,0,'The same Buy still permits paid trashing');
}
for(const blocked of ['wrong-seat','production','cleanup','winner','pendingCombatReport','pendingMove','pendingConstruct','pendingColonyBuild','pendingConsortium']){
 const g=game();g.p.hand=[{id:'blocked',key:'exchangeProtocol'}];
 if(blocked==='wrong-seat')g.s.activePlayer=1;else if(['production','cleanup'].includes(blocked))g.s.phase=blocked;else if(blocked==='winner')g.s.winner=1;else g.s[blocked]={playerId:0};
 const before=JSON.stringify(g.s),rng=g.calls();assert(!g.e.resolveHumanSpecial(g.p.hand[0],g.e.ALL_CARDS.exchangeProtocol,0,'energy'),blocked);assert.equal(JSON.stringify(g.s),before);assert.equal(g.calls(),rng);
 assert(!g.a.legalActions(0).some(a=>a.type==='special'&&a.card==='blocked'),blocked+' is not advertised');
}
{
 const g=game();g.p.hand=[{id:'ordinary',key:'signalRelay'}];assert(!g.a.legalActions(0).some(a=>a.type==='special'),'Other Operations effects do not acquire Buy timing');
}
{
 const g=game(),p=g.s.players[1],yard=g.s.clusters[1].coords[1];g.s.activePlayer=1;p.passed=true;p.strategy='market';
 Object.assign(g.s.planets[yard],{owner:1,upgrade:'starbase'});p.hand=[{id:'bot-exchange',key:'clearingHouse'},{id:'engine',key:'construct',starter:true,upgraded:true,level:3}];p.inPlay=[];p.discard=[];
 p.resources={matter:0,energy:14,biomass:0,data:0};p.resourceLimits={matter:20,energy:20,biomass:20,data:20};g.s.market=[{id:'target',key:'commandNexus'}];g.s.marketDecks={cheap:[],medium:[],expensive:[]};
 g.e.runAiBuy();assert(p.inPlay.some(c=>c.id==='bot-exchange'),'Browser rivals can activate a useful held exchange in Buy');assert(p.discard.some(c=>c.id==='target'),'The improved rate funds the intended purchase');
}
console.log('Buy/combat: Fleet-first hits, civilian ordering, Buy exchange choices and continuation, persistence, expiry, guards, purchase/trash timing and browser rival use passed.');
