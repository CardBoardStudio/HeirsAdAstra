const assert = require('node:assert/strict');
const { checkFiles, TEXT_LIMIT, MEDIA_LIMIT } = require('./check-large-files.cjs');
const check = (path, size = 100) => checkFiles([{ path, size }]);

assert.deepEqual(check('prototypes/galactic-reach/app.js', 400 * 1024), [], 'The engine may grow well past its current size');
assert.deepEqual(check('prototypes/galactic-reach/card-art/colonize.webp', 50 * 1024), [], 'Card art is small media');
assert.deepEqual(check('zk/vendor/noir-poseidon/src/poseidon/bn254/consts.nr', 2e6), [], 'Vendored sources are allowed');
assert.deepEqual(check('docs/rules/cheaper-cards/hex-colours-after.png', 303289), [], 'Existing docs images are allowed');
assert.equal(check('analysis/galactic-reach-40.45/report.md').length, 1, 'Study folders moved out of the repository');
assert.equal(check('docs/screenshots/viewport-fit/after-1440x900-table.jpg', 10).length, 1, 'Screenshots moved out too');
assert.equal(check('output/run/games.jsonl', 10).length, 1, 'Raw study output is refused at any size');
assert.equal(check('scripts/fixtures/study.zip', 10).length, 1, 'Archives are refused at any size');
assert.equal(check('docs/rules/new-board.png', MEDIA_LIMIT + 1).length, 1, 'Large images are refused');
assert.deepEqual(check('docs/rules/new-board.png', MEDIA_LIMIT), []);
assert.equal(check('crates/galactic-reach/rules/v99-app.js', TEXT_LIMIT + 1).length, 1, 'Any file over the text limit is refused');
console.log('Large-file check tests passed.');
