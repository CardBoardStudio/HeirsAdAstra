// Heirs Ad Astra's twenty symbols, drawn as constellations: four-point stars joined by dotted
// "ghost" lines. This file is the one source of truth for every symbol the game, the card
// gallery, the rulebook (scripts/icons.cjs writes its sprite) and the design exports
// (design/icons/) draw. Each icon is a list of stars on a 24-unit grid: [x, y, radius] plus an
// optional opacity (faint stars are the ones that "died off" or trail away), and the pairs of
// stars its lines join.
//
// Two renderings of the same drawing:
//   ghost  the chosen look: dotted joins, for symbols drawn at 24 px or larger;
//   small  for symbols under 24 px, where dots vanish and stars become specks: solid joins
//          and fuller, larger stars, so each symbol stays distinct at 16 px.
// Callers choose by the size they draw at (heirsIcons.svg(name, { small: true })).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.heirsIcons = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';
  // Star radii come from one scale, so the same kind of star is the same size in every icon.
  const DOT = 1.6, SM = 2.4, MD = 2.8, LG = 3.2, XL = 3.6, HERO = 4.4;
  const FAINT = .55;
  const loop = n => Array.from({ length: n }, (_, i) => [i, (i + 1) % n]);
  const chain = n => Array.from({ length: n - 1 }, (_, i) => [i, i + 1]);
  const arc = (cx, cy, r, from, to, n) => Array.from({ length: n }, (_, i) => {
    const a = (from + (to - from) * i / (n - 1)) * Math.PI / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
  const LX = [5, 9.67, 14.33, 19], LY = j => 19.5 - j * 5;

  // In the game's resource order, then the card vocabulary, then units and buildings.
  const ICONS = {
    // A hexagon of stars with a bright centre, three spokes to alternate corners.
    matter: { label: 'Matter', stars: [[12, 3, DOT], [20, 8, DOT], [20, 16, DOT], [12, 21, DOT], [4, 16, DOT], [4, 8, DOT], [12, 12, XL]], joins: [...loop(6), [5, 6], [1, 6], [3, 6]] },
    // Four stars in a bolt.
    energy: { label: 'Energy', stars: [[13, 3.5, XL], [6.5, 10.5, MD], [16.5, 13, LG], [10, 20.5, XL]], joins: chain(4) },
    // An upside-down, unbalanced tree of descent: the faint stars are branches that died off.
    life: { label: 'Life', stars: [[12, 3.5, MD], [7, 9.5, 2, FAINT], [16.5, 9, DOT], [12.5, 14.5, DOT], [20.5, 14, 2, FAINT], [8.5, 20.5, LG], [15.5, 20.5, LG]], joins: [[0, 1], [0, 2], [2, 3], [2, 4], [3, 5], [3, 6]] },
    // One cycle of a sine wave, bright stars at its crest and trough: a signal carrying bits.
    data: { label: 'Data', stars: [[3, 12, DOT], [7.5, 5.5, LG], [12, 12, DOT], [16.5, 18.5, LG], [21, 12, DOT]], joins: chain(5) },
    // An arrow: a shaft of stars and a bright head with its two barbs.
    move: { label: 'Move', stars: [[3, 12, DOT], [9.5, 12, DOT], [19.5, 12, XL], [13.5, 6.5, DOT], [13.5, 17.5, DOT]], joins: [[0, 1], [1, 2], [2, 3], [2, 4]] },
    // A triangle frame braced to a centre star.
    build: { label: 'Build', stars: [[12, 4, LG], [4.5, 18, LG], [19.5, 18, LG], [12, 13.4, DOT]], joins: [[0, 1], [1, 2], [2, 0], [0, 3], [1, 3], [2, 3]] },
    // A flag on its pole, the bright star at the flag's tip.
    colonize: { label: 'Colonize', stars: [[7, 21, DOT], [7, 4, DOT], [17.5, 7.2, LG], [7, 10.5, DOT]], joins: [[0, 1], [1, 2], [2, 3]] },
    // A card: four corners and a bright centre.
    draw: { label: 'Draw a card', stars: [[7, 4, DOT], [17, 4, DOT], [17, 20, DOT], [7, 20, DOT], [12, 12, XL]], joins: loop(4) },
    // A great star among four small ones.
    prestige: { label: 'Prestige', stars: [[12, 12, 9], [4.5, 5, SM], [19.5, 6, 2], [18.5, 19, MD], [5.5, 18, 2]], joins: [] },
    // A cross of four stars struck through a bright centre.
    hit: { label: 'Hit', stars: [[5, 5, DOT], [19, 19, DOT], [19, 5, DOT], [5, 19, DOT], [12, 12, XL]], joins: [[0, 4], [4, 1], [2, 4], [4, 3]] },
    // A shield's outline of stars, a bright star at its heart.
    shield: { label: 'Shield', stars: [[12, 3, DOT], [19, 6.5, DOT], [18, 14.5, DOT], [12, 21, DOT], [6, 14.5, DOT], [5, 6.5, DOT], [12, 11.5, XL]], joins: loop(6) },
    // A staircase of counted columns, one to four: the base row and the rising edge, each column a line.
    limit: { label: 'Limit', stars: [[LX[0], LY(0), SM], [LX[1], LY(0), SM], [LX[2], LY(0), SM], [LX[3], LY(0), SM], [LX[1], LY(1), SM], [LX[2], LY(2), SM], [LX[3], LY(3), SM]], joins: [[4, 1], [5, 2], [6, 3]] },
    // Two arrows passing: give one way, receive the other.
    trade: { label: 'Trade', stars: [[4, 8, DOT], [20, 8, MD], [16, 4, DOT], [20, 16, DOT], [4, 16, MD], [8, 20, DOT]], joins: [[0, 1], [1, 2], [3, 4], [4, 5]] },
    // Parent and child: a bright star with a small one beside it.
    settler: { label: 'Settler', stars: [[10, 9, 4], [10, 20, DOT], [16.5, 14, SM], [16.5, 20, DOT]], joins: [[0, 1], [2, 3], [0, 2]] },
    // A comet: a bright head and a tail of fading stars. Small: the tail's stars are larger and
    // fade less, so it still trails the head at 16 px.
    explorer: { label: 'Explorer', stars: [[18, 6, 4], [13.2, 10.2, SM, .9], [9.6, 13.6, 2, .75], [6.6, 16.6, DOT, .6], [4.2, 19.2, 1.2, .45]], joins: [], small: { min: 2.7, waist: .42, minOpacity: .82 } },
    // A leader with a small star off each shoulder, unjoined. Small: with no lines to hold them,
    // its stars grow more and fill out, so the three still read as one group at 16 px.
    fleet: { label: 'Fleet', stars: [[12, 8, HERO], [5.5, 16.5, SM], [18.5, 16.5, SM]], joins: [], small: { scale: 1.45, waist: .4 } },
    // A dome of stars on its ground line, bright at the top.
    colony: { label: 'Colony', stars: [...arc(12, 18, 8, 180, 360, 7).map(([x, y], i) => [x, y, i === 3 ? LG : 1.2]), [3, 18, 1.2], [21, 18, 1.2]], joins: [...chain(7), [7, 8]] },
    // A sheaf: three stalks tied low, fanning to stars at the heads. The tie sits lower than the
    // sketch's and the stalk ends close together, so the sheaf never reads as Hit's cross.
    harvester: { label: 'Harvester', stars: [[12, 14.5, 2], [5.5, 4.5, MD], [12, 3.5, LG], [18.5, 4.5, MD], [9.5, 20.5, DOT], [12, 21, DOT], [14.5, 20.5, DOT]], joins: [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6]] },
    // A dry dock: a basin with a star resting in it.
    shipyard: { label: 'Shipyard', stars: [[3.5, 8, DOT], [7, 19, DOT], [17, 19, DOT], [20.5, 8, DOT], [12, 12.5, 4]], joins: [[0, 1], [1, 2], [2, 3]] },
    // A plain diamond of stars.
    excavate: { label: 'Excavate', stars: [[12, 3, LG], [20, 12, SM], [12, 21, LG], [4, 12, SM]], joins: loop(4) },
  };
  const NAMES = Object.keys(ICONS);
  // The game's own keys for three of them.
  const ALIASES = { biomass: 'life', miss: 'shield', starbase: 'shipyard', relic: 'excavate' };
  const resolve = name => ICONS[name] ? name : ALIASES[name];

  // ---- Production pass: optical centring and the small rendering. ----
  // Each drawing is moved so its inked box (stars at full radius) sits centred in the square.
  const round = n => Math.round(n * 100) / 100;
  for (const name of NAMES) {
    const icon = ICONS[name];
    const xs = icon.stars.flatMap(([x, , r]) => [x - r, x + r]), ys = icon.stars.flatMap(([, y, r]) => [y - r, y + r]);
    const dx = 12 - (Math.min(...xs) + Math.max(...xs)) / 2, dy = 12 - (Math.min(...ys) + Math.max(...ys)) / 2;
    icon.stars = icon.stars.map(([x, y, r, o = 1]) => [round(x + (name === 'prestige' ? 0 : dx)), round(y + (name === 'prestige' ? 0 : dy)), r, o]);
  }
  // A star with four points; `waist` is how far its sides pinch in (a fuller star at small sizes).
  const star = (x, y, r, waist) => {
    const k = r * waist, f = n => round(n);
    return `M${f(x)} ${f(y - r)}L${f(x + k)} ${f(y - k)}L${f(x + r)} ${f(y)}L${f(x + k)} ${f(y + k)}L${f(x)} ${f(y + r)}L${f(x - k)} ${f(y + k)}L${f(x - r)} ${f(y)}L${f(x - k)} ${f(y - k)}Z`;
  };
  // Small: every star grows, by 0.6 units up to a quarter of its size, so dots read as stars;
  // the prestige sun keeps its size, so the icon keeps its balance. An icon may set its own
  // `small` growth (scale), smallest star (min), fullness (waist) and faintest opacity where that is not enough.
  const smallRadius = r => r >= 6 ? r : Math.min(r * 1.25, Math.max(2.1, r + .6));
  const render = (name, small) => {
    const icon = ICONS[name];
    const groups = new Map();
    const own = small ? icon.small || {} : {};
    for (const [x, y, r, o0] of icon.stars) {
      const o = own.minOpacity ? Math.max(o0, own.minOpacity) : o0;
      const radius = !small ? r : own.scale ? round(r * own.scale) : Math.max(smallRadius(r), own.min || 0);
      const key = String(o);
      groups.set(key, (groups.get(key) || '') + star(x, y, radius, small ? own.waist || .34 : .26));
    }
    const joins = icon.joins.map(([a, b]) => `M${icon.stars[a][0]} ${icon.stars[a][1]}L${icon.stars[b][0]} ${icon.stars[b][1]}`).join('');
    const line = !joins ? '' : small
      ? `<path class="hx-join" d="${joins}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".75"/>`
      : `<path class="hx-join" d="${joins}" fill="none" stroke="currentColor" stroke-width=".9" stroke-dasharray=".2 1.9" stroke-linecap="round" opacity=".8"/>`;
    return line + [...groups].map(([o, d]) => `<path class="hx-star" d="${d}" fill="currentColor" stroke="none"${o === '1' ? '' : ` opacity="${o}"`}/>`).join('');
  };
  const cache = new Map();
  const inner = (name, small = false) => {
    const key = resolve(name);
    if (!key) throw new Error(`No icon named ${name}`);
    const id = `${key}|${small}`;
    if (!cache.has(id)) cache.set(id, render(key, small));
    return cache.get(id);
  };
  // An inline <svg> for a page. It fills the box it is given; colour comes from `color`.
  // small: 'auto' carries both renderings for a box whose size the page's CSS decides (the card
  // corners): styles.css shows the ghost lines once the box is 24 px or larger.
  function svg(name, { small = false, className = '' } = {}) {
    const key = resolve(name);
    const body = small === 'auto' ? `<g class="hx-r-small">${inner(key, true)}</g><g class="hx-r-ghost">${inner(key, false)}</g>` : inner(key, small);
    return `<svg class="hx-icon${small === 'auto' ? ' hx-auto' : ''}${className ? ` ${className}` : ''}" data-icon="${key}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
  }
  // A standalone SVG file (design exports): one rendering, drawn in `color` at 24 px.
  function file(name, { small = false, color = '#f4e3bd' } = {}) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" color="${color}">${inner(name, small)}</svg>\n`;
  }
  // The rulebook's sprite: icon-<name> (ghost) and icon-<name>-small, referenced with <use>.
  function sprite() {
    return NAMES.map(name => `<symbol id="icon-${name}" viewBox="0 0 24 24">${inner(name)}</symbol>\n<symbol id="icon-${name}-small" viewBox="0 0 24 24">${inner(name, true)}</symbol>`).join('\n');
  }
  // Running text keeps two characters as tokens for symbols: ★ (Prestige) and ◈ (a relic,
  // drawn as Excavate's diamond). This draws them, with their words for screen readers.
  const TEXT_GLYPHS = { '★': ['prestige', 'Prestige'], '◈': ['excavate', 'relic'] };
  function glyphs(html, { small = true } = {}) {
    return String(html).replace(/[★◈]/g, ch => {
      const [name, words] = TEXT_GLYPHS[ch];
      return `<span class="hx-glyph hx-glyph-${name}" role="img" aria-label="${words}">${svg(name, { small })}</span>`;
    });
  }
  // Static pages mark a symbol's place with data-hx-slot="<name>" (data-hx-size="ghost" for 24 px
  // and up); this fills each one once the page has loaded.
  function fillSlots(root) {
    for (const slot of root.querySelectorAll('[data-hx-slot]')) slot.innerHTML = svg(slot.dataset.hxSlot, { small: slot.dataset.hxSize !== 'ghost' });
  }
  if (typeof document !== 'undefined' && document.addEventListener && document.querySelectorAll) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => fillSlots(document));
    else fillSlots(document);
  }
  return { fillSlots, NAMES, ALIASES, LABELS: Object.fromEntries(NAMES.map(n => [n, ICONS[n].label])), resolve, inner, svg, file, sprite, glyphs, TEXT_GLYPHS };
});
