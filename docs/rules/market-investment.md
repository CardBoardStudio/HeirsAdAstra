# Market investment experiment

The round-16 human report on 38.43 ended 33–19–15–14 at a target of 30. The human built seven Harvesters; the rivals built three, three and four. None bought a market card. All six purchased cards were Capacity Modules. Reversed Undo ranges are excluded from these counts.

## Intended policy and rules

Keep all players on the same legal actions, payments, visibility, scoring and victory target. Improve rivals' production investment using useful income that can actually be stored and spent, a finite payback horizon, immediate scoring opportunities and defense. Compare market purchases with starter upgrades before the Buy budget is exhausted. Build a path from capacity through income and saved payment to a chosen market card, rather than valuing a card without funding it.

Add a market-prioritizing research rival on top of the improved movement, defense, production and scoring policy. Its purchases must still be useful and affordable; increased purchases alone do not establish strength. First evaluate this rival against the printed market, then change market cards in separately named candidates. Preserve the user's existing restriction against resource-granting card effects and nonstarter conversions. Do not tune relic rewards or scoring in this experiment.

The canonical anchors are `rulebook.html#rival-planning`, `#rival-cards`, `#resources`, `#market`, and `#cards`. Any adopted gameplay changes must be described in those sections and kept consistent with printed definitions before implementation. Native policies are evaluated separately; browser findings do not prove native parity.

## Protocol

- Target 30, matching the supplied game; current map and relic rules. Full archives include every game, failure, source, private position and random stream.
- Training pilot seeds: 170010 and 177929, each with all four seat rotations. Initial lineup: Military, Economy, Expansion, Military. Baseline source is main commit `c45ef8f` in full, frozen in each run; this is not an old published-policy baseline.
- The market rival substitutes for the duplicated Military seat, retaining the same seat rotations. Report both strength and purchases/plays, with purchases separated from Capacity Modules.
- Reserve seeds 190010, 197929, 205848, 213767, 221686, 229605, 237524 and 245443 for later evaluation; do not tune on them. Additional tuning batches get distinct seeds and labels.
- Compare completed games, scores by source, rounds, Harvesters, gross resource gains, spending, overflow, banking, market buys and actual plays. Incomplete games have no invented winner. Buyers' win rate is descriptive, not causal evidence for an individual card.
- After policies are credible, test card candidates with fixed policy and matched seeds. Include price-only and effect changes separately where possible. Verify a candidate against a market-priority ablation, not only against its predecessors.

## Iterations

This is an ongoing local experiment. No promotion or merge is authorized by the research goal. Record each candidate's exact changes and evidence before replacing it; keep all prior run directories.

### Policy v1, printed cards: first training pilot

Eight matched baseline games completed at 30 points, averaging 20.625 rounds, 3.3125 Harvesters built and 1.6875 market purchases per faction. With improved investment/market planning, eight games averaged 16.5 rounds, 7.375 Harvesters and 3.6875 market purchases. Faster self-play alone does not establish stronger play.

Replacing the duplicated Military seat with the market-priority rival produced five market wins out of eight games; it averaged 5.125 market purchases. This is a small training result, not a held-out balance estimate. Military tactic usage is recorded separately from ordinary card plays in the updated runs. The first two runner attempts are excluded with retained `exclusion.json` notes; neither is used in these figures.

The printed market is already useful to the improved buyer in this pilot. Its least-used roles still include expensive construction, discounted-buy orders and Colony alternatives. Keep this policy frozen while testing a price-only candidate, so improved purchasing cannot be mistaken for improved cards.

### Price v1 hypothesis

Reduce the entry cost of eight cards competing with already-upgraded starters; leave their effects, draw cards, Wonders, military tactics, relics and scoring unchanged. Prices are totals paid normally; cards still enter discard and cannot convert.

