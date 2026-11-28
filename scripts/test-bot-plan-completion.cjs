const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),plain=x=>JSON.parse(JSON.stringify(x));
function game(strategy='economy') {
  const c=vm.createContext({});let e,seed=73,calls=0;
  const source=fs.readFileSync(process.env.GR_BOT_POLICY_SOURCE||path.join(root,'prototypes/galactic-reach/app.js'),'utf8')
    .replace('      clone, deckContents,','      chooseAiMove, chooseAiBuild, aiBuyInvestment, aiImmediateProtection, clone, deckContents,');
  vm.runInContext(fs.readFileSync(path.join(root,'prototypes/galactic-reach/adapter.js'),'utf8')+source,c);
  const original=c.createGalacticAdapter;c.createGalacticAdapter=port=>{e=port;return original(port);};
  c.createGalacticReach({headless:true,browserPolicy:true,random:()=>{calls++;return ((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);}});
  const s=e.state,p=s.players[1];s.round=9;s.activePlayer=1;s.phase='operations';s.fleets={};s.market=[];
  s.players.forEach(p=>{p.hand=[];p.deck=[];p.discard=[];p.inPlay=[];});p.strategy=strategy;
  p.resources={matter:4,energy:4,biomass:4,data:8};p.resourceLimits={matter:4,energy:4,biomass:4,data:8};
  const move={id:'move',key:'move',starter:true,upgraded:true,level:2};
  p.hand=[move,{id:'colony',key:'colonize'}];
  const world=name=>s.clusters.find(w=>w.name===name);
  return {c,e,s,p,move,world,calls:()=>calls};
}
function legal(g,move){
  const a=g.c.createGalacticAdapter(g.e);
  assert(a.legalActions(1).some(x=>x.type==='move'&&x.source===move.source&&x.destination===move.destination&&JSON.stringify(plain(x.units))===JSON.stringify(plain(move.units))),JSON.stringify(move));
}
function expansion(){
  const g=game(),juno=g.s.clusters.find(w=>w.center==='6,-3'),fornax=g.s.clusters.find(w=>w.center==='3,-6');
  Object.assign(g.s.planets[fornax.center],{owner:0,hasColony:true});g.s.players[0].combatVictories=10;
  g.s.fleets={'6,-2':{1:{settler:1,fleet:1}},[fornax.center]:{0:{fleet:1}}};
  return {...g,juno,fornax};
}
test('Settlers complete a safe payable neutral Colony before a distant capture',()=>{
  const g=expansion(),move=g.e.chooseAiMove(1,g.move);
  assert.equal(move.goal,g.juno.center);assert.equal(move.destination,g.juno.center);legal(g,move);
  assert(g.e.performMoveOrder(1,move.source,move.destination,g.move,{moveGroup:move.moveGroup,units:move.units}));
  g.s.activePlayer=1;g.s.phase='operations';g.e.runAiOperation();
  assert.equal(g.s.planets[g.juno.center].owner,1,'The plan can actually be completed with the held Colonize and payment');
});
test('Settlers do not assume a missing Colonize or an unpayable forecast',()=>{
  for(const missing of ['order','payment']){
    const g=expansion();
    if(missing==='order')g.p.hand=[g.move];
    else g.p.resources={matter:0,energy:0,biomass:0,data:0};
    const move=g.e.chooseAiMove(1,g.move);assert(move);assert(!move.readySettlement);
    assert.equal(move.goal,g.fornax.center,'A speculative neutral settlement does not veto other plans');
  }
});
test('Nearby settlement protects partial Life and forecasts production without spending it',()=>{
  const g=expansion(),home=g.s.clusters[1],yard=home.coords[6];
  Object.assign(g.s.planets[yard],{owner:1,upgrade:'starbase'});
  const life=home.coords.find(at=>g.s.planets[at].type==='biomass');
  Object.assign(g.s.planets[life],{owner:1,upgrade:'harvester'});
  g.p.resources={matter:3,energy:0,biomass:2,data:1};
  g.p.deck=[{id:'established',key:'construct',starter:true,upgraded:true,level:2}];
  g.s.market=[{id:'draw',key:'livingArchives'}];
  const before=JSON.stringify(g.s),move=g.e.chooseAiMove(1,g.move);
  assert.equal(move.goal,g.juno.center);assert.equal(JSON.stringify(g.s),before,'A forecast does not credit production');
  assert.equal(g.e.aiImmediateProtection(1).biomass,3);
  g.s.phase='buy';g.e.runAiBuy();assert.equal(g.p.resources.biomass,2,'Draw purchases and upgrades preserve the partial Colony payment');
  assert(!g.p.discard.some(c=>c.id==='draw'));
  g.s.phase='operations';g.s.activePlayer=1;
  assert(g.e.performMoveOrder(1,move.source,move.destination,g.move,{moveGroup:move.moveGroup,units:move.units}));
  g.s.phase='operations';g.s.activePlayer=1;
  assert.equal(g.e.applyColonizeOrder(1,g.juno.center,g.p.hand.find(c=>c.key==='colonize')),false,'Expected income cannot pay an actual Colony early');
  assert.equal(g.s.planets[g.juno.center].owner,null);assert.equal(g.p.resources.biomass,2);
});
test('Settlers do not mark an exposed neutral Colony as ready',()=>{
  const g=expansion();g.s.fleets['7,-3']={2:{fleet:5}};
  const move=g.e.chooseAiMove(1,g.move);assert(!move?.readySettlement);if(move)legal(g,move);
});
test('A feasible capture in this Move can still outrank nearby neutral expansion',()=>{
  const g=game('expansion'),neutral=g.s.clusters.find(w=>w.center==='0,0'),capture=g.s.clusters.find(w=>w.center==='3,3');
  Object.assign(g.move,{key:'ionThrusters',starter:false,upgraded:false});g.s.players[0].combatVictories=10;
  Object.assign(g.s.planets[capture.center],{owner:0,hasColony:true});
  g.s.fleets={'1,2':{1:{settler:1,fleet:1}}};
  const move=g.e.chooseAiMove(1,g.move);assert.equal(g.s.planets[neutral.center].owner,null);
  assert.equal(move.goal,capture.center);assert.equal(move.destination,capture.center);legal(g,move);
});
test('Leader pressure counts ownership and the same faction ships once',()=>{
  const g=game('military'),goal=g.world('Juno').center;
  g.p.hand=[g.move];g.s.players[0].combatVictories=10;
  g.s.fleets={'4,-3':{1:{fleet:3}},[goal]:{0:{fleet:1}}};
  Object.assign(g.s.planets[goal],{owner:0,hasColony:true});
  const owned=g.e.chooseAiMove(1,g.move);assert.equal(owned.goal,goal);
  g.s.planets[goal].owner=null;
  const occupied=g.e.chooseAiMove(1,g.move);assert.equal(occupied.goal,goal);
  assert.equal(owned.score,occupied.score);
});
test('Reinforcement does not reverse an unchanged retreat into the same threat',()=>{
  const g=game('expansion'),icarus=g.world('Icarus');
  Object.assign(g.s.planets[icarus.center],{owner:1,hasColony:true});
  g.p.hand=[g.move];g.move.level=3;
  g.s.fleets={[icarus.center]:{1:{fleet:2}},[icarus.coords[6]]:{0:{fleet:3}}};
  const retreat=g.e.chooseAiMove(1,g.move);assert(retreat);assert.notEqual(retreat.destination,icarus.center);legal(g,retreat);
  delete g.s.fleets[icarus.center];g.s.fleets[retreat.destination]={1:{fleet:2}};
  const next=g.e.chooseAiMove(1,g.move);assert.notEqual(next?.goal,icarus.center);
  g.s.fleets[retreat.destination][1].fleet=4;
  const reinforced=g.e.chooseAiMove(1,g.move);assert.equal(reinforced.goal,icarus.center,'A sufficient changed force can return');legal(g,reinforced);
  g.s.fleets[retreat.destination][1].fleet=2;g.s.fleets[icarus.center]={1:{fleet:2}};
  const combined=g.e.chooseAiMove(1,g.move);assert.equal(combined.goal,icarus.center,'Standing guards count toward a sufficient combined defense');legal(g,combined);
});
function military(){
  const g=game('militaryFocused'),home=g.s.clusters[1],forward=g.world('Juno');
  Object.assign(g.s.planets[forward.center],{owner:1,originalFounder:1,hasColony:true});
  for(const w of [home,forward])for(const at of w.coords.slice(1))Object.assign(g.s.planets[at],{owner:1,upgrade:at===w.coords[6]?'starbase':'harvester'});
  g.p.resources={matter:4,energy:4,biomass:4,data:4};g.p.resourceLimits={matter:4,energy:4,biomass:4,data:4};
  g.p.hand=[{id:'construct',key:'construct',starter:true,upgraded:true,level:3}];
  g.p.deck=[{id:'move-II',key:'move',starter:true,upgraded:true,level:2}];
  g.s.market=[{id:'aegis',key:'aegisLattice'}];
  return {...g,home,forward};
}
test('Military purchases survive routine high-priority builds and their trade goals',()=>{
  const g=military(),investment=g.e.aiBuyInvestment(1);assert.equal(investment.key,'capacityModule');
  assert.deepEqual(plain(investment.cost),{matter:1,energy:1,biomass:1,data:1},'Routine future construction is not an emergency reserve');
  const build=g.e.chooseAiBuild(1);assert.equal(build.kind,'fleet','A Fleet can use surplus beyond the real purchase price');
  const goals=g.e.aiTradeGoals(1).filter(x=>x.kind==='build');assert(goals.length);
  assert(goals.every(x=>JSON.stringify(x.keep)===JSON.stringify(investment.cost)),'Indirect build funding protects the same payment');
  assert(g.e.performConstructOrder(1,build.coord,build.kind,g.p.hand[0]));
  assert.equal(g.e.chooseAiBuild(1),null,'A second Fleet cannot consume the Module payment');
  g.s.pendingConstruct=null;g.s.activePlayer=1;
  g.s.phase='buy';g.e.runAiBuy();assert(g.p.discard.some(c=>c.key==='capacityModule'));
});
test('Military second builds preserve the same payment; free builds can proceed',()=>{
  const g=military();g.s.pendingConstruct={playerId:1};g.p.hand=[];
  g.p.resources.matter=2;g.p.resources.energy=2;
  g.p.deck.push({id:'established',key:'construct',starter:true,upgraded:true,level:3});
  assert.equal(g.e.aiBuyInvestment(1).key,'capacityModule');assert.equal(g.e.chooseAiBuild(1),null);
  g.s.pendingConstruct=null;g.p.hand=[{id:'free',key:'worldEngine'}];
  const build=g.e.chooseAiBuild(1);assert(build);assert(Object.values(build.cost).every(n=>n===0));
});
test('Real emergency defense still precedes useful purchase savings',()=>{
  const g=game('economy'),home=g.s.clusters[1],yard=home.coords[6];
  Object.assign(g.s.planets[yard],{owner:1,upgrade:'starbase'});
  g.s.fleets={[home.coords[1]]:{0:{fleet:2}}};
  g.p.resources={matter:5,energy:5,biomass:4,data:4};g.p.resourceLimits={matter:8,energy:8,biomass:8,data:8};
  g.p.hand=[{id:'build',key:'construct',starter:true,upgraded:true,level:2}];g.s.market=[{id:'draw',key:'tacticalBriefing'}];
  const build=g.e.chooseAiBuild(1);assert.equal(build.kind,'fleet');assert(build.urgent);assert(build.funding);
  const focused=military();focused.s.fleets={[focused.forward.coords[1]]:{0:{fleet:2}}};
  assert(focused.e.aiBuyInvestment(1),'The emergency really competes with a payable purchase');
  const defender=focused.e.chooseAiBuild(1);assert.equal(defender.kind,'fleet');assert(defender.urgent);assert(defender.funding);
});
test('Military opening infrastructure retains its actual protected payment',()=>{
  const g=military(),at=g.forward.coords[6];g.s.planets[at].upgrade=null;
  const protection=g.e.aiImmediateProtection(1);
  assert.deepEqual(plain(protection),{matter:2,energy:2,biomass:0,data:1});
  const build=g.e.chooseAiBuild(1);assert.equal(build.kind,'starbase');assert(build.urgent);
});
test('Military can buy an exact-price useful tactic without reserving an extra routine Fleet',()=>{
  const g=military();g.s.fleets={[g.forward.coords[6]]:{1:{fleet:2}}};
  g.p.resources={matter:5,energy:0,biomass:0,data:0};g.p.resourceLimits.matter=5;
  g.s.market=[{key:'railBattery',id:'rail'}];
  assert.deepEqual(plain(g.e.aiImmediateProtection(1)),{matter:0,energy:0,biomass:0,data:0});
  g.s.phase='buy';g.e.runAiBuy();assert(g.p.military.some(c=>c.id==='rail'));
});
test('Planning is pure, ignores enemy private cards and does not inspect own deck order',()=>{
  const g=expansion();g.p.deck=[{key:'construct',id:'a'},{key:'move',id:'b'}];
  const before=JSON.stringify(g.s),calls=g.calls(),move=plain(g.e.chooseAiMove(1,g.move));
  assert.equal(JSON.stringify(g.s),before);assert.equal(g.calls(),calls);
  g.s.players[0].hand=[{key:'novaBarrage',id:'secret'}];g.s.players[0].deck.reverse();g.p.deck.reverse();
  assert.deepEqual(plain(g.e.chooseAiMove(1,g.move)),move);assert.equal(g.calls(),calls);
});
test('Ascendancy Codex keeps its cost, scoring and draw effect',()=>{
  const g=game(),def=g.e.ALL_CARDS.ascendancyCodex;
  assert.deepEqual(plain(def.cost),{energy:2,biomass:4,data:8});
  assert.deepEqual(plain(def.effect),{prestige:2,draw:1});
  assert.equal(def.text,'Gain 2 permanent Prestige, then draw one card.');
});
