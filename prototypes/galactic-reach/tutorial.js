// Learn to play (index.html?tutorial=1): a seeded game against rivals that hold still, taught
// through the real table one step at a time. Each step points at the real element to use and
// waits for the player's own action, read back from the game state (docs/rules/tutorial.md).
// Between lessons the walkthrough may stage a position (a supply of resources, a card into
// your hand, a unit moved ahead) and says so in the coach mark and the game log. Its game and
// progress use their own storage keys, so a guest save is never touched.
(() => {
  'use strict';
  const params = new URLSearchParams(globalThis.location?.search || '');
  if (params.get('tutorial') !== '1') { globalThis.galacticReachTutorial = { active: false }; return; }

  const RULES = 'galactic-reach/38.43';
  const PROGRESS = 'galactic-reach-tutorial-progress-v1';
  const SEED = 20261116;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const RES = ['matter', 'energy', 'biomass', 'data'];
  const NAMES = { matter: 'Matter', energy: 'Energy', biomass: 'Biomass', data: 'Data' };

  function seeded(seed) { let v = seed >>> 0; return () => { v = (v * 1664525 + 1013904223) >>> 0; return v / 0x100000000; }; }
  function loadProgress() {
    try { const saved = JSON.parse(localStorage.getItem(PROGRESS) || 'null'); if (saved && saved.rules === RULES && Number.isInteger(saved.step)) return saved; } catch { /* fresh */ }
    return { rules: RULES, step: 0, view: 0, base: null, staged: {} };
  }
  let progress = loadProgress();
  function saveProgress() { try { localStorage.setItem(PROGRESS, JSON.stringify(progress)); } catch { /* not saved */ } }
  // A guest game already saved in this browser: finishing returns to it rather than dealing a new one.
  function guestGame() { try { return Object.keys(localStorage).some(key => /^galactic-reach-save-v\d+/.test(key)); } catch { return false; } }
  function clearTutorial() {
    try { for (const key of Object.keys(localStorage)) if (key.startsWith('galactic-reach-tutorial-')) localStorage.removeItem(key); } catch { /* nothing to clear */ }
  }

  // ---- Reading positions. ----
  const parse = key => key.split(',').map(Number);
  const distance = (a, b) => { const [q1, r1] = parse(a), [q2, r2] = parse(b); return (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(q1 + r1 - q2 - r2)) / 2; };
  const me = state => state.players[0];
  const colony = state => Object.keys(state.planets).find(c => state.planets[c].owner === 0 && state.planets[c].hasColony && state.planets[c].cluster === 0)
    || Object.keys(state.planets).find(c => state.planets[c].owner === 0 && state.planets[c].hasColony);
  const yard = state => Object.keys(state.planets).find(c => state.planets[c].owner === 0 && state.planets[c].upgrade === 'starbase') || null;
  const unitsAt = (state, type, player = 0) => Object.entries(state.fleets || {}).filter(([, f]) => f?.[player]?.[type] > 0).map(([c]) => c);
  const unitCount = (state, type) => Object.values(state.fleets || {}).reduce((n, f) => n + (f?.[0]?.[type] || 0), 0);
  const allCards = p => [...p.hand, ...p.deck, ...p.discard, ...p.inPlay];
  const handHas = (state, key) => me(state).hand.find(c => c.key === key) || null;
  const coloniesOf = state => Object.values(state.planets).filter(p => p.owner === 0 && p.hasColony).length;
  const knownRelic = (state, port) => Object.keys(state.planets).find(c => { const p = state.planets[c]; return p.special === 'relic' && !p.relicClaimed && port.relicKnown(state.clusters[p.cluster]); }) || null;
  const purchases = p => (p.cardsPurchased || 0) - (p.storagePurchases || 0);
  const upgradedCount = p => allCards(p).filter(c => c.starter && c.upgraded).length;
  const modules = p => allCards(p).filter(c => c.key === 'capacityModule').length;
  const myOps = state => state.phase === 'operations' && state.activePlayer === 0 && state.winner === null;
  const myBuy = state => state.phase === 'buy' && state.activePlayer === 0;
  const modalOpen = selector => { const d = $(selector); return Boolean(d?.open && d.matches(':modal')); };
  const scanOpen = () => Boolean($('#sector-popover')?.matches(':popover-open'));
  function targetWorld(state) {
    const home = colony(state);
    return state.clusters.filter(c => c.kind === 'world' && state.planets[c.center].owner === null && !state.planets[c.center].hasColony)
      .sort((a, b) => distance(a.center, home) - distance(b.center, home) || a.id - b.id)[0] || null;
  }

  // ---- Staging: idempotent, explained in the log. Each receives app.js's stage port. ----
  function ensureResources(s, min) {
    const p = me(s.state), limits = s.resourceLimits(0);
    for (const r of RES) if ((min[r] || 0) > p.resources[r]) p.resources[r] = Math.min(limits[r], min[r]);
  }
  function setResources(s, values) { const p = me(s.state), limits = s.resourceLimits(0); for (const r of RES) p.resources[r] = Math.min(limits[r], values[r] || 0); }
  // Bring named cards into the hand from deck or discard, returning spare hand cards to where they came from.
  function ensureHand(s, keys, swap = false) {
    const p = me(s.state);
    const need = {}; for (const k of keys) need[k] = (need[k] || 0) + 1;
    const have = {}; for (const c of p.hand) have[c.key] = (have[c.key] || 0) + 1;
    for (const [key, count] of Object.entries(need)) {
      for (let i = have[key] || 0; i < count; i++) {
        let pile = p.deck, index = p.deck.findIndex(c => c.key === key);
        if (index < 0) { pile = p.discard; index = p.discard.findIndex(c => c.key === key); }
        if (index < 0) continue;
        const [card] = pile.splice(index, 1);
        const spareIndex = p.hand.findIndex(c => { const n = need[c.key] || 0; return p.hand.filter(x => x.key === c.key).length > n; });
        if (swap && p.hand.length >= 5 && spareIndex >= 0) pile.splice(index, 0, p.hand.splice(spareIndex, 1)[0]);
        p.hand.push(card);
      }
    }
  }
  function ensureOwned(s, key) { const p = me(s.state); if (!allCards(p).some(c => c.key === key)) p.discard.push(s.makeCard(key)); }
  function ensureShipyard(s) {
    if (yard(s.state)) return yard(s.state);
    const home = colony(s.state), cluster = s.state.clusters[s.state.planets[home].cluster];
    const site = cluster.coords.find(c => c !== home && !s.state.planets[c].upgrade && distance(c, home) === 1);
    Object.assign(s.state.planets[site], { owner: 0, hasColony: false, upgrade: 'starbase', upgradeLevel: 1, conquest: false });
    me(s.state).initialShipyardCoord ||= site;
    return site;
  }
  function ensureUnits(s, wanted) {
    const at = ensureShipyard(s);
    for (const [type, n] of Object.entries(wanted)) { const missing = n - unitCount(s.state, type); if (missing > 0) s.ensureFleet(at, 0)[type] += missing; }
  }
  function relocate(s, type, from, to) {
    const source = s.state.fleets[from]?.[0];
    if (!source || !source[type]) return;
    source[type] -= 1;
    s.ensureFleet(to, 0)[type] += 1;
  }

  // ---- The lessons, in rulebook order. ----
  const hand = key => state => globalThis.galacticReachGuide.handCard(handHas(state, key)?.id || '');
  const lastHand = key => state => { const cards = me(state).hand.filter(c => c.key === key); return globalThis.galacticReachGuide.handCard(cards.at(-1)?.id || ''); };
  const scanButton = pattern => () => $$('#sector-popover button').find(b => !b.disabled && pattern.test(b.textContent.trim())) || null;
  const hexAt = coord => coord && globalThis.galacticReachGuide.hex(coord);

  const LESSONS = [
    { id: 'table', title: 'Read the table', steps: [
      { id: 'track', title: 'The score track', rule: 'shared-board',
        text: s => `Top left is the score track. Every faction races to ${s.victoryTarget || 40} Prestige (★). The first round that ends with someone at the goal decides the winner. Select your marker, “You”, to see where your points come from.`,
        anchor: () => $('[data-score-player="0"]'), done: () => modalOpen('#prestige-dialog') },
      { id: 'track-close', title: 'Your points', rule: 'victory', dialog: '#prestige-dialog',
        text: () => 'Your home Colony is worth 3★. Each new Colony adds 3★, each excavated relic 2★ and each decisive battle 2★. Close this window to go on.',
        done: () => !modalOpen('#prestige-dialog') },
      { id: 'home', title: 'Your home world', rule: 'shared-board',
        text: () => 'This is your home world. Your Colony (the house) sits on its center hex, and the cyan ring shows the world is yours. Select your Colony.',
        anchor: state => hexAt(colony(state)), done: state => scanOpen() || state.selected === colony(state) },
      { id: 'scan-close', title: 'The Sector Scan', rule: 'shared-board',
        text: () => 'The Sector Scan lists what is on a hex and which orders you could start there. It is your magnifying glass for the map. Close it with Close or Escape.',
        anchor: () => $('#sector-popover'), done: () => !scanOpen() },
    ] },
    { id: 'resources', title: 'Resources', steps: [
      { id: 'convert-construct', title: 'Your resources', rule: 'player-mat',
        prepare: s => { ensureHand(s, ['move', 'move', 'construct', 'construct', 'construct'], true); },
        text: () => 'Bottom right is your mat, one row per resource: Matter, Energy, Biomass, Data. The big pips show what you hold now, the small pips what you produce each round (your Colony makes 1 Matter), and the gold pip your limit of 4. Get more Matter: drag a Construct onto your mat, or point at it and choose Convert.',
        anchor: lastHand('construct'), start: state => ({ matter: me(state).resources.matter }),
        done: (state, base) => me(state).resources.matter > base.matter },
      { id: 'convert-move', title: 'Convert a Move', rule: 'resources',
        text: () => 'A level I starter converts once: a Construct gives 1 Matter and a Move 1 Energy, and the card is used for this round. Now drag a Move onto your mat for 1 Energy.',
        anchor: hand('move'), start: state => ({ energy: me(state).resources.energy }),
        done: (state, base) => me(state).resources.energy > base.energy },
    ] },
    { id: 'orders', title: 'Orders', steps: [
      { id: 'shipyard-aim', title: 'Use an order', rule: 'orders',
        ensure: s => { if (yard(s.state)) return false; ensureHand(s, ['construct']); ensureResources(s, { matter: 2, energy: 1, biomass: 1, data: 1 }); return 'Tutorial supply: the cards and resources for a Shipyard.'; },
        needsEnsure: state => !yard(state) && (!handHas(state, 'construct') || RES.some(r => me(state).resources[r] < ({ matter: 2, energy: 1, biomass: 1, data: 1 })[r])),
        text: () => 'Instead of converting a card you can use its order. You now have exactly what a Shipyard costs: 2 Matter, 1 Energy, 1 Biomass, 1 Data. Drag your Construct onto a lit hex next to your Colony, or choose Use order and then a lit hex.',
        anchor: hand('construct'), done: state => Boolean(yard(state)) || (scanOpen() && Boolean(scanButton(/Shipyard/)())) },
      { id: 'shipyard-build', title: 'Build a Shipyard', rule: 'building',
        // Closed the Sector Scan, or built something else instead: go back to choosing the hex.
        fallback: state => !yard(state) && !(scanOpen() && scanButton(/Shipyard/)()),
        text: () => 'Choose Build Shipyard. A Shipyard lets you commission ships, and it defends its own hex.',
        anchor: scanButton(/Shipyard/), done: state => Boolean(yard(state)) },
    ] },
    { id: 'round', title: 'The round', steps: [
      { id: 'pass', title: 'Pass & buy', rule: 'round',
        text: () => 'You get one order per turn, then your rivals take theirs (in this tutorial they just pass). You have nothing left to pay for a build, so choose Pass & buy. That ends your Operations for this round and starts your Buy turn.',
        anchor: () => globalThis.galacticReachGuide.turnButton(), start: state => ({ round: state.round }), done: (state, base) => me(state).passed || state.round > base.round },
      { id: 'buy-empty', buy: true, title: 'Finish Buy', rule: 'buy',
        text: () => 'This is your Buy turn: the market (right) sells cards for resources. You have nothing to spend yet, so choose Finish Buy. The round then ends for everyone.',
        anchor: () => globalThis.galacticReachGuide.turnButton(), start: state => ({ round: state.round }), done: (state, base) => state.round > base.round },
      { id: 'deck', title: 'A new round', rule: 'cleanup-draw', wait: state => !myOps(state),
        text: () => 'When everyone finished Buy, the round ended: all hands and used cards went to the discard pile and everyone drew five new cards. Then Production gave you 1 Matter. Select your Deck (bottom left) to see what is left in it.',
        anchor: () => $('#deck-button'), done: () => modalOpen('#deck-dialog') },
      { id: 'deck-close', title: 'Your deck', rule: 'deck-inspection', dialog: '#deck-dialog',
        text: () => 'These are the cards left to draw (their order stays hidden). When the deck runs out, your discard pile is shuffled into a new deck. Close this window.',
        done: () => !modalOpen('#deck-dialog') },
    ] },
    { id: 'units', title: 'Ships', steps: [
      { id: 'settler', title: 'Commission a Settler', rule: 'building',
        prepare: s => { ensureShipyard(s); ensureHand(s, ['construct', 'construct', 'construct', 'move', 'move'], true); ensureResources(s, { matter: 3, energy: 3, biomass: 2, data: 2 }); return 'Tutorial supply: resources for a Settler, an Explorer and a Fleet.'; },
        ensure: s => { ensureHand(s, ['construct']); ensureResources(s, { matter: 1, energy: 1, biomass: 1 }); return 'Tutorial supply: a Construct and the price of a Settler.'; },
        needsEnsure: state => myOps(state) && (!handHas(state, 'construct') || !(me(state).resources.matter >= 1 && me(state).resources.energy >= 1 && me(state).resources.biomass >= 1)),
        text: () => 'Drag a Construct onto your Shipyard and choose Commission Settler (1 Matter, 1 Energy, 1 Biomass). Settlers found Colonies.',
        anchor: state => scanButton(/Settler/)() || hand('construct')(state), aimAt: state => yard(state), done: state => unitCount(state, 'settler') > 0 },
      { id: 'explorer', title: 'Commission an Explorer', rule: 'building',
        ensure: s => { ensureHand(s, ['construct']); ensureResources(s, { energy: 1, data: 2 }); return 'Tutorial supply: a Construct and the price of an Explorer.'; },
        needsEnsure: state => myOps(state) && (!handHas(state, 'construct') || !(me(state).resources.energy >= 1 && me(state).resources.data >= 2)),
        text: () => 'Your Settler stands on the Shipyard, and a Colonize card went to your discard pile: a ship that needs a card brings it along. Now use another Construct on the Shipyard to commission an Explorer (1 Energy, 2 Data). Explorers find relics.',
        anchor: state => scanButton(/Explorer/)() || hand('construct')(state), aimAt: state => yard(state), done: state => unitCount(state, 'explorer') > 0 },
      { id: 'fleet', title: 'Commission a Fleet', rule: 'combat',
        ensure: s => { ensureHand(s, ['construct']); ensureResources(s, { matter: 2, energy: 1, biomass: 1 }); return 'Tutorial supply: a Construct and the price of a Fleet.'; },
        needsEnsure: state => myOps(state) && (!handHas(state, 'construct') || !(me(state).resources.matter >= 2 && me(state).resources.energy >= 1 && me(state).resources.biomass >= 1)),
        text: () => 'The Explorer brought a Probe / Excavate card. Last one: commission a Fleet (2 Matter, 1 Energy, 1 Biomass). Fleets are your warships: attack 3, hull 7.',
        anchor: state => scanButton(/Fleet/)() || hand('construct')(state), aimAt: state => yard(state), done: state => unitCount(state, 'fleet') > 0 },
    ] },
    { id: 'movement', title: 'Movement', steps: [
      { id: 'move-split', title: 'Split a move', rule: 'split-moves', aimAt: state => state.moveSource ? null : yard(state),
        prepare: s => { ensureUnits(s, { settler: 1, explorer: 1, fleet: 1 }); },
        ensure: s => { ensureHand(s, ['move']); return 'Tutorial supply: a Move card.'; },
        needsEnsure: state => myOps(state) && !handHas(state, 'move'),
        start: state => ({ fleets: unitsAt(state, 'fleet').join('|') }),
        text: () => 'A Move order moves one group from one hex. Drag a Move onto your Shipyard and choose Move ships. The Fleet and the Settler are both ticked, so they would go together at the Settler’s speed: 1 hex. Untick the Settler so the Fleet can go 2, then choose a lit hex.',
        anchor: state => scanOpen() && $('#sector-popover [data-move-unit="settler"]')?.checked ? $('#sector-popover [data-move-unit="settler"]').closest('label') : hand('move')(state),
        done: (state, base) => unitsAt(state, 'fleet').join('|') !== base.fleets && !state.pendingMove },
      { id: 'move-explorer', title: 'Explorers fly alone', rule: 'movement', aimAt: state => state.moveSource ? null : unitsAt(state, 'explorer')[0],
        ensure: s => { ensureHand(s, ['move']); return 'Tutorial supply: a Move card.'; },
        needsEnsure: state => myOps(state) && !handHas(state, 'move'),
        start: state => ({ explorers: unitsAt(state, 'explorer').join('|') }),
        text: () => 'Explorers never move with warships. Drag your other Move onto the Explorer, choose Move Explorers, and pick any lit hex: Explorers fly 3 hexes.',
        anchor: hand('move'), done: (state, base) => unitsAt(state, 'explorer').join('|') !== base.explorers },
    ] },
    { id: 'relics', title: 'Relics', steps: [
      { id: 'probe', title: 'Probe for a relic', rule: 'movement', aimAt: state => unitsAt(state, 'explorer')[0], wait: state => !myOps(state),
        prepare: s => { ensureUnits(s, { explorer: 1 }); ensureOwned(s, 'probe'); ensureHand(s, ['probe', 'move', 'move']); },
        ensure: s => { ensureOwned(s, 'probe'); ensureHand(s, ['probe']); return 'Tutorial supply: your Probe / Excavate card.'; },
        needsEnsure: state => myOps(state) && !handHas(state, 'probe') && !me(state).inPlay.some(c => c.key === 'probe'),
        text: () => 'Relics (◈) hide on the worlds and moons. Drag your Probe / Excavate card onto your Explorer and choose Probe: it locates the nearest hidden relic, from anywhere. Only you learn where it is.',
        anchor: hand('probe'), done: (state, base, port) => Boolean(knownRelic(state, port)) },
      { id: 'reach-relic', title: 'Fly to the relic', rule: 'excavation', aimAt: (state, port) => state.moveSource ? knownRelic(state, port) : unitsAt(state, 'explorer')[0],
        ensure: s => { ensureHand(s, ['move']); return 'Tutorial supply: a Move card.'; },
        needsEnsure: state => myOps(state) && !handHas(state, 'move'),
        text: (state, port) => `The ◈ marks the relic you located. Move your Explorer onto that exact hex: drag Move onto the Explorer and choose a lit hex. If the ◈ is not lit yet, fly as close as you can and finish with another Move.`,
        anchor: (state, port) => (myOps(state) ? hand('move')(state) : null) || hexAt(knownRelic(state, port)),
        done: (state, base, port) => { const site = knownRelic(state, port); return !site || unitsAt(state, 'explorer').includes(site); } },
      { id: 'excavate', title: 'Excavate', rule: 'excavation', aimAt: state => unitsAt(state, 'explorer')[0],
        ensure: s => { ensureOwned(s, 'probe'); ensureHand(s, ['probe']); ensureResources(s, { matter: 1, energy: 1, data: 2 }); return 'Tutorial supply: your Probe / Excavate card and the excavation cost (1 Matter, 1 Energy, 2 Data).'; },
        needsEnsure: state => myOps(state) && !me(state).inPlay.some(c => c.key === 'probe') && (!handHas(state, 'probe') || !(me(state).resources.matter >= 1 && me(state).resources.energy >= 1 && me(state).resources.data >= 2)),
        text: state => me(state).inPlay.some(c => c.key === 'probe') && !handHas(state, 'probe')
          ? 'Your Explorer is on the relic. Your Probe / Excavate card stays in play until this round ends, so excavate next round. Finish this round: choose Pass & buy, then Finish Buy.'
          : 'Drag Probe / Excavate onto your Explorer (on the ◈) and choose Excavate. It costs 1 Matter, 1 Energy and 2 Data.',
        anchor: state => me(state).inPlay.some(c => c.key === 'probe') && !handHas(state, 'probe') ? globalThis.galacticReachGuide.turnButton() : (scanButton(/Excavate/)() || hand('probe')(state)),
        done: state => me(state).relicsExcavated > 0 || state.actionMode === 'excavate' },
      { id: 'choose-relic', title: 'Choose a relic card', rule: 'alien-relics',
        // Cancelled Excavate (or never chose a card): go back and play it again.
        fallback: state => me(state).relicsExcavated === 0 && state.actionMode !== 'excavate',
        text: () => 'Choose one of the three face-up relic cards. It goes to your discard pile, you gain 2★, and the Explorer is used up.',
        anchor: () => $('[data-excavate-relic]:not([disabled])') || $('#relic-row'), done: state => me(state).relicsExcavated > 0 },
    ] },
    { id: 'colonies', title: 'Colonies', steps: [
      { id: 'settler-center', title: 'Reach a world', rule: 'orders', aimAt: state => state.moveSource ? targetWorld(state)?.center : unitsAt(state, 'settler')[0],
        prepare: s => {
          ensureUnits(s, { settler: 1 });
          const world = targetWorld(s.state); if (!world) return null;
          const home = colony(s.state);
          const edge = world.coords.filter(c => c !== world.center).sort((a, b) => distance(a, home) - distance(b, home))[0];
          const from = unitsAt(s.state, 'settler')[0];
          if (from && from !== edge) relocate(s, 'settler', from, edge);
          ensureOwned(s, 'colonize'); ensureHand(s, ['move', 'colonize']); ensureResources(s, { biomass: 2 });
          return `Tutorial fast-forward: your Settler flew to the edge of ${world.name}. (Settlers move 1 hex per Move, so this usually takes a few rounds.)`;
        },
        ensure: s => { ensureHand(s, ['move']); return 'Tutorial supply: a Move card.'; },
        needsEnsure: state => myOps(state) && !handHas(state, 'move'),
        text: state => `Your Settler waits beside the center of ${targetWorld(state)?.name || 'a neutral world'}. Drag a Move onto your Settler and move it 1 hex onto the world’s center (the middle hex).`,
        anchor: state => (myOps(state) ? hand('move')(state) : null) || hexAt(targetWorld(state)?.center),
        done: state => { const w = targetWorld(state); return !w || unitsAt(state, 'settler').includes(w.center); } },
      { id: 'colonize', title: 'Found a Colony', rule: 'orders', aimAt: state => targetWorld(state)?.center,
        ensure: s => { ensureOwned(s, 'colonize'); ensureHand(s, ['colonize']); ensureResources(s, { biomass: 2 }); return 'Tutorial supply: a Colonize card and 2 Biomass.'; },
        needsEnsure: state => myOps(state) && (!handHas(state, 'colonize') || me(state).resources.biomass < 2),
        start: state => ({ colonies: coloniesOf(state) }),
        text: () => 'Drag Colonize onto your Settler and choose Found Colony (2 Biomass). The Settler and the card are used up, and the new Colony scores 3★.',
        anchor: state => scanButton(/Found Colony/)() || hand('colonize')(state), done: (state, base) => coloniesOf(state) > base.colonies },
    ] },
    { id: 'bank', title: 'The bank', steps: [
      { id: 'bank-trade', buy: true, title: 'Trade 4 for 1', rule: 'trade',
        prepare: s => { ensureResources(s, { energy: 4 }); return 'Tutorial supply: 4 Energy.'; },
        ensure: s => { ensureResources(s, { energy: 4 }); return 'Tutorial supply: 4 Energy.'; },
        needsEnsure: state => (myOps(state) || myBuy(state)) && me(state).resources.energy < 4,
        start: state => ({ data: me(state).resources.data }),
        text: () => 'Short of one resource? Trade 4 of another at the bank, free, during Operations or Buy, even on a rival’s turn. Drag from your Energy row’s big pips onto your Data row (or select the Energy row, then Data).',
        anchor: () => $('#resource-grid'), done: (state, base) => me(state).resources.data > base.data },
    ] },
    { id: 'buy', title: 'Your Buy turn', steps: [
      { id: 'pass-buy', buy: true, title: 'Start your Buy turn', rule: 'buy',
        prepare: s => { setResources(s, { matter: 4, energy: 4, biomass: 4, data: 4 }); return 'Tutorial supply: 4 of each resource to spend in the market.'; },
        text: () => 'The tutorial filled your mat with 4 of each resource. Choose Pass & buy to start your Buy turn.',
        anchor: () => globalThis.galacticReachGuide.turnButton(), done: state => myBuy(state) },
      { id: 'buy-card', buy: true, title: 'Buy a card', rule: 'market-tiers',
        ensure: s => { setResources(s, { matter: 4, energy: 4, biomass: 4, data: 4 }); return 'Tutorial supply: 4 of each resource.'; },
        needsEnsure: (state, port) => myBuy(state) && !state.market.some(c => port.canAfford(port.purchaseCost(c.key))),
        start: state => ({ bought: purchases(me(state)) }),
        text: () => 'The market (right) has three rows by price: Expensive, Medium and Cheap. Cards you can afford now are outlined in gold. Choose one to buy it. It goes to your discard pile, and the slot refills from the same row.',
        anchor: (state, port) => $(`[data-buy-market]:not([disabled])`), done: (state, base) => purchases(me(state)) > base.bought },
      { id: 'upgrade', buy: true, title: 'Upgrade a starter', rule: 'buy',
        ensure: s => { ensureResources(s, { energy: 2 }); return 'Tutorial supply: 2 Energy.'; },
        needsEnsure: state => myBuy(state) && !RES.some(r => me(state).resources[r] >= 2),
        start: state => ({ upgraded: upgradedCount(me(state)) }),
        dialogs: { '#upgrade-dialog': 'Pick which copy to upgrade and the resource that pays (2 of one kind). Level II gives a stronger order but can no longer convert.' },
        text: () => 'Below the market are the Upgrades. Choose Move II (or Construct II) to upgrade one of your starters for 2 of one resource.',
        anchor: () => $('[data-upgrade-offer]:not([disabled])'), done: (state, base) => upgradedCount(me(state)) > base.upgraded },
      { id: 'capacity', title: 'A Capacity Module', buy: true, rule: 'capacity-module',
        ensure: s => { ensureResources(s, { matter: 1, energy: 1, biomass: 1, data: 1 }); return 'Tutorial supply: 1 of each resource.'; },
        needsEnsure: (state, port) => myBuy(state) && !port.canBuyCapacity(),
        start: state => ({ modules: modules(me(state)) }),
        text: () => 'Most market cards cost more than 4 of one resource, more than you can hold. Buy a Capacity Module from its pile (1 of each resource for your first). You will play it on a later turn to raise your limits.',
        anchor: () => $('[data-capacity-offer]'), done: (state, base) => modules(me(state)) > base.modules },
      { id: 'trash', buy: true, title: 'Trash a card', rule: 'buy',
        ensure: s => { ensureResources(s, { biomass: 3 }); return 'Tutorial supply: 3 Biomass.'; },
        needsEnsure: state => myBuy(state) && !RES.some(r => me(state).resources[r] >= 3),
        start: state => ({ cards: allCards(me(state)).length }),
        dialogs: { '#trash-dialog': 'Choose the resource that pays (3 of one kind), then the card to remove for good. A thinner deck draws your best cards more often.' },
        text: () => 'Choose the Trash pile to remove a card from your deck for 3 of one resource.',
        anchor: () => $('[data-trash-pile]:not([disabled])') || $('#open-trash'), done: (state, base) => allCards(me(state)).length < base.cards },
      { id: 'finish-buy', buy: true, title: 'Finish Buy', rule: 'round',
        start: state => ({ round: state.round }),
        text: () => 'Choose Finish Buy. Unspent resources carry over to the next round (up to your limits).',
        anchor: () => globalThis.galacticReachGuide.turnButton(), done: (state, base) => state.round > base.round },
    ] },
    { id: 'capacity', title: 'Capacity', steps: [
      { id: 'play-module', title: 'Raise your limits', rule: 'storage-allocation', wait: state => !myOps(state),
        prepare: s => { ensureOwned(s, 'capacityModule'); ensureHand(s, ['capacityModule']); },
        ensure: s => { ensureOwned(s, 'capacityModule'); ensureHand(s, ['capacityModule']); return 'Tutorial supply: your Capacity Module.'; },
        needsEnsure: state => myOps(state) && !handHas(state, 'capacityModule') && !(me(state).storage || []).length,
        dialogs: { '#storage-allocation-dialog': 'Split 4 points among your limits, for example 2 Energy and 2 Data, then choose Play Capacity Module at the bottom. Each point raises that limit by 1, for good.' },
        text: () => 'Your Capacity Module came round in your new hand. Choose Use order on it.',
        anchor: hand('capacityModule'), done: state => (me(state).storage || []).length > 0 },
    ] },
    { id: 'combat', title: 'Combat', steps: [
      { id: 'attack', title: 'Attack', rule: 'combat', aimAt: state => state.moveSource ? unitsAt(state, 'explorer', 1)[0] : unitsAt(state, 'fleet')[0], wait: state => !myOps(state) && !state.pendingCombat,
        prepare: s => {
          ensureUnits(s, { fleet: 1 });
          const from = unitsAt(s.state, 'fleet')[0];
          const reach = s.reachableFrom(from, 0, 2, false, { fleet: 1, settler: 0, explorer: 0 }).filter(c => distance(c, from) === 2 && !s.state.fleets[c] && !s.state.planets[c]?.upgrade && !s.state.planets[c]?.hasColony);
          const at = reach[0];
          if (at) { s.ensureFleet(at, 1).explorer += 1; s.state.players[1].resources.energy = 0; }
          ensureHand(s, ['move', 'move']);
          return `Tutorial: an ${s.state.players[1].name} Explorer strayed near your Fleet.`;
        },
        ensure: s => { ensureHand(s, ['move']); return 'Tutorial supply: a Move card.'; },
        needsEnsure: state => myOps(state) && !handHas(state, 'move'),
        start: state => ({ wins: me(state).combatVictories || 0 }),
        text: state => `An enemy Explorer (in ${state.players[1].name}’s colour) sits 2 hexes from your Fleet. Drag a Move onto your Fleet, choose Move ships, and move onto the enemy’s hex. Entering it starts a battle.`,
        anchor: state => { const enemy = unitsAt(state, 'explorer', 1)[0]; return (myOps(state) ? hand('move')(state) : null) || hexAt(enemy); },
        done: (state, base) => Boolean(state.pendingCombat) || (me(state).combatVictories || 0) > base.wins },
      { id: 'tactics', title: 'Choose tactics', rule: 'combat-tactics', dialog: '#combat-dialog',
        text: () => 'If the battle first asks about escaping, choose Stay and fight. Then, each volley, both sides pick a tactic in secret and reveal together. Concentrated Fire adds 1 hit; Defensive Screen prevents 2. Your Fleet deals 3 hits and the Explorer has 1 hull. Pick a tactic.',
        done: state => !state.pendingCombat },
      { id: 'report', title: 'Victory', rule: 'combat', dialog: '#message-dialog',
        start: state => ({ wins: me(state).combatVictories || 0 }),
        text: () => 'You destroyed every enemy unit in the battle: a decisive victory, worth 2★. Read the report, then close it.',
        done: state => !state.pendingCombatReport && !modalOpen('#message-dialog') },
    ] },
    { id: 'victory', title: 'Winning', steps: [
      { id: 'final-track', title: 'Your score', rule: 'victory',
        text: (state, port) => `You have ${port.prestige(0)}★. Select your marker on the score track to see where they came from.`,
        anchor: () => $('[data-score-player="0"]'), done: () => modalOpen('#prestige-dialog') },
      { id: 'final-close', title: 'How to win', rule: 'victory-target', dialog: '#prestige-dialog',
        text: (state, port) => `Score from Colonies (3★ each), relics (2★), decisive battles (2★) and some cards. When a round ends with anyone at ${port.victoryTarget()}★ or more, the highest score wins. Close this window.`,
        done: () => !modalOpen('#prestige-dialog') },
    ] },
  ];
  const STEPS = LESSONS.flatMap((lesson, lessonIndex) => lesson.steps.map((step, index) => ({ ...step, lesson, lessonIndex, index })));

  // ---- Running the steps. ----
  let port = null, guide = null;
  function stage(change) {
    if (!port?.stage) return false;
    let message = null;
    const ok = port.stage(s => { message = change(s) || null; }, null);
    if (ok && message) port.stage(s => s.logEvent(message), null), toastNote(message);
    return ok;
  }
  let note = '';
  function toastNote(message) { note = message; }

  // Progress names its step, so a later edit to the lesson list resumes at the same step.
  function resolveProgress() {
    if (!progress.stepId) return;
    const index = progress.stepId === 'finished' ? STEPS.length : STEPS.findIndex(s => s.id === progress.stepId);
    if (index >= 0 && index !== progress.step) { progress.step = index; progress.view = index; progress.base = null; }
  }
  function enter(index) {
    progress.step = Math.min(index, STEPS.length);
    progress.stepId = STEPS[progress.step]?.id || 'finished';
    progress.view = progress.step;
    progress.base = null;
    note = '';
    saveProgress();
  }

  function advance() {
    // Several steps may already be satisfied (an alternative solution, or a skipped lesson).
    for (let guard = 0; guard < STEPS.length && progress.step < STEPS.length; guard++) {
      const step = STEPS[progress.step];
      const state = port.state;
      if (step.prepare && !progress.staged[step.id]) {
        if (state.pendingCombat || state.pendingCombatReport || (step.wait && step.wait(state))) return;
        progress.staged[step.id] = true; saveProgress();
        stage(step.prepare);
      }
      if (!progress.base && step.start) { progress.base = step.start(port.state); saveProgress(); }
      if (step.done(port.state, progress.base || {}, port)) { enter(progress.step + 1); continue; }
      // A choice the player abandoned (closed it, cancelled, or did something else) returns to the
      // step that opens it, with that step's top-up if the resources were spent elsewhere.
      if (step.fallback?.(port.state, port) && progress.step > 0) { enter(progress.step - 1); continue; }
      // A missing card or resource (spent elsewhere, or a step reached by Skip) is topped up once per turn.
      if (step.ensure && step.needsEnsure?.(port.state, port)) {
        const key = `${step.id}@${port.turnSerial()}`;
        if (!progress.staged[key]) { progress.staged[key] = true; saveProgress(); stage(step.ensure); }
      }
      return;
    }
  }

  function tip(nextPort, nextGuide) {
    port = nextPort; guide = nextGuide;
    resolveProgress();
    const state = port.state;
    // A new tutorial game (first visit, or its save was cleared) starts the lessons from the top.
    if (state.tutorialRules !== RULES && !state.pendingCombat) {
      if (progress.step > 0 || Object.keys(progress.staged).length) { progress = { rules: RULES, step: 0, view: 0, base: null, staged: {} }; saveProgress(); }
      port.stage(s => { s.state.tutorialRules = RULES; }, null);
    }
    if (progress.view === progress.step) advance();
    const finished = progress.step >= STEPS.length;
    if (finished) return {
      id: 'finished', eyebrow: 'Tutorial complete', title: 'You are ready',
      text: 'You have used every part of a turn: converting and orders, ships and movement, relics, Colonies, the bank, buying, capacity and combat. In a real game the three rivals play to win. Guidance stays on to help you.',
      rule: 'start', anchor: null,
      buttons: [{ action: 'play', label: guestGame() ? 'Back to your game' : 'Play a real game', primary: true }, { action: 'restart', label: 'Replay tutorial' }, { action: 'back', label: 'Back' }]
    };
    const reviewing = progress.view < progress.step;
    const step = STEPS[reviewing ? progress.view : progress.step];
    // A window this step does not use (left open, or opened to look around): say how to go on.
    const stray = !reviewing && !step.dialog && !Object.keys(step.dialogs || {}).some(modalOpen)
      && $$('dialog[open]').find(d => d.matches(':modal') && d.id);
    if (stray) return {
      id: `${step.id}-stray`, eyebrow: `Lesson ${step.lessonIndex + 1} of ${LESSONS.length} · ${step.lesson.title}`, title: step.title,
      text: `Close this window (Close, Done or Escape) to continue: ${typeof step.text === 'function' ? step.text(state, port) : step.text}`,
      rule: step.rule, inDialog: `#${stray.id}`, anchor: null,
      buttons: [{ action: 'back', label: 'Back', disabled: progress.view === 0 }, { action: 'exit', label: 'Exit tutorial' }]
    };
    const openDialog = Object.keys(step.dialogs || {}).find(modalOpen);
    const lesson = step.lesson;
    const eyebrow = `Lesson ${step.lessonIndex + 1} of ${LESSONS.length} · ${lesson.title}${reviewing ? ' · done' : ''}`;
    let text = openDialog ? step.dialogs[openDialog] : typeof step.text === 'function' ? step.text(state, port) : step.text;
    if (!reviewing && note && !openDialog) text = `${note} ${text}`;
    if (!reviewing && !openDialog && !step.dialog && state.activePlayer !== 0 && state.phase === 'operations' && !state.pendingCombat) text = `Rivals are taking their turns… ${text}`;
    const buyDetour = !reviewing && !openDialog && !step.buy && myBuy(state);
    let anchor = null;
    try { anchor = openDialog || step.dialog ? null : step.anchor?.(state, port) || null; } catch { anchor = null; }
    // This step needs an Operations turn, but you are in Buy: finish it, then carry on next round.
    if (buyDetour) { anchor = globalThis.galacticReachGuide.turnButton(); text = `You are in your Buy turn. Choose Finish Buy; the next round brings a new hand. Then: ${text}`; }
    // A card aimed with Use order waits for its hex: point at the lit hexes, whatever the step.
    const lit = coord => coord && $(`.hex.cf-drop-target[data-coord="${coord}"], .hex.target[data-coord="${coord}"]`);
    const choiceInScan = anchor?.closest?.('#sector-popover') && scanOpen();
    const aimed = !reviewing && !openDialog && !state.pendingCombat && !choiceInScan && ['move', 'construct', 'colonize'].includes(state.actionMode)
      && (lit(step.aimAt?.(state, port)) || $('.hex.cf-drop-target, .hex.target'));
    if (aimed) { anchor = aimed; text = `${state.moveSource ? 'Now choose a lit hex to move to.' : 'Now choose one of the lit hexes.'} (Escape cancels.) ${text}`; }
    return {
      id: step.id, step: `${progress.step}:${progress.view}`, eyebrow, title: step.title, text, rule: step.rule,
      inDialog: openDialog || step.dialog || null, anchor, progress: { lessons: LESSONS.length, current: step.lessonIndex, finishedLessons: STEPS[progress.step]?.lessonIndex ?? LESSONS.length },
      buttons: [
        { action: 'back', label: 'Back', disabled: progress.view === 0 },
        ...(reviewing ? [{ action: 'next', label: 'Next', primary: true }] : []),
        { action: 'skip', label: 'Skip lesson', disabled: step.lessonIndex >= LESSONS.length - 1 && !reviewing },
        { action: 'exit', label: 'Exit tutorial' },
      ]
    };
  }

  function coachAction(action) {
    if (action === 'back') { if (progress.step >= STEPS.length) progress.view = STEPS.length - 1; else progress.view = Math.max(0, progress.view - 1); saveProgress(); }
    else if (action === 'next') { progress.view = Math.min(progress.step, progress.view + 1); saveProgress(); }
    else if (action === 'skip') {
      const current = STEPS[progress.view]?.lessonIndex ?? 0;
      const next = STEPS.findIndex(s => s.lessonIndex > current);
      if (progress.view < progress.step) progress.view = Math.min(progress.step, next < 0 ? progress.step : next);
      else enter(next < 0 ? STEPS.length : next);
      saveProgress();
    } else if (action === 'exit') location.href = location.pathname;
    else if (action === 'play') location.href = location.pathname;
    else if (action === 'restart') { clearTutorial(); location.reload(); }
  }

  function init() {
    document.body.classList.add('tutorial-mode');
    const newGame = $('#new-game-button');
    if (newGame) newGame.hidden = true;
    const learn = $('#learn-to-play');
    if (learn) { learn.textContent = 'Restart tutorial'; learn.addEventListener('click', event => { event.preventDefault(); clearTutorial(); location.reload(); }); }
    document.title = `Learn to play · ${document.title}`;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();

  globalThis.galacticReachTutorial = {
    active: true, rules: RULES, lessons: LESSONS, steps: STEPS,
    engineOptions: () => ({ tutorial: true, random: seeded(SEED), lineup: [1, 2, 3], victoryTarget: 40 }),
    tip, coachAction, progress: () => ({ ...progress })
  };
})();
