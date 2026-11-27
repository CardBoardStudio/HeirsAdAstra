// Exercise the actual Willem combat UI with mouse, keyboard and native touch.
// Fixtures use the authority; UI browsing must never mutate it or reveal a secret.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { findChrome, launch, freshEngine } = require('./check-viewport-fit.cjs');
const ROOT = path.resolve(__dirname, '../prototypes/galactic-reach');
const SOURCE = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const SAVE = `galactic-reach-save-v${SOURCE.match(/const SAVE_FORMAT_VERSION = (\d+)/)[1]}`;
const sizes = (process.env.CHECK_SIZES || '1280x720,1440x900,960x600,1024x768,768x1024,844x390,667x375').split(',').map(s => s.split('x').map(Number));
const plain = x => JSON.parse(JSON.stringify(x));
function fixture(kind = 'large', secret = 'concentratedFire') {
  const { engine: e, state: s } = freshEngine();
  s.activePlayer = 0; s.phase = 'operations'; s.turnStage = 'action';
  s.fleets = { '10,-10': { 0: { fleet: 5, settler: 6, explorer: 0 } }, '9,-10': { 1: { fleet: 5, settler: 6, explorer: 0 } } };
  s.players.forEach(p => { p.hand = []; p.resources = { matter: 0, energy: 0, biomass: 0, data: 0 }; });
  for (const p of s.players.slice(0, 2)) p.military = Object.keys(e.MILITARY_CARDS).filter(k => !['concentratedFire','defensiveScreen'].includes(k)).map(key => ({key, id:`mat-${p.id}-${key}`}));
  e.executeMove(0, '10,-10', '9,-10', {moveGroup:'all'});
  assert.equal(s.pendingCombat.stage, 'tactic');
  if (kind === 'large') {
    // Simulate a loaded position with more than one partially damaged piece.
    const fleets = s.pendingCombat.attackerPieces.filter(p => p.type === 'fleet');
    fleets[0].damage = 4; fleets[1].damage = 2;
  } else if (kind === 'revealed') {
    e.applyCombatAction(0, {type:'combat_tactic', tactic:'phaseLance'});
    e.applyCombatAction(1, {type:'combat_tactic', tactic:'defensiveScreen'});
  } else if (kind === 'secret') {
    // View from the human defender, after a private opponent commitment.
    s.pendingCombat.attackerId = 1; s.pendingCombat.defenderId = 0;
    s.pendingCombat.commitments.attacker = secret;
  } else if (kind === 'report') {
    let count = 0;
    while (s.pendingCombat) {
      assert(++count < 20);
      const seat = e.combatActor(); e.applyCombatAction(seat, e.combatActions(seat).find(a => a.type === 'combat_tactic') || e.combatActions(seat)[0]);
    }
    s.pendingCombatReport = plain(s.lastCombat);
  }
  return plain(s);
}
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.webp':'image/webp'};
async function main() {
  const server = http.createServer((req,res) => {
    const rel = new URL(req.url,'http://local').pathname.replace(/^\/galactic-reach\/?/,'') || 'index.html';
    if (rel === 'channel.js' || rel === 'zk/seat.js') { res.setHeader('content-type','text/javascript');res.end('');return; }
    const file = path.resolve(ROOT,rel);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404);res.end();return;}
    res.setHeader('content-type',types[path.extname(file)] || 'application/octet-stream');
    if (rel === 'index.html') {
      // Pause only AI scheduling, preserving all real UI/authority paths.
      res.end(fs.readFileSync(file,'utf8').replace('<script src="channel.js">','<script>globalThis.drawingBoardTableBoot=true;</script><script src="channel.js">').replace('<script type="module" src="/galactic-reach/zk/seat.js">','<script>createGalacticReach({paused:()=>true});</script><script type="module" src="/galactic-reach/zk/seat.js">'));
    } else fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0,'127.0.0.1',r));
  const origin = `http://127.0.0.1:${server.address().port}`, b = await launch(findChrome());
  const evaluate = x => b.evaluate(x);
  const snapshot = () => evaluate(`localStorage.getItem(${JSON.stringify(SAVE)})`);
  const saved = async () => {const s=JSON.parse(await snapshot());return s.state||s;};
  async function load(state,stars=false) {
    await b.navigate(origin+'/galactic-reach/rulebook.html');
    await evaluate(`localStorage.clear();localStorage.setItem('galactic-reach-guide-v1','{"enabled":false}');localStorage.setItem('galactic-reach-background',${JSON.stringify(stars?'stars':'green')});localStorage.setItem(${JSON.stringify(SAVE)},${JSON.stringify(JSON.stringify(state))});true`);
    await b.navigate(origin+'/galactic-reach/');await evaluate('document.fonts.ready');
  }
  async function pointer(selector,touch) {
    const point = await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw new Error('Missing enabled control '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2; if(!e.contains(document.elementFromPoint(x,y)))throw new Error('Covered '+${JSON.stringify(selector)});return {x,y};})()`);
    if(touch) {await b.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await b.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
    else {await b.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});}
  }
  async function key(key,code=key) {
    await b.send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:{Tab:9,Enter:13,Escape:27}[key],...(key==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})});
    await b.send('Input.dispatchKeyEvent',{type:'keyUp',key,code});
  }
  async function fit(phone=false) {
    const result=await evaluate(`(() => {const d=document.querySelector('#combat-dialog'),r=d.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,w:innerWidth,h:innerHeight,scroll:d.scrollHeight,client:d.clientHeight,wide:d.scrollWidth-d.clientWidth,clipped:[...d.querySelectorAll('.battle-card, .battle-unit, .combat-options button')].filter(e=>e.scrollHeight>e.clientHeight+2).map(e=>e.textContent),small:[...d.querySelectorAll('button,select')].filter(e=>e.checkVisibility()&&!e.disabled).filter(e=>{const r=e.getBoundingClientRect();return r.width<43.5||r.height<43.5;}).map(e=>e.textContent)};})()`);
    assert(result.top>=0&&result.bottom<=result.h+1&&result.left>=0&&result.right<=result.w+1,JSON.stringify(result));
    assert(result.wide<=2,JSON.stringify(result));assert.deepEqual(result.clipped,[],'Controls must not clip text');assert.deepEqual(result.small,[],'All combat controls have 44px touch targets');
    if(!phone)assert(result.scroll<=result.client+2,'Desktop/iPad mat does not scroll: '+JSON.stringify(result));
  }
  async function shot(name) {if(!process.env.SHOTS)return;fs.mkdirSync(process.env.SHOTS,{recursive:true});const r=await b.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(process.env.SHOTS,name+'.png'),Buffer.from(r.data,'base64'));}
  try {
    await b.send('Emulation.setFocusEmulationEnabled',{enabled:true});
    await b.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    for(const [width,height] of sizes) {
      const touch=width<1200,phone=Math.min(width,height)<600;
      await b.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:touch});
      await b.send('Emulation.setTouchEmulationEnabled',{enabled:touch,maxTouchPoints:1});
      await load(fixture());await fit(phone);
      const before=await snapshot();
      assert.match(await evaluate('document.querySelector(".combat-own .battle-instruments").innerHTML'),/Hull: 3. Fleet · of 7/);
      await pointer('[data-mat-units="attacker:fleet"]',touch);
      const hull=await evaluate('document.querySelector("#battle-reference-body").textContent');
      assert.match(hull,/3\/7 hull/);assert.match(hull,/5\/7 hull/);assert.equal((hull.match(/7\/7 hull/g)||[]).length,3);
      await key('Escape');assert.equal(await evaluate('document.querySelector("#battle-reference-dialog").open'),false);
      assert.equal(await snapshot(),before,'Inspecting exact piece state is read-only');
      const seen=new Set();
      const pages=Number((await evaluate('document.querySelector(".combat-own .battle-supply header > span").textContent')).split('/').at(-1));
      for(let i=0;i<pages;i++) {
        (await evaluate('[...document.querySelectorAll(".combat-own [data-combat-tactic]")].map(e=>e.dataset.combatTactic)')).forEach(k=>seen.add(k));
        await pointer('.combat-own [data-mat-page]:last-child',touch);
      }
      assert.equal(seen.size,Object.keys(freshEngine().engine.MILITARY_CARDS).length,'Every owned tactic is reachable');
      assert.equal(await snapshot(),before,'Paging spends nothing');
      // Return to the first page and select, using keyboard on desktop.
      await load(fixture());
      if(!touch) {
        await evaluate('document.querySelector(".combat-own [data-combat-tactic=concentratedFire]").focus()');await key('Enter');
        assert.match(await evaluate('document.querySelector("#combat-options").textContent'),/Commit Concentrated Fire/);
        assert(await evaluate('document.activeElement.matches("[data-combat-tactic=concentratedFire]")'));
        assert.notEqual(await evaluate('getComputedStyle(document.activeElement).outlineStyle'),'none');
      } else await pointer('.combat-own [data-combat-tactic=concentratedFire]',true);
      await fit(phone);await pointer('[data-combat-action]:not(:disabled)',touch);
      const committed=await saved();assert.equal(committed.pendingCombat.commitments.attacker,'concentratedFire');
      assert.match(await evaluate('document.querySelector("#combat-status").textContent'),/Waiting for the enemy/);
      await b.navigate(origin+'/galactic-reach/');assert.equal((await saved()).pendingCombat.commitments.attacker,'concentratedFire');await fit(phone);
      await load(fixture('secret','concentratedFire'));const secretHtml=await evaluate('document.querySelector("#combat-forces").innerHTML');
      await load(fixture('secret','phaseLance'));assert.equal(await evaluate('document.querySelector("#combat-forces").innerHTML'),secretHtml,'Hidden opponent choices render identically');
      await load(fixture('revealed'));await fit(phone);await shot(`mats-${width}x${height}`);
      assert.match(await evaluate('document.querySelector(".battle-reveal").textContent'),/shields pierced/);
      await pointer('[data-mat-spent="attacker"]',touch);assert.match(await evaluate('document.querySelector("#battle-reference-body").textContent'),/Phase Lance/);await key('Escape');
      await pointer('#battle-record-open',touch);assert.match(await evaluate('document.querySelector("#battle-reference-body").textContent'),/Volley 1/);await key('Escape');
      await load(fixture('report'));assert(await evaluate('document.querySelector("#message-dialog").open'));assert.match(await evaluate('document.querySelector("#message-details").textContent'),/Volley 3/);await shot(`report-${width}x${height}`);
      await load(fixture('secret'),true);assert.equal(await evaluate('document.querySelectorAll(".battle-mat").length'),0);assert.equal(await evaluate('document.querySelectorAll(".combat-unit").length'),22);await shot(`max-${width}x${height}`);
      console.log(`ok - combat mats ${width}x${height}: ${touch?'native touch':'mouse/keyboard'}, paging, exact hull, private commit/reload, reveal, record/report, Max branch`);
    }
    assert.deepEqual(b.errors,[],'No browser exceptions');
  } finally {b.close();server.close();}
}
main().catch(e=>{console.error(e);process.exit(1);});
