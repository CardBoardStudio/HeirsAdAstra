// Heirs Ad Astra screens must fit the viewport at 1280x720 and larger: no scrolling may be
// required to view or play (AGENTS.md). This drives a headless Chrome over the DevTools
// protocol (Node built-ins only) through the key play states and fails when the document
// scrolls, a game panel or card clips its content, a control leaves the viewport, or a
// map tool covers a hex. Reference content (game log, playtest notes, rulebook) may scroll.
//
//   node scripts/check-viewport-fit.cjs              # 1280x720, 1440x900 and 1920x1080
// Pointer cases move a real mouse: pointing at a hand card must show its inspect view beside
// the map (never over a hex or the hand), dragging a card onto a legal hex must play it, and
// dragging one onto your reserves must convert it, from anywhere on the card (its buttons
// too), while a still click on a button stays a click; every drop target says what a drop does.
//   CHROME_PATH=/path/to/chrome node scripts/check-viewport-fit.cjs
//   SHOTS=dir node scripts/check-viewport-fit.cjs    # also save a screenshot per state
//   CHECK_ENGINE_APP=/path/to/kept-app.js CHECK_ENGINE_ADAPTER=/path/to/kept-adapter.js
//     # exercise a retained engine against the current shared markup and styles
//   CHECK_ORIGIN=https://preview CHECK_ONLY='1280x720 (operations|buy)' node scripts/check-viewport-fit.cjs
//     # run the save-based cases against a deployed origin (cases needing mocked APIs are skipped)
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const GAME_DIR = path.join(ROOT, 'prototypes/galactic-reach');
const LAB_DIR = path.join(ROOT, 'prototypes/lab');
// The three reference sizes, plus common laptop and desktop sizes for the Buy states.
const VIEWPORTS = [[1280, 720], [1440, 900], [1920, 1080]];
const EXTRA_VIEWPORTS = [[1366, 768], [1680, 1050], [2000, 1075], [2000, 1118], [2560, 1440]];
// Desktop windows taller than 16:9 (nearly square, and taller than wide): every case runs there.
const TALL_VIEWPORTS = [[1440, 1200], [1600, 1600], [1800, 2000]];
// A 1440x900 window at browser zoom 67%, 125%, 150% and 200%: the page sees a smaller or larger
// CSS viewport at a matching device scale. At 200% it is phone-sized and gets the phone layout.
const ZOOM_VIEWPORTS = [0.67, 1.25, 1.5, 2].map(zoom => [Math.round(1440 / zoom), Math.round(900 / zoom), zoom, `1440x900@${Math.round(zoom * 100)}%`]);
const viewportName = viewport => viewport[3] || `${viewport[0]}x${viewport[1]}`;
// Touch devices (mobile emulation with touch on): iPads in landscape and portrait must fit with no
// page scroll, like the desktop; phones may scroll inside drawers but never sideways. Phones are
// played sideways (rulebook #shared-board): a small, a common and a large phone held sideways. Held
// upright, a phone shows only the prompt to turn it (the 'phone held upright' case).
const TABLET_VIEWPORTS = [[1024, 768], [1180, 820], [1366, 1024], [768, 1024], [820, 1180], [1024, 1366]];
const PHONE_VIEWPORTS = [[844, 390], [932, 430], [667, 375]];
const UPRIGHT_PHONE = [390, 844];
const isPhone = ([width, height]) => Math.min(width, height) < 600;
const TABLE_ID = 'a'.repeat(32);
const SHOTS = process.env.SHOTS;

