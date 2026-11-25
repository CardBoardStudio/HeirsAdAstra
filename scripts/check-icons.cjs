// The game has its twenty symbols, uses every one, and draws no other version of them.
//   1. prototypes/galactic-reach/icons.js defines exactly the twenty, each with stars in both renderings.
//   2. The rulebook's sprite and the design exports (design/icons/) are generated from it and current.
//   3. The game references every one: app.js names each, the engine's catalog draws them, the
//      rulebook's sprite carries them all and the card gallery lists them.
//   4. Only Max's four resource alternatives retain old drawings; Willem's set stays intact.
//   5. No interface control takes a game symbol: the table's own glyphs (portal, limit lock, the
//      comms events outside the twenty, the walkthrough pointer) keep their drawings, and only
//      buttons whose symbol means that game thing (card corners, cards, resource choices, the
//      Relics bank) may draw one.
//   node scripts/check-icons.cjs   (CI runs it from scripts/check-emblem.cjs)
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const game = path.join(root, 'prototypes/galactic-reach');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const TWENTY = ['matter', 'energy', 'life', 'data', 'move', 'build', 'colonize', 'draw', 'prestige', 'hit', 'shield', 'limit', 'trade',
  'settler', 'explorer', 'fleet', 'colony', 'harvester', 'shipyard', 'excavate'];

// 1. The source of truth.
const icons = require('../prototypes/galactic-reach/icons.js');
assert.deepEqual([...icons.NAMES], TWENTY, 'icons.js defines exactly the twenty symbols, in order');
for (const name of TWENTY) {
  assert.ok(icons.LABELS[name], `${name} has a name`);
  for (const small of [false, true]) {
    const svg = icons.svg(name, { small });
    assert.match(svg, new RegExp(`data-icon="${name}"`), `${name} names itself`);
    assert.match(svg, /class="hx-star"/, `${name} (${small ? 'small' : 'ghost'}) draws stars`);
  }
}

// 2. Generated copies are current.
execFileSync(process.execPath, [path.join(__dirname, 'icons.cjs'), '--check'], { stdio: 'inherit' });

