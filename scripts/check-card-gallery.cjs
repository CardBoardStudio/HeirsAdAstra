// Real gallery/catalog and feedback checks in Chrome, using Node built-ins only.
// SHOTS=/outside/repository node scripts/check-card-gallery.cjs saves viewport images.
const assert = require('node:assert/strict');
const { FACE_PROBLEMS, RULEBOOK_FACES, rulebookFace } = require('./lib/card-face-check.cjs');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const { findChrome, launch } = require('./check-viewport-fit.cjs');
const root = path.resolve(__dirname, '..');
const game = path.join(root, 'prototypes/galactic-reach');
const context = vm.createContext({});
// The gallery loads icons.js before app.js, so its descriptions draw the same symbols.
vm.runInContext(fs.readFileSync(path.join(game, 'icons.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(game, 'app.js'), 'utf8'), context);
const catalog = context.createGalacticReach({ catalog: true });
const market = catalog.MARKET_CARDS, relics = catalog.RELIC_CARDS;
const allKeys = [...Object.keys(market), ...Object.keys(relics)].sort();
const manifest = JSON.parse(fs.readFileSync(path.join(game, 'card-art/manifest.json'), 'utf8')).cards;
const artCount = allKeys.filter(key => manifest[key]).length;
// The rulebook's card figures are the game's faces (rulebook #card-corners, #card-face).
const rulebook = fs.readFileSync(path.join(game, 'rulebook.html'), 'utf8');
for (const [key, copy] of RULEBOOK_FACES) {
  const shown = rulebook.match(new RegExp(`<div class="rb-face" data-card="${key}"[^>]*>\\s*(<span class="card-face"[^\\n]*)`))?.[1]?.trim();
  assert.equal(shown, rulebookFace(catalog, key, copy), `The rulebook's ${key} figure is the game's face (regenerate it with rulebookFace in scripts/lib/card-face-check.cjs)`);
}
// The shade keeps the words readable on the palest picture: over pure white, the name and the
// description keep at least 7:1 contrast (WCAG AAA) with the shade as card-face.css sets it.
const faceCss = fs.readFileSync(path.join(game, 'card-face.css'), 'utf8');
const cssValue = name => faceCss.match(new RegExp(`${name}: ([^;]+);`))[1].trim();
const rgb = hex => hex.match(/[0-9a-f]{2}/gi).map(h => parseInt(h, 16));
const luminance = c => { const [r, g, b] = c.map(v => v / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * r + .7152 * g + .0722 * b; };
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };
const shadeAlpha = Number(cssValue('--shade-a')), shade = cssValue('--face-shade').split(',').map(Number);
const onWhite = shade.map(v => v * shadeAlpha + 255 * (1 - shadeAlpha));
const SHADE_CONTRAST = { name: contrast(rgb(cssValue('--face-light')), onWhite), description: contrast(rgb(cssValue('--face-mute')), onWhite) };
for (const [part, ratio] of Object.entries(SHADE_CONTRAST)) assert(ratio >= 7, `The face's ${part} keeps 7:1 contrast over a white picture (${ratio.toFixed(1)}:1)`);
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
  // Each gallery card is the game's printed face (rulebook #card-face) with its name, effect and price for screen readers.
  const cards = () => evaluate('[...document.querySelectorAll(".gallery-card")].map(c=>({key:c.dataset.cardKey,code:c.dataset.cardCode,name:c.querySelector("h3").textContent,faceName:c.querySelector(".cf-name").textContent,effect:c.querySelector(".effect").textContent,face:c.querySelector(".gallery-face").innerHTML,cost:c.querySelector(".cf-price")?.getAttribute("aria-label")||undefined,tier:c.closest("[data-market-tier]")?.dataset.marketTier||null,image:c.querySelector(".cf-art")?.getAttribute("src")}))');
  const note = async (code, text) => evaluate(`(()=>{const area=document.querySelector(${JSON.stringify('#note-' + code)});area.value=${JSON.stringify(text)};area.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  try {
    await browser.send('Page.addScriptToEvaluateOnNewDocument',{source:"if(location.protocol==='http:'&&!localStorage.getItem('galactic-reach-card-feedback-31-36'))localStorage.setItem('galactic-reach-card-feedback-31-36',JSON.stringify({R01:{vote:'like',note:'Retired relic history'},N17:{vote:'neutral',note:'Retired starter-trash history'}}));"});
    await browser.navigate(`${origin}/galactic-reach/cards.html`);
    await wait('document.querySelectorAll(".gallery-credit").length === ' + artCount + ' && document.querySelector("#card-art-focus") && document.querySelector("#store-status").textContent.includes("Saving is on")');
    assert(await evaluate('document.querySelectorAll(".max-resource-shape").length > 0 && [...document.querySelectorAll(".max-resource-shape")].every(e=>getComputedStyle(e).display==="none")'), 'The shared gallery keeps constellation resources without loading Max’s stylesheet');
    assert(await evaluate('document.querySelector("#toggle-feedback").getAttribute("aria-expanded")==="false" && [...document.querySelectorAll(".gallery-feedback")].every(e=>e.hidden) && document.querySelector("#feedback-export").hidden'), 'A first visit starts compact');
    const initial = await cards();
    assert.deepEqual(initial.map(c => c.key).sort(), allKeys, 'Every market card and relic appears exactly once');
    assert.equal(new Set(initial.map(c => c.code)).size, initial.length, 'Feedback ids are distinct');
    for (const card of initial) {
      const def = market[card.key] || relics[card.key];
      assert.equal(card.name, def.name); assert.equal(card.faceName, def.name); assert.equal(card.effect, def.text);
      if (manifest[card.key]) {
        assert.equal(card.image, manifest[card.key].image);
        assert(fs.existsSync(path.join(game, card.image)), `Artwork exists for ${card.key}`);
      } else assert.equal(card.image, undefined, 'Cards without existing art keep their emblem');
      assert.equal(card.tier, relics[card.key] ? null : catalog.marketTier(card.key), 'Only market cards enter price tiers');
      const face = catalog.cardFace({ key: card.key, ...def }, {}, { hidden: true, art: Boolean(manifest[card.key]) });
      assert.equal(card.face, await evaluate(`(()=>{const t=document.createElement('template');t.innerHTML=${JSON.stringify(face)};return t.innerHTML;})()`), 'Gallery cards are the main game\'s card face');
      if (market[card.key]) assert.equal(card.cost, 'Price: ' + catalog.RESOURCES.filter(r => def.cost[r]).map(r => `${def.cost[r]} ${catalog.RESOURCE_NAMES[r]}`).join(', '));
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
    await wait('document.querySelectorAll(".gallery-credit").length === ' + artCount + ' && document.querySelector("#card-art-focus") && document.querySelector("#store-status").textContent.includes("browser only")');
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
    console.log(`ok - rulebook figures are the game's faces; shade contrast over white: name ${SHADE_CONTRAST.name.toFixed(1)}:1, description ${SHADE_CONTRAST.description.toFixed(1)}:1`);

    // Every design's face (rulebook #card-face), at the smallest size a face is read at (a phone's
    // Supply drawer, about 100px) and at the raised card's 250px: its parts in place, its text whole.
    // SHOTS also saves the contact sheet of every design, its pictures cropped as the game crops them.
    const designs = await evaluate(`(() => {
      const c = createGalacticReach({ catalog: true }), sets = [c.BASIC_CARDS, c.BASIC_TACTICS, c.ADVANCED_CARDS, c.MARKET_MILITARY, c.RELIC_CARDS, c.SUPPLY_CARDS];
      const all = sets.flatMap(set => Object.entries(set)), sheet = document.createElement('div');
      sheet.id = 'face-sheet'; sheet.style.cssText = 'position:fixed;inset:0;z-index:99;overflow:auto;display:grid;grid-template-columns:repeat(10,1fr);gap:8px;padding:10px;background:#0e2a25';
      sheet.innerHTML = all.map(([key, def]) => '<div class="sheet-cell">' + c.cardFace(def, !def.code && ['move', 'construct'].includes(def.order) ? { key, starter: true } : {}) + '<small style="color:#cfe;font:10px system-ui">' + key + '</small></div>').join('');
      document.body.append(sheet);
      return all.length;
    })()`);
    for (const width of [100, 250]) {
      await evaluate(`document.querySelector('#face-sheet').style.gridTemplateColumns = 'repeat(auto-fill, ${width}px)'`);
      await evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
      assert.deepEqual(await evaluate(FACE_PROBLEMS('#face-sheet')), [], `Every design's face is whole at ${width}px`);
    }
    if (process.env.SHOTS) {
      fs.mkdirSync(process.env.SHOTS, { recursive: true });
      await browser.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1520, deviceScaleFactor: 1, mobile: false });
      await evaluate(`document.querySelector('#face-sheet').style.gridTemplateColumns = 'repeat(10, 1fr)'`);
      await evaluate('Promise.all([...document.querySelectorAll("#face-sheet img")].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })))');
      const shot = await browser.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(process.env.SHOTS, 'card-face-contact-sheet.png'), Buffer.from(shot.data, 'base64'));
    }
    await evaluate("document.querySelector('#face-sheet').remove()");
    console.log(`ok - all ${designs} designs' faces whole at 100px and 250px`);

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
      const faceProblems = await evaluate(FACE_PROBLEMS('.gallery-card'));
      assert.deepEqual(faceProblems, [], `${width}×${height}: every face keeps its parts in place, whole`);
      if (process.env.SHOTS && width === 1440) {
        await evaluate('scrollTo(0,0)');
        const shot = await browser.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(process.env.SHOTS, 'market-gallery-1440x900.png'), Buffer.from(shot.data, 'base64'));
      }
      console.log(`ok - gallery ${width}×${height}${touch ? ' touch' : ''}`);
    }
    assert.deepEqual(browser.errors, [], 'No gallery runtime errors');
  } catch (error) {
    console.error('Gallery diagnostics:', await evaluate('({cards:document.querySelectorAll(".gallery-card").length,art:document.querySelectorAll(".gallery-credit").length,status:document.querySelector("#store-status")?.textContent,title:document.title})'));
    console.error('Browser errors:', browser.errors);
    throw error;
  } finally { browser.close(); server.close(); }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
