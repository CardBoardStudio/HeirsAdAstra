# Strategic rival study

The 37.42 round-19 human report finished 43–19–17–22. Its browser rivals upgraded all starters only to II. The human reached III on all six by round 12 and drew 186 cards, versus 95/123/120 for the rivals, excluding Undo ranges. Only one rival initiated a battle. These observations motivate a policy experiment; they do not establish the balance of human strategies.

The canonical rules are [rival planning](../../prototypes/galactic-reach/rulebook.html#rival-planning), [cards](../../prototypes/galactic-reach/rulebook.html#rival-cards), [Buy](../../prototypes/galactic-reach/rulebook.html#buy), and [combat](../../prototypes/galactic-reach/rulebook.html#combat). Policies use only public board/market data and the acting seat’s own cards and relic knowledge. Human mechanics, setup and RNG must remain unchanged.

## Evaluation protocol

The first baseline was `45b3a4057e879c65ec77eed2b5e2ce349445e1cc`. Main then adopted unknown-only Probe and unlimited affordable purchases in `d3e3ab6a672e330aa3a69eddd9c2d5b537ab76fa`; the final comparison uses that commit so both policies play the current human rules. Use the same browser decision functions as solo play, with a headless driver that permits seat zero to be computer controlled. Use 40 Prestige, seeded maps/decks, three strategy profiles, each profile duplicated in turn, and all four seat rotations. Compare paired baseline and updated matches, plus mixed matches to measure strength rather than only self-play balance. Seeds and batch sizes must be chosen before the final evaluation; tuning uses separate pilot seeds. Report incomplete games as incomplete, never invented winners. Track initial map hashes, outcomes, rounds, score sources, upgrades, drawing, purchases, conquests, defenses, resource gains/spending/overflow and banking. Resource throughput is a diagnostic, not proof of equal marginal value. Native-policy checks are reported separately from the browser study.

No result from a small training pilot is the final balance estimate. Preserve old published engines and native policies.

## Current-rules rerun

The earlier 384-game study is preserved in [the historical bundle](../../analysis/strategic-bots-before-unlimited/README.md). It does not measure the unlimited-purchase game. Before starting the rerun, fix eight held-out setup seeds, three duplicated-profile lineups, all four rotations, 96 updated-only games and 192 complementary mixed games (288 total). The mixed games compare old and updated decisions under the same current human rules. Native policy validation remains separate from browser balance results. No browser parameters are tuned using the rerun outcomes.

The final candidate also corrects a bank-funding guard found by CI: purchasing reserves are evaluated after the planned exchange, and a blocked first choice does not suppress other feasible cards. This is a correctness fix, not tuning from the held-out outcomes. The partial pre-correction rerun is excluded from the final study.

## Final assessment

All 288 current-rules games completed. Updated browser rivals won 131/192 mixed games (68.2%) against their predecessors. Among the 96 updated-only games, Military won 41 (42.7%), Economy 39 (40.6%) and Expansion 16 (16.7%). Military and Economy are close in this sample; Expansion remains behind. Updated-only players averaged 5.80 Level III starters, and 358/384 finished with all six at III.

All four resources have substantial recorded spending. Matter and Biomass are imported most often; Energy and Data are more often exchanged away. Overflow is partly intentional III conversion for draw, so it does not by itself establish waste. The [final evidence bundle](../../analysis/strategic-bots-results/README.md) records raw games, resource accounting limits, seed-cluster uncertainty and exact source hashes. These are browser-policy results, not a claim about optimal human play or separately implemented native policy 29.
