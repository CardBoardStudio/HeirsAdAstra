# Rival search performance

## Intended behavior before optimization

This is a performance refactor of the current browser/solo policy. It must keep
every decision, tie order, legal action, payment sequence and game RNG call the
same. It does not introduce a new strategy or change the Military Builder study.

Grounding: the canonical manual's [rival priorities](../../prototypes/galactic-reach/rulebook.html#clarifications),
[movement](../../prototypes/galactic-reach/rulebook.html#movement),
[construction](../../prototypes/galactic-reach/rulebook.html#building), and
[resource payments](../../prototypes/galactic-reach/rulebook.html#resources).
Rivals retain their existing visibility and pay normal costs. Equal choices keep
their existing home-oriented tie order.

Only identical subproblems within one unchanged decision may share results.
Construction can share a funding plan when player, hand, excluded order,
resources, limits and resource cost are identical. Movement cards can share a
movement evaluation only when their effective range and movement restrictions
are identical. A later decision must recompute after a payment, conversion,
build, move, combat, draw, capacity purchase or trade.

Verification compares the complete game state after every bot decision and the
RNG-call count, as well as the final winner, scores, round and decision count,
for matched seeded games. CPU profiles and timings are separate from the
equivalence assertion. The native shared-table policy is outside this refactor.

## Commands

Use Node.js 24. On an otherwise idle machine:

```sh
node scripts/profile-bot-search.cjs --mode profile --variant baseline --out /tmp/gr-search-profile
node scripts/profile-bot-search.cjs --mode profile --variant optimized --out /tmp/gr-search-profile
node scripts/profile-bot-search.cjs --mode compare --games 8 --out /tmp/gr-search-profile
```

The baseline defaults to the worktree's `HEAD` app; optimized uses its working-tree app.
Pass `--baseline 9178a09ecc94b8c58959e2839d2d8a33ff9445fd` to reproduce this
change's original baseline after committing the optimization. This harness drives the
ordinary browser policy headlessly in every seat and does not replace legal
actions, game rules, combat outcomes or random number generation.

## Measured result

The [recorded comparison](../../analysis/search-performance-2026-11-15/results.json)
uses Node 24.22.3 and the exact pre-optimization commit named above. Eight
standard-policy games averaged 11.38 seconds before and 2.12 seconds after,
an aggregate 5.35-fold speedup. Timing includes VM setup and state hashing.
Four additional games rotate the existing simulation-only Military Builder
through every seat. All 10,882 decision states and RNG sequences match across
the twelve paired games, including terminal scores, winners and rounds.
These are local paired wall-clock measurements, not a hardware benchmark.

In the profiled game, complete route searches fell from 18,631 to 2,239 and
payment searches from 18,604 to 2,003. The cache holds route trees rather than
individual goal paths, so destinations with the same starting group share the
same weighted search. It preserves portal costs, hostility checks and tie order.

Mechanic, cache, dialog, replay, rulebook and rules-contract tests passed.
`scripts/build-web.sh` could not build packaged assets because `cargo` is not
installed on this machine. No merge or deployment was requested or performed.
