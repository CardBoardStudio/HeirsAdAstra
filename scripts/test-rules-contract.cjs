// Exercises .github/rules-contract.json and .github/review-conventions.json through the
// shared review-conventions validator, and checks its pin is the same everywhere.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { PIN, REPOSITORY, ROOT, home } = require('./lib/review-conventions.cjs');
const { CONFIG } = require('./check-rules-contract.cjs');
const RULEBOOK = 'prototypes/galactic-reach/rulebook.html';

(async () => {
  const { loadContext, checkBody, checkCommitMessage } = await import(pathToFileURL(path.join(home(), 'src', 'core.mjs')).href);
  const ctx = await loadContext(ROOT, CONFIG);
  const body = '## Rules grounding\n[Round](prototypes/galactic-reach/rulebook.html#round): preserve alternating operations.\n\n## Gameplay impact\nNone: presentation changes preserve all actions and saved-state meaning.\n\n## Verification\nChecks run.';
  const run = (files, text = body) => checkBody({ body: text, files }, ctx).map(f => f.rule);
  assert.deepEqual(run(['prototypes/galactic-reach/styles.css']), []);
  for (const file of ['prototypes/galactic-reach/app.js', 'prototypes/galactic-reach/adapter.js', 'crates/galactic-reach/src/lib.rs', 'crates/galactic-reach/rules/v5-app.js', 'crates/server/src/tables.rs', 'crates/server/src/arena.rs', 'crates/game-core/src/lib.rs']) {
    assert.deepEqual(run([file]), ['rulebook-updated'], file);
    assert.deepEqual(run([file, RULEBOOK]), [], file);
  }
  assert.deepEqual(run(['crates/server/src/accounts.rs', 'crates/galactic-reach/Cargo.toml']), [], 'Other server and crate files are not rule-bearing');
  assert.deepEqual(run(['new-engine.js'], body.replace('None:', 'Changed:')), ['rulebook-updated'], 'Declared logic changes outside known paths also require rules');
  assert(run([], '').length, 'An empty body fails');
  assert.deepEqual(run([], '## Change\nA thing.'), ['rules-grounding', 'gameplay-impact'], 'Missing declarations fail');
  assert.deepEqual(run([], body.replace('#round', '#missing')), ['rulebook-anchors']);
  assert.deepEqual(run([], body.replace('None: presentation changes preserve all actions and saved-state meaning.', 'None:')), ['gameplay-impact']);
  const unrelated = '## Rules grounding\nNot applicable: account styling only; see docs/nido-auth.md for the authentication contract.\n## Gameplay impact\nNone: no Heirs Ad Astra game behavior or state changes.';
  assert.deepEqual(run(['crates/server/src/accounts.rs'], unrelated), []);
  assert.deepEqual(run(['prototypes/galactic-reach/app.js', RULEBOOK], unrelated), ['rule-bearing-grounding']);
  assert.deepEqual(run([], body.replace(/(## \w+[\w ]*\n)([^#]+)/g, '$1<!-- $2 -->\n')), ['rules-grounding', 'gameplay-impact'], 'Unfilled template comments do not count');

  // The advisory config (.github/review-conventions.json): this repository's
  // "Area: sentence" subjects, its template's sections and its trailer spelling.
  const advisory = await loadContext(ROOT, '.github/review-conventions.json');
  for (const heading of ['Rules grounding', 'Gameplay impact', 'How to review', 'Decisions for review']) assert(advisory.templates.default.includes(heading), heading);
  const commit = message => checkCommitMessage(message, advisory).map(f => f.rule);
  assert.deepEqual(commit('Heirs Ad Astra: Harbors refit Fleets'), [], 'A small commit needs only its subject');
  assert.deepEqual(commit('Heirs Ad Astra: Harbors refit Fleets\n\nWhy: fleets stranded far from home.\n\nRefs: #57\nBreaking-Change: saved fleets gain hull.'), []);
  assert.deepEqual(commit('Harbors refit Fleets'), ['header-format']);
  assert.deepEqual(commit('Heirs Ad Astra: Harbors refit Fleets\n\nFleets were stranded.'), ['body-why']);
  assert.deepEqual(commit('Heirs Ad Astra: Harbors refit Fleets\n\nWhy: x.\n\nBREAKING CHANGE: y'), ['trailer-breaking']);

  // The code rules (scripts/review-conventions-rules.mjs): one compatibility box
  // ticked, matched by the changes/ entry. A cut has no pending entries, so these
  // cases own their checkout and history instead of reading the caller's entries.
  const template = fs.readFileSync(path.join(ROOT, '.github', 'pull_request_template.md'), 'utf8');
  const tick = (text, choice) => text.replace(`- [ ] \`${choice}\``, `- [x] \`${choice}\``);
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'gr-rules-contract-'));
  try {
    fs.mkdirSync(path.join(fixture, 'changes'));
    for (const compat of ['safe', 'breaking']) fs.writeFileSync(path.join(fixture, 'changes', `${compat}.md`), `---\ncompat: ${compat}\ntitle: Fixture ${compat} change\n---\nA fixture for the rules contract.\n`);
    const { createRules } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'review-conventions-rules.mjs')).href);
    const fixtureContext = { ...advisory, module: createRules({ root: fixture }) };
    const repoRules = (text, files = []) => checkBody({ body: text, files }, fixtureContext).map(f => f.rule).filter(r => ['playtest-compatibility', 'changes-entry'].includes(r));
    const safeEntry = 'changes/safe.md', breakingEntry = 'changes/breaking.md';
    assert.deepEqual(repoRules(template), ['playtest-compatibility'], 'An unticked template is reported');
    assert.deepEqual(repoRules(tick(tick(template, 'playtest-safe'), 'playtest-breaking'), [safeEntry]), ['playtest-compatibility'], 'Both boxes ticked is reported');
    assert.deepEqual(repoRules(tick(template, 'playtest-safe')), []);
    assert.deepEqual(repoRules(tick(template, 'playtest-breaking'), [safeEntry]), ['changes-entry'], 'Breaking work needs a compat: breaking entry');
    assert.deepEqual(repoRules(tick(template, 'playtest-breaking'), [breakingEntry]), [], 'A matching breaking entry is accepted');
    assert.deepEqual(repoRules(tick(template, 'playtest-safe'), [breakingEntry]), ['changes-entry'], 'Safe work cannot include a breaking entry');
    const changed = tick(template, 'playtest-safe') + '\n## Gameplay impact\nChanged: Harbors refit Fleets at the start of a turn.';
    assert.deepEqual(repoRules(changed), ['changes-entry'], 'Changed gameplay needs an entry');
    assert.deepEqual(repoRules(changed, [safeEntry]), []);
    // Only newly added entries count, even if view.files also names an older breaking entry.
    const git = (...args) => execFileSync('git', ['-c', 'user.name=Rules fixture', '-c', 'user.email=rules-fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', `core.hooksPath=${path.join(fixture, 'no-hooks')}`, ...args], { cwd: fixture, encoding: 'utf8' }).trim();
    git('init', '--quiet', '--initial-branch=fixture');
    git('add', breakingEntry); git('commit', '--quiet', '-m', 'Fixture baseline');
    const base = git('rev-parse', 'HEAD');
    git('add', safeEntry); git('commit', '--quiet', '-m', 'Fixture safe change');
    const head = git('rev-parse', 'HEAD');
    const withRevs = text => checkBody({ body: text, files: [safeEntry, breakingEntry], base, head }, fixtureContext).map(f => f.rule).filter(r => r === 'changes-entry');
    assert.deepEqual(withRevs(tick(template, 'playtest-safe')), []);
    assert.deepEqual(withRevs(tick(template, 'playtest-breaking')), ['changes-entry']);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
  // A commit over 30 changed lines needs a body; its size comes from its SHA.
  const sized = (message, sha) => checkCommitMessage(message, advisory, { sha }).map(f => f.rule);
  assert.deepEqual(sized('Review guidance: split the shared core', '1bc2136'), ['commit-body'], 'A large subject-only commit is reported');
  assert.deepEqual(sized('Review guidance: split the shared core\n\nWhy: two repositories share it.', '1bc2136'), []);
  assert.deepEqual(sized('Heirs Ad Astra: align the relics item', '913872d'), [], 'A small commit needs only its subject');
  assert.deepEqual(sized('Review guidance: split the shared core'), [], 'An unknown commit is skipped');

  // One pinned ref of the shared validator, everywhere it is named.
  const workflow = name => fs.readFileSync(path.join(ROOT, '.github', 'workflows', name), 'utf8');
  assert.equal(workflow('review-conventions.yml').match(/uses: (\S+)/)?.[1], `${REPOSITORY}/.github/workflows/review-conventions.yml@${PIN}`, 'The Review conventions workflow calls the pinned ref');
  assert(workflow('rules.yml').includes(`repository: ${REPOSITORY}`) && workflow('rules.yml').includes(`ref: ${PIN}`), 'rules.yml checks out the pinned validator');
  console.log('Rules contract tests passed: paired edits, unrelated work, invalid anchors, missing declarations, renamed engine paths, and the advisory config.');
})().catch(error => { console.error(error); process.exitCode = 1; });
// Release tooling (docs/release.md) runs here too, so CI covers it without a workflow edit.
require('./test-release.cjs');
// The large-file guard (docs/history-slim.md) runs here too.
require('./test-large-files.cjs');
