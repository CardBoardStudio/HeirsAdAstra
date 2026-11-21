// Rules #resource-costs, #orders and #building: exercise the approved price mix,
// including payments that were formerly legal and printed discounted exceptions.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root=require('node:path').resolve(__dirname,'..');
const read=file=>fs.readFileSync(require('node:path').join(root,file),'utf8');
const plain=x=>JSON.parse(JSON.stringify(x));
function game(){
 const elements=new Map(),context=vm.createContext({});
 const app=read('prototypes/galactic-reach/app.js').replace('      clone, deckContents,','      resourceText, renderSymbolLegend, aiImmediateProtection, aiStorageProtection, clone, deckContents,');
 vm.runInContext(read('prototypes/galactic-reach/adapter.js')+app,context);let e;const factory=context.createGalacticAdapter;
 context.createGalacticAdapter=port=>{e=port;return factory(port);};let seed=915;
 const api=context.createGalacticReach({headless:true,random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32)});
 context.document={querySelector:q=>{if(!elements.has(q))elements.set(q,{innerHTML:''});return elements.get(q);},querySelectorAll:()=>[]};
 const s=e.state,p=s.players[0];s.phase='operations';s.activePlayer=0;
 p.hand=[];p.discard=[];p.inPlay=[];p.resources={matter:0,energy:0,biomass:0,data:0};
 return {e,s,p,api,elements};
}
const prices={settler:{matter:1,biomass:2},explorer:{energy:1,data:2},fleet:{matter:2,energy:2},colony:{biomass:3},harvester:{matter:1,energy:1,data:1},starbase:{matter:2,energy:2,data:1},excavate:{energy:1,data:3}};
{
 const {e,elements}=game();
 for(const [kind,cost] of Object.entries(prices))assert.deepEqual(plain(kind==='colony'?{biomass:e.COLONY_LIFE_COST}:kind==='excavate'?e.EXCAVATION_COST:e.SHIP_STATS[kind]?.cost||e.STRUCTURES[kind].cost),cost,kind);
 const book=read('prototypes/galactic-reach/rulebook.html');
 for(const [kind,cost] of Object.entries(prices)){
  const row=book.match(new RegExp('<tr data-cost-kind="'+kind+'">([\\s\\S]*?)</tr>'));assert(row,kind+' has a canonical price row');
  // One printed resource symbol per unit paid (rules #card-corners), and the numbers for screen readers.
  for(const resource of e.RESOURCES)assert.equal((row[1].match(new RegExp('class="resource-symbol '+resource+' ','g'))||[]).length,cost[resource]||0,kind+' printed price repeats one '+resource+' symbol per unit paid');
  assert(row[1].includes(`aria-label="${e.RESOURCES.filter(r=>cost[r]).map(r=>`${cost[r]} ${({matter:'Matter',energy:'Energy',biomass:'Life',data:'Data'})[r]}`).join(', ')}"`),kind+' printed price reads as numbers');
 }
 assert(e.resourceText('2 Life').includes('aria-label="Life"'));assert(e.resourceText('2 Life').includes('biomass'),'Life retains the leaf glyph and stored resource identity');
 e.renderSymbolLegend();const legend=elements.get('#map-legend-corner').innerHTML;
 const labels={settler:'Settler',explorer:'Explorer',fleet:'Fleet',colony:'Colony',harvester:'Harvester',starbase:'Shipyard',excavate:'Excavate'};
 for(const [kind,cost] of Object.entries(prices)){
  const row=legend.match(new RegExp('<b>'+labels[kind]+'</b></dt><dd>([\\s\\S]*?)</dd>'));assert(row,kind+' has a reference price');
  for(const resource of e.RESOURCES)assert.equal((row[1].match(new RegExp('class="resource-symbol '+resource+' ', 'g'))||[]).length,cost[resource]||0,kind+' repeats one '+resource+' symbol per unit paid');
 }
 assert(/aria-label="3 Life"/.test(legend),'The Colony price remains readable without seeing its three leaf symbols');
}
function buildFixture(kind,funds){
 const g=game(),coord=g.s.clusters[0].coords[1];g.p.hand=[{id:'build',key:'construct',starter:true}];Object.assign(g.p.resources,funds);
 if(g.e.SHIP_STATS[kind])Object.assign(g.s.planets[coord],{owner:0,upgrade:'starbase'});
 return {...g,coord,action:{type:'build',card:'build',kind,coord}};
}
for(const kind of ['settler','fleet','starbase']){
 const g=buildFixture(kind,prices[kind]);const action=g.api.legalActions(0).find(a=>a.type==='build'&&a.kind===kind&&a.coord===g.coord);assert(action,kind+' exact revised payment is legal');g.api.applyAction(0,action);
 assert(g.e.RESOURCES.every(r=>g.p.resources[r]===0),kind+' charges exactly its revised cost');
}
for(const [kind,funds] of [['settler',{matter:1,energy:1,biomass:1}],['fleet',{matter:2,energy:1,biomass:1}],['starbase',{matter:2,energy:1,biomass:1,data:1}]]){
 const g=buildFixture(kind,funds),before=JSON.stringify(g.s);assert(!g.api.legalActions(0).some(a=>a.type==='build'&&a.kind===kind&&a.coord===g.coord),kind+' former price no longer funds a build');assert.equal(JSON.stringify(g.s),before,'Failed affordability is pure');
}
function colonyFixture(life,key='colonize',capture=false){
 const g=game(),world=g.s.clusters.find(c=>c.kind==='world'&&g.s.planets[c.center].owner===null),coord=world.center;
 Object.assign(g.s.planets[coord],{owner:capture?1:null,hasColony:capture,upgrade:null});g.s.fleets[coord]={0:{settler:1,explorer:0,fleet:capture?1:0}};
 g.p.resources.biomass=life;g.p.hand=[{id:'settle',key}];return {...g,coord};
}
{
 const g=colonyFixture(2),before=JSON.stringify(g.s);assert(!g.e.applyColonizeOrder(0,g.coord,g.p.hand[0]));assert.equal(JSON.stringify(g.s),before,'Two Life cannot found a Colony and spends nothing');
}
for(const [key,life,capture,keep] of [['colonize',3,false,false],['colonize',1,true,false],['seedArk',1,false,false],['colonyPods',1,false,true],['genesisCharter',0,false,true],['evergreenArk',0,false,true]]){
 const g=colonyFixture(life,key,capture);assert(g.e.applyColonizeOrder(0,g.coord,g.p.hand[0]),key+' keeps its printed Colony terms');
 assert.equal(g.p.resources.biomass,0);assert.equal(g.s.planets[g.coord].owner,0);assert.equal(g.s.fleets[g.coord]?.[0]?.settler||0,keep?1:0);if(capture)assert.equal(g.s.fleets[g.coord][0].fleet,1,'Captures keep their Fleet');
}
function excavationFixture(funds){
 const g=game(),world=g.s.clusters.find(c=>c.kind==='world'&&g.s.planets[c.center].special==='relic')||g.s.clusters.find(c=>c.coords.some(k=>g.s.planets[k].special==='relic'));
 const coord=world.coords.find(k=>g.s.planets[k].special==='relic');world.scannedBy=[0];g.s.fleets[coord]={0:{settler:0,explorer:1,fleet:0}};
 Object.assign(g.p.resources,funds);g.p.hand=[{id:'dig',key:'probe'}];return {...g,coord};
}
{
 const g=excavationFixture({matter:1,energy:1,data:2}),before=JSON.stringify(g.s);assert(!g.e.excavate(0,g.coord,'dig',g.s.relicRow[0].id));assert.equal(JSON.stringify(g.s),before,'The former excavation mix is rejected atomically');
}
{
 const g=excavationFixture(prices.excavate);assert(g.e.excavate(0,g.coord,'dig',g.s.relicRow[0].id));assert(g.e.RESOURCES.every(r=>g.p.resources[r]===0));assert.equal(g.p.relicsExcavated,1);assert.equal(g.s.planets[g.coord].special,null);assert.equal(g.s.fleets[g.coord]?.[0]?.explorer||0,0);
}
{
 const g=colonyFixture(3);assert.equal(g.e.aiImmediateProtection(0).biomass,3,'Browser rivals protect the new ready Colony payment');
 const yard=g.s.clusters[0].coords[1];Object.assign(g.s.planets[yard],{owner:0,upgrade:'starbase'});assert.equal(g.e.aiStorageProtection(0).biomass,3,'Storage planning keeps the same Colony price');
}
console.log('Life resource costs: exact payments, obsolete-price rejection, 3-Life founding, 1-Life captures, printed exceptions, excavation, browser reserves, canonical table and leaf labels passed.');
