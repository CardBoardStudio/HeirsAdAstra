// Real start/device flow against an isolated local DEV_AUTH server. No mocks.
// Build web + server first, then TABLETOP_ORIGIN=http://127.0.0.1:PORT node scripts/check-tabletop-roles.cjs
// CI runs this file; it first runs check-start-flow.cjs (Play alone) against the same server.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {findChrome, launch} = require('./check-viewport-fit.cjs');
const origin = process.env.TABLETOP_ORIGIN;
assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin || ''), 'Use an isolated loopback DEV_AUTH server');
if (require.main === module) execFileSync(process.execPath, [path.join(__dirname, 'check-start-flow.cjs')], {stdio:'inherit'});
async function wait(browser, expression) {
  for (let n = 0; n < 200; n++) {
    if (await browser.evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Browser did not reach: ${expression}; status: ${await browser.evaluate("document.querySelector('#status')?.textContent || document.querySelector('#table-sync')?.textContent")}`);
}
async function request(browser, route, body) {
  return browser.evaluate(`(async()=>{const r=await fetch(${JSON.stringify(route)}, {method:${JSON.stringify(body === undefined ? 'GET' : 'POST')}, headers:{'content-type':'application/json','x-drawing-board':'1'}, ${body === undefined ? '' : `body:JSON.stringify(${JSON.stringify(body)}),`} credentials:'same-origin'}); const data=await r.json(); if(!r.ok)throw Error(data.error); return data;})()`);
}
// One tap at a time, as a person does: wait for the previous one to finish (main[aria-busy]).
async function click(browser, selector) {
  await wait(browser, "!document.querySelector('main[aria-busy]')");
  await browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
}
// Choose how this device is used, as a person does: tap the picture's radio.
async function device(browser, value) { await click(browser, `input[name=device][value=${value}]`); }
async function sized(browser, label, sizes) {
  for (const [width, height] of sizes) {
    await browser.send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor:1, mobile:false});
    await browser.send('Emulation.setTouchEmulationEnabled', {enabled:true});
    await browser.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    assert(await browser.evaluate(`document.scrollingElement.scrollWidth<=${width}`), `${label}: horizontal overflow at ${width}x${height}`);
    if (label === 'board' && Math.min(width, height) >= 600) assert(await browser.evaluate(`document.scrollingElement.scrollHeight<=${height}`), 'tablet board must fit');
    if (process.env.SHOTS) {
      fs.mkdirSync(process.env.SHOTS, {recursive:true});
      const shot = await browser.send('Page.captureScreenshot', {format:'png'});
      fs.writeFileSync(path.join(process.env.SHOTS, `${label}-${width}x${height}.png`), Buffer.from(shot.data, 'base64'));
    }
  }
}
(async()=>{
  const chrome = findChrome(); assert(chrome);
  const host = await launch(chrome), guest = await launch(chrome), board = await launch(chrome);
  try {
    await host.navigate(origin);
    await request(host, '/api/auth/dev', {name:'Organizer'});
    // Play with others goes straight to the waiting screen, its link already showing.
    await host.navigate(`${origin}/`);
    await wait(host, "!!document.querySelector('#play-with-others')");
    await click(host, '#play-with-others');
    await wait(host, "location.pathname==='/tabletop/host.html' && document.querySelector('#manual-link')?.value.includes('#invite=')");
    assert.equal(await host.evaluate("document.querySelector('#title').textContent"), 'Organizer’s game');
    assert(await host.evaluate("!!document.querySelector('#qr').src && document.querySelector('#start').disabled"), 'link and QR first; Start waits for someone');
    const id = await host.evaluate("new URLSearchParams(location.search).get('table')");
    const setup = `${origin}/tabletop/host.html?table=${id}`;
    const scoped = suffix => `/api/tabletop/${id}/${suffix}`;
    const link = await host.evaluate("document.querySelector('#manual-link').value");
    // Reloading the waiting screen shows the same link; it never rotates one already sent.
    await host.send('Page.reload');
    await wait(host, "document.querySelector('#manual-link')?.value.includes('#invite=')");
    assert.equal(await host.evaluate("document.querySelector('#manual-link').value"), link);
    await sized(host, 'waiting', [[390,844],[844,390],[1024,768],[768,1024],[1280,720]]);
    await device(host, 'game');
    await wait(host, "document.querySelector('input[name=device][value=game]').checked && !document.querySelector('main[aria-busy]')");
    // A public screen can pair before a game, without taking a place.
    await host.evaluate("document.querySelector('#settings').open=true");
    await click(host, '#board-link');
    await wait(host, "document.querySelector('#other-link input')?.value.includes('/board.html')");
    await board.navigate(await host.evaluate("document.querySelector('#other-link input').value"));
    await wait(board, "document.querySelector('#status')?.textContent.includes('Waiting for the host')");
    assert.equal(await board.evaluate('location.hash'), '', 'redeemed secrets leave the address bar');
    // Joining: the name and how this device is used are both asked before anyone joins.
    await guest.navigate(link);
    await wait(guest, "document.querySelector('#join')?.hidden===false");
    assert.equal(await guest.evaluate("document.querySelector('#title').textContent"), 'Organizer’s game');
    await sized(guest, 'join', [[390,844],[844,390],[768,1024]]);
    await guest.evaluate("document.querySelector('#name').value='Guest';document.querySelector('#join').requestSubmit()");
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(await guest.evaluate("document.querySelector('#join').checkValidity()"), false, 'a device choice is required');
    assert.equal((await request(host, scoped('requests'))).requests.length, 0, 'no request without a device choice');
    await device(guest, 'hand');
    await guest.evaluate("document.querySelector('#join').requestSubmit()");
    await wait(host, "[...document.querySelectorAll('#requests button')].some(b=>b.textContent==='Let them join')");
    await wait(guest, "document.querySelector('#status')?.textContent.includes('Waiting for the host')");
    await host.evaluate("[...document.querySelectorAll('#requests button')].find(b=>b.textContent==='Let them join').click()");
    await wait(guest, "document.querySelector('#status')?.textContent.includes('You’re in')");
    assert(await guest.evaluate("document.querySelector('input[name=device][value=hand]').checked"), 'the joiner keeps their choice while waiting');
    await wait(host, "document.querySelector('#start')?.disabled===false && document.querySelector('#start').textContent.includes('2 computer rivals')");
    await click(host, '#start');
    await wait(host, "location.pathname.includes('/client/') && document.querySelector('.app-shell') && !document.querySelector('.app-shell').inert");
    await wait(board, "document.querySelectorAll('.hex').length===331");
    await sized(board, 'board', [[1024,768],[768,1024],[1280,720]]);
    await wait(guest, "document.querySelector('.app-shell') && !document.querySelector('.app-shell').inert");
    // The joiner's choice reaches their game, and the game menu changes it.
    assert.equal(await guest.evaluate('document.body.dataset.deviceView'), 'hand');
    assert.equal(await host.evaluate('document.body.dataset.deviceView'), 'game');
    await click(guest, '#device-view-button');
    assert.equal(await guest.evaluate('document.body.dataset.deviceView'), 'game');
    await guest.send('Page.reload');
    await wait(guest, "document.querySelector('.app-shell') && !document.querySelector('.app-shell').inert && document.body.dataset.deviceView==='game'");
    const before = await request(host, scoped('seat'));
    assert.equal(before.seats.filter(s=>s.human).length, 2);
    assert(before.manage_url, 'the host can return to the waiting screen');
    assert.equal((await request(guest, scoped('seat'))).manage_url, undefined, 'a joiner gains no host privileges');
    // The same browser may show a public board and keep its separate private seat.
    await host.navigate(setup); await wait(host, "document.querySelector('#continue')?.hidden===false");
    await device(host, 'board');
    await wait(host, "document.querySelectorAll('.hex').length===331");
    assert.equal((await request(host, scoped('seat'))).seat, before.seat);
    assert(await host.evaluate("!document.querySelector('#manage').hidden"));
    await click(host, '#manage');
    await wait(host, "document.querySelector('#continue')?.hidden===false");
    await host.evaluate("document.querySelector('#settings').open=true");
    await host.evaluate("window.confirm=()=>true");
    await click(host, '#revoke-board');
    await wait(board, "document.querySelector('#status')?.textContent.includes('revoked')");
    await device(host, 'game');
    await wait(host, "document.querySelector('.app-shell') && !document.querySelector('.app-shell').inert");
    await wait(host, `fetch('${scoped('seat')}').then(r=>r.json()).then(v=>v.seats[v.active]?.human)`);
    const view = await request(host, scoped('seat'));
    const result = await request(host, scoped('act'), {seq:view.seq, actions:[{type:'resource',card:view.state.players[view.seat].hand[0].id}]});
    assert(result.view.seq > view.seq, 'play continues after public displays are revoked');
    await host.send('Page.reload');
    await wait(host, "document.querySelector('.app-shell') && !document.querySelector('.app-shell').inert");
    assert.equal((await request(host, scoped('seat'))).seat, before.seat);
    await sized(host, 'personal-tablet', [[1024,768],[768,1024],[1280,720]]);
    await sized(guest, 'personal-phone', [[844,390]]);
    // Public rules remain anonymous and travel on the same origin.
    await board.navigate(`${origin}/galactic-reach/rulebook.html#public-board`);
    await wait(board, "!!document.querySelector('#public-board')");
    await sized(board, 'rules', [[390,844]]);
    // The host's own device as the board for everyone: their hand goes on their phone first.
    const fresh = await request(host, '/api/tables', {name:'Shared screen game', game:'galactic-reach', lobby:true});
    await host.navigate(`${origin}/tabletop/host.html?table=${fresh.id}`);
    await wait(host, "document.querySelector('#manual-link')?.value.includes('#invite=')");
    const freshLink = await host.evaluate("document.querySelector('#manual-link').value");
    await device(host, 'board');
    await wait(host, "document.querySelector('#phone-box input')?.value.includes('#pair=')");
    assert(await host.evaluate("document.querySelector('#start').disabled"));
    await board.navigate(await host.evaluate("document.querySelector('#phone-box input').value"));
    await wait(board, "document.querySelector('#status')?.textContent.includes('You’re in')");
    await wait(host, "document.querySelector('#phone-box').textContent.includes('connected')");
    await guest.navigate(freshLink);
    await wait(guest, "document.querySelector('#join')?.hidden===false");
    await guest.evaluate("document.querySelector('#name').value='Returning friend'");
    await device(guest, 'game');
    await guest.evaluate("document.querySelector('#join').requestSubmit()");
    await wait(host, "[...document.querySelectorAll('#requests button')].some(b=>b.textContent==='Let them join')");
    await host.evaluate("[...document.querySelectorAll('#requests button')].find(b=>b.textContent==='Let them join').click()");
    await wait(host, "document.querySelector('#start')?.disabled===false");
    await sized(host, 'waiting-ready', [[390,844],[844,390],[1024,768],[768,1024],[1280,720]]);
    await click(host, '#start');
    await wait(host, "document.querySelectorAll('.hex').length===331");
    for (const browser of [board, guest]) await wait(browser, "location.pathname.includes('/client/') && document.querySelector('.app-shell') && !document.querySelector('.app-shell').inert");
    assert.equal(await board.evaluate('document.body.dataset.deviceView'), 'hand', 'the host phone is their hand');
    assert.equal(await host.evaluate(`fetch('/api/tabletop/${fresh.id}/seat').then(r=>r.status)`), 401, 'the shared screen has no private player credential');
    await guest.navigate(`${origin}/tabletop/phone.html?table=${fresh.id}`);
    await wait(guest, "location.pathname.includes('/client/') && !!document.querySelector('.app-shell')");
    assert.deepEqual(host.errors, []); assert.deepEqual(guest.errors, []); assert.deepEqual(board.errors, []);
    console.log('ok - play with others → waiting screen with link and QR; stable link on reload; joiner must choose hand or whole game; choice reaches the game and the menu changes it; approval; waiting board; separate cookies; revoke display and continue; reload; host board with phone hand; anonymous rules');
  } finally { host.close(); guest.close(); board.close(); }
})().catch(error=>{console.error(error);process.exit(1);});
