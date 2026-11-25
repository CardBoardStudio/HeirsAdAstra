// Drive the real guest and account solo setup, with local API fixtures only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {findChrome,launch}=require('./check-viewport-fit.cjs');
const root=path.resolve(__dirname,'..'),fixtures=require('./fixtures/viewport-lab-api.json'),id='b'.repeat(32);
let created=null,saved=null,revision=0;
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://local'),json=(data,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
  if(req.method==='POST'){
    let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);
    if(url.pathname==='/api/tables'){created=body;saved=null;revision=0;return json({id,url:`/galactic-reach/?table=${id}`});}
    if(url.pathname===`/api/tables/${id}/save`){saved=body.save;return json({revision:++revision});}
    return json({error:'Unexpected write'},400);
  }
  if(url.pathname===`/api/tables/${id}`)return json({id,name:'Rival choices',owner_id:fixtures['/api/account'].id,revision,rules_version:'galactic-reach/38.43',save:saved,lobby:null,shared_url:null,settings:{victory_target:created.victory_target,bot_profiles:created.bot_profiles}});
  if(url.pathname.startsWith('/api/'))return json(fixtures[url.pathname]??{error:'Not in fixture'},fixtures[url.pathname]?200:404);
  const dir=path.join(root,'prototypes',url.pathname.startsWith('/galactic-reach/')?'galactic-reach':'lab');
  const rel=url.pathname.startsWith('/galactic-reach/')?url.pathname.slice(16):url.pathname.replace(/^\/(lab\/)?/,'');
  const file=path.resolve(dir,rel||'index.html');
  if(!file.startsWith(dir+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);return res.end();}
  res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
async function wait(b,expression){
  for(let n=0;n<200;n++){
    try{if(await b.evaluate(`Boolean(${expression})`))return;}catch(error){if(!/navigated|context.*destroyed/i.test(error.message))throw error;}
    await new Promise(r=>setTimeout(r,25));
  }
  throw Error('Setup did not reach expected state: '+expression);
}
async function screenshot(b,name){if(!process.env.SHOTS)return;fs.mkdirSync(process.env.SHOTS,{recursive:true});const r=await b.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(process.env.SHOTS,name+'.png'),Buffer.from(r.data,'base64'));}
(async()=>{
  const chrome=findChrome();assert(chrome,'Install Chrome or set CHROME_PATH');
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`,b=await launch(chrome);
  try{
    for(const [width,height] of [[1280,720],[1024,768],[768,1024],[844,390],[667,375],[390,844]])for(const stars of [false,true]){
      await b.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await b.send('Emulation.setTouchEmulationEnabled',{enabled:width<1200});
      await b.navigate(origin+'/galactic-reach/rulebook.html');
      await b.evaluate(`localStorage.clear();localStorage.setItem('galactic-reach-background',${JSON.stringify(stars?'stars':'green')});localStorage.setItem('galactic-reach-guide-v1','{"enabled":false}');`);
      await b.navigate(origin+'/galactic-reach/?new=1');await wait(b,'document.querySelector("#new-game-dialog").open');
      assert.deepEqual(await b.evaluate('[1,2,3].map(i=>document.querySelector("#new-game-rival-"+i).value)'),['militaryFocused','economy','expansion']);
      const fit=await b.evaluate(`(()=>{const d=document.querySelector('#new-game-dialog'),r=d.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,scroll:d.scrollHeight,client:d.clientHeight,wide:d.scrollWidth>d.clientWidth+1};})()`);
      assert(fit.left>=-1&&fit.top>=-1&&fit.right<=width+1&&fit.bottom<=height+1&&!fit.wide,JSON.stringify({width,height,fit}));
      if(Math.min(width,height)>=600)assert(fit.scroll<=fit.client+2,'Desktop/iPad settings fit without scrolling');
      await b.evaluate(`[1,2,3].forEach(i=>{const s=document.querySelector('#new-game-rival-'+i);s.value='military';s.dispatchEvent(new Event('change'));});document.querySelector('#new-game-rival-1').focus();`);
      assert.equal(await b.evaluate('document.activeElement.id'),'new-game-rival-1');
      assert(!(await b.evaluate('document.querySelector("#new-game-neighbor").textContent')).includes('Military Focused'));
      await screenshot(b,`rivals-${width}x${height}-${stars?'stars':'green'}`);
      await b.evaluate('document.querySelector("#new-game-start").click()');
      await wait(b,'!document.querySelector("#new-game-dialog").open && JSON.parse(localStorage.getItem("galactic-reach-save-v38"))?.players.filter(p=>p.strategy==="military").length===3');
      assert.equal(await b.evaluate('JSON.parse(localStorage.getItem("galactic-reach-save-v38")).players.filter(p=>p.strategy==="military").length'),3);
      console.log(`ok - guest rivals ${width}x${height}, ${stars?'Max':'Willem'} UI`);
    }
    // The account form submits all three profiles; table.js passes them to the real engine.
    await b.send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
    await b.navigate(origin+'/?game=galactic-reach#alone');await wait(b,'document.querySelector("#alone-form")');
    assert.deepEqual(await b.evaluate('[1,2,3].map(i=>document.querySelector("#alone-rival-"+i).value)'),['militaryFocused','economy','expansion']);
    await b.evaluate(`['maxbot','militaryFocused','maxbot'].forEach((p,i)=>document.querySelector('#alone-rival-'+(i+1)).value=p);document.querySelector('#alone-form').requestSubmit();`);
    await wait(b,'document.querySelector("#saved-table-name")?.textContent==="Rival choices" && !document.querySelector(".app-shell").inert');
    await wait(b,'document.querySelector("#table-sync")?.textContent?.includes("Saved")');
    assert.deepEqual(created.bot_profiles,['maxbot','militaryFocused','maxbot']);
    assert.deepEqual(saved.state.players.slice(1).map(p=>p.strategy).sort(),['maxbot','maxbot','militaryFocused']);
    console.log('ok - account solo form, persisted setup, repeated profiles and real table-engine startup');
    assert.deepEqual(b.errors,[]);
  }finally{b.close();server.closeAllConnections();server.close();}
})().catch(error=>{console.error(error);server.closeAllConnections();server.close();process.exit(1);});
