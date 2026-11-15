// Current Probe contract (#orders, #movement): only new private signals, with atomic exhaustion.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', 'prototypes/galactic-reach', name), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function game(resume) {
  const context = vm.createContext({});
  vm.runInContext(read('adapter.js') + read('app.js'), context);
  let e, seed = 1729, calls = 0;
  const factory = context.createGalacticAdapter;
  context.createGalacticAdapter = port => { e = port; return factory(port); };
  const a = context.createGalacticReach({headless: true, resume, random: () => {
    calls++; return ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  }});
  return {e, a, s: e.state, calls: () => calls};
}
const distance = (a, b) => {
  const [q, r] = a.split(',').map(Number), [x, y] = b.split(',').map(Number);
  return Math.max(Math.abs(q-x), Math.abs(r-y), Math.abs(q+r-x-y));
};
function target(g, source, seat = 0) {
  return g.s.clusters.flatMap(c => c.scannedBy.includes(seat) ? [] : c.coords
    .filter(k => g.s.planets[k].special === 'relic' && !g.s.planets[k].relicClaimed)
    .map(coord => ({coord, cluster: c.id})))
    .sort((a, b) => distance(source, a.coord)-distance(source, b.coord) || a.cluster-b.cluster)[0];
}
function setup(source = '2,2', seat = 0) {
  const g = game();
  Object.assign(g.s, {activePlayer: seat, phase: 'operations', fleets: {[source]: {[seat]: {explorer: 1}}}});
  g.s.players.forEach(p => { p.hand = []; p.inPlay = []; });
  const p = g.s.players[seat];
  p.hand = [{key: 'probe', id: 'probe'}, {key: 'probe', id: 'probe2'}];
  return {...g, source, p};
}

// A nearer known signal is skipped, including across a save/reload. Other seats' knowledge is private.
for (const seat of [0, 1]) {
  const g = setup('2,2', seat), first = target(g, g.source, seat);
  g.s.clusters[first.cluster].scannedBy.push(seat);
  const next = target(g, g.source, seat);
  g.s.clusters[next.cluster].scannedBy = [(seat+1)%4];
  const snapshot = g.a.snapshotState(), h = game(snapshot), calls = h.calls();
  const others = [0,1,2,3].filter(id => id !== seat).map(id => ({
    id, planets: plain(h.a.privateState(id).planets), clusters: plain(h.a.privateState(id).clusters)
  }));
  const before = JSON.stringify(h.s), resources = plain(h.s.players[seat].resources);
  assert(h.e.probeRelic(seat, g.source, 'probe', true));
  assert.equal(JSON.stringify(h.s), before, 'Dry run is read-only');
  const action = h.a.legalActions(seat).find(a => a.type === 'probe' && a.card === 'probe');
  assert(action); assert.equal(action.coord, g.source);
  assert.deepEqual(Object.keys(action).sort(), ['card','coord','key','type'], 'No hidden target in legal commands');
  h.a.applyAction(seat, action);
  assert(h.s.clusters[next.cluster].scannedBy.includes(seat), 'Choose a new site even if another player knows it');
  assert(h.s.players[seat].inPlay.some(c => c.id === 'probe'));
  assert(!h.s.players[seat].hand.some(c => c.id === 'probe'));
  assert.equal(h.s.fleets[g.source][seat].explorer, 1);
  assert.deepEqual(plain(h.s.players[seat].resources), resources);
  assert.equal(h.s.activePlayer, (seat+1)%4); assert.equal(h.calls(), calls);
  for (const other of others) {
    assert.deepEqual(plain(h.a.privateState(other.id).planets), other.planets);
    assert.deepEqual(plain(h.a.privateState(other.id).clusters), other.clusters);
  }
  assert(!h.s.log[0].includes(next.coord), 'Public log keeps the signal private');
}

// Rank the actual relic hex, not its world center; equal distances use stable cluster order.
for (const tie of [false, true]) {
  const g = setup('2,1'), far = g.s.clusters.find(c => c.center === '6,-3'), near = g.s.clusters.find(c => c.center === '3,3');
  for (const c of g.s.clusters) c.scannedBy = [0];
  for (const c of [far,near]) { c.scannedBy = []; for (const at of c.coords) g.s.planets[at].special = null; }
  const a = '5,-2', b = tie ? '4,2' : '4,3';
  assert(far.coords.includes(a) && near.coords.includes(b));
  g.s.planets[a].special = g.s.planets[b].special = 'relic';
  assert(distance(g.source,near.center) < distance(g.source,far.center));
  if (tie) assert.equal(distance(g.source,a),distance(g.source,b));
  const wanted = tie ? (far.id < near.id ? far : near) : far;
  assert(g.e.probeRelic(0,g.source,'probe')); assert(wanted.scannedBy.includes(0));
}

// A final signal on a hidden moon locates its relic without surveying terrain.
{
  const g = setup(), moon = g.s.clusters.find(c => c.kind === 'moon');
  for (const c of g.s.clusters) c.scannedBy = c === moon ? [] : [0];
  const revealed = JSON.stringify(moon.revealedBy);
  assert.equal(g.e.probeStatus(0), 'available');
  assert(g.e.probeRelic(0,g.source,'probe'));
  assert.equal(g.e.probeStatus(0), 'all_discovered');
  assert.equal(JSON.stringify(moon.revealedBy), revealed);
  assert(!g.e.clusterKnown(moon,0));
  const coord = g.e.relicCoordInCluster(moon), own = g.a.privateState(0), other = g.a.privateState(1);
  assert.equal(own.planets[coord].special,'relic'); assert(!other.planets[coord]);
  assert.equal(own.probeStatus,'all_discovered'); assert.equal(other.probeStatus,'available');
  assert(!('probeStatus' in g.a.snapshotState().state), 'Derived seat status is not persisted in authority');
}

// Exhausted discovery and exhausted relics are distinct; neither can spend a card, action or RNG.
for (const exhausted of ['all_discovered','none_remaining']) {
  const g = setup();
  if (exhausted === 'all_discovered') for (const c of g.s.clusters) c.scannedBy = [0];
  else for (const p of Object.values(g.s.planets)) if (p.special === 'relic') p.relicClaimed = true;
  const before = JSON.stringify(g.a.snapshotState()), calls = g.calls();
  assert.equal(g.e.probeStatus(0), exhausted);
  assert.equal(g.a.privateState(0).probeStatus, exhausted);
  for (const dryRun of [true,false]) assert(!g.e.probeRelic(0,g.source,'probe',dryRun));
  assert(!g.a.legalActions(0).some(a => a.type === 'probe'));
  assert.throws(() => g.a.applyAction(0,{type:'probe',key:'probe',card:'probe',coord:g.source}), /Illegal/);
  assert.equal(JSON.stringify(g.a.snapshotState()), before); assert.equal(g.calls(), calls);
}

// Claimed sites never become targets, and availability adds no hidden coordinates to hints.
{
  const g = setup(), first = target(g,g.source);
  g.s.planets[first.coord].relicClaimed = true;
  const next = target(g,g.source), hints = g.a.hints(0);
  assert(hints.probe.length); assert(hints.probe.every(a => a.coord === g.source));
  assert(g.e.probeRelic(0,g.source,'probe'));
  assert(g.s.clusters[next.cluster].scannedBy.includes(0));
  assert(!g.s.clusters[first.cluster].scannedBy.includes(0));
}
console.log('Probe discovery: skips known/claimed sites, private per-seat status, actual hex distance/ties, reload, hidden moon signals, in-play timing and atomic exhaustion passed.');
