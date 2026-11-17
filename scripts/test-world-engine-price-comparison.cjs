const assert=require('node:assert/strict');
const {validateSources}=require('./compare-world-engine-price.cjs');
const control='before\nworldEngine: { cost: {"matter": 6, "energy": 1, "biomass": 1}, orderDraw: 1 },\nafter\n';
const candidate=control.replace('"matter": 6','"matter": 4');
validateSources(control,candidate);
for(const changed of [candidate+'unrelated',candidate.replace('orderDraw: 1','orderDraw: 2'),candidate.replace('"energy": 1','"energy": 0'),candidate.replace('before','other')])assert.throws(()=>validateSources(control,changed));
assert.throws(()=>validateSources(candidate,control));
assert.throws(()=>validateSources('no definition',candidate));
console.log('World Engine price comparison: exact change accepted; effect, unrelated, other-cost, reversed and missing-definition changes rejected.');
