// The card face's layout rules (rulebook #card-face, card-face.css), checked in the page. FACE_PROBLEMS
// is an expression for Runtime.evaluate: given a scope selector it returns one line per problem in every
// shown face there. A face's parts stay inside the card and do not overlap: the name, the description
// and the footer stack in that order; in the footer the convert chip, the type and the price sit side
// by side. No text is cut (never an ellipsis, never clipped), the words sit on the full shade (below
// its 12 mm fade), and a price's count badge stays on the card.
const FACE_PROBLEMS = scope => `(() => {
  const problems = [], seen = e => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const box = e => e.getBoundingClientRect(), over = (a, b) => a.left < b.right - .5 && b.left < a.right - .5 && a.top < b.bottom - .5 && b.top < a.bottom - .5;
  for (const face of document.querySelectorAll(${JSON.stringify(`${scope} .card-face`)})) {
    const sheet = face.querySelector('.cf-sheet');
    if (!seen(face) || !seen(sheet) || getComputedStyle(face.querySelector('.cf-shade')).display === 'none') continue;
    const card = box(sheet), mm = card.width / 63, name = face.querySelector('.cf-name').textContent.trim();
    if (card.width < 2) continue;
    const say = text => problems.push(text + ' on ' + name + ' (' + Math.round(card.width) + 'px face)');
    const parts = ['.cf-name', '.cf-text', '.cf-foot', '.cf-convert', '.cf-type', '.cf-price', '.cf-count'].flatMap(s => [...face.querySelectorAll(s)]).filter(seen);
    for (const part of parts) { const r = box(part); if (r.left < card.left - .5 || r.right > card.right + .5 || r.top < card.top - .5 || r.bottom > card.bottom + .5) say(part.className.split(' ')[0] + ' leaves the card'); }
    const stack = ['.cf-name', '.cf-text', '.cf-foot'].map(s => face.querySelector(s)).filter(seen);
    for (let i = 0; i < stack.length; i++) for (let j = i + 1; j < stack.length; j++) if (over(box(stack[i]), box(stack[j]))) say(stack[i].className + ' overlaps ' + stack[j].className);
    const foot = ['.cf-convert', '.cf-type', '.cf-price'].map(s => face.querySelector(s)).filter(e => seen(e) && box(e).width > 0);
    for (let i = 0; i < foot.length; i++) for (let j = i + 1; j < foot.length; j++) if (over(box(foot[i]), box(foot[j]))) say(foot[i].className.split(' ')[0] + ' overlaps ' + foot[j].className.split(' ')[0]);
    for (const text of face.querySelectorAll('.cf-name, .cf-headline, .cf-small, .cf-type, .cf-or')) {
      const style = getComputedStyle(text);
      if (style.textOverflow === 'ellipsis') say(text.className + ' ends in an ellipsis');
      if (text.scrollWidth > text.clientWidth + 1 || text.scrollHeight > text.clientHeight + 1) say(text.className + ' is cut');
    }
    // The words sit on the full shade, below its 12 mm fade.
    const shade = box(face.querySelector('.cf-shade')), first = box(face.querySelector('.cf-name'));
    if (first.top < shade.top + 12 * mm - 1) say('the name sits in the shade\\'s fade');
    if (shade.top < card.top - .5) say('the shade runs off the top of the card');
  }
  return problems;
})()`;
module.exports = { FACE_PROBLEMS };
