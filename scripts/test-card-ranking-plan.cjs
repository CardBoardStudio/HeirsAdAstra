const assert=require('node:assert/strict'),{tasksFor}=require('./rank-market-cards.cjs');
const cards=Array.from({length:34},(_,i)=>'card'+i),seedList=Array.from({length:8},(_,i)=>2210010+7919*i),tasks=tasksFor({cards,seedList,target:40,maxRound:80,catalogMarket:true});
assert.equal(tasks.length,1096);assert.equal(tasks.filter(t=>t.kind==='baseline').length,8);assert(tasks.every(t=>t.profiles.length===4&&t.profiles.every(p=>p==='market')));assert.equal(new Set(tasks.map(t=>t.id)).size,1096);
for(const seed of seedList){assert.equal(tasks.filter(t=>t.seed===seed&&t.kind==='baseline').length,1);for(const card of cards){const cases=tasks.filter(t=>t.seed===seed&&t.card===card);assert.equal(cases.length,4);assert.deepEqual(cases.map(t=>(4-t.rotation)%4).sort(),[0,1,2,3]);assert(cases.every(t=>t.protocol.excludeCard===card));}}
console.log('Card ranking plan:8unique baselines,1088omissions,all34designs/eight maps/four seats;no duplicate symmetric baseline games.');
