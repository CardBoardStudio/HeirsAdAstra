// Read-only: print a deployed contract's function signatures from its wasm spec.
import { rpc, contract } from '@stellar/stellar-sdk';
const server = new rpc.Server('https://soroban-testnet.stellar.org');
const wasm = await server.getContractWasmByContractId(process.argv[2]);
const spec = contract.Spec.fromWasm(wasm);
const want = process.argv.slice(3);
for (const f of spec.funcs()) {
  const name = f.name().toString();
  if (want.length && !want.includes(name)) continue;
  const ty = (t) => t.switch().name.replace('scSpecType', '') + (t.switch().name === 'scSpecTypeBytesN' ? t.bytesN().n() : t.switch().name === 'scSpecTypeUdt' ? ':' + t.udt().name().toString() : t.switch().name === 'scSpecTypeVec' ? '<' + ty(t.vec().elementType()) + '>' : '');
  console.log(name + '(' + f.inputs().map((i) => i.name().toString() + ': ' + ty(i.type())).join(', ') + ') -> ' + f.outputs().map(ty).join(','));
}
