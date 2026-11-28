// Budget regressions motivated by the three complete human-win reports.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),plain=x=>JSON.parse(JSON.stringify(x));
function game(strategy='economy') {
  const context=vm.createContext({});let e,calls=0,seed=73;
  const source=fs.readFileSync(path.join(root,'prototypes/galactic-reach/app.js'),'utf8')
    .replace('      clone, deckContents,','      aiBuyInvestment, chooseAiBuild, aiTargetCard, aiBuyValue, clone, deckContents,');
  vm.runInContext(fs.readFileSync(path.join(root,'prototypes/galactic-reach/adapter.js'),'utf8')+source,context);
  const original=context.createGalacticAdapter;context.createGalacticAdapter=port=>{e=port;return original(port);};
  context.createGalacticReach({headless:true,random:()=>{calls++;return ((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);}});
  const s=e.state,p=s.players[1],home=s.clusters[1],yard=home.coords[6];
  s.round=6;s.activePlayer=1;s.phase='operations';s.fleets={};s.market=[];s.capacitySupply=20;
  s.players.forEach(p=>{p.hand=[];p.deck=[];p.discard=[];p.inPlay=[];});p.strategy=strategy;
  Object.assign(s.planets[yard],{owner:1,upgrade:'starbase'});
  p.resources={matter:2,energy:2,biomass:2,data:2};p.resourceLimits={matter:4,energy:4,biomass:4,data:4};
  p.hand=[{id:'construct-II',key:'construct',starter:true,upgraded:true,level:2}];
  p.deck=[{id:'move-I',key:'move',starter:true},{id:'construct-I',key:'construct',starter:true},
    {id:'move-b',key:'move',starter:true},{id:'move-c',key:'move',starter:true},{id:'construct-b',key:'construct',starter:true}];
  return {e,s,p,home,yard,calls:()=>calls};
}
// The actual round-9 Economy stock in the round-15 report. All broad profiles
// must consider the useful draw before more upgrades spend its payment.
for(const profile of ['economy','expansion','military','market','maxbot']) {
  const g=game(profile);g.s.round=9;g.s.phase='buy';g.p.resources={matter:4,energy:3,biomass:3,data:2};
  g.p.inPlay=g.p.deck.splice(0);Object.assign(g.p.inPlay[0],{upgraded:true,level:2});
  g.s.market=[{id:'draw',key:'surveyNetwork'}];g.e.runAiBuy();
  assert(g.p.discard.some(c=>c.id==='draw'),`${profile} buys the affordable draw before more upgrades`);
}
// A module toward Codex comes before repeated upgrades, and uses its real price.
for(const profile of ['economy','expansion','military']) {
  const g=game(profile);g.p.resources={matter:1,energy:2,biomass:2,data:3};g.s.market=[{id:'codex',key:'ascendancyCodex'}];
  assert.equal(g.e.aiBuyInvestment(1)?.key,'capacityModule');g.s.phase='buy';g.e.runAiBuy();
  assert(g.p.discard.some(c=>c.key==='capacityModule'));assert.equal(g.s.capacitySupply,19);
  assert(!g.p.discard.some(c=>c.id==='codex'),'Raising capacity still requires drawing and playing the module');
}
// Held purchase payments survive ordinary commissions and their bank-trade goals.
{
  const g=game();g.s.market=[{id:'draw',key:'tacticalBriefing'}];g.p.resources.matter=1;
  const before=JSON.stringify(g.s),calls=g.calls();
  assert.equal(g.e.aiBuyInvestment(1)?.key,'tacticalBriefing');
  assert.equal(g.e.chooseAiBuild(1),null,'Defer commissions that would spend the draw payment');
  const goals=g.e.aiTradeGoals(1).filter(x=>x.kind==='build'&&x.priority<100);
  assert(goals.every(x=>x.keep?.data>=2),'Exchange plans cannot spend the protected payment indirectly');
  assert.equal(JSON.stringify(g.s),before);assert.equal(g.calls(),calls,'Planning consumes no randomness');
  g.s.market=[];assert(g.e.chooseAiBuild(1),'Reconsider after the target leaves the market');
}
// A free World Engine build can proceed without consuming the payment.
{
  const g=game();g.p.deck.push(g.p.hand.pop());g.p.hand=[{id:'free',key:'worldEngine'}];
  g.s.market=[{id:'draw',key:'tacticalBriefing'}];const build=g.e.chooseAiBuild(1);
  assert(build);assert.equal(build.discount,'free');assert(Object.values(build.cost).every(x=>x===0));
}
// A needed capacity payment likewise survives construction, but an unplayed module
// or a missing supply never reserves money for a second one.
{
  const g=game();g.s.market=[{id:'codex',key:'ascendancyCodex'}];
  assert.equal(g.e.aiBuyInvestment(1)?.key,'capacityModule');
  g.p.resources={matter:1,energy:1,biomass:1,data:1};
  assert(!g.e.chooseAiBuild(1)?.funding,'No funded build may spend the module payment');
  g.p.deck.push({id:'pending-module',key:'capacityModule'});assert.equal(g.e.aiBuyInvestment(1),null);
  g.p.deck.pop();g.s.capacitySupply=0;assert.equal(g.e.aiBuyInvestment(1),null);
}
// Never postpone the first Shipyard or urgent public defence to save for a card.
{
  const g=game();g.s.planets[g.yard].upgrade=null;g.s.market=[{id:'draw',key:'tacticalBriefing'}];
  assert.equal(g.e.aiBuyInvestment(1),null);assert.equal(g.e.chooseAiBuild(1)?.kind,'starbase');
}
{
  const g=game();g.s.market=[{id:'draw',key:'tacticalBriefing'}];g.p.resources={matter:5,energy:5,biomass:3,data:4};
  g.s.fleets={'0,-6':{0:{fleet:2}}};const build=g.e.chooseAiBuild(1);
  assert.equal(build.kind,'fleet');assert(build.score>=50);
}
// A ready scoring order still resolves before any purchase-saving plan.
{
  const g=game(),world=g.s.clusters[4];g.p.resources.biomass=3;
  g.s.market=[{id:'draw',key:'surveyNetwork'}];g.p.hand.push({id:'colony',key:'colonize'});
  g.s.fleets={[world.center]:{1:{settler:1}}};g.e.runAiOperation();
  assert.equal(g.s.planets[world.center].owner,1);assert.equal(g.p.resources.biomass,0);
}
{
  const g=game(),world=g.s.clusters[4],site=g.e.relicCoordInCluster(world);
  world.scannedBy.push(1);g.s.fleets={[site]:{1:{explorer:1}}};g.p.resources.data=3;
  g.p.hand.push({id:'dig',key:'probe'});g.s.market=[{id:'draw',key:'tacticalBriefing'}];g.e.runAiOperation();
  assert.equal(g.p.relicsExcavated,1);assert.equal(g.s.planets[site].special,null);
}
// Not-yet-produced resources do not create a held purchase payment.
{
  const g=game();g.s.market=[{id:'draw',key:'tacticalBriefing'}];g.p.resources={matter:0,energy:0,biomass:0,data:0};
  for(const coord of g.home.coords)if(coord!==g.yard)Object.assign(g.s.planets[coord],{owner:1,upgrade:'harvester'});
  assert.equal(g.e.aiBuyInvestment(1),null);
}
// Military Focused still reserves its opening for its Colony and Move upgrades.
{
  const g=game('militaryFocused');g.s.market=[{id:'draw',key:'surveyNetwork'}];
  assert.equal(g.e.aiBuyInvestment(1),null);g.s.phase='buy';g.p.resources={matter:1,energy:1,biomass:3,data:4};
  g.p.hand.push({id:'opening-move',key:'move',starter:true});g.s.fleets={[g.yard]:{1:{settler:1}}};
  g.e.runAiBuy();assert.equal(g.p.hand.find(c=>c.id==='opening-move').level,2);
  assert.equal(g.p.resources.biomass,3);assert(!g.p.discard.some(c=>c.id==='draw'));
}
// Pile ordering and enemy private cards cannot affect the purchase reserve.
{
  const g=game();g.s.market=[{id:'draw',key:'tacticalBriefing'}];
  const before=plain(g.e.aiBuyInvestment(1)),build=plain(g.e.chooseAiBuild(1));
  g.p.deck.reverse();g.s.players[0].hand=[{id:'secret',key:'novaBarrage'}];g.s.players[0].deck.reverse();
  for(const world of g.s.clusters.filter(c=>c.kind==='moon'&&!c.revealedBy.includes(1)))world.scannedBy=[0];
  assert.deepEqual(plain(g.e.aiBuyInvestment(1)),before);assert.deepEqual(plain(g.e.chooseAiBuild(1)),build);
}
console.log('Human-win rival budgets: draw purchases, target capacity, held payments, free builds, stale targets, scoring/defence priority, opening strategy and privacy passed.');
