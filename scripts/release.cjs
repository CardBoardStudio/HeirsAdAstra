#!/usr/bin/env node
// Galactic Reach releases (docs/release.md).
//
//   node scripts/release.cjs status [--released origin/stable]
//   node scripts/release.cjs cut [--name "Harbor Ships playtest"] [--released origin/stable]
//   node scripts/release.cjs check [--base origin/main] [--head-ref <branch>] [--base-ref <branch>]
//
// Change PRs merge into main with one entry in changes/. `cut` turns the pending
// entries into one release: when any entry changes rules it bumps
// SAVE_FORMAT_VERSION and RULES_REVISION once, archives the released engine
// exactly as it is on the stable branch, updates every version declaration,
// writes docs/releases.md and the game's "New in this playtest" panel, then
// deletes the entries. Running it again in the same cycle only adds entries
// merged since. `check` is the CI policy for change and Release PRs.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(process.env.RELEASE_ROOT || path.join(__dirname, '..'));
const CHANGES = 'changes';
const GAME = 'prototypes/galactic-reach';
const LIB = 'crates/galactic-reach/src/lib.rs';
const NOTES = 'docs/releases.md';
// The released browser and engine files an archive keeps (as for v32-*).
const ARCHIVED = ['app.js', 'adapter.js', 'index.html', 'styles.css', 'rulebook.html', 'rulebook.css', 'replay.js',
  'playtest-notes.js', 'playtest-notes.css', 'shared.js', 'cards.html'];
// Files that assert or declare the current `galactic-reach/<save>.<rev>`.
const DECLARES = [`${GAME}/adapter.js`, `${GAME}/replay.js`, 'crates/server/src/arena.rs', 'scripts/smoke.py'];
// Player-facing labels that name the current version and release.
const LABELS = [`${GAME}/index.html`, `${GAME}/cards.html`, `${GAME}/rulebook.html`];

const file = rel => path.join(ROOT, rel);
const read = rel => fs.readFileSync(file(rel), 'utf8');
const write = (rel, text) => { fs.mkdirSync(path.dirname(file(rel)), { recursive: true }); fs.writeFileSync(file(rel), text); };
const exists = rel => fs.existsSync(file(rel));
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
const show = (ref, rel) => git('show', `${ref}:${rel}`);
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');
function fail(message) { console.error(`release: ${message}`); process.exit(1); }

function args(list) {
  const out = { _: [] };
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].startsWith('--')) out[list[i].slice(2)] = list[i + 1], i += 1;
    else out._.push(list[i]);
  }
  return out;
}

/** The version an app.js and lib.rs declare. */
function version(app, lib) {
  const save = Number(/const SAVE_FORMAT_VERSION = (\d+);/.exec(app)?.[1]);
  const rev = Number(/const RULES_REVISION = (\d+);/.exec(app)?.[1]);
  const name = /pub const EXPERIMENT: &str = "([^"]+)";/.exec(lib)?.[1];
  if (!save || !rev || !name) fail('cannot read SAVE_FORMAT_VERSION, RULES_REVISION and EXPERIMENT');
  return { save, rev, name, label: `${save}.${rev}`, rules: `galactic-reach/${save}.${rev}` };
}
const working = () => version(read(`${GAME}/app.js`), read(LIB));
const released = ref => ({ ...version(show(ref, `${GAME}/app.js`), show(ref, LIB)), commit: git('rev-parse', '--short', ref).trim() });

/** A pending entry: front matter (compat, title, optional pr) and a short body. */
function parseEntry(name, text) {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, '\n'));
  if (!match) throw new Error(`${name}: start with --- front matter ---`);
  const meta = Object.fromEntries(match[1].split('\n').filter(Boolean).map(line => {
    const at = line.indexOf(':');
    return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
  }));
  if (!['safe', 'breaking'].includes(meta.compat)) throw new Error(`${name}: compat must be safe or breaking`);
  if (!meta.title) throw new Error(`${name}: give a title`);
  return { name, compat: meta.compat, title: meta.title, pr: meta.pr || '', body: match[2].trim() };
}
const entryNames = list => list.filter(n => n.endsWith('.md') && n !== 'README.md').sort();
function pending() {
  if (!exists(CHANGES)) return [];
  return entryNames(fs.readdirSync(file(CHANGES))).map(n => parseEntry(n, read(`${CHANGES}/${n}`)));
}

