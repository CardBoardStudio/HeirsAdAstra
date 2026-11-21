#!/usr/bin/env node
// Builds the player docs site published at heirsadastra.com (GitHub Pages,
// .github/workflows/pages.yml): a landing page, the canonical rulebook and the
// release notes. Every page is generated from the files the game ships, so the
// site cannot drift from the game:
//   site/index.html                           landing page template
//   prototypes/galactic-reach/rulebook.html   copied, with game links made absolute
//   docs/releases.md                          rendered to releases.html
//   prototypes/lab/heirs-emblem*.svg          the game's emblem, copied: the landing
//                                             page's emblem, the header mark, the favicon
// The site is static and has no scripts. It links to the game by absolute URL and
// never assumes it is served by the game server.
//
//   node scripts/build-site.cjs [outDir]      (default: _site)
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const outDir = path.resolve(process.argv[2] || path.join(root, '_site'));
const GAME = 'https://heirsadastra.app/';
const DEV = 'https://dev.heirsadastra.app/';
// The rulebook's own relative links (cards.html, ./) resolve against the page it
// is served from in the game.
const RULEBOOK_IN_GAME = new URL('galactic-reach/', GAME);
const ALLOWED_HOSTS = new Set([new URL(GAME).host, new URL(DEV).host]);

const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const escapeHtml = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fail = message => {
  console.error(`build-site: ${message}`);
  process.exit(1);
};

// The emblem files the site publishes, copied from prototypes/lab/ so the game and
// the site share one source. Every page's header shows the small mark beside the
// name, as the game's header does, and every page has the favicon.
const EMBLEMS = ['heirs-emblem.svg', 'heirs-emblem-mark.svg', 'heirs-emblem-favicon.svg'];
const FAVICON = '<link rel="icon" type="image/svg+xml" href="heirs-emblem-favicon.svg">';
const HEADER_MARK = '<img class="site-mark" src="heirs-emblem-mark.svg" alt="" width="26" height="26">';
// The rulebook's and release notes' link back to the landing page.
const homeLink = `<a href="./" class="button button-ghost site-home-link">← ${HEADER_MARK}Heirs Ad Astra</a>`;

// Site-local files a page may link to by relative URL.
const SITE_FILES = new Set(['styles.css', 'rulebook.css', 'site.css', 'rulebook.html', 'releases.html', ...EMBLEMS]);

// ---- Rulebook ------------------------------------------------------------
// The rulebook also loads site.css, which lets the page scroll outside the game's
// full-window table layout, and gains the site's favicon and header mark. Every
// relative link that is not one of the site's own files points into the game. The
// header's "← Heirs Ad Astra" (./) is the exception: on this site it returns to the
// site's landing page.
function rewriteRulebook(html) {
  const sheet = '<link rel="stylesheet" href="rulebook.css">';
  if (!html.includes(sheet)) fail(`rulebook.html no longer loads rulebook.css with ${sheet}; update rewriteRulebook`);
  html = html.replace(sheet, `${sheet}\n  <link rel="stylesheet" href="site.css">\n  ${FAVICON}`);
  const home = '<a href="./" class="button button-ghost">← Heirs Ad Astra</a>';
  if (!html.includes(home)) fail(`rulebook.html's header no longer links home with ${home}; update rewriteRulebook`);
  html = html.replace(home, homeLink);
  const headerEnd = html.indexOf('</header>');
  const header = headerEnd < 0 ? '' : html.slice(0, headerEnd);
  const rest = headerEnd < 0 ? html : html.slice(headerEnd);
  const toGame = (match, attr, href) => {
    if (/^(#|[a-z][a-z0-9+.-]*:)/i.test(href) || SITE_FILES.has(href.split('#')[0])) return match;
    return `${attr}="${new URL(href, RULEBOOK_IN_GAME).href}"`;
  };
  const link = /\b(href|src)="([^"]*)"/g;
  return header.replace(link, (m, attr, href) => (href === './' ? m : toGame(m, attr, href)))
    + rest.replace(link, toGame);
}

