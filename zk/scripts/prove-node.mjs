import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as gr from '../lib/grzk.mjs';
await gr.init();
const circuit = JSON.parse(readFileSync(new URL('../circuits/gr_draw/target/gr_draw.json', import.meta.url)));
const seed = gr.randomField(), tableSeat = 7n * 4n + 1n, beacon = gr.randomField();
const base = { seed, deck: gr.STARTER_DECK, deckSalt: 0n, tableSeat, beacon, nonce: 1n, n: 5, discard: Array(gr.T).fill(0) };
const plan = gr.planDraw(base);
console.log('drawn', plan.cards.map((c) => gr.CARD_TYPES[c]).join(', '));
const inputs = gr.circuitInputs(base, plan);
const threads = Number(process.env.THREADS || 1);
const runs = [];
for (let i = 0; i < Number(process.env.RUNS || 3); i++) {
  const r = await gr.prove(circuit, inputs, { threads });
  runs.push(r);
  console.log(`run ${i}: witness ${r.witnessMs.toFixed(0)} ms, prove ${r.proveMs.toFixed(0)} ms, proof ${r.proof.length} B, public inputs ${r.publicInputs.length}`);
}
const last = runs.at(-1);
console.log('bb.js verify', await gr.verify(last));
mkdirSync(new URL('../out/', import.meta.url), { recursive: true });
writeFileSync(new URL('../out/proof.bin', import.meta.url), last.proof);
writeFileSync(new URL('../out/public_inputs.json', import.meta.url), JSON.stringify(last.publicInputs));
writeFileSync(new URL('../out/inputs.json', import.meta.url), JSON.stringify(inputs));
process.exit(0);
