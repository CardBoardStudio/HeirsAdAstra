// Exercises .github/rules-contract.json through the shared review-conventions validator.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { PIN, REPOSITORY, ROOT, home } = require('./lib/review-conventions.cjs');
const { CONFIG } = require('./check-rules-contract.cjs');
const RULEBOOK = 'prototypes/galactic-reach/rulebook.html';

(async () => {
  const { loadContext, checkBody } = await import(pathToFileURL(path.join(home(), 'src', 'core.mjs')).href);
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

  // One pinned commit of the shared validator, everywhere it is named.
  const workflow = name => fs.readFileSync(path.join(ROOT, '.github', 'workflows', name), 'utf8');
  assert(workflow('rules.yml').includes(`repository: ${REPOSITORY}`) && workflow('rules.yml').includes(`ref: ${PIN}`), 'rules.yml checks out the pinned validator');
  console.log('Rules contract tests passed: paired edits, unrelated work, invalid anchors, missing declarations, and renamed engine paths.');
})().catch(error => { console.error(error); process.exitCode = 1; });
// Release tooling (docs/release.md) runs here too, so CI covers it without a workflow edit.
require('./test-release.cjs');
// Review guidance (PR body sections and commit messages) runs here too.
require('./test-review-guidance.cjs');
