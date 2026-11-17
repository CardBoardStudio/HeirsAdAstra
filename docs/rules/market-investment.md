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

### Native v3 fresh evaluation result

All 64 games completed, and all 32 paired opening-map hashes match. The improved Economy subject won 20/32 against three old-policy rivals, compared with 5/32 for the designated old-policy control. Mean scores were 26.69 versus 17.5; market purchases were 5.38 versus 2.06. This supports the native improvement on eight fresh maps with four rotations each. Rotations are correlated, so do not treat the 32 cases as independent galaxies or generalize directly to human opponents.

Mean game lengths were 25.66 versus 29.19 rounds. Resources given to the bank per played round were 0.91 versus 2.43, so the reduced banking also persists after accounting for duration. Overflow fractions remain high: improved Matter 34%, Energy 32%, Biomass 45%, Data 30%. Better purchasing does not establish equal resource usefulness. Keep this v3 candidate frozen; future resource-planning changes need separate training and evaluation maps.

The reanalysis tool now separates cutoff scores from completed-game averages and returns null rather than invented zero means/win rates when no game completes. Actual unfinished pilot `native/run-AXxuo5` verifies the edge case (subject cutoff score 21). Resource reports include pooled per-played-round rates, explicitly using summed round numbers rather than production-event counts.

The Wasm/web build completed after installing the repository's pinned target/wasm-bindgen and using the existing Node runtime for the locked ZK bundle. The packaged rulebook check passes; canonical HTML, CSS and browser-engine bytes match `dist/galactic-reach`. The transport adapter is server-side and is not a separate served browser asset. Docker is unavailable locally, so container smoke remains pending. No remote preview, anonymous navigation, narrow-window browser verification or deployment is claimed by this local packaging check.

Next robustness check keeps every candidate card and browser policy fixed and changes only the simulation's selectable target to 40, the game's default. Compare Market against the duplicated Economy control on eight new seeds beginning 710010, all four rotations; the original 30-point study remains the main report-matched benchmark. This tests whether market investment remains useful in longer games, without changing live victory rules.

### Native Market research profile: intended behavior

Keep native v3's standard policies frozen. Add a deterministic Market research profile with the Economy core's movement, defense, scoring and production decisions. After its first Construct II, it gives useful affordable market cards earlier priority at utility 18 rather than 24, and can prioritize a required Capacity Module before further starter upgrades. Concrete scoring payments, the investment horizon and the reserve-safe banking guard still apply. Existing policy identifiers and default shared-table lineups do not change; this profile is initially accessible only through the research bridge/factory, not claimed as a new website selector. Compare it against the duplicated improved Economy control with all opponents using the improved policy, rather than only against old bots.

### Longer games and native Market training

The browser 40-point robustness batches completed all 64 games: Market 7/32 wins, 31.25 mean points and 9.06 purchases; Economy subject control 8/32, 31.13 points and 8.63 purchases. Both policies buy heavily from the market. Earlier purchasing priority is not an established strength advantage at 40; do not buff the whole market merely to force the specialist to dominate.

The native specialist trained against improved opponents on three new maps/all rotations: 4/12 wins, 21.75 points, 5.17 purchases, versus the improved Economy control's 3/12, 19.5 points and 3.92 purchases. All 12 opening-map hashes match. Keep this small result provisional. Its factory/priority/core tests, fast workspace tier, formatting, all-target Clippy and exact native input/action replay checks pass. Freeze it before an eight-map/four-rotation evaluation beginning seed 810010, target 30, all opponents improved, 60-round bound. The additional profile leaves the standard native strategy branches unchanged; default website lineups/catalogs have not changed.

### Native Market fresh evaluation: not adopted as the better default

Both 32-game batches completed. The research specialist won 6/32 (19.78 mean points, 3.84 purchases), versus improved Economy's 11/32 (21.69 points, 3.53 purchases). Its small training gain did not generalize. Keep the proven standard native-v3 core; the Market role remains a research variant, not a reason to weaken default opponents or buff the entire market until it wins.

Both subjects averaged 11.81 starter upgrades by game end, but recorded draws were 177.66 versus 211.03 per game. An archive-only upgrade-timing audit is running to test whether final upgrade counts hide a tempo difference; normalize draws for game length before attributing the difference. Wonder purchase counts in this evaluation were 13 versus 17, so more Wonder buying alone cannot explain the specialist's loss. Separately, a training-game checkpoint confirms the bot retained all three purchased inert Wonders through the end; neither core currently plans to trash those dead cards. That is a possible shared skill improvement, not a demonstrated cause of the Market role's evaluation loss.

