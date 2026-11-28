# Complete rival plans

## Intended policy

The complete round-15 human report supplied on 2026-11-28 exposes three browser-policy failures. Economy left a safe neutral Colony one Move away to approach a distant leader's Colony and finished with five unused Colonize cards. Rechecking the private stock corrects the initial audit: it held only 2 Life in round 9, and 0 Life in round 11, so neither neutral Colony was immediately payable. It needed to protect the payment and finish after production. Expansion withdrew two Fleets from a threatened Colony and immediately sent the same force back. Military Focused's ordinary construction scores accidentally exempted its builds from the held-purchase budget.

Change the canonical browser policy only:

1. Count pressure against the same leading faction once per destination, whether it owns the planet, has ships there, or both. Settler routes favor a safe neutral Colony reachable in this Move and fundable with the held hand now or after one public production, over a capture that still needs another Move. Future income is only a route forecast, never spendable stock. Protect held Life toward that Colony before discretionary builds, bank funding, upgrades or purchases consume it. Penalize longer capture approaches so nearby expansion remains worthwhile. A reachable capture, urgent defense or necessary retreat can still take priority. Reconsider from public position and unordered own cards; do not introduce persisted targets or inspect draw order.
2. Use the same public-force risk estimate for reinforcement and retreat. Do not send an insufficient reinforcing group toward a Colony it still cannot hold. A stronger combined defense or a reduced public threat can make the move worthwhile later. Never add free movement, extra combat information or a new rule for human players.
3. Mark first-Shipyard/opening necessities and actual emergency defense explicitly. Ordinary Military Focused Fleets and Harvesters respect useful held purchase payments, including indirect bank funding and second builds. A large construction preference score alone is not an emergency.

Ascendancy Codex, other card contents, costs, legal actions, scoring, combat values and archived engines stay unchanged. Opposition changes, so this is a breaking playtest experiment for newly dealt games. The release workflow supplies the revision; this change does not edit version declarations.

Rules grounding: canonical `rulebook.html#computer-rivals`, `#rival-cards`, `#military-focused-rival`, `#movement`, `#building`, `#combat`, `#capacity-module`, `#buy` and `#victory`.

## Validation plan

Use focused cases for nearby neutral settlement versus distant capture, payable versus unavailable Colonize, duplicate leader pressure, repeated reinforcement after retreat, newly sufficient reinforcements, ordinary military builds versus real emergencies, funding through bank trades, second builds, planning purity and hidden-information invariance. Confirm the failure cases against the exact baseline as well as the changed policy.

Freeze the candidate before a prospective comparison on new seeds, with all seat rotations and complementary old/new policy assignments. Use the same unchanged game engine and 30-Prestige target. Retain complete archives including exact sources, full private state, engine counters, actions/events and random values, and verify every archive. Report completed and incomplete games separately, policy/profile outcomes and paired initial-position hashes. These simulated opponents are evidence about bot performance, not a calibrated human difficulty estimate.

## Fresh-game result

The final frozen candidate completed all 64 planned games: eight new map seeds, four seat rotations and complementary two-new/two-baseline allocations at a 30-Prestige target. All 32 complementary pairs had identical initial-position hashes. Four maps used Military Focused, Economy, Expansion and a second Economy; four used Military Focused, Military, Economy and Expansion. Every complete archive passed source, trace, patch-chain, engine-counter and random-stream verification. The card catalog, including Ascendancy Codex, and legal-action adapter matched baseline `1ef413d1fe0fef6aac0e2b96883fbb94ca34629d` exactly.

| Measure | Baseline | Updated |
| --- | ---: | ---: |
| Wins | 34 | 30 |
| Mean final Prestige | 21.84 | 22.28 |
| Mean final Colonies | 2.86 | 3.26 |
| Mean colonization actions | 1.75 | 2.04 |
| Mean unused Colonize cards | 2.19 | 2.02 |

Economy won 19 versus 16 games and averaged 26.29 versus 23.85 Prestige. Military Focused won 2 versus 7 and averaged 18.19 versus 22.06. Expansion held more Colonies (4.19 versus 3.56) but won 5 versus 7 and had nearly unchanged mean Prestige. Military won 4 each, with updated mean Prestige 22.31 versus 18.00. The combined change fixes the observed decisions and improves settlement completion; this comparison does not establish an overall strength improvement. Its Military Focused regression needs isolation before promotion. Mixed-policy games do not identify which individual fix caused a profile outcome.

Twelve focused cases, six baseline-failure checks, full mechanics, 105 dialog cases, replay reconstruction, 120 browser/server matched policy decisions and the other relevant policy/archive/rules checks passed. The supplied report's two settlement positions now select the nearby neutral center, its Icarus position avoids the unchanged inadequate return, and the ordinary military build preserves its capacity investment. Anonymous local packaged rulebook navigation and 1280/390-pixel layouts passed. Static game assets packaged; full Rust/Wasm compilation was unavailable on the host because Cargo is absent.

The first candidate's settlement regression exposed the missing Life-payment part before the final evaluation. Its 25 completed and two interrupted archives were retained and verified, and the corrected candidate used disjoint fresh seeds. The private inputs, frozen protocols and sources, per-game archives, checksums and verification evidence are retained in persistent output `bot-plan-completion-20261128`, with the final comparison in `confirmation-v2`. These eight map seeds provide correlated bot-match evidence, not a general human-difficulty estimate. No deployment or promotion has occurred.

The subsequent [Military Focused reserve diagnosis and controlled repair](military-budget-recovery.md) isolates the reserve conflict and records a new comparison on unused seeds. The results above remain the original three-fix candidate's evidence.
