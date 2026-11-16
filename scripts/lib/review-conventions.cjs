// Locates the shared review-conventions validator (github.com/bitswell-hq/review-conventions)
// at the ref this repository pins. CI checks it out and sets REVIEW_CONVENTIONS_HOME;
// locally the ref is resolved to a commit, fetched once per commit into the temp directory. Nothing here checks anything:
// the rules are .github/rules-contract.json and .github/review-conventions.json.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Keep in step with `uses:` in .github/workflows/review-conventions.yml and `ref:`
// in .github/workflows/rules.yml (scripts/test-rules-contract.cjs checks all three).
const REPOSITORY = 'bitswell-hq/review-conventions';
// The moving major tag: fixes and new optional checks, never a new required one.
const PIN = 'v1';
const ROOT = path.join(__dirname, '..', '..');

function home() {
  if (process.env.REVIEW_CONVENTIONS_HOME) return path.resolve(process.env.REVIEW_CONVENTIONS_HOME);
  const url = `https://github.com/${REPOSITORY}`;
  const sha = execFileSync('git', ['ls-remote', url, `refs/tags/${PIN}`, `refs/heads/${PIN}`], { encoding: 'utf8' }).split(/\s/)[0] || PIN;
  const dir = path.join(os.tmpdir(), `review-conventions-${sha.slice(0, 12)}`);
  if (!fs.existsSync(path.join(dir, 'bin', 'review-conventions.mjs'))) {
    const tmp = fs.mkdtempSync(`${dir}-`);
    const git = (...args) => execFileSync('git', ['-C', tmp, ...args], { stdio: ['ignore', 'ignore', 'inherit'] });
    git('init', '-q');
    git('fetch', '-q', '--depth', '1', url, sha);
    git('checkout', '-q', 'FETCH_HEAD');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(tmp, dir);
  }
  return dir;
}

module.exports = { REPOSITORY, PIN, ROOT, home };
