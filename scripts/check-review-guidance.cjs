// Review guidance: the PR body says where to start and what to decide; each commit
// says why. Findings are advisory until MODE is switched to 'fail'.
// Subjects stay in this repo's "Area: sentence" git style, not Conventional Commits:
// release notes come from changes/*.md, so a type prefix would carry no information.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

// The single switch: 'warn' reports findings and never fails the PR; 'fail' blocks it.
const MODE = 'warn';

const SUBJECT_MAX = 72;
const BODY_REQUIRED_OVER = 30; // changed lines above which a commit body must say why
const TRAILERS = ['Refs', 'Closes', 'Fixes', 'Security', 'Breaking-Change', 'Co-authored-by', 'Reported-by', 'Suggested-by', 'Tested-by'];

function section(body, heading) {
  return body.replace(/<!--[\s\S]*?-->/g, '').match(new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'))?.[1].trim();
}

function checkBody(body) {
  const findings = [];
  const review = section(body, 'How to review');
  const decisions = section(body, 'Decisions for review');
  if (review === undefined) findings.push('PR body has no "## How to review" section (start here, risky areas, what to skim).');
  else if (!review) findings.push('"How to review" is empty: name where to start, the risky areas and what to skim.');
  if (decisions === undefined) findings.push('PR body has no "## Decisions for review" section ("None." is a valid answer).');
  else if (!decisions) findings.push('"Decisions for review" is empty: list the choices a reviewer could make differently, or write "None."');
  return findings;
}

function checkCommit({ sha, message, changed }) {
  const findings = [];
  const [subject = '', ...lines] = message.replace(/\s+$/, '').split('\n');
  const body = lines.join('\n');
  const id = `${sha.slice(0, 7)} "${subject}"`;
  if (/^(fixup|squash|amend)! /.test(subject)) findings.push(`${id}: autosquash it into its target before review (git rebase -i --autosquash).`);
  else if (/^wip\b/i.test(subject)) findings.push(`${id}: a WIP subject does not say what the commit does.`);
  if (subject.length > SUBJECT_MAX) findings.push(`${id}: subject is ${subject.length} characters; keep it to ${SUBJECT_MAX} and move detail into the body.`);
  if (/\.$/.test(subject)) findings.push(`${id}: drop the full stop at the end of the subject.`);
  if (lines.length && lines[0].trim()) findings.push(`${id}: leave a blank line between the subject and the body.`);
  const text = lines.filter(line => !/^[A-Za-z-]+: /.test(line) || /^(Why|What changes|Evidence):/i.test(line)).join('\n').trim();
  if (changed > BODY_REQUIRED_OVER && !text) findings.push(`${id}: ${changed} changed lines and no body; say why (see .gitmessage).`);
  for (const [, key] of body.matchAll(/^([A-Za-z][A-Za-z -]*?): /gm)) {
    const near = TRAILERS.find(t => t.toLowerCase() === key.toLowerCase().replace(/ /g, '-'));
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

function report(findings, mode = MODE) {
  const level = mode === 'fail' ? 'error' : 'warning';
  for (const finding of findings) console.log(`::${level} title=Review guidance::${finding.replace(/%/g, '%25').replace(/\r?\n/g, '%0A')}`);
  if (process.env.GITHUB_STEP_SUMMARY && findings.length) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Review guidance (${mode})\n\n${findings.map(f => `- ${f}`).join('\n')}\n\nSee the PR template and \`.gitmessage\`.\n`);
  }
  console.log(findings.length ? `Review guidance: ${findings.length} finding(s), mode ${mode}.` : 'Review guidance passed: reviewer guidance present; commits explain themselves.');
  return mode === 'fail' && findings.length ? 1 : 0;
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')) : {};
    const base = args[0] || event.pull_request?.base?.sha;
    if (!base) throw new Error('Provide a base ref or a pull_request event.');
    const head = event.pull_request?.head?.sha || 'HEAD';
    const bodyIndex = args.indexOf('--body-file');
    const body = bodyIndex >= 0 ? fs.readFileSync(args[bodyIndex + 1], 'utf8') : event.pull_request?.body || '';
    // The release cut PR is written by a workflow, not a reviewer-facing template.
    const generated = event.pull_request?.head?.ref?.startsWith('release/');
    const findings = [...(generated ? [] : checkBody(body)), ...commitsSince(base, head).flatMap(checkCommit)];
    process.exitCode = report(findings);
  } catch (error) {
    console.log(`::warning title=Review guidance::check could not run: ${error.message}`);
    if (MODE === 'fail') process.exitCode = 1;
  }
}

module.exports = { MODE, SUBJECT_MAX, checkBody, checkCommit, commitsSince, report };
