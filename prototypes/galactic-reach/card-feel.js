// Galactic Reach card feel: presentation only. Cards read as printed card stock that tilts
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
    if (!card || card.closest('.cf-ghost, .card-inspect') || still()) return;
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
  function fanHand() {
    const cards = $$('#hand-row > .game-card');
    const mid = (cards.length - 1) / 2, step = cards.length > 6 ? 1.4 : 2.2;
    cards.forEach((card, index) => {
      const offset = index - mid;
      card.style.setProperty('--cf-fan', `${(offset * step).toFixed(2)}deg`);
      card.style.setProperty('--cf-arc', `${(-Math.max(0, 5 - offset * offset * 1.1)).toFixed(1)}px`);
    });
  }

  // ---- Inspect: the full card at reading size, beside the map rather than over it. ----
  const inspect = document.createElement('aside');
  inspect.className = 'card-inspect';
  inspect.id = 'card-inspect';
  inspect.setAttribute('aria-hidden', 'true');
  inspect.hidden = true;
  let inspected = null, hideTimer = 0;
  function inspectCard(card) {
    clearTimeout(hideTimer);
    if (!card || drag) return hideInspect();
    inspected = card.dataset.cardId || null;
    const copy = card.cloneNode(true);
    copy.querySelector('.card-buttons')?.remove();
    for (const name of ['data-card-id', 'data-order', 'style']) copy.removeAttribute(name);
    copy.setAttribute('style', `--card-accent:${card.style.getPropertyValue('--card-accent')}`);
    copy.classList.add('inspect-card');
    copy.classList.remove('cf-tilting', 'cf-dragging');
    inspect.replaceChildren(copy);
    if (!inspect.isConnected) document.body.append(inspect);
    inspect.hidden = false;
    placeInspect(card);
  }
  // The space beside the galaxy (left or right, whichever is wider) holds the card,
  // bottom-aligned with the hand, so the hex you are about to choose stays clear.
  function placeInspect(card) {
    const map = $('#galaxy-board')?.getBoundingClientRect();
    const from = card.getBoundingClientRect();
    const width = Math.min(260, Math.max(200, innerWidth * 0.17));
    inspect.style.width = `${width}px`;
    const height = inspect.offsetHeight;
    // Clear of the hand strip and of the raised card's lift and buttons.
    const strip = $('#hand-row')?.getBoundingClientRect();
    const bottom = Math.min(innerHeight - 8, (strip?.height ? strip.top : from.top) - 52);
    let left;
    if (map && map.width) {
      const leftRoom = map.left - 8, rightRoom = innerWidth - map.right - 8;
      left = rightRoom >= leftRoom ? map.right + Math.max(4, (Math.min(rightRoom, width + 40) - width) / 2) : map.left - width - Math.max(4, (Math.min(leftRoom, width + 40) - width) / 2);
      if (Math.max(leftRoom, rightRoom) < width) left = from.left + from.width / 2 < innerWidth / 2 ? innerWidth - width - 8 : 8;
    } else left = from.left;
    left = Math.min(innerWidth - width - 8, Math.max(8, left));
    inspect.style.left = `${Math.round(left)}px`;
    inspect.style.top = `${Math.round(Math.max(8, bottom - height))}px`;
  }
  function hideInspect() {
    clearTimeout(hideTimer);
    inspected = null;
    inspect.hidden = true;
    inspect.replaceChildren();
  }
  const handCard = target => target?.closest?.('#hand-row > .game-card');
  document.addEventListener('pointerover', event => { const card = handCard(event.target); if (card && event.pointerType !== 'touch') inspectCard(card); });
  document.addEventListener('pointerout', event => {
    const card = handCard(event.target);
    if (card && !card.contains(event.relatedTarget) && !handCard(document.activeElement)) { clearTimeout(hideTimer); hideTimer = setTimeout(hideInspect, 90); }
  });
  document.addEventListener('focusin', event => { const card = handCard(event.target); if (card) inspectCard(card); });
  document.addEventListener('focusout', event => { if (handCard(event.target) && !handCard(event.relatedTarget)) hideTimer = setTimeout(() => { if (!handCard(document.activeElement) && !$('#hand-row > .game-card:hover')) hideInspect(); }, 90); });

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
    const yours = after.discard > before.discard ? $('#discard-button') : after.military > before.military ? $('#fleet-tab') : null;
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
    fanHand();
    const before = view, saved = previous;
    view = next; previous = null;
    if (inspected) { const card = $(`#hand-row > .game-card[data-card-id="${inspected}"]`); if (card && (card.matches(':hover') || card.contains(document.activeElement))) inspectCard(card); else hideInspect(); }
    if (before && saved && !next.replay && !still() && !drag) animate(before, next, saved);
  }

  // ---- Drag a hand card onto the map (or onto your reserves to convert it). ----
  const DRAG_START = 8;
  let pressed = null, swallowClick = false;
  document.addEventListener('pointerdown', event => {
    const card = handCard(event.target);
    if (!card || event.button !== 0 || event.target.closest('button, a, input, select') || !api) return;
    pressed = { card, id: card.dataset.cardId, x: event.clientX, y: event.clientY, pointer: event.pointerId };
  });
  document.addEventListener('pointermove', event => {
    if (drag) return moveDrag(event);
    if (!pressed || event.pointerId !== pressed.pointer) return;
    if (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) >= DRAG_START) startDrag(event);
  });
  document.addEventListener('pointerup', event => { if (drag) endDrag(event); pressed = null; });
  document.addEventListener('pointercancel', () => { if (drag) cancelDrag(); pressed = null; });
  document.addEventListener('keydown', event => { if (drag && event.key === 'Escape') { event.preventDefault(); cancelDrag(); } });
  document.addEventListener('click', event => { if (swallowClick) { swallowClick = false; event.stopPropagation(); event.preventDefault(); } }, true);

  function startDrag(event) {
    const { card, id } = pressed;
    pressed = null;
    const targets = api.dropTargets(id);
    const special = card.dataset.order === 'special' && card.querySelector('[data-order-card]:not(:disabled)');
    const convert = card.querySelector('[data-resource-card]:not(:disabled)');
    if (!targets.length && !special && !convert) return;
    hideInspect();
    if (tilted) { untilt(tilted); tilted = null; }
    const hexes = targets.map(target => { const hex = $(`.hex[data-coord="${target.coord}"]`); hex?.classList.add('cf-drop-target'); return hex; }).filter(Boolean);
    const reserves = convert ? $('.resource-panel') : null;
    reserves?.classList.add('cf-drop-zone');
    const board = special ? $('.board-map-region') : null;
    board?.classList.add('cf-drop-zone');
    const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.classList.add('cf-drag-arrow');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '<defs><marker id="cf-arrow-head" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs><path class="cf-arrow-line" marker-end="url(#cf-arrow-head)"/><circle class="cf-arrow-reticle" r="13"/>';
    document.body.append(overlay);
    card.classList.add('cf-dragging');
    document.body.classList.add('cf-drag-active');
    drag = { card, id, hexes, reserves, board, special: Boolean(special), convert: Boolean(convert), overlay, over: null };
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
    const from = drag.card.getBoundingClientRect(), sx = from.left + from.width / 2, sy = from.top + 6;
    const ex = event.clientX, ey = event.clientY, bend = Math.min(160, Math.abs(ex - sx) / 2 + 40);
    drag.overlay.querySelector('.cf-arrow-line').setAttribute('d', `M${sx},${sy} Q${(sx + ex) / 2},${Math.min(sy, ey) - bend} ${ex},${ey}`);
    const reticle = drag.overlay.querySelector('.cf-arrow-reticle');
    reticle.setAttribute('cx', ex); reticle.setAttribute('cy', ey);
    const over = dropUnder(ex, ey);
    if (drag.over?.element !== over?.element) {
      drag.over?.element.classList.remove('cf-drop-hover');
      over?.element.classList.add('cf-drop-hover');
    }
    drag.over = over;
    drag.overlay.classList.toggle('cf-on-target', Boolean(over));
  }
  function cleanupDrag() {
    for (const hex of drag.hexes) hex.classList.remove('cf-drop-target', 'cf-drop-hover');
    for (const zone of [drag.reserves, drag.board]) zone?.classList.remove('cf-drop-zone', 'cf-drop-hover');
    drag.card.classList.remove('cf-dragging');
    drag.overlay.remove();
    document.body.classList.remove('cf-drag-active');
    drag = null;
  }
  function cancelDrag() { cleanupDrag(); }
  function endDrag(event) {
    const { id } = drag, over = dropUnder(event.clientX, event.clientY);
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 0);
    cleanupDrag();
    if (!over) return;
    if (over.kind === 'hex') api.playAt(id, over.element.dataset.coord);
    else if (over.kind === 'convert') $(`#hand-row [data-resource-card="${id}"]`)?.click();
    else if (over.kind === 'play') $(`#hand-row [data-order-card="${id}"]`)?.click();
  }

  globalThis.galacticReachCardFeel = { attach(next) { api = next; }, beforeRender, rendered };
})();
