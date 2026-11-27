// Rules #movement: five Fleets per faction per hex, through every authoritative entry point.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.resolve(__dirname,'../prototypes/galactic-reach'),plain=x=>JSON.parse(JSON.stringify(x));
let serial=0;const card=key=>({id:`group-limit-${serial++}`,key}),ships=(fleet,settler=0,explorer=0)=>({fleet,settler,explorer});
function game(resume){
 const c=vm.createContext({});vm.runInContext(['adapter.js','app.js'].map(f=>fs.readFileSync(path.join(dir,f),'utf8')).join('\n'),c);
 const factory=c.createGalacticAdapter;let e;c.createGalacticAdapter=p=>{e=p;return factory(p);};
 const a=c.createGalacticReach({headless:true,random:()=>.3,...(resume?{resume}:{})}),s=e.state;
 if(!resume){s.phase='operations';s.activePlayer=0;s.turnStage='action';s.fleets={};for(const p of s.players){p.hand=[];p.deck=[];p.discard=[];p.inPlay=[];p.passed=false;p.resources={matter:15,energy:15,biomass:15,data:15};p.resourceLimits={matter:15,energy:15,biomass:15,data:15};}}
 return {e,s,a,p:s.players[0],fresh:()=>factory(e)};
}
function atomic(g,fn){const before=JSON.stringify(g.s),counters=[g.e.cardSerial,g.e.turnSerial];assert.equal(fn(),false);assert.equal(JSON.stringify(g.s),before);assert.deepEqual([g.e.cardSerial,g.e.turnSerial],counters);}
function yard(g,coord,owner=0){Object.assign(g.s.planets[coord],{owner,upgrade:'starbase',hasColony:false});return coord;}
function battle(g,attack=1,defend=1){
 const at='0,0';Object.assign(g.s.planets[at],{owner:null,upgrade:null,hasColony:false});
 g.s.fleets[at]={0:ships(attack),1:ships(defend)};
 assert(g.e.executeMove(0,at,at,{units:ships(attack)}));assert(g.s.pendingCombat);return at;
}
function volley(g,tactic='concentratedFire'){for(const seat of [0,1])assert(g.e.applyCombatAction(seat,{type:'combat_tactic',tactic}));}
{
 const g=game();g.p.hand=[card('move')];g.s.fleets={'0,0':{0:ships(3)},'1,0':{0:ships(3)}};
 assert(!g.e.reachableFrom('0,0',0,2,false,ships(3)).includes('1,0'));
 assert(g.e.reachableFrom('0,0',0,2,false,ships(2)).includes('1,0'));
 atomic(g,()=>g.e.executeMove(0,'0,0','1,0',{units:ships(3)}));
 const forged={type:'move',card:g.p.hand[0].id,key:'move',source:'0,0',destination:'1,0',moveGroup:'ships',units:ships(3)};
 const before=JSON.stringify(g.s);assert.throws(()=>g.fresh().applyAction(0,forged),/Illegal action/);assert.equal(JSON.stringify(g.s),before);
 const legal=g.fresh().legalActions(0).find(a=>a.type==='move'&&a.destination==='1,0'&&a.units.fleet===2);assert(legal);g.fresh().applyAction(0,legal);
 assert.equal(g.s.fleets['1,0'][0].fleet,5);assert.equal(g.s.fleets['0,0'][0].fleet,1);
 const resumed=game(plain(g.fresh().snapshotState()));assert.deepEqual(plain(resumed.a.snapshotState()),plain(g.fresh().snapshotState()));
}
{
 const g=game();g.s.fleets={'0,0':{0:ships(2)},'1,0':{0:ships(5)}};
 const reach=g.e.reachableFrom('0,0',0,2,false,ships(2));assert(!reach.includes('1,0'));assert(reach.includes('2,0'),'May cross a full friendly hex without ending there');
 assert(g.e.executeMove(0,'1,0','1,0',{units:ships(5)}));assert.equal(g.s.fleets['1,0'][0].fleet,5,'Stationary movement never double-counts');
 g.s.fleets['0,0'][0]=ships(0,8,5);assert(g.e.executeMove(0,'0,0','1,0',{units:ships(0,8)}));
 assert(g.e.executeMove(0,'0,0','1,0',{units:ships(0,0,5),moveGroup:'explorer'}));assert.deepEqual(plain(g.s.fleets['1,0'][0]),ships(5,8,5),'Civilians use no Fleet places');
}
{
 const g=game(),at=yard(g,g.s.clusters[0].coords.find(c=>c!==g.s.clusters[0].center));g.s.fleets[at]={0:ships(5)};
 for(const discount of [null,'free','each']){atomic(g,()=>g.e.constructAt(0,at,'fleet',discount,true));atomic(g,()=>g.e.constructAt(0,at,'fleet',discount));}
 assert(g.e.buildShip(0,at,'settler'));assert(g.e.buildShip(0,at,'explorer'));
 g.s.fleets[at][0].fleet=4;assert(g.e.buildShip(0,at,'fleet'));assert.equal(g.s.fleets[at][0].fleet,5);atomic(g,()=>g.e.buildShip(0,at,'fleet'));
}
{
 const g=game();g.s.fleets={'0,0':{0:ships(2)},'1,0':{0:ships(4)}};
 assert.notEqual(g.e.findRetreat('0,0',0,'1,0'),'1,0');atomic(g,()=>g.e.retreatFleet('0,0','1,0',0));
 g.s.fleets['1,0'][0].fleet=3;assert.equal(g.e.findRetreat('0,0',0,'1,0'),'1,0');assert(g.e.retreatFleet('0,0','1,0',0));assert.equal(g.s.fleets['1,0'][0].fleet,5);
}
{
 const g=game(),at=battle(g);g.s.fleets['1,0']={0:ships(5)};
 for(const next of ['1,-1','0,-1','-1,0','-1,1','0,1'])g.s.fleets[next]={1:ships(1)};
 assert.equal(g.e.findRetreat(at,0),null);volley(g,'defensiveScreen');volley(g,'defensiveScreen');volley(g);
 assert(!g.s.fleets[at]?.[0],'Trapped attacking survivors are destroyed instead of overfilling a retreat hex');assert.equal(g.s.fleets['1,0'][0].fleet,5);
}
{
 const g=game();g.p.hand=[card('horizonSail')];const home=g.s.clusters[0].center,source=g.s.clusters[0].coords.find(c=>c!==home);
 g.s.fleets[home]={0:ships(4)};g.s.fleets[source]={0:ships(3)};
 const choices=g.e.relicOperations(0).filter(a=>a.destination===home);assert(choices.some(a=>a.units.fleet===1));assert(!choices.some(a=>a.units.fleet>1));
 const forged={...choices[0],units:ships(2)};atomic(g,()=>g.e.applyRelicAction(0,forged));
 const allowed=choices.find(a=>a.units.fleet===1);assert(g.e.applyRelicAction(0,allowed));assert.equal(g.s.fleets[home][0].fleet,5);
}
{
 for(const n of [4,5]){const g=game();g.p.hand=[card('crownOfTheUsurper')];const at=battle(g,n,2),choices=g.e.combatActions(0).filter(a=>a.ability==='crown');assert.equal(choices.length,n===4?1:0);if(n===4){assert(g.e.applyCombatAction(0,choices[0]));assert.equal(g.s.fleets[at][0].fleet,5);}}
}
{
 const g=game();g.s.players[1].hand=[card('horizonSail')];const at=battle(g,1,4);g.s.fleets['1,0']={1:ships(3)};
 g.s.pendingCombat.stage='opening';g.s.pendingCombat.relicDone={attacker:true,defender:false};
 const choices=g.e.combatActions(1).filter(a=>a.ability==='horizon');assert(choices.some(a=>a.units.fleet===1));assert(!choices.some(a=>a.units.fleet>1));
 assert(g.e.applyCombatAction(1,choices.find(a=>a.units.fleet===1)));assert.equal(g.s.fleets[at][1].fleet,5);
}
{
 const g=game();g.p.hand=[card('phoenixCrucible')];
 const sites=g.s.clusters[0].coords.filter(c=>c!==g.s.clusters[0].center),full=yard(g,sites[0]),open=yard(g,sites[1]);g.s.fleets[full]={0:ships(5)};g.s.fleets[open]={0:ships(4)};
 battle(g);volley(g);volley(g);assert.equal(g.s.pendingCombat.stage,'aftermath');
 const choices=g.e.combatActions(0).filter(a=>a.ability==='phoenix');assert(!choices.some(a=>a.destination===full));assert(choices.some(a=>a.destination===open&&a.units.fleet===1));
 assert(g.e.applyCombatAction(0,choices.find(a=>a.destination===open)));assert.equal(g.s.fleets[open][0].fleet,5);
}
console.log('Five-Fleet groups: split moves, transit, stationary moves, civilians, paid/free builds, retreats and trapped survivors, Horizon, Crown, Phoenix, authority rejection and reload passed.');
