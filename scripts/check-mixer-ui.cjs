// Local fixture for the developer launcher: no Docker, GitHub or live games.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const {once} = require('node:events');
const {findChrome, launch} = require('./check-viewport-fit.cjs');
(async () => {
  const calls = [];
  const key = 'abcdef012345';
  const mix = {key,mainSha:'a'.repeat(40),created:1700000000000,status:'built',prs:[{number:156,title:'Table setup & devices'}],accessCode:'fixture-only-code'};
  const server = http.createServer((req,res) => {
    calls.push([req.method,req.url]); req.resume();
    if(req.url==='/__mixer/') {res.setHeader('content-type','text/html');res.end(fs.readFileSync('deploy/pr-mixer/ui.html'));return;}
    res.setHeader('content-type','application/json');
    if(req.url.startsWith('/__mixer/api/prs')) return res.end(JSON.stringify({prs:[],presets:{},admin:'Fixture operator'}));
    if(req.url==='/__mixer/api/mixes') return res.end(JSON.stringify({mixes:[mix],limits:{maxRunning:3,maxKept:8,idleHours:6}}));
    if(req.url===`/__mixer/api/mixes/${key}/open`) return res.end(JSON.stringify({url:'/opened'}));
    if(req.url==='/opened') {res.setHeader('content-type','text/html');return res.end('<h1>Game lobby</h1>');}
    res.writeHead(404);res.end('{}');
  }).listen(0,'127.0.0.1');
  await once(server,'listening');
  const browser = await launch(findChrome());
  try {
    await browser.navigate(`http://127.0.0.1:${server.address().port}/__mixer/`);
    for(let n=0;n<100;n++) {if(await browser.evaluate("!!document.querySelector('#latest button')"))break;await new Promise(r=>setTimeout(r,50));}
    assert.equal(await browser.evaluate("document.querySelector('#choose').open"),false);
    assert.equal(await browser.evaluate("document.querySelector('#latest button').textContent"),'Open playtest');
    for(const [width,height] of [[390,844],[1024,768],[768,1024],[1280,720]]) {
      await browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await browser.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
      assert(await browser.evaluate(`document.scrollingElement.scrollWidth<=${width}`));
      if(process.env.SHOTS){fs.mkdirSync(process.env.SHOTS,{recursive:true});const shot=await browser.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(`${process.env.SHOTS}/launcher-${width}x${height}.png`,Buffer.from(shot.data,'base64'));}
    }
    await browser.evaluate("document.querySelector('#latest button').click()");
    for(let n=0;n<100;n++) {if(await browser.evaluate("location.pathname==='/opened'"))break;await new Promise(r=>setTimeout(r,50));}
    assert.equal(await browser.evaluate('location.pathname'),'/opened');
    assert(calls.some(([method,path])=>method==='POST'&&path===`/__mixer/api/mixes/${key}/open`));
    assert.deepEqual(browser.errors,[]);
    console.log('ok - ready playtest first; advanced controls collapsed; responsive launcher; authorized POST launch');
  } finally {browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});
