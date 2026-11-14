// Can a seat find unlocated world relics from what it is shown? Uses the real
// 27.32 engine and adapter observation for seat 0 across many random setups.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.join(__dirname, '../..');
let hits = 0, worlds = 0, moonLayouts = new Set(), games = 200;
for (let g = 0; g < games; g++) {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, 'prototypes/galactic-reach/adapter.js'), 'utf8') + fs.readFileSync(path.join(root, 'prototypes/galactic-reach/app.js'), 'utf8'), context);
  let seed = 1000 + g * 7919, port;
  const real = context.createGalacticAdapter; context.createGalacticAdapter = (e) => { port = e; return real(e); };
  const adapter = context.createGalacticReach({ headless: true, random: () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32) });
  const view = adapter.observe(0);
  const truth = port.state;
  // Guess: in a visible world named X, the relic is the planet whose numeral is fixed for X.
  const RELIC = { Erebus: 'III', Fornax: 'VI', Gemini: 'II', Helios: 'V', Icarus: 'VII', Juno: 'IV', Kepler: 'III', Lyra: 'VI' };
  for (const [coord, p] of Object.entries(view.planets)) {
    if (!p.name || p.unknown) continue;
    const [world, numeral] = p.name.split(' ');
    if (RELIC[world] !== numeral) continue;
    worlds++;
    if (truth.planets[coord].special === 'relic' && !port.relicKnown(truth.clusters[truth.planets[coord].cluster], 0)) hits++;
  }
  moonLayouts.add(JSON.stringify(truth.clusters.filter((c) => c.kind === 'moon').map((c) => c.center).sort()));
}
console.log(JSON.stringify({ games, guessedWorldRelics: worlds, correctAndUnlocated: hits, distinctMoonLayoutsSeen: moonLayouts.size }));