// ---- Release notes ---------------------------------------------------------
// docs/releases.md is written by scripts/release.cjs in a small Markdown subset:
// "## version · name" sections of paragraphs and "- " list items, with **bold**,
// `code` and [links](url). Anything else fails the build rather than rendering
// wrongly. The file's title and its maintainer introduction (before the first
// release) are not published. Links to repository docs (*.md) are developer
// material and render as plain text; rulebook links stay on this site.
function inline(text) {
  const codes = [];
  let out = text.replace(/`([^`]+)`/g, (_, code) => `\u0000${codes.push(escapeHtml(code)) - 1}\u0000`);
  out = escapeHtml(out)
    .replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, (_, url) => link(url, url))
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => link(label, url))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}
function link(label, url) {
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url) && /\.md(#|$)/.test(url)) return label;
  return `<a href="${url}">${label}</a>`;
}
function renderReleases(markdown) {
  const start = markdown.search(/^## /m);
  if (start < 0) fail('docs/releases.md has no "## " release sections');
  const lines = markdown.slice(start).replace(/<!--[\s\S]*?-->/g, '').split('\n');
  const releases = [];
  let current = null;
  let list = null;
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) current.body.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
    if (list) current.body.push(`<ul>\n${list.map(item => `<li>${inline(item)}</li>`).join('\n')}\n</ul>`);
    list = null;
  };
  for (const [n, raw] of lines.entries()) {
    const line = raw.trimEnd();
    const where = `docs/releases.md (release section line ${n + 1})`;
    if (line.startsWith('## ')) {
      if (current) flush();
      const title = line.slice(3).trim();
      const version = title.split(' · ')[0].trim();
      if (!/^\d+\.\d+$/.test(version)) fail(`${where}: expected "## <version> · <name>", got "${line}"`);
      current = { title, id: `release-${version.replace('.', '-')}`, body: [] };
      releases.push(current);
    } else if (line.startsWith('- ')) {
      if (paragraph.length) flush();
      (list ||= []).push(line.slice(2).trim());
    } else if (!line.trim()) {
      flush();
    } else if (/^(#|>|```|\||\* |\d+\. |\s)/.test(line)) {
      fail(`${where}: unsupported Markdown for the docs site: "${line}". Extend renderReleases in scripts/build-site.cjs.`);
    } else {
      if (list) flush();
      paragraph.push(line.trim());
    }
  }
  flush();
  return releases;
}

