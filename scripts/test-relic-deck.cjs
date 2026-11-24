// Rules #alien-relics, #relic-timing, #relic-targeting, #relic-capacity and #relic-chains.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const app=read('prototypes/galactic-reach/app.js'),adapter=read('prototypes/galactic-reach/adapter.js');
const plain=x=>JSON.parse(JSON.stringify(x));let serial=0;
const card=key=>({key,id:`relic-test-${serial++}`});
function game(resume=null){const c=vm.createContext({});vm.runInContext(adapter+app,c);let e,seed=17;const factory=c.createGalacticAdapter;c.createGalacticAdapter=p=>{e=p;return factory(p);};const a=c.createGalacticReach({headless:true,browserPolicy:true,random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32),...(resume?{resume}:{})});return {c,e,a,s:e.state,p:e.state.players[0],fresh:()=>factory(e)};}
function setup(key,seat=0){const g=game();g.s.phase='operations';g.s.activePlayer=seat;g.s.turnStage='action';g.s.fleets={};g.s.players.forEach(p=>{p.hand=[];p.deck=[];p.discard=[];p.inPlay=[];p.passed=false;p.resources={matter:0,energy:0,biomass:0,data:0};p.resourceLimits={matter:20,energy:20,biomass:20,data:20};});g.p=g.s.players[seat];g.p.hand=[card(key)];g.a=g.fresh();return g;}
function legal(g,seat=0){return g.fresh().legalActions(seat);}
function act(g,type,match=()=>true,seat=0){const a=g.fresh(),choice=a.legalActions(seat).find(x=>x.type===type&&match(x));assert(choice,`Expected ${type}: ${JSON.stringify(a.legalActions(seat).slice(0,4))}`);a.applyAction(seat,choice);return choice;}
function reject(g,seat,action){const before=JSON.stringify(g.e.state),counters=[g.e.turnSerial,g.e.cardSerial];assert.throws(()=>g.fresh().applyAction(seat,action),/Illegal action/);assert.equal(JSON.stringify(g.e.state),before);assert.deepEqual([g.e.turnSerial,g.e.cardSerial],counters);}
function checkpoint(g){const resumed=game(g.fresh().snapshotState());assert.deepEqual(plain(resumed.fresh().snapshotState()),plain(g.fresh().snapshotState()));assert.deepEqual(plain(resumed.fresh().snapshot()),plain(g.fresh().snapshot()));return resumed;}
function friendlyYard(g,seat){const cluster=g.s.clusters.find(c=>c.kind==='world'&&g.s.planets[c.center].owner===seat),at=cluster.coords.find(c=>c!==cluster.center);Object.assign(g.s.planets[at],{owner:seat,upgrade:'starbase',hasColony:false});return at;}
function battle({attacker=3,defender=3,attackCards=[],defendCards=[],defendExtra={}}={}){
 const g=setup('move'),p0=g.s.players[0],p1=g.s.players[1],coord=g.s.clusters[4].center,source=g.s.clusters[0].center;
 Object.assign(g.s.planets[coord],{owner:null,hasColony:false,upgrade:null});g.s.fleets[coord]={0:{fleet:attacker,settler:0,explorer:0},1:{fleet:defender,settler:0,explorer:0,...defendExtra}};
 p0.hand=attackCards.map(card);p1.hand=defendCards.map(card);
 g.e.executeMove(0,coord,coord,{units:{fleet:attacker,settler:0,explorer:0},moveGroup:'ships'}); // Zero-distance Move starts the real combat primitive.
 assert(g.s.pendingCombat);return {...g,coord,source};
}
function tactics(g,t0='concentratedFire',t1='concentratedFire'){
 let guard=0;while(g.s.pendingCombat?.stage==='escape'&&guard++<4){const seat=g.e.combatActor();act(g,'combat_stay',()=>true,seat);}
 assert.equal(g.s.pendingCombat?.stage,'tactic');act(g,'combat_tactic',a=>a.tactic===t0,0);act(g,'combat_tactic',a=>a.tactic===t1,1);
}
{
 const g=game(),c=g.c.createGalacticReach({catalog:true}),all=[...g.s.relicRow,...g.s.relicDeck];
 assert.equal(Object.keys(c.RELIC_CARDS).length,16);assert.equal(all.length,16);assert.equal(new Set(all.map(c=>c.key)).size,16);
 assert.equal(Object.values(c.MARKET_CARDS).filter(c=>!c.military).length,18);assert.equal(Object.values(c.MARKET_CARDS).filter(c=>c.military).length,9);
 for(const key of ['phaseShearDrive','obeliskOfAnnihilation','aegisOfSilentArchitects','memoryPrism','archiveOfTides','stellarCrucible','evergreenArk','cinderDrive'])assert(!c.RELIC_CARDS[key]);
 assert(!c.MARKET_CARDS.archivePurge);assert(![...g.s.market,...Object.values(g.s.marketDecks).flat()].some(c=>c.key==='archivePurge'));
 assert.equal(c.RELIC_CARDS.firstDawnEchoes.code,'R02');assert.equal(c.RELIC_CARDS.foldedWarehouse.code,'R13');assert.equal(c.RELIC_CARDS.oracleOfTheUnmade.code,'R24');
 assert.equal(new Set(Object.values(c.RELIC_CARDS).map(c=>c.code)).size,16);
}
{
 const g=setup('firstDawnEchoes'),one=card('construct'),two=card('foldedWarehouse');one.starter=true;one.level=3;g.p.inPlay=[one,two];g.p.storage=[{...card('capacityModule'),allocation:{matter:4,energy:0,biomass:0,data:0}}];
 const echo=g.p.hand[0];reject(g,0,{type:'relic',card:echo.id,ability:'echoes',cards:[echo.id]});reject(g,1,{type:'relic',card:echo.id,ability:'echoes',cards:[]});
 act(g,'relic',a=>a.cards?.length===2);assert.deepEqual(g.p.hand.map(c=>c.id).sort(),[one.id,two.id].sort());assert(g.p.inPlay.some(c=>c.id===echo.id));assert.equal(g.p.storage.length,1);checkpoint(g);
}
{
 const g=setup('omniscientChorus');g.p.deck=[card('move')];act(g,'special');assert.equal(g.p.hand.length,1);
 const located=g.e.remainingRelicSites?g.e.remainingRelicSites():g.s.clusters.filter(c=>g.e.relicCoordInCluster(c));
 assert(located.every(x=>(x.cluster||x).scannedBy.includes(0)));assert(g.s.clusters.some(c=>!c.scannedBy.includes(1)));
}
{
 const g=setup('foldedWarehouse');g.p.resourceLimits={matter:14,energy:14,biomass:14,data:14};g.p.deck=[card('move'),card('construct')];const before={...g.p.resourceLimits};act(g,'special');for(const r of g.e.RESOURCES)assert.equal(g.p.resourceLimits[r],before[r]+1);assert.equal(g.p.hand.length,2);
}
{
 const g=setup('starfarersCompass'),sites=g.s.clusters.filter(c=>g.e.relicCoordInCluster(c)),known=sites[0],hidden=sites[1],dest=g.e.relicCoordInCluster(known),source=g.s.clusters[0].center;
 known.scannedBy=[0];hidden.scannedBy=[];g.s.fleets[source]={0:{explorer:2,fleet:0,settler:0}};
 assert(legal(g).some(a=>a.ability==='compass'&&a.destination===dest));assert(!legal(g).some(a=>a.destination===g.e.relicCoordInCluster(hidden)));
 const choice=legal(g).find(a=>a.ability==='compass'&&a.destination===dest&&a.units.explorer===1);reject(g,0,{...choice,destination:g.e.relicCoordInCluster(hidden)});g.fresh().applyAction(0,choice);
 assert.equal(g.s.fleets[source][0].explorer,1);assert.equal(g.s.fleets[dest][0].explorer,1);assert.equal(g.s.planets[dest].relicClaimed,false);checkpoint(g);
}
{
 const g=setup('horizonSail'),home=g.s.clusters[0].center,source=Object.keys(g.s.planets).find(c=>c!==home&&g.e.travelDistance(c,home)<=6);g.s.fleets[source]={0:{fleet:2,settler:1,explorer:1}};
 const a=act(g,'relic',a=>a.ability==='horizon'&&a.destination===home&&a.units.fleet===1&&!a.units.settler);assert.equal(g.s.fleets[source][0].fleet,1);assert.equal(g.s.fleets[home][0].fleet,1);assert.equal(g.s.fleets[source][0].explorer,1);assert(a.source!==a.destination);
}
{
 const g=setup('keepersArchive');const target=card('worldEngine');g.s.market=[target];g.p.resources={matter:4,energy:1,biomass:1,data:0};g.p.resourceLimits={matter:4,energy:4,biomass:4,data:4};
 const before=g.s.marketDecks.expensive.length;const choice=legal(g).find(a=>a.ability==='keepers'&&a.purchase===target.id);assert(choice);assert.equal(choice.discount.matter,2);
 reject(g,0,{...choice,discount:{matter:0,energy:0,biomass:0,data:2}});g.fresh().applyAction(0,choice);assert(g.p.discard.some(c=>c.id===target.id));assert.deepEqual(plain(g.p.resources),{matter:0,energy:0,biomass:0,data:0});assert(g.s.market.length>0);assert(g.s.marketDecks.expensive.length<before);
}
{
 const g=setup('prismaticReservoir');g.p.resourceLimits={matter:4,energy:4,biomass:4,data:8};g.p.resources.data=5;g.p.storage=[{...card('capacityModule'),allocation:{matter:0,energy:0,biomass:0,data:4}}];const original=plain(g.p.resourceLimits),storage=plain(g.p.storage),turn=g.e.turnSerial;
 act(g,'relic');act(g,'relic_shift',a=>a.giveType==='data'&&a.getType==='matter'&&a.amount===3);assert.deepEqual(plain(g.p.resourceLimits),original);assert.equal(g.s.pendingRelic.limits.data,5);
 reject(g,0,{type:'relic_shift',giveType:'data',getType:'energy',amount:1});checkpoint(g);assert.equal(g.fresh().privateState(1).pendingRelic,null);
 act(g,'relic_cancel');assert.deepEqual(plain(g.p.resourceLimits),original);assert.equal(g.p.hand.length,1);assert.equal(g.e.turnSerial,turn);
 act(g,'relic');act(g,'relic_shift',a=>a.giveType==='data'&&a.getType==='matter'&&a.amount===3);act(g,'relic_confirm');assert.deepEqual(plain(g.p.resourceLimits),{matter:7,energy:4,biomass:4,data:5});assert.deepEqual(plain(g.p.storage),storage);checkpoint(g);
}
{
 const g=setup('hourglassOfTwoSuns');g.p.hand.push(card('strategyCore'),card('signalRelay'));act(g,'relic');assert.equal(g.s.activePlayer,0);assert.equal(g.s.chainedActions.remaining,2);assert(!g.e.canOfferTrade(0,{giveType:'matter',getType:'data',giveAmount:1,getAmount:1}));checkpoint(g);
 act(g,'special',a=>a.key==='strategyCore');assert.equal(g.s.activePlayer,0);act(g,'special',a=>a.key==='signalRelay');assert.equal(g.s.activePlayer,1);assert.equal(g.s.chainedActions,null);
 g.s.activePlayer=0;g.p.passed=false;g.p.hand.push(...g.p.inPlay.splice(g.p.inPlay.findIndex(c=>c.key==='hourglassOfTwoSuns'),1));assert(!legal(g).some(a=>a.ability==='hourglass'));
}
{
 const g=battle({attackCards:['crownOfTheUsurper'],attacker:1,defender:2});assert.equal(g.s.pendingCombat.stage,'opening');act(g,'combat_relic',a=>a.ability==='crown');assert.equal(g.s.fleets[g.coord][0].fleet,2);assert.equal(g.s.fleets[g.coord][1].fleet,1);assert.equal(g.s.pendingCombat.stage,'tactic');checkpoint(g);
}
{
 const g=battle({defendCards:['horizonSail']}),near=Object.keys(g.s.planets).find(c=>c!==g.coord&&g.e.travelDistance(c,g.coord)<=6);g.s.fleets[near]={1:{fleet:2,explorer:0,settler:0}};
 // The opening was established before the reinforcement source existed; refresh eligible windows.
 g.s.pendingCombat.stage='opening';g.s.pendingCombat.relicDone={attacker:true,defender:false};
 act(g,'combat_relic',a=>a.ability==='horizon'&&a.units.fleet===2,1);assert.equal(g.s.fleets[g.coord][1].fleet,5);assert(!g.s.fleets[near]?.[1]);assert.equal(g.s.pendingCombat.stage,'tactic');checkpoint(g);
}
{
 const g=battle({attackCards:['warSongOfHollowStars'],attacker:5,defender:5});tactics(g);assert(g.s.pendingCombat.used.attacker.includes('concentratedFire'));
 const count=g.s.pendingCombat.hands.attacker.concentratedFire;act(g,'combat_relic',a=>a.ability==='warsong'&&a.tactic==='concentratedFire');assert.equal(g.s.pendingCombat.hands.attacker.concentratedFire,count+1);assert.equal(g.s.pendingCombat.used.attacker.filter(x=>x==='concentratedFire').length,0);checkpoint(g);
 act(g,'combat_tactic',a=>a.tactic==='concentratedFire');
}
{
 const g=battle({attackCards:['theSilentHour'],attacker:2,defender:2});while(g.s.pendingCombat.stage==='escape')act(g,'combat_stay',()=>true,g.e.combatActor());act(g,'combat_relic',a=>a.ability==='silent');tactics(g);assert.equal(g.s.pendingCombat.volleys[0].defender.damage,0);assert(g.s.pendingCombat.volleys[0].attacker.damage>0);tactics(g);const report=g.s.pendingCombat||g.s.lastCombat;assert(report.volleys[1].defender.damage>0);
}
{
 const g=battle({defendCards:['phoenixCrucible'],attacker:3,defender:1,defendExtra:{explorer:1}}),yard=friendlyYard(g,1),beforeCards=g.s.players[1].discard.length;checkpoint(g);tactics(g);assert.equal(g.s.pendingCombat.stage,'aftermath');assert.equal(g.e.combatActor(),1);
 act(g,'combat_relic',a=>a.ability==='phoenix'&&a.destination===yard&&a.units.fleet===1&&a.units.explorer===1,1);assert(!g.s.pendingCombat);assert.equal(g.s.fleets[yard][1].fleet,1);assert.equal(g.s.fleets[yard][1].explorer,1);assert.equal(g.s.players[1].discard.length,beforeCards);assert.equal(g.s.players[0].combatVictories,1);checkpoint(g);
}
{
 const g=setup('worldseed'),at=g.s.clusters.find(c=>c.kind==='world'&&g.s.planets[c.center].owner===null).center;assert(!legal(g).some(a=>a.ability==='worldseed'));g.p.resources.biomass=3;act(g,'relic',a=>a.ability==='worldseed'&&a.destination===at);assert.equal(g.p.resources.biomass,0);assert(g.s.planets[at].hasColony);assert.equal(g.s.planets[at].owner,0);assert(Object.values(g.s.fleets).every(group=>!group[0]?.settler));checkpoint(g);
}
{
 const g=setup('gravityScepter'),from=g.s.clusters[4].center;g.s.fleets[from]={1:{settler:1,explorer:1,fleet:1}};const a=act(g,'relic',a=>a.ability==='gravity'&&a.source===from);assert(!g.s.fleets[from]?.[1]);assert.deepEqual(plain(g.s.fleets[a.destination][1]),{settler:1,explorer:1,fleet:1});checkpoint(g);
}
{
 const g=setup('oracleOfTheUnmade');for(const r of g.e.RESOURCES)g.p.resources[r]=20;
 const all=legal(g).filter(a=>a.ability==='oracle');g.s.marketDecks=Object.fromEntries(Object.entries(g.s.marketDecks).map(([k,v])=>[k,[...v].reverse()]));assert.deepEqual(plain(legal(g).filter(a=>a.ability==='oracle')),plain(all),'Oracle commands never disclose hidden order');
 const choice=act(g,'relic',a=>a.ability==='oracle'&&!g.e.ALL_CARDS[a.key].military);assert(g.p.hand.some(c=>c.id===choice.purchase));assert(!Object.values(g.s.marketDecks).flat().some(c=>c.id===choice.purchase));checkpoint(g);
 const m=setup('oracleOfTheUnmade');for(const r of m.e.RESOURCES)m.p.resources[r]=20;const tactic=act(m,'relic',a=>a.ability==='oracle'&&m.e.ALL_CARDS[a.key].military);assert(m.p.military.some(c=>c.id===tactic.purchase));assert(!m.p.hand.some(c=>c.id===tactic.purchase));
}
{
 const g=setup('move'),at=g.s.clusters[4].center;g.p.hand=[card('eclipseRegalia')];g.s.players[1].military=[card('aegisLattice')];g.s.fleets[at]={0:{fleet:3,explorer:0,settler:0},1:{fleet:3,explorer:0,settler:0}};g.e.executeMove(0,at,at,{units:{fleet:3,explorer:0,settler:0},moveGroup:'ships'});
 act(g,'combat_relic',a=>a.ability==='eclipse'&&a.tactic==='aegisLattice');assert.equal(g.s.pendingCombat.hands.attacker.aegisLattice,1);assert.equal(g.s.pendingCombat.hands.defender.aegisLattice,0);assert.equal(g.s.players[1].military.length,1);assert(!g.p.military.length);assert.equal(g.e.tacticHand(1).aegisLattice,1);assert.equal(g.e.combatView(0).sides.defender.available.aegisLattice,0);checkpoint(g);
}
// Opening defenses remain available after the last Fleet defects.
{
 const g=setup('crownOfTheUsurper'),at=g.s.clusters[4].center,near=Object.keys(g.s.planets).find(c=>c!==at&&g.e.travelDistance(c,at)<=6);
 g.s.players[1].hand=[card('horizonSail')];g.s.fleets[at]={0:{fleet:1,explorer:0,settler:0},1:{fleet:1,explorer:0,settler:0}};g.s.fleets[near]={1:{fleet:2,explorer:0,settler:0}};
 g.e.executeMove(0,at,at,{units:{fleet:1,explorer:0,settler:0},moveGroup:'ships'});act(g,'combat_relic',a=>a.ability==='crown');assert.equal(g.e.combatActor(),1);assert.equal(g.s.pendingCombat.stage,'opening');act(g,'combat_relic',a=>a.ability==='horizon'&&a.units.fleet===2,1);assert.equal(g.s.pendingCombat.defenderPieces.length,2);assert.equal(g.s.pendingCombat.stage,'tactic');
 const sole=battle({attackCards:['crownOfTheUsurper'],attacker:1,defender:1});act(sole,'combat_relic',a=>a.ability==='crown');assert(!sole.s.pendingCombat);assert.equal(sole.s.lastCombat.volleys.length,0);assert.equal(sole.s.lastCombat.prestigeWinner,null);
}
// A Reservoir rival finishes its private allocation instead of stalling its turn.
{
 const g=setup('prismaticReservoir');friendlyYard(g,0);g.s.market=[card('worldEngine')];g.p.strategy='economy';g.p.resourceLimits={matter:4,energy:4,biomass:4,data:8};g.p.resources={matter:4,energy:1,biomass:1,data:0};g.e.runAiOperation();assert(g.s.pendingRelic);let guard=0;while(g.s.pendingRelic&&guard++<12)g.e.runAiOperation();assert(!g.s.pendingRelic);assert(g.p.resourceLimits.matter>=6);assert.equal(Object.values(g.p.resourceLimits).reduce((n,x)=>n+x,0),20);
}
// Shared browser-policy commands make the same relic decision as solo decisions.
for(const key of ['firstDawnEchoes','worldseed','hourglassOfTwoSuns','keepersArchive','oracleOfTheUnmade','gravityScepter']){
 const seed=setup(key);seed.p.strategy='economy';seed.p.hand.push(card('signalRelay'),card('construct'));seed.p.inPlay=[card('foldedWarehouse'),card('move')];for(const r of seed.e.RESOURCES)seed.p.resources[r]=12;friendlyYard(seed,0);const at=seed.s.clusters[4].center;seed.s.fleets[at]={1:{fleet:1,settler:1,explorer:0}};
 const snapshot=seed.fresh().snapshotState(),direct=game(snapshot),server=game(snapshot);direct.e.runAiOperation();server.fresh().browserStep(0,'economy');assert.deepEqual(plain(server.fresh().snapshotState()),plain(direct.fresh().snapshotState()),key+' policy parity');
}
// Restored/tampered allocation drafts cannot manufacture capacity or strand the player.
{
 const g=setup('prismaticReservoir');g.p.resourceLimits.data=24;act(g,'relic');g.s.pendingRelic.limits.matter+=100;reject(g,0,{type:'relic_confirm'});assert.deepEqual(plain(legal(g)),[{type:'relic_cancel'}]);act(g,'relic_cancel');assert.equal(g.p.resourceLimits.matter,20);assert(g.p.hand.some(c=>c.key==='prismaticReservoir'));
}
// Removing starter-trash designs preserves ordinary paid Buy-turn trashing.
{
 const g=setup('move'),id=g.p.hand[0].id;g.s.phase='buy';g.p.buyStartHandIds=[id];g.p.resources.matter=3;act(g,'decommission',a=>a.card===id&&a.resource==='matter');assert.equal(g.p.resources.matter,0);assert(!g.p.hand.length);
}
console.log('Sixteen relics: active catalogs, every ability, real battle windows, stock/payment/capacity conservation, private search, atomic rejection and pending-choice reloads passed.');
