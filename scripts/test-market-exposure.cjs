const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {payable}=require('./audit-market-exposure.cjs');
const app=fs.readFileSync(path.join(__dirname,'../prototypes/galactic-reach/app.js'),'utf8'),keys=['matter','energy','biomass','data'];
const fn=app.slice(app.indexOf('  function bankPlanForCost('),app.indexOf('  function aiCards('));
const bankPlan=vm.runInNewContext('const RESOURCES='+JSON.stringify(keys)+';'+fn+';bankPlanForCost');
const caps={matter:20,energy:20,biomass:20,data:20};
assert(payable({matter:12,energy:4,biomass:0,data:0},caps,{matter:0,energy:0,biomass:2,data:2}));
assert(!payable({matter:11,energy:4,biomass:0,data:0},caps,{matter:0,energy:0,biomass:2,data:2}));
assert(!payable({matter:20,energy:20,biomass:20,data:4},{...caps,data:4},{matter:0,energy:0,biomass:0,data:5}));
let positives=0,negatives=0,banked=0;
let seed=191;const rand=n=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)%n);
for(let i=0;i<2000;i++){
 const limits=Object.fromEntries(keys.map(k=>[k,4+rand(9)])),resources=Object.fromEntries(keys.map(k=>[k,rand(limits[k]+1)])),cost=Object.fromEntries(keys.map(k=>[k,rand(12)]));
 const plan=bankPlan({resources,resourceLimits:limits},cost);if(plan){positives++;if(plan.length)banked++;}else negatives++;
 assert.equal(payable(resources,limits,cost),!!plan,JSON.stringify({resources,limits,cost}));
}
assert(positives>50&&negatives>50&&banked>10,'Fixtures must exercise successful banking and rejected payments');
console.log('Market exposure: opening payment classification matches the engine across 2,000 resource/limit/cost fixtures, including multi-resource banking.');
