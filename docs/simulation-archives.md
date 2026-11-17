# Simulation archives

Every normal run of `balance-simulations.cjs`, `strategic-bot-study.cjs`, `profile-bot-search.cjs`, and `card-evolution/run.cjs` now creates a full archive for each game. Summary output is additional evidence, never the only retained result. The exported study `factory` also archives by default, so a custom study using that factory inherits recording. Custom policy handoffs share one recorder for the entire game.

Use the canonical factory for new bot studies. Do not copy an older summary-only harness. Pass the complete task as `archiveMetadata` and any external policy/harness text as `archiveSources`. The actual transformed engine and adapter are frozen automatically. A custom runner must call `archive.finish({reason, incomplete, summary})` when its own limits stop a game; winning games close automatically. The archive directory is returned as `archive.directory` (or the `archive` path in study results).

## What is kept

Each `game-*` directory contains:

- `manifest.json`: schema version, exact configuration supplied by the runner (seed, profiles, policy assignment, target and bounds), runtime version, source hashes, completion status and final state hash.
- `sources/`: exact executable rules and adapter, runner/policy source and recorder, plus the canonical rulebook. Mixed-policy games retain every source variant. Card-evolution games also freeze their complete generated pool, generator, scoring code and configuration.
- `trace.jsonl.gz`: initial full private state, lossless state patches at every runner decision and action/event boundary, engine counters (`turnSerial` and `cardSerial`), every random value, commands/arguments/results, all game messages, draws, resource gains/payments, trades, production and round-end records. Full positions include ordered decks, hands, in-play/discard, hidden relics, tactics/commitments, map, pending decisions, ownership and scores. No observer redaction is applied to generated simulation data.
- `summary.json`: the runner's final per-game metrics when available.

A position can be materialized at any recorded checkpoint without playing the game again. Legal options and faction views can be derived from that position, saved counters and the frozen adapter. Arrays retain their order and object key order is preserved. Random values and checkpoints are numbered. The reader verifies source, compressed trace, state and engine-counter hashes.

`before-decision` / `after-decision` checkpoints bracket a runner invocation such as `runAiOperation`, `runAiBuy` or a combat command. `event-state` also captures nested action, draw, production and round boundaries. Some event checkpoints are inside an automatic resolution; use the outer decision boundary as the resumable position. Round-end events retain the unplayed hand before cleanup. Resource events retain both requested/actual gains and overflow; production retains actual requested gross income, overflow and before/after storage (including experiment toggles), while round-end events include the engine’s income forecast. This supports resource-time plots, card-use audits and other later analysis without a whole-match rerun.

## Where and how long

Local archives default to `output/simulations/`, ignored by Git. No local pruning, overwrite or automatic deletion is performed. Each game uses a unique directory, including repeated seeds. Study/profiling results always use a new `run-*` child of the requested output root, including concurrent runs. Batch IDs connect related per-game archives; prior summaries and CPU profiles are not overwritten. For a permanent study location outside a temporary checkout, set:

```sh
GR_SIMULATION_ARCHIVE_DIR=/absolute/path/to/study/games node scripts/balance-simulations.cjs 1
```

This works with the study and profiling runners too. Their normal stdout summaries remain usable. Full archiving adds measurement and disk overhead; profiling runs include that overhead and should be compared under the same recording configuration.

CI's **Balance harness** job uploads `output/simulations/` even when it fails, with a **90-day GitHub artifact retention**. That job is in the [heavy tier](release.md#heavy-tests): it runs on the release PRs and on manual CI runs, not on change PRs. Download CI artifacts for longer retention. Local archives have no such expiry.

## Interrupted and failed games

Records are appended synchronously and completed runner decisions are flushed. During execution, `manifest.json` points to `trace.partial.jsonl`. Errors keep their diagnostic stack and last full position. Normal exits close an incomplete archive. An operating-system interrupt or hard-killed process leaves a readable partial journal; the reader accepts a truncated final line and retains every preceding complete record. A `running` manifest with a partial journal means the writer did not close normally, not that the game completed. It never invents a winner.

On completion, a compressed trace is written before switching the manifest to it. The original journal is removed only after the new manifest exists. Finished/failed/incomplete archives all remain available.

## Reanalysis

Emit the verified history with full positions restored from patches:

```sh
node scripts/read-simulation-archive.cjs /path/to/game-archive > positions.jsonl
```

For a Node analysis, iterate `archiveRecords(directory)` from `scripts/lib/simulation-archive.cjs`. Each record's `position` contains the complete reconstructed state; `counters` accompanies checkpoints. Iteration avoids retaining every position in memory. `readArchive(directory)` is a convenience materializer for small games and tests.

The format is `galactic-reach-simulation/1`. New fields must preserve old-reader meaning or use a new schema version. Never rewrite an old archive to match current rules.

## Frozen market experiments

`market-investment-study.cjs` freezes the chosen browser, adapter and canonical rulebook at batch start. It supplies that rulebook to `SimulationArchive` through `rulebookSource`; later edits in a working tree cannot silently change a subsequent game's recorded rules. Each run also retains the original sources, runner and protocol outside temporary checkouts when `--out` points to a durable directory.

`--opponent-source-dir` permits a designated subject to face another browser policy under the same printed card catalog. The runner rejects different catalogs. It resumes the complete state and counters when policy control changes, shares the recorder and random stream, and keeps both compiled source versions. The designated subject is original lineup slot zero (seat `(4 - rotation) % 4`); use that seat when comparing it with a duplicated-profile control. This mode is for policy comparisons under identical rules, not for playing two price variants in one game.

## Native policy studies

Build `cargo build -p galactic-reach --example policy-study`, then run `node scripts/native-investment-study.cjs --native-bin target/debug/examples/policy-study --mode mixed --out /durable/path`. `--mode control` removes the new investment-planning marker from each policy observation; `mixed` enables it only for the designated original slot-zero subject; `updated` enables it for all seats. The authoritative game state and legal actions stay unchanged. Use `--max-round`, seeds and all rotations consistently across conditions, and report incomplete games separately.

Each batch retains the native binary and its hash, Rust policy/bridge sources, Cargo lockfile, browser/adapter/rulebook sources and full per-game journals. Native choice events retain the actor, selected index, policy, observation hash and ordered legal-action hash. The three standard native policies and the Market research profile are deterministic; the bridge rejects Wanderer, and records zero native RNG draws. Engine RNG is still recorded in full. The reproducibility check replays recorded actions and verifies every full private position, engine counter, policy observation and ordered legal set. `--native-source-dir` and `--source-dir` permit an already-frozen earlier binary/policy bundle to be compared without attributing it to today's working files.

Native market research can opt into two additional policies without changing the default observation: `--tactical-forecast none|subject|all` for the restricted public-tactic Fleet forecast, and `--military-horizon none|subject|all` for the late-purchase utility penalty. Both default to `none`. Their values are frozen in `protocol.json`; the runner injects the corresponding observation flags before hashing each native choice. Reanalysis must reproduce those flags when checking observation hashes. These are experiments, not website profile selectors or evidence of improved strength. See `docs/rules/market-investment.md` for matched results and rejected candidates.
