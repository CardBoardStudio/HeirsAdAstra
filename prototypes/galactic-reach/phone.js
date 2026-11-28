// Phones are played sideways (rulebook #shared-board). On a phone-sized touch screen held upright
// the game table shows a prompt to turn the phone (phone.css) and nothing under it takes input;
// turning the phone removes the prompt at once, with the game exactly as it was. Tablets, desktop
// windows of any shape and every other page (rulebook, home, sign-in, waiting room) never show it.
// Orientation is not locked: iOS Safari cannot lock it, and nothing here needs it.
(() => {
  if (typeof window === 'undefined' || !window.matchMedia) return;
  // A phone: a touch screen whose own screen (not the window) is under 600 px on its short side.
  const coarse = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
  const short = Math.min(screen.width || 0, screen.height || 0);
  if (!coarse || !(short > 0 && short < 600)) return;
  document.documentElement.classList.add('phone-device');
  const upright = matchMedia('(orientation: portrait)');
  const prompt = document.querySelector('#rotate-prompt');
  if (!prompt) return;
  // Everything but the prompt is inert while it shows. Parts that were already inert stay so.
  const held = new Set();
  function sync() {
    const block = upright.matches;
    prompt.setAttribute('aria-hidden', String(!block));
    for (const el of document.body.children) {
      if (el === prompt || el.tagName === 'SCRIPT') continue;
      if (block && !el.inert) { el.inert = true; held.add(el); }
      if (!block && held.has(el)) { el.inert = false; held.delete(el); }
    }
    document.documentElement.classList.toggle('rotate-now', block);
  }
  upright.addEventListener?.('change', sync);
  // Parts added later (notes, the card sheet) are covered too.
  new MutationObserver(() => { if (upright.matches) sync(); }).observe(document.body, { childList: true });
  sync();
})();
