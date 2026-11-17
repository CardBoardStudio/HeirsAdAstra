// drawing_board's code rules for the shared review-conventions validator
// (.github/review-conventions.json "module"). Advisory: the Review conventions
// workflow runs in warn mode. The label policy that blocks is release.cjs check.
// The body rules use the PR's revisions and the commit rule the commit's SHA.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const { parseEntry } = createRequire(import.meta.url)('./release.cjs');
const CHOICES = ['playtest-safe', 'playtest-breaking'];
// Over this many changed lines a commit says why (.gitmessage).
const BODY_OVER = 30;

export function createRules({ root }) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  // The changes/ entries this PR adds, as release.cjs check counts them; with
  // no revisions (a local run without --base), the changed ones.
  const entries = view => (view.base ? git('diff', '--name-only', '--diff-filter=A', view.base, view.head, '--', 'changes/').split('\n') : view.files)
    .filter(file => /^changes\/[^/]+\.md$/.test(file) && file !== 'changes/README.md')
    .flatMap(file => {
      try { return [parseEntry(file, readFileSync(join(root, file), 'utf8'))]; } catch { return []; }
    });

  return {
    body(view) {
      const findings = [];
      const add = (rule, message) => findings.push({ rule, message });
      const compat = view.section('Playtest compatibility');
      const ticked = compat === undefined ? [] : CHOICES.filter(choice => new RegExp(`^\\s*[-*] \\[[xX]\\] \`?${choice}\``, 'm').test(compat));
      if (compat !== undefined && ticked.length !== 1) {
        add('playtest-compatibility', `Tick exactly one of \`playtest-safe\` or \`playtest-breaking\` under "## Playtest compatibility" (${ticked.length} ticked), and apply the matching label.`);
      }
      const changed = entries(view);
      const breaking = changed.some(entry => entry.compat === 'breaking');
      if (ticked.length === 1 && ticked[0] === 'playtest-breaking' && !breaking) {
        add('changes-entry', 'A playtest-breaking PR adds a changes/<branch>.md entry with `compat: breaking`.');
      }
      if (ticked.length === 1 && ticked[0] === 'playtest-safe' && breaking) {
        add('changes-entry', 'A playtest-safe PR cannot add a `compat: breaking` changes/ entry; tick playtest-breaking instead.');
      }
      if (/^Changed:/i.test(view.section('Gameplay impact') ?? '') && !changed.length) {
        add('changes-entry', 'Gameplay impact says "Changed:", so players will notice: add a changes/<branch>.md entry.');
      }
      return findings;
    },

    // A large commit with only a subject (and maybe trailers). Skipped when the
    // commit is unknown (the commit-msg hook, or two commits sharing a message).
    commit(view) {
      if (!view.sha || view.prose.trim()) return [];
      const changed = git('show', '--numstat', '--format=', view.sha).split('\n')
        .reduce((sum, line) => sum + line.split('\t').slice(0, 2).reduce((n, v) => n + (Number(v) || 0), 0), 0);
      return changed > BODY_OVER
        ? [{ rule: 'commit-body', message: `${view.header}: ${changed} changed lines and no body; say why (see .gitmessage).` }]
        : [];
    },
  };
}
