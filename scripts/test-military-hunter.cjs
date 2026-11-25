const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,'prototypes/galactic-reach',p),'utf8'),plain=x=>JSON.parse(JSON.stringify(x));
function game(){
  const c=vm.createContext({});let e,seed=1729,calls=0;
  const source=read('app.js').replace('      clone, deckContents,','      chooseAiBuild, chooseAiMove, aiFocusedMilitaryWorlds, aiBuyValue, aiColonyBuild, aiStorageBudget, aiManageStorage, aiModuleAllocation, findColonizeTarget, runAiRelic, clone, deckContents,');
  vm.runInContext(read('adapter.js')+source,c);const factory=c.createGalacticAdapter;c.createGalacticAdapter=p=>{e=p;return factory(p);};
  const a=c.createGalacticReach({headless:true,browserPolicy:true,random:()=>{calls++;return ((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);}}),s=e.state,p=s.players[1];
  s.activePlayer=1;s.phase='operations';s.fleets={};
  p.strategy='militaryFocused';p.hand=[{id:'build',key:'construct',starter:true}];p.deck=[];p.discard=[];p.inPlay=[];
  p.resources={matter:20,energy:20,biomass:20,data:20};p.resourceLimits={matter:20,energy:20,biomass:20,data:20};
  return {c,e,a,s,p,calls:()=>calls};
}
function yard(g,world){const at=world.coords.filter(c=>c!==world.center).sort((a,b)=>g.e.travelDistance(a,'0,0')-g.e.travelDistance(b,'0,0'))[0];Object.assign(g.s.planets[at],{owner:1,upgrade:'starbase'});return at;}
function second(g){const world=g.s.clusters[4];Object.assign(g.s.planets[world.center],{owner:1,originalFounder:1,hasColony:true});return world;}
function legal(g,move,card){g.p.hand=[card];const fresh=g.c.createGalacticAdapter(g.e);assert(fresh.legalActions(1).some(a=>a.type==='move'&&a.source===move.source&&a.destination===move.destination&&JSON.stringify(plain(a.units))===JSON.stringify(plain(move.units))),JSON.stringify(move));}
{
  const {c}=game(),original=c.createGalacticReach({headless:true}).snapshotState();assert(original.state.players.some(p=>p.strategy==='military'));assert(!original.state.players.some(p=>p.strategy==='militaryFocused'));
  const focused=c.createGalacticReach({headless:true,militaryFocused:true}).snapshotState();assert.equal(focused.state.players.filter(p=>p.strategy==='militaryFocused').length,1);
  const restored=c.createGalacticReach({headless:true,resume:focused}).snapshotState();assert.equal(restored.state.players[1].strategy,'militaryFocused');
}
{
  const g=game(),home=g.s.clusters[1];let build=g.e.chooseAiBuild(1);assert.equal(build.kind,'starbase');assert.equal(g.s.planets[build.coord].cluster,home.id);
  assert(g.e.constructAt(1,build.coord,build.kind));build=g.e.chooseAiBuild(1);assert.equal(build.kind,'settler');assert(g.e.constructAt(1,build.coord,build.kind));
  const card={id:'move',key:'move',starter:true,upgraded:true},move=g.e.chooseAiMove(1,card);assert(move);assert.equal(g.s.planets[move.goal].owner,null);legal(g,move,card);
  const world=g.s.clusters[4];g.s.fleets={[world.center]:{1:{settler:1}}};assert.equal(g.e.chooseAiMove(1,card),null,'Wait at the second Colony site');
  g.p.hand=[{id:'col',key:'colonize'}];g.e.runAiOperation();assert.equal(g.s.planets[world.center].owner,1);
  g.s.activePlayer=1;g.p.hand=[{id:'build2',key:'construct'}];build=g.e.chooseAiBuild(1);assert.equal(build.kind,'starbase');assert.equal(g.s.planets[build.coord].cluster,world.id);
  assert(g.e.constructAt(1,build.coord,build.kind));
  for(let n=0;n<4&&g.e.chooseAiBuild(1)?.kind==='harvester';n++){build=g.e.chooseAiBuild(1);assert(g.e.constructAt(1,build.coord,build.kind));}
  build=g.e.chooseAiBuild(1);assert.equal(build.kind,'fleet');assert.equal(g.s.planets[build.coord].cluster,world.id);
}
{
  const g=game(),world=second(g);yard(g,g.s.clusters[1]);const forward=yard(g,world),third=g.s.clusters[5];
  g.s.fleets={[third.center]:{1:{settler:1}},[forward]:{1:{fleet:4}}};
  assert.equal(g.e.findColonizeTarget(1),null);assert(!g.e.chooseAiBuild(1,true).some(b=>['settler','explorer'].includes(b.kind)));
  g.p.hand=[{id:'col',key:'colonize'}];g.e.runAiOperation();assert.equal(g.s.planets[third.center].owner,null,'Spare Colonize never founds a third world');
  Object.assign(g.s.planets[world.center],{owner:2});assert(g.e.aiFocusedMilitaryWorlds(1).forward);assert.equal(g.e.findColonizeTarget(1),null,'Losing the forward world does not restart expansion');
}

{
  const g=game(),world=second(g);yard(g,g.s.clusters[1]);const forward=yard(g,world),card={id:'move',key:'move',starter:true,upgraded:true};
  g.s.fleets={[forward]:{1:{fleet:4}},'0,0':{0:{settler:1}}};let move=g.e.chooseAiMove(1,card);assert.equal(move,null,'Four wait for a complete hunting group');
  g.s.fleets[forward][1].fleet=10;move=g.e.chooseAiMove(1,card);assert.equal(move.goal,'0,0');assert.equal(move.units.fleet,10,'Keep a larger hunting group together');legal(g,move,card);
  const before=JSON.stringify(g.s),calls=g.calls(),hand=g.s.players[0].hand;g.s.players[0].hand=[{id:'secret',key:'phaseLance'}];g.s.players[0].deck.reverse();
  assert.deepEqual(plain(g.e.chooseAiMove(1,card)),plain(move),'Hunting ignores enemy private cards');assert.equal(g.calls(),calls);
  g.s.players[0].hand=hand;assert(JSON.stringify(g.s)===before,'Planning does not mutate the position');
  g.s.fleets={[forward]:{1:{fleet:5}}};assert.equal(g.e.chooseAiMove(1,card),null,'Do not patrol empty enemy worlds');
}
{
  const g=game(),card={id:'move',key:'move',starter:true,upgraded:true};second(g);
  g.s.fleets={'0,0':{1:{fleet:5}},'2,0':{0:{fleet:1}},'0,2':{2:{fleet:3}}};g.s.players[2].combatVictories=5;
  const move=g.e.chooseAiMove(1,card);assert.equal(move.goal,'2,0','Prefer a weaker group over the stronger leader');legal(g,move,card);
  g.s.fleets['2,0']={0:{explorer:2}};g.s.players[0].resources.energy=1;
  assert.equal(g.e.chooseAiMove(1,card).goal,'0,2','Prefer a decisive fight over Explorers that can escape');
  g.s.fleets['0,2']={2:{fleet:10}};delete g.s.fleets['2,0'];assert.equal(g.e.chooseAiMove(1,card),null,'Do not attack an overwhelming group');
}
{
  const g=game(),world=second(g),forward=yard(g,world),card={id:'move',key:'move',starter:true,upgraded:true};
  g.s.fleets={'0,0':{1:{fleet:3}},'3,0':{1:{fleet:3}}};
  const move=g.e.chooseAiMove(1,card);assert(move);assert.equal(move.units.fleet,3,'Merge the incomplete groups when no useful scoring fight is available');legal(g,move,card);
  g.s.fleets={'0,0':{1:{fleet:4}}};assert.equal(g.e.chooseAiMove(1,card).goal,forward,'Survivors return for reinforcement');
}
{
  const g=game();g.p.strategy='militaryFocused';
  const piece=(type,power,hull)=>({type,power,hull,damage:0});
  const view={stage:'tactic',side:'attacker',volley:1,sides:{attacker:{playerId:1,pieces:Array.from({length:3},()=>piece('fleet',3,7)),used:[]},defender:{playerId:0,pieces:[piece('settler',1,4)],used:[],available:{concentratedFire:2,defensiveScreen:2}}}};
  const actions=[{type:'combat_tactic',tactic:'novaBarrage'},{type:'combat_tactic',tactic:'victoryDoctrine'}];
  assert.equal(g.e.chooseCombatAction(view,actions).tactic,'victoryDoctrine','Use the combat reward in a safe decisive fight');
  g.p.strategy='military';assert.equal(g.e.chooseCombatAction(view,actions).tactic,'novaBarrage','Original Military tactic choices are unchanged');
}
{
  const g=game(),world=second(g);yard(g,g.s.clusters[1]);const forward=yard(g,world);g.s.fleets={[forward]:{1:{fleet:10}}};
  let builds=0;
  for(let n=0;n<20;n++){
    g.p.resources={matter:20,energy:20,biomass:20,data:20};const build=g.e.chooseAiBuild(1);if(!build)break;
    assert.equal(build.kind,'harvester');assert([g.s.clusters[1].id,world.id].includes(g.s.planets[build.coord].cluster));
    assert(g.e.constructAt(1,build.coord,build.kind));builds++;
  }
  assert.equal(builds,10,'Fill all five remaining sites on both worlds');assert.equal(g.e.chooseAiBuild(1),null);
  g.s.phase='buy';g.p.resources={matter:4,energy:4,biomass:4,data:4};g.p.resourceLimits={matter:4,energy:4,biomass:4,data:4};
  assert(g.e.aiStorageBudget(1));assert(g.e.aiManageStorage(1));assert.equal(g.p.storagePurchases,1);assert(!g.e.aiManageStorage(1),'Do not pile up unplayed modules');
  const module=g.p.discard.find(c=>c.key==='capacityModule');g.p.discard=[];g.p.hand=[module];g.s.phase='operations';const before=g.e.playerCapacity(1);
  g.e.runAiOperation();assert.equal(g.e.playerCapacity(1),before+4);assert.equal(g.p.storage.length,1);
  assert(g.e.aiBuyValue(1,'signalRelay')>0);assert(g.e.aiBuyValue(1,'exchangeProtocol')>0);assert(g.e.aiBuyValue(1,'railBattery')>0);
  assert(g.e.aiBuyValue(1,'monumentOfAccord')<0);assert(g.e.aiBuyValue(1,'genesisCharter')<0,'No continued Colony purchases');
}
{
  const g=game(),world=second(g);yard(g,g.s.clusters[1]);const forward=yard(g,world);g.s.fleets={[forward]:{1:{fleet:5}}};
  g.p.hand=[];g.s.phase='buy';g.s.market=[{id:'draw',key:'signalRelay'},{id:'trade',key:'exchangeProtocol'},{id:'tactic',key:'railBattery'},{id:'points',key:'monumentOfAccord'}];
  for(const pile of Object.values(g.s.marketDecks))pile.length=0;
  g.e.runAiBuy();assert(g.p.discard.some(c=>c.id==='draw'));assert(g.p.discard.some(c=>c.id==='trade'));assert(g.p.military.some(c=>c.id==='tactic'));assert(g.s.market.some(c=>c.id==='points'));
}
{
  const g=game(),world=second(g);yard(g,g.s.clusters[1]);const forward=yard(g,world);
  for(const w of [g.s.clusters[1],world])for(const at of w.coords)if(at!==w.center&&!g.s.planets[at].upgrade)Object.assign(g.s.planets[at],{owner:1,upgrade:'harvester'});
  g.p.resources={matter:0,energy:2,biomass:8,data:1};g.p.hand=[{id:'exchange',key:'exchangeProtocol'},{id:'build',key:'construct'}];
  assert.equal(g.e.aiExchangeResource(1),'biomass','Trade excess Life to fund forward Fleet production');assert(g.e.aiTryExchange(1));
  g.s.activePlayer=1;g.e.runAiOperation();assert.equal(g.s.fleets[forward][1].fleet,1);assert.equal(g.p.resources.biomass,4);
}
{
  const g=game(),world=second(g);yard(g,world);g.p.hand=[{id:'worldseed',key:'worldseed'}];assert(!g.e.runAiRelic(1),'A free Colony cannot bypass the two-world plan');
  g.s.activePlayer=1;g.s.pendingColonyBuild={playerId:1,colony:world.center};g.e.aiColonyBuild(1);
  assert.equal(world.coords.filter(c=>g.s.planets[c].upgrade==='starbase').length,1,'Bonus construction cannot add another forward Shipyard');
}
console.log('Military Focused: one expansion, forward supply/production, cohesive five-to-ten-Fleet groups, weaker targets, legal regrouping, private information, both worlds filled, capacity, combat-reward tactics and original-policy isolation passed.');
