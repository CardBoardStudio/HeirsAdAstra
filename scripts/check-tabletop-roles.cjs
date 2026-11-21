// Real room/device flow against an isolated local DEV_AUTH server. No mocks.
// Build web + server first, then TABLETOP_ORIGIN=http://127.0.0.1:PORT node scripts/check-tabletop-roles.cjs
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
  throw new Error(`Browser did not reach: ${expression}; status: ${await browser.evaluate("document.querySelector('#status')?.textContent || document.querySelector('#table-sync')?.textContent")}`);
}
async function request(browser, route, body) {
  return browser.evaluate(`(async()=>{const r=await fetch(${JSON.stringify(route)}, {method:${JSON.stringify(body === undefined ? 'GET' : 'POST')}, headers:{'content-type':'application/json','x-drawing-board':'1'}, ${body === undefined ? '' : `body:JSON.stringify(${JSON.stringify(body)}),`} credentials:'same-origin'}); const data=await r.json(); if(!r.ok)throw Error(data.error); return data;})()`);
}
async function click(browser, selector) { await browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); }
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
    await host.navigate(`${origin}/?game=galactic-reach#tables`);
    await wait(host, "!!document.querySelector('#table-form')");
    await host.evaluate("document.querySelector('#table-name').value='Independent devices';document.querySelector('#table-form').requestSubmit()");
    await wait(host, "location.pathname==='/tabletop/host.html' && document.querySelector('#title')?.textContent==='Independent devices'");
    const id = await host.evaluate("new URLSearchParams(location.search).get('table')");
    const setup = `${origin}/tabletop/host.html?table=${id}`;
    const scoped = suffix => `/api/tabletop/${id}/${suffix}`;
    await sized(host, 'setup', [[390,844],[844,390],[1024,768],[768,1024],[1280,720]]);
    await click(host, '#choose-player');
    await wait(host, "document.querySelector('#room')?.hidden===false && document.querySelector('#manual-link')?.value.includes('#invite=')");
    await host.evaluate("document.querySelector('#settings').open=true");
    // A public screen can pair before a game, without joining a faction.
    await click(host, '#board-link');
    await wait(host, "document.querySelector('#manual-link').value.includes('/board.html')");
    await board.navigate(await host.evaluate("document.querySelector('#manual-link').value"));
    await wait(board, "document.querySelector('#status')?.textContent.includes('Waiting for the host')");
    assert.equal(await board.evaluate('location.hash'), '', 'redeemed secrets leave the address bar');
    await click(host, '#invite');
    await wait(host, "document.querySelector('#manual-link').value.includes('#invite=')");
    await guest.navigate(await host.evaluate("document.querySelector('#manual-link').value"));
    await wait(guest, "document.querySelector('#join')?.hidden===false");
    await guest.evaluate("document.querySelector('#name').value='Guest';document.querySelector('#join').requestSubmit()");
    await wait(host, "[...document.querySelectorAll('#requests button')].some(b=>b.textContent==='Let them join')");
    await host.evaluate("[...document.querySelectorAll('#requests button')].find(b=>b.textContent==='Let them join').click()");
    await wait(guest, "document.querySelector('#status')?.textContent.includes('You’re in')");
    await click(host, '#start');
    await wait(host, "location.pathname.includes('/client/') && document.querySelector('.app-shell') && !document.querySelector('.app-shell').inert");
    await wait(board, "document.querySelectorAll('.hex').length===331");
    await sized(board, 'board', [[1024,768],[768,1024],[1280,720]]);
    await wait(guest, "document.querySelector('.app-shell') && !document.querySelector('.app-shell').inert");
    const before = await request(host, scoped('seat'));
    assert.equal(before.seats.filter(s=>s.human).length, 2);
    assert(before.manage_url, 'the organizer can return to setup');
    assert.equal((await request(guest, scoped('seat'))).manage_url, undefined, 'guest player gains no host privileges');
    // The same browser may show a public board and retain its separate private seat.
    await host.navigate(setup); await wait(host, "document.querySelector('#continue')?.hidden===false");
    await host.evaluate("document.querySelector('#settings').open=true");
    await click(host, '#board');
    await wait(host, "document.querySelectorAll('.hex').length===331");
    assert.equal((await request(host, scoped('seat'))).seat, before.seat);
    assert(await host.evaluate("!document.querySelector('#manage').hidden"));
    await click(host, '#manage');
    await wait(host, "document.querySelector('#continue')?.hidden===false");
    await host.evaluate("document.querySelector('#settings').open=true");
    await host.evaluate("window.confirm=()=>true");
    await click(host, '#revoke-board');
    await wait(board, "document.querySelector('#status')?.textContent.includes('revoked')");
    await click(host, '#play-here');
    await wait(host, "document.querySelector('.app-shell') && !document.querySelector('.app-shell').inert");
    await wait(host, `fetch('${scoped('seat')}').then(r=>r.json()).then(v=>v.seats[v.active]?.human)`);
    const view = await request(host, scoped('seat'));
    const result = await request(host, scoped('act'), {seq:view.seq, actions:[{type:'resource',card:view.state.players[view.seat].hand[0].id}]});
    assert(result.view.seq > view.seq, 'play continues after public displays are revoked');
    await host.send('Page.reload');
    await wait(host, "document.querySelector('.app-shell') && !document.querySelector('.app-shell').inert");
    assert.equal((await request(host, scoped('seat'))).seat, before.seat);
    await sized(host, 'personal-tablet', [[1024,768],[768,1024],[1280,720]]);
    await sized(guest, 'personal-phone', [[390,844],[844,390]]);
    // Public rules remain anonymous and travel on the same origin.
    await board.navigate(`${origin}/galactic-reach/rulebook.html#public-board`);
    await wait(board, "!!document.querySelector('#public-board')");
    await sized(board, 'rules', [[390,844]]);
    const fresh = await request(host, '/api/tables', {name:'Guided shared tablet', game:'galactic-reach', lobby:true});
    await host.navigate(`${origin}/tabletop/host.html?table=${fresh.id}`);
    await wait(host, "document.querySelector('#choose-role')?.hidden===false");
    await click(host, '#choose-board');
    await wait(host, "document.querySelector('#manual-link')?.value.includes('#pair=')");
    assert(await host.evaluate("document.querySelector('#start').disabled"));
    await board.navigate(await host.evaluate("document.querySelector('#manual-link').value"));
    await wait(board, "document.querySelector('#status')?.textContent.includes('You’re in')");
    await wait(host, "document.querySelector('#manual-link')?.value.includes('#invite=')");
    await guest.navigate(await host.evaluate("document.querySelector('#manual-link').value"));
    await wait(guest, "document.querySelector('#join')?.hidden===false");
    assert.equal(await guest.evaluate("document.querySelector('#title').textContent"), 'Guided shared tablet');
    await sized(guest, 'join', [[390,844],[844,390],[768,1024]]);
    await guest.evaluate("document.querySelector('#name').value='Returning friend';document.querySelector('#join').requestSubmit()");
    await wait(host, "[...document.querySelectorAll('#requests button')].some(b=>b.textContent==='Let them join')");
    await host.evaluate("[...document.querySelectorAll('#requests button')].find(b=>b.textContent==='Let them join').click()");
    await wait(host, "document.querySelector('#start')?.disabled===false");
    await sized(host, 'guided-lobby', [[390,844],[1024,768],[768,1024],[1280,720]]);
    await click(host, '#start');
    await wait(host, "document.querySelectorAll('.hex').length===331");
    for (const browser of [board, guest]) await wait(browser, "location.pathname.includes('/client/') && document.querySelector('.app-shell') && !document.querySelector('.app-shell').inert");
    assert.equal(await host.evaluate(`fetch('/api/tabletop/${fresh.id}/seat').then(r=>r.status)`), 401, 'shared tablet has no private player credential');
    await guest.navigate(`${origin}/tabletop/phone.html?table=${fresh.id}`);
    await wait(guest, "location.pathname.includes('/client/') && !!document.querySelector('.app-shell')");
    assert.deepEqual(host.errors, []); assert.deepEqual(guest.errors, []); assert.deepEqual(board.errors, []);
    console.log('ok - guided personal and shared-tablet creation; automatic game entry; resume; create → setup; guest approval; waiting board; personal tablet/phone; separate cookies; revoke display and continue; reload; anonymous rules');
  } finally { host.close(); guest.close(); board.close(); }
})().catch(error=>{console.error(error);process.exit(1);});
