// Starting a game from the home page, against an isolated local DEV_AUTH server. No mocks.
// Build web + server first, then TABLETOP_ORIGIN=http://127.0.0.1:PORT node scripts/check-start-flow.cjs
// Play alone never opens a waiting room, an invitation or a shared table; the two
// choices are the whole first screen at phone and desktop sizes. SHOTS=path saves captures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {findChrome, launch} = require('./check-viewport-fit.cjs');
const origin = process.env.TABLETOP_ORIGIN;
assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin || ''), 'Use an isolated loopback DEV_AUTH server');
async function wait(browser, expression) {
  for (let n = 0; n < 200; n++) {
    if (await browser.evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Browser did not reach: ${expression}; notice: ${await browser.evaluate("document.querySelector('#notice')?.textContent || document.querySelector('#table-sync')?.textContent")}`);
}
async function request(browser, route, body) {
  return browser.evaluate(`(async()=>{const r=await fetch(${JSON.stringify(route)}, {method:${JSON.stringify(body === undefined ? 'GET' : 'POST')}, headers:{'content-type':'application/json','x-drawing-board':'1'}, ${body === undefined ? '' : `body:JSON.stringify(${JSON.stringify(body)}),`} credentials:'same-origin'}); return {status:r.status, data:await r.json()};})()`);
}
async function sized(browser, label, sizes) {
  for (const [width, height] of sizes) {
    await browser.send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor:1, mobile:false});
    await browser.send('Emulation.setTouchEmulationEnabled', {enabled:true});
    await browser.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    assert(await browser.evaluate(`document.scrollingElement.scrollWidth<=${width}`), `${label}: horizontal overflow at ${width}x${height}`);
    if (process.env.SHOTS) {
      fs.mkdirSync(process.env.SHOTS, {recursive:true});
      const shot = await browser.send('Page.captureScreenshot', {format:'png'});
      fs.writeFileSync(path.join(process.env.SHOTS, `${label}-${width}x${height}.png`), Buffer.from(shot.data, 'base64'));
    }
  }
}
const SIZES = [[390,844],[844,390],[1280,720]];
(async()=>{
  const chrome = findChrome(); assert(chrome);
  const player = await launch(chrome), visitor = await launch(chrome);
  try {
    // Without an account, Play alone opens the game in this browser with its New game choices.
    await visitor.navigate(`${origin}/`);
    await wait(visitor, "document.querySelectorAll('.start-choice').length===2");
    assert.deepEqual(await visitor.evaluate("[...document.querySelectorAll('.start-choice strong')].map(e=>e.textContent)"), ['Play alone', 'Play with others']);
    await sized(visitor, 'home-visitor', SIZES);
    await visitor.evaluate("document.querySelector('.start-choice.alone').click()");
    await wait(visitor, "location.pathname==='/galactic-reach/' && document.querySelector('#new-game-dialog')?.open");
    assert.equal(await visitor.evaluate('location.search'), '', 'the address bar returns to the plain game');

    await player.navigate(origin);
    assert.equal((await request(player, '/api/auth/dev', {name:'Solo player'})).status, 200);
    await player.navigate(`${origin}/`);
    await wait(player, "!!document.querySelector('#play-with-others')");
    const words = await player.evaluate("document.querySelector('.hero').innerText");
    for (const word of ['table', 'lobby', 'seat', 'tabletop']) assert(!new RegExp(`\\b${word}`, 'i').test(words), `first screen says "${word}"`);
    await sized(player, 'home', SIZES);
    await player.evaluate("document.querySelector('.start-choice.alone').click()");
    await wait(player, "location.hash==='#alone' && !!document.querySelector('#alone-form')");
    const alone = await player.evaluate("document.querySelector('main').innerText");
    for (const word of ['table', 'lobby', 'seat', 'invite', 'waiting', 'link']) assert(!new RegExp(`\\b${word}`, 'i').test(alone), `Play alone says "${word}"`);
    await sized(player, 'alone', SIZES);
    await player.evaluate("document.querySelector('#alone-target').value='40';document.querySelector('#alone-form').requestSubmit()");
    await wait(player, "location.pathname==='/galactic-reach/' && new URLSearchParams(location.search).has('table') && document.querySelector('#table-sync')?.textContent==='Saved to your account'");
    const id = await player.evaluate("new URLSearchParams(location.search).get('table')");
    const table = (await request(player, `/api/tables/${id}`)).data;
    assert.equal(table.lobby, null, 'no waiting room');
    assert.equal(table.shared_url, null, 'no shared table');
    assert.equal(table.settings.victory_target, 40);
    assert.equal(table.save.state.victoryTarget, 40, 'the first game races to the chosen target');
    for (const [route, body] of [[`/api/tables/${id}/lobby`], [`/api/tabletop/${id}/phone-invite`, {}], [`/api/tables/${id}/lobby/start`, {}]])
      assert.notEqual((await request(player, route, body)).status, 200, `${route} opens nothing for a game played alone`);
    await sized(player, 'game-alone', [[844,390],[1280,720]]);
    // Resuming sits beneath the two choices.
    await player.navigate(`${origin}/`);
    await wait(player, "!!document.querySelector('.resume a')");
    assert(await player.evaluate(`document.querySelector('.resume a').getAttribute('href')==='/galactic-reach/?table=${id}'`));
    assert.deepEqual(player.errors, []); assert.deepEqual(visitor.errors, []);
    console.log('ok - two start choices at phone and desktop sizes; Play alone starts a saved game at the chosen target with no waiting room, invitation or shared table; a visitor gets the New game choices; resume sits beneath');
  } finally { player.close(); visitor.close(); }
})().catch(error=>{console.error(error);process.exit(1);});
