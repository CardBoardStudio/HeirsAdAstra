const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,'../prototypes/galactic-reach',n),'utf8');
function game(app){let seed=610010,calls=0;const c=vm.createContext({});vm.runInContext(read('adapter.js')+app,c);let e;const base=c.createGalacticAdapter;c.createGalacticAdapter=port=>{e=port;return base(port);};const a=c.createGalacticReach({headless:true,random:()=>{calls++;return ((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);}});return {a,e,s:e.state,calls};}
const app=read('app.js'),line=app.split('\n').find(x=>x.includes('seedArk: { code:'));assert(line.includes('cost: {"biomass": 2}'));
const g=game(app),control=game(app.replace(line,line.replace('cost: {"biomass": 2}','cost: {"biomass": 4}')));
assert.equal(g.calls,control.calls);for(const key of ['planets','clusters','market','marketDecks'])assert.equal(JSON.stringify(g.s[key]),JSON.stringify(control.s[key]),'Price stays Cheap and preserves initial '+key);
const p=g.s.players[0];g.s.phase='buy';g.s.activePlayer=0;p.passed=true;p.resources={matter:0,energy:0,biomass:4,data:0};p.resourceLimits={matter:4,energy:4,biomass:4,data:4};
const card=g.s.market.find(c=>c.key==='seedArk')||g.s.marketDecks.cheap.find(c=>c.key==='seedArk');assert(card);g.s.market[6]=card;
const buy=g.a.legalActions(0).find(a=>a.type==='buy'&&a.source==='market'&&a.index===6);assert(buy);g.a.applyAction(0,buy);assert.equal(p.resources.biomass,2,'Two Biomass remain for scoring');assert(p.discard.some(c=>c.id===card.id));
p.discard.splice(p.discard.findIndex(c=>c.id===card.id),1);p.hand.push(card);g.s.phase='operations';g.s.activePlayer=0;p.passed=false;g.s.turnStage='action';
const center=g.s.clusters.find(c=>c.kind==='world'&&g.s.planets[c.center].owner===null).center;g.s.fleets[center]={'0':{settler:1}};
const colonize=g.a.legalActions(0).find(a=>a.type==='colonize'&&a.card===card.id&&a.coord===center);assert(colonize);g.a.applyAction(0,colonize);
assert.equal(p.resources.biomass,1,'Colony still costs one Biomass');assert.equal(g.s.planets[center].owner,0);assert(!g.s.fleets[center]?.[0]?.settler,'Settler is consumed');assert(p.inPlay.some(c=>c.id===card.id),'Reusable Seed Ark remains in play');
console.log('Seed Ark price: same initial maps/market/RNG, two-Biomass purchase preserves scoring funds, unchanged one-Biomass Colony and consumed Settler/reusable-card timing.');