| Card | Proposed cost |
| --- | --- |
| Strike Vector | 1 Matter, 4 Energy |
| Fold-Space Gate | 6 Energy, 1 Data |
| Prefab Yards | 4 Matter |
| World Engine | 6 Matter, 1 Energy, 1 Biomass |
| Seed Ark | 4 Biomass |
| Colony Pods | 1 Energy, 4 Biomass |
| Procurement Hub | 1 Biomass, 4 Data |
| Trade Syndicate | 4 Energy, 1 Data |

The tier still follows total printed price. This candidate has 11 expensive, 7 medium and 13 cheap designs (22/14/26 copies). Test it against the frozen policy-v1 printed-card source, using the same pilot seeds and rotations. The expanded printed-card policy comparison uses six separate training seeds beginning 180010. Reserved evaluation seeds remain unused.

### Expanded training evidence and policy v2

The market-v1 opening result did not generalize: it won 2/24 games on six further training seeds, against Economy 13, Military 6 and Expansion 3. Keep the 5/8 opening result labeled as training noise. Price v1 with the same market-v1 policy won 3/8 opening-seed games, versus 5/8 on printed cards; lower prices alone have not established a stronger strategy.

Next hypothesis: market priority should sit on the successful Economy core, including its excavation/production preferences and defensive military, rather than on the Military core. Keep the first Construct II before discretionary market-first spending, and require a higher useful-card threshold. Compare it with a duplicated Economy control, under both printed and price-v1 cards. This isolates the added purchasing preference from the underlying tactical profile.

Also remove the hard target cutoff that made the rival abandon every capacity plan when a market contained only distant cards. Retain a delay penalty for ranking and a short-horizon guard against buying a module too late. Regression tests must still cover a complete path from choosing a card to buying and playing a Capacity Module.

### Policy v2 matched opening pilots

All 32 games completed. Compare the designated original slot-zero subject, not both Economy seats together: printed Economy control won 2/8 (24.625 mean points, 3.75 purchases), printed Market won 1/8 (24.75, 3.75), price-v1 Economy control won 2/8 (24, 3.625), and price-v1 Market won 2/8 (23.75, 4). Lowering the discretionary threshold has not produced a convincing advantage or even many extra purchases. Do not promote this price package based on these results.

Runs: `run-nVYlTT`, `run-HnEhrr`, `run-kV0GGo`, `run-RBt6t3`. Extended training repeats all four conditions at seeds beginning 180010, six seeds and four rotations per condition: `run-O8WBjZ`, `run-sdpU17`, `run-0ms9nF`, `run-UUi8tR`. The eight reserved evaluation seeds remain unused.

The complete mechanic suite and all 74 desktop dialog checks pass with policy v2 and price v1. Instrumentation equivalence also passes: measured and unmeasured games retain identical full states, counters and RNG after 160 decisions, and both archives rehydrate correctly. These checks establish implementation consistency, not strategic strength.

### Policy v3 hypothesis: omitted Buy discounts

Procurement Hub and Trade Syndicate are played by the rival but their `buyEffect` contributed no utility when choosing purchases. Value the average printed resource discount available among the three best face-up follow-up prices, excluding the discount card itself, times estimated redraw opportunities. No follow-up purchase means no discount value. Keep price v1 frozen and test separately from policy v2. This is a valuation estimate, not a change to the payment rules.

### Policy v2 extended comparison: all 96 games completed

| Subject policy | Card prices | Wins / 24 | Mean points | Market buys | Harvesters |
| --- | --- | --- | --- | --- | --- |
| Economy control | Printed | 4 | 20.04 | 3.17 | 7.21 |
| Market priority | Printed | 6 | 22.29 | 4.25 | 7.29 |
| Economy control | Price v1 | 7 | 24.42 | 4.33 | 7.08 |
| Market priority | Price v1 | 10 | 25.13 | 5.50 | 7.17 |

All 24 opening maps match across all four conditions. These are training games, and the win-rate intervals still overlap. Price v1 plus market priority is now a credible candidate for fresh-map evaluation; it is not established as dominant. The first discount-valuation v3 pilot finished 3/8, versus v2's 2/8 at these prices. Extended v3 comparisons retain printed and price-v1 conditions (`run-xNyaB7`, `run-XaiFHr`).

