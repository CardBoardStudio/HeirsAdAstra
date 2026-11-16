// Shared review-guidance core: no repo-specific rules live here. A repo passes a
// config (see ../review-guidance.config.cjs) naming its mode, required PR body
// sections, commit limits, trailers and which PRs to skip. Dependency-free Node.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const DEFAULTS = {
  mode: 'warn', // 'warn' reports findings and never fails; 'fail' blocks
  sections: [], // [{ heading, hint }]: required, non-empty PR body sections
  subjectMax: 72,
  bodyRequiredOver: 30, // changed lines above which a commit needs a body
  bodyLabels: ['Why', 'What changes', 'Evidence'], // body paragraph leads, not trailers
  trailers: ['Refs', 'Closes', 'Fixes', 'Security', 'Breaking-Change', 'Co-authored-by', 'Reported-by', 'Suggested-by', 'Tested-by'],
  commitTemplate: '.gitmessage',
  skip: () => false, // (event) => true to skip the body check, e.g. bot-written PRs
};

const configure = config => ({ ...DEFAULTS, ...config });

function section(body, heading) {
  return body.replace(/<!--[\s\S]*?-->/g, '').match(new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'))?.[1].trim();
}

function checkBody(body, config) {
  const { sections } = configure(config);
  return sections.flatMap(({ heading, hint }) => {
    const text = section(body, heading);
    if (text === undefined) return [`PR body has no "## ${heading}" section (${hint}).`];
    return text ? [] : [`"${heading}" is empty: ${hint}.`];
  });
}

function checkCommit({ sha, message, changed }, config) {
  const { subjectMax, bodyRequiredOver, bodyLabels, trailers, commitTemplate } = configure(config);
  const findings = [];
  const [subject = '', ...lines] = message.replace(/\s+$/, '').split('\n');
  const body = lines.join('\n');
  const id = `${sha.slice(0, 7)} "${subject}"`;
  if (/^(fixup|squash|amend)! /.test(subject)) findings.push(`${id}: autosquash it into its target before review (git rebase -i --autosquash).`);
  else if (/^wip\b/i.test(subject)) findings.push(`${id}: a WIP subject does not say what the commit does.`);
  if (subject.length > subjectMax) findings.push(`${id}: subject is ${subject.length} characters; keep it to ${subjectMax} and move detail into the body.`);
  if (/\.$/.test(subject)) findings.push(`${id}: drop the full stop at the end of the subject.`);
  if (lines.length && lines[0].trim()) findings.push(`${id}: leave a blank line between the subject and the body.`);
  const label = new RegExp(`^(${bodyLabels.join('|')}):`, 'i');
  const text = lines.filter(line => !/^[A-Za-z-]+: /.test(line) || label.test(line)).join('\n').trim();
  if (changed > bodyRequiredOver && !text) findings.push(`${id}: ${changed} changed lines and no body; say why (see ${commitTemplate}).`);
  for (const [, key] of body.matchAll(/^([A-Za-z][A-Za-z -]*?): /gm)) {
    const near = trailers.find(t => t.toLowerCase() === key.toLowerCase().replace(/ /g, '-'));
    if (near && near !== key) findings.push(`${id}: write the trailer as "${near}:", not "${key}:".`);
  }
  return findings;
}

function commitsSince(base, head) {
  const SEP = '\x1e';
  const log = execFileSync('git', ['log', '--no-merges', `--format=${SEP}%H%x00%B%x00`, '--numstat', `${base}..${head}`], { encoding: 'utf8' });
  return log.split(SEP).filter(Boolean).map(entry => {
    const [sha, message, stats = ''] = entry.split('\0');
    const changed = stats.trim().split('\n').filter(Boolean)
      .reduce((sum, line) => sum + line.split('\t').slice(0, 2).reduce((n, v) => n + (Number(v) || 0), 0), 0);
    return { sha, message, changed };
  });
}

function report(findings, config) {
  const { mode, commitTemplate } = configure(config);
  const level = mode === 'fail' ? 'error' : 'warning';
  for (const finding of findings) console.log(`::${level} title=Review guidance::${finding.replace(/%/g, '%25').replace(/\r?\n/g, '%0A')}`);
  if (process.env.GITHUB_STEP_SUMMARY && findings.length) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Review guidance (${mode})\n\n${findings.map(f => `- ${f}`).join('\n')}\n\nSee the PR template and \`${commitTemplate}\`.\n`);
  }
  console.log(findings.length ? `Review guidance: ${findings.length} finding(s), mode ${mode}.` : 'Review guidance passed: reviewer guidance present; commits explain themselves.');
  return mode === 'fail' && findings.length ? 1 : 0;
}

// CLI: <base> [--body-file <path>], or a pull_request event in GITHUB_EVENT_PATH.
function run(config, argv = process.argv.slice(2)) {
  const settings = configure(config);
  try {
    const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')) : {};
    const base = (argv[0] && !argv[0].startsWith('--') ? argv[0] : undefined) || event.pull_request?.base?.sha;
    if (!base) throw new Error('Provide a base ref or a pull_request event.');
    const head = event.pull_request?.head?.sha || 'HEAD';
    const bodyIndex = argv.indexOf('--body-file');
    const body = bodyIndex >= 0 ? fs.readFileSync(argv[bodyIndex + 1], 'utf8') : event.pull_request?.body || '';
    const findings = [...(settings.skip(event) ? [] : checkBody(body, settings)), ...commitsSince(base, head).flatMap(c => checkCommit(c, settings))];
    return report(findings, settings);
  } catch (error) {
    console.log(`::warning title=Review guidance::check could not run: ${error.message}`);
    return settings.mode === 'fail' ? 1 : 0;
  }
}

module.exports = { DEFAULTS, configure, section, checkBody, checkCommit, commitsSince, report, run };
