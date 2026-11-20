// Heirs Ad Astra ZK draw: client half. Plans a draw exactly as circuits/gr_draw
// constrains it, then proves it with bb.js (UltraHonk, keccak ZK flavor), the
// proof the vendored Soroban verifier accepts. Runs in Node and the browser.
import { BarretenbergSync, Fr, UltraHonkBackend } from '@aztec/bb.js';
import { Noir } from '@noir-lang/noir_js';

export const T = 40;
export const MAX_DRAW = 5;
export const DOM = {
  SEED: 0x4752534545440001n, DECK: 0x475244454b0002n, DECKSALT: 0x47524453540003n,
  PICK: 0x475250494b0004n, SLOT: 0x4752534c540005n, SLOTSALT: 0x47525353540006n,
};
export const FIELD = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n;

// Card types: index = code. Move/Construct keep starter level and bought copies apart.
export const CARD_TYPES = [
  'move', 'move+', 'move*', 'construct', 'construct+', 'construct*', 'colonize', 'probe', 'excavate',
  'surveyDrones', 'pathfinderNetwork', 'dropColonyModules', 'modularConstruction', 'industrialSurge',
  'orbitalShipyards', 'tradeConsortium', 'fleetOverdrive', 'targetingAlgorithms', 'ablativePlating',
  'emergencyJump', 'coordinatedAssault', 'salvageCrews', 'tacticalForesight', 'dataBrokerage',
  'procurementNetwork', 'marketManipulation', 'commandUplink',
  'voidglassAstrolabe', 'phaseShearDrive', 'firstDawnEchoes', 'omniscientChorus', 'genesisSeedVault',
  'precursorMatterLoom', 'worldweaverSpore', 'cradleOfLostSuns', 'obeliskOfAnnihilation',
  'aegisOfTheSilentArchitects', 'warSongOfTheHollowStars', 'naniteOssuary', 'reserved',
];
export const STARTER_DECK = (() => { const d = Array(T).fill(0); d[0] = 3; d[3] = 3; return d; })();

let bbSync;
export async function init() { bbSync ??= await BarretenbergSync.initSingleton(); }
const fr = (x) => new Fr(((BigInt(x) % FIELD) + FIELD) % FIELD);
export function h(values) {
  return BigInt(bbSync.poseidon2Hash(values.map(fr)).toString());
}
export const hex32 = (x) => '0x' + BigInt(x).toString(16).padStart(64, '0');
export const randomField = () => {
  const b = crypto.getRandomValues(new Uint8Array(32)); b[0] &= 0x1f;
  return BigInt('0x' + [...b].map((x) => x.toString(16).padStart(2, '0')).join(''));
};

export const seedCommit = (tableSeat, seed) => h([DOM.SEED, tableSeat, seed]);
export const deckHash = (counts, salt) => h([DOM.DECK, ...counts, salt]);
export const slotCommit = (type, salt) => h([DOM.SLOT, type, salt]);
const sum = (a) => a.reduce((x, y) => x + y, 0);

/** Everything the seat needs to prove a draw and later open its slots. */
export function planDraw({ seed, deck, deckSalt, beacon, nonce, n, discard }) {
  const counts = [...deck];
  let size = sum(counts);
  const discardSize = sum(discard);
  const fold = size < n && discardSize > 0;
  let folded = false;
  const cards = [], slots = [], salts = [];
  for (let j = 0; j < MAX_DRAW; j++) {
    let slot = 0n;
    if (j < n) {
      if (size === 0 && fold && !folded) { discard.forEach((c, t) => (counts[t] += c)); size = discardSize; folded = true; }
      if (size > 0) {
        const r = h([DOM.PICK, seed, beacon, nonce, j]);
        const idx = Number((r & 0xffffffffffffffffn) % BigInt(size));
        let acc = 0, chosen = -1;
        for (let t = 0; t < T; t++) { if (chosen < 0 && idx < acc + counts[t]) chosen = t; acc += counts[t]; }
        counts[chosen] -= 1; size -= 1;
        const salt = h([DOM.SLOTSALT, seed, beacon, nonce, j]);
        slot = slotCommit(chosen, salt);
        cards.push(chosen); salts.push(salt);
      }
    }
    slots.push(slot);
  }
  const newSalt = h([DOM.DECKSALT, seed, beacon, nonce]);
  return { cards, salts, slots, fold, newDeck: counts, newSalt, deckCommitNew: deckHash(counts, newSalt) };
}

export function circuitInputs({ seed, deck, deckSalt, tableSeat, beacon, nonce, n, discard }, plan) {
  const s = (x) => hex32(x);
  return {
    seed: s(seed), deck: deck.map(String), deck_salt: s(deckSalt),
    table_seat: s(tableSeat), seed_commit: s(seedCommit(tableSeat, seed)), beacon: s(beacon), nonce: s(nonce),
    n: String(n), deck_size_old: String(sum(deck)), deck_commit_old: s(deckHash(deck, deckSalt)),
    discard: discard.map(String), fold: plan.fold, deck_commit_new: s(plan.deckCommitNew), slot_commits: plan.slots.map(s),
  };
}

let prover;
/** Prove with bb.js. `threads` > 1 needs a cross-origin-isolated page in browsers. */
export async function prove(circuit, inputs, { threads = 1 } = {}) {
  prover ??= { noir: new Noir(circuit), backend: new UltraHonkBackend(circuit.bytecode, { threads }) };
  const t0 = performance.now();
  const { witness } = await prover.noir.execute(inputs);
  const t1 = performance.now();
  const proof = await prover.backend.generateProof(witness, { keccakZK: true });
  const t2 = performance.now();
  return { proof: proof.proof, publicInputs: proof.publicInputs, witnessMs: t1 - t0, proveMs: t2 - t1 };
}
export async function verify(proofData) { return prover.backend.verifyProof(proofData, { keccakZK: true }); }
