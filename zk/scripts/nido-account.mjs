import { rpc, xdr, Address, Contract, TransactionBuilder, Account, Networks, scValToNative, Keypair } from '@stellar/stellar-sdk';
const server = new rpc.Server('https://soroban-testnet.stellar.org');
const acctScv = xdr.ScVal.fromXDR(process.argv[2], 'base64');
const account = Address.fromScVal(acctScv).toString();
console.log('account', account);
const key = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({ contract: new Address(account).toScAddress(), key: xdr.ScVal.scvLedgerKeyContractInstance(), durability: xdr.ContractDataDurability.persistent() }));
const r = await server.getLedgerEntries(key);
console.log('instance wasm', r.entries[0]?.val.contractData().val().instance().executable().wasmHash().toString('hex'), 'liveUntil', r.entries[0]?.liveUntilLedgerSeq);
const src = new Account(Keypair.random().publicKey(), '0');
for (const fn of ['configuration', 'installed_rules']) {
  const tx = new TransactionBuilder(src, { fee: '100', networkPassphrase: Networks.TESTNET }).addOperation(new Contract(account).call(fn)).setTimeout(30).build();
  const sim = await server.simulateTransaction(tx);
  if (sim.error) console.log(fn, 'ERROR', sim.error.split('\n')[0].slice(0, 200));
  else console.log(fn, 'OK', JSON.stringify(scValToNative(sim.result.retval), (_, v) => typeof v === 'bigint' ? v.toString() : (v?.type === 'Buffer' ? Buffer.from(v.data).toString('hex') : v)).slice(0, 600));
}
