const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {factory}=require('./strategic-bot-study.cjs');
const root=path.resolve(__dirname,'..'),read=n=>fs.readFileSync(path.join(root,'prototypes/galactic-reach',n),'utf8');
const zero=()=>({matter:0,energy:0,biomass:0,data:0}),metrics=Array.from({length:4},()=>({gained:zero(),lost:zero(),spent:zero(),bankGiven:zero(),bankReceived:zero(),ships:{settler:0,explorer:0,fleet:0},draws:0,upgrades:0,colonizations:0,captures:0}));
const game=factory(read('app.js'),read('adapter.js'))({random:()=>0.3,studyMetrics:metrics,archiveDirectory:process.env.GR_SIMULATION_ARCHIVE_DIR,archiveMetadata:{kind:'resource-accounting-fixture'}});
const {e}=game,s=e.state,p=s.players[0],m=metrics[0];
try{
 s.activePlayer=0;s.phase='buy';p.resources={matter:10,energy:10,biomass:10,data:10};p.resourceLimits={matter:20,energy:20,biomass:20,data:20};
 p.buyStartHandIds=p.hand.map(c=>c.id);const card=p.hand[0];
 assert.equal(e.decommission(0,card.id,'biomass'),true);assert.equal(m.spent.biomass,3);assert.equal(m.resourceLedger.trashing.biomass,3);
 assert.equal(e.decommission(0,card.id,'biomass'),false);assert.equal(m.spent.biomass,3);
 const gained=m.gained.data;assert.equal(e.bankTrade(0,'matter','data'),true);assert.equal(m.gained.data-gained,1);assert.equal(m.bankGiven.matter,4);assert.equal(m.spent.matter,0,'Bank outflow is separate');
 p.bankExchangeResources=['biomass'];assert.equal(e.bankTrade(0,'biomass','energy'),true);assert.equal(m.bankGiven.biomass,2);assert.equal(m.resourceLedger.bankGiven.biomass,2);assert.equal(m.spent.biomass,3,'2:1 exchanges are bank outflows,not trashing costs');
 s.phase='operations';p.hand.push({id:'consortium-fixture',key:'tradeConsortium'});s.pendingConsortium={playerId:0,cardId:'consortium-fixture',trades:0};
 assert.equal(e.consortiumExchange(0,'energy','biomass'),true);assert.equal(m.spent.energy,2);assert.equal(m.resourceLedger.consortiumGiven.energy,2);
 const resume=game.a.snapshotState();const resumed=factory(read('app.js'),read('adapter.js'))({random:()=>0.3,studyMetrics:metrics,resume,simulationArchive:game.archive});
 assert.equal(resumed.e.consortiumExchange(0,'energy','data'),true);assert.equal(m.spent.energy,4,'Handoff retains the resource ledger');assert.equal(m.resourceLedger.trashing.biomass,3);
 console.log('Study resource accounting: actual trashing, rejection, bank receipts, Consortium costs and resume accumulation passed.');
}finally{game.archive.finish({reason:'resource-accounting-fixture',incomplete:true});}
