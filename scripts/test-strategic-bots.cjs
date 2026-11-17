const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=n=>fs.readFileSync(path.join(__dirname,'../prototypes/galactic-reach',n),'utf8');
const plain=x=>JSON.parse(JSON.stringify(x));
function game(strategy='economy') {
  const c=vm.createContext({});
  const source=read('app.js').replace('      clone, deckContents,','      runAiBuy, runAiOperation, bankPlanForCost, chooseAiBuild, chooseAiMove, aiTargetCard, aiBuyValue, aiCardUtility, aiColonyDefense, clone, deckContents,');
  vm.runInContext(read('adapter.js')+source,c);
  let e,seed=73;const f=c.createGalacticAdapter;c.createGalacticAdapter=x=>{e=x;return f(x);};
  const a=c.createGalacticReach({headless:true,random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32)});
  const s=e.state,p=s.players[1],home=s.clusters[1].center,yard=s.clusters[1].coords[6];
  s.activePlayer=1;s.phase='operations';s.fleets={};s.market=[];p.strategy=strategy;
  s.players.forEach(p=>{p.hand=[];p.deck=[];p.discard=[];p.inPlay=[];});
  p.resources={matter:20,energy:20,biomass:20,data:20};p.resourceLimits={matter:50,energy:50,biomass:50,data:50};
  Object.assign(s.planets[yard],{owner:1,upgrade:'starbase'});
  return {e,a,s,p,home,yard};
}
// All profiles can progress II -> III in every legal pile, with actual escalating upgrade prices.
for(const strategy of ['military','economy','expansion','market']) {
  const g=game(strategy);g.s.phase='buy';
  g.p.hand=[{id:'hand',key:'move',starter:true,upgraded:true,level:2}];
  g.p.inPlay=[{id:'play',key:'construct',starter:true,upgraded:true,level:2}];
  g.p.discard=[{id:'discard',key:'move',starter:true,upgraded:true,level:2}];
  const before=Object.values(g.p.resources).reduce((a,b)=>a+b,0);g.e.runAiBuy();
  assert([...g.p.hand,...g.p.inPlay,...g.p.discard].every(c=>c.level===3));
  assert.equal(before-Object.values(g.p.resources).reduce((a,b)=>a+b,0),9);
}
{
  const g=game();g.s.phase='buy';g.p.hand=[{id:'upgrade',key:'move',starter:true,upgraded:true,level:2}];
  const relic=Object.entries(g.s.planets).find(([,p])=>p.special==='relic');g.s.fleets={[relic[0]]:{1:{explorer:1}}};
  g.p.resources={matter:1,energy:1,biomass:0,data:2};const before=plain(g.p.resources);
  g.e.runAiBuy();assert.equal(g.p.hand[0].level,2);assert.deepEqual(plain(g.p.resources),before,'Keep the next excavation payment');
}
// A bank plan prefers a give-type that keeps the reserve, so preservesPayment need not reject an affordable card.
{
  const g=game();g.p.resources={matter:6,energy:5,biomass:0,data:0};
  assert.deepEqual(plain(g.e.bankPlanForCost(g.p,{data:1})),[{giveType:'matter',getType:'data'}],'Unreserved plans are unchanged');
  assert.deepEqual(plain(g.e.bankPlanForCost(g.p,{data:1},{matter:3,energy:1})),[{giveType:'energy',getType:'data'}],'Spare Energy pays instead of reserved Matter');
  assert.deepEqual(plain(g.e.bankPlanForCost(g.p,{data:1},{matter:3,energy:3})),[{giveType:'matter',getType:'data'}],'A reserve never blocks a plan');
}
// A threat at a Colony must prompt defense even though it is not standing on the Shipyard.
for(const strategy of ['military','economy','expansion']) {
  const g=game(strategy);g.s.fleets={'0,-6':{0:{fleet:2}}};g.p.hand=[{id:'guard',key:'construct'}];
  const build=g.e.chooseAiBuild(1);assert.equal(build.kind,'fleet');assert(build.score>=70);
  g.e.runAiOperation();assert(Object.values(g.s.fleets).some(g=>g[1]?.fleet>0));
}
{
  const g=game();g.s.fleets={'0,-6':{0:{fleet:2}},'0,-7':{1:{fleet:3}}};
  const m=g.e.chooseAiMove(1,{key:'move',upgraded:true});assert(m);assert.equal(m.goal,g.home);assert.equal(m.units.fleet,3);
  g.s.fleets={'0,-6':{0:{fleet:2}},[g.home]:{1:{fleet:3}}};
  const raid=g.e.chooseAiMove(1,{key:'move',upgraded:true});assert(!raid||raid.source!==g.home,'Do not abandon a defended center for a raid');
}
{
  const g=game();g.s.planets['8,-10']={...g.s.planets[g.home],hasColony:true,owner:1};g.s.fleets={'-10,8':{0:{fleet:2}}};
  assert(g.e.aiColonyDefense(1).some(d=>d.coord==='8,-10'&&d.attackers===2),'Portal approach counts as a threat');
}
{
  const g=game();g.p.hand=Array.from({length:6},(_,i)=>({id:'starter'+i,key:i<3?'move':'construct',starter:true}));
  const freeBuild=g.e.aiBuyValue(1,'worldEngine'),discount=g.e.ALL_CARDS.worldEngine.buildDiscount;g.e.ALL_CARDS.worldEngine.buildDiscount=null;assert(g.e.aiBuyValue(1,'worldEngine')<freeBuild,'Removing the printed free build lowers its value');g.e.ALL_CARDS.worldEngine.buildDiscount=discount;
  assert(g.e.aiBuyValue(1,'seedArk')<g.e.aiBuyValue(1,'signalRelay'),'No Settler means little value in another Colonize card');
  const before=g.e.aiBuyValue(1,'signalRelay');g.p.discard.push({id:'owned',key:'signalRelay'});assert(g.e.aiBuyValue(1,'signalRelay')<before);
}
{
  const g=game('military'),site=Object.entries(g.s.planets).find(([,p])=>p.special==='relic');
  g.s.clusters[site[1].cluster].scannedBy.push(1);g.s.fleets={[site[0]]:{1:{explorer:1}}};
  g.p.hand=[{id:'dig',key:'probe'}];g.s.relicRow=[{id:'role',key:'warSongOfHollowStars'},{id:'draw',key:'foldedWarehouse'}];
  g.e.runAiOperation();assert(g.p.discard.some(c=>c.key==='foldedWarehouse'),'Reward effects outweigh a weak affinity match');
}
{
  const g=game();g.p.resourceLimits={matter:4,energy:4,biomass:4,data:4};g.p.resources={matter:4,energy:4,biomass:4,data:4};
  g.p.hand=[{id:'cantrip',key:'move',starter:true,upgraded:true,level:3}];
  g.p.deck=[{id:'points',key:'ascendancyCodex'},{id:'draw',key:'signalRelay'}];
  g.e.runAiOperation();assert(!g.p.inPlay.some(c=>c.id==='cantrip'));assert(g.p.hand.some(c=>c.id==='cantrip'));
  assert.deepEqual(plain(g.p.deck.map(c=>c.id)),['points','draw'],'A level III card cannot convert to draw without a legal order');
}
{
  const g=game();g.s.fleets={'0,-6':{0:{fleet:2}}};g.p.hand=[{id:'build',key:'construct'}];
  const before=plain({build:g.e.chooseAiBuild(1),defense:g.e.aiColonyDefense(1),value:g.e.aiBuyValue(1,'signalRelay')});
  g.s.players[0].hand=[{id:'secret',key:'novaBarrage'}];g.s.players[0].deck.reverse();
  assert.deepEqual(plain({build:g.e.chooseAiBuild(1),defense:g.e.aiColonyDefense(1),value:g.e.aiBuyValue(1,'signalRelay')}),before,'No enemy hand or deck-order access');
}
{
  const g=game(),stats=g.a.observe(1).cardStats;
  assert.equal(stats.signalRelay.draw,2);assert.equal(stats.ascendancyCodex.prestige,2);
  g.s.players[0].hand=[{id:'private-hand-identifier',key:'novaBarrage'}];
  assert.deepEqual(plain(g.a.observe(1).cardStats),plain(stats),'Printed card metadata is independent of private ownership');
  assert(!JSON.stringify(stats).includes('private-hand-identifier'));
}
// A useful Harvester remains an investment after the old minimum income is met.
{
  const g=game('military');g.s.round=5;
  for(const type of ['matter','energy','biomass','data']){
    const site=Object.entries(g.s.planets).find(([coord,p])=>coord!==g.home&&coord!==g.yard&&p.type===type&&p.owner===null);
    Object.assign(site[1],{owner:1,upgrade:'harvester'});
  }
  g.s.fleets={[g.yard]:{1:{fleet:5,settler:1,explorer:1}}};
  g.p.hand=[{id:'investment-build',key:'construct',starter:true,upgraded:true,level:3}];
  assert.equal(g.e.chooseAiBuild(1)?.kind,'harvester','Production can grow beyond the opening minimum');
  g.s.round=20;g.p.cardPrestige=36;
  assert.notEqual(g.e.chooseAiBuild(1)?.kind,'harvester','Do not invest when the race is about to end');
}
// A market-focused rival buys a useful affordable card before upgrades exhaust its budget.
{
  const g=game('market');g.s.phase='buy';
  g.p.resources={matter:2,energy:3,biomass:0,data:1};
  g.p.resourceLimits={matter:4,energy:4,biomass:4,data:4};
  g.p.inPlay=[{id:'build-engine',key:'construct',starter:true,upgraded:true,level:2}];
  g.p.hand=[{id:'move-engine',key:'move',starter:true,upgraded:true,level:2}];
  g.s.market=[{id:'useful-draw',key:'signalRelay'}];
  g.e.runAiBuy();
  assert(g.p.discard.some(c=>c.id==='useful-draw'),'Purchase competes with starter upgrades');
  assert.equal(g.p.cardsPurchased,1);
}
// A costly distant target must not hide a useful near-term card from capacity planning.
{
  const g=game();g.p.resources={matter:0,energy:2,biomass:0,data:1};
  g.p.resourceLimits={matter:4,energy:4,biomass:4,data:4};
  g.s.market=[{id:'far',key:'ascendancyCodex'},{id:'near',key:'signalRelay'}];
  assert.equal(g.e.aiTargetCard(1).id,'near');
}
console.log('Strategic rivals: upgrades, scoring reserves, defense, useful cards/rewards, production investment, market-first budgeting, reachable targets and privacy passed.');

{
 const g=game();g.p.resources={matter:2,energy:2,biomass:8,data:0};g.p.hand=[{id:'bank',key:'exchangeProtocol'}];
 assert.equal(g.e.aiExchangeResource(1),'biomass','A held surplus can fund a real missing-resource trade');
 g.p.resources.biomass=1;assert.equal(g.e.aiExchangeResource(1),null,'Next round production is not current stock');
 g.p.resources={matter:50,energy:50,biomass:50,data:50};assert.equal(g.e.aiExchangeResource(1),null,'No spending deficit means no wasted exchange order');
 g.p.resources={matter:2,energy:2,biomass:8,data:0};g.p.bankExchangeResources=['biomass'];assert.equal(g.e.aiExchangeResource(1),null,'Use the already active discount first');
 g.p.resources.energy=8;const plan=g.e.bankPlanForCost(g.p,{data:1});assert.equal(plan[0].giveType,'biomass','Prefer2:1to an available4:1giver');
}
