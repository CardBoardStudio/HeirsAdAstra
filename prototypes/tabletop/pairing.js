(() => {
  'use strict';
  const id = new URLSearchParams(location.search).get('table');
  const $ = id => document.getElementById(id);
  const host = document.body.dataset.role === 'host';
  const fragment = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname + location.search);
  const preference = `table-screen:${id}`;
  let mode = null, timer, qr, room, busy = false, polling = false, entering = false;
  let linkKind = null, awaitingPhone = false, rosterKey = '', requestsKey = '';
  let invite = fragment.get('invite'), pair = fragment.get('pair');
  try { mode = sessionStorage.getItem(preference); } catch { /* in-memory choice works too */ }
  if (!['player', 'board'].includes(mode)) mode = null;
  function setMode(value) {
    mode = value;
    try { sessionStorage.setItem(preference, value); } catch { /* optional preference */ }
  }
  async function api(path, body) {
    const r = await fetch(path, {method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
      headers: body === undefined ? {} : {'Content-Type': 'application/json', 'x-drawing-board': '1'},
      ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.error || 'This game is temporarily unavailable.'), {status:r.status});
    return data;
  }
  const scoped = (path, body) => api(`/api/tabletop/${id}/${path}`, body);
  function fail(e) {
    const temporary = !e.status || e.status >= 500;
    $('status').textContent = temporary ? 'Connection interrupted. Your place is saved. Trying to reconnect…' : e.message;
    $('retry').hidden = !temporary;
    if (!host) $('next').textContent = temporary ? 'Keep this screen open, or try again.' : 'Ask your host to check the invitation or reconnect your existing seat.';
  }
  async function action(fn) {
    if (busy) return;
    busy = true;
    try { await fn(); } catch(e) { fail(e); } finally { busy = false; }
  }
  function button(text, fn) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = text;
    b.onclick = () => action(fn); return b;
  }
  function showLink(data, kind, title, note) {
    linkKind = kind;
    $('link-box').hidden = false; $('link-title').textContent = title; $('link-note').textContent = note;
    $('link').href = data.url; $('manual-link').value = data.url;
    $('copy').textContent = kind === 'invite' ? 'Copy invite' : 'Copy link';
    if (qr) URL.revokeObjectURL(qr);
    qr = URL.createObjectURL(new Blob([data.qr], {type:'image/svg+xml'})); $('qr').src = qr;
  }
  async function showInvite() {
    showLink(await scoped('phone-invite', {}), 'invite', 'Invite players', 'Friends scan this code, enter their name, and wait for you to let them join.');
    $('invite').hidden = true;
  }
  async function connectPhone() {
    showLink(await scoped('host-phone', {}), 'host', 'Connect your phone', 'This is your own seat. Scan with your phone; player invitations come next.');
    awaitingPhone = true;
  }
  async function enterGame() {
    if (mode === 'board') { const result = await scoped('board-grant', {}); location.assign(result.url); return; }
    await scoped('play-here', {});
    const view = await scoped('seat');
    if (!view.client_path) throw new Error('Waiting for the game to start.');
    location.assign(`${view.client_path}?tabletop=${id}`);
  }
  async function refreshHost() {
    const [nextRoom, phones] = await Promise.all([api(`/api/tables/${id}/lobby`), scoped('requests')]);
    room = nextRoom;
    $('title').textContent = room.name; $('lobby').href = `/?game=galactic-reach#lobby/${id}`;
    $('retry').hidden = true;
    $('choose-role').hidden = !!mode || room.status !== 'waiting';
    $('room').hidden = !mode && room.status === 'waiting'; $('settings').hidden = !mode && room.status === 'waiting';
    $('screen-role').textContent = mode === 'board' ? 'This screen is a shared board. Your phone holds your hand.' : 'This screen is your personal game.';
    const humans = room.seats.filter(s => s.kind === 'host' || s.kind === 'friend').length;
    const ready = mode !== 'board' || phones.host_device_ready;
    $('connect-phone').hidden = ready || room.status !== 'waiting';
    $('start').hidden = room.status === 'started';
    $('start').disabled = !mode || !ready || humans < 2 || room.status !== 'waiting';
    $('start').textContent = !ready ? 'Connect your phone to continue' : humans < 2 ? 'Waiting for another player' : `Start game · ${humans} players${humans < 4 ? ` + ${4-humans} AI` : ''}`;
    $('continue').hidden = room.status !== 'started';
    $('continue').textContent = mode === 'board' ? 'Open public board' : 'Open my game';
    $('invite').hidden = room.status !== 'waiting' || !ready || linkKind === 'invite';
    $('refresh-invite').disabled = room.status !== 'waiting';
    $('status').textContent = room.status === 'started' ? 'Game in progress. Manage devices below or return to your game.'
      : !mode ? 'Choose what this screen will show.' : !ready ? 'Connect your phone for your private hand.'
      : humans < 2 ? 'Invite a friend to begin.' : 'Your players are ready. Start when everyone is here.';
    const roster = JSON.stringify(room.seats);
    if (roster !== rosterKey) {
      rosterKey = roster;
      $('roster').replaceChildren(...room.seats.map(s => {
        const li = document.createElement('li'), label = document.createElement('strong'), detail = document.createElement('small');
        label.textContent = s.name || 'AI rival'; detail.textContent = s.kind === 'host' ? 'You · host' : s.kind === 'friend' ? 'Ready' : 'Fills an unused faction';
        li.append(label, detail); return li;
      }));
    }
    const requestState = JSON.stringify([room.status, phones.requests]);
    if (requestState !== requestsKey) {
      requestsKey = requestState; $('requests').replaceChildren(); $('devices').replaceChildren();
      for (const p of phones.requests) {
        if (p.status === 'rejected') continue;
        const row = document.createElement('article'), text = document.createElement('p');
        text.textContent = `${p.name} · ${p.code}${p.status === 'pending' ? ' · wants to join' : ''}`; row.append(text);
        if (p.status === 'pending' && room.status === 'waiting') {
          for (const approve of [true, false]) row.append(button(approve ? 'Let them join' : 'Decline', async () => {
            await scoped('approve', {participant:p.participant, approve}); await refreshHost();
          }));
          $('requests').append(row);
        } else if (p.status === 'approved') {
          row.append(button('Replace device', async () => {
            if (!confirm(`Replace ${p.name}’s device? Their previous device will lose access.`)) return;
            showLink(await scoped('repair', {participant:p.participant}), 'repair', `Reconnect ${p.name}`, 'Scan on the replacement device. The player keeps their seat.');
          })); $('devices').append(row);
        }
      }
    }
    if (awaitingPhone && phones.host_device_ready && room.status === 'waiting') {
      awaitingPhone = false; await showInvite();
    }
  }
  function displaySeat(view) {
    $('join').hidden = true; $('retry').hidden = true;
    if (view.name) $('title').textContent = view.name;
    $('code').textContent = view.code ? `Pairing code: ${view.code}` : '';
    $('next').textContent = 'This screen updates automatically. Keep it open.';
    if (view.status === 'pending') $('status').textContent = 'Waiting for your host to let you in. Compare the name and pairing code.';
    else if (view.status === 'closed') { $('status').textContent = 'This game started before you joined.'; $('next').textContent = 'Ask your host to include you in the next game.'; }
    else if (view.status === 'waiting') { $('status').textContent = 'You’re in. Waiting for your host to start.'; $('next').textContent = 'Your game opens automatically when it starts.'; }
    else if (view.client_path && !entering) {
      entering = true; clearTimeout(timer); $('status').textContent = 'Opening your game…';
      const url = `${view.client_path}?tabletop=${id}`; $('play').href = url; $('play').hidden = false;
      location.replace(url);
    }
  }
  async function refreshPhone() { displaySeat(await scoped('seat')); }
  async function poll() {
    clearTimeout(timer);
    if (polling || entering) return;
    polling = true;
    try { if (document.visibilityState === 'visible') await (host ? refreshHost() : refreshPhone()); }
    catch(e) { fail(e); }
    finally { polling = false; if (!entering) timer = setTimeout(poll, 2500); }
  }
  async function startGuest() {
    if (pair) { const grant = await scoped('redeem', {token:pair}); pair = null;
      if (grant.role === 'board') { location.replace(`/tabletop/board.html?table=${id}`); return; }
    }
    if (invite) {
      // A known paired device resumes instead of creating another request.
      try { displaySeat(await scoped('seat')); invite = null; await poll(); return; }
      catch(e) { if (e.status !== 401) throw e; }
      const details = await scoped('invite-details', {invite});
      $('title').textContent = details.name; $('status').textContent = 'Join your friends. Your hand stays on this device.';
      $('join').hidden = false; $('retry').hidden = true; $('next').textContent = 'Your host will approve your seat.';
      return;
    }
    await poll();
  }
  async function boot() {
    if (!/^[a-f0-9]{32}$/.test(id || '')) { $('status').textContent = 'This invitation is incomplete. Ask your host for a fresh link.'; return; }
    if (host) await poll(); else await startGuest();
  }
  $('retry').onclick = () => action(boot);
  if (host) {
    $('connect-phone').onclick = () => action(connectPhone);
    $('choose-player').onclick = () => action(async () => { await scoped('play-here', {}); setMode('player'); await showInvite(); await refreshHost(); });
    $('choose-board').onclick = () => action(async () => { setMode('board'); await connectPhone(); await refreshHost(); });
    $('invite').onclick = $('refresh-invite').onclick = () => action(showInvite);
    $('host-phone').onclick = () => action(async () => { if (confirm('Move your hand? Your previous player devices will lose access.')) { setMode('board'); await connectPhone(); await refreshHost(); } });
    $('copy').onclick = () => action(async () => { try { await navigator.clipboard.writeText($('manual-link').value); $('copy').textContent = 'Copied'; }
      catch { $('manual-link').closest('details').open = true; $('manual-link').select(); $('status').textContent = 'Select and copy the invitation link.'; } });
    $('start').onclick = () => action(async () => { if (mode === 'player') await scoped('play-here', {}); await api(`/api/tables/${id}/lobby/start`, {}); await enterGame(); });
    $('continue').onclick = () => action(enterGame);
    $('play-here').onclick = () => action(async () => { await scoped('play-here', {}); setMode('player'); if (room.status === 'started') await enterGame(); else { await showInvite(); await refreshHost(); } });
    $('board').onclick = () => action(async () => { setMode('board'); const result = await scoped('board-grant', {}); location.assign(result.url); });
    $('board-link').onclick = () => action(async () => showLink(await scoped('board-grant', {}), 'board', 'Add a shared display', 'Public information only. Scan on the extra screen; it takes no player seat.'));
    $('revoke-board').onclick = () => action(async () => { if (!confirm('Disconnect all shared displays? Player devices stay connected.')) return;
      await scoped('board-revoke', {}); if (linkKind === 'board') $('link-box').hidden = true; $('status').textContent = 'Shared displays disconnected. Player seats are unchanged.'; });
  } else {
    $('join').onsubmit = event => { event.preventDefault(); action(async () => {
      const name = $('name').value.trim(); if (!name) { $('name').focus(); return; }
      await scoped('join', {invite, name}); invite = null; $('join').hidden = true; await poll();
    }); };
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !invite && !pair) poll(); });
  window.addEventListener('online', () => action(boot));
  boot().catch(fail);
})();
