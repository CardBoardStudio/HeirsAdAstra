const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const read=n=>fs.readFileSync(path.join(__dirname,'../prototypes/galactic-reach',n),'utf8'),plain=x=>JSON.parse(JSON.stringify(x));
// Reproduce the rejected cost mix without adopting it in current sources.
const baseline=read('app.js'),baselineLine=baseline.split('\n').find(s=>s.includes('surveyNetwork: { code:'));assert(baselineLine.includes('cost:{biomass:1,data:2}'));
const app=baseline.replace(baselineLine,baselineLine.replace('cost:{biomass:1,data:2}','cost:{biomass:2,energy:1}')),line=app.split('\n').find(s=>s.includes('surveyNetwork: { code:'));
function game(source){let seed=610010,calls=0;const c=vm.createContext({});vm.runInContext(read('adapter.js')+source,c);let e;const original=c.createGalacticAdapter;c.createGalacticAdapter=port=>{e=port;return original(port);};const a=c.createGalacticReach({headless:true,random:()=>{calls++;return ((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);}});return {a,e,s:e.state,calls};}
const control=game(app.replace(line,line.replace('cost:{biomass:2,energy:1}','cost:{biomass:1,data:2}'))),initial=game(app);assert.equal(initial.calls,control.calls);
for(const k of ['planets','clusters','market','marketDecks'])assert.equal(JSON.stringify(initial.s[k]),JSON.stringify(control.s[k]),'Same initial '+k);
for(const reshuffle of [false,true]){
 const {a,e,s}=game(app),p=s.players[0];assert.equal(e.marketTier('surveyNetwork'),'cheap');assert.deepEqual(plain(e.ALL_CARDS.surveyNetwork.cost),{biomass:2,energy:1});
 let index=s.market.findIndex(c=>c.key==='surveyNetwork');
 if(index<0){index=6;const deck=s.marketDecks.cheap,at=deck.findIndex(c=>c.key==='surveyNetwork');assert(at>=0);[deck[at],s.market[index]]=[s.market[index],deck[at]];}
 const card=s.market[index];s.phase='buy';s.activePlayer=0;p.passed=true;p.resourceLimits={matter:4,energy:4,biomass:4,data:4};p.resources={matter:0,energy:1,biomass:4,data:0};
 const buy=a.legalActions(0).find(x=>x.type==='buy'&&x.source==='market'&&x.index===index);assert(buy,'No Data needed for purchase');a.applyAction(0,buy);assert.deepEqual(plain(p.resources),{matter:0,energy:0,biomass:2,data:0});assert(p.discard.some(c=>c.id===card.id));
 const draws=[{id:'draw-a',key:'move',starter:true},{id:'draw-b',key:'construct',starter:true}];p.hand=[card];p.inPlay=[];p.deck=reshuffle?[]:draws;p.discard=reshuffle?draws:[];s.phase='operations';s.activePlayer=0;s.turnStage='action';p.passed=false;
 const play=a.legalActions(0).find(x=>x.type==='special'&&x.card===card.id);assert(play);a.applyAction(0,play);assert.deepEqual(plain(p.hand.map(c=>c.id)).sort(),['draw-a','draw-b']);assert(p.inPlay.some(c=>c.id===card.id));assert(!p.hand.some(c=>c.id===card.id),'Played card stays out of its own draw');assert.equal(p.resources.biomass,2,'Playing grants no resources');
}
console.log('Survey cost mix: same total/tier/setup/market/RNG; 2B1E purchase without Data preserves two Biomass; unchanged draw-two/in-play and reshuffle timing.');
