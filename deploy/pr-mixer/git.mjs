// Merge planning in a bare mirror, without a working tree: `git merge-tree
// --write-tree` (git 2.38+) merges two commits into a tree and lists conflicts,
// and `git commit-tree` turns each clean result into the next base.
import { execFile } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { mergeOrder } from './lib.mjs';

// Git runs with no credentials: the clone is public HTTPS, and no helper or
// token is configured, so a PR cannot exfiltrate one through the build.
const gitEnv = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  GIT_TERMINAL_PROMPT: '0',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'PR mixer', GIT_AUTHOR_EMAIL: 'pr-mixer@localhost',
  GIT_COMMITTER_NAME: 'PR mixer', GIT_COMMITTER_EMAIL: 'pr-mixer@localhost',
  // Fixed dates make the merge commits, and so the source, reproducible.
  GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
};

export function git(dir, args, { okCodes = [0], input } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile('git', ['--git-dir', dir, '-c', 'credential.helper=', ...args],
      { env: gitEnv, maxBuffer: 64 << 20 }, (err, stdout, stderr) => {
        const code = err ? (typeof err.code === 'number' ? err.code : -1) : 0;
        if (!okCodes.includes(code)) reject(new Error(`git ${args[0]} failed (${code}): ${stderr.trim() || err?.message}`));
        else resolve({ code, stdout, stderr });
      });
    if (input !== undefined) child.stdin.end(input);
  });
}

export async function ensureMirror(dir, repo) {
  try { await stat(`${dir}/HEAD`); return; } catch { /* create below */ }
  await mkdir(dir, { recursive: true });
  await git(dir, ['init', '--quiet', '--bare']);
  await git(dir, ['remote', 'add', 'origin', `https://github.com/${repo}.git`]);
}

/** Fetch main and the named PR heads; returns main's commit. */
export async function fetchHeads(dir, numbers) {
  const refs = ['+refs/heads/main:refs/heads/main', ...numbers.map((n) => `+refs/pull/${n}/head:refs/mixer/pr/${n}`)];
  await git(dir, ['fetch', '--quiet', '--no-tags', 'origin', ...refs]);
  return (await git(dir, ['rev-parse', 'refs/heads/main'])).stdout.trim();
}

/** Whether `sha` exists in the mirror (a PR may have moved since listing). */
export async function hasCommit(dir, sha) {
  const r = await git(dir, ['cat-file', '-e', `${sha}^{commit}`], { okCodes: [0, 1, 128] });
  return r.code === 0;
}

/** Merge two commits. Returns {tree} when clean, else {files} in conflict. */
export async function mergeTree(dir, ours, theirs) {
  const r = await git(dir, ['merge-tree', '--write-tree', '--name-only', '--no-messages', ours, theirs], { okCodes: [0, 1] });
  const [tree, ...files] = r.stdout.trim().split('\n');
  return r.code === 0 ? { tree } : { files: files.filter(Boolean) };
}

const commit = async (dir, tree, parents, message) =>
  (await git(dir, ['commit-tree', tree, ...parents.flatMap((p) => ['-p', p]), '-m', message])).stdout.trim();

/**
 * Merge `prs` ({number, sha}) onto main in stable order. A PR that conflicts
 * is left out of the result and diagnosed: against main alone, then against
 * each PR merged before it, so the report names the pairs that conflict.
 */
export async function plan(dir, mainSha, prs) {
  let head = mainSha;
  const merged = [];
  const results = [];
  const pairBase = new Map(); // PR number → commit of main + that PR alone
  const alone = async (p) => {
    if (!pairBase.has(p.number)) {
      const m = await mergeTree(dir, mainSha, p.sha);
      pairBase.set(p.number, m.tree ? await commit(dir, m.tree, [mainSha, p.sha], `Merge #${p.number}`) : null);
    }
    return pairBase.get(p.number);
  };
  for (const pr of mergeOrder(prs)) {
    const m = await mergeTree(dir, head, pr.sha);
    if (m.tree) {
      head = await commit(dir, m.tree, [head, pr.sha], `Merge #${pr.number} (${pr.sha.slice(0, 12)})`);
      merged.push(pr);
      results.push({ number: pr.number, sha: pr.sha, status: 'merged' });
      continue;
    }
    const withMain = await mergeTree(dir, mainSha, pr.sha);
    const conflictsWith = [];
    if (withMain.tree) {
      for (const q of merged) {
        const base = await alone(q);
        if (base && (await mergeTree(dir, base, pr.sha)).files) conflictsWith.push(q.number);
      }
    }
    results.push({
      number: pr.number, sha: pr.sha, status: 'conflict', files: m.files,
      withMain: !withMain.tree, conflictsWith,
      // Neither main nor any single earlier PR: only the combination conflicts.
      combination: !!withMain.tree && conflictsWith.length === 0,
    });
  }
  const clean = results.every((r) => r.status === 'merged');
  return { mainSha, clean, mergeSha: clean ? head : null, results };
}