function findChrome() {
  const candidates = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'];
  const playwright = path.join(os.homedir(), process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright');
  try {
    for (const dir of fs.readdirSync(playwright).filter(d => d.startsWith('chromium_headless_shell-')).sort().reverse())
      for (const sub of fs.readdirSync(path.join(playwright, dir))) candidates.push(path.join(playwright, dir, sub, 'chrome-headless-shell'));
  } catch { /* no Playwright browsers installed */ }
  return candidates.find(file => file && fs.existsSync(file));
}

// ---- Fixtures: real engine states, built headless exactly like the dialog suite does. ----
const source = fs.readFileSync(process.env.CHECK_ENGINE_APP || path.join(GAME_DIR, 'app.js'), 'utf8');
const adapterSource = fs.readFileSync(process.env.CHECK_ENGINE_ADAPTER || path.join(GAME_DIR, 'adapter.js'), 'utf8');
const FORMAT = source.match(/const SAVE_FORMAT_VERSION = (\d+);/)[1];
const SAVE_KEY = `galactic-reach-save-v${FORMAT}`;
const RULES = `galactic-reach/${FORMAT}.${source.match(/const RULES_REVISION = (\d+);/)[1]}`;
// Market cards ranked by how much text they print, so every market state is a worst case.
const MARKET = [...source.matchAll(/^ {4}(\w+): \{ code: '([NM]\d\d)', name: '([^']+)'.*?text: '((?:[^'\\]|\\.)*)'/gm)]
  .map(([, key, code, name, text]) => ({ key, code, weight: text.length + name.length * 2 }))
  .sort((a, b) => b.weight - a.weight);

function seeded(seed) { let v = seed >>> 0; return () => { v = (v * 1664525 + 1013904223) >>> 0; return v / 0x100000000; }; }
function freshEngine(seed = 1729) {
  const context = vm.createContext({});
  vm.runInContext(adapterSource + source, context);
  let engine; const factory = context.createGalacticAdapter;
  context.createGalacticAdapter = e => { engine = e; return factory(e); };
  const adapter = context.createGalacticReach({ headless: true, random: seeded(seed) });
  return { adapter, engine, state: engine.state };
}
const clone = value => JSON.parse(JSON.stringify(value));
let serial = 0;
const card = (key, extra = {}) => ({ key, id: `fit-${serial++}`, ...extra });

function operationsState(handKeys) {
  const { state } = freshEngine();
  Object.assign(state, { phase: 'operations', activePlayer: 0, turnStage: 'action', actionMode: null, actionCardId: null, pendingCombat: null });
  state.players[0].hand = handKeys.map(key => card(key, { starter: key === 'move' || key === 'construct' }));
  state.players[0].resources = { matter: 3, energy: 2, biomass: 4, data: 1 };
  return state;
}
// Your home world with two Fleets and an Explorer on it, so Move has units to choose.
function withFleet(state) {
  const [home] = Object.entries(state.planets).find(([, planet]) => planet.owner === 0 && planet.hasColony);
  state.fleets[home] = { ...(state.fleets[home] || {}), 0: { fleet: 2, explorer: 1, settler: 0 } };
  return state;
}
function buyState(marketKeys, resources = { matter: 4, energy: 4, biomass: 2, data: 1 }) {
  const state = operationsState([]);
  const me = state.players[0];
  Object.assign(state, { phase: 'buy', turnStage: 'buy' });
  me.passed = true; me.bought = 0;
  me.resources = { ...resources };
  me.resourceLimits = Object.fromEntries(Object.entries(me.resourceLimits).map(([r, v]) => [r, Math.max(v, me.resources[r])]));
  me.hand = [card('move', { starter: true })];
  me.discard = [card('construct', { starter: true }), card('move', { starter: true }), card('construct', { starter: true }), card('colonize')];
  me.inPlay = [card('move', { starter: true }), card('construct', { starter: true })];
  me.buyStartDiscardIds = me.discard.map(c => c.id); me.buyStartInPlayIds = me.inPlay.map(c => c.id);
  state.market = marketKeys.map(key => card(key));
  return state;
}
// Mid-game: thick piles with a face-up top card, and a comms feed with every kind of event.
function midGameState() {
  const state = operationsState(['move', 'construct', 'probe', 'construct', 'move']);
  const me = state.players[0];
  const pile = n => Array.from({ length: n }, (_, i) => card(MARKET[i % MARKET.length].key));
  me.deck = pile(14); me.discard = [...pile(9), card('construct', { starter: true, upgraded: true })]; me.inPlay = [card('colonize'), card('move', { starter: true })];
  const [a, b] = [state.players[0].name, state.players[1].name];
  state.round = 4;
  state.log = [`R4 · ${a} moved 2 Fleets to 3,-5.`, `R4 · ${b} built a Shipyard at 1,2.`, `R4 · ${a} converted Move for 1 Energy.`, `R4 · ${b} colonized 4,-2 and gained 3 Prestige.`,
    `R4 · ${a} attacked ${b} at 2,2; the battle destroyed 2 Fleets.`, `R4 · Controlled planets produced normally.`, `R3 · ${a} bought Prefab Yards for 5 Matter.`, `R3 · ${b} upgraded Move to level II.`,
    `R3 · ${a} traded 2 Biomass for 1 Data.`, `R3 · ${b} excavated a relic and gained 2 Prestige.`, `R3 · ${a} trashed a Construct.`, `R3 · ${b} passed.`, `R3 · All factions drew five cards.`, `R2 · Your neighbor this game is ${b}.`];
  return state;
}
// Pieces on every terrain: harvesters, shipyards and ship stacks of each faction on all four
// resource colours and on grey hexes, so bare owner-coloured glyphs can be checked for legibility.
function piecesState() {
  const state = midGameState();
  const byType = {};
  for (const [coord, planet] of Object.entries(state.planets)) if (['matter', 'energy', 'biomass', 'data'].includes(planet.type) && planet.owner == null && !planet.hasColony) (byType[planet.type] ||= []).push(coord);
  let seat = 0;
  for (const coords of Object.values(byType)) coords.slice(0, 4).forEach((coord, i) => {
    Object.assign(state.planets[coord], { owner: seat % 4, upgrade: i % 2 ? 'starbase' : 'harvester' });
    state.fleets[coord] = { [seat % 4]: { fleet: 2 + (i % 3), explorer: i % 2, settler: 1 } };
    seat++;
  });
  return state;
}
// Rules #military-deck: four military cards owned (two of one design), so the pile is thick.
function militaryState() {
  const state = piecesState();
  state.players[0].military = ['obeliskOfAnnihilation', 'aegisOfSilentArchitects', 'aegisOfSilentArchitects', 'cinderDrive'].map(key => card(key));
  state.players[0].cardsPurchased = 6;
  return state;
}
// Bank trades on the mat: 5 Matter to give and room for Data.
function matTradeState() {
  const state = operationsState(['move', 'construct']);
  state.players[0].resources = { matter: 5, energy: 2, biomass: 3, data: 1 };
  return state;
}
function combatState(stage, military = false) {
  const { adapter, engine, state } = freshEngine();
  state.activePlayer = 0; state.phase = 'operations'; state.turnStage = 'action';
  state.fleets = { '10,-10': { 0: { fleet: 3, explorer: 0, settler: 1 } }, '9,-10': { 1: { fleet: 2, explorer: 1, settler: 0 } } };
  state.players.forEach((p, id) => { p.hand = id === 0 ? [card('move', { starter: true })] : []; p.resources = { matter: 0, energy: 0, biomass: 0, data: 0 }; });
  if (military) for (const player of state.players.slice(0, 2)) player.military = Object.keys(engine.MILITARY_CARDS)
    .filter(key => !['concentratedFire', 'defensiveScreen'].includes(key)).flatMap(key => [card(key), card(key)]);
  const move = adapter.legalActions(0).find(x => x.type === 'move' && x.source === '10,-10' && x.destination === '9,-10');
  adapter.applyAction(0, move);
  if (stage !== 'escape') { engine.applyCombatAction(0, { type: 'combat_stay' }); engine.applyCombatAction(1, { type: 'combat_stay' }); }
  if (stage === 'damaged') { engine.applyCombatAction(0, { type: 'combat_tactic', tactic: 'defensiveScreen' }); engine.applyCombatAction(1, { type: 'combat_tactic', tactic: 'defensiveScreen' }); }
  return state;
}
function combatEscapeState() {
  const state = combatState('escape');
  state.players[0].resources.energy = 3;
  state.fleets['9,-10'][0].explorer = 3;
  state.pendingCombat.attackerPieces.push(...Array.from({length:3}, () => ({type:'explorer', hull:1, power:1, damage:0})));
  return state;
}

// A shared table mid-game: two people, two rivals, two-digit standings and a seat bar.
function sharedView(state) {
  state.round = 13;
  state.players.forEach((p, id) => { p.cardsPurchased = [11, 12, 9, 10][id]; });
  return { id: TABLE_ID, name: 'for all mankind', seat: 0, active: 0, seq: 476, rules_version: RULES, client_path: '/galactic-reach/',
    status: 'active', authority: 'server', ai_error: null, hints: {}, undo: { available: false },
    seats: [{ seat: 0, name: 'Stacked Pilot', you: true, human: true }, { seat: 1, name: 'Pilot 5J3FGA', human: true },
      { seat: 2, name: 'Violet Assembly' }, { seat: 3, name: 'Helios Compact' }], state };
}

// A hand of any size, mixing starters (with their conversion corner) and bought cards.
const fanHand = size => Array.from({ length: size }, (_, i) => ['move', 'construct', ...MARKET.filter(c => c.code.startsWith('N')).map(c => c.key)][i % 12]);
const longHand = ['move', 'construct', ...MARKET.filter(c => c.code.startsWith('N')).slice(0, 6).map(c => c.key)];
// A real market is three cards from each price row (rulebook #market-tiers). Four pages cycle every
// design through its row, heaviest text first, so page 1 is each row's worst case.
const { MARKET_TIERS, marketTier } = vm.runInContext(source + ';createGalacticReach({catalog:true})', vm.createContext({}));
const byTier = MARKET_TIERS.map(tier => MARKET.filter(c => marketTier(c.key) === tier.id));
const chunks = [0, 1, 2, 3].map(page => byTier.flatMap(row => [0, 1, 2].map(n => row[(page * 3 + n) % row.length].key)));

// Each case: a save to load, then optional page actions before measuring.
const CASES = [
  { name: 'operations, 5-card hand', save: operationsState(['move', 'construct', 'move', 'construct', 'move']), devices: true },
  { name: 'operations, 8-card hand', save: operationsState(longHand) },
  // The hand is a fan (rules #card-corners): every card shows both upper corners, for the smallest,
  // a typical and the largest hands, on desktop, tablet and phone.
  ...[1, 5, 10, 12].map(size => ({ name: `operations, fan of ${size}`, save: operationsState(fanHand(size)), expect: 'fan', devices: true })),
  { name: 'operations, raised hand card (long text)', save: operationsState(['move', 'construct', 'probe', 'construct', 'move']), focus: '#hand-row .game-card:nth-child(3) button' },
  { name: 'operations, 8-card hand raised', save: operationsState(longHand), focus: '#hand-row .game-card:nth-child(5) button' },
  // A chosen order shows a toast; it must not cover the hand or any control.
  { name: 'operations, order chosen (toast)', save: operationsState(['move', 'construct', 'probe', 'construct', 'move']), click: ['#hand-row .game-card:nth-child(5) [data-order-card]'] },
  { name: 'operations, Probe chosen, raised', save: operationsState(['move', 'construct', 'construct', 'move', 'probe']), click: ['#hand-row .game-card:nth-child(5) [data-order-mode="probe"]'], focus: '#hand-row .game-card:nth-child(5) [data-order-mode="excavate"]' },
  { name: 'operations, Excavate chosen, raised', save: operationsState(['move', 'probe', 'construct', 'construct', 'move']), click: ['#hand-row .game-card:nth-child(2) [data-order-mode="excavate"]'], focus: '#hand-row .game-card:nth-child(2) [data-order-mode="excavate"]' },
  { name: 'operations, 8-card hand, Probe raised', save: operationsState([...longHand.slice(0, 7), 'probe']), focus: '#hand-row .game-card:nth-child(8) [data-order-mode="excavate"]' },
  { name: 'operations, mid-game piles and comms', save: midGameState(), devices: true },
  { name: 'standings overview (keyboard focus)', save: midGameState(), focus: '#prestige-track [data-score-player="1"]' },
  // The comms log is a small card until it is opened; open, it shows the whole log in place.
  { name: 'comms log opened', save: midGameState(), click: ['#log-toggle'], devices: 'tablet' },
  // Phones: the Table drawer is the Prestige track (elsewhere the drawer button does nothing).
  { name: 'standings track (Table drawer on phones)', save: midGameState(), click: ['.phone-drawers [data-drawer="table"]'], devices: true },
  // The bank lies open at the table; choosing both sides fills its preview line.
  { name: 'bank panel, exchange chosen', save: midGameState(), click: ['#bank-give-biomass', '#bank-get-data'] },
  // The first and last hand cards raised: they rise over the map, clear of the bank and the piles.
  { name: 'operations, first hand card raised (bank open)', save: midGameState(), focus: '#hand-row .game-card:first-child button' },
  { name: 'operations, last hand card raised', save: midGameState(), focus: '#hand-row .game-card:last-child button' },
  { name: 'operations, pointed-at hand card opens whole', save: operationsState(['move', 'construct', 'probe', 'construct', 'move']), hover: '#hand-row .game-card:nth-child(3)', expect: 'inspect' },
  { name: 'operations, pointed-at last of 8 cards opens whole', save: operationsState(longHand), hover: '#hand-row .game-card:last-child', expect: 'inspect' },
  { name: 'operations, drag Move onto your units', save: withFleet(operationsState(['move', 'construct', 'move'])), drag: '#hand-row .game-card[data-order="move"]', expect: 'dragged', devices: 'tablet' },
  { name: 'operations, drag Construct onto a hex', save: operationsState(['construct', 'move']), drag: '#hand-row .game-card[data-order="construct"]', expect: 'built' },
  { name: 'operations, drag a card onto your reserves', save: operationsState(['construct', 'move']), drag: '#hand-row .game-card[data-order="construct"]', dropOn: '.resource-box.cf-drop-yield', expect: 'converted', devices: 'tablet' },
  // A raised card is mostly its name and buttons: picking it up by a button must work too.
  { name: 'operations, drag a card by its Convert button onto your reserves', save: operationsState(['construct', 'move']), drag: '#hand-row .game-card[data-order="construct"]', grab: '[data-resource-card]', dropOn: '.resource-box.cf-drop-yield', expect: 'converted' },
  { name: 'operations, drag Construct by its Use order button onto a hex', save: operationsState(['construct', 'move']), drag: '#hand-row .game-card[data-order="construct"]', grab: '[data-order-card]', expect: 'built' },
  // Use order aims the card exactly as starting a drag does; clicking a lit hex plays it there.
  // The reverse: pointing at a hex raises the hand card that can start an order there.
  { name: 'operations, pointing at a hex raises its playable card', save: operationsState(['construct', 'move']), playsHere: 'construct', devices: 'tablet' },
  { name: 'operations, Use order aims like a drag', save: operationsState(['construct', 'move']), click: ['#hand-row .game-card[data-order="construct"] [data-order-card]'], expect: 'aimed', devices: 'tablet' },
  { name: 'operations, click Convert with the mouse', save: operationsState(['construct', 'move']), tap: '#hand-row .game-card[data-order="construct"] [data-resource-card]', expect: 'converted' },
  { name: 'map pieces on every terrain', save: piecesState() },
  // Trading with the bank on the mat: drag (mouse, and touch on iPads), and tap then tap.
  { name: 'mat: drag Matter onto Data trades 4 for 1', save: matTradeState(), matTrade: { from: 'matter', to: 'data', how: 'drag', expect: { matter: -4, data: 1 } }, devices: 'tablet' },
  { name: 'mat: tap Matter, then Data', save: matTradeState(), matTrade: { from: 'matter', to: 'data', how: 'tap', expect: { matter: -4, data: 1 } } },
  // The market drawer (rulebook #shared-board): closed by default, the map taking its room; the
  // Market handle opens the side panel (the Supply drawer on phones); your Buy turn shows whole
  // cards over the map, and Smaller returns the side panel.
  { name: 'market closed (operations)', save: operationsState(['move', 'construct', 'move', 'construct', 'move']), marketView: 'closed', extraSizes: true, devices: true },
  { name: 'market side panel (operations)', save: operationsState(['move', 'construct', 'move', 'construct', 'move']), click: ['#market-handle', '.phone-drawers [data-drawer="supply"]'], marketView: 'side', extraSizes: true, devices: true },
  { name: 'buy, whole-card market', save: buyState(chunks[0], { matter: 8, energy: 8, biomass: 8, data: 8 }), marketView: 'full', buyVisible: true, extraSizes: true, devices: true },
  { name: 'buy, market shrunk to the side panel', save: buyState(chunks[0]), click: ['#market-size'], marketView: 'side', buyVisible: true },
  { name: 'operations, market panel (shaded)', save: operationsState(['move', 'construct']), click: ['#market-tab', '#market-handle'] },
  ...chunks.map((keys, i) => ({ name: `buy, market ${i + 1}/4 with upgrades`, save: buyState(keys), click: ['#market-tab'], buyVisible: true, extraSizes: i === 0 })),
  // Buy with an empty hand (everything converted or played): the market and Finish Buy must show.
  { name: 'buy, held 2:1 exchange card', save: (() => { const s=buyState(chunks[0]); s.players[0].hand=[card('exchangeProtocol')]; return s; })(), focus: '[data-order-card]' },
  { name: 'buy, 2:1 exchange resource dialog', save: (() => { const s=buyState(chunks[0]); s.players[0].hand=[card('clearingHouse')]; return s; })(), click: ['[data-order-card]'] },
  { name: 'buy, empty hand', save: (() => { const state = buyState(chunks[0]); state.players[0].hand = []; return state; })(), buyVisible: true, extraSizes: true, devices: true },
  // The real way there: convert the whole hand during Operations, and the table passes you to Buy.
  { name: 'buy, after converting the whole hand', save: operationsState(['move', 'construct', 'move', 'construct', 'move']), click: ['#convert-all-button'], buyVisible: true, extraSizes: true },
  { name: 'buy, upgrade chooser', save: buyState(chunks[0]), click: ['#market-tab', '[data-upgrade-offer="move"]'] },
  { name: 'buy, trash dialog', save: buyState(chunks[0]), click: ['#market-tab', '#open-trash'] },
  { name: 'buy, raised market card (bottom row)', save: buyState(chunks[2], { matter: 8, energy: 8, biomass: 8, data: 8 }), focus: '#market-row .game-card:not(:disabled)', focusLast: true },
  // Trade pulls out from the left edge; open, it may lie over the map's edge, like an opened comms card.
  { name: 'trade panel', save: operationsState(['move']), click: ['#open-trade'], devices: true },
  { name: 'game menu', save: operationsState(['move']), click: ['#table-menu-button'], devices: true },
  { name: 'game menu, playtest changes', save: operationsState(['move']), click: ['#table-menu-button', '#playtest-changes summary'] },
  // Rules #military-deck: the military deck is a pile beside In play; it opens like the others.
  { name: 'military deck pile', save: militaryState(), click: ['#military-button'], devices: 'tablet' },
  // Phones: the Table drawer holds the race and the standings table.
  { name: 'standings with units and worlds (Table drawer on phones)', save: piecesState(), click: ['.phone-drawers [data-drawer="table"]'], devices: true },
  { name: 'relics tab', save: operationsState(['move']), click: ['#relics-tab'] },
  { name: 'battle: escape choice', save: combatState('escape'), devices: true },
  { name: 'battle: paid Explorer escapes', save: combatEscapeState(), devices: true },
  { name: 'battle: tactic choice', save: combatState('tactic'), devices: true },
  { name: 'battle: selected tactic', save: combatState('tactic'), click: ['[data-combat-tactic="concentratedFire"]'], devices: true },
  { name: 'battle: damaged ships', save: combatState('damaged'), devices: true },
  { name: 'battle: full public military decks', save: combatState('tactic', true), devices: true },
  { name: 'saved table bar', save: operationsState(['move', 'construct', 'move', 'construct', 'move']), table: true },
  { name: 'shared table, hand', shared: sharedView(operationsState(['move', 'construct', 'probe', 'construct', 'move'])), devices: true },
  { name: 'shared table, market', shared: sharedView(buyState(chunks[1])), click: ['#market-tab'] },
  { name: 'waiting room', lobby: true },
  // Phones held sideways (rulebook #shared-board): the drawers open from the left edge as sheets,
  // a tapped hand card opens whole over the map, Learn to play's note has its own column, and the
  // map has most of the screen while the market is closed.
  { name: 'mat drawer (phones)', save: midGameState(), click: ['.phone-drawers [data-drawer="mat"]'], devices: 'phone' },
  { name: 'comms drawer (phones)', save: midGameState(), click: ['.phone-drawers [data-drawer="comms"]'], devices: 'phone' },
  { name: 'tapped hand card opens whole (phones)', save: operationsState(['move', 'construct', 'probe', 'construct', 'move']), phoneTap: '#hand-row .game-card:nth-child(3)', devices: 'phone' },
  // Learn to play keeps the step's card in the fan (its lit corner does the step), so neither the
  // opened card nor the label lies over the mat row the step lights.
  { name: 'Learn to play, first step (phones)', tutorial: true, cueTap: true, devices: 'phone' },
  // A phone joined to a shared table as "my hand" or as "the whole game" (rulebook #phone-pairing):
  // held sideways both show the map and the hand's fan, with no drawer over them.
  ...['hand', 'game'].map(view => ({ name: `shared table, this device: ${view === 'hand' ? 'my hand' : 'the whole game'} (phones)`, shared: sharedView(operationsState(['move', 'construct', 'probe', 'construct', 'move'])), storage: { [`heirs-device:${TABLE_ID}`]: view }, deviceView: view, devices: 'phone' })),
  { name: 'map share, market closed, guidance off (phones)', save: operationsState(['move', 'construct', 'move', 'construct', 'move']), mapShare: 0.6, guidanceOff: true, devices: 'phone' },
];
// Held upright, a phone shows only the prompt to turn it; turning it removes the prompt at once with
// the game as it was. A narrow desktop window and the waiting room never show it.
const UPRIGHT_CASES = [
  { name: 'phone held upright: turn it sideways', save: operationsState(['move', 'construct', 'probe', 'construct', 'move']), upright: true, device: true },
  { name: 'narrow desktop window, upright (no turn prompt)', save: operationsState(['move', 'construct', 'move', 'construct', 'move']) },
  { name: 'waiting room on a phone held upright', lobby: true, device: true },
];

// ---- A tiny static server with just enough API for the table bar and waiting room. ----
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const LAB_API = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/viewport-lab-api.json'), 'utf8'));
let tableSave = null, sharedTable = null, lastSlack = { px: 99 };
function serve(request, response) {
  const url = new URL(request.url, 'http://local');
  const json = (body, status = 200) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(body)); };
  if (url.pathname === `/api/tables/${TABLE_ID}`) return json({ id: TABLE_ID, name: 'Fit check table', owner_id: 'fit', revision: 1, rules_version: RULES, save: tableSave, lobby: null, settings: {}, shared_url: null });
  if (url.pathname.startsWith('/api/tables/') && url.pathname.endsWith('/lobby')) return json(LAB_API.lobby);
  if (url.pathname === `/api/shared/${TABLE_ID}`) return json(sharedTable);
  if (url.pathname === `/api/shared/${TABLE_ID}/stream`) { response.writeHead(200, { 'content-type': 'text/event-stream' }); return response.write(': open\n\n'); }
  if (url.pathname.startsWith('/api/')) return Object.hasOwn(LAB_API, url.pathname) ? json(LAB_API[url.pathname]) : json({ error: 'not in fixture' }, 404);
  const [dir, rel] = url.pathname.startsWith('/galactic-reach/') ? [GAME_DIR, url.pathname.slice('/galactic-reach/'.length) || 'index.html']
    : [LAB_DIR, url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/(lab\/)?/, '')];
  const file = path.join(dir, rel);
  if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404); return response.end(); }
  response.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  if (file === path.join(GAME_DIR, 'app.js')) return response.end(source);
  if (file === path.join(GAME_DIR, 'adapter.js')) return response.end(adapterSource);
  fs.createReadStream(file).pipe(response);
}

