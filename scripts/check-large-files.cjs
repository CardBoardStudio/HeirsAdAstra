// Keeps the repository small after the history rewrite (docs/history-slim.md):
// a PR may not add study output, screenshots or other large binaries, and may
// not bring the pre-rewrite history back. Retain study data in persistent storage;
// external archive publication is a separate step (docs/history-slim.md).
//   node scripts/check-large-files.cjs <base>   # base defaults to the PR's base sha
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const TEXT_LIMIT = 1024 * 1024;
const MEDIA_LIMIT = 256 * 1024;
const MEDIA = /\.(png|jpe?g|gif|webp|avif|bmp|tiff?|svg|mp4|mov|webm|pdf)$/i;
const STUDY_OUTPUT = /\.(jsonl|gz|zip|tar|tgz|7z|parquet|sqlite3?|db)$/i;
const MOVED_OUT = /^(analysis|docs\/screenshots)\//;
const ALLOW = [/^zk\/vendor\//, /^docs\/rules\/cheaper-cards\/hex-colours-(before|after)\.png$/];
// Root commit of the history before the rewrite; any descendant carries the removed blobs.
const PRE_REWRITE_ROOT = 'd813f51c76da7e66c12363381ab1134857b5a07f';
const kib = bytes => `${Math.ceil(bytes / 1024)} KiB`;

function checkFiles(files) {
  const errors = [];
  for (const { path, size } of files) {
    if (ALLOW.some(pattern => pattern.test(path))) continue;
    if (MOVED_OUT.test(path)) errors.push(`${path}: study data and screenshots belong in persistent storage outside the source tree; see docs/history-slim.md.`);
    else if (STUDY_OUTPUT.test(path)) errors.push(`${path}: study output and archives belong in persistent storage or a verified archive; see docs/history-slim.md.`);
    else if (MEDIA.test(path) && size > MEDIA_LIMIT) errors.push(`${path}: ${kib(size)} image or media file is over ${kib(MEDIA_LIMIT)}; compress it or link it from the studies repository.`);
    else if (size > TEXT_LIMIT) errors.push(`${path}: ${kib(size)} is over ${kib(TEXT_LIMIT)}.`);
  }
  return errors;
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const hasPreRewriteHistory = ref => {
  try { execFileSync('git', ['merge-base', '--is-ancestor', PRE_REWRITE_ROOT, ref], { stdio: 'ignore' }); return true; } catch (_) { return false; }
};

function changedFiles(base) {
  // Added or modified files only; a deletion never grows the repository.
  return git('diff', '--name-only', '--no-renames', '--diff-filter=AM', '-z', `${base}...HEAD`, '--')
    .split('\0').filter(Boolean)
    .map(path => ({ path, size: Number(git('cat-file', '-s', `HEAD:${path}`).trim()) }));
}

if (require.main === module) {
  const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')) : {};
  const base = process.argv[2] || event.pull_request?.base?.sha;
  if (!base) { console.error('Provide a base ref or a pull_request event.'); process.exit(1); }
  // Only a PR whose base is already rewritten can bring the old history back; such
  // a branch shares no merge base with the base, so its file diff is meaningless.
  const errors = hasPreRewriteHistory('HEAD') && !hasPreRewriteHistory(base)
    ? [`This branch is built on the history from before the rewrite (root ${PRE_REWRITE_ROOT.slice(0, 12)}). Rebase it onto the current main: see docs/history-slim.md.`]
    : checkFiles(changedFiles(base));
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('Large-file check passed: no study output, oversized files or pre-rewrite history.');
}

module.exports = { checkFiles, TEXT_LIMIT, MEDIA_LIMIT };