### Timing hypothesis rejected; military opportunity hypothesis

The complete checkpoint audit does not support delaying the specialist's buying until its first Construct III: it already reached Construct III at mean round 5.34 versus Economy's 5.69, and its first III at 4.84 versus 5.09. All-six-III timing was almost equal (14.2 versus 13.97 among the 30 cases reaching it in each condition). Draws per played round were 8.64 versus 9.28, so duration explains part, not all, of the raw draw gap. Do not implement the first-III gating idea as though it restored a missing foundation.

The specialist bought 61 military cards but played tactics 17 times across its fresh evaluation, versus Economy's 52 purchases and 36 plays. In particular it bought 13 Aegis Lattices and played that tactic once. These aggregates identify a valuation problem to test, not a causal attribution of every lost game.

Next Market-profile hypothesis: retain its priority thresholds and Economy core, but consider a military purchase only if an enemy Fleet or Shipyard lies within six portal-weighted movement points of one of its Fleets or Shipyards. This uses public positions only and is a short-term opportunity estimate, not knowledge of enemy hands. Apply the same filter consistently to its purchase valuation, capacity target and banking target through the planned observation. Standard profiles remain unchanged. Compare against the frozen first Market profile on the original training maps; use new evaluation maps if it improves. Keep the completed 810010-series result attached to profile v1.

The six-step Market filter completed its 12 training games: 3/12 wins, 21.33 points, 5.17 purchases, versus the frozen profile's 4/12, 21.75 points and 5.17 purchases. Both bought 21 military cards; the filter did not reduce the identified spending. Do not promote it as an improvement or run a fresh evaluation merely to rescue this result.

Next training hypothesis uses the existing native three-step one-Move threat envelope and requires at least one moving Fleet in a prospective fight: own Fleet versus enemy Fleet/Shipyard, or enemy Fleet versus own Shipyard. Two stationary Shipyards alone are not an immediate fight. Keep all other purchasing thresholds and standard profiles unchanged. Compare on the same training maps before deciding whether a fresh evaluation is warranted. The six-step candidate remains frozen in `native/run-VxJaQC`.

### Three-step filter and draw-utilization audit

The tighter mobile-Fleet filter (`native/run-z4gN4l`) also failed its training comparison: 3/12 wins, 20.83 mean points and 5.92 market purchases, versus profile v1's 4/12, 21.75 and 5.17. It still bought 21 military cards and played market tactics eight times (v1: eleven). More ordinary card plays (173 versus 132) did not establish a strength improvement. Neither distance filter is approved for adoption; the working filter is experimental only and standard profiles remain untouched.

An archive-only draw audit now verifies trace hashes and aggregates requested versus actually received cards by request size, without reconstructing a guessed originating effect. Synthetic aggregation checks cover incomplete draws and exclusion of another player's events. Across the 32-game fresh Market evaluation, requests of sizes 1–4 received 2,395 of 2,666 requested cards (89.83%); Economy received 3,113 of 3,444 (90.39%). All five-card requests were filled in both conditions. This weakens the hypothesis that draw cards routinely fail because the deck is exhausted, although actual draws are not proof of useful resulting actions. Request size alone cannot distinguish starter draws from market or relic effects, and these figures must not be presented as market-card-specific utilization. Artifacts: `native/market-draw-utilization.json` and `native/economy-draw-utilization.json`; tool: `scripts/audit-draw-utilization.cjs`.

The next investigation should distinguish card valuation from tactical execution. Native movement's safety estimate ignores owned military tactics and uses fixed attack/hull estimates across volleys; bought military power may therefore never affect the decision to initiate a fight. This is a code observation, not yet evidence that a new combat planner improves results. Do not compensate by broadly increasing market strength before testing the execution mismatch.

### Bounded tactical forecast diagnostic

`scripts/audit-single-fleet-tactics.cjs` enumerates three-volley decisions for one Fleet against one Fleet, using the actual printed tactic catalog. It computes a conservative perfect-response lower bound: the defender may choose the worst response after each hypothetical attacker choice. This is deliberately stronger than a real opponent's hidden simultaneous choice. It includes tactic depletion and accumulated damage; it excludes orders, reactions, escape, extra pieces and retreat availability. It is not a win probability or a general combat forecast.