// ---- Chrome DevTools protocol over Node's WebSocket. ----
async function launch(chrome) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gr-fit-'));
  const proc = spawn(chrome, ['--headless', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  let port;
  for (let i = 0; i < 150 && !port; i++) {
    await new Promise(r => setTimeout(r, 100));
    try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch { /* starting */ }
  }
  if (!port) throw new Error('Chrome did not start');
  const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
  let id = 0; const pending = new Map(); const events = [];
  ws.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); } else events.forEach(listener => listener(message));
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, m => m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const errors = [];
  events.push(m => { if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); });
  await send('Page.enable'); await send('Runtime.enable');
  const navigate = async url => {
    const loaded = new Promise(resolve => { const l = m => { if (m.method === 'Page.loadEventFired') { events.splice(events.indexOf(l), 1); resolve(); } }; events.push(l); });
    await send('Page.navigate', { url }); await loaded;
  };
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  return { send, navigate, evaluate, errors, close: () => { ws.close(); proc.kill(); fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } };
}

// Runs in the page: everything a player needs must be inside the viewport and unclipped.
const MEASURE = `(() => {
  const W = innerWidth, H = innerHeight, problems = [];
  const label = e => (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/).join('.') : e.tagName.toLowerCase()) + (e.textContent.trim() ? ' "' + e.textContent.trim().replace(/\\s+/g, ' ').slice(0, 40) + '"' : '');
  const shown = e => e.checkVisibility({ visibilityProperty: true, opacityProperty: false });
  const doc = document.scrollingElement;
  const phone = window.__fitMode === 'phone';
  // A phone held sideways (rulebook #shared-board) is one screen like the desktop: only its drawers
  // and the map scroll, and every control is on screen.
  const sideways = phone && W > H;
  if (((!phone || sideways) && doc.scrollHeight > H + 1) || doc.scrollWidth > W + 1) problems.push('page scrolls: ' + doc.scrollWidth + 'x' + doc.scrollHeight);
  // Only a phone held upright shows the prompt to turn it (phone.js): never a tablet or a desktop window.
  if (document.querySelector('#rotate-prompt')?.checkVisibility()) problems.push('the turn-sideways prompt shows');
  // Containers allowed to scroll their own reference content.
  const scrollers = '#game-log, .playtest-changes, .combat-history, .discard-scroll, .pile-dialog, #rules-dialog, #map-key-dialog, #relic-catalog-dialog, .sector-popover, .chain-details, .board-stage.map-zoomed .board-map-region'
    + (sideways ? ', .board-map-region, #market-panel, #relics-panel, .resource-panel, .board-shared, .prestige-track, .trade-panel, .phase-stepper, body.menu-open .topbar, .phone-card-sheet .game-card, .card-table-battle .combat-card-row'
      : phone ? ', .board-map-region, .console, .resource-panel, .board-shared, .phase-stepper, #hand-panel .hand-tools, .trade-panel' : '');
  if (sideways) {
    // Finger-sized controls: the rail, the map tools, the turn's buttons, an opened card's corners,
    // the supply's tabs and a battle's buttons are at least 44 px each way; each hand card shows a
    // strip at least that wide.
    for (const e of document.querySelectorAll('.phone-drawers button, #open-trade, #table-menu-button, .map-tools .button, #hand-panel .hand-tools .button, .phone-card-close, .phone-card-sheet .corner-button, body[data-drawer="supply"] .console-tab, .combat-options .button')) {
      if (!shown(e)) continue;
      const r = e.getBoundingClientRect();
      if (r.width > 1 && (r.width < 43.5 || r.height < 43.5)) problems.push('tap target under 44 px: ' + label(e) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    }
    // (A hand too big for that scrolls sideways: the cards in view are judged.)
    const strip = document.querySelector('#hand-row')?.getBoundingClientRect();
    const hand = [...document.querySelectorAll('#hand-row > .game-card')].filter(card => { const r = card.getBoundingClientRect(); return shown(card) && r.left >= strip.left - 1 && r.left < strip.right - 2; });
    hand.forEach((card, i) => { const r = card.getBoundingClientRect(), next = hand[i + 1]?.getBoundingClientRect(); const strip = next && next.left > r.left ? Math.min(r.width, next.left - r.left) : r.width;
      if (strip < 43.5 || r.height < 43.5) problems.push('hand card under 44 px: ' + label(card).slice(0, 40) + ' ' + Math.round(strip) + 'x' + Math.round(r.height)); });
    // A note has one place, the column at the right edge: never over the map or an opened card.
    const note = document.querySelector('#gr-coach:popover-open:not(.in-dialog)');
    if (note && getComputedStyle(note).visibility !== 'hidden') {
      const n = note.getBoundingClientRect(), overlaps = r => r.width > 1 && r.left < n.right - 1 && r.right > n.left + 1 && r.top < n.bottom - 1 && r.bottom > n.top + 1;
      if (n.right > W + 1 || n.bottom > H + 1 || n.top < -1) problems.push('guidance note outside viewport: ' + [n.left, n.top, n.right, n.bottom].map(Math.round));
      if (overlaps(document.querySelector('.board-map-region').getBoundingClientRect())) problems.push('guidance note lies over the map');
      const sheet = document.querySelector('.phone-card-sheet:not([hidden]) .game-card');
      if (sheet && overlaps(sheet.getBoundingClientRect())) problems.push('guidance note lies over the opened card');
      for (const e of document.querySelectorAll('#hand-panel .hand-tools .button, .map-tools .button')) if (shown(e) && overlaps(e.getBoundingClientRect())) { problems.push('guidance note covers ' + label(e)); break; }
    }
  }
  const modal = document.querySelector('dialog[open], body.menu-open');
  const scope = modal || document;
  // Hand cards are held as card tops that clip on purpose; a raised (pointed-at or focused)
  // card is checked like any other. Each top must still show its name and gain/cost row.
  const FOLDED = ':is(#hand-row, .market-cards, .relic-row) .game-card:not(:hover):not(:focus):not(:focus-within)';
  // A phone held sideways shows only card tops in its hand (a tap opens a card whole in its own sheet).
  const folded = e => e.closest(FOLDED) || (sideways && e.closest('#hand-row'));
  // Card tops exist in the table layout; a phone shows whole cards in its drawers.
  for (const top of phone ? [] : document.querySelectorAll(FOLDED)) {
    if (!shown(top)) continue;
    const t = top.getBoundingClientRect();
    if (t.top < -1 || t.bottom > H + 1 || t.left < -1 || t.right > W + 1) problems.push('card top outside viewport: ' + label(top));
    // A top shows its one-line headline, its effect in icons, or its effect, whichever it shows.
    // A card's summary: its corner symbols where it has them (rules #card-corners), else its one-line effect.
    const summary = [top.querySelector('.card-symbols'), top.querySelector('.card-headline'), top.querySelector('.card-icons'), top.querySelector('.card-effect')].find(e => e && e.getClientRects().length) || top.querySelector('.card-symbols') || top.querySelector('.card-headline') || top.querySelector('.card-effect');
    // Overlapping tops must leave each card's gain badge visible, not under its neighbour.
    // An open Sector Scan (a popover over the map) or Trade panel may cover card tops while it is open.
    if (!document.querySelector(':is(dialog[open], body.menu-open, .sector-popover:popover-open, .trade-drawer.open, :is(#hand-row, .market-cards) .game-card:is(:hover, :focus, :focus-within))')) for (const chip of top.querySelectorAll('.card-footer .resource-chip')) {
      const c = chip.getBoundingClientRect(), hit = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
      if (!hit || !top.contains(hit)) { problems.push('gain badge covered in ' + label(top)); break; }
    }
    // A resting hand card shows only its symbols (rules #card-corners): its name is for screen readers then.
    const symbols = top.querySelector(':scope > .card-symbols'), nameEl = top.querySelector('.card-name');
    const nameShown = !(symbols && symbols.getClientRects().length && nameEl && getComputedStyle(nameEl).clipPath.includes('inset(50%)'));
    // Only level I starters print a gain badge; an empty footer has nothing to show.
    const footer = top.querySelector('.card-footer');
    // In the hand, a top's text and badges must end before its right-hand neighbour begins.
    const next = top.closest('#hand-row') && top.nextElementSibling;
    if (next && !document.querySelector('#hand-row .game-card:is(:hover, :focus, :focus-within)')) {
      const limit = next.getBoundingClientRect().left;
      const parts = [nameShown ? top.querySelector('.card-name') : null, summary, ...top.querySelectorAll('.card-footer .resource-chip, .card-footer .level-badge')].filter(Boolean);
      // The hand is a fan of turned cards (rules #card-corners): test what lies on top of each part,
      // not bounding boxes, which a turned card overstates.
      const under = parts.find(part => { const t = part.getBoundingClientRect(); if (!(t.width > 0)) return false;
        return [t.left + 2, t.left + t.width / 2, t.right - 2].some(x => { const hit = document.elementFromPoint(x, t.top + t.height / 2)?.closest('#hand-row > .game-card'); return hit && hit !== top; }); });
      if (under) problems.push('hand text under the next card: ' + label(under) + ' in ' + label(top));
    }
    for (const part of [nameShown ? top.querySelector('.card-name') : null, footer?.textContent.trim() || footer?.querySelector('.resource-chip') ? footer : null, summary].filter(Boolean)) {
      const p = part.getBoundingClientRect();
      if (p.height < 4 || p.top < t.top - 1 || p.bottom > t.bottom + 1) { problems.push('card top hides ' + label(part) + ' in ' + label(top)); break; }
    }
  }
  for (const e of scope.querySelectorAll('*')) {
    if (!shown(e) || e.closest(scrollers) || folded(e) || e.closest('.cf-ghost, .cf-floater')) continue;
    const r = e.getBoundingClientRect();
    if (r.width <= 1 && r.height <= 1) continue; // empty or visually hidden (sr-only)
    const clips = /(auto|scroll|hidden|clip)/.test(getComputedStyle(e).overflowY + getComputedStyle(e).overflowX);
    // Visually hidden text (clip-path: inset(50%)) is read by screen readers, not shown.
    // A phone truncates its one-line turn strip on purpose (the full text is in the menu).
    const phoneBattleScroll = phone && e.matches('.combat-dialog.card-table-battle');
    if (clips && !(phone && getComputedStyle(e).textOverflow === 'ellipsis') && ((!phoneBattleScroll && e.scrollHeight > e.clientHeight + 2) || e.scrollWidth > e.clientWidth + 2) && !getComputedStyle(e).clipPath.includes('inset(50%)') && !e.matches('.board-map-region, .galaxy-board, .score-name, .card-type, .card-art, input, textarea') && !e.closest('[aria-hidden="true"]'))
      problems.push('clipped content: ' + label(e) + ' ' + e.scrollWidth + 'x' + e.scrollHeight + ' in ' + e.clientWidth + 'x' + e.clientHeight);
    if (e.matches('button, a[href], select, input, textarea, .game-card, .score-card, .resource-box, .hex, dialog[open], .lobby-seat') && !e.closest('.sr-only, .skip-link, .skip')) {
      if (r.left < -1 || r.right > W + 1 || ((!phone || sideways) && (r.top < -1 || r.bottom > H + 1))) problems.push('outside viewport: ' + label(e) + ' [' + [r.left, r.top, r.right, r.bottom].map(Math.round) + ']');
    }
    // Cards may not clip their own text (buttons hide overflow inside their box).
    if (e.matches('.game-card, .military-card, .combat-tactic, .trade-offer, .score-card, .resource-box, .combat-options .button') && !e.matches('.score-card:is(:hover, :focus-within)') && e.scrollHeight > e.clientHeight + 2)
      problems.push('card text cut: ' + label(e) + ' ' + e.scrollHeight + ' > ' + e.clientHeight);
    // Overflow above a box (centred button content) is not counted by scrollHeight.
    if (e.matches('.game-card, .score-card, .resource-box')) for (const child of e.children) {
      const c = child.getBoundingClientRect();
      if (child.textContent.trim() && shown(child) && child.getAttribute('aria-hidden') !== 'true' && !getComputedStyle(child).clipPath.includes('inset(50%)') && c.height < 4) { problems.push('card line squeezed: ' + label(e) + ' (' + label(child) + ')'); break; }
      if (c.height && !child.matches('.score-overview') && (c.top < r.top - 1 || c.bottom > r.bottom + 1)) { problems.push('card content escapes: ' + label(e) + ' (' + label(child) + ')'); break; }
    }
  }
  // Every button on a raised card must be reachable: nothing may lie over its centre.
  // (A phone opens a tapped card whole in its own sheet instead: its hand cards do not rise.)
  for (const button of document.querySelectorAll(':is(#hand-row, .market-cards) .game-card:is(:hover, :focus, :focus-within) :is(.card-buttons .button, .corner-button)')) {
    if (!shown(button) || modal || sideways) continue;
    const b = button.getBoundingClientRect(), hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    if (!hit || !button.contains(hit)) problems.push('raised card button covered: ' + label(button) + ' by ' + (hit ? label(hit) : 'nothing'));
  }
  // A raised card may lie over the map and over cards in its own hand or supply, never over
  // another control (the bank, the piles, the turn's buttons, standings or menus).
  for (const raised of document.querySelectorAll(':is(#hand-row, .market-cards, .relic-row) .game-card:is(:hover, :focus, :focus-within)')) {
    if (modal || sideways) break;
    const home = raised.closest('#hand-row, #market-panel, #relics-panel'), own = raised.closest('#market-panel, #relics-panel') ? '#market-panel, #relics-panel' : '#hand-row';
    const r = raised.getBoundingClientRect();
    const under = [...document.querySelectorAll('button, a[href], select, input, textarea, summary, .game-card, .score-card, .resource-box')]
      .find(e => !raised.contains(e) && !e.closest(own) && !e.closest('.hex') && home && shown(e) && (() => { const c = e.getBoundingClientRect(); return c.width > 1 && c.height > 1 && c.left < r.right - 1 && c.right > r.left + 1 && c.top < r.bottom - 1 && c.bottom > r.top + 1; })());
    if (under) problems.push('raised card ' + label(raised).slice(0, 60) + ' overlaps ' + label(under));
  }
  // A guidance note (guide.js) may lie over the map, beside what it describes: it must be wholly
  // on screen, never cover the element it points at, and point at it with its arrow.
  for (const note of document.querySelectorAll('#gr-coach')) {
    const style = getComputedStyle(note);
    if (note.hidden || style.display === 'none' || style.visibility === 'hidden' || note.closest('dialog')) continue;
    const n = note.getBoundingClientRect();
    if (!phone && (n.left < -1 || n.top < -1 || n.right > W + 1 || n.bottom > H + 1)) problems.push('guidance note outside viewport: ' + [n.left, n.top, n.right, n.bottom].map(Math.round));
    const target = document.querySelector('.gr-coach-target');
    if (target && !phone) {
      const t = target.getBoundingClientRect();
      const overlap = Math.max(0, Math.min(n.right, t.right) - Math.max(n.left, t.left)) * Math.max(0, Math.min(n.bottom, t.bottom) - Math.max(n.top, t.top));
      if (overlap > 0.15 * t.width * t.height) problems.push('guidance note covers its own target: ' + label(target));
      const pointer = document.querySelector('.gr-coach-pointer:not([hidden])');
      const textual = [...document.querySelectorAll('.game-card, .panel, #fleet-glance, .log-panel, .relic-row, .resource-box, #prestige-track, .phase-stepper, .pile-stats > button, #map-legend-corner, .board-heading, .console-tab, #board-primary, #open-trade, #convert-all-button')]
        .filter(e => shown(e) && !e.contains(target) && !target.contains(e) && !e.closest('#gr-coach'))
        .find(e => { const r = e.getBoundingClientRect(); return Math.max(0, Math.min(n.right, r.right) - Math.max(n.left, r.left)) * Math.max(0, Math.min(n.bottom, r.bottom) - Math.max(n.top, r.top)) > 0.08 * n.width * n.height; });
      // While a card is being dragged, or a Sector Scan offers its choices, the table is crowded with
      // lit hexes and that panel: the note stays beside its target and may overlap other text briefly.
      const transient = document.body.classList.contains('cf-drag-active') || document.querySelector('#sector-popover:popover-open');
      if (textual && !transient) problems.push('guidance note lies over other text: ' + label(textual));
      if (!['top', 'bottom', 'left', 'right'].includes(note.dataset.side) && !pointer) problems.push('guidance note does not point at its target: ' + label(target));
    }
  }
  // A toast may lie over reference text, never over a card, a control or the map.
  for (const toast of document.querySelectorAll('.toast')) {
    const t = toast.getBoundingClientRect();
    const under = [...document.querySelectorAll('button, a[href], select, .game-card, .resource-box, .score-card, .hex')]
      .find(e => !toast.contains(e) && shown(e) && (() => { const r = e.getBoundingClientRect(); return r.width > 1 && r.left < t.right - 1 && r.right > t.left + 1 && r.top < t.bottom - 1 && r.bottom > t.top + 1; })());
    if (under) problems.push('toast covers ' + label(under));
  }
  if (!phone && !modal && !document.querySelector(':is(#hand-row, .market-cards) .game-card:is(:hover, :focus, :focus-within)')) for (const hex of document.querySelectorAll('.hex')) {
    // The centre and both side edges of every hex must be clickable.
    const r = hex.getBoundingClientRect(), y = r.top + r.height / 2;
    const blocked = [0.06, 0.5, 0.94].map(f => [r.left + r.width * f, y]).find(([x]) => { const hit = document.elementFromPoint(x, y); return !hit || !hex.contains(hit) && !hit.closest('.sector-popover, .log-panel.open, .trade-drawer.open, #gr-coach, .gr-coach-pointer, .gr-stage, .market-full :is(.market-sheet, #market-panel, #upgrade-group, .market-handles)'); });
    if (blocked) { const hit = document.elementFromPoint(...blocked); problems.push('hex covered at ' + Math.round(blocked[0]) + ',' + Math.round(y) + ' by ' + (hit ? label(hit) : 'nothing')); break; }
  }
  // The map fills the space left to it. On a landscape table it reaches between the left-hand
  // panels, so it must be snug: some hex lies within a few pixels of a panel or of its region's
  // edge (a map that could still grow fails). Elsewhere it fills at least 85% of its region.
  const region = document.querySelector('.board-map-region'), board = document.querySelector('#galaxy-board');
  if (!phone && region && board && shown(board) && !document.querySelector('.board-stage.map-zoomed')) {
    const r = region.getBoundingClientRect(), b = board.getBoundingClientRect(), limit = Math.min(r.width, r.height * 1.0543);
    // An open comms log lies over the map, which keeps the size it has beside the closed card, so
    // that state is not measured.
    if (matchMedia('(orientation: landscape)').matches) {
      if (!document.querySelector('.log-panel.open')) {
        const hexes = [...board.querySelectorAll('.hex')].map(hex => hex.getBoundingClientRect());
        const panels = [...document.querySelectorAll('#prestige-track, .standings-stats, .phase-stepper, .log-panel, .map-tools, #map-legend-corner, #hand-row, .pile-stats > button[id], #resource-grid, #hand-panel .hand-tools > :not([hidden]), .table-menu-button, #market-handles')].filter(shown);
        const apart = (h, o) => Math.max(o.left - h.right, h.left - o.right, o.top - h.bottom, h.top - o.bottom, 0);
        const gaps = [['region left', Math.min(...hexes.map(h => h.left)) - r.left], ['region top', Math.min(...hexes.map(h => h.top)) - r.top], ['region bottom', r.bottom - Math.max(...hexes.map(h => h.bottom))],
          ...panels.map(e => { const o = e.getBoundingClientRect(); return [label(e).slice(0, 40), Math.min(...hexes.map(h => apart(h, o)))]; })];
        // The fit keeps a 6-unit gap and searches sizes in 1% steps (and a few heights), so "snug"
        // allows that gap, two steps and a few pixels.
        const zoomNow = Number(document.documentElement.style.getPropertyValue('--table-zoom')) || 1;
        const [near, snug] = gaps.reduce((a, g) => g[1] < a[1] ? g : a), slack = 6 * zoomNow + 0.02 * b.width + 6;
        if (!(snug <= slack)) problems.push('map not snug: ' + Math.round(snug) + 'px from the nearest panel or edge, ' + near + ' (allowed ' + Math.round(slack) + 'px)' + ' ' + JSON.stringify(gaps.map(g => [g[0].slice(0, 18), Math.round(g[1])])) + ' region ' + [r.left, r.top, r.width, r.height].map(Math.round) + ' board ' + [b.left, b.top, b.width, b.height].map(Math.round));
      }
    } else if (b.width < 0.85 * limit) problems.push('map too small: ' + Math.round(b.width) + 'px of a ' + Math.round(limit) + 'px space');
  }
  // No wasted felt on a wide desktop table: the largest rectangle of table not covered by any piece
  // or hex stays under 4% of the window (measured on an 8px grid).
  // Only the table during a game is measured (not a waiting room, nor a shared table's top bar).
  // With the market drawer closed (rulebook #shared-board) the map is limited by the window's
  // height, so the closed market's room shows as felt beside the centred map: that state alone is
  // not measured (at 1920x1080 an empty 568x736 area, 20% of the window).
  const tableArea = document.querySelector('.app-shell')?.getBoundingClientRect();
  const marketClosed = document.documentElement.classList.contains('market-drawer') && document.documentElement.classList.contains('market-closed');
  if (!phone && !modal && !marketClosed && tableArea?.height && document.querySelector('#galaxy-board .hex') && [1920, 2000].includes(innerWidth) && [1080, 1075].includes(innerHeight) && !document.querySelector('.game-card:is(:hover, :focus, :focus-within), .log-panel.open, .board-stage.map-zoomed')) {
    const pieces = [...document.querySelectorAll('.hex, #hand-row, #prestige-track, .standings-stats, .phase-stepper, .log-panel, #map-legend-corner, .map-tools > :not([hidden]), .relic-row > *, #relics-panel > .section-intro, #market-row > .game-card, #upgrade-market > .game-card, #resource-grid, #hand-row > .game-card, .pile-stats > button, #hand-panel .hand-tools > :not([hidden]), .table-menu-button, .toast, .market-full .market-sheet')].filter(shown).map(e => e.getBoundingClientRect()).filter(r => r.width > 1 && r.height > 1);
    const cell = 8, cols = Math.ceil(innerWidth / cell), rows = Math.ceil(innerHeight / cell), heights = new Array(cols).fill(0);
    const covered = new Uint8Array(cols * rows);
    // Everything outside the table area counts as covered.
    pieces.push(...[[0, 0, innerWidth, tableArea.top], [0, tableArea.bottom, innerWidth, innerHeight], [0, 0, tableArea.left, innerHeight], [tableArea.right, 0, innerWidth, innerHeight]].map(([left, top, right, bottom]) => ({ left, top, right, bottom })));
    for (const r of pieces) for (let y = Math.max(0, Math.floor(r.top / cell)); y < Math.min(rows, Math.ceil(r.bottom / cell)); y++) for (let x = Math.max(0, Math.floor(r.left / cell)); x < Math.min(cols, Math.ceil(r.right / cell)); x++) covered[y * cols + x] = 1;
    let best = 0, at = null;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) heights[x] = covered[y * cols + x] ? 0 : heights[x] + 1;
      const stack = [];
      for (let x = 0; x <= cols; x++) {
        const h = x < cols ? heights[x] : 0;
        while (stack.length && heights[stack.at(-1)] >= h) {
          const top = stack.pop(), width = stack.length ? x - stack.at(-1) - 1 : x, area = heights[top] * width;
          if (area > best) { best = area; at = [(stack.length ? stack.at(-1) + 1 : 0) * cell, (y - heights[top] + 1) * cell, width * cell, heights[top] * cell]; }
        }
        stack.push(x);
      }
    }
    const share = best * cell * cell / (innerWidth * innerHeight);
    if (share > 0.04) problems.push('wasted felt: an empty ' + at[2] + 'x' + at[3] + ' rectangle at ' + at[0] + ',' + at[1] + ' (' + (share * 100).toFixed(1) + '% of the window)');
  }
  // Supply pieces never lie on one another (a raised or open piece may).
  if (!phone && !modal && !document.querySelector('.game-card:is(:hover, :focus, :focus-within)')) {
    const pieces = [...document.querySelectorAll('#upgrade-market, #open-trash, #market-row > .game-card, #relics-panel > .section-intro, .relic-row, .phase-stepper, .board-toolbar, .console-nav, #hand-panel .hand-tools, .resource-grid, .map-legend-corner, .prestige-track, .log-panel')].filter(shown);
    const box = e => e.getBoundingClientRect();
    outer: for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i], c = pieces[j];
      if (a.contains(c) || c.contains(a) || a.matches('.log-panel.open') || c.matches('.log-panel.open')) continue;
      const p = box(a), q = box(c);
      if (p.width > 1 && q.width > 1 && p.left < q.right - 2 && p.right > q.left + 2 && p.top < q.bottom - 2 && p.bottom > q.top + 2) { problems.push('pieces overlap: ' + label(a) + ' and ' + label(c)); break outer; }
    }
  }
  // Spare height in the tightest card: how far wider fonts can push before text is cut.
  const natural = document.createElement('style');
  natural.textContent = '.game-card > * { flex-grow: 0 !important; margin-bottom: 0 !important; }';
  document.head.append(natural);
  let slack = { px: 99, card: '' };
  for (const card of [...scope.querySelectorAll('.game-card')].filter(card => shown(card) && !folded(card))) {
    const last = [...card.children].filter(shown).at(-1);
    const pad = parseFloat(getComputedStyle(card).paddingBottom) + parseFloat(getComputedStyle(card).borderBottomWidth);
    const px = last ? Math.round(card.getBoundingClientRect().bottom - pad - last.getBoundingClientRect().bottom) : 99;
    if (px < slack.px) slack = { px, card: card.querySelector('.card-name')?.textContent || '' };
  }
  natural.remove();
  return { problems: problems.slice(0, 12), slack };
})()`;

