// Player decisions from the 36.41 feedback contract, including authoritative commands.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const plain=x=>JSON.parse(JSON.stringify(x));
function game(){const c=vm.createContext({});vm.runInContext(fs.readFileSync('prototypes/galactic-reach/adapter.js','utf8')+fs.readFileSync('prototypes/galactic-reach/app.js','utf8'),c);let e;const f=c.createGalacticAdapter;c.createGalacticAdapter=x=>(e=x,f(x));let seed=37;c.createGalacticReach({headless:true,random:()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32)});const s=e.state,p=s.players[0];s.activePlayer=0;s.phase='operations';s.players.forEach(p=>{p.hand=[];p.deck=[];p.discard=[];p.inPlay=[];p.resources={matter:20,energy:20,biomass:20,data:20};p.resourceLimits={matter:30,energy:30,biomass:30,data:30};});return {e,s,p,a:()=>f(e)};}
const unit=(settler=0,explorer=0,fleet=0)=>({settler,explorer,fleet});
function card(g,key,id=key,extra={}){const c={key,id,...extra};g.p.hand.push(c);return c;}
function battle(g){let n=0;while(g.s.pendingCombat&&n++<15){const a=g.a(),seat=a.activeSeat(),acts=a.legalActions(seat);a.applyAction(seat,acts.find(a=>a.type==='combat_stay')||acts.find(a=>a.tactic==='concentratedFire')||acts[0]);}assert(!g.s.pendingCombat);}
{
 const g=game();assert.equal(g.s.version,36);assert.equal(g.s.rulesRevision,41);assert.equal(Object.values(g.s.planets).filter(p=>p.special==='relic').length,13);assert(g.s.clusters[12].coords.some(k=>g.s.planets[k].special==='relic'));
 assert.equal(Object.keys(g.e.RELIC_CARDS).length,23);assert(!g.e.ALL_CARDS.voidglassAstrolabe);
 for(const key of ['signalRelay','surveyNetwork','tacticalBriefing']){const d=g.e.ALL_CARDS[key];assert.equal(d.effect.draw,2);assert(Object.values(d.cost).every(n=>n<=4));}
 for(const d of Object.values(g.e.ALL_CARDS)){assert(!/reuse it each time/i.test(d.text));if(d.order==='special'&&d.effect)assert(d.effect.draw||d.effect.limits||d.effect.prestige||d.effect.trashStarters,'No resource-only special orders');}
}
{
 const g=game(),c=card(g,'probe');g.s.fleets={'0,0':{0:unit(0,1)}};const a=g.a().legalActions(0).find(a=>a.type==='probe');assert(a);g.a().applyAction(0,a);assert(g.p.inPlay.some(x=>x.id===c.id));assert(!g.p.discard.some(c=>c.key==='excavate'));const first=g.s.clusters.find(c=>c.scannedBy.includes(0)&&c.id>=4);assert(first);
 // The nearest remaining site can already be known. Re-probing never skips it.
 const located=g.s.clusters.map(c=>c.scannedBy.includes(0));g.s.activePlayer=0;g.p.hand.push(g.p.inPlay.pop());assert(g.e.probeRelic(0,'0,0',c.id));assert.deepEqual(g.s.clusters.map(c=>c.scannedBy.includes(0)),located);
 g.s.activePlayer=0;g.p.hand.push(g.p.inPlay.pop());const coord=first.coords.find(k=>g.s.planets[k].special==='relic');g.s.fleets={[coord]:{0:unit(0,1)}};assert(g.e.excavate(0,coord,c.id,g.s.relicRow[0].id));assert(![...g.p.hand,...g.p.inPlay,...g.p.discard].some(x=>x.id===c.id));assert.equal(g.p.relicsExcavated,1);assert.equal(g.s.fleets[coord],undefined);assert.equal(g.p.discard.length,1);
}
{
 const g=game();card(g,'probe');g.s.fleets={'0,0':{0:unit(0,1)}};Object.values(g.s.planets).forEach(p=>p.special=null);const before=JSON.stringify(g.s);assert(!g.e.probeRelic(0,'0,0','probe'));assert.equal(JSON.stringify(g.s),before);
}
{
 const g=game(),c=card(g,'cargoExpansion');const limits=plain(g.p.resourceLimits);assert(g.e.resolveHumanSpecial(c,g.e.ALL_CARDS[c.key],0));for(const r of g.e.RESOURCES)assert.equal(g.p.resourceLimits[r],limits[r]+2);assert(!g.p.inPlay.some(x=>x.id===c.id));assert.equal(g.p.storagePurchases,0);
 g.s.activePlayer=0;card(g,'cargoExpansion','convert');assert(g.e.convertCard(0,'convert'));assert(g.p.inPlay.some(c=>c.id==='convert'));
}
{
 const g=game();card(g,'move');g.s.activePlayer=1;g.s.pendingConstruct={playerId:1,cardId:'other'};g.p.resources={matter:4,energy:4,biomass:4,data:4};g.p.resourceLimits={matter:4,energy:4,biomass:4,data:4};const acts=g.a().legalActions(0);assert(acts.some(a=>a.type==='resource'));assert(acts.some(a=>a.type==='bank_trade'));assert(acts.some(a=>a.type==='increase_storage'));assert(acts.every(a=>['resource','bank_trade','increase_storage'].includes(a.type)));
 g.a().applyAction(0,acts.find(a=>a.type==='resource'));assert.equal(g.p.resources.energy,4,'Full limits allow conversion and lose excess');assert.equal(g.s.activePlayer,1);assert.equal(g.s.pendingConstruct.cardId,'other');assert(g.e.bankTrade(0,'matter','data'));g.p.resources.matter=1;assert(g.e.increaseStorage(0,{matter:1,energy:1,biomass:1,data:1}));assert.equal(g.s.activePlayer,1);assert.equal(g.s.pendingConstruct.cardId,'other');
 assert.throws(()=>g.a().applyAction(0,{type:'pass'}),/Illegal/);
}
{
 const g=game(),c=card(g,'move','m',{starter:true});g.s.phase='buy';assert(g.e.upgradeStarter(0,c.id,'energy'));assert.equal(g.p.resources.energy,18);assert(g.e.upgradeStarter(0,c.id,'data'));assert.equal(g.p.resources.data,17);assert.equal(c.level,3);assert(!g.e.upgradeStarter(0,c.id,'matter'));
 g.s.phase='operations';g.p.deck=[];g.p.discard=[{id:'draw',key:'construct'}];assert(g.e.convertCard(0,c.id));assert.deepEqual(plain(g.p.hand.map(x=>x.id)),['draw']);assert(g.p.inPlay.some(x=>x.id===c.id));
}
{
 const g=game(),c=card(g,'move','m',{starter:true,upgraded:true,level:3});g.p.deck=[{id:'bonus',key:'construct'}];g.s.fleets={'0,0':{0:unit(0,0,1)}};assert.equal(g.e.movementRange(unit(0,0,1),c),3);const a=g.a().legalActions(0).find(a=>a.type==='move'&&a.destination==='0,0');assert(a);g.a().applyAction(0,a);assert.equal(g.s.activePlayer,1);assert(g.p.hand.some(c=>c.id==='bonus'));assert(g.p.inPlay.some(c=>c.id==='m'));
}
{
 const g=game(),moon=g.s.clusters.find(c=>c.kind==='moon'),coord=moon.center,c=card(g,'construct','c',{starter:true,upgraded:true,level:3});moon.revealedBy=[0,1,2,3];g.s.fleets={[coord]:{0:unit(0,1)}};g.p.deck=[{id:'bonus',key:'move'}];assert(!g.e.constructAt(0,coord,'harvester',null,true));assert(g.e.performConstructOrder(0,coord,'starbase',c));assert.equal(g.s.planets[coord].upgrade,'starbase');assert(g.s.pendingConstruct);assert(g.p.hand.some(c=>c.id==='bonus'));assert(g.e.finishConstruct(0));assert.equal(g.s.activePlayer,1);
}
{
 const g=game(),coord=g.s.clusters[0].coords[1];assert(g.e.buildUpgrade(0,coord,'starbase'));g.s.fleets={[coord]:{1:unit(0,0,1)}};const c=card(g,'construct','c',{starter:true,upgraded:true});assert(g.e.performConstructOrder(0,coord,'fleet',c));assert(g.s.pendingCombat,'Spawning starts battle');assert.equal(g.s.activePlayer,0);assert(g.p.inPlay.some(c=>c.id==='c'));battle(g);assert(g.s.pendingConstruct,'Second build survives battle');assert.equal(g.s.activePlayer,0);assert(g.e.finishConstruct(0));assert.equal(g.s.activePlayer,1);
}
{
 const g=game(),coord=g.s.clusters[4].coords[1];Object.assign(g.s.planets[coord],{owner:1,upgrade:'starbase'});g.s.fleets={[coord]:{0:unit(0,0,2)}};card(g,'move');const a=g.a().legalActions(0).find(a=>a.type==='move'&&a.source===coord&&a.destination===coord&&a.units.fleet===2);assert(a);g.a().applyAction(0,a);assert(g.s.pendingCombat,'Stationary Move starts a new fight');assert.equal(g.p.inPlay.length,1);battle(g);assert.equal(g.s.activePlayer,1);
}
console.log('Playtest Feedback: center site, 23 relics, combined card, closest signals, one-shot capacity, off-turn authority, III draw timing, moon Shipyards, spawn combat and stationary Move passed.');
