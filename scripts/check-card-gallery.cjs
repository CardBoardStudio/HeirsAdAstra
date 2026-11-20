// Real gallery/catalog and feedback checks in Chrome, using Node built-ins only.
// SHOTS=/outside/repository node scripts/check-card-gallery.cjs saves viewport images.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const { findChrome, launch } = require('./check-viewport-fit.cjs');
const root = path.resolve(__dirname, '..');
const game = path.join(root, 'prototypes/galactic-reach');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(game, 'app.js'), 'utf8'), context);
const catalog = context.createGalacticReach({ catalog: true });
const market = catalog.MARKET_CARDS, relics = catalog.RELIC_CARDS;
const allKeys = [...Object.keys(market), ...Object.keys(relics)].sort();
const manifest = JSON.parse(fs.readFileSync(path.join(game, 'card-art/manifest.json'), 'utf8')).cards;
const artCount = allKeys.filter(key => manifest[key]).length;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp' };
const posted = [];
let saving = true;

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/api/galactic-reach/card-feedback') {
    response.setHeader('content-type', 'application/json');
    if (request.method === 'POST') {
      let body = ''; for await (const chunk of request) body += chunk;
      posted.push(JSON.parse(body)); response.end('{"saved":true}');
    } else response.end(JSON.stringify({ enabled: saving }));
    return;
  }
  const file = path.resolve(game, '.' + decodeURIComponent(url.pathname.replace(/^\/galactic-reach/, '')));
  if (!file.startsWith(game + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
  response.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(response);
});

