const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../prototypes/galactic-reach'),plain=x=>JSON.parse(JSON.stringify(x));
function game(resume){
 const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'adapter.js'),'utf8')+fs.readFileSync(path.join(root,'app.js'),'utf8'),ctx);
 let e,seed=19;const create=ctx.createGalacticAdapter;ctx.createGalacticAdapter=p=>{e=p;return create(p);};
 const a=ctx.createGalacticReach({headless:true,resume,random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32)}),s=e.state,p=s.players[0];
 if(!resume){s.phase='operations';s.activePlayer=0;s.turnStage='prep';s.fleets={};s.players.forEach(p=>{p.hand=[];p.deck=[];p.discard=[];p.inPlay=[];p.passed=false;p.resources={matter:0,energy:0,biomass:0,data:0};});p.hand=[{id:'engine',key:'worldEngine'}];}
 return {e,a,s,p};
}
{
 const g=game();g.p.discard=[{id:'drawn',key:'signalRelay'}];
 assert(!g.a.legalActions(0).some(a=>a.type==='construct_draw'||a.type==='resource'));
 const action=g.a.legalActions(0).find(a=>a.type==='build'&&a.card==='engine'&&a.kind==='starbase');assert(action);
 const before=JSON.stringify(g.a.snapshotState());assert.throws(()=>g.a.applyAction(0,{...action,coord:'999,999'}),/Illegal/);assert.equal(JSON.stringify(g.a.snapshotState()),before);
 g.a.applyAction(0,action);assert.deepEqual(plain(g.p.hand.map(c=>c.id)),['drawn']);assert(g.p.inPlay.some(c=>c.id==='engine'));assert(!g.p.discard.some(c=>c.id==='engine'));assert.equal(g.s.planets[action.coord].upgrade,'starbase');assert.deepEqual(plain(g.p.resources),{matter:0,energy:0,biomass:0,data:0});
 assert.equal(g.a.observe(0).cardStats.worldEngine.draw,1,'Server policies see the printed draw');
 const resumed=game(g.a.snapshotState()),saved=JSON.stringify(resumed.a.snapshotState());assert.throws(()=>resumed.a.applyAction(0,action),/Illegal/);assert.equal(JSON.stringify(resumed.a.snapshotState()),saved);assert.equal(resumed.p.hand.filter(c=>c.id==='drawn').length,1);
}
{
 const g=game(),coord=g.s.clusters[0].coords[1];Object.assign(g.s.planets[coord],{owner:0,upgrade:'starbase'});g.s.fleets={[coord]:{1:{fleet:1}}};g.p.deck=[{id:'drawn',key:'signalRelay'}];
 const action=g.a.legalActions(0).find(a=>a.type==='build'&&a.card==='engine'&&a.kind==='fleet'&&a.coord===coord);assert(action);g.a.applyAction(0,action);
 assert(g.s.pendingCombat);assert.equal(g.p.hand.filter(c=>c.id==='drawn').length,1);assert(g.p.inPlay.some(c=>c.id==='engine'));
 const resumed=game(g.a.snapshotState());assert(resumed.s.pendingCombat);assert.equal(resumed.p.hand.filter(c=>c.id==='drawn').length,1);
}
console.log('World Engine: successful free build draws once after commitment; failed orders, conversion/draw-only, reshuffle, reload and pending combat preserve timing.');
