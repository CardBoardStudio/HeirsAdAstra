// Rules #solo-seating: home assignment changes positions, not identity, resources or legal builds.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=f=>fs.readFileSync(require('node:path').join(__dirname,'../prototypes/galactic-reach',f),'utf8'),plain=x=>JSON.parse(JSON.stringify(x));
function game(homeOrder,resume){const c=vm.createContext({});let e,n=1729;vm.runInContext(read('adapter.js')+read('app.js').replace('      clone, deckContents,','      homeCoord, aiInitialShipyard, neighborSeat, clone, deckContents,'),c);const f=c.createGalacticAdapter;c.createGalacticAdapter=x=>{e=x;return f(x);};const a=c.createGalacticReach({headless:true,random:()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/2**32),...(homeOrder?{homeOrder}: {}),...(resume?{resume}: {})});return{e,a,s:e.state};}
const permutations=a=>a.length?a.flatMap((x,i)=>permutations(a.filter((_,j)=>i!==j)).map(t=>[x,...t])):[[]];
const centers=['-9,0','0,-9','9,0','0,9'],baseline=game(),counts=[0,0,0,0];
assert(!baseline.s.homeOrder,'Headless/shared setup retains its existing default');
for(const order of permutations([0,1,2,3])){
 const {e,a,s}=game(order);counts[order[0]]++;
 assert.deepEqual(plain(s.homeOrder),order);assert.deepEqual(plain(s.clusters.slice(0,4).map(c=>c.center)),order.map(i=>centers[i]));
 assert.deepEqual(plain(s.clusters.slice(4)),plain(baseline.s.clusters.slice(4)),'Neutral worlds/moons keep the same physical layout');
 assert.deepEqual(plain(s.portalLinks),plain(baseline.s.portalLinks));assert.deepEqual(plain(s.players.map(p=>({name:p.name,color:p.color,strategy:p.strategy,resources:p.resources}))),plain(baseline.s.players.map(p=>({name:p.name,color:p.color,strategy:p.strategy,resources:p.resources}))));
 assert.equal(e.neighborSeat(order),order.indexOf(order[0]^1));
 for(let id=0;id<4;id++){
  const home=e.homeCoord(id);assert.equal(home,centers[order[id]]);assert.equal(s.planets[home].owner,id);assert.equal(s.planets[home].originalFounder,id);assert(s.planets[home].hasColony);
  const yard=e.aiInitialShipyard(id);assert.equal(s.planets[yard].type,'energy','Every randomized home keeps its inward Energy site');
  s.activePlayer=id;s.phase='operations';s.players[id].resources={matter:4,energy:4,biomass:4,data:4};
  const build=a.legalActions(id).find(x=>x.type==='build'&&x.kind==='starbase'&&x.coord===yard);assert(build,'A Construct can build a Shipyard at the inward site');a.applyAction(id,build);assert.equal(s.planets[yard].upgrade,'starbase');
 }
 const resumed=game(undefined,a.snapshotState());assert.deepEqual(plain(resumed.e.state.clusters),plain(s.clusters),'Resuming keeps the actual home geometry');
}
assert.deepEqual(counts,[6,6,6,6]);
console.log('Solo homes: all24 assignments, equal four-position coverage, ownership, identities, unchanged neutral layout/portals, inward Energy builds and resume passed.');