Against an enemy with only the basic tactics, Torpedo Spread or Nova Barrage alone yields a guaranteed surviving win in this restricted model. Aegis Lattice alone guarantees survival but not a win; Phase Lance plus Aegis Lattice guarantees a surviving win. The old native movement safety formula rejects all these identical one-Fleet board positions because it never reads either military deck. That establishes a concrete execution/valuation mismatch without proving that buying those cards always pays off.

`scripts/test-single-fleet-tactics.cjs` checks all 121 tactic pairs' simultaneous first-volley damage against the authoritative engine, including piercing and shields, plus bounded-solver baseline and advantage assertions. All pass. Full multi-volley strategy equivalence has not yet been checked against the engine, so do not wire this reference solver directly into live decision-making. Diagnostic artifact: `native/single-fleet-tactics.json`, with script and engine hashes. Next: verify every branch of a predicted winning strategy against engine continuation, then test a gated native forecast on controlled single-Fleet cases before broader matches. Keep the proven native-v3 policy as its matched control.

### Opt-in native single-Fleet forecast training

Full continuation validation now passes: the JavaScript reference strategy wins all 13 defender branches across Torpedo Spread, Nova Barrage, and Phase Lance plus Aegis examples, with an engine reload at every volley. The separately implemented native planner also wins all 14 branches it selects (its deterministic tie order differs), across 14 native tactic decisions. `scripts/test-native-fleet-tactics.cjs` uses the actual Rust JSONL bridge, public observations, legal actions and authoritative engine rather than asserting a duplicated formula.

Intended research behavior: only when explicitly enabled, allow an otherwise rejected one-Fleet-versus-one-Fleet attack if the public-tactic model predicts a surviving win. Exclude Shipyards and mixed forces from this extension; retain existing decisions otherwise. During a qualifying battle, use the same planner when it predicts a surviving win from current damage and remaining tactics. Reconstruct enemy remaining tactics from public military ownership and used tactics, never a secret commitment. Do not treat private reaction uncertainty as resolved; the model omits reaction and order bonuses. This limitation is explained in canonical #rival-cards. Default observations do not enable it, and the standard core remains unchanged without the research flag.

The runner now freezes `tacticalForecast` in its protocol (`none`, `subject`, `all`, default `none`) and injects the flag only for designated actors. Train on the existing three 610010-series maps/all four rotations, all opponents improved, Market subject, target 30 and 60-round cutoff. Compare identical binaries/card sources with only subject forecast enabled versus none; retain the existing three-step purchasing filter in both to isolate execution. Runs: control `native/run-AnAxvr`, candidate `native/run-fIdjEe`. Do not claim better market balance from fixture wins; full-game results are pending.

The single-Fleet forecast training completed all 24 games. All 12 paired opening maps match, and all final winners, rounds, action counts and player metrics are identical between control and candidate; each Market subject wins 3/12. The opt-in extension therefore demonstrates no full-game benefit on this training set despite winning its controlled fixtures. Do not promote it or spend fresh evaluation maps to rescue it. `native/single-fleet-forecast-training.json` records the paired comparison. Broader mixed-force combat or better purchase valuation would be different hypotheses, not conclusions supported by these results.

Verification for this checkpoint: 23 fast Galactic Reach Rust tests pass (three long-match tests explicitly excluded), package all-target Clippy and formatting pass, native 40-decision reproducibility/private-state/action replay passes with the research flag injected and hashed, source rulebook check passes, and rules-contract tests pass after allowing their pinned read-only GitHub dependency lookup. Native full-battle branching tests pass as above. No new web build, Render preview or publication is claimed for this research-only extension.

### Shield utilization and the late military exception

A selective-checkpoint audit (`scripts/audit-tactic-shields.cjs`) reconstructs completed battles, verifies trace hashes and checks extracted subject tactic-play counts against the independent per-game metrics. It copies each finished battle before applying subsequent patches, so later battles cannot mutate earlier observations. The audit includes reaction shields in the recorded shield totals and labels that limitation. Synthetic checks cover capped prevention, piercing and subject isolation.

Across the 32-game Market evaluation, Hardlight Bulwark prevented 43 of 45 available shield points in nine plays; Aegis prevented six of eight in its only play. This does not support a blanket shield-strength reduction. Of 61 military purchases, only 30 had a subsequent battle involving the purchaser. Economy had subsequent battles after 36 of its 52 purchases. Later battles are opportunities, not proof that a particular card should have been played; multiple purchases can share one battle. Artifacts: `native/market-tactic-shields.json` and `native/economy-tactic-shields.json`.

