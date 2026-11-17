const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {candidateSource,validateSources,oldText,newText}=require('./compare-seed-ark-choice.cjs');
const candidate=fs.readFileSync(path.join(__dirname,'../prototypes/galactic-reach/app.js'),'utf8');
const control=candidate.replace('colonyCost: 1, fallbackDraw: 2,','colonyCost: 1,').replace(newText,oldText);
assert.equal(candidateSource(control),candidate);validateSources(control,candidate);
for(const changed of [candidate.replace('fallbackDraw: 2','fallbackDraw: 1'),candidate.replace('cost: {"biomass": 4}','cost: {"biomass": 3}'),candidate.replace('drawCards(player,ALL_CARDS[card.key].fallbackDraw)','drawCards(player,99)'),candidate+'\n// Unrelated change'])assert.throws(()=>validateSources(control,changed));
assert.throws(()=>validateSources(candidate,control));
console.log('Seed Ark comparison accepts only the alternate draw-two field/text; wrong draw, price, hidden engine, unrelated and reversed changes fail.');
