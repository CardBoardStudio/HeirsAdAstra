const fs=require('node:fs'),assert=require('node:assert/strict');
const {compare}=require('./compare-world-engine-price.cjs'),{hash}=require('./lib/simulation-archive.cjs');
const oldText='Colonize with a Settler for 1 Biomass. The Settler is consumed; Seed Ark stays in your deck.';
const newText='Choose: colonize with a Settler for 1 Biomass, consuming the Settler; or draw two cards instead. Seed Ark stays in your deck.';
function candidateSource(control){
 const line=control.match(/seedArk: \{[^\n]+/);assert(line,'Seed Ark definition required');const original=line[0];assert(original.includes('cost: {"biomass": 4}'));assert(original.includes(oldText));assert(!original.includes('fallbackDraw'));
 const changed=original.replace('colonyCost: 1, text:','colonyCost: 1, fallbackDraw: 2, text:').replace(oldText,newText);assert.notEqual(changed,original);assert(changed.includes('fallbackDraw: 2'));
 return control.replace(original,changed);
}
function validateSources(control,candidate){assert.equal(candidate,candidateSource(control),'Only the declared Seed Ark draw alternative and printed text may differ');}
if(require.main===module){const[out,left,right]=process.argv.slice(2);const r=compare(left,right,validateSources,'Seed Ark adds an alternative draw-two order; unchanged four-Biomass price and Colony terms. Native binary, adapter and all shared framework code match; canonical references describe their respective card.','declared Seed Ark choice transformation');r.entrySourceHash=hash(fs.readFileSync(__filename));fs.writeFileSync(out,JSON.stringify(r,null,2));console.log(JSON.stringify({delta:r.delta,seedBootstrap95:r.seedBootstrap95,galaxies:r.galaxies}));}
module.exports={candidateSource,validateSources,oldText,newText};