A mixed-policy runner now permits the designated subject to use a different policy from the other three seats, but only with identical printed card catalogs. An identical-policy handoff check preserves every private state, purchase, payment and counter after 180 decisions. Current old-policy controls and improved-v2-against-old batches use printed prices (`run-NfkUeZ`, `run-xv6z3E`).

Reanalysis command: `node scripts/analyze-market-investment.cjs output.json run-directory...`. The retained `v2-training-analysis.json` reports subject-only scoring, card usage, resource spending/overflow and win intervals. Resource totals are gross additions before overflow, not end-round storage. This avoids conflating two Economy seats or treating higher resource totals as proof of better balance.

Price changes also move cards between tier decks and therefore change which designs are face-up together. The matched maps are identical; the market exposure is intentionally not identical. An improvement for the whole package cannot be attributed to a particular price reduction without further ablation. In price-v1 Market games, 29 of 31 designs were purchased across the designated subjects, and ordinary card plays exclude military tactics (counted separately) and inert Wonders. Wonder purchases are useful scoring purchases even though their normal play count is zero. The remaining underused designs must be distinguished from cards that were simply not exposed early enough.

### Evaluation freeze

Before observing the reserved seeds, select policy v2 + price v1 for the first evaluation. Freeze its bytes from `run-RBt6t3/sources`, then compare Market priority against the duplicated Economy control on eight reserved seeds (190010 through 245443, increment 7919), all four rotations. Do not revise this candidate based on those results and still call those same seeds held out. The v3 discount experiment remains training-only and is not substituted into this evaluation after seeing its outcome.

A no-market ablation (`run-o7O0qp`) uses the same improved Economy core and price-v1 rules, but the designated subject assigns every market card negative purchase utility. It therefore does not buy or save capacity toward market cards. It can still use the normal production/storage planning, starter upgrades and scoring rules. Other seats retain policy v2. Compare with the subject of `run-0ms9nF`, not with the two Economy seats pooled. This tests whether access to the market actually helps the improved core; the ordinary Economy control already buys cards, so market-priority versus Economy alone cannot answer that question.

### Direct strength and v3 result

All 48 old-policy comparison games completed. With identical printed rules and opening maps, the designated Economy subject using v2 won 13/24 and averaged 26.92 points; the same subject using the old policy won 3/24 and averaged 20.25. The other three seats used old policies in both conditions. This supports improvement against the old opponents on these training maps; it does not establish strength against humans or under every profile.

Both extended v3 batches completed: Market won 5/24 at printed prices (21.25 mean points), and 7/24 at price v1 (21.96). The matched v2 results were 6/24 and 10/24 (22.29 and 25.13 points). Do not adopt the v3 coefficient simply because it fills an obvious missing term. Five utility points per expected saved resource appears too generous for a card that also costs a draw slot. Retain v2 as the evaluation candidate; preserve v3 sources/results for later calibration. The local app has been restored to the leading v2 policy after retaining the complete v3 sources and results.


### Evaluation and opening-offer audit

All 64 reserved-seed games completed. Price-v1 Market won 11/32 (24.625 mean points, 5.625 market buys); its designated Economy control won 8/32 (23.219 points, 4.563 buys). The market strategy is viable, but this difference is modest and does not prove dominance. The no-market ablation completed 3/24 wins and 21.58 mean points, compared with its same-core price-v1 Economy control at 7/24 and 24.42. All subject purchases in the ablation are zero.

`audit-market-exposure.cjs` reads full archived positions at the start of the subject's Buy. It distinguishes visibility, owned Shipyard, capacity and payment including 4:1 banking. Existing discounts count; held Buy effects, later storage management and refills do not. Its payability calculation matches the real engine on 2,000 generated fixtures. This is an opening-opportunity diagnostic, not a count of every decision inside Buy or a claim that spending would have been strategically sensible.

