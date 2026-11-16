// drawing_board's code rules for the shared review-conventions validator
// (.github/review-conventions.json "module"). Advisory: the Review conventions
// workflow runs in warn mode. The label policy that blocks is release.cjs check.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const { parseEntry } = createRequire(import.meta.url)('./release.cjs');
const CHOICES = ['playtest-safe', 'playtest-breaking'];

export function createRules({ root }) {
  // The changes/ entries this PR adds or edits that still exist and parse.
  const entries = files => files
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
      const changed = entries(view.files);
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
  };
}
