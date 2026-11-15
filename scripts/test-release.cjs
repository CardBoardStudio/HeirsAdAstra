// Release tooling (docs/release.md): entry parsing, archive integrity, and one
// full cut of two change PRs into a single release in a scratch clone.
'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { parseEntry, cloneAfter, html, nextRelease } = require('./release.cjs');

const root = path.join(__dirname, '..');

// Entries.
const entry = parseEntry('a.md', '---\ncompat: breaking\ntitle: Harbors\npr: 57\n---\nA **Fleet** heals. [Combat](rulebook.html#combat).\n');
assert.deepEqual(entry, { name: 'a.md', compat: 'breaking', title: 'Harbors', pr: '57', body: 'A **Fleet** heals. [Combat](rulebook.html#combat).' });
assert.throws(() => parseEntry('b.md', '---\ncompat: maybe\ntitle: X\n---\n'), /compat must be safe or breaking/);
assert.throws(() => parseEntry('c.md', 'no front matter'), /front matter/);
assert.equal(html('A **Fleet** <b> [Combat](../prototypes/galactic-reach/rulebook.html#combat)'),
  'A <strong>Fleet</strong> &lt;b&gt; <a href="rulebook.html#combat">Combat</a>');
assert.equal(cloneAfter('a "x/1"\nb\n', /"x\/1"/, l => l.replace('x/1', 'x/2')), 'a "x/1"\na "x/2"\nb\n');
assert.equal(cloneAfter('a "x/1"\na "x/2"\n', /"x\/1"/, l => l.replace('x/1', 'x/2')), 'a "x/1"\na "x/2"\n', 'idempotent');

// Published experiment identifiers are never reused by the next stable cut.
assert.deepEqual(nextRelease({save:34,rev:39}, n=>[35,36].includes(n)),{save:37,rev:42});
assert.deepEqual(nextRelease({save:37,rev:42}, ()=>false),{save:38,rev:43});

// Every archive the cut wrote still has its published bytes.
const hashes = path.join(root, 'scripts/archive-hashes');
for (const name of fs.existsSync(hashes) ? fs.readdirSync(hashes) : []) {
  for (const [rel, hash] of Object.entries(JSON.parse(fs.readFileSync(path.join(hashes, name), 'utf8')))) {
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex'), hash, `${rel} must stay the released file`);
  }
}

// Worked example: two change PRs merge to main, one cut, one version bump.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gr-release-'));
try {
  const repo = path.join(tmp, 'repo');
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  const release = (...args) => execFileSync(process.execPath, [path.join(repo, 'scripts/release.cjs'), ...args], { cwd: repo, encoding: 'utf8' });
  execFileSync('git', ['clone', '--quiet', '--no-local', root, repo]);
  // Bring this checkout's (possibly uncommitted) tooling into the clone.
  const local = execFileSync('git', ['ls-files', '-m', '-o', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  for (const rel of local) {
    fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    if (fs.existsSync(path.join(root, rel))) fs.copyFileSync(path.join(root, rel), path.join(repo, rel));
  }
  git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@e', 'commit', '--quiet', '--allow-empty', '-m', 'tooling');
  git('branch', 'stable');
  const app = () => fs.readFileSync(path.join(repo, 'prototypes/galactic-reach/app.js'), 'utf8');
  const from = /SAVE_FORMAT_VERSION = (\d+);[\s\S]*?RULES_REVISION = (\d+);/.exec(app()).slice(1).map(Number);
  const add = (name, compat, title) => fs.writeFileSync(path.join(repo, 'changes', name), `---\ncompat: ${compat}\ntitle: ${title}\n---\n${title} body. [Movement](rulebook.html#movement).\n`);
  fs.mkdirSync(path.join(repo, 'changes'), { recursive: true });
  add('wider-hexes.md', 'safe', 'Wider hexes');
  add('harbors.md', 'breaking', 'Harbors refit Fleets');
  assert.match(release('status', '--released', 'stable'), new RegExp(`\\+dev\\.1`));
  assert.throws(() => release('cut', '--released', 'stable'), /--name/);
  release('cut', '--released', 'stable', '--name', 'Harbor playtest');
  const to = [from[0] + 1, from[1] + 1];
  assert.match(app(), new RegExp(`SAVE_FORMAT_VERSION = ${to[0]};[\\s\\S]*RULES_REVISION = ${to[1]};`), 'one bump for the batch');
  const archived = path.join(repo, `crates/galactic-reach/rules/v${from[0]}-app.js`);
  assert.equal(fs.readFileSync(archived, 'utf8'), git('show', 'stable:prototypes/galactic-reach/app.js'), 'the released engine, byte for byte');
  const lib = fs.readFileSync(path.join(repo, 'crates/galactic-reach/src/lib.rs'), 'utf8');
  assert.match(lib, new RegExp(`pub const RULES: &str = "galactic-reach/${to.join('.')}";`));
  const shared = /SHARED_RULES: \[&str; (\d+)\] = \[\n([\s\S]*?)\n\];/.exec(lib);
  assert.equal(shared[2].split('\n').filter(l => l.includes(`"galactic-reach/${from.join('.')}"`)).length, 1, 'shared tables keep the old revision once');
  assert.equal(Number(shared[1]), shared[2].split('\n').length, 'SHARED_RULES length matches');
  assert.match(lib, new RegExp(`"galactic-reach/${from.join('.')}" => include_str!\\("\\.\\./rules/v${from[0]}-app\\.js"\\)`));
  const notes = fs.readFileSync(path.join(repo, 'docs/releases.md'), 'utf8');
  assert.match(notes, new RegExp(`## ${to.join('.')} · Harbor playtest`));
  assert.match(notes, /- \*\*Harbors refit Fleets\*\* \(rules change\)/);
  assert.match(notes, /- \*\*Wider hexes\*\*:/);
  const page = fs.readFileSync(path.join(repo, 'prototypes/galactic-reach/index.html'), 'utf8');
  assert.match(page, /<!-- release:summary -->\d+\.\d+ Harbor: Harbors refit Fleets<!-- \/release:summary -->/);
  assert.match(page, new RegExp(`<a href="rules/${from.join('.')}/">Continue a ${from.join('.')} game</a>`));
  assert.deepEqual(fs.readdirSync(path.join(repo, 'changes')).filter(n => n !== 'README.md'), [], 'entries are consumed');
  // A change merged after the cut joins the same release without a second bump.
  git('-c', 'user.name=t', '-c', 'user.email=t@e', 'commit', '--quiet', '-am', 'cut', '--allow-empty');
  add('late-fix.md', 'breaking', 'Late fix');
  release('cut', '--released', 'stable');
  assert.match(app(), new RegExp(`SAVE_FORMAT_VERSION = ${to[0]};`), 'still one bump');
  assert.equal((fs.readFileSync(path.join(repo, 'docs/releases.md'), 'utf8').match(new RegExp(`^## ${to.join('.')} `, 'gm')) || []).length, 1, 'one section for the release');
  assert.match(fs.readFileSync(path.join(repo, 'prototypes/galactic-reach/index.html'), 'utf8'), /Harbors refit Fleets[\s\S]*Late fix/);
  assert.throws(() => release('cut', '--released', 'stable'), /nothing new/);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log('Release tooling: entries, archives and a two-PR cut verified.');
