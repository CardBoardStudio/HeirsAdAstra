// A policy switch must not change the engine's random stream or ordinary accounting.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {simulate,factory}=require('./strategic-bot-study.cjs');
const source=Object.fromEntries(['app','adapter'].map(k=>[k,fs.readFileSync(path.join(__dirname,`../prototypes/galactic-reach/${k}.js`),'utf8')]));
const task={seed:720003,rotation:0,mode:'control',profiles:['military','economy','expansion','military'],policies:['baseline','baseline','baseline','baseline']};
const sources={baseline:source,updated:source},a=simulate(task,sources),b=simulate({...task,policies:['baseline','updated','baseline','updated']},sources);
const normalize=g=>({mapHash:g.mapHash,completed:g.completed,winner:g.winner,round:g.round,steps:g.steps,players:g.players.map(({policy,...p})=>p)});
assert.equal(JSON.stringify(normalize(a)),JSON.stringify(normalize(b)),'Resuming the identical policy between seats preserves all decisions, draws and resource accounting');
let seedA=17,seedB=17;
const randomA=()=>((seedA=(Math.imul(seedA,1664525)+1013904223)>>>0)/2**32),randomB=()=>((seedB=(Math.imul(seedB,1664525)+1013904223)>>>0)/2**32);
const metrics=Array.from({length:4},()=>({gained:{matter:0,energy:0,biomass:0,data:0},lost:{matter:0,energy:0,biomass:0,data:0},spent:{matter:0,energy:0,biomass:0,data:0},draws:0}));
const x=factory(source.app,source.adapter)({random:randomA}),y=factory(source.app,source.adapter)({random:randomB,studyMetrics:metrics});
assert.equal(JSON.stringify(x.a.snapshotState()),JSON.stringify(y.a.snapshotState()),'Telemetry does not change setup or RNG');
assert(metrics.every(m=>m.draws===5));
console.log('Strategic study: identical-policy controls preserve full results across seat handoffs; instrumentation preserves setup and RNG.');
