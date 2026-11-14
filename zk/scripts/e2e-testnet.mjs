// Thinnest slice on testnet: sit → proven draw → play → cleanup → proven draw
// with reshuffle, plus two cheats that must be refused. Throwaway keys only.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import * as gr from '../lib/grzk.mjs';
import * as ch from '../lib/chain.mjs';
const { nativeToScVal: v, xdr } = ch;
await gr.init();
const circuit = JSON.parse(readFileSync(new URL('../circuits/gr_draw/target/gr_draw.json', import.meta.url)));
const log = [];
const note = (step, r, extra = {}) => { const row = { step, hash: r.hash, cpu: r.cpu, mem: r.mem, feeCharged: r.feeCharged, minResourceFee: r.minResourceFee, txBytes: r.txBytes, ...extra }; log.push(row); console.log(JSON.stringify(row)); };

const host = await ch.friendbotKey('host');
const player = await ch.friendbotKey('player0');
const depFile = new URL('../out/deploy.json', import.meta.url);
let contractId;
if (existsSync(depFile) && !process.env.REDEPLOY) contractId = JSON.parse(readFileSync(depFile)).contractId;
else {
  const d = await ch.deploy(host, readFileSync(new URL('../out/gr_table.opt.wasm', import.meta.url)));
  contractId = d.contractId; note('upload wasm', d.upload); note('create contract', d.create);
  writeFileSync(depFile, JSON.stringify({ contractId }));
}
console.log('contract', contractId);
const u32 = (x) => v(x, { type: 'u32' });
const b32 = (x) => xdr.ScVal.scvBytes(Buffer.from(gr.hex32(x).slice(2), 'hex'));
const seatOf = async (table, seat) => {
  const acct = await ch.server.getAccount(player.publicKey());
  const { TransactionBuilder } = await import('@stellar/stellar-sdk');
  const tx = new TransactionBuilder(acct, { fee: '100', networkPassphrase: ch.NETWORK }).addOperation(ch.call(contractId, 'seat', u32(table), u32(seat))).setTimeout(30).build();
  const sim = await ch.server.simulateTransaction(tx);
  return ch.scValToNative(sim.result.retval);
};
const big = (b) => BigInt('0x' + Buffer.from(b).toString('hex'));

const t = await ch.invoke(host, ch.call(contractId, 'new_table', v(ch.Address.fromString(host.publicKey())), u32(2)));
const table = t.value; note('new_table', t, { table });
const seatNo = 0, tableSeat = BigInt(table) * 16n + BigInt(seatNo);
const seed = gr.randomField();
const sit = await ch.invoke(player, ch.call(contractId, 'sit', u32(table), u32(seatNo), v(ch.Address.fromString(player.publicKey())), b32(gr.seedCommit(tableSeat, seed))));
note('sit (seed commit + opening beacon)', sit);

let deckSalt = 0n, deck = [...gr.STARTER_DECK], hand = [];
async function drawPending(label) {
  const s = await seatOf(table, seatNo);
  const p = s.pending;
  const discard = s.discard.map(Number);
  const base = { seed, deck, deckSalt, tableSeat, beacon: big(p.beacon), nonce: BigInt(p.nonce), n: p.n, discard };
  const plan = gr.planDraw({ ...base, discard: [...discard] });
  const inputs = gr.circuitInputs(base, plan);
  const pr = await gr.prove(circuit, inputs, { threads: Number(process.env.THREADS || 1) });
  const r = await ch.invoke(player, ch.call(contractId, 'draw', u32(table), u32(seatNo), xdr.ScVal.scvBytes(Buffer.from(pr.proof)), b32(plan.deckCommitNew), xdr.ScVal.scvVec(plan.slots.map(b32))));
  note(label, r, { drawn: plan.cards.map((c) => gr.CARD_TYPES[c]), fold: plan.fold, proveMs: Math.round(pr.proveMs), witnessMs: Math.round(pr.witnessMs), proofBytes: pr.proof.length });
  deck = plan.newDeck; deckSalt = plan.newSalt;
  hand.push(...plan.cards.map((card, j) => ({ card, salt: plan.salts[j] })));
  return { plan, pr, base };
}
const first = await drawPending('draw 5 (proof verified on chain)');

// Cheat 1: replay the same proof (the pending draw is gone, nonce consumed).
try { await ch.invoke(player, ch.call(contractId, 'draw', u32(table), u32(seatNo), xdr.ScVal.scvBytes(Buffer.from(first.pr.proof)), b32(first.plan.deckCommitNew), xdr.ScVal.scvVec(first.plan.slots.map(b32)))); console.log('CHEAT ACCEPTED: replay'); }
catch (e) { console.log('replayed proof refused:', e.message.match(/Error\(Contract, #\d+\)/)?.[0] ?? e.message.slice(0, 120)); }
// Cheat 2: claim a card you did not draw (open slot 0 as a relic with its salt).
const fake = (hand[0].card + 1) % gr.T;
try { await ch.invoke(player, ch.call(contractId, 'play', u32(table), u32(seatNo), u32(0), u32(fake), b32(hand[0].salt))); console.log('CHEAT ACCEPTED: fake card'); }
catch (e) { console.log(`playing ${gr.CARD_TYPES[fake]} from a ${gr.CARD_TYPES[hand[0].card]} slot refused:`, e.message.match(/Error\(Contract, #\d+\)/)?.[0] ?? e.message.slice(0, 120)); }

const played = hand.shift();
note('play (open slot)', await ch.invoke(player, ch.call(contractId, 'play', u32(table), u32(seatNo), u32(0), u32(played.card), b32(played.salt))), { card: gr.CARD_TYPES[played.card] });
note('cleanup (reveal hand to discard, new beacon)', await ch.invoke(player, ch.call(contractId, 'cleanup', u32(table), u32(seatNo), xdr.ScVal.scvVec(hand.map((x) => u32(x.card))), xdr.ScVal.scvVec(hand.map((x) => b32(x.salt))))), { revealed: hand.map((x) => gr.CARD_TYPES[x.card]) });
hand = [];
await drawPending('round 2 draw 5 with reshuffle');
const s = await seatOf(table, seatNo);
console.log('final seat', JSON.stringify({ deck_size: s.deck_size, hand: s.hand.length, discard: s.discard.reduce((a, b) => a + Number(b), 0), round: s.round, nonce: s.nonce }));
writeFileSync(new URL(`../out/e2e-${Date.now()}.json`, import.meta.url), JSON.stringify({ contractId, table, log }, null, 1));
process.exit(0);
