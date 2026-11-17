// Exercises .github/rules-contract.json and .github/review-conventions.json through the
// shared review-conventions validator, and checks its pin is the same everywhere.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
  const unrelated = '## Rules grounding\nNot applicable: account styling only; see docs/nido-auth.md for the authentication contract.\n## Gameplay impact\nNone: no Galactic Reach game behavior or state changes.';
  assert.deepEqual(run(['crates/server/src/accounts.rs'], unrelated), []);
  assert.deepEqual(run(['prototypes/galactic-reach/app.js', RULEBOOK], unrelated), ['rule-bearing-grounding']);
  assert.deepEqual(run([], body.replace(/(## \w+[\w ]*\n)([^#]+)/g, '$1<!-- $2 -->\n')), ['rules-grounding', 'gameplay-impact'], 'Unfilled template comments do not count');

  // The advisory config (.github/review-conventions.json): this repository's
  // "Area: sentence" subjects, its template's sections and its trailer spelling.
  const advisory = await loadContext(ROOT, '.github/review-conventions.json');
  for (const heading of ['Rules grounding', 'Gameplay impact', 'How to review', 'Decisions for review']) assert(advisory.templates.default.includes(heading), heading);
  const commit = message => checkCommitMessage(message, advisory).map(f => f.rule);
  assert.deepEqual(commit('Galactic Reach: Harbors refit Fleets'), [], 'A small commit needs only its subject');
  assert.deepEqual(commit('Galactic Reach: Harbors refit Fleets\n\nWhy: fleets stranded far from home.\n\nRefs: #57\nBreaking-Change: saved fleets gain hull.'), []);
  assert.deepEqual(commit('Harbors refit Fleets'), ['header-format']);
  assert.deepEqual(commit('Galactic Reach: Harbors refit Fleets\n\nFleets were stranded.'), ['body-why']);
  assert.deepEqual(commit('Galactic Reach: Harbors refit Fleets\n\nWhy: x.\n\nBREAKING CHANGE: y'), ['trailer-breaking']);

  // The code rules (scripts/review-conventions-rules.mjs): one compatibility box
  // ticked, matched by the changes/ entry. Entries are read from the checkout.
  const template = fs.readFileSync(path.join(ROOT, '.github', 'pull_request_template.md'), 'utf8');
  const tick = (text, choice) => text.replace(`- [ ] \`${choice}\``, `- [x] \`${choice}\``);
  const repoRules = (text, files = []) => checkBody({ body: text, files }, advisory).map(f => f.rule).filter(r => ['playtest-compatibility', 'changes-entry'].includes(r));
  const safeEntry = fs.readdirSync(path.join(ROOT, 'changes')).find(name => name !== 'README.md' && /compat: safe/.test(fs.readFileSync(path.join(ROOT, 'changes', name), 'utf8')));
  assert.deepEqual(repoRules(template), ['playtest-compatibility'], 'An unticked template is reported');
  assert.deepEqual(repoRules(tick(tick(template, 'playtest-safe'), 'playtest-breaking'), [`changes/${safeEntry}`]), ['playtest-compatibility'], 'Both boxes ticked is reported');
  assert.deepEqual(repoRules(tick(template, 'playtest-safe')), []);
  assert.deepEqual(repoRules(tick(template, 'playtest-breaking'), [`changes/${safeEntry}`]), ['changes-entry'], 'Breaking work needs a compat: breaking entry');
  assert.deepEqual(repoRules(tick(template, 'playtest-safe') + '\n## Gameplay impact\nChanged: Harbors refit Fleets at the start of a turn.'), ['changes-entry'], 'Changed gameplay needs an entry');
  assert.deepEqual(repoRules(tick(template, 'playtest-safe') + '\n## Gameplay impact\nChanged: Harbors refit Fleets at the start of a turn.', [`changes/${safeEntry}`]), []);
  // With the PR's revisions, only entries the PR adds count (as in release.cjs check).
  const revs = { base: 'bc96345', head: 'bcb713e' }; // adds changes/stars-around-map.md (compat: safe)
  const withRevs = text => checkBody({ body: text, files: [], ...revs }, advisory).map(f => f.rule).filter(r => r === 'changes-entry');
  assert.deepEqual(withRevs(tick(template, 'playtest-safe')), []);
  assert.deepEqual(withRevs(tick(template, 'playtest-breaking')), ['changes-entry']);
  // A commit over 30 changed lines needs a body; its size comes from its SHA.
  const sized = (message, sha) => checkCommitMessage(message, advisory, { sha }).map(f => f.rule);
  assert.deepEqual(sized('Review guidance: split the shared core', '34b65ac'), ['commit-body'], 'A large subject-only commit is reported');
  assert.deepEqual(sized('Review guidance: split the shared core\n\nWhy: two repositories share it.', '34b65ac'), []);
  assert.deepEqual(sized('Galactic Reach: align the relics item', 'bbc7c0e'), [], 'A small commit needs only its subject');
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