In the price-v1 Market training games, World Engine was visible at 84 Buy starts across 12 games, within limits with a Shipyard at 41, and payable at 23; it was never bought. Genesis Charter first appeared at round 11 or later, making late exposure a separate concern. Do not buff both cards for the same reason.

### Effect v1 hypothesis: World Engine draw

Keep policy v2 and price v1. Change only World Engine to draw one card after its successful free build. It still requires a legal build; it has no Construct III zero-build option and cannot convert to resources. Commit it to in-play before drawing; failed builds, a reload or subsequent combat resolution do not draw again. Publish the same printed effect and draw statistic. This tests whether a high-cost construction card needs draw-slot compensation to compete with Construct III. Run training comparisons before another evaluation; do not retune on the already-used reserved seeds.

### Further fixed comparisons

The World Engine draw comparison uses new training seeds beginning 260010 (six seeds, four rotations), with the unchanged policy-v2/price-v1 control frozen from `run-RBt6t3/sources`. Runs are `run-hKJao6` (draw effect) and `run-QLlGmO` (control). Its mechanic suite, Construct III regression suite and source rulebook checks pass; desktop dialog checks are still pending when this note is written.

Also extend the reserved-map analysis with the already-frozen policy-v2 printed-price Market and Economy controls. These are secondary comparisons added after the first reserved-map result, not the original evaluation protocol. Do not modify those policies or prices. Their purpose is to distinguish the price package from market priority; the original reserved-map evaluation compared two purchasing policies under price v1.

### World Engine effect-v1 training result

All 48 games completed. The Market subject won 7/24 with World Engine draw (24.75 mean points, 6.25 market purchases), versus 5/24 without it (23.67 points, 6.17 purchases). Across all factions the changed card was bought 10 times and used 15 times, versus zero purchases in the control. Market subjects bought six and used them eight times. This demonstrates use of the previously ignored card; the small win difference does not establish a general strength advantage. Both conditions used identical opening maps and unchanged card prices. All 74 desktop dialog tests pass, along with the full mechanic suite and the new World Engine commitment/reshuffle/reload/combat checks.

Freeze the World Engine draw candidate for another evaluation against its unchanged effect control: eight new seeds beginning 340010, increment 7919, four rotations. Keep every other price and policy fixed. No calibration on these seeds. Training success means the card is being used, so require the evaluation to check scoring, resource waste and useful card plays before adopting it.

### Shared-table policy alignment: intended behavior

Port the proven planning priorities to native rivals without treating browser strength evidence as native strength evidence. The current observation explicitly opts into investment planning. Archived observations omit that marker and retain every old scoring branch. Current native rivals should value additional Harvesters by actual public production, useful remaining capacity and payback time; rank distant market targets by funding delay; reserve payments for concrete scoring or defense; and allow high-value affordable cards to compete with starter upgrades after a first Construct II. Do not alter legal actions, native policy identifiers or historical engine assets. Add direct score/compatibility tests before running workspace checks. Native balance remains unverified until measured separately.

### Completed secondary and effect evaluation

All 128 games in these evaluation conditions completed. On the original reserved maps, printed-price Market won 10/32 (24.78 points, 3.66 purchases), and printed Economy control won 8/32 (24.06 points, 3.91 purchases). Compare price-v1 Market at 11/32 and price-v1 control at 8/32: lower prices increased use and variety of the market, but their large training win improvement did not recur. Do not describe the price package as a proven strength buff.

On the separate new World Engine evaluation maps, its draw candidate won 9/32 (21.75 points, 4.81 purchases), versus 7/32 for the same Market policy without the new draw (21.31 points, 4.63 purchases). The improvement remains modest. Keep the candidate for card usefulness, not a claim of a dominant market strategy.

