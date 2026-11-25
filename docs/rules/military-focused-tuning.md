# Military Focused: first validated improvement

The five-to-ten-Fleet candidate won 76 of 192 fresh-map games (39.6%), compared with 53 of 192 (27.6%) for the original Military Focused policy. The paired improvement was 12.0 percentage points, with a map-block bootstrap 95% interval of 3.6–20.3 points. It improved the bot, but did **not** reach the requested majority of wins.

This evaluates the browser rival described in the canonical [Military Focused section](../../prototypes/galactic-reach/rulebook.html#military-focused-rival). It changes the rival's decisions, with ordinary game rules, the normal nine-card market and the 30-Prestige target. Military, Economy and Expansion remain the same opponents. It does not test a Rust decision policy or establish human-player balance.

## Selection and fresh validation

The 2026-11-25 development rounds each used 12 new map seeds, four starting-seat rotations per seed, and all six relative opponent orders twice per policy. Each round compared the original with six candidates: 336 complete games. All histories and failed-candidate sources remain retained.

- Round 1: small independent raiding groups performed worse. The original won 20/48; the strongest challenger won 15/48. Reject all six candidates.
- Round 2: keeping a hunting group together, allowing it to grow beyond five, was strongest. It won 25/48 versus the original's 13/48. Those development results selected the candidate; they are not independent evidence of a majority win rate.
- Freeze that exact executable source, then play 48 disjoint new maps, four rotations each, with both policies: 384 validation games, 192 per policy. Every profile occupies each seat once on every map; all 24 seat assignments occur eight times per policy.

The selected policy launches at five Fleets, keeps up to ten together, slightly prefers nearer fights, and values playing Victory Doctrine in a favourable battle. It rejects purchases for unrelated Prestige. Smaller-than-five early raids were not adopted. Its two-world plan, forward Fleet production, Harvester filling and capacity support remain.

| Validation lineup | Focused | Military | Economy | Expansion |
| --- | ---: | ---: | ---: | ---: |
| Original Focused | 53 (27.6%) | 53 (27.6%) | 55 (28.6%) | 31 (16.1%) |
| Five-to-ten-Fleet Focused | 76 (39.6%) | 35 (18.2%) | 56 (29.2%) | 25 (13.0%) |

The original's win-share 95% interval is 20.8–34.9%; the candidate's is 31.8–47.9%. Intervals use 20,000 percentile-bootstrap resamples of whole map blocks, preserving all four rotations. Paired differences resample the same blocks together. The selected policy contains several decision changes, so the aggregate comparison does not isolate the causal contribution of each one.

## Points across all validation games

Means include losses, rather than only winning scores. Victory Doctrine is combat-derived card Prestige.

| Source | Original Focused | Five-to-ten-Fleet Focused |
| --- | ---: | ---: |
| Held Colonies | 5.30 | 4.98 |
| Ordinary combat victories | 19.34 | 21.25 |
| Card Prestige | 0.39 | 0.41 |
| Relics | 0 | 0 |
| Total | 25.03 | 26.64 |

For the selected policy, every card point came from Victory Doctrine. Combat plus Doctrine supplied 81.3% of all its points. No game exceeded two held Colonies or earned relic Prestige. The mean first Fleet move remained round 10.48 in both policies; this improvement did not accelerate the opening.

## Reproducibility and retention

All 384 validation games finished and passed source/trace/state/counter/RNG integrity checks, every-decision and whole-game resource accounting, production receipts, scoring reconciliation, and the two-world/no-relic constraints. No failed or incomplete games were excluded. ORCD job `30413978` completed with exit code `0:0` on `node1609`.

- Original source commit: `af501e5759fc26002ea2a09036a1a4ef4371b01c`.
- Selected `app.js` SHA-256: `afdf2c755581a4830f350928b22f5d01b09802733b46c3def338d78b3c667dd6`. The promoted executable matches it exactly; the final player-facing rulebook wording clarifies the selected group sizes.
- Validation protocol SHA-256: `3ca8d25d11bf28908640945bacad7b82288c6ad7a35af7b3ea195ab4776ee4e3`.
- Audited validation rows SHA-256: `4494e280f560003e81163267b57213c0b310e4937bf2def8144f3f240ba857af`.
- Local study parent: `output/military-focused-improvement-20261125/`. Development runs are `run-accb1236f8` and `run-round2-6e2c170c59`; validation is `run-validate-r2-aa8fb1c395`. Each retains its frozen protocol, source hashes and audit results. `analyze-round.py` records the analysis; the validation's `analysis/report.html` and `analysis/summary.json` report every outcome.
- Complete validation game histories and sources: `/home/maxhays/galactic-reach-simulations/focused-run-validate-r2-aa8fb1c395/results/games/` on ORCD. Each audited row records its exact archive path. Full private positions, engine counters, actions/events and the random stream follow the [simulation archive contract](../simulation-archives.md).

Opening-production and early-upgrade candidates are separate continuing experiments. They do not alter this frozen validation result or establish a further improvement until tested on fresh maps.
