// Exercise the real card-bank controls in Chrome. Browsing must preserve a save; buying,
// upgrades and excavation must still use the live engine. Desktop/iPad banks may not scroll.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { findChrome, launch, freshEngine, operationsState, buyState } = require('./check-viewport-fit.cjs');
const ROOT = path.resolve(__dirname, '../prototypes');
const APP = fs.readFileSync(path.join(ROOT, 'galactic-reach/app.js'), 'utf8');
const KEY = `galactic-reach-save-v${APP.match(/const SAVE_FORMAT_VERSION = (\d+)/)[1]}`;
const SIZES = process.env.CHECK_SIZES ? process.env.CHECK_SIZES.split(',').map(v=>v.split('x').map(Number)) : [[1280,720], [1440,900], [1920,1080], [1024,768], [768,1024], [820,1180], [390,844], [844,390]];
const source = selector => JSON.stringify(selector);
async function main() {
  const chrome = findChrome(); assert(chrome, 'Chrome is required; set CHROME_PATH.');
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(ROOT, '.' + decodeURIComponent(pathname), pathname.endsWith('/') ? 'index.html' : '');
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', {'.js':'text/javascript', '.css':'text/css', '.html':'text/html', '.svg':'image/svg+xml', '.webp':'image/webp'}[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`, browser = await launch(chrome);
  let touch = false;
  const evaluate = expression => browser.evaluate(expression);
  const settle = () => evaluate('new Promise(r => setTimeout(r, 160))');
  const snapshot = () => evaluate(`localStorage.getItem(${source(KEY)})`);
  const saved = async () => { const s = JSON.parse(await snapshot()); return s.state || s; };
  async function load(state, stars = true) {
    await browser.navigate(origin + '/galactic-reach/rulebook.html');
    await evaluate(`localStorage.clear(); localStorage.setItem(${source(KEY)}, ${source(JSON.stringify(state))}); localStorage.setItem('galactic-reach-background', ${source(stars ? 'stars' : 'green')}); true`);
    browser.errors.length = 0;
    await browser.navigate(origin + '/galactic-reach/');
    await evaluate('document.fonts.ready.then(() => new Promise(r => setTimeout(r, 450)))');
  }
  async function click(selector) {
    const point = await evaluate(`(() => { const e = document.querySelector(${source(selector)}); if (!e?.checkVisibility() || e.disabled) return null; const r = e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`);
    assert(point, 'visible, enabled control: ' + selector);
    if (touch) {
      await browser.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[{...point, radiusX:2, radiusY:2, force:1, id:1}]});
      await browser.send('Input.dispatchTouchEvent', {type:'touchEnd', touchPoints:[]});
      await settle(); return;
    }
    await browser.send('Input.dispatchMouseEvent', {type:'mouseMoved', ...point});
    await browser.send('Input.dispatchMouseEvent', {type:'mousePressed', button:'left', clickCount:1, ...point});
    await browser.send('Input.dispatchMouseEvent', {type:'mouseReleased', button:'left', clickCount:1, ...point});
    await settle();
  }
  async function key(key) {
    await browser.send('Input.dispatchKeyEvent', {type:'keyDown', key, code:key, windowsVirtualKeyCode:key === 'Escape' ? 27 : 9});
    await browser.send('Input.dispatchKeyEvent', {type:'keyUp', key, code:key}); await settle();
  }
  const open = () => evaluate('document.querySelector("#max-bank-dialog").open');
  const bank = () => evaluate('document.querySelector("#max-bank-dialog").dataset.bank');
  async function fit(phone) {
    const issues = await evaluate(`(() => {
      const problems = [], d = document.querySelector('#max-bank-dialog'), phone = ${phone};
      if (document.documentElement.scrollWidth > innerWidth + 1 || (!phone && document.documentElement.scrollHeight > innerHeight + 1)) problems.push('page scrolls');
      const scope = d.open ? d : document.querySelector('.app-shell');
      for (const e of scope.querySelectorAll('button, .game-card, .card-effect')) {
        if (!e.checkVisibility()) continue;
        const r=e.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        if (!phone && (r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1)) problems.push('outside viewport: ' + e.className);
        if (d.open && e.matches('.game-card, .card-effect') && (e.scrollHeight > e.clientHeight + 2 || e.scrollWidth > e.clientWidth + 2)) problems.push('card clips: ' + e.textContent.slice(0,35));
      }
      if (d.open && !phone) { const c=document.querySelector('#max-bank-content'); if (c.scrollHeight > c.clientHeight+2) problems.push('bank scrolls'); }
      return problems.concat(window.galacticReachRenderErrors || []);
    })()`);
    assert.deepEqual(issues, []);
    assert.deepEqual(browser.errors.filter(e=>!/seat\.js|zk\//.test(e)), []);
  }
  try {
    for (const [width,height] of SIZES) {
      const phone = Math.min(width,height) < 600; touch = width < 1200;
      await browser.send('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:width<1200});
      await browser.send('Emulation.setTouchEmulationEnabled', {enabled:width<1200,maxTouchPoints:5});
      await browser.send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
      await load(operationsState(['move','construct','move','construct','move']));
      const before = await snapshot(); await fit(phone);
      for (const name of ['relics','market','basics']) {
        await click(`#max-bank-nav [data-card-bank="${name}"]`);
        assert(await open()); assert.equal(await bank(), name); await key('Tab'); assert(await evaluate('!!document.activeElement.closest("#max-bank-dialog")'), 'keyboard focus stays in the bank'); await fit(phone);
        if (process.env.SHOTS) { fs.mkdirSync(process.env.SHOTS,{recursive:true}); fs.writeFileSync(path.join(process.env.SHOTS,`${width}x${height}-${name}.png`),Buffer.from((await browser.send('Page.captureScreenshot',{format:'png'})).data,'base64')); }
        await key('Escape'); assert(!await open());
        assert.equal(await snapshot(), before, 'browsing and Escape preserve the save');
      }
      if (phone) { await click('.phone-drawers [data-drawer="supply"]'); assert(await open()); await click('#max-bank-close'); }
      else {
        await click('#table-menu-button'); await click('#background-toggle');
        assert.equal(await evaluate('document.querySelector("#market-panel").closest("#max-bank-dialog")'), null);
        assert(!(await evaluate('document.querySelector("#max-bank-nav").checkVisibility()')));
        await click('#table-menu-button'); await click('#background-toggle');
        assert(await evaluate('!!document.querySelector("#market-panel").closest("#max-bank-dialog")'));
        assert.equal(await snapshot(), before, 'changing UI preserves the save');
      }
      const market = freshEngine().state.market.map(c=>c.key);
      await load(buyState(market,{matter:10,energy:10,biomass:10,data:10}));
      assert(await open(), 'Buy automatically opens its bank'); assert.equal(await bank(),'market'); await fit(phone);
      const old = await saved();
      const purchase = await evaluate('document.querySelector("#market-row [data-buy-market]:not(:disabled)").dataset.buyMarket');
      await click(`#market-row [data-buy-market="${purchase}"]`);
      const after = await saved();
      assert(after.players[0].cardsPurchased > old.players[0].cardsPurchased, 'real market purchase succeeds');
      assert(await open(), 'purchasing keeps the bank open');
      await click('#max-bank-dialog [data-card-bank="basics"]'); await fit(phone);
      if (width === 1280) {
        await click('[data-upgrade-offer="move"][data-upgrade-level="2"]');
        assert(await evaluate('document.querySelector("#upgrade-dialog").open'));
        await click('#upgrade-options [data-upgrade-card]');
        const upgraded = (await saved()).players[0];
        assert([...upgraded.hand,...upgraded.discard,...upgraded.inPlay].some(c=>c.key==='move'&&c.upgraded), 'a real starter upgrade succeeds');
        assert(await open(), 'the bank remains available after its upgrade dialog closes');
      }
      await click('#max-bank-finish'); assert(!await open(), 'Finish Buy closes the bank');
      console.log(`ok - ${width}x${height}: banks, Escape, save isolation, purchase and Finish Buy`);
    }
    // A legal excavation site opens the reward bank. Closing it spends nothing; claiming uses
    // the same live reward button and grants the normal card and Prestige.
    touch = false; await browser.send('Emulation.setTouchEmulationEnabled',{enabled:false});
    await browser.send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
    const dig = operationsState(['probe','construct','move']);
    const coord = Object.keys(dig.planets).find(k=>dig.planets[k].special==='relic');
    dig.clusters[dig.planets[coord].cluster].scannedBy=[0];
    dig.clusters[dig.planets[coord].cluster].revealedBy=[0,1,2,3];
    dig.fleets[coord]={0:{explorer:1,fleet:0,settler:0}};
    dig.players[0].resources={matter:1,energy:1,biomass:0,data:3};
    dig.actionMode='excavate';dig.actionCardId=dig.players[0].hand[0].id;dig.selected=null;
    await load(dig);assert(!await open(), 'selecting Excavate leaves the map available until a site is chosen');
    await click(`.hex[data-coord="${coord}"]`);assert(await open());assert.equal(await bank(),'relics');await fit(false);
    const beforeDig=await snapshot();await key('Escape');assert.equal(await snapshot(),beforeDig);
    await click('#max-bank-nav [data-card-bank="relics"]');
    await click('[data-excavate-relic]');
    const dug=await saved();assert(dug.planets[coord].relicClaimed);assert(!await open());
    console.log('ok - excavation opens Relics, Escape preserves it, and a reward resolves through the engine');
    await click('#table-menu-button'); await click('#rules-button');
    const rulebook = await evaluate("document.querySelector('#rules-dialog a[href]').href");
    assert.equal(await evaluate(`fetch(${source(rulebook)}).then(r=>r.status)`),200, 'rulebook is anonymously readable');
    await browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await browser.navigate(rulebook + '#card-banks'); await settle();
    assert(await evaluate('document.querySelector(":target").id==="card-banks" && document.documentElement.scrollWidth<=innerWidth+1'), 'card-bank section links work at a narrow viewport');
    console.log('ok - game Rules navigation, anonymous rulebook, card-bank anchor and narrow viewport');
  } catch (error) { console.error(await evaluate(`({body:document.body.className,zoom:document.documentElement.style.cssText,shell:document.querySelector('.app-shell').getBoundingClientRect().toJSON(),menu:document.querySelector('#table-menu-button').getBoundingClientRect().toJSON()})`)); fs.writeFileSync('/private/tmp/max-ui-failure.png',Buffer.from((await browser.send('Page.captureScreenshot',{format:'png'})).data,'base64')); throw error; } finally {browser.close();server.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
