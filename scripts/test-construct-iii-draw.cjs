// #construct-three-draw: an optional zero-build order, authority, timing and rival use.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),plain=x=>JSON.parse(JSON.stringify(x));
function game(resume){
 const ctx=vm.createContext({}),read=name=>fs.readFileSync(path.join(root,'prototypes/galactic-reach',name),'utf8');
 vm.runInContext(read('adapter.js')+read('app.js').replace('      clone, deckContents,','      runAiOperation, aiConstructCard, clone, deckContents,'),ctx);
 let e,seed=81,calls=0;const create=ctx.createGalacticAdapter;ctx.createGalacticAdapter=port=>{e=port;return create(port);};
 const a=ctx.createGalacticReach({headless:true,resume,random:()=>{calls++;return((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);}}),s=e.state;
 if(!resume){s.phase='operations';s.activePlayer=0;s.turnStage='prep';s.players.forEach(p=>{p.hand=[];p.deck=[];p.discard=[];p.inPlay=[];p.passed=false;p.resources={matter:0,energy:0,biomass:0,data:0};p.resourceLimits={matter:4,energy:4,biomass:4,data:4};});}
 return {e,a,s,p:s.players[0],calls:()=>calls};
}
const iii=id=>({id,key:'construct',starter:true,upgraded:true,level:3});
const action=g=>g.a.legalActions(0).find(a=>a.type==='construct_draw');
{
 const g=game();g.p.hand=[iii('iii')];g.p.deck=[{id:'drawn',key:'signalRelay'}];
 const before=plain({resources:g.p.resources,planets:g.s.planets,fleets:g.s.fleets});
 assert(action(g),'No building, ships or resources are required');
 g.a.applyAction(0,action(g));
 assert.deepEqual(plain(g.p.hand.map(c=>c.id)),['drawn']);assert.equal(g.p.inPlay[0].id,'iii');
 assert.equal(g.s.pendingConstruct,null);assert.equal(g.s.activePlayer,1);
 assert.deepEqual(plain({resources:g.p.resources,planets:g.s.planets,fleets:g.s.fleets}),before);
 const saved=g.a.snapshotState(),resumed=game(saved);assert(resumed.p.inPlay.some(c=>c.id==='iii'));
 const state=JSON.stringify(g.a.snapshotState()),calls=g.calls();
 assert.throws(()=>g.a.applyAction(0,{type:'construct_draw',card:'iii',key:'construct'}),/Illegal/);
 assert.equal(JSON.stringify(g.a.snapshotState()),state);assert.equal(g.calls(),calls);
}
{
 const g=game();g.p.hand=[iii('iii')];g.p.discard=[{id:'only-draw',key:'move',starter:true}];
 g.a.applyAction(0,action(g));assert.equal(g.p.hand.length,1);assert.equal(g.p.hand[0].id,'only-draw');
 assert(!g.p.deck.some(c=>c.id==='iii'));assert(!g.p.discard.some(c=>c.id==='iii'),'Commit before reshuffling');
}
{
 const g=game();g.p.hand=[iii('iii')];g.a.applyAction(0,action(g));
 assert.equal(g.p.hand.length,0);assert.equal(g.p.inPlay.length,1);assert.equal(g.s.pendingConstruct,null);
}
for(const card of [{id:'i',key:'construct',starter:true},{id:'ii',key:'construct',starter:true,upgraded:true,level:2},{id:'fake',key:'construct',level:3},{id:'move',key:'move',starter:true,upgraded:true,level:3},{id:'market',key:'worldEngine'}]){
 const g=game();g.p.hand=[card];g.p.deck=[{id:'drawn',key:'move'}];
 assert(!action(g));const before=JSON.stringify(g.a.snapshotState()),calls=g.calls();
 assert(!g.e.useConstructDraw(0,card.id));
 assert.throws(()=>g.a.applyAction(0,{type:'construct_draw',card:card.id,key:card.key}),/Illegal/);
 assert.equal(JSON.stringify(g.a.snapshotState()),before);assert.equal(g.calls(),calls);
}
for(const blocked of ['buy','wrong-seat','passed','winner','pendingCombat','pendingCombatReport','pendingMove','pendingConstruct','pendingColonyBuild','pendingConsortium']){
 const g=game();g.p.hand=[iii('iii')];g.p.deck=[{id:'drawn',key:'move'}];
 if(blocked==='buy')g.s.phase='buy';else if(blocked==='wrong-seat')g.s.activePlayer=1;else if(blocked==='passed')g.p.passed=true;else if(blocked==='winner')g.s.winner=1;else g.s[blocked]={playerId:0};
 const before=JSON.stringify(g.a.snapshotState()),calls=g.calls();assert(!g.e.canConstructDraw(0,'iii'),blocked);assert(!g.e.useConstructDraw(0,'iii'),blocked);
 assert.equal(JSON.stringify(g.a.snapshotState()),before);assert.equal(g.calls(),calls);
}
{
 const g=game();g.p.hand=[iii('iii'),iii('other')];g.p.deck=[{id:'drawn',key:'move'}];g.p.resources={matter:2,energy:2,biomass:2,data:2};
 const build=g.a.legalActions(0).find(a=>a.type==='build'&&a.card==='iii'&&a.kind==='harvester');assert(build);
 g.a.applyAction(0,build);assert.equal(g.p.hand.filter(c=>c.id==='drawn').length,1);assert(g.s.pendingConstruct);
 assert(!g.a.legalActions(0).some(a=>a.type==='construct_draw'),'Cannot bypass a pending second build with draw-only');
 g.a.applyAction(0,{type:'finish_construct'});assert.equal(g.p.hand.filter(c=>c.id==='drawn').length,1);
 assert.equal(g.p.resources.matter,1);assert.equal(g.p.resources.energy,1);assert.equal(g.p.resources.data,1);
}
for(const strategy of ['military','economy','expansion']){
 const g=game(),p=g.s.players[1];g.s.activePlayer=1;p.strategy=strategy;p.hand=[iii('iii')];p.deck=[{id:'fresh',key:'signalRelay'}];
 g.e.runAiOperation();assert(p.inPlay.some(c=>c.id==='iii'),strategy);assert(p.hand.some(c=>c.id==='fresh'),strategy);assert.equal(g.s.pendingConstruct,null);
}
{
 const g=game(),p=g.s.players[1];g.s.activePlayer=1;p.strategy='military';p.hand=[iii('iii')];
 g.e.runAiOperation();assert(!p.inPlay.length);assert(p.hand.some(c=>c.id==='iii'),'Do not spend an order for an empty draw');assert(p.passed);
}
{
 const g=game(),p=g.s.players[1];g.s.activePlayer=1;p.strategy='military';p.hand=[iii('iii')];p.deck=[{id:'fresh',key:'signalRelay'}];
 const coord=g.s.clusters[1].coords[1];Object.assign(g.s.planets[coord],{owner:1,upgrade:'starbase'});
 p.resources={matter:2,energy:1,biomass:1,data:0};g.e.runAiOperation();
 assert(Object.values(g.s.fleets).some(group=>group[1]?.settler||group[1]?.fleet),'Useful construction precedes draw-only');
 assert(p.inPlay.some(c=>c.id==='iii'));assert(p.hand.some(c=>c.id==='fresh'));assert(!g.s.log.some(s=>s.includes('without building')));
}
{
 const g=game(),ii={id:'ii',key:'construct',starter:true,upgraded:true,level:2},three=iii('iii');g.p.hand=[ii,three];
 assert.equal(g.e.aiConstructCard(g.p).id,'iii');g.p.hand.push({id:'free',key:'worldEngine'});assert.equal(g.e.aiConstructCard(g.p).id,'free');
}
console.log('Construct III: zero-build authority, draw-before-shuffle safety, empty draw, no double use, pending-choice guards, unchanged building, reload and rival choices passed.');