The code applies a 15-utility penalty to non-Prestige ordinary investments when the public race estimate leaves a one-round horizon, but no equivalent penalty to military cards, even though they also require later use to score. Test a research flag applying the same 15 penalty to military value at horizon one. Keep prices, shield values, purchase thresholds, movement and combat execution fixed. This is a timing hypothesis rather than a claim that the unused cards caused all losses. The runner records `militaryHorizon` (`none`, `subject`, `all`; default `none`), and the canonical #rival-cards explains the intended decision. Train the Market subject on the same three 610010-series maps/all rotations against improved opponents with the existing opportunity filter, target 30 and cutoff 60. Disable the single-Fleet forecast in both conditions; only the new horizon flag differs. Direct native tests check opt-in gating, no early change, and the already-at-target edge case.

The military-horizon training completed all 24 games with all 12 opening maps matched. Control `native/run-Rs3Vyh`: 3/12 subject wins, 20.83 points, 5.92 market buys, 21 military purchases and eight tactic plays. Candidate `native/run-3S3Zdp`: 4/12 wins, 21.42 points, 5.67 market buys, 17 military purchases and seven plays. The reduction in purchases follows the intended timing correction, but the strength signal is small and resource overflow worsened slightly (Biomass 30.7% to 33.3%). Do not claim equal resource usefulness or a decisive market advantage. Artifact: `native/military-horizon-training.json`.

Freeze this candidate before fresh evaluation: eight maps beginning 910010, increments 7919, all four rotations, target 30, cutoff 60, all opponents improved and the same three-step purchasing filter. Compare the same frozen binary/source with military horizon `none` versus `subject`; tactical forecast disabled in both. These maps are new evaluation data; do not tune the candidate on their partial results. Existing 610010 training and 810010 diagnostic/evaluation results retain their earlier labels.

Fresh military-horizon evaluation is running from the frozen `run-3S3Zdp/sources` binary, game sources, native source and lockfile: control `native/run-1qimCl`, candidate `native/run-3SDARK`. Both retain full private traces and their own frozen protocol/source hashes. No intermediate winner count is a result. The current checkpoint also passes 24 fast Galactic Reach tests (three long-match suites excluded), package all-target Clippy, formatting, rules contract, source rulebook validation and flag-aware deterministic native replay. The remaining work is to finish and analyze this fresh evaluation, then assess market priorities against the improved Economy baseline rather than only against the previous research profile.

### Public printed-card metadata completeness

While the frozen horizon evaluation runs, complete a separate transport-only preparation: publish the printed range, assault, pathfinder restriction, optional second build, Colony cost/preserved Settler/bonus Prestige, Buy effect and self-trash/starter-trash fields in `cardStats`. Previously the native transport omitted these distinctions even though browser valuation reads them. Preserve a printed zero Colony cost as zero, and distinguish it from an unspecified cost. No native utility formula reads the new fields yet; the in-flight evaluation continues using its frozen old adapter, so its hypothesis is unchanged.

The canonical #cards clarification explains that preserving a Settler still requires bringing one and never waives the Fleet needed to capture; a printed 0 Biomass means free. `scripts/test-public-card-metadata.cjs` verifies all 52 catalog definitions, including zero cost, movement bonuses and optional builds, and confirms the descriptors reveal neither an enemy hand nor draw-pile order. It is included in the main mechanic suite. The native reproducibility test also strips these fields and checks identical choices across its 40-decision fixture; this is bounded verification, not a claim that every future policy will ignore them. A future valuation change must be tested separately against the now-complete public descriptors.

### Fresh military-horizon result: no demonstrated strength gain

All 64 games completed and all 32 paired opening-map hashes match. Control and candidate each won 11/32. Control averaged 22.97 points, 4.47 market purchases, 10 Harvesters and 21.78 rounds; candidate 22.50 points, 4.19 purchases, 9.41 Harvesters and 21.44 rounds. The extracted military totals (including unplayed designs) are 48 purchases/18 with a later battle/15 tactic plays for control, versus 39/21/20 for candidate. Thus the intended spending/utilization shift appears, but it did not improve win count or average score. Keep this flag experimental; do not present it as a stronger default. The generic analysis report's card totals include every design; do not compute military purchase totals by filtering only designs played, which omits unused purchases.

