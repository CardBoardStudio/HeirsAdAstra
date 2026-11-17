const assert=require('node:assert/strict');const {validatePrice}=require('./compare-market-price.cjs');
const a='before\n    seedArk: { cost: {"biomass": 4}, colonyCost: 1 },\nafter\n',b=a.replace('"biomass": 4','"biomass": 2');
validatePrice(a,b,'seedArk',{biomass:4},{biomass:2});
for(const changed of [b+'other',b.replace('colonyCost: 1','colonyCost: 0'),b.replace('"biomass": 2','"biomass": 1')])assert.throws(()=>validatePrice(a,changed,'seedArk',{biomass:4},{biomass:2}));
assert.throws(()=>validatePrice(a,b,'other',{biomass:4},{biomass:2}));assert.throws(()=>validatePrice(a,b,'seedArk',{biomass:5},{biomass:2}));
const oldDraw='    surveyNetwork: { cost:{biomass:1,data:2}, effect:{draw:2} },\n',newDraw=oldDraw.replace('biomass:1,data:2','biomass:2,energy:1');
validatePrice(oldDraw,newDraw,'surveyNetwork',{biomass:1,data:2},{biomass:2,energy:1});
assert.throws(()=>validatePrice(oldDraw,newDraw.replace('biomass:2','biomass:-2'),'surveyNetwork',{biomass:1,data:2},{biomass:-2,energy:1}));
console.log('Declared price comparison accepts only the specified card price; effect, unrelated, wrong-card and wrong-price changes fail.');
