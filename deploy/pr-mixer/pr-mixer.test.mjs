// node --test deploy/pr-mixer/
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as lib from './lib.mjs';
import * as G from './git.mjs';

const cfg = lib.config({ HOME: '/home/t', MIXER_AUTH: 'local' });

test('config refuses open access, non-loopback binds and unknown modes', () => {
  assert.throws(() => lib.config({ MIXER_AUTH: 'local', MIXER_ORIGIN: 'https://bitswell.example.ts.net:3300' }), /loopback http/);
  assert.throws(() => lib.config({ MIXER_BIND: '0.0.0.0' }), /loopback/);
  assert.throws(() => lib.config({ MIXER_AUTH: 'tailscale' }), /MIXER_ADMINS/);
  assert.throws(() => lib.config({ MIXER_AUTH: 'everyone' }), /unknown mode/);
  assert.throws(() => lib.config({ MIXER_ORIGIN: 'https://h.example/' }), /exact origin/);
  const c = lib.config({ MIXER_ORIGIN: 'https://bitswell.example.ts.net:3300' });
  assert.deepEqual(c.auth, ['dev-site']);
  assert.equal(c.https, true);
  assert.equal(c.devSitePublic, 'https://bitswell.example.ts.net:3200/');
});

test('mix key: same PRs at the same heads reuse one build, in any order', () => {
  const a = { number: 3, sha: 'a'.repeat(40) }, b = { number: 9, sha: 'b'.repeat(40) };
  assert.equal(lib.mixKey('m', [a, b]), lib.mixKey('m', [b, a]));
  assert.match(lib.mixKey('m', [a]), /^[0-9a-f]{12}$/);
  assert.notEqual(lib.mixKey('m', [a]), lib.mixKey('m', [{ ...a, sha: 'c'.repeat(40) }]), 'a new push is a new mix');
  assert.notEqual(lib.mixKey('m', [a]), lib.mixKey('n', [a]), 'a new main is a new mix');
});

test('only repository branches and approved authors are buildable', () => {
  const pr = (author, headRepo) => ({ author, headRepo });
  assert.equal(lib.eligibility(pr('stranger', 'CardBoardStudio/drawing_board'), cfg).ok, true);
  assert.equal(lib.eligibility(pr('MaxHays8', 'maxhays8/drawing_board'), cfg).ok, true);
  const no = lib.eligibility(pr('stranger', 'stranger/drawing_board'), cfg);
  assert.equal(no.ok, false);
  assert.match(no.why, /not an approved author/);
});

test('CI state: any failure fails, anything running is pending', () => {
  const run = (status, conclusion) => ({ status, conclusion });
  assert.equal(lib.ciState([], []), 'none');
  assert.equal(lib.ciState([run('completed', 'success'), run('completed', 'skipped')], []), 'success');
  assert.equal(lib.ciState([run('completed', 'success'), run('in_progress', null)], []), 'pending');
  assert.equal(lib.ciState([run('in_progress', null), run('completed', 'failure')], []), 'failure');
  assert.equal(lib.ciState([run('completed', 'success')], [{ state: 'error' }]), 'failure');
});

test('presets: ready means non-draft and green; ineligible PRs never appear', () => {
  const pr = (number, draft, ci, ok = true) => ({ number, draft, ci, eligible: { ok } });
  const p = lib.presets([pr(1, false, 'success'), pr(2, true, 'success'), pr(3, false, 'failure'), pr(4, false, 'success', false)]);
  assert.deepEqual(p, { main: [], ready: [1], everything: [1, 2, 3] });
});

test('cookies: a mix sees only its own, renamed back; the dev session never passes', () => {
  const key = 'abcdef012345';
  const header = `drawing_board_alien_v11_session=DEV; pr_mixer_mix=${key}; mx${key}_drawing_board_alien_v11_session=MIX; mx000000000000_x=OTHER`;
  assert.equal(lib.inboundCookies(header, key), 'drawing_board_alien_v11_session=MIX');
  assert.equal(lib.inboundCookies('drawing_board_alien_v11_session=DEV', key), null);
  assert.equal(lib.outboundCookie('drawing_board_alien_v11_session=T; HttpOnly; Path=/', key), `mx${key}_drawing_board_alien_v11_session=T; HttpOnly; Path=/`);
  assert.equal(lib.cookieValue(header, 'pr_mixer_mix'), key);
  assert.equal(lib.cookieValue(header, 'missing'), null);
});