Native alignment now has targeted tests for profitable additional production, late-game refusal, hidden-opponent-hand independence, archived scoring branches, first Construct II, high-value purchases, ready scoring reserves, effective discounted payment and activation of held Buy effects before purchases. The fast workspace tests passed after allowing loopback listeners; seven server tests initially failed solely because the sandbox prohibited binding local sockets. Heavy full-match tests have not been run in this checkpoint. Native balance still needs its own retained-game study.

Native checks: the fast workspace tier passes after the final payment/Buy-effect changes, formatting is clean, and workspace/all-target Clippy passes. A deterministic JSON-lines native bridge (`cargo build -p galactic-reach --example policy-study`) is being prepared for a Node archival study. It excludes Wanderer: the three standard policies make no native RNG calls. The study must retain all engine random draws through the existing recorder, the native source/binary identity, observations/legal-choice hashes and complete before/after positions. Do not substitute native unit-test scores for native full-game evidence.

### Native pilot and next diagnosis

The first mixed native pilot finished round 31, with the updated Economy subject scoring 11 and buying no market cards; old Military won at 30. The all-old control reached the round-45 limit unfinished (scores 21, 29, 15, 26). Neither establishes improvement. Retain both pilot archives. A matched four-rotation training batch extends the identical bound to 60 rounds in control, mixed and all-updated modes (`native/run-AbfuGP`, `native/run-LalhSE`, `native/run-jhiKOf`); do not pool its repeated rotation-zero seed with the shorter pilot.

The port still chooses a market target for capacity but banks only toward a generic next-unit reserve. Unlike the browser, it can stop collecting Data at two even while saving for a five-Data card. Next native hypothesis: include the selected market price (bounded by limits) in conversion/banking reserves, and bank toward those reserves. Preserve concrete scoring/defense payment guards and old-observation behavior. This is a policy refinement; native v1 batch sources and binaries remain frozen before it.

The native-v2 archived actions expose a concrete banking error. In round 7 of the first expanded mixed game, the subject traded all 4 Matter for 1 Biomass, then all 4 Data for 1 Matter. The old scorer's “give resource is at its limit” escape clause allowed trades that consumed the very reserves the new market plan needed. This wastes eight resources while chasing its own shortages. Next correction: for current investment planning, a bank giver must have four resources above the whole reserve; fullness alone is not sufficient. Keep the special no-Shipyard Data bootstrap and all archived behavior. Add a full-track regression and retain v2 results as a genuine failed candidate, not excluded instrumentation data.

Native expanded training completed all 32 games. Across the two additional maps (eight rotations per condition), the designated old Economy subject won 4/8 (21.38 points); native v1 won 5/8 (23.88); native v2 funding won 2/8 (17.5). V2 gave the bank 108.5 resources per game, versus 40 for v1, while buying only two market cards versus 4.38. This supports the observed reserve-burning diagnosis. Uniform v2 is also retained (`run-Iq60M6`), with no claim of strength. The reserve-safe bank correction is native v3, tested separately against these same training maps; its direct regression tests pass and its binary has been rebuilt.

Native v3 completed 8/8 games: 5/8 subject wins, 24 mean points, 4.875 market purchases and 29.5 resources given to the bank per game. Native v1 was 5/8, 23.88 points, 4.38 purchases and 40 bank-given; failed v2 was 2/8, 17.5 points, 2 purchases and 108.5 bank-given. Game durations also differ, so per-game resource totals alone do not quantify efficiency. The exact archived round-7 waste and the direct reserve regression provide the causal bug evidence. All eight opening maps match across the earlier four conditions; v3 uses the same training configurations. V3 formatting, all-target Clippy, fast workspace tests and native input/action/private-state replay validation pass. Fresh native evaluation remains pending.

Freeze native v3 before evaluating eight new seeds beginning 510010, increment 7919, all four rotations, target 30 and the same 60-round bound. Compare a single updated Economy subject against three old-observation policies with the designated all-old control. Preserve the v3 binary/source hashes and do not tune on these evaluation seeds. A failure or round-limit game remains in the archive and cannot be assigned an invented winner.
