// Node wrapper: Friendbot keys persisted under zk/.keys (testnet throwaways).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { Keypair } from '@stellar/stellar-sdk';
import { friendbot } from './rpc.mjs';
export * from './rpc.mjs';
const KEYS = new URL('../.keys/', import.meta.url);
export async function friendbotKey(name) {
  mkdirSync(KEYS, { recursive: true });
  const file = new URL(`${name}.secret`, KEYS);
  let kp;
  if (existsSync(file)) kp = Keypair.fromSecret(readFileSync(file, 'utf8').trim());
  else { kp = Keypair.random(); writeFileSync(file, kp.secret(), { mode: 0o600 }); }
  await friendbot(kp.publicKey());
  return kp;
}
