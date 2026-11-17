// A PR must explain its rules grounding; engine edits must travel with the manual.
// The rules are .github/rules-contract.json; the shared review-conventions
// validator runs them in block mode (a draft PR never fails). Then the release
// policy (docs/release.md), so CI covers it without a workflow edit.
//   node scripts/check-rules-contract.cjs [<base>] [--body-file <file>]
// In CI the base and body come from the pull_request event.
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ROOT, home } = require('./lib/review-conventions.cjs');
const CONFIG = '.github/rules-contract.json';

if (require.main === module) {
  const args = process.argv.slice(2);
  const bodyIndex = args.indexOf('--body-file');
  const base = args.find((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--body-file');
  const run = argv => {
    try { execFileSync(process.execPath, argv, { cwd: ROOT, stdio: 'inherit' }); } catch (_) { process.exitCode = 1; }
  };
  run([path.join(home(), 'bin', 'review-conventions.mjs'), 'body', '--root', ROOT, '--config', CONFIG, '--mode', 'block',
    ...(base ? ['--base', base] : []),
    ...(bodyIndex >= 0 ? ['--body-file', path.resolve(args[bodyIndex + 1])] : [])]);
  run([path.join(__dirname, 'release.cjs'), 'check']);
}
module.exports = { CONFIG };
