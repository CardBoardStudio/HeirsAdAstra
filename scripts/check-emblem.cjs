// The Heirs Ad Astra emblem leads each word with four speed lines, one per resource, in the
// order the game lists the resources. A standalone SVG (favicon, <img>) cannot read the game's
// CSS custom properties, so this checks its line colours against prototypes/galactic-reach/palette.css.
// The header mark and the favicon are the round emblem reduced: same rings, same radii, same weights.
//   node scripts/check-emblem.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const resources = JSON.parse(read('prototypes/galactic-reach/app.js').match(/const RESOURCES = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
assert.deepEqual(resources, ['matter', 'energy', 'biomass', 'data'], 'the emblem has one line per resource; redraw it if the resources change');
const palette = read('prototypes/galactic-reach/palette.css');
const colours = resources.map(name => palette.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})\\s*;`, 'i'))[1].toLowerCase());

for (const [file, words] of [['prototypes/lab/heirs-emblem.svg', 3], ['prototypes/lab/heirs-emblem-round.svg', 3], ['prototypes/lab/heirs-emblem-mark.svg', 1], ['prototypes/lab/heirs-emblem-favicon.svg', 1]]) {
  const svg = read(file);
  const lines = [...svg.matchAll(/<rect fill="(#[0-9a-f]{6})"/gi)].map(m => m[1].toLowerCase());
  assert.deepEqual(lines, Array(words).fill(colours).flat(), `${file}: speed lines must be the resource colours in game order`);
  assert.doesNotMatch(svg, /<text|font-family/, `${file}: lettering must not depend on a font`);
}

// The rim: outer and inner ring radii, and the ratio of their stroke weights, match the round emblem.
const rings = file => [...read(file).matchAll(/<circle cx="100" cy="100" r="([\d.]+)" stroke-width="([\d.]+)"\/>/g)].map(m => [+m[1], +m[2]]);
const [[outerR, outerW], [innerR, innerW]] = rings('prototypes/lab/heirs-emblem-round.svg');
for (const file of ['prototypes/lab/heirs-emblem-mark.svg', 'prototypes/lab/heirs-emblem-favicon.svg']) {
  const [[r1, w1], [r2, w2]] = rings(file);
  assert.deepEqual([r1, r2], [outerR, innerR], `${file}: rings must sit at the round emblem's radii`);
  assert.ok(Math.abs(w1 / w2 - outerW / innerW) < 0.02, `${file}: outer and inner ring weights must keep the round emblem's ratio`);
}

const lab = read('prototypes/lab/index.html');
assert.match(lab, /<link rel="icon" type="image\/svg\+xml" href="\/lab\/heirs-emblem-favicon\.svg"/);
assert.match(lab, /<img class="brand-icon" src="\/lab\/heirs-emblem-mark\.svg" alt=""/);
// The home page hero shows the round emblem from its one file, beside the "Heirs Ad Astra" heading
// (so the image is decorative), with its box reserved before the file loads.
const labJs = read('prototypes/lab/lab.js');
assert.match(labJs, /<h2>Heirs Ad Astra<\/h2>.*<div class="hero-art"><img class="hero-emblem" src="\/lab\/heirs-emblem-round\.svg" alt="" width="178" height="178"><\/div>/);
const build = read('scripts/build-web.sh');
assert.match(build, /cp prototypes\/lab\/heirs-emblem\.svg prototypes\/lab\/heirs-emblem-round\.svg prototypes\/lab\/heirs-emblem-mark\.svg prototypes\/lab\/heirs-emblem-favicon\.svg dist\/lab\//);
for (const file of ['/lab/heirs-emblem.svg', '/lab/heirs-emblem-round.svg', '/lab/heirs-emblem-mark.svg', '/lab/heirs-emblem-favicon.svg'])
  assert.ok(read('crates/server/src/access.rs').includes(`"${file}"`), `${file} must be public: the invite-only landing page shows it`);
console.log('Emblem: speed lines match the resource colours', colours.join(' '), '| mark and favicon rims match the round emblem');

// The game's twenty symbols are checked in the same CI step: scripts/check-icons.cjs.
require('./check-icons.cjs');
