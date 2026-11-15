const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),plain=x=>JSON.parse(JSON.stringify(x));
function fixture(){
  const c=vm.createContext({}),counts={paths:0,funding:0,moves:0};
  let app=fs.readFileSync(path.join(root,'prototypes/galactic-reach/app.js'),'utf8');
  app=app.replace('      clone, deckContents,','      aiPath, chooseAiBuild, chooseAiMove, runAiOperation, clone, deckContents,');
  app=app.replace('  if (headless && options.resume) {',`
    const countPath=travelSearch;travelSearch=(...args)=>{options.counts.paths++;return countPath(...args);};
    const countFunding=aiFundingPlan;aiFundingPlan=(...args)=>{options.counts.funding++;return countFunding(...args);};
    const countMoves=chooseAiMove;chooseAiMove=(...args)=>{options.counts.moves++;return countMoves(...args);};
    if (headless && options.resume) {`);
  vm.runInContext(fs.readFileSync(path.join(root,'prototypes/galactic-reach/adapter.js'),'utf8')+app,c);
  let e,seed=73;const adapter=c.createGalacticAdapter;c.createGalacticAdapter=port=>{e=port;return adapter(port);};
  c.createGalacticReach({headless:true,counts,random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32)});
  const s=e.state,p=s.players[1];s.activePlayer=1;s.phase='operations';s.fleets={};s.market=[];
  s.players.forEach(p=>{p.hand=[];p.deck=[];p.discard=[];p.inPlay=[];});
  return {e,s,p,counts};
}
// A weighted portal route must keep exactly the uncached path, including tie order.
{
  const {e,s,counts}=fixture(),cache=new Map(),group={fleet:3,settler:0,explorer:0};
  s.fleets={'8,-10':{0:{fleet:1}}};
  const before=JSON.stringify(s),queries=[
    ['-10,8','8,-10',1,group,false,3],
    ['-10,8','8,-9',1,group,false,3],
    ['-10,8','8,-10',1,group,true,3],
    ['-10,8','8,-10',1,{fleet:1,settler:0,explorer:0},false,3],
    ['-10,8','8,-10',1,group,false,1],
    ['-10,7','8,-10',1,group,false,3]
  ];
  const uncached=queries.map(q=>plain(e.aiPath(...q)));
  counts.paths=0;
  const cached=queries.map(q=>plain(e.aiPath(...q,cache)));
  assert.deepEqual(cached,uncached,'Source, group, hostility and portal-step constraints must not alias');
  assert.equal(counts.paths,5,'Different destinations reuse one tree; distinct movement constraints do not');
  assert.equal(JSON.stringify(s),before,'Route planning cannot mutate the position');
  // A fresh decision must see new enemy pieces rather than a previous route tree.
  s.fleets={'8,-10':{0:{fleet:10}}};
  assert.equal(e.aiPath(...queries[0],new Map()),null,'Re-evaluate combat permission after enemy reinforcement');
}
// Site coordinates do not duplicate the search for an identical resource price.
{
  const {e,s,p,counts}=fixture(),yard=s.clusters[1].coords[6];
  Object.assign(s.planets[yard],{owner:1,upgrade:'starbase'});
  p.strategy='military';p.resourceLimits={matter:4,energy:4,biomass:4,data:4};
  p.resources={matter:0,energy:0,biomass:1,data:1};
  p.hand=[{id:'order',key:'construct',starter:true},{id:'matter',key:'construct',starter:true},{id:'energy',key:'move',starter:true}];
  const before=JSON.stringify(s),build=e.chooseAiBuild(1);
  assert(build.funding);assert(!build.funding.cards.includes('order'),'Never convert the chosen Construct order');
  assert(build.funding.cards.includes('matter')&&build.funding.cards.includes('energy'));
  assert(counts.funding<=5,'Search once per distinct ship/structure price, not every legal site');
  assert.equal(JSON.stringify(s),before,'Funding planning cannot mutate the position');
  p.resources={matter:0,energy:0,biomass:0,data:0};p.hand=[p.hand[0]];counts.funding=0;
  assert.equal(e.chooseAiBuild(1).funding,null,'A later decision must not reuse now-unaffordable payment');
  assert(counts.funding>0);
}
// Duplicate cards share an evaluation, retain the first card, and refresh next turn.
{
  const {e,s,p,counts}=fixture();
  p.strategy='military';p.resources={matter:0,energy:0,biomass:0,data:0};
  s.fleets={'0,0':{1:{fleet:3}},'2,0':{0:{fleet:1}}};
  p.hand=[{id:'first',key:'move',starter:true},{id:'duplicate',key:'move',starter:true},{id:'faster',key:'move',starter:true,upgraded:true,level:2}];
  const expected=e.chooseAiMove(1,p.hand[0]);assert(expected);counts.moves=0;
  e.runAiOperation();assert.equal(counts.moves,2,'One evaluation per distinct movement card');
  // The two ordinary cards have equal best moves; hand order selects the first.
  assert(p.inPlay.some(c=>c.id==='first'),'Equal movement choices preserve original card order');
  assert(p.hand.some(c=>c.id==='duplicate'));
  const before=counts.moves;s.pendingCombat=null;s.activePlayer=1;s.phase='operations';
  e.runAiOperation();assert(counts.moves>before,'A new decision must evaluate the changed position again');
}
console.log('Bot search caches: weighted portal paths, unit/hostility/range isolation, current payment eligibility, pure queries and decision lifetime passed.');
