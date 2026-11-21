(() => {
  'use strict';
  const id=new URLSearchParams(location.search).get('table'),$=id=>document.getElementById(id),host=document.body.dataset.role==='host';
  const fragment=new URLSearchParams(location.hash.slice(1));history.replaceState(null,'',location.pathname+location.search);
  let invite=fragment.get('invite'),timer,qr;
  async function api(path,body){const r=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json','x-drawing-board':'1'},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||'The table could not be reached.');return data;}
  const scoped=(path,body)=>api(`/api/tabletop/${id}/${path}`,body);
  function fail(e){$('status').textContent=e.message;}
  function showLink(data,title,note=''){$('link-box').hidden=false;$('link-note').textContent=note;$('link-title').textContent=title;$('link').href=data.url;$('manual-link').value=data.url;
    if(qr)URL.revokeObjectURL(qr);qr=URL.createObjectURL(new Blob([data.qr],{type:'image/svg+xml'}));$('qr').src=qr;}
  function button(text,action){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=()=>action().catch(fail);return b;}
  async function refreshHost(){
    const [room,phones]=await Promise.all([api(`/api/tables/${id}/lobby`),scoped('requests')]);
    $('title').textContent=room.name;$('lobby').href=`/?game=galactic-reach#lobby/${id}`;
    $('start').hidden=room.status==='started';$('play-here').disabled=room.status!=='started';$('invite').disabled=room.status!=='waiting';$('host-phone').textContent='Pair my other device';
    $('roster').textContent=room.seats.map(s=>s.name||'AI rival').join(' · ');
    $('requests').replaceChildren(...phones.requests.filter(p=>p.status!=='rejected').map(p=>{const row=document.createElement('article'),text=document.createElement('p');text.textContent=`${p.name} · ${p.code} · ${p.status}`;row.append(text);
      if(p.status==='pending'&&room.status==='waiting'){for(const approve of [true,false])row.append(button(approve?'Approve':'Reject',async()=>{await scoped('approve',{participant:p.participant,approve});await refreshHost();}));}
      if(p.status==='approved')row.append(button('Replace this player’s device',async()=>showLink(await scoped('repair',{participant:p.participant}),`Replacement device for ${p.name}`)));return row;}));
    $('status').textContent=room.status==='started'?'Game started. Choose Play here or Show public board here. You can return to manage the table at any time.':'Invite and approve players, then start. A public board is optional and can wait for the game.';
  }
  async function refreshPhone(){const view=await scoped('seat');$('code').textContent=view.code?`Pairing code: ${view.code}`:'';
    if(view.status==='pending')$('status').textContent='Waiting for host approval. Compare the pairing code with your host.';
    else if(view.status==='closed')$('status').textContent='The game started before this player was approved. Ask the host to include you in the next game.';
    else if(view.status==='waiting'){$('title').textContent=view.name;$('status').textContent='Approved. Waiting for the host to start.';}
    else if(view.client_path){$('title').textContent=view.name;$('status').textContent='Your seat is ready. Open your personal game on this device.';$('play').href=`${view.client_path}?tabletop=${id}`;$('play').hidden=false;if(view.manage_url){$('manage').href=view.manage_url;$('manage').hidden=false;}}
  }
  async function poll(){clearTimeout(timer);try{if(document.visibilityState==='visible')await (host?refreshHost():refreshPhone());}catch(e){fail(e);}timer=setTimeout(poll,3000);}
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')poll();});window.addEventListener('online',poll);
  (async()=>{try{if(!/^[a-f0-9]{32}$/.test(id||''))throw new Error('Open Table setup from your waiting room, or scan a player invitation.');
    if(host){
      $('host-phone').onclick=async()=>{try{showLink(await scoped('host-phone',{}),'Pair your personal device','This replaces your previous player-device links. It does not change your seat.');}catch(e){fail(e);}};
      $('invite').onclick=async()=>{try{showLink(await scoped('phone-invite',{}),'Players: scan to request a seat');}catch(e){fail(e);}};
      $('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('manual-link').value);$('status').textContent='Pairing link copied.';}catch{$('manual-link').select();$('status').textContent='Select and copy the link shown below the QR code.';}};
      $('start').onclick=async()=>{try{await scoped('play-here',{});await api(`/api/tables/${id}/lobby/start`,{});await refreshHost();}catch(e){fail(e);}};
      $('play-here').onclick=async()=>{try{await scoped('play-here',{});const view=await scoped('seat');if(!view.client_path)throw new Error('Start the game before opening your player view.');location.assign(`${view.client_path}?tabletop=${id}`);}catch(e){fail(e);}};
      $('board-link').onclick=async()=>{try{showLink(await scoped('board-grant',{}),'Pair a shared public board','Public information only. This screen takes no player seat.');}catch(e){fail(e);}};
      $('revoke-board').onclick=async()=>{try{await scoped('board-revoke',{});$('link-box').hidden=true;$('status').textContent='Public board links and sessions revoked. Player seats are unchanged.';}catch(e){fail(e);}};
      $('board').onclick=async()=>{try{const result=await scoped('board-grant',{});location.assign(result.url);}catch(e){fail(e);}};
      await poll();
    }else if(fragment.get('pair')){const grant=await scoped('redeem',{token:fragment.get('pair')});if(grant.role==='board'){location.replace(`/tabletop/board.html?table=${id}`);return;}await poll();}
    else if(invite){$('join').hidden=false;$('status').textContent='Enter the name your friends know.';$('join').onsubmit=async event=>{event.preventDefault();try{await scoped('join',{invite,name:$('name').value});invite=null;$('join').hidden=true;await poll();}catch(e){fail(e);}};}
    else await poll();
  }catch(e){fail(e);}})();
})();
