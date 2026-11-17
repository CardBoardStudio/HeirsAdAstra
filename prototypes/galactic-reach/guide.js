// Galactic Reach guidance: presentation only. On every one of your turns it says what you can
// do right now, beside the piece of the table it is about, and the first time a mechanic
// matters it explains that mechanic once, with a link to its rulebook section. Learn to play
// (tutorial.js) drives the same coach mark through fixed lessons. app.js calls rendered() after
// each render with a read-only port (guidePort); nothing here changes cards, resources or turns.
(() => {
  'use strict';
  const STORE = 'galactic-reach-guide-v1';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const shown = element => Boolean(element?.isConnected && element.getClientRects().length) && getComputedStyle(element).visibility !== 'hidden';
  const RESOURCE_NAMES = { matter: 'Matter', energy: 'Energy', biomass: 'Biomass', data: 'Data' };
  const esc = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const costText = cost => Object.entries(cost || {}).filter(([, n]) => n > 0).map(([r, n]) => `${n} ${RESOURCE_NAMES[r]}`).join(', ');

  function loadPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (saved && typeof saved === 'object') return { enabled: saved.enabled !== false, seen: saved.seen && typeof saved.seen === 'object' ? saved.seen : {} };
    } catch { /* storage blocked: guidance still works for this page */ }
    return { enabled: true, seen: {} };
  }
  const prefs = loadPrefs();
  function savePrefs() { try { localStorage.setItem(STORE, JSON.stringify(prefs)); } catch { /* not saved */ } }

  let port = null, frame = 0, coach = null, targeted = [], lastKey = '', lastAnnounced = '', raisedOver = null, currentAnchor = null;

  // ---- Reading the table: what the player can do right now. ----
  function context() {
    const state = port.state, me = port.me, player = state.players[me];
    const myTurn = state.activePlayer === me && state.winner === null;
    const ops = myTurn && state.phase === 'operations', buy = myTurn && state.phase === 'buy';
    const coords = [...new Set([...Object.keys(state.planets), ...Object.keys(state.fleets || {})])];
    const fleetAt = coord => state.fleets?.[coord]?.[me] || null;
    const myUnits = { settler: [], explorer: [], fleet: [] };
    for (const [coord, byPlayer] of Object.entries(state.fleets || {})) {
      const fleet = byPlayer?.[me];
      if (!fleet) continue;
      for (const type of Object.keys(myUnits)) if (fleet[type] > 0) myUnits[type].push(coord);
    }
    const shipyards = Object.entries(state.planets).filter(([, p]) => p.owner === me && p.upgrade === 'starbase').map(([c]) => c);
    const colonies = Object.entries(state.planets).filter(([, p]) => p.owner === me && p.hasColony).map(([c]) => c);
    // Each hand card's legal starting hexes, exactly as drag-to-play and the Sector Scan offer them.
    const playable = [];
    if (ops && ['prep', 'action'].includes(state.turnStage) && !state.pendingConstruct && !state.pendingColonyBuild) {
      for (const card of player.hand) {
        const def = port.cards[card.key];
        if (!def?.order || def.reaction || def.buyEffect) continue;
        if (def.order === 'special') { playable.push({ card, def, targets: [], kind: 'special' }); continue; }
        const targets = coords.filter(coord => port.ordersAt(coord, card.id).length);
        if (targets.length) playable.push({ card, def, targets, kind: port.ordersAt(targets[0], card.id)[0].type });
      }
    }
    const convertible = player.hand.filter(card => port.canConvertCard(card)) ;
    const canConvert = convertible.length > 0 && port.canConvertCards();
    const marketBuys = buy ? state.market.filter(card => port.canAfford(port.purchaseCost(card.key))) : [];
    const upgrades = buy ? [...player.hand, ...player.discard, ...player.inPlay].filter(card => card.starter && port.starterLevel(card) < 3 && port.resources.some(r => player.resources[r] >= port.upgradePrice(card))) : [];
    return { state, me, player, myTurn, ops, buy, playable, convertible, canConvert, marketBuys, upgrades, myUnits, shipyards, colonies, fleetAt };
  }

  // ---- Anchors: the real table elements a tip points at. ----
  const handCard = id => $(`#hand-row .game-card[data-card-id="${CSS.escape(id)}"]`);
  const hex = coord => $(`.hex[data-coord="${CSS.escape(coord)}"]`);
  // The turn's main button: on the desktop table it is the board's own Pass & buy / Finish Buy.
  const turnButton = () => firstShown('#board-primary:not([hidden])', '#pass-button:not([hidden])', '#hand-finish-buy-button:not([hidden])', '#finish-buy-button:not([hidden])');
  const firstShown = (...selectors) => selectors.flatMap(s => typeof s === 'string' ? $$(s) : [s]).find(shown) || null;

  // ---- First-time explanations: each shown once, remembered in this browser. ----
  const EXPLAINERS = [
    { id: 'welcome', when: c => c.ops && c.state.round === 1 && c.state.turnStage === 'prep',
      title: 'Welcome, commander', rule: 'start',
      text: () => `Race to ${port.victoryTarget()} Prestige (★). Each turn you take one action: play a card's order, or pass. Your Colony is worth 3★. More Colonies, relics and battles score more. These notes point at what you can do. Turn them off in the menu.`,
      anchor: () => firstShown('#hand-row') },
    { id: 'buy-turn', when: c => c.buy, title: 'Your Buy turn', rule: 'buy',
      text: () => 'Passing ended your Operations for this round. Now buy any supply cards you can afford (outlined in gold), upgrade a starter, buy a Capacity Module or trash a card. Bought cards go to your discard pile. Finish Buy when you are done.',
      anchor: () => turnButton() },
    { id: 'cleanup-draw', when: c => c.state.round === 2 && c.ops, title: 'A new round', rule: 'round',
      text: () => 'At the end of every round, everyone discards what is left and draws five new cards (Cleanup & draw). Then each faction collects production: one resource for each hex it owns. When your deck runs out, your discard pile is shuffled to make a new deck.',
      anchor: () => firstShown('#phase-stepper') },
    { id: 'shipyard', when: c => c.ops && c.shipyards.length > 0, title: 'Your Shipyard', rule: 'building',
      text: () => 'A Construct played on your Shipyard commissions a unit. A Settler (1 Matter, 1 Energy, 1 Biomass) founds Colonies, worth 3★ each. An Explorer (1 Energy, 2 Data) finds relics, worth 2★ each. A Fleet (2 Matter, 1 Energy, 1 Biomass) fights. Settlers and Explorers bring a free order card, which goes to your discard pile.',
      anchor: c => hex(c.shipyards[0]) },
    { id: 'colonize-card', when: c => c.ops && c.player.hand.some(card => port.cards[card.key].order === 'colonize'), title: 'Colonize', rule: 'orders',
      text: () => 'Move a Settler onto the center hex of a neutral world, then play Colonize there and pay 2 Biomass. The new Colony scores 3★. The Settler and this card are used up. Settlers move 1 hex per Move order.',
      anchor: c => handCard(c.player.hand.find(card => port.cards[card.key].order === 'colonize').id) },
    { id: 'probe-card', when: c => c.ops && c.player.hand.some(card => card.key === 'probe'), title: 'Probe / Excavate', rule: 'movement',
      text: () => `Probe from your Explorer, anywhere, to locate the nearest hidden relic (◈). Move the Explorer onto that hex, then play the same card as Excavate. It costs ${costText(port.excavationCost)}, scores 2★ and gives you a relic card.`,
      anchor: c => handCard(c.player.hand.find(card => card.key === 'probe').id) },
    { id: 'relic-located', when: c => Object.values(c.state.planets).some(p => p.special === 'relic' && !p.relicClaimed && port.relicKnown(c.state.clusters[p.cluster])),
      title: 'Relic located', rule: 'building',
      text: () => `The ◈ marks a relic only you have located. Move an Explorer onto that exact hex, then play Excavate (${costText(port.excavationCost)}): you choose one of the three face-up relic cards and gain 2★.`,
      anchor: c => { const [coord] = Object.entries(c.state.planets).find(([, p]) => p.special === 'relic' && !p.relicClaimed && port.relicKnown(c.state.clusters[p.cluster])) || []; return coord && hex(coord); } },
    { id: 'capacity-full', when: c => c.myTurn && port.resources.some(r => c.player.resources[r] >= port.limits()[r]), title: 'A full resource', rule: 'resources',
      text: () => { const r = port.resources.find(x => port.state.players[port.me].resources[x] >= port.limits()[x]); return `Your ${RESOURCE_NAMES[r]} is at its limit, shown by the gold pip on your mat. Anything above a limit is lost straight away. Spend it, trade 4 of it for 1 of another at the bank (drag from its Now row), or raise your limits with a Capacity Module.`; },
      anchor: () => firstShown('#resource-grid') },
    { id: 'capacity-module', when: c => c.ops && c.player.hand.some(card => card.key === 'capacityModule'), title: 'Capacity Module', rule: 'resources',
      text: () => 'Play it as your action to add 4 points to your resource limits, split however you like. It then moves to your Storage pile for good. Most market cards cost more than 4 of one resource, so you need raised limits to buy them.',
      anchor: c => handCard(c.player.hand.find(card => card.key === 'capacityModule').id) },
    { id: 'combat', when: c => Boolean(c.state.pendingCombat), inDialog: '#combat-dialog', title: 'Battle', rule: 'combat',
      text: () => 'Each side secretly picks one tactic per volley, for up to three volleys. Concentrated Fire adds 1 hit. Defensive Screen prevents 2 hits. Each tactic can be used once per battle. Destroy every enemy unit for a decisive victory, worth 2★.' },
    { id: 'halfway', when: c => port.prestige(c.me) >= port.victoryTarget() / 2, title: 'Halfway there', rule: 'victory',
      text: () => `You have ${port.prestige(port.me)}★. The game ends when a round finishes with someone at ${port.victoryTarget()} or more, and the highest total wins. Select your marker on the score track for your breakdown.`,
      anchor: () => firstShown('#prestige-track') },
  ];

  // ---- The per-turn hint: the one most useful next step. ----
  function hint(c) {
    const s = c.state;
    if (s.winner !== null || port.overflow() >= 0) return null;
    if (s.pendingCombat) return null;
    if (c.ops) {
      if (s.pendingConstruct) return { title: 'Build again?', text: 'You may pay for a second build now: choose a lit hex. Or choose Finish to end your turn.', anchor: firstShown('#finish-construct') };
      if (s.actionMode && ['move', 'construct', 'colonize'].includes(s.actionMode)) {
        const target = firstShown('.hex.cf-drop-target', '.hex.target');
        return { title: 'Choose a lit hex', text: s.moveSource ? 'Choose a lit hex to move there. Press Escape to cancel.' : 'Choose one of the lit hexes for this order. Press Escape (or Cancel order) to choose a different card.', anchor: target };
      }
      if (s.actionMode === 'excavate') return { title: 'Choose your relic', text: 'Choose one of the three relic cards. You pay the excavation cost and gain 2★.', anchor: firstShown('#relic-row .game-card') };
      const card = kind => c.playable.find(p => p.kind === kind || p.def.order === kind);
      const yardCost = port.structures.starbase.cost;
      if (!c.shipyards.length) {
        const construct = card('construct');
        if (construct && port.canAfford(yardCost))
          return { title: 'Build a Shipyard', text: `Drag your Construct onto a lit hex next to your Colony (or choose Use order), then choose Shipyard. It costs ${costText(yardCost)}. You need it to build ships.`, anchor: handCard(construct.card.id) };
        const short = Object.entries(yardCost).filter(([r, n]) => c.player.resources[r] < n).map(([r]) => r);
        const convert = c.canConvert && c.convertible.find(cardItem => short.some(r => (port.cards[cardItem.key].resource || {})[r]));
        if (convert && construct && (convert.key !== 'construct' || c.player.hand.filter(x => x.key === 'construct').length >= 2))
          return { title: 'First goal: a Shipyard', text: `A Shipyard costs ${costText(yardCost)}. You are short of ${short.map(r => RESOURCE_NAMES[r]).join(' and ')}. Drag this ${port.cards[convert.key].name} onto your mat to convert it into ${costText(port.cards[convert.key].resource)}. Keep one Construct to build with.`, anchor: handCard(convert.id) };
      }
      const colonize = card('colonize');
      if (colonize) return { title: 'Found a Colony', text: 'Your Settler is on a world center. Drag Colonize onto it to found a Colony (+3★).', anchor: handCard(colonize.card.id) };
      const excavate = c.playable.find(p => p.kind === 'excavate');
      if (excavate) return { title: 'Excavate the relic', text: `Your Explorer is on a located relic. Drag Probe / Excavate onto it and choose Excavate (${costText(port.excavationCost)}, +2★).`, anchor: handCard(excavate.card.id) };
      const special = c.playable.find(p => p.kind === 'special');
      if (special) return { title: `Play ${special.def.name}`, text: `${special.def.name} needs no hex: choose Use order, or drag it onto the map.`, anchor: handCard(special.card.id) };
      const construct = card('construct');
      if (construct && c.shipyards.length && !c.myUnits.settler.length && !c.myUnits.explorer.length) {
        const settler = port.canAfford(port.ships.settler.cost), explorer = port.canAfford(port.ships.explorer.cost);
        if (settler || explorer) return { title: 'Commission a unit', text: `Drag Construct onto your Shipyard and choose ${settler ? 'a Settler (founds Colonies, 3★ each)' : ''}${settler && explorer ? ' or ' : ''}${explorer ? 'an Explorer (finds relics, 2★ each)' : ''}.`, anchor: handCard(construct.card.id) };
      }
      const probe = c.playable.find(p => p.kind === 'probe');
      if (probe) return { title: 'Probe for a relic', text: 'Drag Probe / Excavate onto your Explorer to locate the nearest relic.', anchor: handCard(probe.card.id) };
      const move = card('move');
      if (move && c.myUnits.settler.length) return { title: 'Move a unit', text: 'Drag Move onto your units (the lit hexes), choose who goes, then choose where. Settlers move 1 hex, Fleets 2, Explorers 3. Head for the center of a neutral world to found a Colony there.', anchor: handCard(move.card.id) };
      if (c.playable.length) {
        const first = c.playable[0];
        return { title: 'Your turn', text: `Cards outlined in gold have an order you can use now: drag one onto a lit hex, or choose Use order. You can also convert level I starters into resources. When you are done, choose Pass & buy.`, anchor: handCard(first.card.id) };
      }
      return { title: 'Nothing left to play', text: c.canConvert ? 'No order can be used now. Convert spare starters if they help you buy something, then choose Pass & buy to start your Buy turn.' : 'No order can be used now. Choose Pass & buy to start your Buy turn.', anchor: turnButton() };
    }
    if (c.buy) {
      const market = c.marketBuys[0];
      if (market) return { title: 'Buy cards', text: 'Gold-outlined supply cards are ones you can afford. Choose one to buy it. It goes to your discard pile. Finish Buy when you are done.', anchor: firstShown(`[data-buy-market][data-card-id="${CSS.escape(market.id)}"]`) };
      if (port.canBuyCapacity()) return { title: 'Raise your limits', text: `A Capacity Module costs ${port.capacityCost()} of each resource. It lets you hold enough to buy bigger cards later. Or choose Finish Buy.`, anchor: firstShown('.upgrade-market [data-buy-capacity], #upgrade-market .game-card:not([disabled])') };
      if (c.upgrades.length) return { title: 'Upgrade a starter', text: 'Upgrade a Move or Construct in the Upgrades rows: pay 2 of one resource for level II (a stronger order, but no more converting). Or choose Finish Buy.', anchor: firstShown('#upgrade-market .game-card:not([disabled])') };
      return { title: 'Finish Buy', text: 'Nothing here is affordable yet. Choose Finish Buy. Your resources carry over to the next round.', anchor: turnButton() };
    }
    if (s.phase === 'operations' && !c.player.passed) return { title: 'Rivals are acting', text: `${s.players[s.activePlayer].name} is taking a turn. You can still convert starters or trade with the bank meanwhile.`, anchor: null, quiet: true };
    return null;
  }

  // ---- The coach mark itself. ----
  function ensureCoach() {
    if (coach) return coach;
    coach = document.createElement('aside');
    coach.id = 'gr-coach';
    coach.className = 'gr-coach';
    coach.setAttribute('role', 'note');
    coach.setAttribute('aria-live', 'polite');
    coach.hidden = true;
    document.body.appendChild(coach);
    coach.addEventListener('click', event => {
      const button = event.target.closest('[data-coach]');
      if (!button) return;
      const action = button.dataset.coach;
      if (action === 'got-it') { prefs.seen[button.dataset.id] = true; savePrefs(); }
      if (action === 'hide') setEnabled(false);
      if (action === 'more') { coach.dataset.expanded = String(coach.dataset.expanded !== 'true'); position(coach, currentAnchor); return; }
      globalThis.galacticReachTutorial?.coachAction?.(action, button.dataset);
      schedule();
    });
    return coach;
  }

  function clearTargets() { targeted.forEach(element => element.classList.remove('gr-coach-target')); targeted = []; }

  function place(tip) {
    const box = ensureCoach();
    const dialog = $$('dialog[open]').find(d => d.matches(':modal'));
    const host = tip.inDialog && dialog?.matches(tip.inDialog) ? dialog : dialog ? null : document.body;
    if (!host) { hide(); return; }
    // On the table the note is a manual popover, so it stays above the Sector Scan popover;
    // inside a modal dialog (a battle, a choice) it sits at the top of that dialog instead.
    if (box.parentElement !== host) {
      if (box.matches(':popover-open')) box.hidePopover();
      const heading = host === document.body ? null : host.querySelector('.dialog-heading');
      if (host === document.body) host.appendChild(box); else if (heading) heading.after(box); else host.prepend(box);
      raisedOver = null;
    }
    box.classList.toggle('in-dialog', host !== document.body);
    if (host === document.body) box.setAttribute('popover', 'manual'); else box.removeAttribute('popover');
    box.classList.toggle('quiet', Boolean(tip.quiet));
    const key = JSON.stringify([tip.id, tip.title, tip.text, tip.step]);
    if (key !== lastKey) {
      lastKey = key;
      box.dataset.expanded = 'false';
      delete box.dataset.full; delete box.dataset.fit;
      const buttons = [...(tip.buttons || []), ...(tip.dock ? [{ action: 'more', label: 'More' }] : [])];
      const bar = tip.progress ? `<ol class="gr-coach-progress" aria-hidden="true">${Array.from({ length: tip.progress.lessons }, (_, i) => `<li class="${i < tip.progress.finishedLessons ? 'done' : ''}${i === tip.progress.current ? ' current' : ''}"></li>`).join('')}</ol>` : '';
      box.innerHTML = `${bar}<div class="gr-coach-eyebrow">${esc(tip.eyebrow || 'Guide')}</div><strong class="gr-coach-title">${esc(tip.title)}</strong><p class="gr-coach-text">${esc(tip.text)}</p>${tip.rule ? `<a class="gr-coach-rule" href="rulebook.html#${esc(tip.rule)}" target="_blank" rel="noopener">Rules ↗</a>` : ''}<div class="gr-coach-actions">${buttons.map(b => `<button type="button" class="button ${b.primary ? 'button-primary' : 'button-ghost'}" data-coach="${esc(b.action)}"${b.id ? ` data-id="${esc(b.id)}"` : ''}${b.disabled ? ' disabled' : ''}>${esc(b.label)}</button>`).join('')}</div><span class="gr-coach-arrow" aria-hidden="true"></span>`;
      if (!tip.quiet && tip.text !== lastAnnounced) lastAnnounced = tip.text;
    }
    box.hidden = false;
    if (host === document.body) {
      // Raise above any popover opened since (the Sector Scan): showing again puts it on top.
      const others = $$(':popover-open').filter(el => el !== box).map(el => el.id).join(',');
      if (!box.matches(':popover-open') || others !== raisedOver) { if (box.matches(':popover-open')) box.hidePopover(); box.showPopover(); raisedOver = others; }
    }
    clearTargets();
    const anchor = host === document.body && tip.anchor && shown(tip.anchor) ? tip.anchor : null;
    if (anchor && !tip.noPulse) { anchor.classList.add('gr-coach-target'); targeted.push(anchor); }
    currentAnchor = anchor;
    if (host !== document.body) { box.style.left = box.style.top = box.style.width = ''; box.dataset.side = 'inline'; box.classList.remove('docked'); return; }
    box.classList.toggle('docked', Boolean(tip.dock && dockRect()));
    position(box, anchor);
  }

  // In your own games the note lies over the map key in the left column, where the table's
  // notices appear, so it never hides a hex; the pulsing ring shows what it is about.
  function dockRect() {
    const key = $('#map-legend-corner');
    if (!shown(key) || matchMedia('(max-width: 599px), (max-height: 499px)').matches) return null;
    const r = key.getBoundingClientRect();
    if (r.width < 200 || r.height < 120) return null;
    const above = $('#fleet-glance')?.getBoundingClientRect();
    // The hexagon's slanted edge can reach into the key's box: start below any hex in this column.
    let top = r.top;
    for (const hexEl of $$('.hex')) {
      const h = hexEl.getBoundingClientRect();
      if (h.right > r.left + 2 && h.left < r.right - 2 && h.top < r.bottom && h.bottom > r.top) top = Math.max(top, h.bottom + 2);
    }
    if (r.bottom - top < 120) return null;
    return { left: r.left, width: r.width, top, bottom: r.bottom, ceiling: above?.height ? above.bottom + 8 : 10 };
  }

  // A long docked note shows its first whole sentences until you choose More, so nothing is cut.
  function fitText(box, text, room) {
    const full = box.dataset.full || text.textContent;
    box.dataset.full = full;
    text.textContent = full;
    if (box.offsetHeight <= room) return false;
    const sentences = full.split(/(?<=[.!?])\s+/);
    for (let count = sentences.length - 1; count >= 1; count--) {
      text.textContent = `${sentences.slice(0, count).join(' ')} …`;
      if (box.offsetHeight <= room) return true;
    }
    const words = sentences[0].split(/\s+/);
    for (let count = words.length - 1; count >= 4; count--) {
      text.textContent = `${words.slice(0, count).join(' ')} …`;
      if (box.offsetHeight <= room) return true;
    }
    return true;
  }

  // Beside the anchor, never over it and never off screen (the table does not scroll).
  function position(box, anchor) {
    const margin = 10, gap = 14, vw = innerWidth, vh = innerHeight;
    const dock = box.classList.contains('docked') ? dockRect() : null;
    if (dock) {
      // Within the map key's own area. More lets a long note grow upward over the map, because
      // you asked to read it all.
      box.style.width = `${Math.round(dock.width)}px`;
      const text = box.querySelector('.gr-coach-text'), more = box.querySelector('[data-coach="more"]');
      const expanded = box.dataset.expanded === 'true';
      const room = Math.round(expanded ? dock.bottom - dock.ceiling : dock.bottom - dock.top);
      const fit = `${lastKey}|${room}|${Math.round(dock.width)}|${expanded}`;
      if (text && box.dataset.fit !== fit) {
        box.dataset.fit = fit;
        if (more) more.hidden = false;
        const cut = expanded ? (text.textContent = box.dataset.full || text.textContent, false) : fitText(box, text, room);
        if (more) { more.hidden = !cut && !expanded; more.textContent = expanded ? 'Less' : 'More'; }
      }
      const tall = box.offsetHeight;
      box.style.left = `${Math.round(dock.left)}px`;
      box.style.top = `${Math.round(Math.max(expanded ? dock.ceiling : dock.top, dock.bottom - tall))}px`;
      box.dataset.side = 'none';
      return;
    }
    box.style.width = '';
    const width = box.offsetWidth, height = box.offsetHeight;
    if (!anchor) {
      const map = $('.board-map-region')?.getBoundingClientRect();
      const left = map && map.width > width ? map.left + (map.width - width) / 2 : (vw - width) / 2;
      box.style.left = `${Math.max(margin, Math.min(vw - width - margin, left))}px`;
      box.style.top = `${Math.max(margin, (map?.top ?? 0) + margin)}px`;
      box.dataset.side = 'none';
      return;
    }
    // A choice inside the Sector Scan: lay the note beside the whole scan, not over it.
    const around = anchor.closest('#sector-popover') || anchor;
    const a = around.getBoundingClientRect();
    const sides = around === anchor ? ['top', 'bottom', 'right', 'left'] : ['right', 'left', 'top', 'bottom'];
    const clampX = x => Math.max(margin, Math.min(vw - width - margin, x));
    const clampY = y => Math.max(margin, Math.min(vh - height - margin, y));
    const options = [
      { side: 'top', left: clampX(a.left + a.width / 2 - width / 2), top: a.top - gap - height, fits: a.top - gap - height >= margin },
      { side: 'bottom', left: clampX(a.left + a.width / 2 - width / 2), top: a.bottom + gap, fits: a.bottom + gap + height <= vh - margin },
      { side: 'right', left: a.right + gap, top: clampY(a.top + a.height / 2 - height / 2), fits: a.right + gap + width <= vw - margin },
      { side: 'left', left: a.left - gap - width, top: clampY(a.top + a.height / 2 - height / 2), fits: a.left - gap - width >= margin },
    ];
    options.sort((x, y) => sides.indexOf(x.side) - sides.indexOf(y.side));
    const choice = options.find(o => o.fits) || { side: 'none', left: clampX(a.left), top: clampY(a.top - height - gap) };
    box.style.left = `${Math.round(choice.left)}px`;
    box.style.top = `${Math.round(choice.top)}px`;
    box.dataset.side = choice.side;
    const arrow = box.querySelector('.gr-coach-arrow');
    if (arrow) {
      const b = anchor.getBoundingClientRect();
      const along = choice.side === 'top' || choice.side === 'bottom'
        ? Math.max(14, Math.min(width - 14, b.left + b.width / 2 - choice.left))
        : Math.max(14, Math.min(height - 14, b.top + b.height / 2 - choice.top));
      arrow.style.setProperty('--along', `${Math.round(along)}px`);
    }
  }

  function hide() { if (coach) { if (coach.matches(':popover-open')) coach.hidePopover(); coach.hidden = true; } clearTargets(); lastKey = ''; raisedOver = null; currentAnchor = null; }

  function update() {
    frame = 0;
    if (!port) return;
    let tip = null;
    try {
      const tutorial = globalThis.galacticReachTutorial;
      if (tutorial?.active) tip = tutorial.tip(port, api);
      else if (prefs.enabled) {
        const c = context();
        const explainer = EXPLAINERS.find(e => !prefs.seen[e.id] && e.when(c));
        if (explainer) tip = { dock: true, id: explainer.id, eyebrow: 'New to you', title: explainer.title, text: explainer.text(c), rule: explainer.rule, inDialog: explainer.inDialog,
          anchor: explainer.anchor?.(c) || null, buttons: [{ action: 'got-it', id: explainer.id, label: 'Got it', primary: true }, { action: 'hide', label: 'Hide guidance' }] };
        else {
          tip = hint(c);
          if (tip) tip = { ...tip, dock: true, eyebrow: tip.quiet ? 'Guide' : 'You can', buttons: tip.quiet ? [] : [{ action: 'hide', label: 'Hide guidance' }] };
        }
      }
    } catch (error) { console.error('Guidance could not read the table.', error); tip = null; }
    if (tip) place(tip); else hide();
    syncMenu();
  }

  function schedule() { if (!frame) frame = requestAnimationFrame(update); }

  function setEnabled(enabled) {
    prefs.enabled = enabled; savePrefs();
    if (!enabled) hide();
    schedule();
  }

  function syncMenu() {
    const toggle = $('#guide-toggle');
    if (!toggle) return;
    toggle.setAttribute('aria-pressed', String(prefs.enabled));
    toggle.textContent = prefs.enabled ? 'Guidance: on' : 'Guidance: off';
    toggle.hidden = Boolean(globalThis.galacticReachTutorial?.active);
  }

  function init() {
    $('#guide-toggle')?.addEventListener('click', () => setEnabled(!prefs.enabled));
    $('#guide-reset')?.addEventListener('click', () => { prefs.seen = {}; prefs.enabled = true; savePrefs(); schedule(); });
    // A click can open a dialog or popover without a render: look again afterwards.
    document.addEventListener('click', () => setTimeout(schedule, 0), true);
    document.addEventListener('keydown', () => setTimeout(schedule, 0), true);
    document.addEventListener('pointerup', () => setTimeout(schedule, 0), true);
    for (const dialog of $$('dialog')) dialog.addEventListener('close', () => setTimeout(schedule, 0));
    addEventListener('resize', schedule);
    // Cards animate between piles after a render, and a raised hand card moves: follow the anchor,
    // and look again now and then for a dialog or popover the table opened without a render.
    setInterval(() => { if (coach && !coach.hidden && coach.dataset.side !== 'inline' && (currentAnchor || coach.classList.contains('docked') || coach.dataset.side === 'none')) position(coach, currentAnchor && shown(currentAnchor) ? currentAnchor : null); }, 250);
    setInterval(schedule, 1000);
    // Fonts arriving or the table refitting change the note's and the map key's sizes: place it again
    // before the next paint, so it never rests on a hex.
    const replace = () => { if (coach && !coach.hidden && coach.dataset.side !== 'inline') position(coach, currentAnchor && shown(currentAnchor) ? currentAnchor : null); };
    if (globalThis.ResizeObserver) {
      const watch = new ResizeObserver(replace);
      for (const el of [$('#map-legend-corner'), $('#galaxy-board'), document.documentElement]) if (el) watch.observe(el);
      ensureCoach(); watch.observe(coach);
    }
    document.fonts?.ready?.then(() => { lastKey = ''; schedule(); });
    syncMenu();
  }

  const api = { rendered(next) { port = next; schedule(); }, refresh: schedule, prefs, setEnabled, place, hide, handCard, hex, firstShown, shown, turnButton, costText, context: () => context() };
  globalThis.galacticReachGuide = api;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