// 3. Used by the game. app.js names each icon it draws as a string literal: icon('…'),
//    vocabIcon('…'), or a value in its unit/building or comms tables.
const app = read('prototypes/galactic-reach/app.js');
const named = new Set([...app.matchAll(/\b(?:icon|vocabIcon)\('([a-z]+)'/g)].map(m => m[1]));
for (const table of ['BOARD_ICON_NAMES', 'LOG_STAR_ICONS']) {
  const body = app.match(new RegExp(`const ${table} = \\{([^}]*)\\}`))?.[1];
  assert.ok(body, `app.js defines ${table}`);
  for (const m of body.matchAll(/:\s*'([a-z]+)'/g)) named.add(m[1]);
}
for (const name of TWENTY) assert.ok(named.has(name), `app.js never draws the ${name} icon`);
for (const name of named) assert.ok(TWENTY.includes(name), `app.js draws an unknown icon ${name}`);
// The engine draws them: its catalog (the gallery's engine) renders resources, units and card text with them.
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(game, 'icons.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(game, 'app.js'), 'utf8'), context);
const catalog = context.createGalacticReach({ catalog: true });
const drawn = html => new Set([...String(html).matchAll(/data-icon="([a-z]+)"/g)].map(m => m[1]));
assert.deepEqual([...drawn(catalog.resourceDots({ matter: 1, energy: 1, biomass: 1, data: 1 }))], ['matter', 'energy', 'life', 'data'], 'resources draw their icons');
assert.match(catalog.resourceDots({matter:1}), /class="max-resource-shape" display="none"/, 'Max alternatives default to hidden even in the gallery, which does not load max-ui.css');
assert.deepEqual([...drawn(Object.values(catalog.BOARD_ICONS).join(''))].sort(), ['colony', 'explorer', 'fleet', 'harvester', 'settler', 'shipyard'], 'units and buildings draw their icons');
const vocab = drawn(catalog.iconText('Build or commission. Move one group, +1 movement. Colonize. Add 2 hits. Prevent 1 hit. Draw two cards. Gain 2 Prestige. Raise each resource limit by 1.'));
for (const name of ['build', 'move', 'colonize', 'hit', 'shield', 'draw', 'prestige', 'limit']) assert.ok(vocab.has(name), `card text draws ${name}`);
// Pages that cannot run the module: the rulebook (and the docs site built from it) carries the
// whole sprite, and loads no icon that is not one of the twenty.
const rulebook = read('prototypes/galactic-reach/rulebook.html');
for (const name of TWENTY) for (const id of [`icon-${name}`, `icon-${name}-small`]) assert.ok(rulebook.includes(`<symbol id="${id}"`), `rulebook sprite lacks ${id}`);
for (const [, id] of rulebook.matchAll(/href="#(icon-[a-z-]+)"/g)) assert.ok(TWENTY.some(n => id === `icon-${n}` || id === `icon-${n}-small`), `rulebook uses a symbol outside the set: ${id}`);
// Pages that draw symbols load icons.js before the scripts that draw.
for (const [page, before] of [['prototypes/galactic-reach/index.html', 'app.js'], ['prototypes/galactic-reach/cards.html', 'app.js'], ['prototypes/tabletop/board.html', 'board.js'], ['prototypes/lab/index.html', '/lab/lab.js']]) {
  const html = read(page), at = html.search(/<script[^>]*src="(\/galactic-reach\/)?icons\.js/);
  assert.ok(at >= 0 && at < html.indexOf(`src="${before}`), `${page} loads icons.js before ${before}`);
}
const gallery = read('prototypes/galactic-reach/cards.html');
assert.match(gallery, /id="icon-set"/, 'the card gallery has its Symbols section');
assert.match(gallery, /icons\.NAMES\.map/, 'the Symbols section lists every icon in the set');
for (const file of ['scripts/build-web.sh']) assert.match(read(file), /icons\.js/, `${file} packages icons.js`);
// The landing page (lab) and the public board load it before sign-in.
assert.ok(read('crates/server/src/access.rs').includes('"/galactic-reach/icons.js"'), 'icons.js is public: the landing page draws Prestige with it');
assert.ok(read('crates/server/src/tabletop.rs').includes('"/tabletop/icons.js"'), 'the public board can load icons.js');

// 4. Max explicitly keeps his four earlier resource shapes. Only that constant
// may contain them; all other shipped drawings still use the shared set.
const maxShapes=app.match(/const MAX_RESOURCE_SHAPES = \{([\s\S]*?)\n  \};/)?.[0];
assert.ok(maxShapes,'Max resource alternatives are scoped to their own constant');
for(const shape of ['m12 2 8 7-3 11H7L4 9z','M13.5 2 5 13h6l-.5 9L19 10h-6z','M20 4C11 4 5 8.5 5 15','m10.7 7.2-3.4 8.6'])assert.ok(maxShapes.includes(shape));
assert.match(read('prototypes/galactic-reach/max-ui.css'),/body\.background-stars svg\[data-max-resource\] > \.max-resource-shape \{ display:inline;/);
// No other old symbol remains in a shipped page (archived engines keep theirs).
const OLD = ['m12 2 8 7-3 11H7L4 9z', 'M13.5 2 5 13h6l-.5 9L19 10h-6z', 'M20 4C11 4 5 8.5 5 15', 'm10.7 7.2-3.4 8.6', '12 2 19 21 12 17 5 21 12 2',
  'M4 21v-3a5 5 0 0 1 10 0v3', 'M9 12a22 22 0 0 1 2-3.95', 'M3 10a2 2 0 0 1 .709-1.528', 'm14 13-8.381 8.38', 'M20.341 6.484A10 10 0 0 1 10.266 21.85',
  'M12 2v7M12 15v7M2 12h7', 'rect x="5" y="3" width="11" height="15" rx="2"', 'M3 9l3-3M15 21l3-3', 'M12 2 4 5v6c0 5 3.4 9.3 8 11', 'M5 4h12l-2.5 4L17 12H5',
  'm14 4 6 6-3 3-6-6z', 'm13 6 6 6-6 6', 'vocab-limit" aria-hidden="true"><i></i>', 'M4 4l11 11M20 4 9 15', 'M4 8h15M15 4l4 4-4 4', 'M7 4h10l4 5-9 11L3 9z',
  'M6 21V4M6 4h12', 'M4 20h16M6 20V10l6-5', 'M3 12h16M13 6l6 6-6 6', 'M12 3l2.7 5.6 6.1.9', 'rect x="9" y="3" width="11" height="15"', 'id="v-move"', 'id="v-build"'];
const SHIPPED = ['prototypes/galactic-reach', 'prototypes/tabletop', 'prototypes/lab', 'site'].flatMap(dir =>
  fs.readdirSync(path.join(root, dir)).filter(f => /\.(js|html|css)$/.test(f)).map(f => `${dir}/${f}`));
// ★ and ◈ stay only as words-in-waiting: the walkthrough's notes (guide.js and tutorial.js draw
// them with icons.glyphs), icons.js's own table of them, and the release notes, which change only
// at a release cut.
const TOKEN_FILES = new Set(['prototypes/galactic-reach/guide.js', 'prototypes/galactic-reach/tutorial.js', 'prototypes/galactic-reach/icons.js']);
const left = [];
for (const file of SHIPPED) {
  let text = read(file);
  if(file==='prototypes/galactic-reach/app.js')text=text.replace(maxShapes,'');
  for (const sig of OLD) if (text.includes(sig)) left.push(`${file}: old drawing ${sig}`);
  if (TOKEN_FILES.has(file)) continue;
  if (file.endsWith('/index.html')) text = text.replace(/<details class="playtest-changes"[\s\S]*?<\/details>/, '');
  // A ★ handed to icons.glyphs is drawn as the icon; comments are not drawn.
  text = text.replace(/glyphs\('★'\)/g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const [i, line] of text.split('\n').entries()) if (/[★◈]/.test(line)) left.push(`${file}:${i + 1}: ${line.trim().slice(0, 90)}`);
}
assert.deepEqual(left, [], `old symbols remain:\n  ${left.join('\n  ')}`);
// The walkthrough draws its ★ and ◈ through the icon set.
assert.match(read('prototypes/galactic-reach/guide.js'), /heirsIcons\.glyphs\(/, 'guide.js draws ★ and ◈ as icons');

// 5. An interface control never takes a game symbol. The twenty stand for game things; the
//    table's own controls and marks keep their own drawings.
//    a. The interface glyphs that are not among the twenty draw nothing from the set.
const DRAWS_FROM_SET = /hx-|data-hx-slot|\bicon\(|boardGlyph|boardIcon|vocabIcon|resourceDots?\(|cornerDots|cardSymbol|BOARD_ICONS|VOCAB_ICONS|RELIC_ICON|PRESTIGE_MARK|heirsIcons/;
const constant = (file, name) => read(file).match(new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n  \\};|[^\\n]*;)`))?.[1];
for (const [file, name, what] of [['prototypes/galactic-reach/app.js', 'PORTAL_GLYPH', 'the corner portal ring'], ['prototypes/galactic-reach/app.js', 'LOCK_ICON', 'the limit lock on a price chip'],
  ['prototypes/galactic-reach/app.js', 'LOG_ICONS', 'comms events with no counterpart among the twenty']]) {
  const body = constant(file, name);
  assert.ok(body, `${file} defines ${name} (${what})`);
  assert.doesNotMatch(body, DRAWS_FROM_SET, `${name} (${what}) is an interface glyph and must keep its own drawing`);
}
// The comms feed draws a star icon only for events that are one of the twenty.
assert.deepEqual(Object.keys(vm.runInNewContext(`(${constant('prototypes/galactic-reach/app.js', 'LOG_ICONS').slice(0, -1)})`)).sort(), ['buy', 'convert', 'event', 'pass', 'production', 'trash', 'upgrade'], 'LOG_ICONS keeps only the events with no star icon');
assert.match(read('prototypes/galactic-reach/guide.js'), /pointer\.innerHTML = '<svg viewBox="0 0 28 30">/, 'the walkthrough pointer keeps its arrow');
//    b. Every button that draws a game symbol is one whose symbol means that game thing: card
//       corners and cards, a resource choice, the bank's resources, the Relics card bank. A new
//       control drawing a symbol fails here until it is added with its game meaning.
const SYMBOL_BUTTONS = [
  [/corner-button/, 'a card corner: the card\'s order or conversion (rules #card-corners)'],
  [/class="game-card\b/, 'a card: its corners, price and text'],
  [/data-consortium-gain=/, 'a choice of resource to gain'],
  [/bank-resource-button/, 'a resource to give or take at the bank'],
  [/data-card-bank="relics"/, 'the Relics card bank (relics are excavated: Excavate)'],
  [/data-mat-units=/, 'combat pieces: inspect that ship type or Shipyard and its exact hull (rules #combat-table)'],
];
const symbolButtons = [];
for (const file of ['prototypes/galactic-reach/app.js', 'prototypes/galactic-reach/index.html', 'prototypes/galactic-reach/guide.js', 'prototypes/galactic-reach/tutorial.js',
  'prototypes/galactic-reach/card-feel.js', 'prototypes/galactic-reach/phone.js', 'prototypes/galactic-reach/cards.html', 'prototypes/galactic-reach/table.js', 'prototypes/galactic-reach/tabletop-controls.js']) {
  for (const m of read(file).matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    if (!DRAWS_FROM_SET.test(m[2])) continue;
    const kind = SYMBOL_BUTTONS.find(([attr]) => attr.test(m[1]));
    assert.ok(kind, `${file}: an interface control draws a game symbol: <button${m[1].slice(0, 80)}>; give it its own glyph, or add it to SYMBOL_BUTTONS with its game meaning`);
    symbolButtons.push(kind[1]);
  }
}
//    c. A static page fills symbol slots only where its symbol is that game thing.
const SLOTS = { 'prototypes/galactic-reach/index.html': ['excavate', 'excavate'] };
for (const [page, names] of Object.entries(SLOTS)) assert.deepEqual([...read(page).matchAll(/data-hx-slot="([a-z]+)"/g)].map(m => m[1]), names, `${page}: symbol slots are the Relics card bank and the map key's located relic`);

console.log(`Icons: all ${TWENTY.length} defined, generated copies current, each drawn by the game; no old symbol in ${SHIPPED.length} shipped files.`);
