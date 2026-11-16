const assert = require('node:assert/strict');
const { MODE, checkBody, checkCommit, report } = require('./check-review-guidance.cjs');
assert.equal(MODE, 'warn', 'Review guidance stays advisory until the team decides to enforce it');

const guided = '## How to review\nStart at `fitMap` in app.js. Risky: the snug allowance. Skim: screenshots.\n\n## Decisions for review\nNone.\n\n## Verification\nChecks run.';
assert.deepEqual(checkBody(guided), []);
assert.equal(checkBody('## Change\nA thing.').length, 2, 'Missing sections are reported');
assert.equal(checkBody(guided.replace('Start at `fitMap` in app.js. Risky: the snug allowance. Skim: screenshots.', '<!-- Start at: -->')).length, 1, 'Unfilled comments do not count');

const commit = (message, changed = 5) => checkCommit({ sha: 'abcdef0123', message, changed });
assert.deepEqual(commit('Galactic Reach: Harbors refit Fleets'), []);
assert.deepEqual(commit('Galactic Reach: Harbors refit Fleets\n\nWhy: fleets stranded far from home.\n\nRefs: #57\nBreaking-Change: saved fleets gain hull.', 200), []);
assert(commit('Harbors refit Fleets', 200).some(f => f.includes('no body')), 'Large commits need a body');
assert(commit('Harbors refit Fleets\n\nRefs: #57', 200).some(f => f.includes('no body')), 'Trailers alone are not a body');
assert(commit('x'.repeat(73)).some(f => f.includes('73 characters')));
assert(commit('Harbors refit Fleets.').some(f => f.includes('full stop')));
assert(commit('fixup! Harbors refit Fleets').some(f => f.includes('autosquash')));
assert(commit('WIP map').some(f => f.includes('WIP')));
assert(commit('Harbors refit Fleets\nWhy: no gap').some(f => f.includes('blank line')));
assert(commit('Harbors refit Fleets\n\nWhy: x.\n\nBREAKING CHANGE: y').some(f => f.includes('"Breaking-Change:"')));

const log = console.log; console.log = () => {};
try {
  assert.equal(report(['finding'], 'warn'), 0, 'Warn mode never fails');
  assert.equal(report(['finding'], 'fail'), 1, 'Fail mode blocks on findings');
  assert.equal(report([], 'fail'), 0);
} finally { console.log = log; }
console.log('Review guidance tests passed: body sections, commit subjects and bodies, trailers, warn and fail modes.');
