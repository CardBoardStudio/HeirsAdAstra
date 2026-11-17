// Paired archive-result analysis. Resample galaxies, retaining their seat rotations together.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {hash}=require('./lib/simulation-archive.cjs');
function compareRows(left,right,repeats=10000){
 assert(Number.isInteger(repeats)&&repeats>0,'Positive integer bootstrap count required');
 const key=g=>`${g.seed}/${g.rotation}`,maps=rows=>{const m=new Map();for(const g of rows){assert(g.completed,'Incomplete games require separate cutoff reporting');assert(!m.has(key(g)),'Duplicate case');m.set(key(g),g);}return m;},a=maps(left),b=maps(right);
 assert(a.size>0&&a.size===b.size,'Unequal or empty paired samples');const seeds=new Map();
 for(const [key,x] of a){const y=b.get(key);assert(y,'Missing paired case');assert.equal(x.mapHash,y.mapHash,'Opening map mismatch');const xi=x.subjectSeat??(4-x.rotation)%4,yi=y.subjectSeat??(4-y.rotation)%4,block=seeds.get(x.seed)||[];block.push({rotation:x.rotation,winDelta:Number(y.winner===yi)-Number(x.winner===xi),pointDelta:y.players[yi].points-x.players[xi].points});seeds.set(x.seed,block);}
 const mean=(rows,k)=>rows.reduce((n,r)=>n+r[k],0)/rows.length,blocks=[...seeds].sort((a,b)=>a[0]-b[0]).map(([seed,rows])=>({seed,rotations:rows.map(r=>r.rotation).sort(),winDelta:mean(rows,'winDelta'),pointDelta:mean(rows,'pointDelta')}));
 for(const block of blocks)assert.deepEqual(block.rotations,blocks[0].rotations,'Each galaxy must have the same rotations');
 let rng=1701;const random=()=>((rng=(Math.imul(rng,1664525)+1013904223)>>>0)/2**32),draws={winDelta:[],pointDelta:[]};
 for(let i=0;i<repeats;i++){let w=0,p=0;for(let j=0;j<blocks.length;j++){const b=blocks[Math.floor(random()*blocks.length)];w+=b.winDelta;p+=b.pointDelta;}draws.winDelta.push(w/blocks.length);draws.pointDelta.push(p/blocks.length);}
 const interval=k=>{const x=draws[k].sort((a,b)=>a-b);return[x[Math.floor(.025*(x.length-1))],x[Math.ceil(.975*(x.length-1))]];};
 return {pairs:a.size,galaxies:blocks.length,direction:'right minus left',delta:{winRate:mean(blocks,'winDelta'),points:mean(blocks,'pointDelta')},seedBootstrap95:{winRate:interval('winDelta'),points:interval('pointDelta')},blocks,repeats,scope:'Exploratory paired percentile bootstrap over whole galaxies; rotations stay together. Small galaxy samples remain uncertain. Analysis RNG seed 1701 is independent of recorded game RNG.'};
}
function compare(left,right){
 const read=d=>{const p=JSON.parse(fs.readFileSync(path.join(d,'protocol.json'))),raw=fs.readFileSync(path.join(d,'results.jsonl'),'utf8'),rows=raw.trim().split('\n').filter(Boolean).map(JSON.parse);assert.equal(rows.length,p.seeds*p.rotations.length,'Unfinished scheduled batch');return{protocol:p,rows,resultsHash:hash(raw)};},a=read(left),b=read(right);
 assert.equal(a.protocol.target,b.protocol.target);assert.equal(a.protocol.binaryHash,b.protocol.binaryHash,'Policy binary mismatch');assert.deepEqual(a.protocol.sourceHashes,b.protocol.sourceHashes,'Frozen sources mismatch');
 return {left,right,sourceHash:hash(fs.readFileSync(__filename)),leftResultsHash:a.resultsHash,rightResultsHash:b.resultsHash,protocols:{left:a.protocol,right:b.protocol},...compareRows(a.rows,b.rows)};
}
if(require.main===module){const [out,left,right]=process.argv.slice(2),result=compare(left,right);fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify({delta:result.delta,seedBootstrap95:result.seedBootstrap95,galaxies:result.galaxies}));}
module.exports={compareRows,compare};
