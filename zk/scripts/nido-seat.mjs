// A real Nido account on testnet plays the ZK draw slice under one grant.
// The admin key stands in for the user's Nido passkey (one approval); the
// session key signs every game call with no prompt. Throwaway keys only.
import { readFileSync, writeFileSync } from 'node:fs';
import * as gr from '../lib/grzk.mjs';
import * as ch from '../lib/chain.mjs';
import * as nido from '../lib/nido.mjs';
const { nativeToScVal: v, xdr } = ch;
await gr.init();
const circuit = JSON.parse(readFileSync(new URL('../circuits/gr_draw/target/gr_draw.json', import.meta.url)));
const { contractId: game } = JSON.parse(readFileSync(new URL('../out/deploy.json', import.meta.url)));
const relayer = await ch.friendbotKey('relayer');
const host = await ch.friendbotKey('host');
const log = [];
const note = (step, r, extra = {}) => { const row = { step, hash: r.hash, cpu: r.cpu, feeCharged: r.feeCharged, txBytes: r.txBytes, ...extra }; log.push(row); console.log(JSON.stringify(row)); };
const u32 = (x) => v(x, { type: 'u32' });
const b32 = (x) => xdr.ScVal.scvBytes(Buffer.from(gr.hex32(x).slice(2), 'hex'));
const big = (b) => BigInt('0x' + Buffer.from(b).toString('hex'));

// 1. Account from Nido's factory, admin = the user's passkey (software stand-in).
const admin = await nido.newP256();
const { account, create } = await nido.createAccount(relayer, admin, ch.invoke);
note('Nido factory create_account', create, { account });

// 2. One approval: the grant document, signed by the admin key under rule 0.
const session = await nido.newP256();
const latest = (await ch.server.getLatestLedger()).sequence;
const doc = nido.grantDoc({ admin, session, game, notAfter: latest + 17280, stakeCap: 5 * 10_000_000 });
const applied = await nido.sendAs(relayer, new ch.xdr.Operation({ sourceAccount: null, body: ch.xdr.OperationBody.invokeHostFunction(new ch.xdr.InvokeHostFunctionOp({ hostFunction: ch.xdr.HostFunction.hostFunctionTypeInvokeContract(new ch.xdr.InvokeContractArgs({ contractAddress: ch.Address.fromString(account).toScAddress(), functionName: 'apply_doc', args: [xdr.ScVal.scvBytes(Buffer.from(doc)), u32(0), v(0n, { type: 'u64' })] })), auth: [] })) }), { account, signer: admin, ruleFor: () => 0 });
note('apply_doc grant (the one approval)', applied, { docBytes: doc.length });
const rules = await nido.installedRules(account);
console.log('installed rules', JSON.stringify(rules.map((r) => [r.id, r.name, r.contract])));
const gameRule = rules.find((r) => r.name === 'galactic-reach').id;
const asSession = { account, signer: session, ruleFor: ({ contract }) => { if (contract !== game) throw new Error('no grant for ' + contract); return gameRule; } };

// 3. Play under the grant: every call below is signed by the session key only.
const t = await ch.invoke(host, ch.call(game, 'new_table', v(ch.Address.fromString(host.publicKey())), u32(2)));
const table = t.value, seatNo = 1, tableSeat = BigInt(table) * 16n + 1n;
const seed = gr.randomField();
note('sit as Nido account (session key)', await nido.sendAs(relayer, ch.call(game, 'sit', u32(table), u32(seatNo), v(ch.Address.fromString(account)), b32(gr.seedCommit(tableSeat, seed))), asSession), { table });
const s = await nido.view(game, 'seat', u32(table), u32(seatNo));
const base = { seed, deck: gr.STARTER_DECK, deckSalt: 0n, tableSeat, beacon: big(s.pending.beacon), nonce: BigInt(s.pending.nonce), n: 5, discard: Array(gr.T).fill(0) };
const plan = gr.planDraw({ ...base, discard: Array(gr.T).fill(0) });
const pr = await gr.prove(circuit, gr.circuitInputs(base, plan));
note('draw 5 as Nido account (proof + session auth)', await nido.sendAs(relayer, ch.call(game, 'draw', u32(table), u32(seatNo), xdr.ScVal.scvBytes(Buffer.from(pr.proof)), b32(plan.deckCommitNew), xdr.ScVal.scvVec(plan.slots.map(b32))), asSession), { drawn: plan.cards.map((c) => gr.CARD_TYPES[c]), proveMs: Math.round(pr.proveMs) });
note('play as Nido account', await nido.sendAs(relayer, ch.call(game, 'play', u32(table), u32(seatNo), u32(0), u32(plan.cards[0]), b32(plan.salts[0])), asSession), { card: gr.CARD_TYPES[plan.cards[0]] });
// The grant does not reach outside the game: a session-signed XLM transfer elsewhere is refused.
try {
  await nido.sendAs(relayer, ch.call(nido.NIDO.xlm, 'transfer', v(ch.Address.fromString(account)), v(ch.Address.fromString(relayer.publicKey())), v(1n, { type: 'i128' })), { account, signer: session, ruleFor: () => rules.find((r) => r.name === 'galactic-stakes').id });
  console.log('OUT-OF-SCOPE TRANSFER ACCEPTED (bad)');
} catch (e) { console.log('session transfer to a non-game address refused:', e.message.match(/Error\(Contract, #\d+\)|#\d{4}/)?.[0] ?? e.message.slice(0, 200)); }
writeFileSync(new URL(`../out/nido-${Date.now()}.json`, import.meta.url), JSON.stringify({ account, game, table, doc: JSON.parse(doc), log }, null, 1));
process.exit(0);
