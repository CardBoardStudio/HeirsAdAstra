const assert=require('node:assert/strict'),{paired}=require('./analyze-card-ranking.cjs');
const r=paired([{seed:1,points:2,wins:.25},{seed:2,points:2,wins:.25}],1000);assert.equal(r.prestigeGain,2);assert.deepEqual(r.prestige95,[2,2]);assert.equal(r.winProbabilityGain,.25);assert.deepEqual(r.winProbability95,[.25,.25]);
const zero=paired([{seed:1,points:0,wins:0},{seed:2,points:0,wins:0}],1000);assert.deepEqual(zero.prestige95,[0,0]);assert.equal(zero.winProbabilityGain,0);
const mixed=paired([{seed:1,points:-4,wins:-.5},{seed:2,points:4,wins:.5}],1000);assert.equal(mixed.prestigeGain,0);assert(mixed.prestige95[0]<0&&mixed.prestige95[1]>0);assert.deepEqual(mixed,paired([{seed:1,points:-4,wins:-.5},{seed:2,points:4,wins:.5}],1000));
console.log('Ranking analysis:baseline-minus-omission sign,map blocks,zero effects,uncertainty and deterministic independent analysis RNG passed.');