test('banner names every PR, escaped, before </body>', () => {
  const mix = { key: 'k', repo: 'o/r', mainSha: '1234567890', prs: [{ number: 7, title: '<script>x</script>' }] };
  const html = lib.injectBanner('<html><body>game</body></html>', mix);
  assert.match(html, /game<div id="pr-mixer-banner".*<\/div><\/body>/s);
  assert.match(html, /#7<\/a> &#60;script&#62;/);
  assert.ok(!html.includes('<script>x'));
  assert.match(lib.injectBanner('no body', { ...mix, prs: [] }), /main only/);
});

test('POST origin check', () => {
  const o = 'https://h.example:3300';
  assert.equal(lib.sameOrigin({ origin: o }, o), true);
  assert.equal(lib.sameOrigin({ origin: 'https://h.example:3200' }, o), false);
  assert.equal(lib.sameOrigin({ 'sec-fetch-site': 'same-site' }, o), false);
});

test('planner merges in PR order and names the conflicting pairs', async (t) => {
  const root = mkdtempSync(`${tmpdir()}/pr-mixer-test-`);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const work = `${root}/work`;
  const sh = (...args) => execFileSync('git', ['-C', work, ...args], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim();
  execFileSync('git', ['init', '-q', '-b', 'main', work]);
  const put = (file, text) => writeFileSync(`${work}/${file}`, text);
  put('a.txt', 'one\n'); put('b.txt', 'one\n'); put('c.txt', 'one\n');
  sh('add', '.'); sh('commit', '-qm', 'base');
  const branch = (name, file, text) => {
    sh('checkout', '-q', '-b', name, 'main'); put(file, text); sh('commit', '-qam', name);
    const sha = sh('rev-parse', 'HEAD'); sh('checkout', '-q', 'main'); return sha;
  };
  const pr10 = branch('p10', 'a.txt', 'ten\n');
  const pr11 = branch('p11', 'b.txt', 'eleven\n');
  const pr12 = branch('p12', 'a.txt', 'twelve\n'); // clashes with #10
  const pr13 = branch('p13', 'c.txt', 'thirteen\n'); // clashes with main below
  put('c.txt', 'main moved\n'); sh('commit', '-qam', 'main moves');
  const main = sh('rev-parse', 'HEAD');

  const dir = `${root}/work/.git`;
  const clean = await G.plan(dir, main, [{ number: 11, sha: pr11 }, { number: 10, sha: pr10 }]);
  assert.equal(clean.clean, true);
  assert.deepEqual(clean.results.map((r) => r.number), [10, 11], 'merged in PR-number order');
  const tree = execFileSync('git', ['--git-dir', dir, 'show', `${clean.mergeSha}:a.txt`], { encoding: 'utf8' });
  assert.equal(tree, 'ten\n');
  const again = await G.plan(dir, main, [{ number: 10, sha: pr10 }, { number: 11, sha: pr11 }]);
  assert.equal(again.mergeSha, clean.mergeSha, 'the merged source is reproducible');

  const mainOnly = await G.plan(dir, main, []);
  assert.deepEqual([mainOnly.clean, mainOnly.mergeSha], [true, main]);

  const bad = await G.plan(dir, main, [{ number: 10, sha: pr10 }, { number: 11, sha: pr11 }, { number: 12, sha: pr12 }, { number: 13, sha: pr13 }]);
  assert.equal(bad.clean, false);
  assert.equal(bad.mergeSha, null);
  const by = Object.fromEntries(bad.results.map((r) => [r.number, r]));
  assert.equal(by[10].status, 'merged');
  assert.deepEqual([by[12].status, by[12].conflictsWith, by[12].withMain, by[12].files], ['conflict', [10], false, ['a.txt']]);
  assert.deepEqual([by[13].status, by[13].withMain, by[13].conflictsWith], ['conflict', true, []]);
});