async function main() {
  const chrome = findChrome();
  if (!chrome) throw new Error('Card gallery checks require Chrome; set CHROME_PATH.');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await launch(chrome);
  const evaluate = expression => browser.evaluate(expression);
  const wait = condition => evaluate(`new Promise((resolve,reject)=>{const start=Date.now();const poll=()=>{if(${condition})resolve(true);else if(Date.now()-start>8000)reject(new Error('Gallery did not settle'));else setTimeout(poll,30);};poll();})`);
  const click = selector => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e?.checkVisibility())throw new Error('Control is hidden: '+${JSON.stringify(selector)});e.click();})()`);
  const filter = id => click(`[data-filter="${id}"]`);
  const cards = () => evaluate('[...document.querySelectorAll(".gallery-card")].map(c=>({key:c.dataset.cardKey,code:c.dataset.cardCode,name:c.querySelector("h3").textContent,effect:c.querySelector(".effect .sr-only").textContent,formatted:c.querySelector(".effect-symbols").innerHTML,cost:c.querySelector(".gallery-cost .resource-dots")?.getAttribute("aria-label"),tier:c.closest("[data-market-tier]")?.dataset.marketTier||null,image:c.querySelector(".gallery-art img")?.getAttribute("src")}))');
  const note = async (code, text) => evaluate(`(()=>{const area=document.querySelector(${JSON.stringify('#note-' + code)});area.value=${JSON.stringify(text)};area.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  try {
    await browser.send('Page.addScriptToEvaluateOnNewDocument',{source:"if(location.protocol==='http:'&&!localStorage.getItem('galactic-reach-card-feedback-31-36'))localStorage.setItem('galactic-reach-card-feedback-31-36',JSON.stringify({R01:{vote:'like',note:'Retired relic history'},N17:{vote:'neutral',note:'Retired starter-trash history'}}));"});
    await browser.navigate(`${origin}/galactic-reach/cards.html`);
    await wait('document.querySelectorAll(".gallery-art img").length === ' + artCount + ' && document.querySelector("#store-status").textContent.includes("Saving is on")');
    assert(await evaluate('document.querySelector("#toggle-feedback").getAttribute("aria-expanded")==="false" && [...document.querySelectorAll(".gallery-feedback")].every(e=>e.hidden) && document.querySelector("#feedback-export").hidden'), 'A first visit starts compact');
    const initial = await cards();
    assert.deepEqual(initial.map(c => c.key).sort(), allKeys, 'Every market card and relic appears exactly once');
    assert.equal(new Set(initial.map(c => c.code)).size, initial.length, 'Feedback ids are distinct');
    for (const card of initial) {
      const def = market[card.key] || relics[card.key];
      assert.equal(card.name, def.name); assert.equal(card.effect, def.text);
      if (manifest[card.key]) {
        assert.equal(card.image, manifest[card.key].image);
        assert(fs.existsSync(path.join(game, card.image)), `Artwork exists for ${card.key}`);
      } else assert.equal(card.image, undefined, 'Cards without existing art keep their emblem');
      assert.equal(card.tier, relics[card.key] ? null : catalog.marketTier(card.key), 'Only market cards enter price tiers');
      const formatted = catalog.iconText(def.text);
      assert.equal(card.formatted, await evaluate(`(()=>{const t=document.createElement('template');t.innerHTML=${JSON.stringify(formatted)};return t.innerHTML;})()`), 'Descriptions use the main game formatter');
      if (market[card.key]) assert.equal(card.cost, catalog.RESOURCES.filter(r => def.cost[r]).map(r => `${def.cost[r]} ${catalog.RESOURCE_NAMES[r]}`).join(', '));
      else assert.equal(card.cost, undefined, 'Relics have no market cost box');
    }
    assert.equal(initial.find(c => c.key === 'firstDawnEchoes').code, 'R02');
    assert.equal(initial.find(c => c.key === 'keepersArchive').code, 'R15');
    assert(initial.filter(c => relics[c.key]).every(c => /^R\d{2}$/.test(c.code)));

    await filter('relic');
    assert.deepEqual((await cards()).map(c => c.key).sort(), Object.keys(relics).sort());
    const compactHeight = await evaluate('document.querySelector(".gallery-card").getBoundingClientRect().height');
    await click('#toggle-feedback');
    assert(await evaluate('document.querySelector("#toggle-feedback").getAttribute("aria-expanded")==="true" && [...document.querySelectorAll(".gallery-feedback")].every(e=>!e.hidden)'), 'Feedback can be shown for every visible card');
    assert(await evaluate('document.querySelector(".gallery-card").getBoundingClientRect().height') > compactHeight + 100, 'Hiding feedback removes the bottom section of each card');
    await click('[data-card="R02"][data-vote="like"]');
    const relicNote = 'Relic feedback: keep <this> text & its timing.';
    await note('R02', relicNote); await click('[data-save="R02"]');
    await wait('document.querySelector("#state-R02").textContent === "Saved for the developer."');
    assert.deepEqual(posted[0], { card: 'R02', vote: 'like', note: relicNote, game: 'card gallery' });
    await note('R24','New Oracle feedback');await click('[data-save="R24"]');await wait('document.querySelector("#state-R24").textContent === "Saved for the developer."');assert.equal(posted[1].card,'R24');
    await filter('normal');
    await click('[data-card="N27"][data-vote="neutral"]'); await note('N27', 'Existing market feedback'); await click('[data-save="N27"]');
    await wait('document.querySelector("#state-N27").textContent === "Saved for the developer."');
    assert.equal(posted[2].card, 'N27');
    saving = false;
    await browser.navigate(`${origin}/galactic-reach/cards.html`);
    await wait('document.querySelectorAll(".gallery-art img").length === ' + artCount + ' && document.querySelector("#store-status").textContent.includes("browser only")');
    assert.equal(await evaluate('document.querySelector("#toggle-feedback").getAttribute("aria-expanded")'), 'true', 'The feedback display preference survives reload');
    await filter('relic');
    assert.equal(await evaluate('document.querySelector("#note-R02").value'), relicNote, 'Reload retains relic feedback');
    await note('R15', 'Browser-only relic note'); await click('[data-save="R15"]');
    assert.match(await evaluate('document.querySelector("#state-R15").textContent'), /Saved in this browser/);
    assert.equal(posted.length, 3, 'Browser-only Save sends no network write');
    await click('#toggle-feedback');
    assert(await evaluate('document.querySelector("#note-R15").closest(".gallery-feedback").hidden'));
    await click('#toggle-feedback');
    assert.equal(await evaluate('document.querySelector("#note-R15").value'), 'Browser-only relic note', 'Hiding feedback never clears a note');
    const exported = await evaluate('document.querySelector("#feedback-text").value');
    assert.match(exported,/R01 Phase-Shear Drive: like — Retired relic history/);assert.match(exported,/N17 Archive Purge: neutral — Retired starter-trash history/);assert.match(exported,/R24 Oracle of the Unmade: no vote — New Oracle feedback/);
    assert.match(exported, /R02 Echoes of the First Dawn: like/); assert.match(exported, /R15 Keepers’ Archive: no vote/); assert.match(exported, /N27 Signal Relay: neutral/);
    await filter('all');
    await evaluate('document.querySelector("#sort-cards").value="price";document.querySelector("#sort-cards").dispatchEvent(new Event("change"))');
    const sorted = await cards();
    for (const tier of catalog.MARKET_TIERS) {
      const prices = sorted.filter(c => c.tier === tier.id).map(c => Object.values(market[c.key].cost).reduce((sum, n) => sum + n, 0));
      assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
    }
    const relicOrder = sorted.filter(c => relics[c.key]).map(c => c.code);
    assert.deepEqual(relicOrder, [...relicOrder].sort(), 'Price sorting does not invent relic prices');
    await filter('normal'); await click('#show-relic-gallery');
    assert.equal((await cards()).length, Object.keys(relics).length, 'The header link reveals relics even after another filter');
    // Native keyboard activation; the filter button remains in the normal tab order.
    await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    await evaluate('document.querySelector("[data-filter=military]").focus()');
    await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' });
    await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await wait('document.querySelector("[data-filter=military]").getAttribute("aria-pressed")==="true"');
    assert((await cards()).every(c => market[c.key]?.military), 'Keyboard filtering excludes relic reactions from the military deck');
    await evaluate('document.querySelector("#toggle-feedback").focus()');
    await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' });
    await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    assert.equal(await evaluate('document.querySelector("#toggle-feedback").getAttribute("aria-expanded")'), 'false', 'Keyboard activation hides feedback');
    console.log('ok - gallery catalog, shared game formatting, compact toggle, artwork, stable ids, market tiers, sorting, keyboard, host/browser feedback and reload/export');

    for (const [width, height, touch] of [[1280,720,false],[1440,900,false],[1024,768,true],[768,1024,true],[390,844,true],[320,700,true]]) {
      await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: touch });
      await browser.send('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: 1 });
      await evaluate('scrollTo(0,0)');
      if (touch) {
        const point = await evaluate('(()=>{const e=document.querySelector("[data-filter=relic]");e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()');
        await browser.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
        await browser.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await wait('document.querySelector("[data-filter=relic]").getAttribute("aria-pressed")==="true"');
      } else await filter('relic');
      assert.deepEqual((await cards()).map(c => c.key).sort(), Object.keys(relics).sort());
      const fit = await evaluate('({page:document.documentElement.scrollWidth,viewport:innerWidth,cardWidths:[...document.querySelectorAll(".gallery-card")].map(c=>({width:c.clientWidth,content:c.scrollWidth}))})');
      assert(fit.page <= fit.viewport + 1, `${width}×${height}: no horizontal page scrolling`);
      assert(fit.cardWidths.every(c => c.content <= c.width + 2), `${width}×${height}: card contents fit`);
      await evaluate('scrollTo(0,0)');
      if (process.env.SHOTS) {
        fs.mkdirSync(process.env.SHOTS, { recursive: true });
        const shot = await browser.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(process.env.SHOTS, `relic-gallery-${width}x${height}.png`), Buffer.from(shot.data, 'base64'));
      }
      await filter('military');
      const costsFit = await evaluate('[...document.querySelectorAll(".gallery-card")].every(c=>{const card=c.getBoundingClientRect(),cost=c.querySelector(".gallery-cost").getBoundingClientRect(),name=c.querySelector("h3").getBoundingClientRect();return cost.right<=card.right+1 && cost.right>=card.right-3 && cost.top>=card.top-1 && cost.top<=card.top+6 && name.right<=cost.left+1;})');
      assert(costsFit, `${width}×${height}: cost boxes stay in the upper right without overlapping names`);
      if (process.env.SHOTS && width === 1440) {
        await evaluate('scrollTo(0,0)');
        const shot = await browser.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(process.env.SHOTS, 'market-gallery-1440x900.png'), Buffer.from(shot.data, 'base64'));
      }
      console.log(`ok - gallery ${width}×${height}${touch ? ' touch' : ''}`);
    }
    assert.deepEqual(browser.errors, [], 'No gallery runtime errors');
  } catch (error) {
    console.error('Gallery diagnostics:', await evaluate('({cards:document.querySelectorAll(".gallery-card").length,art:document.querySelectorAll(".gallery-art").length,status:document.querySelector("#store-status")?.textContent,title:document.title})'));
    console.error('Browser errors:', browser.errors);
    throw error;
  } finally { browser.close(); server.close(); }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