Overflow fractions were almost unchanged: Matter 30.2%, Energy about 25%, Biomass about 39%, Data about 25% in both. Resource usefulness remains uneven. Main report: `native/military-horizon-fresh-evaluation.json`; checked battle/purchase audits: `native/military-horizon-fresh-control-shields.json` and `native/military-horizon-fresh-candidate-shields.json`. The public metadata preparation passes the full mechanic suite, source rulebook check, rules contract and 40-decision native replay/invariance check. Local research checkpoint is commit `2d53fd5`; nothing is pushed or published.

### Next concrete planning discrepancy: paid production versus passing

Code inspection finds a separate discrepancy in the otherwise improved native production policy: when a Harvester cannot repay its cost within the horizon or production already meets its target, it gets utility 1, while Pass has utility 0. The existing late-production test asserts exactly that score of 1 and labels it unable to pay back, but never compares it with Pass. Consequently the policy can still pay for the supposedly rejected build after better orders run out. Construct III can draw instead while cards remain, but after the draw sources are exhausted its build bonus even raises this action to 1.25. This is a test/decision mismatch, not yet a measured cause of overflow.

Next controlled hypothesis: under an opt-in production-discipline flag, put an unprofitable *paid* Harvester below Pass. Preserve genuinely free first builds from Prefab Yards/World Engine (which may also enable a draw), profitable early Harvesters and the zero-Data bootstrap. Test the actual action choice against Pass, not just that the score decreased, then compare the Market subject with the retained 610010 training control before using any fresh evaluation maps. Do not combine this with the failed military-horizon or single-Fleet forecast flags, or change card prices at the same time.

### Production discipline: intended rule and controlled training

Implement the paid-production hypothesis behind `productionDiscipline`, default off. An unprofitable or already-sufficient Harvester now gets -1 rather than +1 only when this flag and investment planning are enabled. Pass stays at 0. The existing Construct III bonus of 0.25 cannot reverse that ordering. The first-build `free`/`each` discounts still permit a zero-cost Harvester; the optional second build is full price and has no free-build exception. The initial zero-Data bootstrap and profitable production branches are unchanged. Canonical #rival-planning explains the decision and free-build exception.

The regression explicitly calls the native agent's action selector with Build and Pass: it confirms old behavior still chooses the paid build without the flag, new behavior passes for late/saturated production, early profitable production remains selected, and Prefab Yards/World Engine free builds plus Data bootstrap are preserved. Formatting, package all-target Clippy, direct regression and source rulebook validation pass. The runner records `--production-discipline none|subject|all` in the frozen protocol and injects the matching observation flag before hashing. The native replay check now includes the new flag as well.

Training is running on the same three 610010-series maps/all four rotations, target 30/cutoff 60, all opponents improved and the current Market purchasing profile. Both other research flags are disabled. Runs `native/run-VEAYb4` (control) and `native/run-SlrZdl` (subject-only discipline) freeze identical current binaries/game sources, including the extra printed metadata. This repeats the control to isolate the actual flag change under identical inputs rather than relying on metadata equivalence to an older run. Do not infer strength from a fixture or fewer Harvesters alone; analyze wins, scoring, useful purchases and resource loss together.

Production-discipline training completed all 24 games, all 12 initial maps matched. Control: 3/12 wins, 20.83 points, 10.58 Harvesters and 5.92 market purchases. Candidate: 5/12 wins, 23.17 points, 7.42 Harvesters and 5.33 purchases. Both averaged 22.08 rounds. Biomass overflow fraction fell from 30.7% to 27.9%; Matter rose from 23.5% to 24.6%, Energy from 21.9% to 22.4%, Data from 22.3% to 23.0%. This supports a training improvement in spending discipline, not equal resource usefulness or the claim that more purchases cause wins. Artifact: `native/production-discipline-training.json`. Native fast tests (25 pass, three long-match tests excluded), formatting, package all-target Clippy, rules contract, source rulebook validation and flag-aware exact native replay pass.

Freeze candidate `native/run-SlrZdl/sources` before evaluating eight new maps beginning 1010010, increment 7919, all four rotations, target 30/cutoff 60. Compare production discipline none versus subject with the same frozen binary/game/native sources; both other experimental flags stay off. No tuning on partial evaluation results. Later adoption still needs a comparison with the improved Economy baseline and a cleanup of rejected research features before a release proposal.

Fresh production-discipline runs are live from the frozen training candidate: control `native/run-qEfVb7`, candidate `native/run-HbYR5o`. All sources, protocols, private states, actions and RNG remain retained. The research flags are not enabled in the website adapter; no publication or default-bot adoption is implied by starting this comparison.
