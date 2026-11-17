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
  // Where each resource comes from, in the words of the rulebook's #resources and #trade.
  const SOURCES = {
    matter: 'Matter: convert a Construct card, or own Matter hexes.',
    energy: 'Energy: convert a Move card, or own Energy hexes.',
    biomass: 'Biomass: own Biomass hexes, or trade 4 of another resource for 1 at the bank on your mat.',
    data: 'Data: own Data hexes, or trade 4 of another resource for 1 at the bank on your mat.',
  };
  // Ordinary hex distance between two "q,r" keys.
  const hexDistance = (a, b) => { const [q1, r1] = a.split(',').map(Number), [q2, r2] = b.split(',').map(Number); return (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(q1 + r1 - q2 - r2)) / 2; };
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

  const shownAt = {};
  let port = null, frame = 0, coach = null, targeted = [], lastKey = '', lastAnnounced = '', raisedOver = null, currentAnchor = null, currentAvoid = [];

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
    const harvesters = Object.entries(state.planets).filter(([, p]) => p.owner === me && p.upgrade === 'harvester').map(([c]) => c);
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
    return { state, me, player, myTurn, ops, buy, playable, convertible, canConvert, marketBuys, upgrades, myUnits, shipyards, harvesters, colonies, fleetAt };
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
      text: () => `Race to ${port.victoryTarget()} Prestige (★). Each turn you take one action: play a card's order, or pass. Your Colony is worth 3★. More Colonies, relics and battles score more. Point at a card to raise it and see its buttons, or drag it where it should go. These notes point at what you can do; turn them off in the menu. New here? Learn to play teaches the game step by step.`,
      anchor: () => firstShown('#hand-row'), buttons: [{ action: 'learn', label: walkthroughInProgress() ? 'Continue Learn to play' : 'Learn to play', primary: true }] },
    { id: 'hand-lifetime', when: c => c.ops && prefs.seen.welcome, title: 'Your hand lasts one round', rule: 'cleanup-draw',
      text: () => 'Use or convert your cards this round. At the end of every round (Cleanup & draw) every card left in your hand is discarded, and you draw five new cards. Resources carry over to the next round, up to your limits; cards do not.',
      anchor: () => firstShown('#hand-row') },
    { id: 'buy-turn', when: c => c.buy, title: 'Your Buy turn', rule: 'buy',
      text: () => 'Passing ended your Operations for this round. Now buy any supply cards (the cards on the right) you can afford: those are outlined in gold. You can also upgrade a starter, buy a Capacity Module card or trash a card. Bought cards go to your discard pile. Finish Buy when you are done.',
      anchor: () => turnButton() },
    { id: 'cleanup-draw', when: c => c.state.round === 2 && c.ops, title: 'A new round', rule: 'round',
      text: () => 'At the end of every round, everyone discards what is left and draws five new cards (Cleanup & draw). Then each faction collects production: one resource for each hex it owns. When your deck runs out, your discard pile is shuffled to make a new deck.',
      anchor: () => firstShown('#phase-stepper') },
    { id: 'shipyard', when: c => c.ops && c.shipyards.length > 0, title: 'Your Shipyard', rule: 'building',
      text: () => 'When a Construct card is in your hand, use its order on your Shipyard (that turn) to commission a unit. A Settler (1 Matter, 1 Energy, 1 Biomass) founds Colonies, worth 3★ each. An Explorer (1 Energy, 2 Data) finds relics, worth 2★ each. A Fleet (2 Matter, 1 Energy, 1 Biomass) fights. Settlers and Explorers bring a free order card. Like every new card it goes to your discard pile, and reaches your hand after your deck runs out and the discard is shuffled in.',
      anchor: c => hex(c.shipyards[0]) },
    { id: 'settler', when: c => c.ops && c.myUnits.settler.length > 0, title: 'Your Settler', rule: 'orders',
      text: c => `A Settler founds a Colony on the center hex of a world nobody holds (the middle of its seven hexes).${(g => g ? ` The nearest is ${g.name}, ${g.distance} hex${g.distance === 1 ? '' : 'es'} away (dashed ring on the map).` : '')(nearestFreeWorld(c, c.myUnits.settler))} Move it there with Move cards, 1 hex per card. Then use a Colonize card’s order on it: your Settler brought one, which went to your discard pile and reaches your hand after your deck runs out and the discard is shuffled in.`,
      anchor: c => hex(c.myUnits.settler[0]), marks: c => { const g = nearestFreeWorld(c, c.myUnits.settler); return g ? [hex(g.center)] : []; } },
    { id: 'colonize-card', when: c => c.ops && c.player.hand.some(card => port.cards[card.key].order === 'colonize'), title: 'Colonize', rule: 'orders',
      text: () => 'Move a Settler onto the center hex of a neutral world, then use this Colonize card’s order there and pay 2 Biomass. The new Colony scores 3★. The Settler and this card are used up. Settlers move 1 hex per Move card. Biomass comes from Biomass hexes you own, or from the bank (4 of another resource for 1).',
      anchor: c => handCard(c.player.hand.find(card => port.cards[card.key].order === 'colonize').id) },
    { id: 'probe-card', when: c => c.ops && c.player.hand.some(card => card.key === 'probe'), title: 'Probe / Excavate', rule: 'movement',
      text: () => `Probe from your Explorer, anywhere, to locate the nearest hidden relic (◈). Move the Explorer onto that hex, then use the same card again and choose Excavate. It costs ${costText(port.excavationCost)}, scores 2★ and gives you a relic card.`,
      anchor: c => handCard(c.player.hand.find(card => card.key === 'probe').id) },
    { id: 'relic-located', when: c => Object.values(c.state.planets).some(p => p.special === 'relic' && !p.relicClaimed && port.relicKnown(c.state.clusters[p.cluster])),
      title: 'Relic located', rule: 'building',
      text: () => `The ◈ marks a relic only you have located. Move an Explorer onto that exact hex, then use your Probe / Excavate card and choose Excavate (${costText(port.excavationCost)}): you choose one of the three face-up relic cards and gain 2★.`,
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
        return { title: 'Choose a lit hex', text: !target ? 'No hex can take this order right now. Point at the card and choose Cancel order to pick another one.' : s.moveSource ? 'Choose a lit hex to move there. Choosing the hex you start on spends the Move card to stay put. To change your mind, point at the card and choose Cancel order.' : 'Choose one of the lit hexes for this order. Escape, or Cancel order on the card, lets you choose a different card.', anchor: target };
      }
      if (s.actionMode === 'excavate') return { title: 'Choose your relic', text: 'Choose one of the three relic cards. You pay the excavation cost and gain 2★.', anchor: firstShown('#relic-row .game-card') };
      const card = kind => c.playable.find(p => p.kind === kind || p.def.order === kind);
      // The opening: first a Data Harvester (2 Data a round pays for Explorers, excavation and
      // upgrades), then a Shipyard. Each says what to do with this turn's cards.
      const goals = [];
      const dataHex = c.colonies.flatMap(col => Object.keys(s.planets).filter(k => s.planets[k].cluster === s.planets[col].cluster && hexDistance(k, col) === 1 && s.planets[k].type === 'data' && !s.planets[k].upgrade))[0];
      if (!c.harvesters.length && dataHex) goals.push({ kind: 'harvester', name: 'Data Harvester', button: 'Build Harvester', cost: port.structures.harvester.cost, site: dataHex,
        why: 'It makes 2 Data every round. Data pays for Explorers (they find relics, 2★ each), for excavating and for upgrading your cards.' });
      if (!c.shipyards.length) goals.push({ kind: 'starbase', name: 'Shipyard', button: 'Build Shipyard', cost: port.structures.starbase.cost, site: null,
        why: 'You need a Shipyard to commission ships: Settlers found Colonies (3★ each).' });
      const goal = goals[0];
      if (goal) {
        const construct = card('construct');
        const where = goal.site ? 'the Data hex next to your Colony (dashed ring)' : 'an empty hex next to your Colony';
        const marks = goal.site ? [hex(goal.site)] : [];
        if (construct && port.canAfford(goal.cost))
          return { title: `Build a ${goal.name}`, text: `This turn: pick up this Construct card and drop it on ${where} (the hexes light up while you hold it), or point at it and choose Use order. Then choose ${goal.button}. It costs ${costText(goal.cost)}. ${goal.why}`, anchor: handCard(construct.card.id), marks, avoid: marks };
        const short = Object.entries(goal.cost).filter(([r, n]) => c.player.resources[r] < n).map(([r]) => r);
        const convert = c.canConvert && c.convertible.find(cardItem => short.some(r => (port.cards[cardItem.key].resource || {})[r]));
        if (convert && construct && (convert.key !== 'construct' || c.player.hand.filter(x => x.key === 'construct').length >= 2))
          return { title: `First goal: a ${goal.name}`, text: `A ${goal.name} costs ${costText(goal.cost)}; you are short of ${short.map(r => RESOURCE_NAMES[r]).join(' and ')}. This turn: drag this one ${port.cards[convert.key].name} card (marked with the arrow) onto your mat to convert it into ${costText(port.cards[convert.key].resource)}. Then use one of your other Construct cards, also this turn, to build the ${goal.name} on ${where}. ${goal.why}`, anchor: handCard(convert.id), marks, avoid: marks };
      }
      const colonize = card('colonize');
      if (colonize) {
        const short = c.player.resources.biomass < 2;
        return { title: 'Found a Colony', text: short ? `Your Settler is on a world center. Founding the Colony costs 2 Biomass and you have ${c.player.resources.biomass}. ${SOURCES.biomass}` : 'Your Settler is on a world center. Drag this Colonize card onto it and choose Found Colony (2 Biomass) to found a Colony (+3★).', anchor: short ? firstShown('#resource-grid') : handCard(colonize.card.id) };
      }
      const excavate = c.playable.find(p => p.kind === 'excavate');
      if (excavate) return { title: 'Excavate the relic', text: `Your Explorer is on a located relic. Drag this Probe / Excavate card onto it and choose Excavate (${costText(port.excavationCost)}, +2★).`, anchor: handCard(excavate.card.id) };
      const special = c.playable.find(p => p.kind === 'special');
      if (special) return { title: `Play ${special.def.name}`, text: `${special.def.name} needs no hex: choose Use order, or drag it onto the map.`, anchor: handCard(special.card.id) };
      const construct = card('construct');
      if (construct && c.shipyards.length && !c.myUnits.settler.length && !c.myUnits.explorer.length) {
        const settler = port.canAfford(port.ships.settler.cost), explorer = port.canAfford(port.ships.explorer.cost);
        if (settler || explorer) return { title: 'Commission a unit', text: `Drag this Construct card onto your Shipyard and choose ${settler ? 'a Settler (founds Colonies, 3★ each)' : ''}${settler && explorer ? ' or ' : ''}${explorer ? 'an Explorer (finds relics, 2★ each)' : ''}.`, anchor: handCard(construct.card.id) };
        const short = Object.entries(port.ships.settler.cost).filter(([r, n]) => c.player.resources[r] < n).map(([r]) => r);
        return { title: 'Next: a Settler', text: `A Settler costs ${costText(port.ships.settler.cost)}; this turn you are short of ${short.map(r => RESOURCE_NAMES[r]).join(' and ')}. ${short.map(r => SOURCES[r]).join(' ')} Resources carry over to the next round, cards do not: every card left in your hand is discarded at Cleanup. So use this round's cards now, by converting them or using their orders, and commission the Settler with a Construct card from a later hand once you can pay.${fullWarning(c)}`, anchor: (c.canConvert ? handCard(c.convertible.find(card => short.some(r => (port.cards[card.key].resource || {})[r]))?.id || '') : null) || firstShown(`#resource-grid .resource-box[data-resource="${short[0]}"]`) };
      }
      // A Settler waiting on a free world's center, but its Colonize card has not come round yet.
      const waiting = c.myUnits.settler.find(coord => port.ordersAt(coord).length === 0 && c.state.planets[coord] && c.state.clusters[c.state.planets[coord].cluster]?.center === coord && c.state.planets[coord].owner === null);
      if (waiting && !c.player.hand.some(card => port.cards[card.key].order === 'colonize'))
        return { title: 'Waiting for Colonize', text: 'Your Settler is on a free world’s center. Found the Colony with a Colonize card: it is in your deck or discard pile, and reaches your hand after a reshuffle. Keep the Settler there; meanwhile use your other cards, or Pass & buy.', anchor: hex(waiting) };
      const probe = c.playable.find(p => p.kind === 'probe');
      if (probe) return { title: 'Probe for a relic', text: 'Drag this Probe / Excavate card onto your Explorer and choose Probe to locate the nearest relic.', anchor: handCard(probe.card.id) };
      const move = card('move');
      if (move && c.myUnits.settler.length) {
        // Name the goal: the nearest free world center, and how many hexes (Move cards) away it is.
        const goal = nearestFreeWorld(c, c.myUnits.settler);
        const where = goal ? ` The nearest free world center is ${goal.name}, ${goal.distance} hex${goal.distance === 1 ? '' : 'es'} from your Settler (marked on the map): about ${goal.distance} Move card${goal.distance === 1 ? '' : 's'}.` : ' Head for the center of a world nobody holds to found a Colony there.';
        return { title: 'Move your Settler', text: `Drag this Move card onto your Settler (a lit hex), choose who goes, then choose where. Settlers move 1 hex per card, Fleets 2, Explorers 3.${where}`, anchor: handCard(move.card.id), avoid: goal ? [hex(goal.center)] : [], marks: goal ? [hex(goal.center)] : [] };
      }
      if (c.playable.length) {
        const first = c.playable[0];
        return { title: 'Your turn', text: `Cards outlined in gold have an order you can use now; this one is a good start. Drag a card onto a lit hex, or point at it and choose Use order. You can also convert level I starters into resources. When you are done, choose Pass & buy.${fullWarning(c)}`, anchor: handCard(first.card.id) };
      }
      return { title: 'Nothing left to play', text: c.canConvert ? `No order can be used now. Convert spare starters if they help you buy something, then choose Pass & buy. Passing ends your Operations for this round and starts your Buy turn; cards left in your hand are discarded when the round ends.${fullWarning(c)}` : 'No order can be used now. Choose Pass & buy: it ends your Operations for this round and starts your Buy turn.', anchor: turnButton() };
    }
    if (c.buy) {
      const market = c.marketBuys[0];
      if (market) return { title: 'Buy cards', text: 'Gold-outlined supply cards are ones you can afford. Choose one to buy it. It goes to your discard pile. Finish Buy when you are done.', anchor: firstShown(`[data-buy-market][data-card-id="${CSS.escape(market.id)}"]`) };
      if (port.canBuyCapacity()) return { title: 'Raise your limits', text: `A Capacity Module costs ${port.capacityCost()} of each resource. It lets you hold enough to buy bigger cards later. Or choose Finish Buy.`, anchor: firstShown('[data-capacity-offer]:not([disabled])') };
      if (c.upgrades.length) return { title: 'Upgrade a starter', text: 'Upgrade a Move or Construct card in the Upgrades rows: pay 2 of one resource for level II (a stronger order, but no more converting). Or choose Finish Buy.', anchor: firstShown('#upgrade-market .game-card:not([disabled])') };
      return { title: 'Finish Buy', text: 'Nothing here is affordable yet. Choose Finish Buy. Your resources carry over to the next round.', anchor: turnButton() };
    }
    if (!c.myTurn && s.winner === null && ['operations', 'buy'].includes(s.phase)) return { title: 'Rivals are acting', text: `${s.players[s.activePlayer].name} is taking its ${s.phase === 'buy' ? 'Buy' : 'Operations'} turn. Your turn comes round again shortly.${s.phase === 'operations' && !c.player.passed ? ' Meanwhile you can still convert starters or trade with the bank.' : ''}`, anchor: null, quiet: true };
    return null;
  }

  // The nearest world center nobody holds, by ordinary hex distance from any of the given hexes.
  function nearestFreeWorld(c, from) {
    const distance = hexDistance;
    let best = null;
    for (const cluster of c.state.clusters) {
      const center = c.state.planets[cluster.center];
      if (cluster.kind !== 'world' || !center || center.owner !== null || center.hasColony) continue;
      for (const coord of from) {
        const d = distance(coord, cluster.center);
        if (!best || d < best.distance) best = { name: cluster.name, center: cluster.center, distance: d };
      }
    }
    return best;
  }

  // A Learn to play walkthrough saved part-way: offer to continue it.
  function walkthroughInProgress() {
    try { const saved = JSON.parse(localStorage.getItem('galactic-reach-tutorial-progress-v1') || 'null'); return Boolean(saved?.step > 0 && saved.stepId !== 'finished'); } catch { return false; }
  }

  // Converting into a full resource wastes it: say so before the player does it.
  function fullWarning(c) {
    const limits = port.limits();
    const wasted = [...new Set(c.convertible.flatMap(card => Object.keys(port.cards[card.key].resource || {}).filter(r => c.player.resources[r] >= limits[r])))];
    return wasted.length ? ` Careful: your ${wasted.map(r => RESOURCE_NAMES[r]).join(' and ')} ${wasted.length > 1 ? 'are' : 'is'} full, so converting a card into ${wasted.length > 1 ? 'them' : 'it'} now would waste it.` : '';
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
      if (action === 'learn') { prefs.seen.welcome = true; savePrefs(); location.href = `${location.pathname}?tutorial=1`; return; }
      if (action === 'more') { coach.dataset.expanded = String(coach.dataset.expanded !== 'true'); schedule(); return; }
      globalThis.galacticReachTutorial?.coachAction?.(action, button.dataset);
      schedule();
    });
    return coach;
  }

  function clearTargets() { targeted.forEach(element => element.classList.remove('gr-coach-target', 'gr-coach-goal')); targeted = []; }

  // Where to aim at an element: a fanned hand card shows only a strip before the next card
  // covers it, so aim at the middle of that strip (the pointer and a note's tail agree).
  function aimX(anchor) {
    const r = anchor.getBoundingClientRect();
    let right = r.right;
    const next = anchor.closest('#hand-row') && anchor.nextElementSibling?.matches?.('.game-card') ? anchor.nextElementSibling.getBoundingClientRect() : null;
    if (next && next.left > r.left && next.left < right) right = next.left;
    return (r.left + right) / 2;
  }

  // A small arrow above the one element the note means (below it near the window's top edge).
  let pointer = null;
  function placePointer(anchor) {
    if (!pointer) {
      pointer = document.createElement('div');
      pointer.className = 'gr-coach-pointer';
      pointer.setAttribute('aria-hidden', 'true');
      pointer.setAttribute('popover', 'manual');
      pointer.innerHTML = '<svg viewBox="0 0 28 30"><path d="M14 29 3 15h7V1h8v14h7z" fill="currentColor" stroke="#062026" stroke-width="1.5" stroke-linejoin="round"/></svg>';
      document.body.appendChild(pointer);
    }
    // A whole row or panel (your hand, the mat, the score track) gets the ring but no arrow:
    // an arrow at its middle would seem to single out one card in it.
    const single = anchor && !anchor.matches('#hand-row, #resource-grid, #prestige-track, #phase-stepper, #relic-row, #sector-popover');
    // A note laid beside its anchor already points at it with its own arrow.
    const ownArrow = coach && ['top', 'bottom', 'left', 'right'].includes(coach.dataset.side) && !coach.classList.contains('docked');
    const visible = single && !ownArrow && shown(anchor) && coach && !coach.hidden && getComputedStyle(coach).display !== 'none' && getComputedStyle(coach).visibility !== 'hidden';
    if (!visible) { if (pointer.matches(':popover-open')) pointer.hidePopover(); pointer.hidden = true; return; }
    const r = anchor.getBoundingClientRect(), below = r.top < 40;
    pointer.classList.toggle('below', below);
    pointer.style.left = `${Math.round(Math.max(2, Math.min(innerWidth - 30, aimX(anchor) - 14)))}px`;
    pointer.style.top = `${Math.round(below ? r.bottom + 4 : r.top - 34)}px`;
    pointer.hidden = false;
    if (!pointer.matches(':popover-open')) pointer.showPopover();
  }

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
      const buttons = [...(tip.buttons || []), { action: 'more', label: 'More' }];
      const bar = tip.progress ? `<ol class="gr-coach-progress" aria-hidden="true">${Array.from({ length: tip.progress.lessons }, (_, i) => `<li class="${i < tip.progress.finishedLessons ? 'done' : ''}${i === tip.progress.current ? ' current' : ''}"></li>`).join('')}</ol>` : '';
      box.innerHTML = `${bar}<div class="gr-coach-eyebrow">${esc(tip.eyebrow || 'Guide')}</div><strong class="gr-coach-title">${esc(tip.title)}</strong><p class="gr-coach-text">${esc(tip.text)}</p>${tip.rule ? `<a class="gr-coach-rule" href="rulebook.html#${esc(tip.rule)}" target="_blank" rel="noopener">Rules ↗</a>` : ''}<div class="gr-coach-actions">${buttons.map(b => `<button type="button" class="button ${b.primary ? 'button-primary' : 'button-ghost'}" data-coach="${esc(b.action)}"${b.id ? ` data-id="${esc(b.id)}"` : ''}${b.aria ? ` aria-label="${esc(b.aria)}"` : ''}${b.action === 'more' ? ' hidden' : ''}${b.disabled ? ' disabled' : ''}>${esc(b.label)}</button>`).join('')}</div><span class="gr-coach-arrow" aria-hidden="true"></span>`;
      if (!tip.quiet && tip.text !== lastAnnounced) lastAnnounced = tip.text;
    }
    box.hidden = false;
    if (host === document.body) {
      // Raise above any popover opened since (the Sector Scan): showing again puts it on top.
      const others = $$(':popover-open').filter(el => el !== box && el !== pointer).map(el => el.id).join(',');
      if (!box.matches(':popover-open') || others !== raisedOver) {
        if (box.matches(':popover-open')) box.hidePopover(); box.showPopover(); raisedOver = others;
        if (pointer?.matches(':popover-open')) pointer.hidePopover();
      }
    }
    clearTargets();
    const anchor = host === document.body && tip.anchor && shown(tip.anchor) ? tip.anchor : null;
    if (anchor && !tip.noPulse) { anchor.classList.add('gr-coach-target'); targeted.push(anchor); }
    currentAnchor = anchor;
    currentAvoid = (tip.avoid || []).filter(Boolean);
    // A destination the note names (a world to reach) gets a quieter dashed ring of its own.
    if (host === document.body) for (const mark of (tip.marks || []).filter(Boolean)) { mark.classList.add('gr-coach-goal'); targeted.push(mark); }
    box.classList.toggle('free', Boolean(tip.dock));
    if (host !== document.body) {
      box.style.left = box.style.top = box.style.width = ''; box.dataset.side = 'inline'; box.classList.remove('docked'); placePointer(null);
      // A note must not push the window's own buttons (a battle's tactics) off screen: shorten it.
      const text = box.querySelector('.gr-coach-text');
      const over = Math.max(host.getBoundingClientRect().bottom - innerHeight + 8, host.scrollHeight - host.clientHeight);
      const more = box.querySelector('[data-coach="more"]');
      if (box.dataset.expanded === 'true') { if (text && box.dataset.full) text.textContent = box.dataset.full; if (more) { more.hidden = false; more.textContent = 'Less'; } return; }
      const cut = text && over > 0 && !box.dataset.full ? fitText(box, text, Math.max(60, box.offsetHeight - over)) : Boolean(box.dataset.full && text?.textContent !== box.dataset.full);
      if (more) { more.hidden = !cut; more.textContent = 'More'; }
      return;
    }
    box.classList.toggle('docked', Boolean(tip.dock && dockRect()));
    position(box, anchor);
  }

  // In your own games the note lies over the map key in the left column, where the table's
  // notices appear, so it never hides a hex; the pulsing ring shows what it is about.
  function dockRect() {
    const key = $('#map-legend-corner');
    if (!shown(key) || matchMedia('(max-width: 599px), (max-height: 499px)').matches) return null;
    const r = key.getBoundingClientRect();
    if (r.width < 160 || r.height < 100) return null;
    const above = $('#fleet-glance')?.getBoundingClientRect();
    // Never over your hand, piles or menu button where the key's box reaches beside them.
    let bottom = r.bottom;
    for (const el of $$('#hand-row .game-card, .pile-stats > button, #table-menu-button, #board-primary:not([hidden])')) {
      const b = el.getBoundingClientRect();
      if (b.width && b.right > r.left && b.left < r.right && b.top > r.top + 40 && b.top < bottom) bottom = b.top - 6;
    }
    // The hexagon's slanted edge can reach into the key's box. Either start below every hex in
    // this column, or keep the key's height and stop short of the hexes: whichever leaves more room.
    const hexes = $$('.hex').map(h => h.getBoundingClientRect()).filter(h => h.right > r.left + 2 && h.left < r.right - 2 && h.top < bottom && h.bottom > r.top);
    const below = { left: r.left, width: r.width, top: Math.max(r.top, ...hexes.map(h => h.bottom + 2)) };
    const beside = { left: r.left, width: Math.min(r.width, ...hexes.map(h => h.left - 4 - r.left)), top: r.top };
    const area = d => Math.max(0, d.width) * Math.max(0, bottom - d.top);
    const best = [below, beside].filter(d => d.width >= 160 && bottom - d.top >= 100).sort((a, b) => area(b) - area(a))[0];
    if (!best) return null;
    return { ...best, bottom, ceiling: above?.height ? above.bottom + 8 : 10 };
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
    // Your own games' notes dock whenever the map key has room, decided again as the table settles.
    if (box.classList.contains('free') && !box.classList.contains('in-dialog')) box.classList.toggle('docked', Boolean(dockRect()));
    positionBox(box, anchor); placePointer(anchor);
  }
  function positionBox(box, anchor) {
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
        // Too little room even for one sentence: drop the eyebrow and Rules link first.
        box.classList.toggle('tight', !expanded && room < 150);
        box.classList.remove('bare');
        let cut = expanded ? (text.textContent = box.dataset.full || text.textContent, false) : fitText(box, text, room);
        // Not even one sentence fits: keep the title and buttons; More shows the rest.
        if (!expanded && box.offsetHeight > room) { box.classList.add('bare', 'tight'); cut = true; }
        if (more) { more.hidden = !cut && !expanded; more.textContent = expanded ? 'Less' : 'More'; }
      }
      // A window too small even for the title and buttons: the note steps aside rather than
      // cover your hand; it returns when there is room (Guidance in the menu stays on).
      box.classList.toggle('no-room', !expanded && box.offsetHeight > room + 2);
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
    // Of the sides that fit, prefer the one that hides least of what you may need next: the lit
    // hexes of an aimed order and an open Sector Scan.
    const avoid = [...$$('.hex.cf-drop-target, .hex.target'), ...$$('#sector-popover:popover-open'), ...currentAvoid].filter(el => el !== around && !around.contains(el)).map(el => el.getBoundingClientRect());
    const covered = o => avoid.reduce((sum, r) => sum + Math.max(0, Math.min(o.left + width, r.right) - Math.max(o.left, r.left)) * Math.max(0, Math.min(o.top + height, r.bottom) - Math.max(o.top, r.top)), 0);
    options.forEach(o => { o.cost = Math.round(covered(o) / 100); });
    options.sort((x, y) => x.cost - y.cost || sides.indexOf(x.side) - sides.indexOf(y.side));
    const choice = options.find(o => o.fits) || { side: 'none', left: clampX(a.left), top: clampY(a.top - height - gap) };
    box.style.left = `${Math.round(choice.left)}px`;
    box.style.top = `${Math.round(choice.top)}px`;
    box.dataset.side = choice.side;
    const arrow = box.querySelector('.gr-coach-arrow');
    if (arrow) {
      const b = anchor.getBoundingClientRect();
      const along = choice.side === 'top' || choice.side === 'bottom'
        ? Math.max(14, Math.min(width - 14, aimX(anchor) - choice.left))
        : Math.max(14, Math.min(height - 14, b.top + b.height / 2 - choice.top));
      arrow.style.setProperty('--along', `${Math.round(along)}px`);
    }
  }

  function hide() { if (coach) { if (coach.matches(':popover-open')) coach.hidePopover(); coach.hidden = true; } clearTargets(); lastKey = ''; raisedOver = null; currentAnchor = null; placePointer(null); }

  function update() {
    frame = 0;
    if (!port) return;
    let tip = null;
    try {
      const tutorial = globalThis.galacticReachTutorial;
      if (tutorial?.active) tip = tutorial.tip(port, api);
      else if (prefs.enabled) {
        const c = context();
        let explainer = EXPLAINERS.find(e => !prefs.seen[e.id] && e.when(c));
        // Shown for the turn it became relevant: once that turn has passed it is remembered as read,
        // so the next turn's hint takes its place even if Got it was never chosen.
        if (explainer && !c.state.pendingCombat) {
          const turn = port.turnSerial();
          if (!(explainer.id in shownAt)) shownAt[explainer.id] = turn;
          else if (shownAt[explainer.id] !== turn) { prefs.seen[explainer.id] = true; savePrefs(); explainer = EXPLAINERS.find(e => !prefs.seen[e.id] && e.when(c)); if (explainer) shownAt[explainer.id] = turn; }
        }
        if (explainer) tip = { dock: true, id: explainer.id, eyebrow: 'New to you', title: explainer.title, text: explainer.text(c), rule: explainer.rule, inDialog: explainer.inDialog,
          anchor: explainer.anchor?.(c) || null, marks: explainer.marks?.(c) || [], buttons: [...(explainer.buttons || []), { action: 'got-it', id: explainer.id, label: 'Got it', primary: !explainer.buttons }, { action: 'hide', label: 'Turn off guidance', aria: 'Turn off guidance (Guidance in the menu turns it back on)' }] };
        else {
          tip = hint(c);
          if (tip) tip = { ...tip, dock: true, eyebrow: tip.quiet ? 'Guide' : 'You can', buttons: tip.quiet ? [] : [{ action: 'hide', label: 'Turn off guidance', aria: 'Turn off guidance (Guidance in the menu turns it back on)' }] };
        }
      }
    } catch (error) { console.error('Guidance could not read the table.', error); tip = null; }
    if (tip) { place(tip); settle(); } else hide();
    syncMenu();
  }

  // The table refits the map just after a render (it may move without resizing): follow it for
  // about half a second, every frame, so the note never rests on a hex while the map settles.
  let settling = 0;
  function settle() {
    const already = settling > 0;
    settling = 30;
    if (already) return;
    const step = () => {
      if (coach && !coach.hidden && coach.dataset.side !== 'inline') position(coach, currentAnchor && shown(currentAnchor) ? currentAnchor : null);
      if (--settling > 0) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
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
    // A walkthrough in progress: the menu offers to continue it rather than start again.
    try {
      const tutorial = JSON.parse(localStorage.getItem('galactic-reach-tutorial-progress-v1') || 'null');
      const learn = $('#learn-to-play');
      if (learn && !globalThis.galacticReachTutorial?.active && walkthroughInProgress()) learn.textContent = 'Continue Learn to play';
    } catch { /* no saved walkthrough */ }
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
