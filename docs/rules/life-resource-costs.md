# Life resource costs

The player specification is the canonical [resource-cost table](../../prototypes/galactic-reach/rulebook.html#resource-costs), with [Colony terms](../../prototypes/galactic-reach/rulebook.html#orders) and [excavation](../../prototypes/galactic-reach/rulebook.html#excavation). This change adopts the `revised_life3` arm of the 2026-11-19 browser-bot study.

## Implementation and compatibility

`COLONY_LIFE_COST` supplies the ordinary founding price to the payment, map key, tutorial and guidance. `colonyTerms` retains captures and explicit discounted/free card prices. Ship, structure and excavation definitions supply their own payments. Browser reserves and funding plans read these definitions; their heuristic weights and production targets match the evaluated candidate.

Life keeps the internal `biomass` key, terrain colour and leaf symbol. Only the displayed name changes. A new breaking change entry isolates the new costs on dev; the release cut owns version increments and archiving. No archived engine, policy or past simulation output is edited.

## Evidence

The frozen comparison used base commit `3f1b5135e12bb6bcb58f03a21f517b078ba5c45d`: 32 new map seeds, three evenly duplicated Military/Economy/Expansion lineups, four seat rotations and three price arms. Each arm has 384 games at 30 Prestige. The browser policy runs every seat; no Rust policy participates. Before production, original/current-cost parity, observer parity and identical initial positions were verified.

All 1,152 games finished. All retained source, trace, private-state, engine-counter and random-stream hashes passed validation. Every decision and whole-game resource ledger reconciled. Confidence intervals resample whole matched map-seed blocks 10,000 times.

The selected arm averaged 17.8 rounds, compared with 17.6 for current costs and 17.4 for the revised arm with the lower founding price. It reduced Matter spending but increased funding-blocked goals. Trading for Life increased relative to the other revised arm. Strategy win-rate differences remain uncertain; the user chose this arm for playtesting, not as a claim of proven balance.

Full results, frozen sources, protocol and archives remain at:

- ORCD: `/orcd/pool/008/maxhays/galactic-reach-simulations/resource-cost-study-20261119` (production job `29639809`, full-archive audit `29640167`).
- Local bundle: `output/resource-cost-study-2026-11-19/`, including `report.html`, `summary.json`, `results.jsonl`, `code/protocol.json` and `full-archives.tar.gz`.
- Full archive bundle SHA-256: `95825b24cb0907d5236c3e5a5ef87beeb39dca86a0a67560a0cda66005f45c34` (1,152 complete game archives).
- Frozen candidate app SHA-256: `31c5527f8dada1e6bad52d226cf45059899a565a566ba34dbf464f7a14926251`.

The 100-round, 30,000-decision and 300-second bounds were study safety limits, not game rules. No unfinished game was assigned a winner.
