// Playing with others (docs/tabletop.md): the host's waiting screen (host.html) and the
// joining screen a link opens (phone.html). The host's screen leads with the link; the
// host and every person who joins each say once how their own device is used.
(() => {
  'use strict';
  const id = new URLSearchParams(location.search).get('table');
  const $ = id => document.getElementById(id);
  const host = document.body.dataset.role === 'host';
  const fragment = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname + location.search);
  let timer, room, phones, busy = false, polling = false, entering = false, issuing = false;
  let rosterKey = '', requestsKey = '', qrUrls = new Map();
  let invite = fragment.get('invite'), pair = fragment.get('pair');

  // How this device is used, remembered per game on this device (rules #phone-pairing):
  // 'hand' or 'game' for a player, or 'board' for the host's shared screen. The game
  // menu changes it later (shared.js reads the same key).
  const DEVICE = `heirs-device:${id}`, LINK = `heirs-invite:${id}`;
  const store = (kind, key, value) => { try { kind.setItem(key, value); } catch { /* the choice still holds for this page */ } };
  const read = (kind, key) => { try { return kind.getItem(key); } catch { return null; } };
  let choice = read(localStorage, DEVICE);
  // Devices set up before this choice existed kept their screen role for the tab.
  if (!choice) choice = {player:'game', board:'board'}[read(sessionStorage, `table-screen:${id}`)] || null;
  if (!['hand', 'game', 'board'].includes(choice) || (!host && choice === 'board')) choice = null;
  function choose(value) {
    choice = value; store(localStorage, DEVICE, value);
    for (const input of document.querySelectorAll('input[name=device]')) input.checked = input.value === value;
  }

  // Small pictures of each way to use a device: a phone held sideways with cards,
  // the same phone with the map above the cards, and a screen showing the map.
  const SVG = 'http://www.w3.org/2000/svg';
  function hexes(group, ox, oy, r, cols, rows) {
    for (let row = 0; row < rows; row++) for (let c = 0; c < cols; c++) {
      const x = ox + c * r * 1.5, y = oy + row * r * 1.732 + (c % 2 ? r * 0.866 : 0);
      const hex = document.createElementNS(SVG, 'polygon');
      hex.setAttribute('points', [0, 60, 120, 180, 240, 300].map(a => `${(x + r * Math.cos(a * Math.PI / 180)).toFixed(1)},${(y + r * Math.sin(a * Math.PI / 180)).toFixed(1)}`).join(' '));
      group.append(hex);
    }
  }
  function shape(parent, tag, attrs) {
    const node = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    parent.append(node); return node;
  }
  function picture(kind) {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 100 60'); svg.setAttribute('aria-hidden', 'true');
    if (kind === 'board') {
      shape(svg, 'rect', {x:4, y:2, width:92, height:48, rx:4, class:'frame'});
      shape(svg, 'path', {d:'M40 58h20M50 50v8', class:'frame'});
      hexes(shape(svg, 'g', {class:'map'}), 13, 10, 4.4, 12, 5);
      return svg;
    }
    shape(svg, 'rect', {x:3, y:6, width:94, height:48, rx:8, class:'frame'});
    const cards = shape(svg, 'g', {class:'cards'});
    if (kind === 'hand') for (let i = 0; i < 5; i++) shape(cards, 'rect', {x:12 + i * 16, y:16, width:13, height:28, rx:2});
    else {
      hexes(shape(svg, 'g', {class:'map'}), 12, 14, 3.6, 15, 3);
      for (let i = 0; i < 5; i++) shape(cards, 'rect', {x:24 + i * 11, y:38, width:9, height:12, rx:1.5});
    }
    return svg;
  }
  document.querySelectorAll('[data-picture]').forEach(slot => slot.append(picture(slot.dataset.picture)));

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
    if (!host) $('next').textContent = temporary ? 'Keep this screen open, or try again.' : 'Ask the host to check the link or reconnect your device.';
  }
  async function action(fn) {
    if (busy) return;
    busy = true; document.querySelector('main').setAttribute('aria-busy', 'true');
    try { await fn(); } catch(e) { fail(e); } finally { busy = false; document.querySelector('main').removeAttribute('aria-busy'); }
  }
  function button(text, fn, className = '') {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = text; if (className) b.className = className;
    b.onclick = () => action(fn); return b;
  }
  function qrImage(img, svg) {
    if (qrUrls.has(img)) URL.revokeObjectURL(qrUrls.get(img));
    const url = URL.createObjectURL(new Blob([svg], {type:'image/svg+xml'})); qrUrls.set(img, url); img.src = url;
  }
  async function copy(text, buttonEl, input) {
    try { await navigator.clipboard.writeText(text); buttonEl.textContent = 'Copied'; }
    catch { input.select(); buttonEl.textContent = 'Select and copy the link'; }
  }
  // A secondary link (the host's phone, a shared screen, a replacement device): its own
  // panel, never the player link, so nobody scans the wrong code.
  function linkPanel(panel, data, title, note) {
    panel.replaceChildren(); panel.hidden = false;
    const heading = document.createElement('h3'), text = document.createElement('p'), img = document.createElement('img');
    const label = document.createElement('label'), input = document.createElement('input');
    heading.textContent = title; text.textContent = note; text.className = 'note';
    img.alt = `QR code: ${title}`; img.className = 'qr-small'; qrImage(img, data.qr);
    label.className = 'link-text'; label.textContent = 'Link'; input.name = 'link'; input.readOnly = true; input.value = data.url; label.append(input);
    const copyButton = button('Copy link', () => copy(data.url, copyButton, input));
    panel.append(heading, text, img, copyButton, label);
  }

  // ---- Host: the waiting screen ----
  function storedInvite() { try { return JSON.parse(read(sessionStorage, LINK) || 'null'); } catch { return null; } }
  async function newInvite() {
    const data = await scoped('phone-invite', {});
    store(sessionStorage, LINK, JSON.stringify({url:data.url, qr:data.qr}));
    showInvite(true);
  }
  function showInvite(live) {
    const link = storedInvite();
    $('link-ready').hidden = !link; $('link-sent').hidden = !!link || !live;
    if (!link) return;
    if ($('manual-link').value !== link.url) { $('manual-link').value = link.url; qrImage($('qr'), link.qr); $('copy').textContent = 'Copy link'; }
    $('share').hidden = typeof navigator.share !== 'function';
  }
  const humans = () => room.seats.filter(s => s.kind === 'host' || s.kind === 'friend').length;
  async function refreshHost() {
    [room, phones] = await Promise.all([api(`/api/tables/${id}/lobby`), scoped('requests')]);
    const waiting = room.status === 'waiting', started = room.status === 'started';
    $('title').textContent = room.name; $('retry').hidden = true;
    if (waiting && !storedInvite() && !phones.invite_live && !issuing) {
      issuing = true;
      try { await newInvite(); phones.invite_live = true; } finally { issuing = false; }
    }
    $('link-box').hidden = !waiting; if (waiting) showInvite(phones.invite_live);
    $('refresh-invite').hidden = !waiting;
    for (const input of document.querySelectorAll('input[name=device]')) input.checked = input.value === choice;
    const people = humans(), pending = phones.requests.filter(p => p.status === 'pending').length;
    const ready = !!choice && (choice !== 'board' || phones.host_device_ready);
    // The host's own hand goes on another device when this screen is the board.
    if (choice !== 'board' || !waiting) $('phone-box').hidden = true;
    else if (phones.host_device_ready) { $('phone-box').hidden = false; $('phone-box').textContent = 'Your phone is connected. It holds your hand.'; }
    else if (!$('phone-box').querySelector('img')) {
      $('phone-box').hidden = false;
      $('phone-box').replaceChildren(button('Connect your phone', showPhoneLink, 'primary'));
    }
    $('start').hidden = !waiting; $('alone-hint').hidden = !waiting || people > 1;
    $('start').disabled = !waiting || people < 2 || !ready;
    const rivals = 4 - people;
    $('start').textContent = people < 2 ? 'Waiting for someone to join' : !choice ? 'Choose how you’ll use this device'
      : !ready ? 'Connect your phone to start' : `Start · ${people} people${rivals ? ` + ${rivals} computer rival${rivals === 1 ? '' : 's'}` : ''}`;
    $('continue').hidden = waiting || !choice;
    $('continue').textContent = choice === 'board' ? 'Open the board' : choice === 'hand' ? 'Open my hand' : 'Open my game';
    $('status').textContent = started ? (choice ? 'The game has started.' : 'The game has started. Choose how you’ll use this device to open it.')
      : !waiting ? 'Starting the game…'
      : pending ? 'Someone wants to join. Check their name and code, then let them in.'
      : people < 2 ? 'Send the link. When someone joins, you can start.' : 'Start when everyone is here.';
    const target = $('target');
    if (document.activeElement !== target) {
      target.replaceChildren(...room.victory_targets.map(n => { const o = document.createElement('option'); o.value = n; o.textContent = `${n} Prestige${n === 30 ? ' (default)' : ''}`; return o; }));
      target.value = room.victory_target;
    }
    target.disabled = !waiting;
    const roster = JSON.stringify([room.status, room.seats]);
    if (roster !== rosterKey) {
      rosterKey = roster;
      $('roster').replaceChildren(...room.seats.map(s => {
        const li = document.createElement('li'), label = document.createElement('strong'), detail = document.createElement('small');
        li.className = s.kind;
        label.textContent = s.kind === 'host' ? `${s.name} (you)` : s.kind === 'friend' ? s.name : 'Computer rival';
        detail.textContent = s.kind === 'host' ? 'Host' : s.kind === 'friend' ? 'Joined' : waiting ? 'Plays this place unless someone joins' : 'Plays this place';
        li.append(label, detail); return li;
      }));
    }
    const requestState = JSON.stringify([room.status, phones.requests]);
    if (requestState !== requestsKey) {
      requestsKey = requestState; $('requests').replaceChildren(); $('devices').replaceChildren();
      for (const p of phones.requests) {
        if (p.status === 'rejected') continue;
        const row = document.createElement('article'), text = document.createElement('p');
        text.textContent = p.status === 'pending' ? `${p.name} wants to join · code ${p.code}` : `${p.name} · code ${p.code}`; row.append(text);
        if (p.status === 'pending' && waiting) {
          row.append(button('Let them join', async () => { await scoped('approve', {participant:p.participant, approve:true}); await refreshHost(); }, 'primary'),
            button('Decline', async () => { await scoped('approve', {participant:p.participant, approve:false}); await refreshHost(); }));
          $('requests').append(row);
        } else if (p.status === 'approved') {
          row.append(button('Replace their device', async () => {
            if (!confirm(`Replace ${p.name}’s device? Their previous device will lose access.`)) return;
            linkPanel($('other-link'), await scoped('repair', {participant:p.participant}), `Reconnect ${p.name}`, 'Scan on the replacement device. They keep their place.');
          })); $('devices').append(row);
        }
      }
    }
  }
  async function chooseHere(value) {
    if (value !== 'board') {
      await scoped('play-here', {}); choose(value);
    } else {
      // Before Start, this screen becomes the board and the host's hand moves to their
      // phone (its link replaces this device's seat); after Start the board just opens.
      choose('board');
      if (room?.status === 'waiting') await showPhoneLink();
    }
    await refreshHost();
    if (room.status === 'started') await enterGame();
  }
  async function showPhoneLink() {
    linkPanel($('phone-box'), await scoped('host-phone', {}), 'Connect your phone', 'Only for you: scan with your own phone. It holds your hand while this screen shows the board.');
  }
  async function enterGame() {
    if (choice === 'board') { const result = await scoped('board-grant', {}); location.assign(result.url); return; }
    await scoped('play-here', {});
    const view = await scoped('seat');
    if (!view.client_path) throw new Error('Waiting for the game to start.');
    location.assign(`${view.client_path}?tabletop=${id}`);
  }

  // ---- Joining: the screen a link opens ----
  function joining(full) {
    $('join').hidden = false;
    $('name-field').hidden = !full; $('join-button').hidden = !full; $('join-note').hidden = !full;
    for (const input of document.querySelectorAll('input[name=device]')) input.checked = input.value === choice;
  }
  function displaySeat(view) {
    $('retry').hidden = true;
    if (view.name) $('title').textContent = view.name;
    $('code').textContent = view.code ? `Your code: ${view.code}` : '';
    $('next').textContent = 'This screen updates by itself. Keep it open.';
    if (view.status === 'pending') { joining(false); $('status').textContent = 'Waiting for the host to let you in. They will check your name and code.'; }
    else if (view.status === 'closed') { $('join').hidden = true; $('status').textContent = 'This game started before you joined.'; $('next').textContent = 'Ask the host to include you in the next game.'; }
    else if (view.status === 'waiting') { joining(false); $('status').textContent = 'You’re in. The game opens here when the host starts it.'; $('next').textContent = 'On a phone, turn it sideways to play.'; }
    else if (view.client_path && !entering) {
      $('join').hidden = true;
      if (!choice) choose('game');
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
      // A paired phone is someone's own hand, usually the host's beside a shared board.
      if (!choice) choose('hand');
    }
    if (invite) {
      // A known paired device resumes instead of creating another request.
      try { displaySeat(await scoped('seat')); invite = null; await poll(); return; }
      catch(e) { if (e.status !== 401) throw e; }
      const details = await scoped('invite-details', {invite});
      $('title').textContent = details.name; $('status').textContent = 'You’re invited to play. Your hand stays on this device.';
      joining(true); $('retry').hidden = true; $('next').textContent = 'The host lets you in.';
      return;
    }
    await poll();
  }
  async function boot() {
    if (!/^[a-f0-9]{32}$/.test(id || '')) { $('status').textContent = 'This link is incomplete. Ask the host for a fresh one.'; return; }
    if (host) await poll(); else await startGuest();
  }
  $('retry').onclick = () => action(boot);
  for (const input of document.querySelectorAll('input[name=device]'))
    input.addEventListener('change', () => { if (!input.checked) return; if (host) action(() => chooseHere(input.value)); else if ($('join-button').hidden) choose(input.value); });
  if (host) {
    $('copy').onclick = () => copy($('manual-link').value, $('copy'), $('manual-link'));
    $('share').onclick = async () => {
      try { await navigator.share({title: room?.name || 'Heirs Ad Astra', text: 'Join my game of Heirs Ad Astra.', url: $('manual-link').value}); }
      catch { /* closed the share sheet; Copy link is beside it */ }
    };
    $('new-link').onclick = $('refresh-invite').onclick = () => action(async () => {
      if (storedInvite() && !confirm('Make a new link? The link you sent stops working.')) return;
      await newInvite(); await refreshHost();
    });
    $('target').onchange = () => action(async () => {
      room = await api(`/api/tables/${id}/lobby/settings`, {ai_rivals:room.ai_rivals, difficulty:room.difficulty, victory_target:Number($('target').value)});
      $('target').blur(); await refreshHost();
    });
    $('start').onclick = () => action(async () => {
      if (choice !== 'board') await scoped('play-here', {});
      await api(`/api/tables/${id}/lobby/start`, {}); await enterGame();
    });
    $('continue').onclick = () => action(enterGame);
    $('board-link').onclick = () => action(async () => linkPanel($('other-link'), await scoped('board-grant', {}), 'The board on another screen', 'Public information only. Scan on the extra screen; it takes no place in the game.'));
    $('revoke-board').onclick = () => action(async () => { if (!confirm('Disconnect all shared screens? Player devices stay connected.')) return;
      await scoped('board-revoke', {}); $('other-link').hidden = true; $('status').textContent = 'Shared screens disconnected. Everyone keeps their place.'; });
  } else {
    $('join').onsubmit = event => { event.preventDefault(); action(async () => {
      const name = $('name').value.trim(), picked = document.querySelector('input[name=device]:checked')?.value;
      if (!name) { $('name').focus(); return; }
      if (!picked) { document.querySelector('input[name=device]').focus(); return; }
      choose(picked);
      await scoped('join', {invite, name}); invite = null; await poll();
    }); };
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !invite && !pair) poll(); });
  window.addEventListener('online', () => action(boot));
  boot().catch(fail);
})();
