// Actual browser controls for the new relic actions; no production APIs are written.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),http=require('node:http'),assert=require('node:assert/strict');
const {launch,findChrome}=require('./check-viewport-fit.cjs');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'prototypes/galactic-reach'),app=fs.readFileSync(path.join(dir,'app.js'),'utf8'),adapter=fs.readFileSync(path.join(dir,'adapter.js'),'utf8');
const saveKey=`galactic-reach-save-v${app.match(/const SAVE_FORMAT_VERSION = (\d+)/)[1]}`;
const plain=x=>JSON.parse(JSON.stringify(x));let serial=0;const card=key=>({key,id:`ui-relic-${serial++}`});
function game(){const c=vm.createContext({});vm.runInContext(adapter+app,c);let e,n=4;const create=c.createGalacticAdapter;c.createGalacticAdapter=p=>{e=p;return create(p);};c.createGalacticReach({headless:true,random:()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/2**32)});const s=e.state;s.phase='operations';s.activePlayer=0;s.turnStage='prep';s.pendingCombat=null;s.fleets={};for(const p of s.players){p.hand=[];p.deck=[];p.discard=[];p.inPlay=[];p.passed=false;}return {e,s,p:s.players[0]};}
function fixture(kind){const g=game(),{s,p,e}=g;
 if(kind==='gravity'){
  p.hand=[card('gravityScepter')];
  for(const at of ['0,0','2,0'])if(s.planets[at])Object.assign(s.planets[at],{owner:null,hasColony:false,upgrade:null});
  s.fleets['0,0']={1:{settler:2,explorer:3,fleet:10}};
 }
 if(kind==='echoes'){p.hand=[card('firstDawnEchoes')];p.inPlay=[{...card('construct'),starter:true,upgraded:true,level:3},card('foldedWarehouse')];}
 if(kind==='keepers'){p.hand=[card('keepersArchive')];p.resources={matter:10,energy:10,biomass:10,data:10};p.resourceLimits={matter:20,energy:20,biomass:20,data:20};s.market=[card('worldEngine')];}
 if(kind==='reservoir'||kind==='reservoir-draft'){p.hand=[card('prismaticReservoir')];p.resourceLimits={matter:4,energy:4,biomass:4,data:8};p.resources={matter:0,energy:0,biomass:0,data:5};}
 if(kind==='reservoir-draft')s.pendingRelic={playerId:0,card:p.hand[0].id,limits:{matter:5,energy:4,biomass:4,data:7}};
 if(kind==='oracle'||kind==='oracle-empty'){
  p.hand=[card('oracleOfTheUnmade')];p.resources={matter:4,energy:4,biomass:4,data:4};p.resourceLimits={matter:4,energy:4,biomass:4,data:4};
  s.marketDecks=Object.fromEntries(e.MARKET_TIERS.map(tier=>[tier.id,Object.keys(e.MARKET_CARDS).filter(key=>e.marketTier(key)===tier.id&&(kind!=='oracle-empty'||key!=='signalRelay')).map(card)]));
  s.market=[card('worldEngine')];
 }
 if(kind==='battle-five'||kind==='battle-many'){
  const at=s.clusters[4].center;s.activePlayer=1;p.hand=[];s.players[1].military=[card('deflectorGrid'),card('phaseLance')];
  const units=kind==='battle-many'?{settler:8,explorer:5,fleet:10}:{settler:0,explorer:0,fleet:5};
  s.fleets[at]={0:kind==='battle-many'?{...units}:{settler:1,explorer:0,fleet:0},1:{...units}};
  assert(e.executeMove(1,at,at,{units:{...units,explorer:0},moveGroup:'ships'}));
  assert(s.pendingCombat,'The battle fixture starts combat');
  for(const seat of [1,0])e.applyCombatAction(seat,{type:'combat_stay'});
  e.applyCombatAction(1,{type:'combat_tactic',tactic:'concentratedFire'});
 }
 if(kind==='tactics'||kind==='reinforce'){
  const at=s.clusters[4].center,source=s.clusters[0].center;Object.assign(s.planets[at],{owner:null,hasColony:false,upgrade:null});
  if(kind==='tactics'){
   p.hand=[card('warSongOfHollowStars'),card('theSilentHour')];s.fleets[at]={0:{fleet:3,explorer:0,settler:0},1:{fleet:3,explorer:0,settler:0}};
   e.executeMove(0,at,at,{units:{fleet:3,explorer:0,settler:0},moveGroup:'ships'});
   for(const seat of [0,1])e.applyCombatAction(seat,{type:'combat_stay'});
   for(const seat of [0,1])e.applyCombatAction(seat,{type:'combat_tactic',tactic:'defensiveScreen'});
  }else{
   p.hand=[card('horizonSail')];const near=Object.keys(s.planets).find(c=>c!==at&&Math.max(...c.split(',').map(Number).map(Math.abs))<2);
   s.activePlayer=1;s.fleets[at]={0:{fleet:1,explorer:0,settler:0},1:{fleet:3,explorer:0,settler:0}};s.fleets[near]={0:{fleet:2,explorer:0,settler:0}};
   e.executeMove(1,at,at,{units:{fleet:3,explorer:0,settler:0},moveGroup:'ships'});
   assert.equal(e.combatActor(),0);assert.equal(s.pendingCombat.stage,'opening');
  }
 }
 return plain(s);
}
// Every size runs every case. CHECK_SHARD=k/n keeps every nth size from the kth, so CI can run the
// sizes in n parallel jobs that together cover the whole list.
const SIZES=[[1280,720,false],[1440,900,false],[1024,768,true],[768,1024,true],[390,844,false],[844,390,true],[667,375,true]];
function shard(sizes){const [k,n]=(process.env.CHECK_SHARD||'1/1').split('/').map(Number);assert(Number.isInteger(k)&&Number.isInteger(n)&&k>=1&&k<=n,'CHECK_SHARD is k/n with 1 <= k <= n');return sizes.filter((_,i)=>i%n===k-1);}
const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname.endsWith('/channel.js')){res.setHeader('content-type','text/javascript');res.end('globalThis.galacticReachChannel=null;');return;}
 if(u.pathname.endsWith('/zk/seat.js')){res.setHeader('content-type','text/javascript');res.end('export {};');return;}
 let relative=u.pathname.replace(/^\/galactic-reach\/?/,'');if(!relative)relative='index.html';
 const file=path.resolve(dir,relative);if(!file.startsWith(dir+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');
 if(relative==='index.html'){
  let html=fs.readFileSync(file,'utf8').replace('<script src="channel.js">','<script>globalThis.drawingBoardTableBoot=true;</script><script src="channel.js">');
  html=html.replace('<script type="module" src="/galactic-reach/zk/seat.js">','<script>createGalacticReach({paused:()=>true});</script><script type="module" src="/galactic-reach/zk/seat.js">');res.end(html);
 }else fs.createReadStream(file).pipe(res);
});
async function main(){const chrome=findChrome();assert(chrome,'Chrome is required');await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`,b=await launch(chrome);
 const evaluate=x=>b.evaluate(x),wait=x=>evaluate(`new Promise((resolve,reject)=>{const start=Date.now();const poll=()=>{if(${x})resolve(true);else if(Date.now()-start>6000)reject(new Error('Relic UI did not settle'));else setTimeout(poll,30);};poll();})`);
 const saved=()=>evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(saveKey)}))`);
 const click=selector=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw new Error('Missing control '+${JSON.stringify(selector)});e.click();})()`);
 const pointer=async(selector,touch)=>{const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw new Error('Missing enabled control '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);if(!e.contains(hit))throw new Error('Covered control '+${JSON.stringify(selector)}+' at '+JSON.stringify({x,y,hit:hit?.outerHTML.slice(0,250)}));return {x,y};})()`);
  if(touch){await b.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await b.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else{await b.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});}
 };
 const select=(selector,text)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),o=[...e.options].find(o=>o.textContent.includes(${JSON.stringify(text)}));if(!o)throw new Error('Missing choice '+${JSON.stringify(text)});e.value=o.value;e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const fit=async()=>{const r=await evaluate('(()=>{const d=[...document.querySelectorAll("dialog[open]")].at(-1),r=d.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,scroll:d.scrollHeight,client:d.clientHeight,scrollWidth:d.scrollWidth,clientWidth:d.clientWidth,id:d.id,overflow:getComputedStyle(d).overflowY};})()');assert(r.left>=-1&&r.top>=-1&&r.right<=r.width+1&&r.bottom<=r.height+1,JSON.stringify(r));assert(r.scrollWidth<=r.clientWidth+2,'No horizontal dialog overflow');if(r.id==='relic-card-dialog'){const clipped=await evaluate('[...document.querySelectorAll("#relic-card-options .game-card")].filter(e=>e.scrollHeight>e.clientHeight+2).map(e=>e.querySelector(".card-name").textContent)');assert.deepEqual(clipped,[],'Card text stays inside its frame');}if(r.id==='combat-dialog'){const clipped=await evaluate('[...document.querySelectorAll("body.background-stars .combat-unit")].filter(e=>{const unit=e.getBoundingClientRect(),hull=e.querySelector(".combat-hull").getBoundingClientRect();return hull.left<unit.left-1||hull.right>unit.right+1}).length');assert.equal(clipped,0,'Each ship keeps its own hull bar inside its figure');}if(Math.min(r.width,r.height)>=600)assert(r.scroll<=r.client+2,'The relic dialog fits without page/dialog scrolling: '+JSON.stringify(r));else if(r.scroll>r.client+2)assert(['auto','scroll'].includes(r.overflow),'Phone battle content remains scrollable');};
 const load=async (kind,stars=false)=>{await b.navigate(origin+'/galactic-reach/rulebook.html');await evaluate(`localStorage.clear();localStorage.setItem('galactic-reach-background',${JSON.stringify(stars?'stars':'green')});localStorage.setItem('galactic-reach-guide-v1','{"enabled":false}');localStorage.setItem(${JSON.stringify(saveKey)},${JSON.stringify(JSON.stringify(fixture(kind)))});`);await b.navigate(origin+'/galactic-reach/');await wait('document.querySelector(".hex") && !document.querySelector("#setup-dialog")?.open');await evaluate('document.fonts.ready');};
 const shot=async name=>{if(!process.env.SHOTS)return;fs.mkdirSync(process.env.SHOTS,{recursive:true});const r=await b.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(process.env.SHOTS,name+'.png'),Buffer.from(r.data,'base64'));};
 try{
  await b.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await b.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  for(const [width,height,touch] of (process.env.CHECK_SIZES?process.env.CHECK_SIZES.split(',').map(v=>{const [w,h]=v.split('x').map(Number);return [w,h,w<1200];}):shard(SIZES))){
   await b.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:touch});await b.send('Emulation.setTouchEmulationEnabled',{enabled:touch,maxTouchPoints:1});
   for(const stars of [false,true]){
    await load('gravity',stars);
    const shapes=await evaluate(`(()=>{const svg=document.querySelector('#resource-grid .resource-symbol svg[data-max-resource]');return {classic:getComputedStyle(svg.querySelector('.max-resource-shape')).display,modern:getComputedStyle(svg.querySelector(':scope > :not(.max-resource-shape)')).display};})()`);
    assert.equal(shapes.classic!=='none',stars);assert.equal(shapes.modern!=='none',!stars);
    // Switching the preference changes these same, already-rendered symbols immediately.
    await evaluate('document.body.classList.toggle("background-stars")');
    assert.equal(await evaluate('getComputedStyle(document.querySelector("#resource-grid .max-resource-shape")).display!=="none"'),!stars);
    await evaluate('document.body.classList.toggle("background-stars")');
    const badges=await evaluate(`(()=>{const hex=document.querySelector('.hex[data-coord="0,0"]'),h=hex.getBoundingClientRect();return [...hex.querySelectorAll('.board-icon-count')].map(e=>{const r=e.getBoundingClientRect();return {count:e.dataset.count,clipped:e.scrollWidth>e.clientWidth+1,corners:[[r.left,r.top],[r.right,r.top],[r.left,r.bottom],[r.right,r.bottom]].map(([x,y])=>[(x-h.left)/h.width,(y-h.top)/h.height])};});})()`);
    assert.deepEqual(badges.map(b=>b.count).sort(),['10','2','3']);
    for(const badge of badges){assert(!badge.clipped,'Full mixed ship count fits');for(const [x,y] of badge.corners){const inset=y<.25?.5-2*y:y>.75?2*y-1.5:0;assert(x>=inset-.02&&x<=1-inset+.02&&y>=0&&y<=1,'Mixed ship count stays inside the hex: '+JSON.stringify(badge));}}
    const before=await saved();await click('[data-order-card]');
    assert.deepEqual(await evaluate('[...document.querySelectorAll(".hex.target")].map(e=>e.dataset.coord)'),['0,0'],'Start by highlighting enemy ships only');
    assert((await evaluate('document.querySelector("#relic-map-controls").textContent')).includes('enemy ship hex'));
    await pointer('.hex[data-coord="0,0"]',touch);await wait('document.querySelector("#relic-map-controls").textContent.includes("destination within")');
    assert(await evaluate('document.querySelector(".hex[data-coord=\\"2,0\\"]").classList.contains("target")'));
    assert(!await evaluate('document.querySelector(".hex[data-coord=\\"5,0\\"]").classList.contains("target")'));
    await pointer('.hex[data-coord="2,0"]',touch);await wait('document.querySelector("#relic-map-units")');await select('#relic-map-units','1 Fleet');
    assert.deepEqual(await saved(),before,'Map and count selection spend nothing');await shot(`gravity-controls-${stars?'max':'willem'}-${width}x${height}`);
    await pointer('#relic-map-reset',touch);await wait('document.querySelectorAll(".hex.target").length===1');assert.deepEqual(await evaluate('[...document.querySelectorAll(".hex.target")].map(e=>e.dataset.coord)'),['0,0']);
    await pointer('#relic-map-cancel',touch);await wait('document.querySelector("#relic-map-controls").hidden');assert.deepEqual(await saved(),before);
    await click('[data-order-card]');await pointer('.hex[data-coord="0,0"]',touch);await wait('document.querySelector("#relic-map-controls").textContent.includes("destination within")');await pointer('.hex[data-coord="2,0"]',touch);await wait('document.querySelector("#relic-map-units")');
    await evaluate('(()=>{const e=document.querySelector("#relic-map-units");e.value=[...e.options].find(o=>o.textContent==="1 Fleet").value;})()');
    await shot(`gravity-${stars?'max':'willem'}-${width}x${height}`);await pointer('#relic-map-confirm',touch);await wait('document.querySelector("#relic-map-controls").hidden');
    const after=await saved();assert.deepEqual(after.fleets['0,0'][1],{settler:2,explorer:3,fleet:9});assert.deepEqual(after.fleets['2,0'][1],{settler:0,explorer:0,fleet:1});
   }
   await load('echoes');await click('[data-order-card]');await wait('document.querySelector("#relic-action-dialog").open');await fit();
   await select('#relic-choice-options','Construct III + Folded Warehouse');await shot(`echoes-${width}x${height}`);
   if(touch){const p=await evaluate('(()=>{const r=document.querySelector("#relic-choice-confirm").getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()');await b.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await b.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
   else{await evaluate('document.querySelector("#relic-choice-confirm").focus()');await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});}
   await wait('!document.querySelector("#relic-action-dialog").open');let s=await saved();assert.equal(s.players[0].hand.length,2);assert(s.players[0].inPlay.some(c=>c.key==='firstDawnEchoes'));
   await load('keepers');await click('[data-order-card]');await select('#relic-choice-options','World Engine · pay 4 Matter');await fit();assert((await evaluate('document.querySelector("#relic-choice-detail").textContent')).includes("Build or commission once at no resource cost"), await evaluate('JSON.stringify({value:document.querySelector("#relic-choice-options").value,text:document.querySelector("#relic-choice-detail").textContent,hidden:document.querySelector("#relic-choice-detail").hidden})'));await shot(`keepers-${width}x${height}`);await click('#relic-choice-cancel');s=await saved();assert.equal(s.players[0].resources.matter,10);assert(s.players[0].hand.some(c=>c.key==='keepersArchive'));
   await click('[data-order-card]');await select('#relic-choice-options','World Engine · pay 4 Matter');await click('#relic-choice-confirm');s=await saved();assert.equal(s.players[0].resources.matter,6);assert(s.players[0].discard.some(c=>c.key==='worldEngine'));
   await load('reservoir');await click('[data-order-card]');await click('#relic-choice-confirm');await wait('document.querySelector("#relic-choice-help").textContent.includes("Capacity draft")');
   await select('#relic-choice-options','Move 3 capacity: Data → Matter');await click('#relic-choice-confirm');await fit();s=await saved();assert.equal(s.pendingRelic.limits.matter,7);assert.equal(s.players[0].resourceLimits.matter,4);
   await b.navigate(origin+'/galactic-reach/');await wait('document.querySelector("#relic-action-dialog").open');await fit();await select('#relic-choice-options','Confirm capacity redistribution');await click('#relic-choice-confirm');s=await saved();assert.equal(s.players[0].resourceLimits.matter,7);assert.equal(s.players[0].resourceLimits.data,5);
   // Max's UI chooses signed deltas in the same four-row form as Capacity Module.
   await load('reservoir',true);await click('[data-order-card]');await wait('document.querySelector("#storage-allocation-dialog").open');await fit();
   assert.equal(await evaluate('document.querySelector("#relic-action-dialog").open'),false);
   const beforeReservoir=await saved();
   const delta=async (resource,value)=>evaluate(`(()=>{const input=document.querySelector('#storage-points-${resource}');input.value=${JSON.stringify(String(value))};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
   const nativeConfirm=async()=>{const point=await evaluate('(()=>{const e=document.querySelector("#storage-allocation-confirm");if(e.disabled)throw new Error("Allocation is disabled");e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()');
    if(touch){await b.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await b.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
    else{await b.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});}
   };
   assert.deepEqual(await evaluate('[...document.querySelectorAll("#storage-allocation-options input")].map(e=>e.value)'),['0','0','0','0']);
   // Native number-input arrows: +1 and -1 make a balanced draft.
   for(const [resource,key,code] of [['matter','ArrowUp',38],['data','ArrowDown',40]]){await evaluate(`document.querySelector('#storage-points-${resource}').focus()`);await b.send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:code});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key});}
   assert.equal(await evaluate('document.querySelector("#storage-points-matter").value'),'1');assert.equal(await evaluate('document.querySelector("#storage-points-data").value'),'-1');
   await delta('matter',3);assert(await evaluate('document.querySelector("#storage-allocation-confirm").disabled'));
   await evaluate('document.querySelector("#storage-allocation-form").dispatchEvent(new Event("submit",{cancelable:true,bubbles:true}))');assert.deepEqual(await saved(),beforeReservoir);
   await delta('data',-3);assert.equal(await evaluate('document.querySelector("#storage-allocation-confirm").disabled'),false);await shot(`reservoir-max-${width}x${height}`);
   await delta('matter',4);await delta('data',-4);assert(await evaluate('document.querySelector("#storage-allocation-confirm").disabled'),'A balanced total still respects held stock');
   await delta('matter',3);await delta('data',-3);await nativeConfirm();await wait('!document.querySelector("#storage-allocation-dialog").open');
   s=await saved();assert.deepEqual(s.players[0].resourceLimits,{matter:7,energy:4,biomass:4,data:5});assert.deepEqual(s.players[0].resources,beforeReservoir.players[0].resources);assert(s.players[0].inPlay.some(c=>c.key==='prismaticReservoir'));
   await load('reservoir-draft',true);await wait('document.querySelector("#storage-allocation-dialog").open');await fit();assert.equal(await evaluate('document.querySelector("#storage-points-matter").value'),'1');assert.equal(await evaluate('document.querySelector("#storage-points-data").value'),'-1');await click('#storage-allocation-cancel');await wait(`!JSON.parse(localStorage.getItem(${JSON.stringify(saveKey)})).pendingRelic`);s=await saved();assert(!s.pendingRelic);assert.equal(s.players[0].resourceLimits.data,8);assert(s.players[0].hand.some(c=>c.key==='prismaticReservoir'));
   await load('oracle',true);await click('[data-order-card]');await wait('document.querySelector("#relic-card-dialog").open');await fit();
   assert.equal(await evaluate('document.querySelectorAll("#relic-card-options .card-choice-tier").length'),3);
   assert.equal(await evaluate('document.querySelectorAll("#relic-card-options [data-relic-card]").length'),27);
   assert((await evaluate('document.querySelectorAll("[data-relic-card]:disabled").length'))>0);assert((await evaluate('document.querySelectorAll("[data-relic-card]:not(:disabled)").length'))>0);
   assert(await evaluate('!!document.querySelector("[data-relic-card=worldEngine] .resource-chip.locked")'));
   assert.equal(await evaluate('document.querySelector("[data-relic-card=worldEngine] .resource-dots").outerHTML'),await evaluate('document.querySelector("#market-row .resource-dots").outerHTML'),'Oracle and Market use identical price markers');
   const beforeOracle=await saved();await evaluate('document.querySelector("[data-relic-card=worldEngine]").click()');assert.deepEqual(await saved(),beforeOracle);
   await shot(`oracle-${width}x${height}`);
   await pointer('[data-card-page="1"][data-card-row="expensive"]',touch);await wait('document.querySelector("#relic-cards-expensive").scrollLeft>5');
   await pointer('[data-relic-card=signalRelay]',touch);assert.deepEqual(await saved(),beforeOracle,'Selecting a card spends nothing');await pointer('#relic-card-confirm',touch);await wait('!document.querySelector("#relic-card-dialog").open');
   s=await saved();assert(s.players[0].hand.some(c=>c.key==='signalRelay'));assert(s.players[0].inPlay.some(c=>c.key==='oracleOfTheUnmade'));assert(!s.marketDecks.cheap.some(c=>c.key==='signalRelay'));
   await load('oracle-empty',true);await click('[data-order-card]');await wait('document.querySelector("#relic-card-dialog").open');assert(await evaluate('document.querySelector("[data-relic-card=signalRelay]").disabled'));assert((await evaluate('document.querySelector("[data-relic-card=signalRelay]").title')).includes('No copy'));await click('#relic-card-close');
   await load('keepers',true);await click('[data-order-card]');await wait('document.querySelector("#relic-card-dialog").open');await fit();const beforeKeeper=await saved();await pointer('[data-relic-card=worldEngine]',touch);assert.deepEqual(await saved(),beforeKeeper);assert.equal(await evaluate('document.querySelector("#relic-card-payment-label").hidden'),false);const printed=await evaluate('document.querySelector("[data-relic-card=worldEngine] .card-footer").innerHTML');await select('#relic-card-payment','Pay 4 Matter');assert.equal(await evaluate('document.querySelector("[data-relic-card=worldEngine] .card-footer").innerHTML'),printed);await fit();await shot(`keepers-cards-${width}x${height}`);await pointer('#relic-card-confirm',touch);s=await saved();assert.equal(s.players[0].resources.matter,6);assert(s.players[0].discard.some(c=>c.key==='worldEngine'));
   await load('echoes',true);await click('[data-order-card]');await wait('document.querySelector("#relic-card-dialog").open');await fit();const beforeEchoes=await saved();const ids=await evaluate('[...document.querySelectorAll("[data-relic-card]")].map(e=>e.dataset.relicCard)');assert.equal(ids.length,2);for(const id of ids)await pointer(`[data-relic-card="${id}"]`,touch);assert.deepEqual(await saved(),beforeEchoes);assert((await evaluate('document.querySelector("#relic-card-status").textContent')).includes('2 of 2'));await shot(`echoes-cards-${width}x${height}`);await pointer('#relic-card-confirm',touch);s=await saved();assert.equal(s.players[0].hand.length,2);assert(s.players[0].hand.some(c=>c.key==='construct'&&c.level===3));
   await load('battle-five',true);await wait('document.querySelector("#combat-dialog").open');await fit();assert.equal(await evaluate('document.querySelectorAll(".combat-enemy .combat-unit").length'),5);assert.equal(await evaluate('document.querySelectorAll(".combat-own .combat-unit").length'),1);assert(!(await evaluate('document.querySelector(".combat-enemy .combat-units").textContent')).includes('×'));await shot(`battle-five-${width}x${height}`);
   await load('battle-many',true);await wait('document.querySelector("#combat-dialog").open');await fit();assert.equal(await evaluate('document.querySelectorAll(".combat-enemy .combat-unit").length'),23);assert.equal(await evaluate('document.querySelectorAll(".combat-own .combat-unit").length'),23);await shot(`battle-many-${width}x${height}`);
   await load('tactics');await wait('document.querySelector("#combat-dialog").open');await fit();await select('#battle-volley-relic','War-Song');await pointer('#battle-volley-relic-confirm',touch);s=await saved();assert.equal(s.pendingCombat.hands.attacker.defensiveScreen,2);
   await select('#battle-volley-relic','The Silent Hour');await pointer('#battle-volley-relic-confirm',touch);s=await saved();assert(s.pendingCombat.silent.attacker);await shot(`battle-relics-${width}x${height}`);
   await load('reinforce');await wait('document.querySelector("#battle-relic-option")');await fit();await select('#battle-relic-option','2 Fleets');if(touch){const point=await evaluate('(()=>{const e=document.querySelector("#battle-relic-confirm");e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()');await b.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await b.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}else await click('#battle-relic-confirm');s=await saved();assert.equal(s.pendingCombat.defenderPieces.filter(p=>p.type==='fleet').length,3);assert.equal(s.pendingCombat.stage,'tactic');
   console.log(`ok - relic choices, native ${touch?'touch':'keyboard'}, capacity draft/reload, battle plays and defense ${width}×${height}`);
  }
  assert.deepEqual(b.errors,[],'No runtime exceptions');
 }finally{b.close();server.close();}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1;});
