// Equally skilled Economy versus Market subject; no gameplay/card transformation.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {compare}=require('./compare-market-studies.cjs'),{archiveRecords,hash}=require('./lib/simulation-archive.cjs');
const rows=d=>fs.readFileSync(path.join(d,'results.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
function opening(directory){
 const random=[];
 for(const r of archiveRecords(directory)){
  if(r.type==='random')random.push({sequence:r.sequence,value:r.value});
  if(r.type==='before-decision')return {state:r.position,counters:r.counters,random};
 }
 throw Error('No first decision');
}
function audit(economy,market){
 const result=compare(economy,market),a=result.protocols.left,b=result.protocols.right;
 assert.deepEqual(a.profiles,['economy','economy','expansion','military']);assert.deepEqual(b.profiles,['market','economy','expansion','military']);
 for(const p of [a,b]){for(const k of ['productionDiscipline','protectedMarketBudget','constructionDiscipline'])assert.equal(p[k],'all');assert.equal(p.marketFilter,'off');assert.equal(p.resourceAccounting,'receipt-ledger-v2');assert.equal(p.subjectMarket,'normal');}
 const omit=p=>Object.fromEntries(Object.entries(p).filter(([k])=>!['profiles','variant','binary'].includes(k)));assert.deepEqual(omit(a),omit(b),'Unrelated profile-study protocol differs');
 let tooling=null,archives=0;const left=rows(economy),right=rows(market),key=g=>`${g.seed}/${g.rotation}`,cases=new Map(left.map(g=>[key(g),g]));
 for(const [directory,protocol,games] of [[economy,a,left],[market,b,right]])for(const g of games){
  assert.deepEqual(g.protocol,protocol);const manifest=JSON.parse(fs.readFileSync(path.join(g.archive,'manifest.json'))),source={};
  const archived=fs.readFileSync(path.join(g.archive,'sources/protocol.json'));assert.equal(hash(archived),manifest.sourceHashes['protocol.json']);assert.deepEqual(JSON.parse(archived),protocol);
  for(const name of ['study-runner.cjs','native-study.cjs','recorder.cjs','resource-ledger.cjs']){const bytes=fs.readFileSync(path.join(g.archive,'sources',name));assert.equal(hash(bytes),manifest.sourceHashes[name]);source[name]=manifest.sourceHashes[name];}
  if(!tooling)tooling=source;assert.deepEqual(source,tooling,'Executed tooling differs');archives++;
 }
 const openings=[];
 for(const g of right){
  const x=cases.get(key(g));assert(x);assert.equal(x.subjectSeat,g.subjectSeat);const seat=g.subjectSeat;
  assert.equal(x.players[seat].profile,'economy');assert.equal(g.players[seat].profile,'market');for(const p of g.players)if(p.seat!==seat)assert.equal(p.profile,x.players[p.seat].profile,'Opponent profile changed');
  const l=opening(x.archive),r=opening(g.archive);assert.equal(l.state.players[seat].strategy,'economy');assert.equal(r.state.players[seat].strategy,'market');
  l.state.players[seat].strategy='subject';r.state.players[seat].strategy='subject';assert.deepEqual(r.state,l.state,'Opening differs beyond subject strategy');assert.deepEqual(r.counters,l.counters);assert.deepEqual(r.random,l.random,'Setup RNG differs');
  openings.push({seed:g.seed,rotation:g.rotation,subjectSeat:seat,normalizedStateHash:hash(l.state),counters:l.counters,setupRandomCalls:l.random.length,randomPrefixHash:hash(l.random)});
 }
 return {...result,comparisonSourceHash:hash(fs.readFileSync(__filename)),toolingHashes:tooling,archives,openings,scope:'Market minus equally skilled Economy subject. All actors share production/protected-budget/full-construction planning;only lineup slot0 strategy differs. Same opponents,sources,binary,tooling,private opening hands/map/stocks/counters and setup RNG. Opening normalization changes only the verified subject strategy. Full later-state/mechanism audits are separate.'};
}
if(require.main===module){const[out,economy,market]=process.argv.slice(2),r=audit(economy,market);fs.writeFileSync(out,JSON.stringify(r,null,2));console.log(JSON.stringify({delta:r.delta,seedBootstrap95:r.seedBootstrap95,openingPairs:r.openings.length}));}
module.exports={audit,opening};