async function runCase(browser, origin, testCase, viewport) {
  const [width, height, scale = 1] = viewport;
  const touch = testCase.device || false;
  // The screen is the window's size: a phone's screen is phone-sized, a tablet's is not (phone.js).
  await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: touch, screenWidth: width, screenHeight: height });
  await browser.send('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: touch ? 5 : 1 });
  // Measure a still table: your hand's turn pulse (and other motion) rests under reduced motion.
  await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  if (testCase.lobby) {
    await browser.navigate(`${origin}/?game=galactic-reach#lobby/${TABLE_ID}`);
  } else {
    await browser.navigate(`${origin}/galactic-reach/rulebook.html`);
    await browser.evaluate(`localStorage.clear(); ${process.env.CHECK_BACKGROUND === 'stars' ? "localStorage.setItem('galactic-reach-background','stars');" : ''} ${testCase.guidanceOff ? "localStorage.setItem('galactic-reach-guide-v1', JSON.stringify({ enabled: false, seen: {} }));" : ''} ${Object.entries(testCase.storage || {}).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join(' ')} ${testCase.table || testCase.tutorial ? '' : `localStorage.setItem(${JSON.stringify(SAVE_KEY)}, ${JSON.stringify(JSON.stringify(testCase.save))});`} true`);
    tableSave = testCase.table ? { state: clone(testCase.save), turnHistory: { pending: null, undo: null } } : null;
    sharedTable = testCase.shared || null;
    await browser.navigate(`${origin}/galactic-reach/${testCase.table ? `?table=${TABLE_ID}` : testCase.shared ? `?shared=${TABLE_ID}` : testCase.tutorial ? '?tutorial=1' : ''}`);
  }
  // A shared or saved table loads its seats after the page, then fits again: let it settle.
  await browser.evaluate(`new Promise(r => setTimeout(r, ${testCase.shared || testCase.table ? 900 : testCase.tutorial ? 1500 : 400}))`);
  // Web fonts change the panels' sizes, and the table re-fits when they are ready: measure it after.
  await browser.evaluate('(document.fonts ? document.fonts.ready : Promise.resolve()).then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))');
  for (const selector of testCase.click || []) {
    const ok = await browser.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e || e.disabled) return false; e.click(); return true; })()`);
    if (!ok) { lastSlack = { px: 99 }; return [`could not click ${selector}`]; }
    await browser.evaluate('new Promise(r => setTimeout(r, 150))');
  }
  if (testCase.focus) {
    const ok = await browser.evaluate(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(testCase.focus)})].at(${testCase.focusLast ? -1 : 0}); if (!e) return false; e.focus(); return document.activeElement === e; })()`);
    if (!ok) return [`could not focus ${testCase.focus}`];
    await browser.evaluate('new Promise(r => setTimeout(r, 250))');
  }
  // On a touch device every press, move and release is a real touch sequence (there is no hover).
  let touching = false;
  const mouse = (type, x, y) => {
    if (!testCase.device) return browser.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1 });
    if (type === 'mousePressed') { touching = true; return browser.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); }
    if (type === 'mouseReleased') { touching = false; return browser.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
    // Touch moves are delivered with the next animation frame; wait for it, as a finger would.
    return touching ? browser.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] }).then(() => browser.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')) : Promise.resolve();
  };
  const centre = selector => browser.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 30) }; })()`);
  const steps = [];
  if (testCase.hover) {
    const at = await centre(testCase.hover);
    if (!at) return [`could not point at ${testCase.hover}`];
    await mouse('mouseMoved', at.x, at.y);
    await browser.evaluate('new Promise(r => setTimeout(r, 450))');
  }
  const problems0 = [];
  // The board teaches what to play: pointing at a hex where a hand card's order can start raises
  // that card (as Use order does); a hex where nothing can start raises nothing. Choosing the hex
  // (a tap on touch) opens the Sector Scan beside it, never over it, with the card's picture.
  if (testCase.playsHere) {
    // The map refits as the table settles: wait until the hexes stand still.
    await browser.evaluate(`new Promise(done => { let last = '', calm = 0; const look = () => { const r = document.querySelector('.hex')?.getBoundingClientRect(), now = r ? [r.left, r.top, r.width].map(Math.round).join() : ''; calm = now === last ? calm + 1 : 0; last = now; if (calm >= 5) done(); else requestAnimationFrame(look); }; look(); setTimeout(done, 2000); })`);
    const hexes = await browser.evaluate(`(() => {
      const c = globalThis.galacticReachGuide.context(), card = c.playable.find(p => p.def.order === ${JSON.stringify(testCase.playsHere)});
      const live = new Set(c.playable.flatMap(p => p.targets)), box = h => { const r = h.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
      const inside = h => { const r = h.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; };
      const hit = h => inside(h) && document.elementFromPoint(box(h).x, box(h).y)?.closest('.hex') === h;
      const valid = card && [...document.querySelectorAll('.hex')].find(h => card.targets.includes(h.dataset.coord) && hit(h));
      const idle = [...document.querySelectorAll('.hex')].find(h => !live.has(h.dataset.coord) && hit(h));
      return valid && idle ? { card: card.card.id, coord: valid.dataset.coord, valid: box(valid), idle: box(idle) } : null;
    })()`);
    if (!hexes) return [`no visible hex where ${testCase.playsHere} can start`];
    const raised = () => browser.evaluate('[...document.querySelectorAll("#hand-row > .game-card.cf-plays-here")].map(e => e.dataset.cardId)');
    if (!testCase.device) {
      await mouse('mouseMoved', hexes.valid.x, hexes.valid.y);
      await browser.evaluate('new Promise(r => setTimeout(r, 200))');
      const lit = await raised();
      if (!lit.includes(hexes.card)) problems0.push('pointing at a valid hex did not raise its card');
      if (!(await browser.evaluate(`getComputedStyle(document.querySelector('#hand-row [data-card-id="${hexes.card}"]')).getPropertyValue('--cf-lift').trim() === '-14px'`))) problems0.push('the raised card does not lift like an aimed card');
      await mouse('mouseMoved', hexes.idle.x, hexes.idle.y);
      await browser.evaluate('new Promise(r => setTimeout(r, 200))');
      if ((await raised()).length) problems0.push('pointing at a hex where nothing can start raised a card');
      await mouse('mouseMoved', hexes.valid.x, hexes.valid.y);
    }
    await mouse('mousePressed', hexes.valid.x, hexes.valid.y); await mouse('mouseReleased', hexes.valid.x, hexes.valid.y);
    // Move the pointer off the map, as a player reaching for the scan does: the choice keeps the card raised.
    if (!testCase.device) await mouse('mouseMoved', 4, 4);
    await browser.evaluate('new Promise(r => setTimeout(r, 450))');
    steps.playsHere = hexes;
  }
  // A phone held upright shows only the prompt to turn it, and nothing under it takes a touch;
  // turning the phone removes the prompt at once, with the same game (no reload).
  if (testCase.upright) {
    problems0.push(...await browser.evaluate(`(() => {
      const problems = [], prompt = document.querySelector('#rotate-prompt');
      if (!prompt || !prompt.checkVisibility()) return ['the turn-sideways prompt does not show'];
      const r = prompt.getBoundingClientRect();
      if (r.left > 0 || r.top > 0 || r.right < innerWidth || r.bottom < innerHeight) problems.push('the prompt does not cover the screen');
      if (!prompt.contains(document.elementFromPoint(innerWidth / 2, innerHeight * 0.85))) problems.push('the table takes touches under the prompt');
      if (!document.querySelector('.app-shell').inert) problems.push('the table is not inert under the prompt');
      if (!/sideways/i.test(prompt.textContent)) problems.push('the prompt does not say to turn the phone');
      if (!(prompt.querySelector('img')?.naturalWidth > 0)) problems.push('the prompt shows no emblem');
      window.__sameGame = document.querySelectorAll('#hand-row > .game-card').length;
      return problems;
    })()`));
    await browser.send('Emulation.setDeviceMetricsOverride', { width: height, height: width, deviceScaleFactor: scale, mobile: true, screenWidth: height, screenHeight: width, screenOrientation: { type: 'landscapePrimary', angle: 90 } });
    await browser.evaluate('new Promise(r => setTimeout(r, 400))');
    problems0.push(...await browser.evaluate(`(() => {
      const problems = [];
      if (document.querySelector('#rotate-prompt')?.checkVisibility()) problems.push('the prompt stays after turning the phone');
      if (document.querySelector('.app-shell').inert) problems.push('the table stays inert after turning the phone');
      if (!window.__sameGame || window.__sameGame !== document.querySelectorAll('#hand-row > .game-card').length) problems.push('turning the phone reloaded or changed the game');
      return problems;
    })()`));
  }
  // Phones: a tap on a hand card's visible strip opens the whole card over the map, wholly on
  // screen without scrolling.
  if (testCase.phoneTap) {
    const at = await browser.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(testCase.phoneTap)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 22), y: r.top + Math.min(r.height / 2, 22) }; })()`);
    if (!at) return [`could not find ${testCase.phoneTap}`];
    await mouse('mousePressed', at.x, at.y); await mouse('mouseReleased', at.x, at.y);
    await browser.evaluate('new Promise(r => setTimeout(r, 400))');
    problems0.push(...await browser.evaluate(`(() => {
      const card = document.querySelector('.phone-card-sheet:not([hidden]) .game-card');
      if (!card) return ['tapping a hand card did not open it whole'];
      const r = card.getBoundingClientRect(), problems = [];
      if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) problems.push('the opened card is not wholly on screen');
      if (card.scrollHeight > card.clientHeight + 2) problems.push('the opened card scrolls: ' + card.scrollHeight + ' > ' + card.clientHeight);
      return problems;
    })()`));
  }
  // Learn to play on a phone: tapping the cued card reveals the note and keeps the card in the
  // fan; its lit corner is on top and converts it; the step's mat row, the hand and the note do not overlap.
  if (testCase.cueTap) {
    // (Tap the card's visible strip at its foot, below its corners: a lit corner acts on the first tap.)
    const at = await browser.evaluate(`(() => { const e = document.querySelector('#hand-row .game-card.gr-coach-card-cue'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 20), y: Math.min(innerHeight - 3, r.bottom - 6) }; })()`);
    if (!at) return ['no cued card in Learn to play'];
    await mouse('mousePressed', at.x, at.y); await mouse('mouseReleased', at.x, at.y);
    await browser.evaluate('new Promise(r => setTimeout(r, 600))');
    const seen = await browser.evaluate(`(() => {
      const problems = [], over = (a, b) => a && b && a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
      if (document.querySelector('.phone-card-sheet:not([hidden])')) problems.push('the step opened the card whole over the table');
      const corner = document.querySelector('#hand-row .gr-card-stays .gr-coach-corner');
      if (!corner) return [...problems, 'the step does not light the card corner that does it'];
      const c = corner.getBoundingClientRect();
      if (!corner.contains(document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2))) problems.push('the lit corner is covered');
      const row = document.querySelector('.resource-panel .resource-box.energy, #resource-grid .resource-box[data-resource="energy"]')?.getBoundingClientRect();
      if (!row || !row.width) problems.push('the step does not show the mat row');
      const note = document.querySelector('#gr-coach:popover-open')?.getBoundingClientRect();
      for (const label of document.querySelectorAll('.gr-stage-label')) { const l = label.getBoundingClientRect(); if ([...document.querySelectorAll('#hand-row > .game-card')].some(card => over(l, card.getBoundingClientRect()))) problems.push('a callout label lies over your hand'); }
      if (over(note, row)) problems.push('the note lies over the mat row');
      window.__energy = +document.querySelector('#resource-grid .resource-box[data-resource="energy"] .resource-amount')?.textContent;
      return { problems, x: c.left + c.width / 2, y: c.top + c.height / 2 };
    })()`);
    if (Array.isArray(seen)) return seen;
    problems0.push(...seen.problems);
    await mouse('mousePressed', seen.x, seen.y); await mouse('mouseReleased', seen.x, seen.y);
    await browser.evaluate('new Promise(r => setTimeout(r, 500))');
    if (!(await browser.evaluate('+document.querySelector(\'#resource-grid .resource-box[data-resource="energy"] .resource-amount\')?.textContent > window.__energy'))) problems0.push('pressing the lit corner did not convert the card');
  }
  // A real click on a raised card's button (press and release without moving) is still a click.
  if (testCase.tap) {
    // Point at the card's visible strip first (a held hand fans its cards), so it lifts.
    const card = await browser.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(testCase.tap.split(' [')[0])}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 36), y: r.top + Math.min(r.height / 2, 30) }; })()`);
    if (!card) return [`could not find ${testCase.tap}`];
    await mouse('mouseMoved', card.x, card.y);
    await browser.evaluate('new Promise(r => setTimeout(r, 300))');
    steps.before = await browser.evaluate('({ hand: document.querySelectorAll("#hand-row > .game-card").length, stock: [...document.querySelectorAll(".resource-box .resource-amount")].map(e => +e.textContent) })');
    const at = await centre(testCase.tap);
    if (!at) return [`could not find ${testCase.tap}`];
    await mouse('mouseMoved', at.x, at.y); await mouse('mousePressed', at.x, at.y); await mouse('mouseReleased', at.x, at.y);
    await mouse('mouseMoved', 4, 4);
    await browser.evaluate('new Promise(r => setTimeout(r, 300))');
    steps.push({ arrow: true, zone: true, gain: '+1' });
  }
  if (testCase.drag) {
    // Point at the card first, as a player does; it lifts. Then press where the case says:
    // anywhere on the card, its buttons included, must pick it up.
    // A held hand fans its cards, so point at the strip each card shows along its left edge.
    const card = await browser.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(testCase.drag)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 36), y: r.top + Math.min(r.height / 2, 30) }; })()`);
    if (!card) return [`could not find ${testCase.drag}`];
    await mouse('mouseMoved', card.x, card.y);
    await browser.evaluate('new Promise(r => setTimeout(r, 300))');
    // Touch has no hover to lift the card, so press on its visible strip too.
    const from = testCase.grab ? await centre(`${testCase.drag} ${testCase.grab}`) : testCase.device ? card : await centre(testCase.drag);
    if (!from) return [`could not find ${testCase.grab} on ${testCase.drag}`];
    await mouse('mouseMoved', from.x, from.y); await mouse('mousePressed', from.x, from.y);
    for (let i = 1; i <= 3; i++) await mouse('mouseMoved', from.x, from.y - 6 * i);
    if (!(await browser.evaluate('!!document.querySelector(".cf-held") && document.body.classList.contains("cf-drag-active")'))) problems0.push('pressing and moving did not pick the card up');
    const dropOn = testCase.dropOn || '.hex.cf-drop-target';
    const target = await centre(dropOn);
    if (!target) { await mouse('mouseReleased', from.x, from.y - 18); return [`drag showed no ${testCase.dropOn ? 'marked ' + dropOn : 'legal hex'}`]; }
    steps.before = await browser.evaluate('({ hand: document.querySelectorAll("#hand-row > .game-card").length, stock: [...document.querySelectorAll(".resource-box .resource-amount")].map(e => +e.textContent) })');
    for (let i = 1; i <= 6; i++) await mouse('mouseMoved', from.x + (target.x - from.x) * i / 6, from.y - 18 + (target.y - from.y + 18) * i / 6);
    steps.push(await browser.evaluate('({ arrow: !!document.querySelector(".cf-drag-arrow.cf-on-target"), hover: !!document.querySelector(".hex.cf-drop-target.cf-drop-hover"), zone: (() => { const z = document.querySelector(".cf-drop-zone.cf-drop-hover"); return !!z && z.getClientRects().length > 0 && !!z.querySelector(".resource-box"); })(), gain: document.querySelector(".resource-box.cf-drop-yield")?.dataset.cfGain || "", label: document.querySelector(".cf-drop-label:not([hidden])")?.textContent || "" })'));
    // Every drop target says what letting go there will do.
    if (!steps[0].label) problems0.push('no drop label under the pointer');
    await mouse('mouseReleased', target.x, target.y);
    await mouse('mouseMoved', 4, 4);
    await browser.evaluate('new Promise(r => setTimeout(r, 300))');
  }
  if (testCase.matTrade) {
    const { from, to, how, expect } = testCase.matTrade;
    const stock = () => browser.evaluate('Object.fromEntries([...document.querySelectorAll("#resource-grid .resource-box")].map(b => [b.dataset.resource, +b.querySelector(".resource-amount").textContent]))');
    const before = await stock();
    const a = await centre(`#resource-grid .resource-box[data-resource="${from}"] .mat-pips.now`);
    const b = await centre(`#resource-grid .resource-box[data-resource="${to}"]`);
    if (!a || !b) return ['mat trade: could not find the rows'];
    if (how === 'drag') {
      await mouse('mouseMoved', a.x, a.y); await mouse('mousePressed', a.x, a.y);
      for (let i = 1; i <= 8; i++) await mouse('mouseMoved', a.x + (b.x - a.x) * i / 8, a.y + (b.y - a.y) * i / 8);
      const label = await browser.evaluate('document.querySelector(".mat-trade-label")?.textContent || ""');
      if (!label) problems0.push('mat trade: no note while dragging over the target');
      await mouse('mouseReleased', b.x, b.y);
    } else {
      for (const at of [a, b]) { await mouse('mouseMoved', at.x, at.y); await mouse('mousePressed', at.x, at.y); await mouse('mouseReleased', at.x, at.y); await browser.evaluate('new Promise(r => setTimeout(r, 120))'); }
    }
    await browser.evaluate('new Promise(r => setTimeout(r, 300))');
    const after = await stock();
    for (const [resource, change] of Object.entries(expect)) if (after[resource] - before[resource] !== change) problems0.push(`mat trade: ${resource} changed by ${after[resource] - before[resource]}, expected ${change}`);
  }
  // The waiting room is a page, not the game table: in a short window (or at a high browser
  // zoom) it may scroll vertically, like a phone.
  await browser.evaluate(`window.__fitMode = ${JSON.stringify(isPhone([width, height]) || (testCase.lobby && height < 700) ? 'phone' : 'fit')}; true`);
  const { problems, slack } = await browser.evaluate(MEASURE);
  // Held sideways with the market closed, the map has most of the screen: the share of points
  // where a tap lands on the map rather than on a panel, button or your hand.
  if (testCase.mapShare) {
    const share = await browser.evaluate(`(() => { let map = 0, all = 0; for (let y = 3; y < innerHeight; y += 6) for (let x = 3; x < innerWidth; x += 6) { all++; const hit = document.elementFromPoint(x, y); if (hit?.closest('.board-map-region') && !hit.closest('.map-tools')) map++; } return map / all; })()`);
    if (share < testCase.mapShare) problems.push(`the map has ${Math.round(share * 100)}% of the screen (at least ${Math.round(testCase.mapShare * 100)}% expected)`);
  }
  // The market drawer's state: the table's view (closed, side, full; an upright table has no
  // whole-card view, so its Buy turn opens the band), or on a phone whether the Supply drawer is open.
  if (testCase.marketView) {
    const got = await browser.evaluate(`(() => { const c = document.documentElement.classList; if (c.contains('market-drawer')) return ['closed', 'side', 'full'].find(v => c.contains('market-' + v)); if (matchMedia('(max-width: 599px), (max-height: 599px)').matches) return document.body.dataset.drawer === 'supply' ? 'open' : 'closed'; return 'band'; })()`);
    const want = isPhone([width, height]) ? (testCase.marketView === 'closed' ? 'closed' : 'open') : height >= width && testCase.marketView === 'full' ? 'side' : testCase.marketView;
    if (got !== want) problems.push(`market drawer: ${got}, expected ${want}`);
  }
  if (testCase.buyVisible) {
    const seen = await browser.evaluate(`(() => { const shown = e => e && e.checkVisibility() && e.getBoundingClientRect().height > 8;
      return { market: [...document.querySelectorAll('#market-row .game-card')].filter(shown).length, finish: shown([...document.querySelectorAll('#board-primary, #hand-finish-buy-button, #finish-buy-button')].find(shown)) }; })()`);
    if (seen.market < 5) problems.push('market cards not visible in Buy: ' + seen.market);
    if (!seen.finish) problems.push('Finish Buy not visible in Buy');
  }
  problems.push(...problems0);
  if (!touch && !isPhone([width, height]) && !testCase.hover && !testCase.tap && !testCase.drag && /^(1280x720|1440x900)$/.test(`${width}x${height}`) && scale === 1) {
    const noteShown = 'getComputedStyle(document.querySelector("#gr-coach") || document.body).display !== "none" && !document.querySelector("#gr-coach")?.hidden && getComputedStyle(document.querySelector("#gr-coach") || document.body).visibility !== "hidden" && !document.querySelector("#gr-coach")?.closest("dialog")';
    if (await browser.evaluate(`(() => !!document.querySelector('#gr-coach') && (${noteShown}))()`)) {
      const cards = await browser.evaluate(`[...document.querySelectorAll('#hand-row > .game-card')].slice(0, 3).concat([...document.querySelectorAll('[data-buy-market]')].slice(0, 2)).map(e => { const r = e.getBoundingClientRect(), next = e.nextElementSibling?.getBoundingClientRect(); const right = e.closest('#hand-row') && next && next.left > r.left ? Math.min(r.right, next.left) : r.right; return { x: (r.left + right) / 2, y: r.top + Math.min(24, r.height / 2) }; })`);
      for (const card of cards) {
        await mouse('mouseMoved', card.x, card.y);
        await browser.evaluate('new Promise(r => setTimeout(r, 200))');
        const ok = await browser.evaluate(`(() => { if (!(${noteShown})) return 'the guidance note vanished'; const n = document.querySelector('#gr-coach').getBoundingClientRect(); const card = document.querySelector(':is(#hand-row, .market-cards) .game-card:is(:hover, :focus-within)'); if (!card) return ''; const r = card.getBoundingClientRect(); const overlap = Math.max(0, Math.min(n.right, r.right) - Math.max(n.left, r.left)) * Math.max(0, Math.min(n.bottom, r.bottom) - Math.max(n.top, r.top)); return overlap > 0.04 * r.width * r.height ? 'the guidance note lies over the raised card' : ''; })()`);
        if (ok) { problems.push(`${ok} while pointing at a card at ${Math.round(card.x)},${Math.round(card.y)}`); break; }
      }
      await mouse('mouseMoved', 4, 4);
    }
  }
  if (testCase.expect === 'converted') {
    if (!steps[0]?.arrow || !steps[0]?.zone || !/^\+\d/.test(steps[0]?.gain)) problems.push('drag did not light your reserves and the gain');
    const after = await browser.evaluate('({ hand: document.querySelectorAll("#hand-row > .game-card").length, stock: [...document.querySelectorAll(".resource-box .resource-amount")].map(e => +e.textContent) })');
    if (after.hand !== steps.before.hand - 1 || !after.stock.some((n, i) => n > steps.before.stock[i])) problems.push('dropping a card on your reserves did not convert it');
  }
  // Pointing at a hand card raises that card itself into the whole card, in place above the hand:
  // its effect shows at reading size and whole, inside the window; no copy opens beside the map.
  if (testCase.expect === 'fan') problems.push(...await browser.evaluate(`(() => {
    // Both upper corners of every resting card are on top at their own place in the hand.
    // On a phone the hand is a scrolling row: judge the cards in view.
    const problems = [], view = document.querySelector('#hand-row').getBoundingClientRect();
    const cards = [...document.querySelectorAll('#hand-row > .game-card')].filter(card => { const r = card.getBoundingClientRect(); return r.left >= view.left - 1 && r.right <= Math.min(innerWidth, view.right) + 1; });
    for (const card of cards) {
      const parts = [card.querySelector(':scope > .card-symbols'), card.querySelector(':scope > .card-footer')].filter(e => e && e.getClientRects().length);
      if (!parts.length) parts.push(card.querySelector('.card-name'));
      for (const part of parts) {
        const r = part.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        const hit = document.elementFromPoint(x, y)?.closest('#hand-row > .game-card');
        if (hit !== card) problems.push('fan hides ' + (part.className.split(' ')[0] || 'part') + ' of ' + (card.querySelector('.card-name')?.textContent || 'a card') + (hit ? ' under ' + hit.querySelector('.card-name')?.textContent : ''));
        if (x < 0 || x > innerWidth || y < 0 || y > innerHeight) problems.push('fan corner outside the window: ' + card.querySelector('.card-name')?.textContent);
      }
    }
    return problems.slice(0, 6);
  })()`));
  if (testCase.expect === 'inspect') problems.push(...await browser.evaluate(`(() => {
    const card = document.querySelector('#hand-row > .game-card:hover'), problems = [];
    if (document.querySelector('#card-inspect, .card-inspect')) problems.push('a separate inspect copy opened');
    if (!card) return [...problems, 'the pointed-at card did not raise'];
    const r = card.getBoundingClientRect(), effect = card.querySelector('.card-effect');
    if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) problems.push('raised card outside viewport');
    if (!effect || !effect.getClientRects().length || getComputedStyle(effect).clipPath.includes('inset(50%)')) problems.push('raised card does not show its effect');
    else if (parseFloat(getComputedStyle(effect).fontSize) * (Number(document.documentElement.style.getPropertyValue('--table-zoom')) || 1) < 10) problems.push('raised card effect below reading size');
    if (card.scrollHeight > card.clientHeight + 2) problems.push('raised card text cut');
    const strip = document.querySelector('#hand-row').getBoundingClientRect();
    if (Math.abs(r.bottom - strip.bottom) > 24) problems.push('raised card does not rise from the hand');
    return problems;
  })()`));
  if (steps.playsHere) problems.push(...await browser.evaluate(`(() => {
    const problems = [], { card, coord } = ${JSON.stringify(steps.playsHere)};
    const scan = document.querySelector('#sector-popover'), hex = document.querySelector('.hex[data-coord="' + coord + '"]');
    if (!scan.matches(':popover-open')) return ['choosing a valid hex did not open the Sector Scan'];
    if (!document.querySelector('#hand-row [data-card-id="' + card + '"].cf-plays-here')) problems.push('the chosen hex does not keep its card raised');
    const s = scan.getBoundingClientRect(), h = hex.getBoundingClientRect();
    if (s.left < h.right - 2 && s.right > h.left + 2 && s.top < h.bottom - 2 && s.bottom > h.top + 2) problems.push('the Sector Scan covers the hex it describes');
    const raisedCard = document.querySelector('#hand-row [data-card-id="' + card + '"]').getBoundingClientRect();
    if (s.left < raisedCard.right && s.right > raisedCard.left && s.top < raisedCard.bottom && s.bottom > raisedCard.top) problems.push('the Sector Scan covers the raised card');
    const order = scan.querySelector('.scan-order[data-scan-order-card="' + card + '"]');
    if (!order || !order.querySelector('.scan-order-art .card-art')) return [...problems, 'the Sector Scan does not list the card with its picture'];
    const arrow = scan.querySelector('.gr-coach-arrow');
    if (innerWidth >= 600 && innerHeight >= 500 && (!['top', 'bottom', 'left', 'right'].includes(scan.dataset.side) || getComputedStyle(arrow).display === 'none')) problems.push('the Sector Scan has no arrow at its hex');
    order.click();
    if (!document.querySelector('#hand-row [data-card-id="' + card + '"].order-selected')) problems.push('choosing the order in the Sector Scan did not start it');
    return problems;
  })()`));
  if (testCase.expect === 'aimed') problems.push(...await browser.evaluate(`(() => {
    const problems = [], lit = document.querySelectorAll('.hex.cf-drop-target');
    if (!lit.length) problems.push('Use order lit no hexes');
    if (!document.querySelector('#hand-row .game-card.cf-aiming.order-selected')) problems.push('the chosen card is not marked as in play');
    lit[0]?.click();
    if (!document.querySelector('#sector-popover')?.matches(':popover-open')) problems.push('clicking a lit hex did not open its build choices');
    if (document.querySelector('.hex.cf-drop-target, .cf-aiming')) problems.push('the aim stayed after choosing a hex');
    return problems;
  })()`));
  if (testCase.expect === 'built') {
    if (!steps[0]?.arrow || !steps[0]?.hover) problems.push('drag did not mark the hex under the pointer');
    if (!(await browser.evaluate('document.querySelector("#sector-popover").matches(":popover-open") && !!document.querySelector("#hand-row .game-card.order-selected")')))
      problems.push('dropping Construct on a hex did not open its build choices');
  }
  if (testCase.expect === 'dragged') {
    if (!steps[0]?.arrow || !steps[0]?.hover) problems.push('drag did not mark the hex under the pointer');
    if (!(await browser.evaluate('!!document.querySelector(".hex.source") && !!document.querySelector("#hand-row .game-card.order-selected") && !document.querySelector(".cf-drag-arrow, .cf-drop-target")')))
      problems.push('dropping Move on your units did not choose them as the move source');
  }
  lastSlack = slack;
  if (testCase.lobby && !(await browser.evaluate('!!document.querySelector(".lobby-seats")'))) problems.push('waiting room did not render');
  if (testCase.shared && !(await browser.evaluate('!!document.querySelector("#shared-seats li") && !document.querySelector(".app-shell").inert'))) problems.push('shared table did not open');
  if (testCase.deviceView) problems.push(...await browser.evaluate(`(() => {
    const problems = [], view = ${JSON.stringify(testCase.deviceView)}, shown = e => e && e.checkVisibility() && e.getBoundingClientRect().height > 8;
    if (document.body.dataset.deviceView !== view) problems.push('this device is ' + document.body.dataset.deviceView + ', not ' + view);
    if (!/my hand|the whole game/.test(document.querySelector('#device-view-button')?.textContent || '')) problems.push('the menu has no This device switch');
    if (!shown(document.querySelector('#hand-row > .game-card'))) problems.push('the hand is not on the table');
    if (!shown(document.querySelector('.board-map-region .hex'))) problems.push('the map is not on the table');
    const drawerOpen = () => document.querySelector('body:is([data-drawer="mat"], [data-drawer="comms"], [data-drawer="table"], [data-drawer="supply"])');
    if (drawerOpen()) problems.push('a drawer is open over the table: ' + document.body.dataset.drawer);
    // The game menu's switch changes the view at once, still with no drawer over the table.
    document.querySelector('#device-view-button')?.click();
    if (document.body.dataset.deviceView === view) problems.push('the This device switch did not change the view');
    if (drawerOpen() || !shown(document.querySelector('#hand-row > .game-card'))) problems.push('switching the view covered the table or hid the hand');
    return problems;
  })()`));
  if (!testCase.lobby && testCase.save?.pendingCombat && !(await browser.evaluate('document.querySelector("#combat-dialog").open'))) problems.push('battle dialog did not open');
  if (SHOTS) {
    fs.mkdirSync(SHOTS, { recursive: true });
    const shot = await browser.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, `${viewportName(viewport).replace('%', 'pct')}-${testCase.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`), Buffer.from(shot.data, 'base64'));
  }
  return problems;
}

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    const message = 'check-viewport-fit: no Chrome found; set CHROME_PATH.';
    if (process.env.CI) { console.error(message); process.exit(1); }
    console.log(`${message} Skipped.`); return;
  }
  const server = http.createServer(serve);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = process.env.CHECK_ORIGIN || `http://127.0.0.1:${server.address().port}`;
  const only = process.env.CHECK_ONLY ? new RegExp(process.env.CHECK_ONLY) : null;
  const browser = await launch(chrome);
  let failures = 0, checks = 0;
  try {
    // CHECK_SIZES=WxH,WxH runs every case at just those desktop sizes (for sweeping window shapes).
    const sizes = process.env.CHECK_SIZES?.split(',').map(size => size.split('x').map(Number));
    const desk = CASES.filter(testCase => testCase.devices !== 'phone');
    const runs = sizes ? sizes.flatMap(viewport => desk.map(testCase => [viewport, testCase])) : [...[...VIEWPORTS, ...TALL_VIEWPORTS].flatMap(viewport => desk.map(testCase => [viewport, testCase])),
      ...EXTRA_VIEWPORTS.flatMap(viewport => desk.filter(testCase => testCase.extraSizes).map(testCase => [viewport, testCase])),
      ...ZOOM_VIEWPORTS.flatMap(viewport => desk.filter(testCase => !isPhone(viewport) || testCase.devices === true).map(testCase => [viewport, testCase])),
      ...[...TABLET_VIEWPORTS, ...PHONE_VIEWPORTS].flatMap(viewport => CASES.filter(testCase => testCase.devices === true || (testCase.devices === 'tablet' && !isPhone(viewport)) || (testCase.devices === 'phone' && isPhone(viewport))).map(testCase => [viewport, { ...testCase, device: true, name: `${testCase.name} (touch)` }])),
      ...UPRIGHT_CASES.map(testCase => [UPRIGHT_PHONE, testCase.device ? { ...testCase, name: `${testCase.name} (touch)` } : testCase])];
    for (const [viewport, testCase] of runs) {
      if (only && !only.test(`${viewportName(viewport)} ${testCase.name}`)) continue;
      if (process.env.CHECK_ORIGIN && (testCase.lobby || testCase.table || testCase.shared)) continue;
      checks++;
      browser.errors.length = 0;
      const problems = await runCase(browser, origin, testCase, viewport);
      problems.push(...(await browser.evaluate('window.galacticReachRenderErrors || []')).map(e => `table failed to draw ${e}`));
      problems.push(...browser.errors.filter(e => !/seat\.js|zk\/|Failed to fetch dynamically imported module/.test(e)).map(e => `page error: ${e.split('\n')[0]}`));
      if (problems.length) { failures++; console.log(`not ok - ${viewportName(viewport)} ${testCase.name}\n  ${problems.join('\n  ')}`); }
      else console.log(`ok - ${viewportName(viewport)} ${testCase.name}${lastSlack.px < 99 ? ` (tightest card: ${lastSlack.card}, ${lastSlack.px}px spare)` : ''}`);
    }
  } finally { browser.close(); server.close(); }
  console.log(`${checks - failures}/${checks} viewport-fit checks passed.`);
  if (failures) process.exit(1);
}
if (require.main === module) main().catch(error => { console.error(error); process.exit(1); });
module.exports = { findChrome, launch, freshEngine, operationsState, buyState };
