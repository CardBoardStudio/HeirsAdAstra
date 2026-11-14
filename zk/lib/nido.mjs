// Nido (Perch) account plumbing for the scout: factory creation, policy-doc
// grants, and session-key auth, following nidohq/blog's app-lib/session.ts.
// The session key is a WebCrypto P-256 key: same External signer and verifier
// as the blog's app passkey, but it signs without a device prompt.
import { Address, StrKey, Keypair, hash, xdr, nativeToScVal, scValToNative, rpc, TransactionBuilder, Operation, Contract, Account } from '@stellar/stellar-sdk';
import { server, NETWORK } from './rpc.mjs';
export const NIDO = {
  factory: 'CDDIW3F63PB6ZKMJN7CCGJSCYXTAVAVEEYNS36K2YFEJH7GQ3ADVZSVS',
  verifier: 'CDEV5YPS5IITPLQPYTKJGWBNZ2YZ7FQZIJNSHUMJRBE4QWYK2IVK4EJT',
  xlm: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
};
const P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const sha256 = async (b) => new Uint8Array(await crypto.subtle.digest('SHA-256', b));
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const hex = (b) => Buffer.from(b).toString('hex');
const b64u = (b) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** A P-256 signer that never leaves WebCrypto (non-extractable private key). */
export async function newP256() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return { pair, pub, pubHex: hex(pub) };
}
/** WebAuthn-shaped assertion over `challenge` (what Perch's verifier reads). */
export async function assertion(signer, challenge) {
  const clientData = new TextEncoder().encode(`{"type":"webauthn.get","challenge":"${b64u(challenge)}","origin":"https://galactic-reach.invalid","crossOrigin":false}`);
  const authData = new Uint8Array(37); authData[32] = 0x1d; // UP|UV|BE|BS, as Nido's syntheticAssertion.ts
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signer.pair.privateKey, cat(authData, await sha256(clientData))));
  let s = BigInt('0x' + hex(sig.slice(32)));
  if (s > P256_N / 2n) s = P256_N - s;
  const compact = cat(sig.slice(0, 32), Buffer.from(s.toString(16).padStart(64, '0'), 'hex'));
  // The verifier takes `sig_data` as the XDR bytes of OZ's WebAuthnSigData.
  return xdr.ScVal.scvBytes(xdr.ScVal.scvMap([
    ['authenticator_data', authData], ['client_data', clientData], ['signature', compact],
  ].map(([k, v]) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: nativeToScVal(Buffer.from(v)) }))).toXDR());
}
const AUTH_ADDR_DOMAIN = new TextEncoder().encode('perch/account/auth-addr-v1');
async function authDigest(account, payload, ruleIds) {
  const ids = xdr.ScVal.scvVec(ruleIds.map((id) => xdr.ScVal.scvU32(id))).toXDR();
  const bound = await sha256(cat(AUTH_ADDR_DOMAIN, StrKey.decodeContract(account), payload));
  return sha256(cat(bound, ids));
}
function authPayload(ruleIds, signer, sigData) {
  const key = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('External'), new Address(NIDO.verifier).toScVal(), nativeToScVal(Buffer.from(signer.pub))]);
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('context_rule_ids'), val: xdr.ScVal.scvVec(ruleIds.map((id) => xdr.ScVal.scvU32(id))) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('signers'), val: xdr.ScVal.scvMap([new xdr.ScMapEntry({ key, val: sigData })]) }),
  ]);
}
const contexts = (inv) => {
  const fn = inv.function();
  const own = fn.switch().value === xdr.SorobanAuthorizedFunctionType.sorobanAuthorizedFunctionTypeContractFn().value
    ? { contract: Address.fromScAddress(fn.contractFn().contractAddress()).toString(), fn: fn.contractFn().functionName().toString() } : { contract: 'create', fn: '' };
  return [own, ...inv.subInvocations().flatMap(contexts)];
};
export async function view(contractId, fn, ...args) {
  const tx = new TransactionBuilder(new Account(Keypair.random().publicKey(), '0'), { fee: '100', networkPassphrase: NETWORK }).addOperation(new Contract(contractId).call(fn, ...args)).setTimeout(30).build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error.split('\n')[0]);
  return scValToNative(sim.result.retval);
}
export async function installedRules(account) {
  return (await view(account, 'installed_rules')).map((r) => ({ id: r.id, name: r.name, contract: r.context_type?.[1], signers: r.signers }));
}

/**
 * Send `op` from `source` (a Friendbot key standing in for Nido's relayer or a
 * game sponsor), signing every auth entry of `account` with `signer` under the
 * rule chosen by `ruleFor({contract, fn})`. Returns result and metered costs.
 */
