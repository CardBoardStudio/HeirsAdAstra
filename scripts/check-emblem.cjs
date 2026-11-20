// The Heirs Ad Astra emblem leads each word with four speed lines, one per resource, in the
// order the game lists the resources. A standalone SVG (favicon, <img>) cannot read the game's
// CSS custom properties, so this checks its line colours against prototypes/galactic-reach/styles.css.
//   node scripts/check-emblem.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const resources = JSON.parse(read('prototypes/galactic-reach/app.js').match(/const RESOURCES = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
assert.deepEqual(resources, ['matter', 'energy', 'biomass', 'data'], 'the emblem has one line per resource; redraw it if the resources change');
const styles = read('prototypes/galactic-reach/styles.css');
const colours = resources.map(name => styles.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})\\s*;`, 'i'))[1].toLowerCase());

for (const [file, words] of [['prototypes/lab/heirs-emblem.svg', 3], ['prototypes/lab/heirs-emblem-mark.svg', 1]]) {
  const svg = read(file);
  const lines = [...svg.matchAll(/<rect fill="(#[0-9a-f]{6})"/gi)].map(m => m[1].toLowerCase());
  assert.deepEqual(lines, Array(words).fill(colours).flat(), `${file}: speed lines must be the resource colours in game order`);
  assert.doesNotMatch(svg, /<text|font-family/, `${file}: lettering must not depend on a font`);
}

const lab = read('prototypes/lab/index.html');
assert.match(lab, /<link rel="icon" type="image\/svg\+xml" href="\/lab\/heirs-emblem-mark\.svg"/);
assert.match(lab, /<img class="brand-icon" src="\/lab\/heirs-emblem-mark\.svg" alt=""/);
const build = read('scripts/build-web.sh');
assert.match(build, /cp prototypes\/lab\/heirs-emblem\.svg prototypes\/lab\/heirs-emblem-mark\.svg dist\/lab\//);
for (const file of ['/lab/heirs-emblem.svg', '/lab/heirs-emblem-mark.svg'])
  assert.ok(read('crates/server/src/access.rs').includes(`"${file}"`), `${file} must be public: the invite-only landing page shows it`);
console.log('Emblem: speed lines match the resource colours', colours.join(' '));
