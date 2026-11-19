const assert=require('node:assert/strict'),{payment}=require('./audit-native-harvester-spending.cjs');
assert.deepEqual(payment({type:'resource-payment',result:true,before:{matter:2,energy:2,data:2},after:{matter:1,energy:1,data:1}}),{matter:1,energy:1,biomass:0,data:1});
assert.deepEqual(payment({type:'resource-payment',result:true,before:{matter:2},after:{matter:2}}),{matter:0,energy:0,biomass:0,data:0});
assert.equal(payment({type:'resource-payment',result:false,before:{},after:{}}),null);assert.equal(payment({type:'draw'}),null);
assert.throws(()=>payment({type:'resource-payment',result:true,before:{matter:1},after:{matter:2}}),/must not create/);
console.log('Harvester payment analysis: paid, free, failed, unrelated and invalid-gain events pass.');
