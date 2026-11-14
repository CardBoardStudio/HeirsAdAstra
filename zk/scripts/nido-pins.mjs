// Read-only: compare drawing_board's Oct-9 Nido pins with current testnet state.
import { rpc, xdr, Address, StrKey, scValToNative } from '@stellar/stellar-sdk';
const server = new rpc.Server('https://soroban-testnet.stellar.org');
const PINNED = { wasm: 'bbb30174bbd85a2956a2f6146a156769621254011a6bdcac707cf787ce7bcd52', verifier: 'CBCCINHRMS3COAV5RHTCUASZLOEC52FCOBR3HMU4FKWJTAHWZTVFTHHY' };
const CURRENT = { wasm: '2c976bfd98678f3b6fcf5514420a81ef5e5b9fc1c5b6c60ec6f2dd64448479d5', verifier: 'CDEV5YPS5IITPLQPYTKJGWBNZ2YZ7FQZIJNSHUMJRBE4QWYK2IVK4EJT', factory: 'CDDIW3F63PB6ZKMJN7CCGJSCYXTAVAVEEYNS36K2YFEJH7GQ3ADVZSVS' };
const latest = await server.getLatestLedger();
console.log('latest ledger', latest.sequence, 'protocol', latest.protocolVersion);
async function code(hash) {
  const key = xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.from(hash, 'hex') }));
  const r = await server.getLedgerEntries(key);
  return r.entries.length ? { live: true, liveUntil: r.entries[0].liveUntilLedgerSeq } : { live: false };
}
async function instance(id) {
  const key = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({ contract: new Address(id).toScAddress(), key: xdr.ScVal.scvLedgerKeyContractInstance(), durability: xdr.ContractDataDurability.persistent() }));
  const r = await server.getLedgerEntries(key);
  if (!r.entries.length) return { live: false };
  const inst = r.entries[0].val.contractData().val().instance();
  const ex = inst.executable();
  return { live: true, liveUntil: r.entries[0].liveUntilLedgerSeq, wasm: ex.switch().name === 'contractExecutableWasm' ? ex.wasmHash().toString('hex') : ex.switch().name };
}
for (const [k, h] of [['pinned account wasm', PINNED.wasm], ['current account wasm', CURRENT.wasm]]) console.log(k, h.slice(0, 12), JSON.stringify(await code(h)));
for (const [k, id] of [['pinned verifier', PINNED.verifier], ['current verifier', CURRENT.verifier], ['current factory', CURRENT.factory]]) console.log(k, id, JSON.stringify(await instance(id)));
// Recent factory events → a live current Nido account.
const start = latest.sequence - 110000;
let accounts = new Set();
try {
  const ev = await server.getEvents({ startLedger: start, filters: [{ type: 'contract', contractIds: [CURRENT.factory] }], limit: 50 });
  for (const e of ev.events) {
    for (const v of [...e.topic, e.value]) { try { const n = scValToNative(v); const s = typeof n === 'string' ? n : JSON.stringify(n, (_, x) => typeof x === 'bigint' ? x.toString() : x); for (const m of s.match(/C[A-Z2-7]{55}/g) || []) if (m !== CURRENT.factory) accounts.add(m); } catch {} }
  }
  console.log('factory events', ev.events.length, 'accounts', [...accounts].slice(0, 5));
} catch (e) { console.log('events error', e.message); }
for (const a of [...accounts].slice(0, 3)) console.log('account', a, JSON.stringify(await instance(a)));
