// "Testnet seat" tab for the 27.32 tabletop: sit with a Nido grant, get a
// privately dealt hand whose fairness the table contract checks on chain.
// Players see plain words and a seal; proofs and transactions stay underneath.
import { Keypair, xdr, nativeToScVal, Address } from '@stellar/stellar-sdk';
import * as gr from '../lib/grzk.mjs';
import * as rpcx from '../lib/rpc.mjs';
import * as nido from '../lib/nido.mjs';

const GAME = 'CAZT4RJOJCN4DTJY3JBH7PLVRXIRKKO6HAFOTWLSKHCL4YNLKV46P6ML';
const NAMES = { move: 'Move', 'move+': 'Move II', 'move*': 'Move', construct: 'Construct', 'construct+': 'Construct II', 'construct*': 'Construct', firstDawnEchoes: 'Echoes of the First Dawn' };
const ACCENT = { move: 'var(--energy)', construct: 'var(--matter)' };
const name = (code) => { const k = gr.CARD_TYPES[code]; return NAMES[k] ?? k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()); };
const accent = (code) => ACCENT[gr.CARD_TYPES[code].replace(/[+*]$/, '')] ?? 'var(--data)';
const tx = (hash, text) => `<a href="https://stellar.expert/explorer/testnet/tx/${hash}" target="_blank" rel="noopener">${text}</a>`;
const u32 = (x) => nativeToScVal(x, { type: 'u32' });
const b32 = (x) => xdr.ScVal.scvBytes(Buffer.from(gr.hex32(x).slice(2), 'hex'));
const big = (b) => BigInt('0x' + [...b].map((x) => x.toString(16).padStart(2, '0')).join(''));
const metrics = (globalThis.grZkMetrics = []);

const panel = document.getElementById('chain-panel');
const ui = {
  status: panel.querySelector('#chain-status'),
  sit: panel.querySelector('#chain-sit'),
  hand: panel.querySelector('#chain-hand'),
  approval: panel.querySelector('#chain-approval'),
  log: panel.querySelector('#chain-log'),
};
const say = (html) => { ui.status.innerHTML = html; };
const trace = (html) => { ui.log.insertAdjacentHTML('afterbegin', `<li>${html}</li>`); };
let circuit, me;

async function sit() {
  ui.sit.disabled = true;
  try {
    say('Opening your seat…');
    circuit ??= await (await fetch('/zk/circuits/gr_draw/target/gr_draw.json')).json();
    await gr.init();
    // Testnet stand-ins: a Friendbot sponsor pays fees (Nido's relayer or the
    // studio would), and a local admin key plays the user's Nido passkey.
    const sponsor = Keypair.random();
    await rpcx.friendbot(sponsor.publicKey());
    const admin = await nido.newP256(), session = await nido.newP256();
    const { account, create } = await nido.createAccount(sponsor, admin, rpcx.invoke);
    const url = nido.grantUrl({ account, sessionPubHex: session.pubHex, game: GAME, origin: location.origin, returnUrl: location.href });
    ui.approval.innerHTML = `<p><strong>One approval with Nido.</strong> For 24 hours this game may make moves at its own table, and may stake at most 5 XLM a day, paid only to the table. Nothing else.</p>
      <details><summary>What you approve</summary><ol><li><code>galactic-reach</code>: sit, draw, play, cleanup on <code>${GAME.slice(0, 6)}…</code>, no cap (these calls move no money)</li><li><code>galactic-stakes</code>: XLM transfer to the table only, up to 5 XLM per day</li></ol>
      <p class="muted">Real request: <a href="${url}" target="_blank" rel="noopener">Nido grant page</a>. This testnet demo approves with a stand-in key because no passkey is present.</p></details>`;
    say('Waiting for your Nido approval…');
    const latest = (await rpcx.server.getLatestLedger()).sequence;
    const doc = nido.grantDoc({ admin, session, game: GAME, notAfter: latest + 17280, stakeCap: 5 * 10_000_000 });
    const approve = await nido.sendAs(sponsor, rpcx.call(account, 'apply_doc', xdr.ScVal.scvBytes(Buffer.from(doc)), u32(0), nativeToScVal(0n, { type: 'u64' })), { account, signer: admin, ruleFor: () => 0 });
    trace(`Nido approval ${tx(approve.hash, 'on chain')}`);
    const rule = (await nido.installedRules(account)).find((r) => r.name === 'galactic-reach').id;
    const as = { account, signer: session, ruleFor: () => rule };
    const host = Keypair.random(); await rpcx.friendbot(host.publicKey());
    const table = (await rpcx.invoke(host, rpcx.call(GAME, 'new_table', new Address(host.publicKey()).toScVal(), u32(2)))).value;
    const seed = gr.randomField(), tableSeat = BigInt(table) * 16n;
    const sat = await nido.sendAs(sponsor, rpcx.call(GAME, 'sit', u32(table), u32(0), new Address(account).toScVal(), b32(gr.seedCommit(tableSeat, seed))), as);
    trace(`Seated at table ${table} ${tx(sat.hash, 'on chain')}`);
    me = { sponsor, account, as, table, tableSeat, seed, deck: [...gr.STARTER_DECK], deckSalt: 0n, hand: [] };
    ui.sit.hidden = true;
    await deal();
  } catch (e) {
    say(`Couldn’t open the seat: ${e.message.split('\n')[0]}`); ui.sit.disabled = false; console.error(e);
  }
}

