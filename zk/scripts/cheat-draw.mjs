// A seat with a pending draw tries to pick its own cards: honest proof, but
// slot 0 swapped for a commitment to a card it wanted. Must be refused (#6).
import { readFileSync } from 'node:fs';
import * as gr from '../lib/grzk.mjs';
import * as ch from '../lib/chain.mjs';
import { TransactionBuilder } from '@stellar/stellar-sdk';
const { nativeToScVal: v, xdr } = ch;
await gr.init();
const circuit = JSON.parse(readFileSync(new URL('../circuits/gr_draw/target/gr_draw.json', import.meta.url)));
const { contractId } = JSON.parse(readFileSync(new URL('../out/deploy.json', import.meta.url)));
const host = await ch.friendbotKey('host'), cheater = await ch.friendbotKey('cheater');
const u32 = (x) => v(x, { type: 'u32' });
const b32 = (x) => xdr.ScVal.scvBytes(Buffer.from(gr.hex32(x).slice(2), 'hex'));
const big = (b) => BigInt('0x' + Buffer.from(b).toString('hex'));
const table = (await ch.invoke(host, ch.call(contractId, 'new_table', v(ch.Address.fromString(host.publicKey())), u32(2)))).value;
const seed = gr.randomField(), tableSeat = BigInt(table) * 16n;
await ch.invoke(cheater, ch.call(contractId, 'sit', u32(table), u32(0), v(ch.Address.fromString(cheater.publicKey())), b32(gr.seedCommit(tableSeat, seed))));
const acct = await ch.server.getAccount(cheater.publicKey());
const sim = await ch.server.simulateTransaction(new TransactionBuilder(acct, { fee: '100', networkPassphrase: ch.NETWORK }).addOperation(ch.call(contractId, 'seat', u32(table), u32(0))).setTimeout(30).build());
const p = ch.scValToNative(sim.result.retval).pending;
const base = { seed, deck: gr.STARTER_DECK, deckSalt: 0n, tableSeat, beacon: big(p.beacon), nonce: BigInt(p.nonce), n: 5, discard: Array(gr.T).fill(0) };
const plan = gr.planDraw({ ...base, discard: Array(gr.T).fill(0) });
const pr = await gr.prove(circuit, gr.circuitInputs(base, plan));
const wanted = plan.cards[0] === 0 ? 3 : 0; // the other starter
const slots = [...plan.slots]; slots[0] = gr.slotCommit(wanted, plan.salts[0]);
const attempt = (label, s, proof) => ch.invoke(cheater, ch.call(contractId, 'draw', u32(table), u32(0), xdr.ScVal.scvBytes(Buffer.from(proof)), b32(plan.deckCommitNew), xdr.ScVal.scvVec(s.map(b32))))
  .then(() => console.log(label, 'ACCEPTED (bad)'), (e) => console.log(label, 'refused:', e.message.match(/Error\(Contract, #\d+\)/)?.[0] ?? e.message.slice(0, 160)));
await attempt(`swap slot 0 (${gr.CARD_TYPES[plan.cards[0]]} → ${gr.CARD_TYPES[wanted]})`, slots, pr.proof);
const flipped = Uint8Array.from(pr.proof); flipped[1000] ^= 1;
await attempt('one flipped proof byte', plan.slots, flipped);
// A different seed (a "better" hand) cannot match the committed seed.
const other = gr.planDraw({ ...base, seed: seed + 1n, discard: Array(gr.T).fill(0) });
try { await gr.prove(circuit, gr.circuitInputs({ ...base, seed: seed + 1n }, other)); console.log('other-seed witness built?'); } catch { }
await attempt('honest draw after cheats', plan.slots, pr.proof);
process.exit(0);