export async function sendAs(source, op, { account, signer, ruleFor }) {
  const build = (o) => new TransactionBuilder(acct, { fee: '2000000', networkPassphrase: NETWORK }).addOperation(o).setTimeout(120).build();
  let acct = await server.getAccount(source.publicKey());
  const rec = await server.simulateTransaction(build(op));
  if (rpc.Api.isSimulationError(rec)) throw new Error('record: ' + rec.error.split('\n').slice(0, 4).join(' | '));
  const latest = (await server.getLatestLedger()).sequence;
  const auth = [];
  for (const entry of rec.result.auth) {
    const creds = entry.credentials();
    if (creds.switch().name !== 'sorobanCredentialsAddress' || Address.fromScAddress(creds.address().address()).toString() !== account) { auth.push(entry); continue; }
    const ids = contexts(entry.rootInvocation()).map(ruleFor);
    const until = latest + 60;
    creds.address().signatureExpirationLedger(until);
    const payload = hash(xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(new xdr.HashIdPreimageSorobanAuthorization({
      networkId: hash(Buffer.from(NETWORK)), nonce: creds.address().nonce(), signatureExpirationLedger: until, invocation: entry.rootInvocation(),
    })).toXDR());
    creds.address().signature(authPayload(ids, signer, await assertion(signer, await authDigest(account, payload, ids))));
    auth.push(entry);
  }
  const fn = op.body().invokeHostFunctionOp().hostFunction();
  const signedOp = Operation.invokeHostFunction({ func: fn, auth });
  const enforced = await server.simulateTransaction(build(signedOp));
  if (rpc.Api.isSimulationError(enforced)) {
    const ev = (enforced.events || []).map((e) => { try { const b = e.event().body().v0(); return b.topics().map((t) => JSON.stringify(scValToNative(t), (_, x) => typeof x === 'bigint' ? String(x) : x)).join(',') + ' => ' + JSON.stringify(scValToNative(b.data()), (_, x) => typeof x === 'bigint' ? String(x) : x).slice(0, 300); } catch (err) { return '?'; } });
    throw new Error('enforce: ' + enforced.error.split('\n')[0] + '\n  ' + ev.slice(-12).join('\n  '));
  }
  acct = await server.getAccount(source.publicKey());
  const tx = rpc.assembleTransaction(build(signedOp), enforced).build();
  tx.sign(source);
  const sent = await server.sendTransaction(tx);
  if (sent.status === 'ERROR') throw new Error('send: ' + sent.errorResult?.result().switch().name);
  const got = await server.pollTransaction(sent.hash, { attempts: 60 });
  if (got.status !== 'SUCCESS') throw new Error(`tx ${sent.hash} ${got.status}`);
  return {
    hash: sent.hash, value: got.returnValue ? scValToNative(got.returnValue) : undefined,
    feeCharged: Number(got.resultXdr.feeCharged().toString()), cpu: Number(enforced.transactionData.build().resources().instructions()), readBytes: Number(enforced.transactionData.build().resources().diskReadBytes?.() ?? 0), writeBytes: Number(enforced.transactionData.build().resources().writeBytes()),
    minResourceFee: Number(enforced.minResourceFee), txBytes: tx.toEnvelope().toXDR().length,
  };
}

/** Nido's factory: an account bound to `admin` (the user's passkey key). */
export async function createAccount(source, admin, invoke) {
  const setup = Keypair.random();
  const setupPk = setup.rawPublicKey();
  const digest = hash(Buffer.concat([Buffer.from('nido/bind/v1'), hash(Buffer.from(NETWORK)), StrKey.decodeContract(NIDO.factory), Buffer.from(admin.pub)]));
  const r = await invoke(source, new Contract(NIDO.factory).call('create_account',
    xdr.ScVal.scvBytes(setupPk), xdr.ScVal.scvBytes(Buffer.from(admin.pub)), xdr.ScVal.scvBytes(setup.sign(digest))));
  return { account: r.value, create: r };
}

/** The policy document a Nido grant page would apply: admin + game grants. */
export function grantDoc({ admin, session, game, notAfter, stakeCap }) {
  const rules = [
    { name: 'admin', principals: { signers: ['admin'], type: 'all' }, scope: { type: 'self-admin' } },
    { functions: ['sit', 'draw', 'play', 'cleanup'], name: 'galactic-reach', 'not-after-ledger': notAfter, principals: { signers: ['session'], type: 'all' }, scope: { address: game, type: 'contract' } },
  ];
  if (stakeCap) rules.push({ args: [{ index: 1, pred: { address: game, type: 'address-eq' } }], cap: { limit: String(stakeCap), 'period-ledgers': 17280 }, functions: ['transfer'], name: 'galactic-stakes', 'not-after-ledger': notAfter, principals: { signers: ['session'], type: 'all' }, scope: { address: NIDO.xlm, type: 'contract' } });
  return JSON.stringify({ network: NETWORK, rules, signers: [{ id: 'admin', key: admin.pubHex, verifier: NIDO.verifier }, { id: 'session', key: session.pubHex, verifier: NIDO.verifier }], version: 1 });
}

/** The real Nido grant page request for this table (test.nido.fyi, testnet). */
export function grantUrl({ account, sessionPubHex, game, origin, returnUrl, stakeXlm = 5 }) {
  const u = new URL(`https://${account.toLowerCase()}.test.nido.fyi/security/delegate-doc/`);
  const p = u.searchParams;
  p.set('origin', origin); p.set('return', returnUrl); p.set('pubkey', sessionPubHex); p.set('duration', '24h');
  p.set('grant.0.label', 'galactic-reach'); p.set('grant.0.target', game);
  p.set('grant.0.functions', 'sit,draw,play,cleanup'); p.set('grant.0.limit', 'none');
  p.set('grant.1.label', 'galactic-stakes'); p.set('grant.1.target', NIDO.xlm); p.set('grant.1.functions', 'transfer');
  p.set('grant.1.limit', String(stakeXlm)); p.set('grant.1.limit_period', 'day'); p.set('grant.1.to', game);
  return u.toString();
}
