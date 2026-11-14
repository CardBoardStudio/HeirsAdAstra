// Shared tables (?shared=<id>): the server's table service owns the game. This
// page shows the signed-in seat's private view, sends that seat's commands, and
// follows every other seat live over server-sent events.
(() => {
  const id = new URLSearchParams(location.search).get('shared');
  if (id === null) return;
  globalThis.drawingBoardTableBoot = true;
  document.addEventListener('DOMContentLoaded', async () => {
    document.body.classList.add('has-saved-table', 'has-shared-table');
    const shell = document.querySelector('.app-shell');
    shell.inert = true;
    const bar = document.createElement('section');
    bar.className = 'table-save-bar shared-table-bar';
    bar.setAttribute('aria-label', 'Shared table');
    bar.innerHTML = '<a class="button button-ghost" href="/?game=galactic-reach#tables">← Your tables</a><strong id="saved-table-name">Opening shared table…</strong><span id="table-rules" class="rules-badge"></span><ol class="shared-seats" id="shared-seats" aria-label="Seats"></ol><span id="table-sync" role="status" aria-live="polite">Connecting…</span><span id="shared-undo-note" class="shared-undo-note" hidden></span>';
    shell.before(bar);
    const status = bar.querySelector('#table-sync');
    const seatList = bar.querySelector('#shared-seats');
    const undoNote = bar.querySelector('#shared-undo-note');
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    let current = null, game = null, busy = false, stream = null;
    async function api(path, body) {
      const response = await fetch(path, {method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
        headers: body === undefined ? {} : {'Content-Type': 'application/json', 'x-drawing-board': '1'},
        ...(body === undefined ? {} : {body: JSON.stringify(body)})});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(data.error || 'The table service did not answer.'), {status: response.status});
      return data;
    }
    function describe(view) {
      const active = view.active;
      seatList.innerHTML = view.seats.map(seat => `<li class="${seat.seat === active ? 'acting' : ''}${seat.you ? ' you' : ''}" style="--player:${['#55d9f4','#ff9f6e','#a58cff','#f2cf66'][seat.seat]}">${esc(seat.name)}<small>${seat.you ? 'you' : seat.human ? 'player' : 'AI rival'}${seat.seat === active ? ' · to move' : ''}</small></li>`).join('');
      const mine = active === view.seat;
      if (view.ai_error) status.textContent = `${view.ai_error} Reload to retry; if it persists, tell the host.`;
      else if (view.status === 'finished') status.textContent = 'Game over. Export game report now includes every hidden card.';
      else if (!busy) status.textContent = mine ? 'Your move.' : `Waiting for ${view.seats[active]?.name || 'the table'}…`;
      document.title = `${mine && view.status !== 'finished' ? '● Your move · ' : ''}${view.name} · Galactic Reach`;
      // Say why Undo stops short of the start of the turn: a reveal is final.
      const undo = view.undo || {};
      const note = !mine ? '' : undo.available && undo.stop ? `Undo goes back only to just after ${undo.stop}.` : !undo.available && /^Undo stops/.test(undo.reason || '') ? undo.reason : '';
      undoNote.textContent = note; undoNote.hidden = !note;
    }
    function adopt(view) {
      if (current && view.seq < current.seq) return;
      current = view;
      describe(view);
      game?.sync(view);
    }
    async function refresh() { adopt(await api(`/api/shared/${id}`)); }
    function act(intents) {
      if (busy || !current) { status.textContent = 'Still sending your last choice…'; return false; }
      busy = true;
      status.textContent = 'Sending…';
      api(`/api/shared/${id}/act`, {seq: current.seq, actions: intents})
        .then(result => {
          busy = false;
          adopt(result.view);
          if (result.stopped) status.textContent = `${result.applied} of ${intents.length} applied. ${result.stopped}`;
        })
        .catch(async error => {
          busy = false;
          status.textContent = error.message;
          try { await refresh(); status.textContent = error.message; } catch { /* The live stream resyncs on reconnect. */ }
        });
      return true;
    }
    function undo() {
      if (busy || !current) return false;
      busy = true;
      status.textContent = 'Undoing…';
      api(`/api/shared/${id}/undo`, {seq: current.seq})
        .then(result => { busy = false; adopt(result.view); status.textContent = `Took back ${result.undone} choice${result.undone === 1 ? '' : 's'}.`; })
        .catch(async error => { busy = false; status.textContent = error.message; try { await refresh(); status.textContent = error.message; } catch { /* The live stream resyncs on reconnect. */ } });
      return true;
    }
    async function report() {
      try {
        const data = await api(`/api/shared/${id}/report`);
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
        const link = document.createElement('a'); link.href = url; link.download = `galactic-reach-shared-${id}.json`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (error) { status.textContent = error.message; }
    }
    function listen() {
      stream = new EventSource(`/api/shared/${id}/stream`);
      stream.addEventListener('view', event => { try { adopt(JSON.parse(event.data)); } catch { /* Ignore a malformed frame; the next one resyncs. */ } });
      stream.addEventListener('open', () => { if (current) describe(current); });
      stream.addEventListener('error', () => { status.textContent = 'Connection lost. Reconnecting…'; });
    }
    const leave = () => { stream?.close(); location.assign('/?game=galactic-reach#tables'); };
    bar.querySelector('a').addEventListener('click', event => { event.preventDefault(); leave(); });
    try {
      if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('Invalid table link. Return to Your tables.');
      const view = await api(`/api/shared/${id}`);
      current = view;
      bar.querySelector('#saved-table-name').textContent = view.name;
      bar.querySelector('#table-rules').textContent = `Rules ${view.rules_version.split('/')[1]} · shared`;
      describe(view);
      game = globalThis.createGalacticReach({
        network: {seat: view.seat, rules: view.rules_version, initial: view, act, undo, busy: () => busy, report},
        paused: () => busy, newTable: leave
      });
      const library = document.querySelector('.header-actions a');
      if (library) { library.textContent = 'Your tables'; library.href = '/?game=galactic-reach#tables'; }
      shell.inert = false;
      listen();
    } catch (error) {
      status.textContent = error.message;
      if (error.status === 401) {
        const link = document.createElement('a'); link.className = 'button button-ghost'; link.textContent = 'Sign in to open this table';
        link.href = `/?return_to=${encodeURIComponent('/galactic-reach/?shared=' + id)}#account`; bar.append(link);
      }
    }
  });
})();