async function deal() {
  const s = await nido.view(GAME, 'seat', u32(me.table), u32(0));
  const p = s.pending; if (!p) return render();
  ui.hand.innerHTML = Array.from({ length: p.n }, () => '<article class="game-card chain-card dealing"><span class="card-type">DEALING</span><strong>…</strong></article>').join('');
  say('Dealing your hand…');
  const base = { seed: me.seed, deck: me.deck, deckSalt: me.deckSalt, tableSeat: me.tableSeat, beacon: big(p.beacon), nonce: BigInt(p.nonce), n: p.n, discard: s.discard.map(Number) };
  const plan = gr.planDraw({ ...base, discard: [...base.discard] });
  const pr = await gr.prove(circuit, gr.circuitInputs(base, plan), { threads: globalThis.crossOriginIsolated ? Math.min(8, navigator.hardwareConcurrency || 4) : 1 });
  say('Checking the deal with the table…');
  const r = await nido.sendAs(me.sponsor, rpcx.call(GAME, 'draw', u32(me.table), u32(0), xdr.ScVal.scvBytes(Buffer.from(pr.proof)), b32(plan.deckCommitNew), xdr.ScVal.scvVec(plan.slots.map(b32))), me.as);
  metrics.push({ step: 'draw', proveMs: Math.round(pr.proveMs), witnessMs: Math.round(pr.witnessMs), threads: globalThis.crossOriginIsolated ? Math.min(8, navigator.hardwareConcurrency || 4) : 1, cpu: r.cpu, fee: r.feeCharged, hash: r.hash });
  me.deck = plan.newDeck; me.deckSalt = plan.newSalt;
  me.hand.push(...plan.cards.map((card, j) => ({ card, salt: plan.salts[j], hash: r.hash })));
  trace(`Hand dealt and verified ${tx(r.hash, 'on chain')} · proof made in ${(pr.proveMs / 1000).toFixed(1)} s`);
  say('Your hand was dealt fairly. Only you can see it.');
  render();
}

function render() {
  ui.hand.innerHTML = me.hand.map((c, i) => `<article class="game-card chain-card" style="--card-accent:${accent(c.card)}">
    <span class="card-type">PRIVATE</span><strong>${name(c.card)}</strong>
    <span class="chain-seal" title="Drawn fairly from your shuffled deck. The table checked it on Stellar testnet without seeing your cards.">✓ fair draw</span>
    <button class="button chain-play" data-i="${i}" type="button">Play</button></article>`).join('');
  ui.hand.querySelectorAll('.chain-play').forEach((b) => b.addEventListener('click', () => play(Number(b.dataset.i))));
}

async function play(i) {
  const c = me.hand[i];
  ui.hand.querySelectorAll('button').forEach((b) => (b.disabled = true));
  say(`Playing ${name(c.card)}…`);
  try {
    const r = await nido.sendAs(me.sponsor, rpcx.call(GAME, 'play', u32(me.table), u32(0), u32(i), u32(c.card), b32(c.salt)), me.as);
    metrics.push({ step: 'play', cpu: r.cpu, fee: r.feeCharged, hash: r.hash });
    me.hand.splice(i, 1);
    trace(`Played ${name(c.card)}: the table saw it came from your hand ${tx(r.hash, 'on chain')}`);
    say(`${name(c.card)} played. The table confirmed it was in your hand.`);
  } catch (e) { say(`The table refused that play: ${e.message.split('\n')[0]}`); }
  render();
}

ui.sit.addEventListener('click', sit);
globalThis.grZkSit = sit;
