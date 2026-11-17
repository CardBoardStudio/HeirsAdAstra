// #seed-ark-choice: two mutually exclusive orders and normal in-play timing.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../prototypes/galactic-reach'),plain=x=>JSON.parse(JSON.stringify(x));
const {oldText,newText}=require('./compare-seed-ark-choice.cjs');
function game(resume,enabled=true){
 const ctx=vm.createContext({});let source=fs.readFileSync(path.join(root,'app.js'),'utf8').replace('      clone, deckContents,','      runAiOperation, aiCardUtility, cardMarkup, describeDecision, clone, deckContents,');
 if(!enabled)source=source.replace('colonyCost: 1, fallbackDraw: 2,','colonyCost: 1,').replace(newText,oldText);
 vm.runInContext(fs.readFileSync(path.join(root,'adapter.js'),'utf8')+source,ctx);let e,seed=81,calls=0;const create=ctx.createGalacticAdapter;ctx.createGalacticAdapter=port=>{e=port;return create(port);};
 const a=ctx.createGalacticReach({headless:true,resume,random:()=>{calls++;return((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);}}),s=e.state,p=s.players[0];
 if(!resume){s.phase='operations';s.activePlayer=0;s.turnStage='prep';s.fleets={};s.players.forEach(p=>{p.hand=[];p.deck=[];p.discard=[];p.inPlay=[];p.passed=false;p.resources={matter:0,energy:0,biomass:0,data:0};});p.hand=[{id:'seed',key:'seedArk'}];}
 return {e,a,s,p,calls:()=>calls};
}
const draw=g=>g.a.legalActions(0).find(a=>a.type==='order_draw');
{
 const g=game();g.p.deck=[{id:'one',key:'signalRelay'},{id:'two',key:'move',starter:true}];
 const before=plain({resources:g.p.resources,planets:g.s.planets,fleets:g.s.fleets});assert(draw(g));
 const markup=g.e.cardMarkup(g.p.hand[0],'hand');assert(markup.includes('data-order-draw="seed"'));assert(markup.includes('aria-label="Play Seed Ark to draw two cards instead of colonizing"'));
 assert(g.e.describeDecision(0,draw(g),g.s,['You']).text.includes('Draw 2 instead of colonizing'));
 g.a.applyAction(0,draw(g));assert.deepEqual(plain(g.p.hand.map(c=>c.id).sort()),['one','two']);assert.equal(g.p.inPlay[0].id,'seed');assert.equal(g.s.activePlayer,1);
 assert.deepEqual(plain({resources:g.p.resources,planets:g.s.planets,fleets:g.s.fleets}),before);
 const resumed=game(g.a.snapshotState());assert(resumed.p.inPlay.some(c=>c.id==='seed'));assert.equal(resumed.p.hand.length,2);
 const state=JSON.stringify(resumed.a.snapshotState()),calls=resumed.calls();assert.throws(()=>resumed.a.applyAction(0,{type:'order_draw',card:'seed',key:'seedArk'}),/Illegal/);assert.equal(JSON.stringify(resumed.a.snapshotState()),state);assert.equal(resumed.calls(),calls);
}
{
 const g=game();g.p.discard=[{id:'one',key:'signalRelay'},{id:'two',key:'move',starter:true}];g.a.applyAction(0,draw(g));
 assert.equal(g.p.hand.length,2);assert(!g.p.hand.some(c=>c.id==='seed'));assert(g.p.inPlay.some(c=>c.id==='seed'));assert(!g.p.discard.some(c=>c.id==='seed'));
}
for(const remaining of [0,1]){
 const g=game();if(remaining)g.p.deck=[{id:'only',key:'move',starter:true}];g.a.applyAction(0,draw(g));assert.equal(g.p.hand.length,remaining);assert.equal(g.p.inPlay[0].id,'seed');
}
for(const blocked of ['buy','wrong-seat','passed','winner','pendingCombat','pendingCombatReport','pendingMove','pendingConstruct','pendingColonyBuild','pendingConsortium']){
 const g=game();g.p.deck=[{id:'one',key:'move'}];if(blocked==='buy')g.s.phase='buy';else if(blocked==='wrong-seat')g.s.activePlayer=1;else if(blocked==='passed')g.p.passed=true;else if(blocked==='winner')g.s.winner=1;else g.s[blocked]={playerId:0};
 const before=JSON.stringify(g.a.snapshotState()),calls=g.calls();assert(!g.e.canOrderDraw(0,'seed'),blocked);assert(!g.e.useOrderDraw(0,'seed'),blocked);assert.equal(JSON.stringify(g.a.snapshotState()),before);assert.equal(g.calls(),calls);
}
for(const invalid of [{type:'order_draw',card:'seed',key:'seedArk',amount:99},{type:'order_draw',card:'missing',key:'seedArk'},{type:'order_draw',card:'seed',key:'colonyPods'}]){
 const g=game(),before=JSON.stringify(g.a.snapshotState()),calls=g.calls();assert.throws(()=>g.a.applyAction(0,invalid),/Illegal/);assert.equal(JSON.stringify(g.a.snapshotState()),before);assert.equal(g.calls(),calls);
}
for(const key of ['colonyPods','genesisCharter','colonize','construct']){
 const g=game();g.p.hand=[{id:'other',key}];assert(!draw(g));assert(!g.e.useOrderDraw(0,'other'));
}
{
 const g=game(undefined,false);assert.equal(g.a.observe(0).cardStats.seedArk.fallbackDraw,0);assert(!draw(g));assert(!g.e.cardMarkup(g.p.hand[0],'hand').includes('data-order-draw'));
}
{
 const g=game(),world=g.s.clusters.find(c=>c.kind==='world'&&g.s.planets[c.center].owner===null),coord=world.center;g.s.fleets[coord]={0:{settler:1,fleet:0,explorer:0}};g.p.resources.biomass=1;g.p.deck=[{id:'must-stay',key:'signalRelay'}];
 const action=g.a.legalActions(0).find(a=>a.type==='colonize'&&a.coord===coord);assert(action);g.a.applyAction(0,action);assert.equal(g.p.resources.biomass,0);assert.equal(g.s.planets[coord].owner,0);assert(!g.s.fleets[coord]?.[0]?.settler);assert.equal(g.p.hand.length,0);assert.equal(g.p.deck[0].id,'must-stay');assert(g.p.inPlay.some(c=>c.id==='seed'));
}
{
 const g=game(),coord=g.s.clusters[1].center;g.s.fleets[coord]={0:{settler:1,fleet:0,explorer:0}};g.p.resources.biomass=1;assert(!g.a.legalActions(0).some(a=>a.type==='colonize'&&a.coord===coord),'Capture still needs a Fleet');
}
for(const strategy of ['military','economy','expansion','market']){
 const g=game(),p=g.s.players[1];g.s.activePlayer=1;p.strategy=strategy;p.hand=[{id:'ai-seed',key:'seedArk'}];p.deck=[{id:'one',key:'signalRelay'},{id:'two',key:'move'}];g.e.runAiOperation();assert(p.inPlay.some(c=>c.id==='ai-seed'),strategy);assert.equal(p.hand.length,2);
}
{
 const g=game(),p=g.s.players[1],world=g.s.clusters.find(c=>c.kind==='world'&&g.s.planets[c.center].owner===null);g.s.activePlayer=1;p.hand=[{id:'ai-colony',key:'seedArk'}];p.resources.biomass=1;p.deck=[{id:'keep-in-deck',key:'signalRelay'}];g.s.fleets[world.center]={1:{settler:1}};
 g.e.runAiOperation();assert.equal(g.s.planets[world.center].owner,1);assert.equal(p.deck.length,1);assert(!p.hand.length,'Colony use does not also draw');
}
console.log('Seed Ark: alternate draw, unchanged Colony/capture costs, no self-redraw, empty draws, authority, forged commands, reload, printed metadata, desktop button and browser rivals passed.');
