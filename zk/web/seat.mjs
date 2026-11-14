// "Testnet seat" tab for the 27.32 tabletop: sit with a real Nido testnet
// account, approve this table once, then get a privately dealt hand whose
// fairness the table contract checks on chain.
//
// Flow: Sit with Nido → Nido's account picker (no passkey) → Nido's grant page
// (the one passkey approval) → back here. The grant installs one rule on the
// account: this table contract's sit/draw/play/cleanup, for 24 hours, signed
// by a key this browser holds (non-extractable WebCrypto, kept in IndexedDB),
// so later moves need no prompt. Fees come from a Friendbot testnet key.
import { Keypair, xdr, nativeToScVal, Address } from '@stellar/stellar-sdk';
import * as gr from '../lib/grzk.mjs';
import * as rpcx from '../lib/rpc.mjs';
import * as nido from '../lib/nido.mjs';

export const GAME = 'CAZT4RJOJCN4DTJY3JBH7PLVRXIRKKO6HAFOTWLSKHCL4YNLKV46P6ML';
const ASSETS = new URL('./', import.meta.url);
const SEAT = 0;
const NAMES = { move: 'Move', 'move+': 'Move II', 'move*': 'Move', construct: 'Construct', 'construct+': 'Construct II', 'construct*': 'Construct', firstDawnEchoes: 'Echoes of the First Dawn' };
const ACCENT = { move: 'var(--energy)', construct: 'var(--matter)' };
const name = (code) => { const k = gr.CARD_TYPES[code]; return NAMES[k] ?? k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()); };
const accent = (code) => ACCENT[gr.CARD_TYPES[code].replace(/[+*]$/, '')] ?? 'var(--data)';
const expert = (kind, id, text) => `<a href="https://stellar.expert/explorer/testnet/${kind}/${id}" target="_blank" rel="noopener">${text}</a>`;
const short = (a) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const u32 = (x) => nativeToScVal(x, { type: 'u32' });
const b32 = (x) => xdr.ScVal.scvBytes(Buffer.from(gr.hex32(x).slice(2), 'hex'));
const big = (b) => BigInt('0x' + [...b].map((x) => x.toString(16).padStart(2, '0')).join(''));
const hexOf = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const metrics = (globalThis.grZkMetrics = []);