// Entry bodies are plain text with [label](href) links and **bold**.
const html = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, href) => `<a href="${href.replace(/^(\.\.\/)*prototypes\/galactic-reach\//, '')}">${text}</a>`);
const slug = name => name.toLowerCase().replace(/ playtest$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Inserts `line` after every line matching `pattern`, unless it already follows. */
function cloneAfter(text, pattern, change) {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!pattern.test(lines[i])) continue;
    const clone = change(lines[i]);
    if (clone !== lines[i] && lines[i + 1] !== clone) lines.splice(i + 1, 0, clone);
  }
  return lines.join('\n');
}
function replaceIn(rel, edits) {
  let text = read(rel);
  for (const [from, to] of edits) text = text.replace(from, to);
  write(rel, text);
}

/** Bump `from` (the released version) to `to`, archiving `from` from `ref`. */
function bump(ref, from, to) {
  const prev = `galactic-reach/${from.save - 1}.${from.rev - 1}`;
  const v = n => `v${n}-`;
  // 1. Archive the released files exactly as the stable branch has them.
  const hashes = {};
  for (const asset of ARCHIVED) {
    const rel = `crates/galactic-reach/rules/v${from.save}-${asset}`;
    write(rel, show(ref, `${GAME}/${asset}`));
    hashes[rel] = sha256(fs.readFileSync(file(rel)));
  }
  write(`scripts/archive-hashes/v${from.save}.json`, `${JSON.stringify(hashes, null, 2)}\n`);
  // 2. The engine crate: current rules, shared rules, archived engine arms.
  let lib = read(LIB);
  lib = lib.replace(`pub const RULES: &str = "${from.rules}";`, `pub const RULES: &str = "${to.rules}";`)
    .replace(`pub const EXPERIMENT: &str = "${from.name}";`, `pub const EXPERIMENT: &str = "${to.name}";`);
  const shared = /pub const SHARED_RULES: \[&str; (\d+)\] = \[\n(\s*)RULES,\n/.exec(lib);
  if (!shared) fail(`${LIB}: SHARED_RULES no longer starts with RULES`);
  if (!lib.includes(`RULES,\n${shared[2]}"${from.rules}",`)) {
    lib = lib.replace(shared[0], `pub const SHARED_RULES: [&str; ${Number(shared[1]) + 1}] = [\n${shared[2]}RULES,\n${shared[2]}"${from.rules}",\n`);
  }
  if (!lib.includes(`"${prev}"`)) fail(`${LIB} does not name the previous archive ${prev}; add ${from.rules} by hand`);
  lib = cloneAfter(lib, new RegExp(`"${escape(prev)}"`), line => line.split(prev).join(from.rules).split(v(from.save - 1)).join(v(from.save)));
  write(LIB, lib);
  // 3. Saved solo tables accept the new version pair.
  replaceIn('crates/server/src/tables.rs', [
    [`(s["version"] == ${from.save} && s["rulesRevision"] == ${from.rev}))`,
      `(s["version"] == ${from.save} && s["rulesRevision"] == ${from.rev})\n        || (s["version"] == ${to.save} && s["rulesRevision"] == ${to.rev}))`],
    [new RegExp(`"version":${from.save},"rulesRevision":${from.rev}`, 'g'), `"version":${to.save},"rulesRevision":${to.rev}`],
  ]);
  // 4. The web build serves the archive at /galactic-reach/rules/<from>/.
  let build = read('scripts/build-web.sh');
  if (!build.includes(`dist/galactic-reach/rules/${from.label}\n`)) {
    const marker = '# Testnet seat';
    build = build.replace(marker, `# Preserve the exact ${from.label} ${from.name.replace(/ playtest$/, '')} browser and shared-table engine.
mkdir -p dist/galactic-reach/rules/${from.label}
for asset in ${ARCHIVED.join(' ')}; do
  cp "crates/galactic-reach/rules/v${from.save}-$asset" "dist/galactic-reach/rules/${from.label}/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/${from.label}/table.js

${marker}`);
    write('scripts/build-web.sh', build);
  }
  // 5. Saved tables and replays route the old version to its archive.
  replaceIn(`${GAME}/table.js`, [[`'${from.rules}':{format:${from.save},path:'/galactic-reach/'}`,
    `'${from.rules}':{format:${from.save},path:'/galactic-reach/rules/${from.label}/'},'${to.rules}':{format:${to.save},path:'/galactic-reach/'}`]]);
  replaceIn('prototypes/lab/replay.js', [[`'${from.rules}':'/galactic-reach/'`,
    `'${from.rules}':'/galactic-reach/rules/${from.label}/','${to.rules}':'/galactic-reach/'`]]);
  // 6. Version declarations and the tests that assert the current version.
  const tests = fs.readdirSync(file('scripts')).filter(n => /^test-.*\.cjs$/.test(n) && n !== 'test-release.cjs').map(n => `scripts/${n}`);
  for (const rel of [...DECLARES, ...tests]) {
    replaceIn(rel, [[new RegExp(escape(from.rules), 'g'), to.rules],
      [new RegExp(`(\\.version,\\s*)${from.save}\\)`, 'g'), `$1${to.save})`],
      [new RegExp(`(rulesRevision,\\s*)${from.rev}\\)`, 'g'), `$1${to.rev})`]]);
  }
  replaceIn(`${GAME}/app.js`, [[`const SAVE_FORMAT_VERSION = ${from.save};`, `const SAVE_FORMAT_VERSION = ${to.save};`],
    [`const RULES_REVISION = ${from.rev};`, `const RULES_REVISION = ${to.rev};`]]);
  // 7. Player-facing labels: version, release name and cache-busting query.
  const archiveLink = `<a href="rules/${from.label}/">Continue a ${from.label} game</a> · `;
  for (const rel of LABELS) {
    let text = read(rel)
      .replace(new RegExp(`\\?v=[a-z0-9-]+-${from.save}-${from.rev}`, 'g'), `?v=${slug(to.name)}-${to.save}-${to.rev}`)
      .replace(new RegExp(escape(from.label), 'g'), to.label)
      .replace(new RegExp(escape(from.name), 'g'), to.name)
      .replace(new RegExp(escape(from.name.toUpperCase()), 'g'), to.name.toUpperCase());
    if (rel.endsWith('index.html')) {
      text = text.replace(/(\d+\.\d+) playtest, built on the (\d+\.\d+) (.+?) rules/,
        `${to.label} playtest, built on the ${from.label} ${from.name.replace(/ playtest$/, '')} rules`);
      if (!text.includes(archiveLink)) text = text.replace('<a href="rules/', `${archiveLink}<a href="rules/`);
    }
    write(rel, text);
  }
  replaceIn('docs/rules/README.md', [[/\*\*Galactic Reach [\d.]+ \/ [^*]+\*\*/, `**Galactic Reach ${to.label} / ${to.name}**`]]);
}

/** Adds this cycle's entries to docs/releases.md and the game's panel. */
function notes(from, to, entries, bumped) {
  const key = `<!-- release after ${from.commit} -->`;
  const heading = bumped ? `## ${to.label} · ${to.name}` : `## ${to.label} · save-compatible update`;
  const lead = bumped
    ? `Rules-changing release: start a new game. Unfinished ${from.label} games and tables keep the archived ${from.label} ${from.name} engine.`
    : 'Save-compatible release: games in progress continue.';
  const line = e => `- **${e.title}**${e.compat === 'breaking' ? ' (rules change)' : ''}${e.pr ? ` (#${e.pr})` : ''}: ${e.body.replace(/\s*\n\s*/g, ' ')}`;
  let doc = exists(NOTES) ? read(NOTES) : '# Galactic Reach releases\n\nNewest first. Each section is written by `node scripts/release.cjs cut` from the `changes/` entries merged since the previous release ([release process](release.md)).\n';
  const first = !doc.includes(key);
  if (first) {
    const start = doc.indexOf('\n## ');
    const section = `${heading}\n\n${key}\n${lead}\n`;
    doc = start < 0 ? `${doc.trimEnd()}\n\n${section}` : `${doc.slice(0, start)}\n${section}${doc.slice(start)}`;
  }
  const at = doc.indexOf(key);
  const end = doc.indexOf('\n## ', at);
  const head = doc.slice(0, end < 0 ? doc.length : end).trimEnd();
  doc = `${head}\n${entries.map(line).join('\n')}\n${end < 0 ? '' : doc.slice(end)}`;
  write(NOTES, doc);

  // The game's "New in this playtest" panel: a rules-changing release starts a
  // fresh list; a later cut in the same cycle or a save-compatible one adds to it.
  const index = `${GAME}/index.html`;
  let page = read(index);
  const items = /(<!-- release:items -->)([\s\S]*?)(\n\s*<!-- \/release:items -->)/.exec(page);
  if (!items) fail(`${index}: missing <!-- release:items --> markers`);
  const li = e => `\n        <li><strong>${html(e.title)}:</strong> ${html(e.body.replace(/\s*\n\s*/g, ' '))}</li>`;
  page = page.replace(items[0], `${items[1]}${bumped && first ? '' : items[2]}${entries.map(li).join('')}${items[3]}`);
  const lead_ = bumped && first ? entries.find(e => e.compat === 'breaking') : null;
  if (lead_) page = page.replace(/(<!-- release:summary -->)[\s\S]*?(<!-- \/release:summary -->)/,
    `$1${to.label} ${html(to.name.replace(/ playtest$/, ''))}: ${html(lead_.title)}$2`);
  write(index, page);
}

function cut(opts) {
  const ref = opts.released || 'origin/stable';
  const from = released(ref);
  const now = working();
  const entries = pending();
  const breaking = entries.some(e => e.compat === 'breaking');
  const already = now.save !== from.save || now.rev !== from.rev;
  if (!entries.length) fail(already ? `already cut ${now.label}; nothing new in ${CHANGES}/` : `nothing to release: ${CHANGES}/ is empty`);
  if (already && (now.save !== from.save + 1 || now.rev !== from.rev + 1)) fail(`${now.label} is not one release after ${from.label} on ${ref}`);
  const bumped = breaking || already;
  const to = bumped ? { save: from.save + 1, rev: from.rev + 1, name: already ? now.name : opts.name } : from;
  if (bumped && !to.name) fail('this release changes rules: give its player-facing --name, e.g. --name "Harbor Ships playtest"');
  to.label = `${to.save}.${to.rev}`;
  to.rules = `galactic-reach/${to.label}`;
  if (bumped && !already) bump(ref, from, to);
  notes(from, to, entries, bumped);
  for (const e of entries) fs.unlinkSync(file(`${CHANGES}/${e.name}`));
  console.log(`${bumped ? `Cut ${to.label} ${to.name} (archived ${from.label} from ${ref})` : `Cut a save-compatible ${to.label} update`} with ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}.`);
  if (bumped && !already) {
    console.log(`Review by hand before opening the Release PR:
  - ${GAME}/rulebook.html prose that should say "${to.label}" (the masthead and labels are updated)
  - the player-facing description in crates/server/src/arena.rs (catalog)
  - git grep -n "${from.label}" for statements that now describe an archived release
Then run the checks in docs/release.md#cut-a-release.`);
  }
}

function status(opts) {
  const ref = opts.released || 'origin/stable';
  const now = working();
  const entries = pending();
  const breaking = entries.filter(e => e.compat === 'breaking').length;
  let from = null;
  try { from = released(ref); } catch (_) { /* no stable branch yet */ }
  console.log(`main declares ${now.label} ${now.name}; ${ref}: ${from ? `${from.label} at ${from.commit}` : 'not found'}`);
  console.log(`dev builds deal ${now.rules}+dev.${breaking}`);
  for (const e of entries) console.log(`  ${e.compat.padEnd(8)} ${e.name}: ${e.title}`);
  if (!entries.length) console.log('  (no pending entries)');
  else console.log(`next release: ${breaking || (from && now.label !== from.label) ? `${from ? `${from.save + 1}.${from.rev + 1}` : 'next'} (rules change)` : `${now.label} save-compatible update`}`);
}

/** CI policy. A change PR into main adds entries but never deletes them, edits
 * no archived engine and changes no version. A Release PR into stable carries
 * no pending entries (cut first). release/* branches are the cut itself. */
function check(opts) {
  const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')) : {};
  const headRef = opts['head-ref'] ?? process.env.GITHUB_HEAD_REF ?? '';
  const baseRef = opts['base-ref'] ?? process.env.GITHUB_BASE_REF ?? 'main';
  const base = opts.base || `origin/${baseRef}`;
  const errors = [];
  for (const e of exists(CHANGES) ? entryNames(fs.readdirSync(file(CHANGES))) : []) {
    try { parseEntry(e, read(`${CHANGES}/${e}`)); } catch (err) { errors.push(err.message); }
  }
  if (baseRef === 'stable') {
    if (pending().length) errors.push(`a Release PR must not carry pending ${CHANGES}/ entries: run \`node scripts/release.cjs cut\` on a release/* branch into main first`);
  } else if (!headRef.startsWith('release/')) {
    const mergeBase = git('merge-base', base, 'HEAD').trim();
    const diff = git('diff', '--name-status', '--find-renames', mergeBase).trim().split('\n').filter(Boolean).map(l => l.split('\t'));
    for (const [status, a, b] of diff) {
      if (a.startsWith(`${CHANGES}/`) && a !== `${CHANGES}/README.md` && /^[DR]/.test(status)) errors.push(`${a}: entries are only removed by a release cut`);
      if ((a.startsWith('crates/galactic-reach/rules/') || a.startsWith('scripts/archive-hashes/')) && status !== 'A') errors.push(`${a}: archived engines never change`);
      if (b && b.startsWith('crates/galactic-reach/rules/')) errors.push(`${b}: archived engines never change`);
    }
    const before = version(git('show', `${mergeBase}:${GAME}/app.js`), git('show', `${mergeBase}:${LIB}`));
    const after = working();
    if (before.label !== after.label || before.name !== after.name) errors.push(`version ${before.label} ${before.name} → ${after.label} ${after.name}: versions change only in a release cut`);
    const labels = (event.pull_request?.labels || []).map(l => l.name);
    const added = diff.filter(([s, a]) => s === 'A' && a.startsWith(`${CHANGES}/`) && a !== `${CHANGES}/README.md`)
      .map(([, a]) => parseEntry(path.basename(a), read(a)));
    if (labels.includes('playtest-breaking') && !added.some(e => e.compat === 'breaking')) errors.push(`a playtest-breaking PR adds a ${CHANGES}/ entry with compat: breaking`);
    if (labels.includes('playtest-safe') && added.some(e => e.compat === 'breaking')) errors.push(`a playtest-safe PR cannot add a compat: breaking entry`);
  }
  if (errors.length) fail(`policy check failed:\n  ${errors.join('\n  ')}`);
  console.log('Release policy check passed.');
}

if (require.main === module) {
  const opts = args(process.argv.slice(2));
  const command = { status, cut, check }[opts._[0]];
  if (!command) fail('usage: release.cjs status|cut|check (see docs/release.md)');
  command(opts);
}
module.exports = { parseEntry, version, cloneAfter, html, slug };
