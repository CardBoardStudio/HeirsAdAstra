// Heirs Ad Astra card feel: presentation only. Cards read as printed card stock that tilts
// toward the pointer; the hand is held in a slight fan; pointing at a hand card shows it at
// reading size beside the map; draws, plays, conversions, purchases and production move
// between the piles, the market and your reserves; and a hand card can be dragged onto the
// map. The game itself never depends on this file: app.js calls it before and after each
// render, and drag-to-play asks app.js for the same context orders the Sector Scan offers.
(() => {
  'use strict';
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const still = () => Boolean(reduced?.matches) || document.visibilityState !== 'visible';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const center = rect => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  const shown = element => Boolean(element?.getClientRects().length);
  const RESOURCE_LABELS = { matter: 'Matter', energy: 'Energy', biomass: 'Life', data: 'Data' };
  let api = null, previous = null, view = null, drag = null;

  // ---- Tilt and sheen: a card leans a few degrees toward the pointer. ----
  let tilted = null;
  function untilt(card) {
    for (const name of ['--cf-rx', '--cf-ry', '--cf-mx', '--cf-my']) card.style.removeProperty(name);
    card.classList.remove('cf-tilting');
  }
  document.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || drag) return;
    const card = event.target.closest?.('.game-card');
    if (tilted && tilted !== card) { untilt(tilted); tilted = null; }
    if (!card || card.closest('.cf-ghost') || still()) return;
    const rect = card.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    card.style.setProperty('--cf-rx', `${((0.5 - y) * 6).toFixed(2)}deg`);
    card.style.setProperty('--cf-ry', `${((x - 0.5) * 8).toFixed(2)}deg`);
    card.style.setProperty('--cf-mx', `${(x * 100).toFixed(1)}%`);
    card.style.setProperty('--cf-my', `${(y * 100).toFixed(1)}%`);
    card.classList.add('cf-tilting');
    tilted = card;
  }, { passive: true });
  document.addEventListener('pointerout', event => {
    if (tilted && !tilted.contains(event.relatedTarget)) { untilt(tilted); tilted = null; }
  });

  // ---- The hand fan: a gentle arc, the middle cards a few pixels higher. ----
  // The hand is a fan (rules #card-corners): card tops side by side along a shallow arc, each
  // turned a few degrees about its top centre, a small gap between neighbouring tops so both
  // upper corners of every card show. The fan fills the room the hand already has: a small hand
  // keeps full-width cards, a large one narrows them, down to FAN_MIN_W; only beyond that do
  // neighbours overlap (a card's right corner then lies under its neighbour).
  const FAN_GAP = 6, FAN_MIN_W = 56, FAN_MAX_DEG = 3.2, FAN_SPREAD_DEG = 14, FAN_SAG = 10;
  function fanHand() {
    const row = $('#hand-row'), cards = $$('#hand-row > .game-card');
    row?.style.setProperty('--max-hand-count', String(Math.max(2, cards.length)));
    if (!row) return;
    for (const name of ['--top-w', '--step', 'padding-left', 'justify-content']) row.style.removeProperty(name);
    const phone = globalThis.matchMedia?.('(max-width: 599px), (max-height: 599px)').matches;
    const n = cards.length, mid = (n - 1) / 2;
    if (phone || !n) { delete row.dataset.fanRoom; row.classList.remove('fan-tight'); cards.forEach(card => ['--cf-fan', '--cf-arc'].forEach(name => card.style.removeProperty(name))); placeSlots(); return; }
    const zoom = Number(document.documentElement.style.getPropertyValue('--table-zoom')) || 1;
    // The room ends before any control that shares the hand's band (in some layouts the turn's
    // buttons sit inside the hand's box), so no card covers one.
    const box = row.getBoundingClientRect(), styles = getComputedStyle(row);
    const ends = $$('#convert-all-button, #board-primary, #hand-panel .hand-tools > *').map(el => el.getBoundingClientRect())
      .filter(r => r.width && r.left > box.left + 40 && r.left < box.right && r.bottom > box.top && r.top < box.bottom).map(r => r.left - 8);
    const room = (Math.min(box.right, ...ends) - box.left) / zoom;
    // A raised card stays inside this room too (placeSlots gives it to the CSS as --hand-w).
    row.dataset.fanRoom = room.toFixed(1);
    const full = parseFloat(styles.getPropertyValue('--top-w')) || 168;
    let width = Math.min(full, (room + FAN_GAP) / n - FAN_GAP), step = FAN_GAP;
    if (width < FAN_MIN_W) { width = FAN_MIN_W; step = n > 1 ? (room - n * width) / (n - 1) : 0; }
    row.classList.remove('fan-tight');
    const lead = Math.max(0, (room - (n * width + (n - 1) * step)) / 2);
    row.style.setProperty('--top-w', `${width.toFixed(1)}px`, 'important');
    row.style.setProperty('--step', `${step.toFixed(1)}px`, 'important');
    // The fan centres itself in its room (some layouts centre the row as well, which would count twice).
    row.style.setProperty('padding-left', `${lead.toFixed(1)}px`, 'important');
    row.style.setProperty('justify-content', 'flex-start', 'important');
    const turn = n > 1 ? Math.min(FAN_MAX_DEG, FAN_SPREAD_DEG / (n - 1)) : 0;
    // The arc comes from each card's height, not a shift: a card further out is shorter, so its top
    // sits lower while its foot stays on the hand's floor, and the corner its turn lowers stays above it.
    cards.forEach(card => card.style.removeProperty('--fan-h'));
    const floor = cards[0].offsetHeight;
    cards.forEach((card, index) => {
      const offset = index - mid, angle = offset * turn * Math.PI / 180, sag = mid ? FAN_SAG * (offset / mid) ** 2 : 0;
      card.style.setProperty('--cf-fan', `${(offset * turn).toFixed(2)}deg`);
      const height = Math.max(0, (floor - sag - width / 2 * Math.abs(Math.sin(angle))) / Math.cos(angle));
      card.style.setProperty('--fan-h', `${height.toFixed(1)}px`);
      // Bottom-aligned, the card's top would sit at floor - height: lift it to sit at its sag.
      card.style.setProperty('--cf-arc', `${(sag - (floor - height)).toFixed(1)}px`);
    });
    // Beyond the fan's room (neighbours overlap, or a card's corners are wider than the card), each
    // card stacks its symbols in the strip that shows.
    const cramped = card => { const sym = card.querySelector(':scope > .card-symbols'), foot = card.querySelector(':scope > .card-footer');
      return Boolean(sym) && sym.offsetLeft + sym.offsetWidth > (foot?.offsetWidth ? foot.offsetLeft : card.clientWidth) + 1; };
    row.classList.toggle('fan-tight', step < 0 || cards.some(card => !raisedNow(card) && cramped(card)));
    placeSlots();
  }
  addEventListener('resize', () => requestAnimationFrame(fanHand));
  // Each card's resting place in the hand, in table units, so a raised card can stay inside the
  // hand's band (styles.css shifts it left when it would run past the hand's right edge).
  function placeSlots() {
    const row = $('#hand-row'), box = row?.getBoundingClientRect?.();
    if (!box?.width) return;
    const zoom = Number(document.documentElement.style.getPropertyValue('--table-zoom')) || 1;
    row.style.setProperty('--hand-w', `${Math.round(Number(row.dataset.fanRoom) || box.width / zoom)}px`);
    for (const card of $$('#hand-row > .game-card')) {
      if (card.matches(':hover, :focus-within')) continue;
      card.style.setProperty('--slot-x', `${Math.round((card.getBoundingClientRect().left - box.left) / zoom)}px`);
    }
  }
  addEventListener('resize', () => requestAnimationFrame(placeSlots));

  // ---- Inspect: pointing at a hand card (or focusing it) raises that card itself into the whole
  // card, in place above the hand (CSS); there is no separate copy beside the map. ----
  const handCard = target => target?.closest?.('#hand-row > .game-card');

  // ---- Motion between renders. ----
  function snapshotCards(selector) {
    const cards = new Map();
    for (const card of $$(selector)) if (shown(card)) cards.set(card.dataset.cardId, { rect: card.getBoundingClientRect(), node: card.cloneNode(true) });
    return cards;
  }
  function beforeRender() {
    previous = { hand: snapshotCards('#hand-row > .game-card[data-card-id]'), market: snapshotCards('#market-row > .game-card[data-card-id]') };
  }
  // A copy of a card that no longer exists flies from where it was to where it went.
  function ghost(saved, to, { delay = 0, fade = false } = {}) {
    const shell = document.createElement('div');
    shell.className = 'cf-ghost';
    shell.setAttribute('aria-hidden', 'true');
    shell.inert = true;
    const { rect, node } = saved;
    Object.assign(shell.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    node.classList.remove('cf-tilting', 'cf-dragging');
    shell.append(node);
    document.body.append(shell);
    const start = center(rect), end = to ? center(to.getBoundingClientRect()) : start;
    const frames = fade || !to
      ? [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-10px) scale(.92)' }]
      : [{ opacity: 1, transform: 'none' }, { opacity: 1, offset: 0.25, transform: 'translateY(-14px) rotate(-2deg)' },
        { opacity: 0.15, transform: `translate(${end.x - start.x}px, ${end.y - start.y}px) scale(.28) rotate(6deg)` }];
    shell.animate(frames, { duration: fade || !to ? 260 : 460, delay, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'both' }).finished.finally(() => shell.remove());
  }
  function arrive(card, from, delay = 0) {
    const a = card.getBoundingClientRect(), b = from.getBoundingClientRect();
    const dx = center(b).x - center(a).x, dy = center(b).y - center(a).y;
    card.animate([{ translate: `${dx}px ${dy}px`, scale: '.3', opacity: 0 }, { translate: '0 0', scale: '1', opacity: 1 }],
      { duration: 380, delay, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'backwards' });
  }
  function rollNumber(resource, from, to) {
    const startTime = performance.now(), duration = 420;
    const box = () => $(`.resource-box[data-resource="${resource}"]`);
    box()?.classList.add(to > from ? 'cf-gain' : 'cf-spend');
    const step = now => {
      const t = Math.min(1, (now - startTime) / duration), amount = box()?.querySelector('.resource-amount');
      if (amount) amount.textContent = String(Math.round(from + (to - from) * (1 - (1 - t) ** 3)));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function floater(hex, resource, delay) {
    const target = $(`.resource-box[data-resource="${resource}"]`);
    if (!hex || !target) return;
    const symbol = target.querySelector('.resource-symbol')?.cloneNode(true);
    const chip = document.createElement('span');
    chip.className = `cf-floater ${resource}`;
    chip.setAttribute('aria-hidden', 'true');
    chip.style.setProperty('--resource', `var(--${resource})`);
    chip.append('+1');
    if (symbol) chip.append(symbol);
    const start = center(hex.getBoundingClientRect()), end = center(target.getBoundingClientRect());
    Object.assign(chip.style, { left: `${start.x}px`, top: `${start.y}px` });
    document.body.append(chip);
    chip.animate([{ opacity: 0, transform: 'translate(-50%, -30%) scale(.6)' }, { opacity: 1, offset: 0.25, transform: 'translate(-50%, -110%) scale(1)' },
      { opacity: 1, offset: 0.55, transform: 'translate(-50%, -110%) scale(1)' }, { opacity: 0.2, transform: `translate(calc(-50% + ${end.x - start.x}px), calc(-50% + ${end.y - start.y}px)) scale(.6)` }],
    { duration: 900, delay, easing: 'cubic-bezier(.4,0,.3,1)', fill: 'both' }).finished.finally(() => chip.remove());
  }
  function animate(before, after, saved) {
    const hand = new Map($$('#hand-row > .game-card[data-card-id]').map(card => [card.dataset.cardId, card]));
    const market = new Map($$('#market-row > .game-card[data-card-id]').map(card => [card.dataset.cardId, card]));
    const gained = Object.keys(after.resources).filter(r => after.resources[r] > before.resources[r]).sort((a, b) => (after.resources[b] - before.resources[b]) - (after.resources[a] - before.resources[a]));
    // Hand: new cards come off the deck; cards that left go to the pile or reserve they joined.
    // A new round discards the whole hand and deals a fresh one, even when a reshuffle
    // brings the same cards straight back.
    const newRound = after.round !== before.round;
    let drawn = 0;
    for (const [id, card] of hand) if (newRound || !saved.hand.has(id)) arrive(card, $('#deck-button'), 260 + 70 * drawn++);
    let left = 0;
    for (const [id, card] of saved.hand) if (newRound || !hand.has(id)) {
      const to = newRound ? $('#discard-button') : gained.length && after.inPlay > before.inPlay ? $(`.resource-box[data-resource="${gained[0]}"]`)
        : after.inPlay > before.inPlay ? $('#in-play-button') : after.discard > before.discard ? $('#discard-button') : null;
      ghost(card, shown(to) ? to : null, { delay: 50 * left++ });
    }
    // Market: your purchase flies to its pile, a rival's fades, the rest slide to their new
    // slots and the refill deals in.
    const yours = after.discard > before.discard ? $('#discard-button') : after.military > before.military ? $('#military-button') : null;
    for (const [id, card] of saved.market) {
      const now = market.get(id);
      if (!now) { ghost(card, yours && shown(yours) ? yours : null, { fade: !yours }); continue; }
      const rect = now.getBoundingClientRect(), dx = card.rect.left - rect.left, dy = card.rect.top - rect.top;
      if (Math.abs(dx) + Math.abs(dy) > 2) now.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], { duration: 320, easing: 'cubic-bezier(.2,.7,.2,1)' });
    }
    if (saved.market.size) for (const [id, card] of market) if (!saved.market.has(id))
      card.animate([{ opacity: 0, scale: '.86', translate: '0 -12px' }, { opacity: 1, scale: '1', translate: '0 0' }], { duration: 300, delay: 180, easing: 'ease-out', fill: 'backwards' });
    // Production: each producing world sends its resource to your reserves.
    if (after.round !== before.round && gained.length)
      after.producers.filter(p => gained.includes(p.resource)).slice(0, 24).forEach((p, i) => floater($(`.hex[data-coord="${p.coord}"]`), p.resource, 60 * i));
    for (const resource of Object.keys(after.resources))
      if (after.resources[resource] !== before.resources[resource]) rollNumber(resource, before.resources[resource], after.resources[resource]);
    // Production that a full reserve could not hold is lost: that reserve flashes.
    if (newRound) for (const resource of new Set(after.producers.map(p => p.resource)))
      if (after.resources[resource] <= before.resources[resource] && after.resources[resource] >= after.limits[resource]) $(`.resource-box[data-resource="${resource}"]`)?.classList.add('cf-wasted');
  }
  function rendered(next) {
    globalThis.galacticReachMaxUI?.rendered(next);
    fanHand();
    syncAim();
    fitNames();
    keepRaisedNames();
    for (const card of $$('#hand-row > .game-card')) if (raisedNow(card)) fitRaised(card);
    const before = view, saved = previous;
    view = next; previous = null;
    if (before && saved && !next.replay && !still() && !drag) animate(before, next, saved);
  }

  // ---- Raising a hand card (rules #card-corners): the card straightens and lifts (CSS); its
  // corners stay in its corners. A corner acts only on a raised card: on a touch screen the tap
  // that raises a resting card does not also press the corner under the finger. ----
  const raisedNow = card => card.matches(':hover, :focus-within');
  // The raised card is remembered by its card id: the tap that raises it can redraw the hand, and the
  // next tap, on the redrawn card, must act.
  const raisedIds = new Set(), raisedBy = new WeakMap();
  const markRaised = card => { if (card?.dataset.cardId) raisedIds.add(card.dataset.cardId); };
  document.addEventListener('pointerdown', event => {
    const card = event.target.closest?.('#hand-row > .game-card');
    if (card && event.pointerType === 'touch' && !raisedIds.has(card.dataset.cardId)) raisedBy.set(card, performance.now());
  }, true);
  const raiseFrom = event => { if (event.pointerType === 'touch') return; const card = event.target.closest?.('#hand-row > .game-card'); if (card && raisedNow(card)) markRaised(card); };
  document.addEventListener('pointerover', raiseFrom);
  document.addEventListener('focusin', raiseFrom);
  document.addEventListener('click', event => {
    if (event.detail === 0) return;
    // The raising tap's click may land anywhere on the card, which grows under the finger: it
    // presses nothing there, and the card counts as raised from then on.
    const card = event.target.closest?.('#hand-row > .game-card');
    if (!card || !raisedBy.has(card)) return;
    raisedBy.delete(card);
    markRaised(card);
    const button = event.target.closest('button');
    if (!button) return;
    event.preventDefault(); event.stopPropagation();
    button.focus({ preventScroll: true });
  }, true);
  // A card's name sits between its two corners, wrapping only between words and to two lines at
  // most (rules #card-corners); a name that does not fit there moves under the corners.
  function fitNames() {
    // Measured for all cards at once (one probe, one read, one write) so a render costs two layouts.
    const cards = $$(':is(#hand-row, #market-row, #upgrade-market) > .game-card:is(:has(> .card-symbols), :has(> .card-footer))')
      .filter(card => !card.matches(':hover, :focus-within')).map(card => [card, card.querySelector(':scope > .card-name')]).filter(([, name]) => name?.getClientRects().length);
    cards.forEach(([card]) => { card.classList.remove('name-under'); card.classList.add('name-probe'); });
    const under = cards.map(([, name]) => { const line = parseFloat(getComputedStyle(name).lineHeight) || name.offsetHeight; return name.scrollWidth > name.clientWidth + 1 || name.scrollHeight > line * 2 + 2; });
    cards.forEach(([card], index) => { card.classList.remove('name-probe'); card.classList.toggle('name-under', under[index]); });
  }
  addEventListener('resize', () => requestAnimationFrame(fitNames));
  // The raised card's corners leave less room between them than most names need: its name is
  // measured at the raised width as the card rises, by the same rule.
  // A redraw replaces the card, so each card's answer is kept by its id and put back on the new one.
  const raisedNames = new Map();
  function fitRaised(card) {
    const name = card.querySelector(':scope > .card-name');
    if (!name?.getClientRects().length) return;
    card.classList.remove('name-under-raised'); card.classList.add('name-probe');
    const line = parseFloat(getComputedStyle(name).lineHeight) || name.offsetHeight;
    const under = name.scrollWidth > name.clientWidth + 1 || name.scrollHeight > line * 2 + 2;
    card.classList.remove('name-probe'); card.classList.toggle('name-under-raised', under);
    if (card.dataset.cardId) raisedNames.set(card.dataset.cardId, under);
  }
  function keepRaisedNames() {
    for (const card of $$('#hand-row > .game-card[data-card-id]')) if (raisedNames.has(card.dataset.cardId)) card.classList.toggle('name-under-raised', raisedNames.get(card.dataset.cardId));
  }
  addEventListener('resize', () => raisedNames.clear());
  // Measured as the card rises and again a frame later, after anything that redraws it settles.
  const fitRaisedFrom = event => {
    const card = event.target.closest?.('#hand-row > .game-card');
    if (card && raisedNow(card)) fitRaised(card);
    requestAnimationFrame(() => { for (const raised of $$('#hand-row > .game-card')) if (raisedNow(raised)) fitRaised(raised); });
  };
  document.addEventListener('pointerover', fitRaisedFrom);
  document.addEventListener('focusin', fitRaisedFrom);
  function settle() {
    requestAnimationFrame(() => { for (const id of raisedIds) { const card = $(`#hand-row > .game-card[data-card-id="${CSS.escape(id)}"]`); if (!card || !raisedNow(card)) raisedIds.delete(id); } });
  }
  document.addEventListener('pointerout', settle);
  document.addEventListener('focusout', settle);

  // ---- Drag a hand card onto the map (or onto your reserves to convert it). ----
  // A card can be picked up anywhere on it, its buttons included: a press that moves more
  // than a few pixels is a drag, a press that stays put is still that button's click.
  const DRAG_START = 6;
  let pressed = null, swallowClick = false;
  document.addEventListener('pointerdown', event => {
    const card = handCard(event.target);
    if (!card || event.button !== 0 || event.target.closest('a, input, select, textarea') || !api || drag) return;
    pressed = { card, id: card.dataset.cardId, x: event.clientX, y: event.clientY, pointer: event.pointerId };
  });
  // No native drag of the card's text or art, which would cancel the pointer stream.
  document.addEventListener('dragstart', event => { if (handCard(event.target)) event.preventDefault(); });
  document.addEventListener('pointermove', event => {
    if (drag) return moveDrag(event);
    if (!pressed || event.pointerId !== pressed.pointer) return;
    if (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) >= DRAG_START) startDrag(event);
  });
  document.addEventListener('pointerup', event => {
    if (drag) endDrag(event);
    pressed = null;
    // The browser's click follows this pointerup in the same task; let it be swallowed, then stop.
    if (swallowClick) setTimeout(() => { swallowClick = false; }, 0);
  });
  document.addEventListener('pointercancel', () => { if (drag) cancelDrag(); pressed = null; });
  document.addEventListener('keydown', event => { if (drag && event.key === 'Escape') { event.preventDefault(); cancelDrag(); } });
  document.addEventListener('click', event => { if (swallowClick) { swallowClick = false; event.stopPropagation(); event.preventDefault(); } }, true);
  // While held, the card follows the pointer, carried just above it so the hex or reserve
  // under the pointer stays visible.
  function holdCard(card) {
    const held = document.createElement('div');
    held.className = 'cf-ghost cf-held';
    held.setAttribute('aria-hidden', 'true');
    held.inert = true;
    const copy = card.cloneNode(true);
    copy.querySelector('.card-buttons')?.remove();
    for (const name of ['data-card-id', 'data-order', 'id']) copy.removeAttribute(name);
    copy.classList.remove('cf-tilting', 'cf-dragging', 'order-selected');
    held.append(copy);
    const width = Math.min(200, Math.max(150, card.getBoundingClientRect().width));
    Object.assign(held.style, { width: `${width}px`, height: '66px', left: '0px', top: '0px' });
    document.body.append(held);
    return held;
  }

  function startDrag(event) {
    const { card, id } = pressed;
    pressed = null;
    const targets = api.dropTargets(id);
    const special = card.dataset.order === 'special' && card.querySelector('[data-order-card]:not(:disabled)');
    const convert = card.querySelector('[data-resource-card]:not(:disabled)');
    // A card with nowhere to go is still picked up, and says so, rather than ignoring the drag.
    const stuck = !targets.length && !special && !convert;
    try { card.setPointerCapture(event.pointerId); } catch { /* the pointer already left */ }
    if (tilted) { untilt(tilted); tilted = null; }
    const hexes = targets.map(target => { const hex = $(`.hex[data-coord="${target.coord}"]`); hex?.classList.add('cf-drop-target'); return hex; }).filter(Boolean);
    // The reserve tiles themselves: #53's table may lay the panel out as display: contents.
    const reserves = convert ? $('.resource-grid') || $('.resource-panel') : null;
    reserves?.classList.add('cf-drop-zone');
    // The reserves this card converts into show what they will gain.
    const yields = convert ? [...card.querySelectorAll('.card-footer .resource-chip')].map(chip => {
      const resource = Object.keys(RESOURCE_LABELS).find(name => chip.classList.contains(name)), box = resource && reserves?.querySelector(`.resource-box.${resource}`);
      box?.classList.add('cf-drop-yield');
      box?.setAttribute('data-cf-gain', `+${chip.querySelector('strong')?.textContent || 1}`);
      return box;
    }).filter(Boolean) : [];
    const board = special ? $('.board-map-region') : null;
    board?.classList.add('cf-drop-zone');
    const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.classList.add('cf-drag-arrow');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '<circle class="cf-arrow-reticle" r="13"/>';
    document.body.append(overlay);
    const label = document.createElement('div');
    label.className = 'cf-drop-label';
    label.setAttribute('aria-hidden', 'true');
    document.body.append(label);
    card.classList.add('cf-dragging');
    document.body.classList.add('cf-drag-active');
    const name = card.querySelector('.card-name')?.textContent.trim() || 'order';
    drag = { card, id, name, hexes, reserves, yields, board, stuck, special: Boolean(special), convert: Boolean(convert), overlay, label, held: holdCard(card), over: null };
    moveDrag(event);
  }
  function dropUnder(x, y) {
    const hit = document.elementFromPoint(x, y);
    const hex = hit?.closest('.hex.cf-drop-target');
    if (hex) return { kind: 'hex', element: hex };
    if (drag.reserves?.contains(hit)) return { kind: 'convert', element: drag.reserves };
    if (drag.board?.contains(hit)) return { kind: 'play', element: drag.board };
    return null;
  }
  function moveDrag(event) {
    const ex = event.clientX, ey = event.clientY, w = drag.held.offsetWidth;
    drag.held.style.transform = `translate(${Math.round(Math.min(innerWidth - w - 4, Math.max(4, ex - w / 2)))}px, ${Math.round(Math.max(4, ey - 66 - 20))}px)`;
    const reticle = drag.overlay.querySelector('.cf-arrow-reticle');
    reticle.setAttribute('cx', ex); reticle.setAttribute('cy', ey);
    const over = dropUnder(ex, ey);
    if (drag.over?.element !== over?.element) {
      drag.over?.element.classList.remove('cf-drop-hover');
      over?.element.classList.add('cf-drop-hover');
    }
    drag.over = over;
    drag.overlay.classList.toggle('cf-on-target', Boolean(over));
    drag.held.classList.toggle('cf-held-on-target', Boolean(over));
    // Say what letting go here will do; nothing is shown where a drop plays nothing.
    const text = drag.stuck ? 'Nowhere to play this now' : !over ? '' : over.kind === 'convert' ? `Convert ${drag.yields.map(box => `${box.dataset.cfGain} ${RESOURCE_LABELS[box.dataset.resource]}`).join(', ')}`.trim()
      : over.kind === 'play' ? `Play ${drag.name}` : `${drag.name} here`;
    drag.label.textContent = text;
    drag.label.hidden = !text;
    drag.label.style.left = `${Math.min(innerWidth - 12 - drag.label.offsetWidth, ex + 18)}px`;
    drag.label.style.top = `${Math.min(innerHeight - 30, ey + 16)}px`;
  }
  function cleanupDrag() {
    for (const hex of drag.hexes) hex.classList.remove('cf-drop-target', 'cf-drop-hover');
    for (const zone of [drag.reserves, drag.board]) zone?.classList.remove('cf-drop-zone', 'cf-drop-hover');
    for (const box of drag.yields) { box.classList.remove('cf-drop-yield'); box.removeAttribute('data-cf-gain'); }
    drag.card.classList.remove('cf-dragging');
    drag.overlay.remove();
    drag.label.remove();
    drag.held.remove();
    document.body.classList.remove('cf-drag-active');
    drag = null;
  }
  function cancelDrag() { cleanupDrag(); swallowClick = true; }
  function endDrag(event) {
    const { id } = drag, over = dropUnder(event.clientX, event.clientY);
    cleanupDrag();
    // Play first: the drop clicks the card's own Convert or Use order button, which the
    // guard below would otherwise swallow along with the browser's click after pointerup.
    if (over?.kind === 'hex') api.playAt(id, over.element.dataset.coord);
    else if (over?.kind === 'convert') $(`#hand-row [data-resource-card="${id}"]`)?.click();
    else if (over?.kind === 'play') $(`#hand-row [data-order-card="${id}"]`)?.click();
    swallowClick = true;
  }

  // ---- Use order aims the card exactly as starting a drag does. ----
  // While a chosen order waits for its first hex, the same hexes light up as for a drag, the card
  // is marked as in play, and pointing at a lit hex says what choosing it does. Clicking a lit hex
  // plays the order there, as a drop would; Escape or Use order again cancels.
  let aim = null, aimDone = null;
  function clearAim() {
    if (!aim) return;
    for (const hex of aim.hexes) hex.classList.remove('cf-drop-target', 'cf-drop-hover');
    aim.card?.classList.remove('cf-aiming');
    aim.label.remove();
    document.body.classList.remove('cf-aim-active');
    aim = null;
  }
  function syncAim() {
    clearAim();
    const id = !drag && api?.aimCard?.();
    if (!id) { aimDone = null; return; }
    if (id === aimDone) return;
    const card = $(`#hand-row > .game-card[data-card-id="${id}"]`);
    const hexes = (api.dropTargets(id) || []).map(target => $(`.hex[data-coord="${target.coord}"]`)).filter(Boolean);
    if (!card || !hexes.length) return;
    hexes.forEach(hex => hex.classList.add('cf-drop-target'));
    card.classList.add('cf-aiming');
    document.body.classList.add('cf-aim-active');
    const label = document.createElement('div');
    label.className = 'cf-drop-label';
    label.setAttribute('aria-hidden', 'true');
    label.hidden = true;
    document.body.append(label);
    aim = { id, card, hexes, label, name: card.querySelector('.card-name')?.textContent.trim() || 'order', over: null };
  }
  document.addEventListener('pointermove', event => {
    if (!aim || drag) return;
    const hex = document.elementFromPoint(event.clientX, event.clientY)?.closest('.hex.cf-drop-target');
    if (aim.over !== hex) { aim.over?.classList.remove('cf-drop-hover'); hex?.classList.add('cf-drop-hover'); aim.over = hex; }
    aim.label.textContent = hex ? `${aim.name} here` : '';
    aim.label.hidden = !hex;
    if (hex) {
      aim.label.style.left = `${Math.min(innerWidth - 12 - aim.label.offsetWidth, event.clientX + 18)}px`;
      aim.label.style.top = `${Math.min(innerHeight - 30, event.clientY + 16)}px`;
    }
  });
  document.addEventListener('click', event => {
    const hex = aim && event.target.closest?.('.hex.cf-drop-target');
    if (!hex) return;
    event.preventDefault(); event.stopPropagation();
    const { id } = aim;
    aimDone = id;
    clearAim();
    api.playAt(id, hex.dataset.coord);
  }, true);
  document.addEventListener('keydown', event => {
    if (!aim || drag || event.key !== 'Escape') return;
    event.preventDefault();
    $(`#hand-row [data-order-card="${aim.id}"]`)?.click();
  });

  globalThis.galacticReachCardFeel = { attach(next) { api = next; }, beforeRender, rendered };
})();
// A browser preference, independent of game saves and shared-table state.
(() => {
  const init = () => {
    const button = document.querySelector('#background-toggle');
    if (!button) return;
    const key = 'galactic-reach-background';
    let stars = false;
    try { stars = localStorage.getItem(key) === 'stars'; } catch {}
    const render = () => {
      document.body.classList.toggle('background-stars', stars);
      button.setAttribute('aria-pressed', String(stars));
      globalThis.galacticReachMaxUI?.sync();
      window.dispatchEvent(new Event('resize'));
      // Refit after the live supply has returned and its measurements have settled.
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    };
    render();
    button.addEventListener('click', () => {
      stars = !stars;
      render();
      try { localStorage.setItem(key, stars ? 'stars' : 'green'); } catch {}
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();

// Max's UI reuses the live supply controls. No copies of cards, costs, or legal actions.
(() => {
  const init = () => {
    const $ = selector => document.querySelector(selector);
    const dialog = $('#max-bank-dialog');
    if (!dialog) return; // Archived pages keep their own layout.
    const banks = {
      relics: { node: $('#relics-panel'), title: 'Relics', help: 'The three face-up rewards. Excavate at a located relic to claim one.' },
      market: { node: $('#market-panel'), title: 'Market', help: 'Purchased cards enter their normal piles.' },
      basics: { node: $('#upgrade-group'), title: 'Basics', help: 'Improve your starters, add a Capacity Module, or inspect the Trash pile.' }
    };
    const buttons = [...document.querySelectorAll('[data-card-bank]')];
    for (const bank of Object.values(banks)) {
      bank.home = document.createComment('Card bank home');
      bank.node.before(bank.home);
    }
    let enabled = false, selected = 'market', wasBuying = false, wasExcavating = false, wasChoosing = false, relicsRequested = false, opener = null, fitFrame = 0;
    const active = () => document.body.classList.contains('background-stars');
    const buying = () => !$('#finish-buy-button').hidden;
    const excavating = () => !$('#cancel-excavate').hidden;
    function labelMarketRows() {
      const row = $('#market-row');
      row.querySelectorAll('.max-market-tier-label').forEach(label => label.remove());
      if (!enabled) return;
      for (const [index, [tier, name]] of [['expensive', 'Expensive'], ['medium', 'Moderate'], ['cheap', 'Cheap']].entries()) {
        const cards = [...row.querySelectorAll(`:scope > [data-market-tier="${tier}"]`)];
        if (!cards.length) continue;
        const label = document.createElement('span');
        label.className = 'max-market-tier-label';
        label.textContent = name;
        label.style.setProperty('--max-tier-index', index);
        row.append(label);
        cards.forEach((card, slot) => {
          card.style.setProperty('--max-tier-index', index);
          card.style.setProperty('--max-tier-slot', slot);
          card.style.setProperty('--max-tier-phone-column', slot % 2 + 2);
          card.style.setProperty('--max-tier-phone-row', index * 2 + Math.floor(slot / 2) + 1);
        });
      }
    }
    function close() { if (dialog.open) dialog.close(); }
    function choose(name) {
      if (!banks[name]) return;
      selected = name;
      dialog.dataset.bank = name;
      $('#max-bank-title').textContent = banks[name].title;
      $('#max-bank-help').textContent = banks[name].help;
      for (const b of buttons) {
        if (b.closest('.max-bank-tabs')) b.setAttribute('aria-pressed', String(b.dataset.cardBank === name));
        else b.setAttribute('aria-expanded', String(dialog.open && b.dataset.cardBank === name));
      }
    }
    function open(name, source) {
      if (!enabled) return false;
      if (!dialog.open) {
        // Do not cover a mandatory choice (combat, overflow, or another inspector).
        if (document.querySelector('dialog[open]')) return false;
        opener = source || $(`#max-bank-nav [data-card-bank="${name}"]`);
        dialog.showModal();
      }
      choose(name);
      return true;
    }
    function sync() {
      const next = active();
      if (next !== enabled) {
        enabled = next;
        close();
        for (const bank of Object.values(banks)) {
          if (enabled) $('#max-bank-content').append(bank.node);
          else bank.home.after(bank.node);
        }
        wasBuying = false; wasExcavating = false; wasChoosing = false; relicsRequested = false;
      }
      labelMarketRows();
      if (!enabled) return;
      // The engine's first fit precedes the updated hand and bank layout. Refit
      // after those settle so a transient width cannot leave an iPad off-center.
      cancelAnimationFrame(fitFrame);
      fitFrame = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
      const buy = buying(), choosing = excavating();
      const dig = choosing && (relicsRequested || !!$('#relic-row [data-excavate-relic]:not(:disabled)'));
      $('#max-bank-finish').hidden = !buy;
      $('#max-bank-status').textContent = buy ? 'Your Buy turn · choose cards or finish when ready.' : choosing ? $('#relic-row-help').textContent : 'Browse freely · the usual turn and resource costs apply.';
      if (dig && (!wasExcavating || relicsRequested)) relicsRequested = !open('relics');
      else if (buy && !wasBuying) open('market');
      else if ((wasChoosing && !choosing && selected === 'relics') || (wasBuying && !buy)) close();
      wasBuying = buy; wasExcavating = dig; wasChoosing = choosing;
    }
    for (const button of buttons) button.addEventListener('click', () => open(button.dataset.cardBank, button));
    $('#max-bank-close').addEventListener('click', close);
    $('#max-bank-finish').addEventListener('click', () => $('#finish-buy-button').click());
    dialog.addEventListener('click', event => { if (event.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close();
    } });
    dialog.addEventListener('close', () => {
      buttons.filter(b => b.closest('#max-bank-nav')).forEach(b => b.setAttribute('aria-expanded', 'false'));
      if (enabled && opener?.isConnected && opener.checkVisibility()) opener.focus({ preventScroll: true });
    });
    // The phone's existing Supply button opens these banks instead of a second supply drawer.
    $('.phone-drawers [data-drawer="supply"]').addEventListener('click', event => {
      if (!enabled) return;
      event.stopImmediatePropagation(); open('market', event.currentTarget);
    }, true);
    // A mandatory dialog may close while an excavation/Buy transition is waiting behind it.
    document.addEventListener('close', event => {
      if (event.target === dialog || !enabled) return;
      if (!dialog.open && !document.querySelector('dialog[open]')) {
        if (excavating() && (relicsRequested || $('#relic-row [data-excavate-relic]:not(:disabled)'))) { relicsRequested = !open('relics'); }
        else if (buying()) open('market');
      }
    }, true);
    globalThis.galacticReachMaxUI = { sync, rendered: sync, requestRelics() { relicsRequested = true; } };
    sync();
    window.dispatchEvent(new Event('resize'));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