function releasesPage(releases, rules) {
  const nav = releases.map(r => `      <a href="#${r.id}">${escapeHtml(r.title)}</a>`).join('\n');
  const sections = releases.map((r, i) => `      <section id="${r.id}"${i === 0 ? ' class="release-latest"' : ''}>
        <h2>${escapeHtml(r.title)}</h2>
${r.body.map(block => `        ${block}`).join('\n')}
      </section>`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#060911">
  <meta name="description" content="What changed in each Heirs Ad Astra playtest release, newest first.">
  <title>Heirs Ad Astra · Release notes</title>
  <link rel="stylesheet" href="styles.css">
  <link rel="stylesheet" href="rulebook.css">
  <link rel="stylesheet" href="site.css">
  ${FAVICON}
</head>
<body class="rulebook release-notes">
  <a class="skip-link" href="#start">Skip to release notes</a>
  <header class="book-header">
    ${homeLink}
    <nav class="site-nav" aria-label="Site">
      <a href="rulebook.html">Rulebook</a>
      <a href="${GAME}">Play</a>
    </nav>
  </header>
  <div class="book-layout">
    <nav class="book-nav" aria-label="Releases">
      <strong>Releases</strong>
${nav}
    </nav>
    <main id="start" tabindex="-1">
      <div class="eyebrow">RELEASE NOTES · NEWEST FIRST</div>
      <h1>What’s new in<br>Heirs Ad Astra.</h1>
      <p class="book-lead">Each playtest release, with links to the rules it changed. A rules-changing release starts new games on the new rules; games already in progress keep the rules they were dealt with.</p>
${sections}
      <footer class="book-footer"><p>Current rules: ${escapeHtml(rules)}. <a href="rulebook.html">Read the rulebook →</a></p></footer>
    </main>
  </div>
</body>
</html>
`;
}

// ---- Checks ------------------------------------------------------------------
// The published pages run no scripts, call no API, have the favicon, and every
// link resolves: a relative link to a file and anchor in the site, or an absolute
// https link.
function verify(pages) {
  const ids = Object.fromEntries(Object.entries(pages).map(([file, html]) => [file, new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]))]));
  for (const [file, html] of Object.entries(pages)) {
    if (!html.includes(FAVICON)) fail(`${file} lacks the favicon link ${FAVICON}`);
    if (/<script\b/i.test(html)) fail(`${file} must not contain scripts`);
    if (/\{\{\w+\}\}/.test(html)) fail(`${file} has an unfilled placeholder: ${html.match(/\{\{\w+\}\}/)[0]}`);
    if (/<base\b/i.test(html)) fail(`${file} must not set <base>`);
    for (const [, attr, href] of html.matchAll(/\b(href|src)="([^"]*)"/g)) {
      const where = `${file}: ${attr}="${href}"`;
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
        const url = new URL(href);
        if (url.protocol !== 'https:') fail(`${where} must use https`);
        if (url.pathname.startsWith('/api/')) fail(`${where} must not call the game API`);
        if (!ALLOWED_HOSTS.has(url.host)) fail(`${where} points outside ${[...ALLOWED_HOSTS].join(', ')}`);
        continue;
      }
      if (href.startsWith('/')) fail(`${where} is root-relative; use a site-relative or absolute game link`);
      const [target, anchor] = href.split('#');
      const targetFile = target === '' ? file : target === './' ? 'index.html' : target;
      if (!fs.existsSync(path.join(outDir, targetFile))) fail(`${where} points to a missing file`);
      if (anchor && !(ids[targetFile] && ids[targetFile].has(anchor))) fail(`${where} points to a missing section`);
    }
  }
  for (const css of ['styles.css', 'rulebook.css', 'site.css']) {
    // Data URIs are inline; an SVG data URI can itself contain url(#id) references.
    const source = fs.readFileSync(path.join(outDir, css), 'utf8')
      .replace(/url\(\s*"data:[^"]*"\s*\)|url\(\s*'data:[^']*'\s*\)|url\(\s*data:[^)]*\)/g, '');
    for (const [, url] of source.matchAll(/url\(\s*["']?([^"')]+)/g)) {
      if (!url.startsWith('data:')) fail(`${css} loads ${url}, which the site does not publish`);
    }
  }
}

// ---- Build ---------------------------------------------------------------------
const rulebook = read('prototypes/galactic-reach/rulebook.html');
const rules = rulebook.match(/<meta name="rules-version" content="galactic-reach\/([^"]+)">/)?.[1]
  || fail('rulebook.html has no rules-version meta tag');
const releases = renderReleases(read('docs/releases.md'));
const landing = read('site/index.html')
  .replaceAll('{{game}}', GAME)
  .replaceAll('{{dev}}', DEV)
  .replaceAll('{{release}}', escapeHtml(releases[0].title))
  .replaceAll('{{rules}}', escapeHtml(rules));

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const pages = {
  'index.html': landing,
  'rulebook.html': rewriteRulebook(rulebook),
  'releases.html': releasesPage(releases, rules),
};
for (const [file, html] of Object.entries(pages)) fs.writeFileSync(path.join(outDir, file), html);
fs.copyFileSync(path.join(root, 'prototypes/galactic-reach/styles.css'), path.join(outDir, 'styles.css'));
fs.copyFileSync(path.join(root, 'prototypes/galactic-reach/rulebook.css'), path.join(outDir, 'rulebook.css'));
fs.copyFileSync(path.join(root, 'site/site.css'), path.join(outDir, 'site.css'));
for (const file of EMBLEMS) {
  const source = path.join('prototypes/lab', file);
  if (!fs.existsSync(path.join(root, source))) fail(`${source} is missing; the site publishes the emblem from it`);
  fs.copyFileSync(path.join(root, source), path.join(outDir, file));
}
// GitHub Pages takes the custom domain from the repository's Pages settings when
// it deploys from Actions; the CNAME file records the intended domain with the site.
fs.copyFileSync(path.join(root, 'site/CNAME'), path.join(outDir, 'CNAME'));
verify(pages);
console.log(`Docs site built in ${path.relative(process.cwd(), outDir) || '.'}: rules ${rules}, ${releases.length} releases, ${Object.keys(pages).length} pages.`);
