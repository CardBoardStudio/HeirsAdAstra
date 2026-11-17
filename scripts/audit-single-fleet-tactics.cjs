// Conservative perfect-response lower bound, not a general combat simulator.
// Scope: one Fleet each, no orders, reactions, escape or additional pieces.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {hash}=require('./lib/simulation-archive.cjs');
function solve(catalog,owned=[],enemy=[],position={}){
 const base=['concentratedFire','concentratedFire','defensiveScreen','defensiveScreen'],memo=new Map(),choices=new Map();
 function visit(a,b,ours,theirs,volley){
  if(a<=0)return -1;if(b<=0)return 1;if(volley===3)return 0;
  const key=JSON.stringify([a,b,ours,theirs,volley]);if(memo.has(key))return memo.get(key);
  let best=-2,bestTactic=null;
  for(const x of new Set(ours)){
   let worst=1;const u=catalog[x],nextOurs=ours.slice();nextOurs.splice(nextOurs.indexOf(x),1);
   for(const y of new Set(theirs)){
    const v=catalog[y],nextTheirs=theirs.slice();nextTheirs.splice(nextTheirs.indexOf(y),1);
    const value=visit(a-Math.max(0,3+v.attack-(v.pierce?0:u.shield)),b-Math.max(0,3+u.attack-(u.pierce?0:v.shield)),nextOurs,nextTheirs,volley+1);
    worst=Math.min(worst,value);
   }
   if(worst>best){best=worst;bestTactic=x;}
  }
  memo.set(key,best);choices.set(key,bestTactic);return best;
 }
 const start=[position.a??7,position.b??7,position.ours??[...base,...owned],position.theirs??[...base,...enemy],position.volley??0];
 const lowerBound=visit(...start);return {lowerBound,tactic:choices.get(JSON.stringify(start))??null,states:memo.size};
}
function run(){
 const root=path.resolve(__dirname,'../prototypes/galactic-reach'),app=fs.readFileSync(path.join(root,'app.js'),'utf8'),adapter=fs.readFileSync(path.join(root,'adapter.js'),'utf8'),ctx=vm.createContext({});
 vm.runInContext(adapter+app,ctx);let e;const create=ctx.createGalacticAdapter;ctx.createGalacticAdapter=p=>{e=p;return create(p);};ctx.createGalacticReach({headless:true,random:()=>0.3});
 const catalog=JSON.parse(JSON.stringify(e.MILITARY_CARDS)),rows=[];
 for(const own of [[],...Object.keys(catalog).filter(k=>e.MARKET_CARDS[k]).map(k=>[k]),['phaseLance','aegisLattice'],['novaBarrage','aegisLattice']])rows.push({owned:own,...solve(catalog,own)});
 return {sourceHash:hash(fs.readFileSync(__filename)),appHash:hash(app),scope:'One Fleet versus one Fleet, three simultaneous volleys, base tactics plus listed owned market cards. Defender chooses worst response to each attacker choice. No reactions/orders/multiple pieces. Lower bound: 1 guaranteed surviving win, 0 surviving non-win, -1 possible destruction (including mutual wipe). Not win probability or full-engine validation.',rows};
}
if(require.main===module){const result=run();if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));}
module.exports={solve,run};