// ---- persistence: one record per browser profile ----------------------------
const db = new Promise((resolve, reject) => {
  const req = indexedDB.open('galactic-reach-testnet-seat', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('kv');
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
async function idb(mode, fn) {
  const store = (await db).transaction('kv', mode).objectStore('kv');
  return new Promise((resolve, reject) => { const r = fn(store); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
const load = () => idb('readonly', (s) => s.get('seat'));
const save = () => idb('readwrite', (s) => s.put(me, 'seat'));
const forget = () => idb('readwrite', (s) => s.delete('seat'));

// ---- UI ---------------------------------------------------------------------
const panel = document.getElementById('chain-panel');
const ui = {
  status: panel.querySelector('#chain-status'),
  sit: panel.querySelector('#chain-sit'),
  hand: panel.querySelector('#chain-hand'),
  approval: panel.querySelector('#chain-approval'),
  log: panel.querySelector('#chain-log'),
  tools: panel.querySelector('.hand-tools'),
};
ui.tools.insertAdjacentHTML('beforeend', '<button class="button button-ghost" id="chain-round" type="button" hidden>End round</button><button class="button button-ghost" id="chain-leave" type="button" hidden>Leave table</button>');
ui.round = panel.querySelector('#chain-round');
ui.leave = panel.querySelector('#chain-leave');
const say = (html) => { ui.status.innerHTML = html; };
let me = null; // persisted seat record
let busy = false;
function trace(html) {
  me.log ??= [];
  me.log.unshift(html);
  renderLog();
}
const renderLog = () => { ui.log.innerHTML = (me?.log ?? []).map((h) => `<li>${h}</li>`).join(''); };
function showTab() { document.getElementById('chain-tab')?.click(); }

function explainApproval() {
  ui.approval.innerHTML = `<p><strong>One approval with Nido.</strong> Nido will show one rule: for 24 hours this game may <em>sit, draw, play and end rounds</em> at its table contract, and nothing else. It cannot move your XLM. You confirm it once with your passkey; after that your moves need no prompts.</p>
    <details><summary>What you approve</summary><ul><li>Rule <code>galactic-reach</code>: functions <code>sit, draw, play, cleanup</code> on table contract ${expert('contract', GAME, short(GAME))}, no spending cap (these calls move no money), expires in 24 h.</li><li>Signer: a key this browser keeps for this table. Nido labels it “a passkey the app holds”; it signs without a device prompt.</li></ul></details>`;
}

function describe(e) {
  const m = String(e?.message ?? e);
  if (/#300[2-9]|#301[0-9]/.test(m)) return 'Your Nido approval for this table doesn’t cover this move or has expired. Use “Leave table”, then Sit with Nido again to renew.';
  if (/Contract, #6\)/.test(m)) return 'The table could not verify that deal, so nothing changed.';
  if (/Contract, #8\)/.test(m)) return 'The table says that card is not in your hand.';
  if (/Contract, #4\)/.test(m)) return 'There is no draw waiting at the table.';
  if (/Contract, #5\)/.test(m)) return 'Finish the waiting draw first.';
  if (/friendbot/i.test(m)) return 'Stellar’s testnet faucet is busy. Try again in a minute.';
  return m.split('\n')[0];
}

// ---- Nido round trips (full-page redirects; the tabletop saves locally) ------
// The wallet is whatever the server signs in with (NIDO_WALLET_HOST, published
// in /api/session), so a Nido PR preview such as 362.test.nido.fyi needs no
// rebuild. Served without the app (zk/web/serve.mjs), it is test.nido.fyi.
const WALLET_DEFAULT = { host: 'test.nido.fyi', connect_url: 'https://test.nido.fyi/connect/', account_url: 'https://{account}.test.nido.fyi' };
let wallet = WALLET_DEFAULT;
const walletReady = fetch('/api/session', { credentials: 'same-origin' })
  .then((r) => (r.ok ? r.json() : {}))
  .then((s) => { if (s?.nido_wallet?.connect_url) wallet = s.nido_wallet; })
  .catch(() => {});
const accountUrl = (account, path) => wallet.account_url.replace('{account}', account.toLowerCase()) + path;
const here = () => { const u = new URL(location.href); for (const k of ['nido_address', 'nido_connect', 'delegation', 'code']) u.searchParams.delete(k); u.hash = ''; return u.toString(); };

function connect() {
  const u = new URL(wallet.connect_url);
  u.searchParams.set('dapp', location.origin);
  u.searchParams.set('return', here());
  if (me?.account) u.searchParams.set('previous', me.account);
  location.assign(u.toString());
}

function grantUrl() {
  const u = new URL(accountUrl(me.account, '/security/delegate-doc/'));
  const p = u.searchParams;
  p.set('origin', location.origin); p.set('return', here()); p.set('pubkey', me.session.pubHex); p.set('duration', '24h');
  p.set('label', 'galactic-reach'); p.set('target', GAME); p.set('functions', 'sit,draw,play,cleanup'); p.set('limit', 'none');
  return u.toString();
}

async function sitClicked() {
  if (busy) return;
  busy = true; ui.sit.disabled = true;
  try {
    await walletReady;
    me = { phase: 'connecting', log: me?.log ?? [], account: me?.account };
    await save();
    say(`Opening Nido (${wallet.host}) so you can choose your testnet account…`);
    connect();
  } catch (e) { busy = false; ui.sit.disabled = false; say(describe(e)); console.error(e); }
}

async function afterConnect(address) {
  me.account = address;
  me.session = await nido.newP256();
  me.phase = 'granting';
  await save();
  explainApproval();
  say(`Account ${short(address)} chosen. Taking you to Nido to approve this table…`);
  setTimeout(() => location.assign(grantUrl()), 900);
}

async function sessionRule() {
  const rules = await nido.installedRules(me.account);
  const mine = rules.filter((r) => r.contract === GAME && (r.signers ?? []).some((s) => Array.isArray(s) && s[2] && hexOf(s[2]).startsWith(me.session.pubHex)));
  return mine.length ? mine[mine.length - 1].id : undefined;
}

async function afterGrant() {
  say('Nido approved. Checking the rule on your account…');
  let rule;
  for (let i = 0; i < 6 && rule === undefined; i++) { rule = await sessionRule(); if (rule === undefined) await new Promise((r) => setTimeout(r, 2500)); }
  if (rule === undefined) throw new Error('Nido finished, but the approval is not on your account yet. Wait a moment and press Sit with Nido again.');
  me.rule = rule;
  trace(`Nido approval installed on ${expert('contract', me.account, short(me.account))} (rule ${rule})`);
  await openSeat();
}

// ---- the table --------------------------------------------------------------
const as = () => ({ account: me.account, signer: me.session, ruleFor: () => me.rule });
const sponsor = () => Keypair.fromSecret(me.sponsor);

async function openSeat() {
  me.phase = 'opening';
  if (!me.sponsor) { const kp = Keypair.random(); me.sponsor = kp.secret(); }
  await save();
  say('Opening your seat at a new table…');
  await rpcx.friendbot(sponsor().publicKey());
  if (!me.table) {
    const t = await rpcx.invoke(sponsor(), rpcx.call(GAME, 'new_table', new Address(sponsor().publicKey()).toScVal(), u32(2)));
    me.table = t.value;
    trace(`Table ${me.table} created ${expert('tx', t.hash, 'on chain')}`);
    await save();
  }
  await gr.init();
  me.seed = gr.randomField();
  me.tableSeat = BigInt(me.table) * 16n + BigInt(SEAT);
  me.deck = [...gr.STARTER_DECK]; me.deckSalt = 0n; me.hand = [];
  await save();
  const sat = await nido.sendAs(sponsor(), rpcx.call(GAME, 'sit', u32(me.table), u32(SEAT), new Address(me.account).toScVal(), b32(gr.seedCommit(me.tableSeat, me.seed))), as());
  me.phase = 'seated';
  ui.approval.innerHTML = '';
  trace(`Seated at table ${me.table} as ${short(me.account)}, no prompt ${expert('tx', sat.hash, 'on chain')}`);
  await save();
  await deal();
}

let circuit;
async function deal() {
  const s = await nido.view(GAME, 'seat', u32(me.table), u32(SEAT));
  const p = s.pending; if (!p) return render();
  render();
  ui.hand.insertAdjacentHTML('beforeend', Array.from({ length: p.n }, () => '<article class="game-card chain-card dealing"><span class="card-type">DEALING</span><strong>…</strong></article>').join(''));
  say('Dealing your hand…');
  circuit ??= await (await fetch(new URL('gr_draw.json', ASSETS))).json();
  await gr.init();
  const base = { seed: me.seed, deck: me.deck, deckSalt: me.deckSalt, tableSeat: me.tableSeat, beacon: big(p.beacon), nonce: BigInt(p.nonce), n: p.n, discard: s.discard.map(Number) };
  const plan = gr.planDraw({ ...base, discard: [...base.discard] });
  const threads = globalThis.crossOriginIsolated ? Math.min(8, navigator.hardwareConcurrency || 4) : 1;
  const pr = await gr.prove(circuit, gr.circuitInputs(base, plan), { threads });
  // You already know your cards; show them while the table checks the deal.
  const fresh = plan.cards.map((card, j) => ({ card, salt: plan.salts[j], pending: true }));
  render(fresh);
  say('Checking the deal with the table…');
  const r = await nido.sendAs(sponsor(), rpcx.call(GAME, 'draw', u32(me.table), u32(SEAT), xdr.ScVal.scvBytes(Buffer.from(pr.proof)), b32(plan.deckCommitNew), xdr.ScVal.scvVec(plan.slots.map(b32))), as());
  metrics.push({ step: 'draw', proveMs: Math.round(pr.proveMs), witnessMs: Math.round(pr.witnessMs), threads, cpu: r.cpu, fee: r.feeCharged, hash: r.hash });
  me.deck = plan.newDeck; me.deckSalt = plan.newSalt;
  me.hand.push(...fresh.map((c) => ({ card: c.card, salt: c.salt, hash: r.hash })));
  trace(`Dealt ${plan.cards.length} cards; the table verified the deal without seeing them ${expert('tx', r.hash, 'on chain')} · sealed in ${(pr.proveMs / 1000).toFixed(1)} s`);
  await save();
  say('Your hand was dealt fairly. Only you can see it.');
  render();
}

function render(extra = []) {
  const seated = me?.phase === 'seated';
  ui.sit.hidden = seated;
  ui.round.hidden = !seated || !me.hand?.length;
  ui.leave.hidden = !me?.account;
  const cards = [...(me?.hand ?? []), ...extra];
  ui.hand.innerHTML = cards.map((c, i) => `<article class="game-card chain-card" style="--card-accent:${accent(c.card)}">
    <span class="card-type">PRIVATE</span><strong>${name(c.card)}</strong>
    <span class="chain-seal${c.pending ? ' pending' : ''}" title="Drawn fairly from your shuffled deck. The table checked it on Stellar testnet without seeing your cards.">${c.pending ? 'table confirming…' : '✓ fair draw'}</span>
    ${c.pending ? '' : `<button class="button chain-play" data-i="${i}" type="button">Play</button>`}</article>`).join('');
  ui.hand.querySelectorAll('.chain-play').forEach((b) => b.addEventListener('click', () => play(Number(b.dataset.i))));
  renderLog();
}

async function play(i) {
  if (busy) return; busy = true;
  const c = me.hand[i];
  panel.querySelectorAll('button').forEach((b) => (b.disabled = true));
  say(`Playing ${name(c.card)}…`);
  try {
    const r = await nido.sendAs(sponsor(), rpcx.call(GAME, 'play', u32(me.table), u32(SEAT), u32(i), u32(c.card), b32(c.salt)), as());
    metrics.push({ step: 'play', cpu: r.cpu, fee: r.feeCharged, hash: r.hash });
    me.hand.splice(i, 1);
    trace(`Played ${name(c.card)}: the table confirmed it came from your hand ${expert('tx', r.hash, 'on chain')}`);
    await save();
    say(`${name(c.card)} played. The table confirmed it was in your hand.`);
    await deal(); // a draw card (Echoes, Foresight, Brokerage) opens a new draw
  } catch (e) { say(`The table refused that play: ${describe(e)}`); console.error(e); }
  busy = false;
  panel.querySelectorAll('button').forEach((b) => (b.disabled = false));
  render();
}

async function endRound() {
  if (busy) return; busy = true;
  panel.querySelectorAll('button').forEach((b) => (b.disabled = true));
  say('Ending the round: your remaining cards go face up to your discard…');
  try {
    const r = await nido.sendAs(sponsor(), rpcx.call(GAME, 'cleanup', u32(me.table), u32(SEAT), xdr.ScVal.scvVec(me.hand.map((c) => u32(c.card))), xdr.ScVal.scvVec(me.hand.map((c) => b32(c.salt)))), as());
    trace(`Round ended; ${me.hand.length} cards revealed to the discard ${expert('tx', r.hash, 'on chain')}`);
    me.hand = [];
    await save();
    await deal();
  } catch (e) { say(describe(e)); console.error(e); }
  busy = false;
  panel.querySelectorAll('button').forEach((b) => (b.disabled = false));
  render();
}

async function leave() {
  if (!confirm('Leave this testnet table? Your private hand here is forgotten; the Nido approval simply expires.')) return;
  await forget(); me = null; ui.hand.innerHTML = ''; ui.log.innerHTML = ''; ui.approval.innerHTML = '';
  say('One approval seats you for 24 hours. After that, moves need no prompts.');
  render();
}

// ---- start ------------------------------------------------------------------
async function resume() {
  await walletReady;
  me = (await load()) ?? null;
  const q = new URLSearchParams(location.search);
  const back = ['nido_address', 'nido_connect', 'delegation'].some((k) => q.has(k));
  if (back) { history.replaceState(null, '', here()); showTab(); }
  if (me?.phase !== 'seated') explainApproval();
  render();
  if (!me) return;
  try {
    if (me.phase === 'connecting') {
      const address = q.get('nido_address');
      if (address && /^C[A-Z2-7]{55}$/.test(address)) { busy = true; return await afterConnect(address); }
      me.phase = undefined; await save();
      return say(q.get('nido_connect') === 'cancelled' ? 'You closed Nido without choosing an account. Nothing changed.' : 'One approval seats you for 24 hours. After that, moves need no prompts.');
    }
    if (me.phase === 'granting') {
      explainApproval();
      if (q.get('delegation') === 'ok') { busy = true; showTab(); return await afterGrant(); }
      if (q.get('delegation') === 'cancelled') { me.phase = undefined; await save(); return say('You cancelled in Nido. Nothing changed.'); }
      return say(`Waiting for your Nido approval. <a href="${grantUrl()}">Open Nido again</a>`);
    }
    if (me.phase === 'opening') { busy = true; return await openSeat(); }
    if (me.phase === 'seated') {
      say(`Seated at table ${me.table} as ${short(me.account)}. Only you can see your hand.`);
      busy = true; await deal();
    }
  } catch (e) {
    say(`Couldn’t finish: ${describe(e)}`); console.error(e);
  } finally {
    busy = false; ui.sit.disabled = false; render();
  }
}

ui.sit.addEventListener('click', sitClicked);
ui.round.addEventListener('click', endRound);
ui.leave.addEventListener('click', leave);
globalThis.grZkSeat = { get state() { return me; }, get wallet() { return wallet; }, metrics, GAME };
resume().catch((e) => { say(describe(e)); console.error(e); });
