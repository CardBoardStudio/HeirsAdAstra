const assert=require('node:assert/strict'),{tasks,PROFILES}=require('./bot-family-study-plan.cjs');
const plan=tasks(Array.from({length:12},(_,i)=>2026111801+7919*i));assert.equal(plan.length,2016);assert.equal(plan.filter(t=>t.condition==='mixed').length,1728);
for(const seed of new Set(plan.map(t=>t.seed))){const rows=plan.filter(t=>t.seed===seed),mixed=rows.filter(t=>t.condition==='mixed');assert.equal(rows.length,168);assert.equal(new Set(mixed.map(t=>t.profiles.join(','))).size,24);
 for(const profiles of new Set(mixed.map(t=>t.profiles.join(','))))assert.equal(new Set(mixed.filter(t=>t.profiles.join(',')===profiles).map(t=>t.implementations.join(','))).size,6);
 for(const role of PROFILES)for(let seat=0;seat<4;seat++)for(const family of ['browser','native']){
  assert.equal(mixed.filter(t=>t.profiles[seat]===role&&t.implementations[seat]===family).length,18);
  assert.equal(rows.filter(t=>t.condition==='same'&&t.role===role&&t.implementations[seat]===family).length,3);
 }
}
assert(plan.every(t=>t.implementations.filter(x=>x==='browser').length===2&&t.target===30));console.log('Family plan: 2,016 cases, 12 maps, 24 role permutations, six family allocations and exact role/seat symmetry passed.');
