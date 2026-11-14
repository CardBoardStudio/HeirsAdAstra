// Minimal testnet helpers (browser-safe): Friendbot, wasm deploy, simulated-then-sent
// invocations with the costs RPC reports. Testnet only.
import { Keypair, rpc, TransactionBuilder, Networks, Operation, Contract, Address, nativeToScVal, scValToNative, xdr, hash } from '@stellar/stellar-sdk';
export const server = new rpc.Server('https://soroban-testnet.stellar.org');
export const NETWORK = Networks.TESTNET;
export async function friendbot(publicKey) {
  try { await server.getAccount(publicKey); return; } catch {}
  const r = await fetch(`https://friendbot.stellar.org/?addr=${publicKey}`);
  if (!r.ok) throw new Error(`friendbot ${r.status}`);
}

/** Simulate, assemble, sign and send one host-function op; return result + costs. */
export async function invoke(source, op, { signers = [], authSign } = {}) {
  const account = await server.getAccount(source.publicKey());
  let tx = new TransactionBuilder(account, { fee: '1000000', networkPassphrase: NETWORK }).addOperation(op).setTimeout(120).build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error('simulation: ' + sim.error.split('\n').slice(0, 6).join(' | '));
  if (authSign) await authSign(sim, tx);
  tx = rpc.assembleTransaction(tx, sim).build();
  tx.sign(source, ...signers);
  const sent = await server.sendTransaction(tx);
  if (sent.status === 'ERROR') throw new Error('send: ' + JSON.stringify(sent.errorResult?.result()?.switch?.().name ?? sent));
  let got;
  for (let i = 0; i < 60; i++) {
    got = await server.getTransaction(sent.hash);
    if (got.status !== 'NOT_FOUND') break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (got.status !== 'SUCCESS') throw new Error(`tx ${sent.hash} ${got.status}`);
  const res = sim.transactionData.build().resources();
  return {
    hash: sent.hash,
    ledger: got.ledger,
    value: got.returnValue ? scValToNative(got.returnValue) : undefined,
    feeCharged: Number(got.resultXdr.feeCharged().toString()),
    cpu: Number(res.instructions()),
    mem: Number(sim.cost?.memBytes ?? 0),
    minResourceFee: Number(sim.minResourceFee),
    txBytes: tx.toEnvelope().toXDR().length,
  };
}

export async function deploy(source, wasm) {
  const up = await invoke(source, Operation.uploadContractWasm({ wasm }));
  const wasmHash = hash(wasm);
  const salt = Buffer.from(Keypair.random().rawPublicKey());
  const create = await invoke(source, Operation.createCustomContract({ address: new Address(source.publicKey()), wasmHash, salt }));
  return { contractId: create.value, upload: up, create };
}
export const call = (id, fn, ...args) => new Contract(id).call(fn, ...args);
export { nativeToScVal, scValToNative, xdr, Address };
