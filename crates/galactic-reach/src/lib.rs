//! Galactic Reach's existing JavaScript rules behind the shared Rust game contract.
//! QuickJS has no host IO, filesystem, timers, or module loader. Each match gets a
//! separate heap, memory/stack limits, and a wall-clock interrupt deadline.
use game_core::{GameAdapter, PlayerAgent};
use rand::{Rng, SeedableRng, rngs::StdRng};
use rquickjs::{Context, Runtime};
use serde::Deserialize;
use serde_json::{Value, json};
use std::cell::{Cell, RefCell};
use std::rc::Rc;
use std::time::{Duration, Instant};

/// Rules a shared table may play: the current rules and every archived engine
/// that carries the shared-table hooks (authority shuffles, private views, Undo
/// marks). A table keeps the rules it was dealt with, as solo tables do, so a
/// cutover never strands a running shared game. At a cutover, archive the
/// outgoing engine (rules/vNN-*, with `include_str!` arms in `boot`) and add its
/// revision here.
pub const SHARED_RULES: [&str; 5] = [
    RULES,
    "galactic-reach/33.38",
    "galactic-reach/32.37",
    "galactic-reach/31.36",
    "galactic-reach/30.35",
];
/// The [`SHARED_RULES`] entry for `rules`, if a shared table can play it.
pub fn shared_rules(rules: &str) -> Option<&'static str> {
    SHARED_RULES.iter().find(|r| **r == rules).copied()
}
pub const RULES: &str = "galactic-reach/34.39";
/// Player-facing name of the current rules, as printed on the rulebook masthead.
pub const EXPERIMENT: &str = "Balance Package playtest";
mod legacy_v1;
mod legacy_v10;
mod legacy_v11;
mod legacy_v12;
mod legacy_v13;
mod legacy_v14;
mod legacy_v15;
mod legacy_v16;
mod legacy_v17;
mod legacy_v18;
mod legacy_v19;
mod legacy_v2;
mod legacy_v20;
mod legacy_v21;
mod legacy_v22;
mod legacy_v23;
mod legacy_v24;
mod legacy_v25;
mod legacy_v3;
mod legacy_v4;
mod legacy_v5;
mod legacy_v6;
mod legacy_v7;
mod legacy_v8;
mod legacy_v9;
mod replay;
pub use replay::Trace;
const ENGINE: &str = include_str!("../../../prototypes/galactic-reach/app.js");
const ADAPTER: &str = include_str!("../../../prototypes/galactic-reach/adapter.js");
const MATCH_TIMEOUT: Duration = Duration::from_secs(300);
/// A shared table's per-request budget, renewed with `extend_deadline`.
pub const SHARED_STEP: Duration = Duration::from_secs(20);
pub const SIMULATION_TIMEOUT: &str = "Galactic Reach simulation exceeded its time limit.";
fn execution_error(deadline: Instant, error: impl ToString) -> String {
    if Instant::now() >= deadline {
        SIMULATION_TIMEOUT.into()
    } else {
        error.to_string()
    }
}
#[derive(Deserialize)]
struct Snapshot {
    active: Option<usize>,
    observation: Value,
    legal: Vec<Value>,
    scores: Option<Vec<f64>>,
}
pub struct GalacticReach {
    context: Context,
    deadline: Rc<Cell<Instant>>,
    snapshot: Snapshot,
    rules: &'static str,
    trace: Option<Trace>,
}
impl GalacticReach {
    pub fn new(seed: [u8; 32]) -> Result<Self, String> {
        Self::with_timeout(seed, MATCH_TIMEOUT)
    }
    fn with_timeout(seed: [u8; 32], timeout: Duration) -> Result<Self, String> {
        Self::initialize(seed, timeout, RULES)
    }
    pub fn with_rules(seed: [u8; 32], rules: &str) -> Result<Self, String> {
        let rules = match rules {
            RULES => RULES,
            "galactic-reach/4.9" => "galactic-reach/4.9",
            "galactic-reach/5.10" => "galactic-reach/5.10",
            "galactic-reach/6.11" => "galactic-reach/6.11",
            "galactic-reach/7.12" => "galactic-reach/7.12",
            "galactic-reach/8.13" => "galactic-reach/8.13",
            "galactic-reach/9.14" => "galactic-reach/9.14",
            "galactic-reach/10.15" => "galactic-reach/10.15",
            "galactic-reach/11.16" => "galactic-reach/11.16",
            "galactic-reach/12.17" => "galactic-reach/12.17",
            "galactic-reach/13.18" => "galactic-reach/13.18",
            "galactic-reach/14.19" => "galactic-reach/14.19",
            "galactic-reach/15.20" => "galactic-reach/15.20",
            "galactic-reach/16.21" => "galactic-reach/16.21",
            "galactic-reach/17.22" => "galactic-reach/17.22",
            "galactic-reach/18.23" => "galactic-reach/18.23",
            "galactic-reach/19.24" => "galactic-reach/19.24",
            "galactic-reach/20.25" => "galactic-reach/20.25",
            "galactic-reach/21.26" => "galactic-reach/21.26",
            "galactic-reach/22.27" => "galactic-reach/22.27",
            "galactic-reach/23.28" => "galactic-reach/23.28",
            "galactic-reach/24.29" => "galactic-reach/24.29",
            "galactic-reach/25.30" => "galactic-reach/25.30",
            "galactic-reach/26.31" => "galactic-reach/26.31",
            "galactic-reach/27.32" => "galactic-reach/27.32",
            "galactic-reach/28.33" => "galactic-reach/28.33",
            "galactic-reach/29.34" => "galactic-reach/29.34",
            "galactic-reach/30.35" => "galactic-reach/30.35",
            "galactic-reach/31.36" => "galactic-reach/31.36",
            "galactic-reach/32.37" => "galactic-reach/32.37",
            "galactic-reach/33.38" => "galactic-reach/33.38",
            _ => return Err("Unsupported rules version.".into()),
        };
        Self::initialize(seed, MATCH_TIMEOUT, rules)
    }
    fn initialize(seed: [u8; 32], timeout: Duration, rules: &'static str) -> Result<Self, String> {
        // Seeded RNG is owned by the game, never by a policy observation.
        let rng = RefCell::new(StdRng::from_seed(seed));
        Self::boot(
            timeout,
            rules,
            move |ctx| {
                ctx.globals().set(
                    "gameRandom",
                    rquickjs::Function::new(ctx.clone(), move || rng.borrow_mut().r#gen::<f64>())?,
                )
            },
            "globalThis.game = createGalacticReach({headless: true, random: gameRandom});",
        )
    }
    /// A shared multi-human table on the current rules. The engine draws no
    /// randomness of its own: every shuffle is a permutation of `0..n` returned by
    /// `shuffle(n, purpose)`, which the table's hidden-information authority
    /// supplies (or replays from the table log). `seats` names each faction and
    /// says whether a person plays it. Call [`Self::extend_deadline`] before each
    /// batch of work: a shared table lives far longer than one match budget.
    pub fn shared(
        rules: &str,
        seats: &[(String, bool); 4],
        victory_target: u32,
        shuffle: impl FnMut(usize, &str) -> Vec<usize> + 'static,
    ) -> Result<Self, String> {
        Self::shared_on(rules, seats, victory_target, None, shuffle)
    }
    /// [`Self::shared`] resumed from a [`Self::snapshot`] (`resume`) instead of a
    /// fresh deal, the way a solo save loads.
    pub fn shared_on(
        rules: &str,
        seats: &[(String, bool); 4],
        victory_target: u32,
        resume: Option<&str>,
        shuffle: impl FnMut(usize, &str) -> Vec<usize> + 'static,
    ) -> Result<Self, String> {
        let rules = shared_rules(rules)
            .ok_or_else(|| format!("Shared tables cannot run {rules} on this server."))?;
        Self::shared_from(rules, seats, victory_target, resume, shuffle)
    }
    fn shared_from(
        rules: &'static str,
        seats: &[(String, bool); 4],
        victory_target: u32,
        resume: Option<&str>,
        shuffle: impl FnMut(usize, &str) -> Vec<usize> + 'static,
    ) -> Result<Self, String> {
        let shuffle = RefCell::new(shuffle);
        // The snapshot is spliced in as the engine's own JSON text. Parsing it into
        // a serde_json::Value would sort object keys, and the rules iterate some
        // objects (planets by coordinate) in order, so a resumed game would drift.
        let resume = match resume {
            Some(text) => {
                serde_json::from_str::<serde::de::IgnoredAny>(text)
                    .map_err(|e| format!("Unreadable snapshot: {e}"))?;
                text
            }
            None => "null",
        };
        let names: Vec<&str> = seats.iter().map(|s| s.0.as_str()).collect();
        let controllers: Vec<&str> = seats
            .iter()
            .map(|s| if s.1 { "human" } else { "ai" })
            .collect();
        Self::boot(
            SHARED_STEP,
            rules,
            move |ctx| {
                ctx.globals().set(
                    "authorityShuffle",
                    rquickjs::Function::new(ctx.clone(), move |n: u32, purpose: String| {
                        (shuffle.borrow_mut())(n as usize, &purpose)
                            .into_iter()
                            .map(|i| i as u32)
                            .collect::<Vec<u32>>()
                    })?,
                )
            },
            &format!(
                "globalThis.game = createGalacticReach({{headless: true, shuffle: authorityShuffle, names: {}, controllers: {}, victoryTarget: {}, resume: {}}});",
                json!(names),
                json!(controllers),
                victory_target,
                resume
            ),
        )
    }
    /// Gives the engine `budget` of wall-clock time from now.
    pub fn extend_deadline(&self, budget: Duration) {
        self.deadline.set(Instant::now() + budget);
    }
    /// The live state shape one seat's browser renders, with every other seat's
    /// hidden information removed (see `privateState` in adapter.js).
    pub fn private_state(&self, seat: usize) -> Result<Value, String> {
        self.eval_json(&format!("JSON.stringify(game.privateState({seat}))"))
    }
    /// The whole position, secrets included, for [`Self::shared_on`], as the
    /// engine's JSON text (keep it as text: object key order matters to the rules).
    pub fn snapshot(&self) -> Result<String, String> {
        let deadline = self.deadline.get();
        self.context
            .with(|ctx| ctx.eval::<String, _>("JSON.stringify(game.snapshotState())"))
            .map_err(|e| execution_error(deadline, e))
    }
    /// The current turn and a summary of everything an action could reveal; a
    /// shared table compares it before and after each action to place Undo checkpoints.
    pub fn undo_mark(&self) -> Result<Value, String> {
        self.eval_json("JSON.stringify(game.undoMark())")
    }
    /// Legal choices a seat cannot check from its private state alone.
    pub fn hints(&self, seat: usize) -> Result<Value, String> {
        self.eval_json(&format!("JSON.stringify(game.hints({seat}))"))
    }
    fn eval_json(&self, script: &str) -> Result<Value, String> {
        let deadline = self.deadline.get();
        if Instant::now() >= deadline {
            return Err(SIMULATION_TIMEOUT.into());
        }
        let json = self
            .context
            .with(|ctx| ctx.eval::<String, _>(script))
            .map_err(|e| execution_error(deadline, e))?;
        serde_json::from_str(&json).map_err(|e| e.to_string())
    }
    fn boot(
        timeout: Duration,
        rules: &'static str,
        globals: impl FnOnce(&rquickjs::Ctx) -> rquickjs::Result<()>,
        start: &str,
    ) -> Result<Self, String> {
        let runtime = Runtime::new().map_err(|e| e.to_string())?;
        runtime.set_memory_limit(64 * 1024 * 1024);
        runtime.set_max_stack_size(1024 * 1024);
        let deadline = Rc::new(Cell::new(Instant::now() + timeout));
        let limit = deadline.clone();
        runtime.set_interrupt_handler(Some(Box::new(move || Instant::now() >= limit.get())));
        let context = Context::full(&runtime).map_err(|e| e.to_string())?;
        context
            .with(|ctx| {
                globals(&ctx)?;
                ctx.eval::<(), _>(match rules {
                    RULES => ADAPTER,
                    "galactic-reach/17.22" => include_str!("../rules/v17-adapter.js"),
                    "galactic-reach/18.23" => include_str!("../rules/v18-adapter.js"),
                    "galactic-reach/19.24" => include_str!("../rules/v19-adapter.js"),
                    "galactic-reach/20.25" => include_str!("../rules/v20-adapter.js"),
                    "galactic-reach/21.26" => include_str!("../rules/v21-adapter.js"),
                    "galactic-reach/22.27" => include_str!("../rules/v22-adapter.js"),
                    "galactic-reach/23.28" => include_str!("../rules/v23-adapter.js"),
                    "galactic-reach/24.29" => include_str!("../rules/v24-adapter.js"),
                    "galactic-reach/25.30" => include_str!("../rules/v25-adapter.js"),
                    "galactic-reach/26.31" => include_str!("../rules/v26-adapter.js"),
                    "galactic-reach/27.32" => include_str!("../rules/v27-adapter.js"),
                    "galactic-reach/28.33" => include_str!("../rules/v28-adapter.js"),
                    "galactic-reach/29.34" => include_str!("../rules/v29-adapter.js"),
                    "galactic-reach/30.35" => include_str!("../rules/v30-adapter.js"),
                    "galactic-reach/31.36" => include_str!("../rules/v31-adapter.js"),
                    "galactic-reach/32.37" => include_str!("../rules/v32-adapter.js"),
                    "galactic-reach/33.38" => include_str!("../rules/v33-adapter.js"),
                    "galactic-reach/16.21" => include_str!("../rules/v16-adapter.js"),
                    "galactic-reach/15.20" => include_str!("../rules/v15-adapter.js"),
                    "galactic-reach/14.19" => include_str!("../rules/v14-adapter.js"),
                    "galactic-reach/13.18" => include_str!("../rules/v13-adapter.js"),
                    "galactic-reach/12.17" => include_str!("../rules/v12-adapter.js"),
                    "galactic-reach/11.16" => include_str!("../rules/v11-adapter.js"),
                    "galactic-reach/10.15" => include_str!("../rules/v10-adapter.js"),
                    "galactic-reach/9.14" => include_str!("../rules/v9-adapter.js"),
                    "galactic-reach/8.13" => include_str!("../rules/v8-adapter.js"),
                    "galactic-reach/7.12" => include_str!("../rules/v7-adapter.js"),
                    "galactic-reach/6.11" => include_str!("../rules/v6-adapter.js"),
                    "galactic-reach/5.10" => include_str!("../rules/v5-adapter.js"),
                    _ => include_str!("../rules/v4-adapter.js"),
                })?;
                ctx.eval::<(), _>(include_str!("../rules/replay-view.js"))?;
                ctx.eval::<(), _>(match rules {
                    RULES => ENGINE,
                    "galactic-reach/17.22" => include_str!("../rules/v17-app.js"),
                    "galactic-reach/18.23" => include_str!("../rules/v18-app.js"),
                    "galactic-reach/19.24" => include_str!("../rules/v19-app.js"),
                    "galactic-reach/20.25" => include_str!("../rules/v20-app.js"),
                    "galactic-reach/21.26" => include_str!("../rules/v21-app.js"),
                    "galactic-reach/22.27" => include_str!("../rules/v22-app.js"),
                    "galactic-reach/23.28" => include_str!("../rules/v23-app.js"),
                    "galactic-reach/24.29" => include_str!("../rules/v24-app.js"),
                    "galactic-reach/25.30" => include_str!("../rules/v25-app.js"),
                    "galactic-reach/26.31" => include_str!("../rules/v26-app.js"),
                    "galactic-reach/27.32" => include_str!("../rules/v27-app.js"),
                    "galactic-reach/28.33" => include_str!("../rules/v28-app.js"),
                    "galactic-reach/29.34" => include_str!("../rules/v29-app.js"),
                    "galactic-reach/30.35" => include_str!("../rules/v30-app.js"),
                    "galactic-reach/31.36" => include_str!("../rules/v31-app.js"),
                    "galactic-reach/32.37" => include_str!("../rules/v32-app.js"),
                    "galactic-reach/33.38" => include_str!("../rules/v33-app.js"),
                    "galactic-reach/16.21" => include_str!("../rules/v16-app.js"),
                    "galactic-reach/15.20" => include_str!("../rules/v15-app.js"),
                    "galactic-reach/14.19" => include_str!("../rules/v14-app.js"),
                    "galactic-reach/13.18" => include_str!("../rules/v13-app.js"),
                    "galactic-reach/12.17" => include_str!("../rules/v12-app.js"),
                    "galactic-reach/11.16" => include_str!("../rules/v11-app.js"),
                    "galactic-reach/10.15" => include_str!("../rules/v10-app.js"),
                    "galactic-reach/9.14" => include_str!("../rules/v9-app.js"),
                    "galactic-reach/8.13" => include_str!("../rules/v8-app.js"),
                    "galactic-reach/7.12" => include_str!("../rules/v7-app.js"),
                    "galactic-reach/6.11" => include_str!("../rules/v6-app.js"),
                    "galactic-reach/5.10" => include_str!("../rules/v5-app.js"),
                    _ => include_str!("../rules/v4-app.js"),
                })?;
                ctx.eval::<(), _>(start)
            })
            .map_err(|e| {
                execution_error(
                    deadline.get(),
                    format!("Galactic Reach initialization failed: {e}"),
                )
            })?;
        let snapshot = Self::read_snapshot(&context, deadline.get())?;
        Ok(Self {
            context,
            deadline,
            snapshot,
            rules,
            trace: None,
        })
    }
    pub fn start_trace(&mut self) -> Result<(), String> {
        self.trace = Some(Trace::new(self.replay_view()?));
        Ok(())
    }
    pub fn take_trace(&mut self) -> Option<Trace> {
        self.trace.take()
    }
    fn replay_view(&self) -> Result<Value, String> {
        self.eval_json("JSON.stringify(game.replayView())")
    }
    fn read_snapshot(context: &Context, deadline: Instant) -> Result<Snapshot, String> {
        if Instant::now() >= deadline {
            return Err(SIMULATION_TIMEOUT.into());
        }
        let json = context
            .with(|ctx| ctx.eval::<String, _>("JSON.stringify(game.snapshot())"))
            .map_err(|e| {
                execution_error(deadline, format!("Galactic Reach execution failed: {e}"))
            })?;
        serde_json::from_str(&json).map_err(|e| e.to_string())
    }
}
impl GameAdapter for GalacticReach {
    type Observation = Value;
    type Action = Value;
    fn rules_version(&self) -> &str {
        self.rules
    }
    fn active_seat(&self) -> Option<usize> {
        self.snapshot.active
    }
    fn observe(&self, seat: usize) -> Option<Value> {
        if seat >= 4 {
            return None;
        }
        if self.snapshot.active == Some(seat) {
            return Some(self.snapshot.observation.clone());
        }
        let json = self
            .context
            .with(|ctx| ctx.eval::<String, _>(format!("JSON.stringify(game.observe({seat}))")))
            .ok()?;
        serde_json::from_str(&json).ok()
    }
    fn legal_actions(&self, seat: usize) -> Vec<Value> {
        if self.snapshot.active == Some(seat) {
            self.snapshot.legal.clone()
        } else {
            vec![]
        }
    }
    fn apply_action(&mut self, seat: usize, action: Value) -> Result<(), String> {
        let deadline = self.deadline.get();
        if Instant::now() >= deadline {
            return Err(SIMULATION_TIMEOUT.into());
        }
        if self.snapshot.active != Some(seat) || !self.snapshot.legal.contains(&action) {
            return Err("Illegal action.".into());
        }
        self.context
            .with(|ctx| ctx.eval::<(), _>(format!("game.applyAction({seat}, {});", action)))
            .map_err(|e| execution_error(deadline, format!("Galactic Reach action failed: {e}")))?;
        self.snapshot = Self::read_snapshot(&self.context, self.deadline.get())?;
        if self.trace.is_some() {
            let view = self.replay_view()?;
            if let Some(trace) = self.trace.as_mut() {
                trace.push(seat, action, view);
            }
        }
        Ok(())
    }
    fn scores(&self) -> Option<Vec<f64>> {
        self.snapshot.scores.clone()
    }
}

#[derive(Clone, Copy, Debug)]
pub enum Strategy {
    Military,
    Economy,
    Expansion,
    Wanderer,
}
impl Strategy {
    pub fn version(self) -> &'static str {
        match self {
            Self::Military => "gr-military/26",
            Self::Economy => "gr-economy/26",
            Self::Expansion => "gr-expansion/26",
            Self::Wanderer => "gr-wanderer/26",
        }
    }
    pub fn parse(version: &str) -> Option<Self> {
        match version {
            "gr-military/26" => Some(Self::Military),
            "gr-economy/26" => Some(Self::Economy),
            "gr-expansion/26" => Some(Self::Expansion),
            "gr-wanderer/26" => Some(Self::Wanderer),
            _ => None,
        }
    }
}
pub struct BuiltinAgent {
    strategy: Strategy,
    rng: StdRng,
}
fn number(v: &Value) -> f64 {
    v.as_f64().unwrap_or(0.0)
}
fn distance(a: &str, b: &str) -> f64 {
    let coord = |s: &str| -> Vec<f64> { s.split(',').filter_map(|n| n.parse().ok()).collect() };
    let a = coord(a);
    let b = coord(b);
    if a.len() != 2 || b.len() != 2 {
        return 100.0;
    }
    ((a[0] - b[0]).abs() + (a[1] - b[1]).abs() + (a[0] + a[1] - b[0] - b[1]).abs()) / 2.0
}
fn bot_units(view: &Value, seat: usize, kind: &str) -> f64 {
    view["fleets"]
        .as_object()
        .into_iter()
        .flat_map(|m| m.values())
        .map(|g| number(&g[seat.to_string()][kind]))
        .sum()
}
/// 31.36 Capacity Cards market (rules #cards): key, price in Matter, Energy, Biomass,
/// Data, printed Prestige (reusable Prestige weighted x3) and whether it joins the
/// military deck. Policy 26 meets these keys only in 31.36 games, so its play under
/// earlier rules is unchanged.
const CAPACITY_CARDS: [(&str, [f64; 4], f64, bool); 36] = [
    ("ionThrusters", [0.0, 5.0, 0.0, 1.0], 0.0, false),
    ("slipstreamCharts", [0.0, 1.0, 0.0, 5.0], 0.0, false),
    ("strikeVector", [2.0, 6.0, 0.0, 0.0], 0.0, false),
    ("foldSpaceGate", [0.0, 10.0, 0.0, 4.0], 0.0, false),
    ("prefabYards", [5.0, 1.0, 0.0, 0.0], 0.0, false),
    ("orbitalFoundry", [7.0, 2.0, 0.0, 1.0], 0.0, false),
    ("worldEngine", [10.0, 3.0, 3.0, 0.0], 0.0, false),
    ("seedArk", [1.0, 0.0, 5.0, 0.0], 0.0, false),
    ("colonyPods", [0.0, 2.0, 7.0, 0.0], 0.0, false),
    ("genesisCharter", [4.0, 0.0, 11.0, 2.0], 2.0, false),
    ("miningCharter", [5.0, 0.0, 0.0, 1.0], 0.0, false),
    ("bioReactor", [0.0, 2.0, 5.0, 0.0], 0.0, false),
    ("dataHaven", [0.0, 1.0, 0.0, 6.0], 0.0, false),
    ("harvestCycle", [3.0, 0.0, 6.0, 0.0], 0.0, false),
    ("quartermaster", [2.0, 5.0, 1.0, 0.0], 0.0, false),
    ("strategyCore", [0.0, 2.0, 0.0, 6.0], 0.0, false),
    ("archivePurge", [0.0, 0.0, 2.0, 5.0], 0.0, false),
    ("commandNexus", [0.0, 4.0, 0.0, 9.0], 0.0, false),
    ("cargoExpansion", [6.0, 0.0, 0.0, 2.0], 0.0, false),
    ("hyperspaceVaults", [4.0, 2.0, 0.0, 9.0], 0.0, false),
    ("procurementHub", [0.0, 0.0, 2.0, 6.0], 0.0, false),
    ("tradeSyndicate", [0.0, 5.0, 0.0, 2.0], 0.0, false),
    ("monumentOfAccord", [8.0, 0.0, 4.0, 3.0], 3.0, false),
    ("senateSeat", [0.0, 5.0, 2.0, 9.0], 4.0, false),
    ("dysonLattice", [6.0, 12.0, 0.0, 4.0], 6.0, false),
    ("ascendancyCodex", [0.0, 3.0, 6.0, 12.0], 6.0, false),
    ("railBattery", [5.0, 1.0, 0.0, 0.0], 0.0, true),
    ("deflectorGrid", [1.0, 5.0, 0.0, 0.0], 0.0, true),
    ("flakScreen", [6.0, 0.0, 2.0, 0.0], 0.0, true),
    ("boardingMarines", [2.0, 0.0, 6.0, 0.0], 0.0, true),
    ("torpedoSpread", [0.0, 7.0, 0.0, 2.0], 0.0, true),
    ("hardlightBulwark", [7.0, 2.0, 0.0, 0.0], 0.0, true),
    ("phaseLance", [0.0, 8.0, 0.0, 3.0], 0.0, true),
    ("novaBarrage", [5.0, 10.0, 0.0, 0.0], 0.0, true),
    ("aegisLattice", [10.0, 4.0, 0.0, 0.0], 0.0, true),
    ("victoryDoctrine", [2.0, 4.0, 0.0, 9.0], 2.0, true),
];
/// Printed attack, shield and pierce of the 31.36 military cards (rules #military-deck).
const CAPACITY_TACTICS: [(&str, f64, f64, bool); 10] = [
    ("railBattery", 2.0, 0.0, false),
    ("deflectorGrid", 0.0, 3.0, false),
    ("flakScreen", 1.0, 2.0, false),
    ("boardingMarines", 1.0, 0.0, false),
    ("torpedoSpread", 3.0, 0.0, false),
    ("hardlightBulwark", 0.0, 5.0, false),
    ("phaseLance", 2.0, 0.0, true),
    ("novaBarrage", 5.0, 0.0, false),
    ("aegisLattice", 0.0, 8.0, false),
    ("victoryDoctrine", 2.0, 0.0, false),
];
const RESOURCE_KEYS: [&str; 4] = ["matter", "energy", "biomass", "data"];
fn capacity_card(key: &str) -> Option<([f64; 4], f64, bool)> {
    CAPACITY_CARDS
        .iter()
        .find(|c| c.0 == key)
        .map(|c| (c.1, c.2, c.3))
}
/// Hits, shields and pierce of a combat tactic: the observation's printed stats when the
/// rules publish them (34.39 `tacticStats`), otherwise the basic tactics or the 31.36 table.
fn tactic_stats(view: &Value, key: &str) -> (f64, f64, bool) {
    let printed = &view["tacticStats"][key];
    if printed.is_object() {
        return (
            number(&printed["attack"]),
            number(&printed["shield"]),
            printed["pierce"] == true,
        );
    }
    match key {
        "concentratedFire" => (1.0, 0.0, false),
        "defensiveScreen" => (0.0, 2.0, false),
        _ => CAPACITY_TACTICS
            .iter()
            .find(|t| t.0 == key)
            .map_or((1.0, 0.0, false), |t| (t.1, t.2, t.3)),
    }
}
/// The table's Prestige target (31.36 #victory-target); earlier rules race to 20.
fn victory_target(view: &Value) -> f64 {
    view["victoryTarget"].as_f64().unwrap_or(20.0)
}
/// How much a 31.36 rival values a market card: its price (the set is priced by
/// power), its printed Prestige, minus copies it already owns.
/// A market card's price: the observation's printed costs when the rules publish them
/// (32.37 `marketCosts`), otherwise the 31.36 table.
fn observed_cost(view: &Value, key: &str) -> Option<[f64; 4]> {
    let market = view["market"].as_array()?;
    let costs = view["marketCosts"].as_array()?;
    let index = market.iter().position(|c| c["key"] == key)?;
    Some(std::array::from_fn(|i| {
        number(&costs[index][RESOURCE_KEYS[i]])
    }))
}
/// Prestige a market card gives when bought, as printed in the observation (34.39
/// `marketPrestige`, e.g. Dyson Lattice 5); `None` for earlier rules or other cards.
fn observed_buy_prestige(view: &Value, key: &str) -> Option<f64> {
    let market = view["market"].as_array()?;
    let index = market.iter().position(|c| c["key"] == key)?;
    let prestige = number(&view["marketPrestige"].as_array()?[index]);
    (prestige > 0.0).then_some(prestige)
}
fn capacity_value(view: &Value, seat: usize, key: &str) -> Option<f64> {
    let (table_cost, table_prestige, military) = capacity_card(key)?;
    let cost = observed_cost(view, key).unwrap_or(table_cost);
    let prestige = observed_buy_prestige(view, key).unwrap_or(table_prestige);
    let me = &view["players"][seat];
    if military && bot_units(view, seat, "fleet") == 0.0 {
        return None;
    }
    let owned = ["hand", "discard", "inPlay", "military"]
        .iter()
        .flat_map(|pile| me[*pile].as_array().into_iter().flatten())
        .filter(|c| c["key"] == key)
        .count() as f64
        + me["deckContents"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|g| g["key"] == key)
            .map(|g| number(&g["count"]))
            .sum::<f64>();
    Some(10.0 + cost.iter().sum::<f64>() + prestige * 5.0 - owned * 8.0)
}
/// The resource limits a rival still needs for its best-valued market card.
fn capacity_need(view: &Value, seat: usize) -> Option<[f64; 4]> {
    let target = view["market"]
        .as_array()?
        .iter()
        .filter_map(|c| {
            let key = c["key"].as_str()?;
            Some((
                capacity_value(view, seat, key)?,
                observed_cost(view, key).or_else(|| capacity_card(key).map(|c| c.0))?,
            ))
        })
        .max_by(|a, b| a.0.total_cmp(&b.0))?
        .1;
    let need: [f64; 4] =
        std::array::from_fn(|i| (target[i] - bot_limit(view, seat, RESOURCE_KEYS[i])).max(0.0));
    need.iter().any(|n| *n > 0.0).then_some(need)
}
fn bot_order(key: &str) -> &str {
    match key {
        "move"
        | "surveyDrones"
        | "pathfinderNetwork"
        | "fleetOverdrive"
        | "coordinatedAssault"
        | "phaseShearDrive"
        | "obeliskOfAnnihilation"
        | "ionThrusters"
        | "slipstreamCharts"
        | "strikeVector"
        | "foldSpaceGate" => "move",
        "construct"
        | "modularConstruction"
        | "orbitalShipyards"
        | "prefabYards"
        | "orbitalFoundry"
        | "worldEngine" => "construct",
        "colonize" | "dropColonyModules" | "genesisSeedVault" | "seedArk" | "colonyPods"
        | "genesisCharter" => "colonize",
        "excavate" => "excavate",
        "probe" => "probe",
        _ => "other",
    }
}
fn bot_cards(me: &Value, order: &str) -> f64 {
    ["hand", "discard", "deckContents", "inPlay"]
        .iter()
        .flat_map(|k| me[k].as_array().into_iter().flatten())
        .filter(|c| bot_order(c["key"].as_str().unwrap_or("")) == order)
        .map(|c| c["count"].as_f64().unwrap_or(1.0))
        .sum()
}
/// Archive Purge (34.39 #cards, #rival-cards): the level I starters in discard a rival
/// trashes, in discard order. It keeps at least 3 Move-order and 2 Construct-order
/// cards, because Move and Construct are not sold; the browser rivals choose the same.
fn bot_purge_choice(me: &Value, max: usize) -> Vec<Value> {
    let mut owned = [bot_cards(me, "move"), bot_cards(me, "construct")];
    let mut trash = vec![];
    for card in me["discard"].as_array().into_iter().flatten() {
        if trash.len() >= max {
            break;
        }
        if card["starter"] != true || card["upgraded"] == true {
            continue;
        }
        let (slot, keep) = match card["key"].as_str() {
            Some("move") => (0, 3.0),
            Some("construct") => (1, 2.0),
            _ => continue,
        };
        if owned[slot] > keep {
            owned[slot] -= 1.0;
            trash.push(card["id"].clone());
        }
    }
    trash
}
fn bot_yards(view: &Value, seat: usize) -> usize {
    view["planets"]
        .as_object()
        .into_iter()
        .flat_map(|m| m.values())
        .filter(|p| p["owner"] == json!(seat) && p["upgrade"] == "starbase")
        .count()
}
fn bot_cost(view: &Value, seat: usize) -> Value {
    let me = &view["players"][seat];
    let hand = me["hand"].as_array().map(Vec::as_slice).unwrap_or(&[]);
    for (coord, p) in view["planets"].as_object().into_iter().flatten() {
        let f = &view["fleets"][coord][seat.to_string()];
        let center = p["cluster"]
            .as_u64()
            .is_some_and(|id| view["clusters"][id as usize]["center"] == *coord);
        if center
            && number(&f["settler"]) > 0.0
            && (p["owner"] != json!(seat))
            && hand
                .iter()
                .any(|c| bot_order(c["key"].as_str().unwrap_or("")) == "colonize")
        {
            let discount = hand.iter().any(|c| c["key"] == "dropColonyModules");
            return json!({"biomass": if discount||!p["owner"].is_null(){1}else{2}});
        }
        if number(&f["explorer"]) > 0.0
            && p["special"] == "relic"
            && hand.iter().any(|c| c["key"] == "excavate")
        {
            return json!({"matter":1,"energy":1,"data":2});
        }
    }
    if bot_yards(view, seat) == 0 {
        json!({"matter":2,"energy":1,"biomass":1,"data":1})
    } else {
        json!({"matter":2,"energy":2,"biomass":2,"data": if view["relicRow"].as_array().is_some_and(|r|!r.is_empty()){2}else{1}})
    }
}
fn bot_safe_fight(view: &Value, seat: usize, moving: &Value, target: &str) -> bool {
    let opponent = view["fleets"][target].as_object().and_then(|g| {
        g.iter().find(|(id, f)| {
            *id != &seat.to_string()
                && ["settler", "explorer", "fleet"]
                    .iter()
                    .any(|k| number(&f[k]) > 0.0)
        })
    });
    let empty = json!({});
    let enemy = opponent.map(|(_, f)| f).unwrap_or(&empty);
    let p = &view["planets"][target];
    let yard = p["upgrade"] == "starbase" && p["owner"] != json!(seat);
    let attack = number(&moving["settler"]) + 3.0 * number(&moving["fleet"]);
    let hull = 2.0 * number(&moving["settler"]) + 7.0 * number(&moving["fleet"]);
    let enemy_attack = number(&enemy["settler"])
        + number(&enemy["explorer"])
        + 3.0 * number(&enemy["fleet"])
        + if yard { 3.0 } else { 0.0 };
    let enemy_hull = 4.0 * number(&enemy["settler"])
        + number(&enemy["explorer"])
        + 7.0 * number(&enemy["fleet"])
        + if yard { 3.0 } else { 0.0 };
    if enemy_hull == 0.0 {
        return true;
    }
    if number(&moving["settler"]) > 0.0 {
        return enemy_attack <= 1.0 && attack - 2.0 >= enemy_hull;
    }
    attack * 3.0 - 4.0 >= enemy_hull && hull > enemy_attack * 3.0 + 2.0
}
fn bot_limit(view: &Value, seat: usize, resource: &str) -> f64 {
    view["players"][seat]["resourceLimits"][resource]
        .as_f64()
        .unwrap_or(4.0)
}
fn bot_income(view: &Value, seat: usize) -> Value {
    let mut income = json!({"matter":0.0,"energy":0.0,"biomass":0.0,"data":0.0});
    for (coord, p) in view["planets"].as_object().into_iter().flatten() {
        let resource = p["type"].as_str().unwrap_or("");
        if !["matter", "energy", "biomass", "data"].contains(&resource) {
            continue;
        }
        let mut amount = 0.0;
        if p["owner"] == json!(seat) {
            // 32.37 Harvesters yield `harvesterYield` (2); earlier rules yield 1.
            amount += if p["upgrade"] == "harvester" {
                view["harvesterYield"].as_f64().unwrap_or(1.0)
            } else {
                1.0
            };
        }
        let fleet = &view["fleets"][coord][seat.to_string()];
        if number(&fleet["settler"]) + number(&fleet["fleet"]) > 0.0 {
            amount += 1.0;
        }
        income[resource] = json!(number(&income[resource]) + amount);
    }
    income
}
fn bot_allocation_value(view: &Value, seat: usize, action: &Value, paid: bool) -> f64 {
    let me = &view["players"][seat];
    let income = bot_income(view, seat);
    let protection = bot_cost(view, seat);
    let next_price = number(&me["storageUpgradeCost"]["matter"]) + if paid { 1.0 } else { 0.0 };
    let mut value = 0.0;
    for r in ["matter", "energy", "biomass", "data"] {
        let count = action["allocation"][r].as_u64().unwrap_or(0);
        let payment = if paid {
            number(&me["storageUpgradeCost"][r])
        } else {
            0.0
        };
        let gain = if !paid && r == "biomass" { 2.0 } else { 0.0 };
        for point in 0..count {
            let limit = bot_limit(view, seat, r) + point as f64;
            let need =
                number(&me["resources"][r]) - payment + gain + 2.0 * number(&income[r]) - limit;
            value += if limit < next_price + number(&protection[r]) {
                100.0
            } else {
                0.0
            };
            value += need.clamp(0.0, 1.0) * 10.0 + (number(&income[r]) + 1.0) / (limit + 1.0);
        }
    }
    value
}
fn bot_storage_budget(view: &Value, seat: usize) -> Option<(Value, Value)> {
    let me = &view["players"][seat];
    let leader = view["players"]
        .as_array()?
        .iter()
        .map(|p| number(&p["prestige"]))
        .fold(0.0_f64, f64::max);
    let target = victory_target(view);
    if leader >= target {
        return None;
    }
    let cost = me["storageUpgradeCost"].as_object()?;
    let resources = ["matter", "energy", "biomass", "data"];
    if resources.iter().any(|r| number(&cost[*r]) <= 0.0) {
        return None;
    }
    let income = bot_income(view, seat);
    let pressure: f64 = resources
        .iter()
        .map(|r| {
            (number(&me["resources"][*r]) + number(&income[*r]) - bot_limit(view, seat, r)).max(0.0)
        })
        .sum();
    let horizon = ((target - leader) / 4.0).ceil().clamp(1.0, 4.0);
    if pressure.min(4.0) * horizon <= cost.values().map(number).sum::<f64>() {
        return None;
    }
    let settlers = bot_units(view, seat, "settler") > 0.0;
    let explorers = bot_units(view, seat, "explorer") > 0.0;
    let protection = if bot_yards(view, seat) == 0 {
        json!({"matter":2,"energy":1,"biomass":1,"data":1})
    } else if !settlers && !explorers {
        json!({"matter":1,"energy":1})
    } else {
        json!({"matter":if explorers{1}else{0},"energy":if explorers{1}else{0},"biomass":if settlers{2}else{0},"data":if explorers{2}else{0}})
    };
    Some((Value::Object(cost.clone()), protection))
}

fn bot_storage_reserve(view: &Value, seat: usize) -> Value {
    let base = bot_cost(view, seat);
    let Some((cost, protection)) = bot_storage_budget(view, seat) else {
        return base;
    };
    let mut desired = json!({});
    let mut reserve = json!({});
    for r in ["matter", "energy", "biomass", "data"] {
        let n = number(&cost[r]) + number(&protection[r]);
        desired[r] = json!(n);
        reserve[r] = json!(n.max(number(&base[r])));
    }
    if ["matter", "energy", "biomass", "data"]
        .iter()
        .all(|r| number(&reserve[*r]) <= bot_limit(view, seat, r))
    {
        reserve
    } else if ["matter", "energy", "biomass", "data"]
        .iter()
        .all(|r| number(&desired[*r]) <= bot_limit(view, seat, r))
    {
        desired
    } else {
        base
    }
}

// Public one-Move threat envelope. Never inspect another faction's hand.
fn bot_threat(view: &Value, seat: usize, moving: &Value, destination: &str, source: &str) -> f64 {
    let standing = &view["fleets"][destination][seat.to_string()];
    let own_fleets = number(&moving["fleet"])
        + if source == destination {
            0.0
        } else {
            number(&standing["fleet"])
        };
    let p = &view["planets"][destination];
    let yard = p["owner"] == json!(seat) && p["upgrade"] == "starbase";
    let defense = own_fleets + if yard { 0.7 } else { 0.0 };
    view["fleets"]
        .as_object()
        .into_iter()
        .flatten()
        .flat_map(|(coord, groups)| {
            groups
                .as_object()
                .into_iter()
                .flatten()
                .filter_map(move |(owner, enemy)| {
                    let range = if number(&enemy["settler"]) > 0.0 {
                        2.0
                    } else {
                        3.0
                    };
                    let fleets = number(&enemy["fleet"]);
                    if owner != &seat.to_string()
                        && fleets > 0.0
                        && distance(coord, destination) <= range
                    {
                        Some(if fleets > defense { 1.0 } else { 0.0 })
                    } else {
                        None
                    }
                })
        })
        .fold(0.0_f64, f64::max)
}

impl BuiltinAgent {
    pub fn new(strategy: Strategy, seed: [u8; 32]) -> Self {
        Self {
            strategy,
            rng: StdRng::from_seed(seed),
        }
    }
    fn score(&self, view: &Value, action: &Value) -> f64 {
        let seat = view["seat"].as_u64().unwrap() as usize;
        let me = &view["players"][seat];
        let military = matches!(self.strategy, Strategy::Military);
        let economy = matches!(self.strategy, Strategy::Economy);
        match action["type"].as_str().unwrap_or("") {
            "combat_stay" => 30.0,
            "combat_escape" => {
                let combat = &view["combat"];
                let side = combat["side"].as_str().unwrap();
                let own = &combat["sides"][side];
                let enemy = &combat["sides"][if side == "attacker" {
                    "defender"
                } else {
                    "attacker"
                }];
                let all_explorers = own["pieces"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .all(|p| p["type"] == "explorer");
                let enemy_attack: f64 = enemy["pieces"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .filter(|p| number(&p["damage"]) < number(&p["hull"]))
                    .map(|p| number(&p["power"]))
                    .sum();
                if all_explorers || enemy_attack >= 3.0 {
                    80.0 + number(&action["amount"])
                } else {
                    10.0
                }
            }
            "combat_tactic" => {
                // Only public used tactics and our own hand are in this view.
                // An opponent's pending commitment is deliberately unavailable.
                let combat = &view["combat"];
                let side = combat["side"].as_str().unwrap();
                let own = &combat["sides"][side];
                let enemy = &combat["sides"][if side == "attacker" {
                    "defender"
                } else {
                    "attacker"
                }];
                let stats = |force: &Value| -> (f64, f64) {
                    force["pieces"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .filter(|p| number(&p["damage"]) < number(&p["hull"]))
                        .fold((0.0, 0.0), |(power, hull), p| {
                            (
                                power + number(&p["power"]),
                                hull + number(&p["hull"]) - number(&p["damage"]),
                            )
                        })
                };
                let (own_attack, own_hull) = stats(own);
                let (enemy_attack, enemy_hull) = stats(enemy);
                let used = enemy["used"].as_array().unwrap();
                let fire = 2.0
                    - used
                        .iter()
                        .filter(|key| **key == "concentratedFire")
                        .count() as f64;
                let probability = fire / (4.0 - used.len() as f64);
                // Printed stats: basic tactics, or a 31.36 military card (Phase Lance pierces).
                let (hits, shield, pierce) =
                    tactic_stats(view, action["tactic"].as_str().unwrap_or(""));
                let screen = shield > 0.0;
                let dealt = (own_attack + hits
                    - if pierce {
                        0.0
                    } else {
                        (1.0 - probability) * 2.0
                    })
                .max(0.0);
                let received = (enemy_attack + probability - shield).max(0.0);
                50.0 + dealt - received * 0.75 + if dealt >= enemy_hull { 8.0 } else { 0.0 }
                    - if received >= own_hull { 10.0 } else { 0.0 }
                    + if screen && side == "defender" && combat["volley"] == 3 {
                        2.0
                    } else {
                        0.0
                    }
            }
            "trade_accept" => {
                let offer = view["tradeOffers"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|o| o["id"] == action["offer"])
                    .unwrap();
                let give = offer["giveType"].as_str().unwrap();
                let get = offer["getType"].as_str().unwrap();
                let received = number(&offer["giveAmount"])
                    * if number(&me["resources"][give]) < 2.0 {
                        1.45
                    } else {
                        1.0
                    };
                let paid = number(&offer["getAmount"])
                    * if number(&me["resources"][get]) < 2.0 {
                        1.4
                    } else {
                        1.0
                    };
                if received >= paid { 130.0 } else { -20.0 }
            }
            "trade_reject" => 110.0,
            "trade_cancel" => -20.0,
            "trade_offer" => {
                let give = action["giveType"].as_str().unwrap();
                let get = action["getType"].as_str().unwrap();
                let willing = view["players"].as_array().unwrap().iter().any(|p| {
                    p["id"] != json!(seat)
                        && p["passed"] == false
                        && number(&p["resources"][get]) >= 2.0
                });
                if action["giveAmount"] == 1
                    && action["getAmount"] == 1
                    && number(&me["resources"][give]) >= 3.0
                    && number(&me["resources"][get]) < 2.0
                    && willing
                {
                    10.0
                } else {
                    -20.0
                }
            }
            "colonize" => 160.0,
            "build" | "second_build" | "colony_build" => {
                match action["kind"].as_str().unwrap_or("") {
                    "starbase" => {
                        if bot_yards(view, seat) == 0 {
                            110.0
                        } else {
                            -5.0
                        }
                    }
                    "harvester" => {
                        let resource = view["planets"][action["coord"].as_str().unwrap()]["type"]
                            .as_str()
                            .unwrap_or("");
                        let income: f64 = view["planets"]
                            .as_object()
                            .unwrap()
                            .values()
                            .filter(|p| p["owner"] == json!(seat) && p["type"] == resource)
                            .map(|_| 1.0)
                            .sum();
                        if income < 2.0 {
                            if economy { 79.0 } else { 68.0 }
                        } else {
                            4.0
                        }
                    }
                    "settler" => {
                        if bot_units(view, seat, "settler")
                            < if matches!(self.strategy, Strategy::Expansion) {
                                2.0
                            } else {
                                1.0
                            }
                        {
                            86.0
                        } else {
                            5.0
                        }
                    }
                    "explorer" => {
                        if bot_units(view, seat, "explorer") < 1.0
                            && view["relicRow"].as_array().is_some_and(|r| !r.is_empty())
                        {
                            83.0
                        } else {
                            -5.0
                        }
                    }
                    _ => {
                        let coord = action["coord"].as_str().unwrap();
                        let group = &view["fleets"][coord][seat.to_string()];
                        if bot_threat(view, seat, group, coord, coord) > 0.0 {
                            115.0
                        } else if military && bot_units(view, seat, "fleet") < 4.0 {
                            81.0
                        } else {
                            8.0
                        }
                    }
                }
            }
            "resource" => {
                let cost = bot_storage_reserve(view, seat);
                let gain = action["gain"].as_object().unwrap();
                let need: f64 = gain
                    .iter()
                    .map(|(k, v)| {
                        number(v)
                            .min((bot_limit(view, seat, k) - number(&me["resources"][k])).max(0.0))
                            * (number(&cost[k]) - number(&me["resources"][k])).max(0.0)
                    })
                    .sum();
                let deficit = cost
                    .as_object()
                    .unwrap()
                    .iter()
                    .any(|(k, v)| number(v) > number(&me["resources"][k]));
                let bankable: f64 = gain
                    .iter()
                    .filter(|(k, _)| number(&me["resources"][*k]) < number(&cost[*k]) + 4.0)
                    .map(|(r, v)| {
                        number(v)
                            .min((bot_limit(view, seat, r) - number(&me["resources"][r])).max(0.0))
                    })
                    .sum();
                let key = action["key"].as_str().unwrap_or("");
                let last_build = bot_yards(view, seat) == 0
                    && bot_order(key) == "construct"
                    && me["hand"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .filter(|c| bot_order(c["key"].as_str().unwrap_or("")) == "construct")
                        .count()
                        == 1;
                if last_build {
                    -20.0
                } else if need > 0.0 {
                    45.0 + need * 4.0
                } else if deficit && bankable > 0.0 {
                    30.0 + bankable
                } else {
                    -5.0
                }
            }
            "move" => {
                let from = action["source"].as_str().unwrap();
                let to = action["destination"].as_str().unwrap();
                let here_fleet = &view["fleets"][from][seat.to_string()];
                // 33.38 #movement: a Move names the units it takes; score only those.
                // Earlier rules list no `units` and move the whole group, as before.
                let split = action["units"].is_object();
                let fleet = if split { &action["units"] } else { here_fleet };
                let explorer = action["moveGroup"] == "explorer";
                let settlers = number(&fleet["settler"]);
                let here = &view["planets"][from];
                if explorer
                    && (here["special"] == "relic"
                        || here["relicSignal"] == true
                        || view["relicRow"].as_array().is_none_or(|r| r.is_empty()))
                {
                    return -10.0;
                }
                let here_center = here["cluster"]
                    .as_u64()
                    .is_some_and(|id| view["clusters"][id as usize]["center"] == from);
                // 34.39 #combat: a capture needs a Fleet too, so only Settlers that can
                // found or capture here wait for Colonize.
                let fleet_rule = view["captureNeedsFleet"] == true;
                let can_settle_at = |p: &Value, coord: &str, escorted: bool| {
                    p["owner"].is_null()
                        || !fleet_rule
                        || escorted
                        || number(&view["fleets"][coord][seat.to_string()]["fleet"]) > 0.0
                };
                let escorted = number(&fleet["fleet"]) > 0.0;
                if !explorer
                    && settlers > 0.0
                    && here_center
                    && (here["owner"] != json!(seat))
                    && can_settle_at(here, from, escorted)
                {
                    return -10.0;
                }
                let mut best = -10.0_f64;
                for (coord, p) in view["planets"].as_object().unwrap() {
                    let center = p["cluster"]
                        .as_u64()
                        .is_some_and(|id| view["clusters"][id as usize]["center"] == *coord);
                    let known_relic = p["special"] == "relic" || p["relicSignal"] == true;
                    let goal = if explorer {
                        known_relic
                    } else {
                        settlers > 0.0
                            && center
                            && p["type"] != "moon"
                            && p["owner"] != json!(seat)
                            && can_settle_at(p, coord, escorted)
                            && bot_safe_fight(view, seat, fleet, coord)
                    };
                    if goal && distance(from, coord) > distance(to, coord) {
                        best = best.max(
                            (if explorer {
                                if known_relic { 90.0 } else { 70.0 }
                            } else {
                                92.0
                            }) + distance(from, coord)
                                - distance(to, coord)
                                - distance(to, coord) * 0.3,
                        );
                    }
                }
                if !explorer && settlers == 0.0 {
                    for (coord, group) in view["fleets"].as_object().unwrap() {
                        let enemy = group
                            .as_object()
                            .unwrap()
                            .iter()
                            .find(|(id, _)| *id != &seat.to_string());
                        if let Some((owner, other)) = enemy {
                            let escape = number(&other["explorer"]) > 0.0
                                && number(
                                    &view["players"][owner.parse::<usize>().unwrap()]["resources"]
                                        ["energy"],
                                ) >= number(&other["explorer"]);
                            if !escape
                                && bot_safe_fight(view, seat, fleet, coord)
                                && distance(from, coord) > distance(to, coord)
                            {
                                best = best.max(
                                    (if military { 94.0 } else { 80.0 })
                                        - distance(to, coord) * 0.3,
                                );
                            }
                        }
                    }
                }
                if !explorer {
                    let here_risk = bot_threat(view, seat, fleet, from, from);
                    let there_risk = bot_threat(view, seat, fleet, to, from);
                    if here_risk > there_risk {
                        best = best.max(105.0);
                    }
                    if settlers == 0.0 {
                        for (coord, group) in view["fleets"].as_object().unwrap() {
                            let ally = &group[seat.to_string()];
                            let escort = number(&ally["settler"]) > 0.0
                                && bot_threat(view, seat, ally, coord, coord) > 0.0;
                            if coord != from
                                && (escort || number(&ally["fleet"]) > 0.0)
                                && distance(to, coord) < distance(from, coord)
                            {
                                best = best.max(if escort {
                                    99.0
                                } else if military {
                                    87.0
                                } else {
                                    65.0
                                });
                            }
                        }
                    }
                    best -= there_risk * if settlers > 0.0 { 130.0 } else { 50.0 };
                    // Fleets may leave Settlers behind (#movement), weighed like moving them into danger.
                    let left = number(&here_fleet["settler"]) - settlers;
                    if split && left > 0.0 {
                        let stay = json!({"settler": left});
                        best -= bot_threat(view, seat, &stay, from, from) * 130.0;
                        // 34.39 #combat: the last Fleet stays on an enemy center its Settler can capture.
                        let fleets_left = number(&here_fleet["fleet"]) - number(&fleet["fleet"]);
                        if fleet_rule
                            && here_center
                            && !here["owner"].is_null()
                            && here["owner"] != json!(seat)
                            && fleets_left <= 0.0
                        {
                            return -10.0;
                        }
                    }
                }
                best
            }
            "probe" => 150.0,
            "excavate" => 160.0,
            // 31.36: permanent Prestige, capacity and big draws come first.
            "special"
                if matches!(
                    action["key"].as_str(),
                    Some(
                        "ascendancyCodex"
                            | "cargoExpansion"
                            | "hyperspaceVaults"
                            | "commandNexus"
                            | "strategyCore"
                    )
                ) =>
            {
                95.0
            }
            "special" => {
                50.0 + if action["key"] == "cradleOfLostSuns" {
                    bot_allocation_value(view, seat, action, false) * 0.1
                } else if let Some(trash) = action["trash"].as_array() {
                    // 34.39 Archive Purge: prefer the rival's own surplus-starter choice.
                    if *trash == bot_purge_choice(me, 2) {
                        2.0
                    } else {
                        -10.0
                    }
                } else {
                    0.0
                }
            }

            "buy_effect" => 100.0,
            "upgrade" => {
                let cost = bot_cost(view, seat);
                let r = action["resource"].as_str().unwrap();
                if bot_yards(view, seat) > 0
                    && number(&me["resources"][r]) >= (number(&cost[r]).min(2.0) + 2.0)
                {
                    if action["key"] == "construct" {
                        76.0
                    } else {
                        70.0
                    }
                } else {
                    -5.0
                }
            }
            "buy" if capacity_card(action["key"].as_str().unwrap_or("")).is_some() => {
                let key = action["key"].as_str().unwrap_or("");
                if bot_yards(view, seat) == 0 {
                    -10.0
                } else {
                    capacity_value(view, seat, key).map_or(-10.0, |v| 60.0 + v)
                }
            }
            "buy" => {
                let key = action["key"].as_str().unwrap_or("");
                let order = bot_order(key);
                let size = number(&me["handCount"])
                    + number(&me["deckCount"])
                    + me["discard"].as_array().map_or(0, Vec::len) as f64
                    + me["inPlay"].as_array().map_or(0, Vec::len) as f64;
                if bot_yards(view, seat) == 0 {
                    -10.0
                } else if order == "move" && bot_cards(me, "move") < 5.0 {
                    if key == "fleetOverdrive" { 94.0 } else { 88.0 }
                } else if key == "dropColonyModules"
                    && bot_units(view, seat, "settler") > 0.0
                    && size < 16.0
                {
                    90.0
                } else if order == "construct" && bot_cards(me, "construct") < 2.0 {
                    80.0
                } else if size < 14.0 && ["tradeConsortium", "tacticalForesight"].contains(&key) {
                    75.0
                } else {
                    -10.0
                }
            }
            "finish_construct" => -20.0,
            // 31.36: during Buy, raise the limits the best market card needs.
            "increase_storage" if view["phase"] == "buy" && capacity_need(view, seat).is_some() => {
                let need = capacity_need(view, seat).unwrap();
                130.0
                    + RESOURCE_KEYS
                        .iter()
                        .enumerate()
                        .map(|(i, r)| number(&action["allocation"][*r]).min(need[i]) * 10.0)
                        .sum::<f64>()
            }
            "increase_storage" => {
                let worthwhile =
                    bot_storage_budget(view, seat).is_some_and(|(cost, protection)| {
                        ["matter", "energy", "biomass", "data"].iter().all(|r| {
                            let held = number(&me["resources"][*r]);
                            held - number(&cost[*r]) >= held.min(number(&protection[*r]))
                        })
                    });
                if worthwhile {
                    125.0 + bot_allocation_value(view, seat, action, true) * 0.1
                } else {
                    -20.0
                }
            }
            "bank_trade" => {
                let give = action["giveType"].as_str().unwrap();
                let get = action["getType"].as_str().unwrap();
                let cost = bot_cost(view, seat);
                let bootstrap = get == "data"
                    && bot_yards(view, seat) == 0
                    && number(&me["resources"]["data"]) < 1.0
                    && number(&me["resources"][give]) >= 4.0;
                let funded = number(&me["resources"][get]) < number(&cost[get])
                    && number(&me["resources"][give]) >= 4.0
                    && (number(&me["resources"][give]) >= number(&cost[give]) + 4.0
                        || number(&me["resources"][give]) >= bot_limit(view, seat, give));
                if number(&me["resources"][get]) >= bot_limit(view, seat, get) {
                    -100.0
                } else if bootstrap || funded {
                    100.0
                } else {
                    -20.0
                }
            }
            // Voluntary discards are exposed for players; policies never discard blindly.
            "consortium_gain" => {
                30.0 - number(&me["resources"][action["resource"].as_str().unwrap()])
            }
            "consortium_exchange" => {
                let give = number(&me["resources"][action["giveType"].as_str().unwrap()]);
                let get = number(&me["resources"][action["getType"].as_str().unwrap()]);
                if give > get + 1.0 {
                    20.0 + give - get
                } else {
                    -5.0
                }
            }
            "finish_consortium" => 0.0,
            "cancel_consortium" | "discard_resources" => -50.0,
            "discard_overflow" => {
                let resource = action["resource"].as_str().unwrap();
                let reserve = bot_storage_reserve(view, seat);
                number(&me["resources"][resource]) - number(&reserve[resource])
                    + number(&action["amount"]) * 0.01
            }
            // Policy 26 (30.35 #buy): trash candidates come from discard or from play.
            "decommission" => {
                let card = me["discard"]
                    .as_array()
                    .into_iter()
                    .chain(me["inPlay"].as_array())
                    .flatten()
                    .find(|c| c["id"] == action["card"])
                    .unwrap();
                let order = bot_order(card["key"].as_str().unwrap_or(""));
                let redundant = match order {
                    "construct" => bot_cards(me, order) > 2.0,
                    "move" => bot_cards(me, order) > 6.0,
                    "colonize" => bot_cards(me, order) > 3.0,
                    "excavate" => view["relicRow"].as_array().is_none_or(|r| r.is_empty()),
                    _ => false,
                };
                let r = action["resource"].as_str().unwrap();
                let reserve = bot_cost(view, seat);
                if redundant
                    && card["upgraded"] != true
                    && number(&me["resources"][r]) >= number(&reserve[r]) + 3.0
                {
                    30.0
                } else {
                    -10.0
                }
            }
            _ => 0.0,
        }
    }
}
impl PlayerAgent<GalacticReach> for BuiltinAgent {
    fn policy_version(&self) -> &str {
        self.strategy.version()
    }
    fn select_action(&mut self, observation: &Value, legal: &[Value]) -> usize {
        let random = matches!(self.strategy, Strategy::Wanderer);
        legal
            .iter()
            .enumerate()
            .map(|(i, a)| {
                let score = self.score(observation, a);
                (
                    i,
                    if random && score > 0.0 {
                        self.rng.gen_range(1.0..100.0)
                    } else {
                        score
                    },
                )
            })
            .max_by(|a, b| a.1.total_cmp(&b.1).then_with(|| b.0.cmp(&a.0)))
            .map(|p| p.0)
            .unwrap_or(0)
    }
}

/// Immutable policy versions used to verify historical match replays.
pub fn agent(version: &str, seed: [u8; 32]) -> Result<Box<dyn PlayerAgent<GalacticReach>>, String> {
    if let Some(strategy) = Strategy::parse(version) {
        return Ok(Box::new(BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v1::Strategy::parse(version) {
        return Ok(Box::new(legacy_v1::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v2::Strategy::parse(version) {
        return Ok(Box::new(legacy_v2::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v3::Strategy::parse(version) {
        return Ok(Box::new(legacy_v3::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v4::Strategy::parse(version) {
        return Ok(Box::new(legacy_v4::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v5::Strategy::parse(version) {
        return Ok(Box::new(legacy_v5::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v6::Strategy::parse(version) {
        return Ok(Box::new(legacy_v6::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v7::Strategy::parse(version) {
        return Ok(Box::new(legacy_v7::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v8::Strategy::parse(version) {
        return Ok(Box::new(legacy_v8::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v9::Strategy::parse(version) {
        return Ok(Box::new(legacy_v9::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v10::Strategy::parse(version) {
        return Ok(Box::new(legacy_v10::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v11::Strategy::parse(version) {
        return Ok(Box::new(legacy_v11::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v12::Strategy::parse(version) {
        return Ok(Box::new(legacy_v12::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v13::Strategy::parse(version) {
        return Ok(Box::new(legacy_v13::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v14::Strategy::parse(version) {
        return Ok(Box::new(legacy_v14::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v15::Strategy::parse(version) {
        return Ok(Box::new(legacy_v15::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v16::Strategy::parse(version) {
        return Ok(Box::new(legacy_v16::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v17::Strategy::parse(version) {
        return Ok(Box::new(legacy_v17::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v18::Strategy::parse(version) {
        return Ok(Box::new(legacy_v18::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v19::Strategy::parse(version) {
        return Ok(Box::new(legacy_v19::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v20::Strategy::parse(version) {
        return Ok(Box::new(legacy_v20::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v21::Strategy::parse(version) {
        return Ok(Box::new(legacy_v21::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v22::Strategy::parse(version) {
        return Ok(Box::new(legacy_v22::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v23::Strategy::parse(version) {
        return Ok(Box::new(legacy_v23::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v24::Strategy::parse(version) {
        return Ok(Box::new(legacy_v24::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v25::Strategy::parse(version) {
        return Ok(Box::new(legacy_v25::BuiltinAgent::new(strategy, seed)));
    }
    Err("Unsupported Galactic Reach policy version.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn in_play_cards_still_count_in_owned_deck_planning() {
        let me = json!({"hand":[],"discard":[],"deckContents":[{"key":"move","count":1}],"inPlay":[{"key":"move"},{"key":"construct"}]});
        assert_eq!(bot_cards(&me, "move"), 2.0);
        assert_eq!(bot_cards(&me, "construct"), 1.0);
    }
    #[test]
    fn explorer_follows_private_signal_without_searching_its_current_world() {
        let agent = BuiltinAgent::new(Strategy::Economy, [17; 32]);
        let view = json!({"seat":0,"players":[{"resources":{},"hand":[]}],"fleets":{"5,0":{"0":{"explorer":1}}},"planets":{"5,0":{"cluster":4,"type":"data","owner":null,"special":null},"8,0":{"cluster":5,"unknown":true,"relicSignal":true}},"clusters":[{},{},{},{},{"kind":"world","center":"5,0","located":false},{"kind":"unknown","center":null,"located":true}],"relicRow":[{"key":"voidglassAstrolabe"}]});
        let moving =
            json!({"type":"move","source":"5,0","destination":"7,0","moveGroup":"explorer"});
        assert!(agent.score(&view, &moving) > 0.0);
        assert!(
            agent.score(&view, &json!({"type":"probe","coord":"5,0"}))
                > agent.score(&view, &moving)
        );
    }
    #[test]
    fn storage_forecast_allocates_independent_limits_and_protects_scoring() {
        let agent = BuiltinAgent::new(Strategy::Military, [3; 32]);
        let mut view = json!({"seat":0,"players":[{"resources":{"matter":4,"energy":3,"biomass":2,"data":4},"prestige":3,"capacity":16,"resourceLimits":{"matter":4,"energy":4,"biomass":4,"data":4},"storageUpgradeCost":{"matter":1,"energy":1,"biomass":1,"data":1}},{"prestige":3},{"prestige":3},{"prestige":3}],"fleets":{},"planets":{"2,0":{"owner":0,"occupiedBy":null,"type":"matter"},"3,0":{"owner":0,"occupiedBy":null,"type":"data"},"0,0":{"owner":0,"occupiedBy":null,"type":"matter","upgrade":"starbase"},"1,0":{"owner":0,"occupiedBy":null,"type":"data","upgrade":"harvester","upgradeLevel":1}}});
        assert!(agent.score(&view, &json!({"type":"increase_storage","allocation":{"matter":2,"energy":0,"biomass":0,"data":2}})) > 100.0);
        view["players"][0]["resources"] = json!({"matter":3,"energy":3,"biomass":2,"data":2});
        view["fleets"] = json!({"1,0":{"0":{"settler":1,"explorer":1}}});
        assert!(agent.score(&view, &json!({"type":"increase_storage","allocation":{"matter":2,"energy":0,"biomass":0,"data":2}})) < 0.0);
        assert_eq!(
            bot_storage_reserve(&view, 0),
            json!({"matter":2.0,"energy":2.0,"biomass":3.0,"data":3.0})
        );
        view["players"][0]["resources"] = json!({"matter":2,"energy":2,"biomass":3,"data":4});
        assert!(agent.score(&view, &json!({"type":"increase_storage","allocation":{"matter":2,"energy":0,"biomass":0,"data":2}})) > 100.0);
        let before = bot_storage_budget(&view, 0);
        view["players"][1]["hand"] = json!([{"key":"omniscientChorus"}]);
        assert_eq!(bot_storage_budget(&view, 0), before);
        view["players"][1]["prestige"] = json!(20);
        assert!(bot_storage_budget(&view, 0).is_none());
    }
    use game_core::run_match;
    // 33.38 #movement: a Move names its `units`; Fleets may leave a safe Settler behind.
    #[test]
    fn split_moves_leave_safe_settlers_and_keep_exposed_ones_escorted() {
        let mut agent = BuiltinAgent::new(Strategy::Military, [9; 32]);
        let mut view = json!({"seat":0,"phase":"operations","relicRow":[],
            "players":[{"resources":{"matter":5,"energy":5,"biomass":5,"data":5},"hand":[{"id":"m","key":"move"}],"discard":[],"deckContents":[],"handCount":1,"deckCount":0,"capacity":30},{"resources":{"energy":0}},{"resources":{}},{"resources":{}}],
            "planets":{"0,0":{"owner":null,"type":"biomass","upgrade":null,"cluster":0}},
            "clusters":[{"center":"0,0"}],
            "fleets":{"0,0":{"0":{"settler":1,"explorer":0,"fleet":2}},"8,0":{"1":{"settler":0,"explorer":0,"fleet":1}}}});
        let whole = json!({"type":"move","source":"0,0","destination":"1,0","moveGroup":"ships","units":{"settler":1,"explorer":0,"fleet":2}});
        let split = json!({"type":"move","source":"0,0","destination":"2,0","moveGroup":"ships","units":{"settler":0,"explorer":0,"fleet":2}});
        assert!(
            agent.score(&view, &whole) < 0.0,
            "A Settler on its Colony site waits"
        );
        assert!(
            agent.score(&view, &split) > 50.0,
            "Fleets leave the safe Settler to hunt at Fleet speed"
        );
        assert_eq!(
            agent.select_action(&view, &[whole.clone(), split.clone()]),
            1
        );
        view["fleets"]["-2,0"] = json!({"1":{"settler":0,"explorer":0,"fleet":2}});
        assert!(
            agent.score(&view, &split) < 0.0,
            "Fleets do not strand a Settler an enemy Fleet could reach"
        );
        let old = json!({"type":"move","source":"0,0","destination":"2,0","moveGroup":"ships"});
        assert!(
            agent.score(&view, &old) < 0.0,
            "Without `units` (earlier rules) the whole group is scored, as before"
        );
    }
    #[test]
    fn scoring_policy_prefers_points_and_settler_colony_goals() {
        let agent = BuiltinAgent::new(Strategy::Military, [9; 32]);
        let mut view = json!({"seat":0,"phase":"operations","relicRow":[{"key":"voidglassAstrolabe"}],
            "players":[{"resources":{"matter":5,"energy":5,"biomass":5,"data":5},"hand":[{"id":"m","key":"move"},{"id":"c","key":"construct"}],"discard":[],"deckContents":[],"handCount":2,"deckCount":0,"capacity":30},{"resources":{}},{"resources":{}},{"resources":{}}],
            "planets":{"0,0":{"owner":0,"type":"matter","upgrade":"starbase","occupiedBy":null,"cluster":0},"3,0":{"owner":null,"type":"biomass","upgrade":null,"occupiedBy":null,"cluster":1},"-1,0":{"owner":1,"type":"energy","upgrade":"harvester","occupiedBy":null,"cluster":2}},
            "clusters":[{"center":"0,0","surveyed":true},{"center":"3,0","surveyed":false},{"center":"-6,0","surveyed":true}],"fleets":{"0,0":{"0":{"settler":1,"fleet":0,"explorer":0}}}});
        let progress =
            json!({"type":"move","source":"0,0","destination":"1,0","moveGroup":"ships"});
        let occupation =
            json!({"type":"move","source":"0,0","destination":"-1,0","moveGroup":"ships"});
        assert!(
            agent.score(&view, &progress) > agent.score(&view, &occupation),
            "Military Settlers pursue neutral Colonies instead of unrelated resource occupations"
        );
        assert!(
            agent.score(&view, &json!({"type":"colonize"}))
                > agent.score(
                    &view,
                    &json!({"type":"build","coord":"0,0","kind":"harvester"})
                )
        );
        assert!(
            agent.score(&view, &json!({"type":"excavate"}))
                > agent.score(
                    &view,
                    &json!({"type":"build","coord":"0,0","kind":"starbase"})
                )
        );
        let score = agent.score(&view, &progress);
        view["players"][1]["hand"] = json!([{"key":"warSongOfHollowStars"}]);
        assert_eq!(
            agent.score(&view, &progress),
            score,
            "Hidden enemy cards cannot influence planning"
        );
        view["relicRow"] = json!([]);
        assert!(agent.score(&view, &json!({"type":"build","kind":"explorer"})) < 0.0);
        view["fleets"]["0,0"]["0"] = json!({"settler":0,"fleet":0,"explorer":1});
        view["planets"]["0,0"]["special"] = json!("relic");
        assert!(
            agent.score(
                &view,
                &json!({"type":"move","source":"0,0","destination":"1,0","moveGroup":"explorer"})
            ) < 0.0
        );
    }
    #[test]
    fn combat_policy_uses_public_damage_and_used_tactics() {
        let agent = BuiltinAgent::new(Strategy::Military, [7; 32]);
        let mut view = json!({"seat":0,"players":[{"resources":{}}],"combat":{
            "side":"attacker","volley":2,"sides":{
                "attacker":{"pieces":[{"type":"fleet","power":3,"hull":7,"damage":0}],"used":[]},
                "defender":{"pieces":[{"type":"fleet","power":3,"hull":7,"damage":5}],"used":["concentratedFire","concentratedFire"],"committed":true}
            }
        }});
        let fire = json!({"type":"combat_tactic","tactic":"concentratedFire"});
        let screen = json!({"type":"combat_tactic","tactic":"defensiveScreen"});
        assert!(
            agent.score(&view, &fire) > agent.score(&view, &screen),
            "Fire can finish a damaged enemy through its remaining Screens"
        );
        view["combat"]["sides"]["attacker"]["pieces"][0]["damage"] = json!(5);
        view["combat"]["sides"]["defender"]["pieces"][0]["damage"] = json!(0);
        view["combat"]["sides"]["defender"]["used"] = json!([]);
        assert!(
            agent.score(&view, &screen) > agent.score(&view, &fire),
            "Screen can preserve a damaged Fleet for another decision"
        );
        let scores = (agent.score(&view, &fire), agent.score(&view, &screen));
        view["combat"]["sides"]["defender"]["committed"] = json!(false);
        assert_eq!(
            scores,
            (agent.score(&view, &fire), agent.score(&view, &screen)),
            "Commitment status does not reveal or predict its card"
        );
    }

    /// 34.39 balance package: native rivals follow the observation's capture rule, printed
    /// Wonder Prestige and military stats, and choose an Archive Purge like browser rivals.
    #[test]
    fn balance_package_rivals_read_the_published_rules() {
        let agent = BuiltinAgent::new(Strategy::Expansion, [5; 32]);
        let mut view = json!({"seat":0,"phase":"operations","relicRow":[],
            "players":[{"resources":{"matter":5,"energy":5,"biomass":5,"data":5},"hand":[{"id":"m","key":"move"}],"discard":[],"deckContents":[],"handCount":1,"deckCount":0,"capacity":30},{"resources":{}},{"resources":{}},{"resources":{}}],
            "planets":{"0,0":{"owner":0,"type":"matter","upgrade":"starbase","cluster":0},"4,0":{"owner":1,"type":"energy","upgrade":null,"hasColony":true,"cluster":1}},
            "clusters":[{"center":"0,0","surveyed":true},{"center":"4,0","surveyed":true}],
            "fleets":{"0,0":{"0":{"settler":1,"fleet":0,"explorer":0}}}});
        let toward = json!({"type":"move","source":"0,0","destination":"1,0","moveGroup":"ships"});
        let before_rule = agent.score(&view, &toward);
        assert!(
            before_rule > 80.0,
            "Earlier rules: a lone Settler heads for the enemy center"
        );
        view["captureNeedsFleet"] = json!(true);
        assert!(
            agent.score(&view, &toward) < before_rule,
            "A lone Settler cannot capture, so the enemy center is no goal"
        );
        view["fleets"]["0,0"]["0"]["fleet"] = json!(1);
        assert!(
            agent.score(&view, &toward) > 80.0,
            "A Settler with a Fleet goes for the capture"
        );
        // Split moves (33.38): the last Fleet does not leave a Settler that can capture here.
        let mut on_center = view.clone();
        on_center["fleets"] = json!({"4,0":{"0":{"settler":1,"fleet":1,"explorer":0}},"7,0":{"2":{"settler":1,"fleet":0,"explorer":0}}});
        let away = |fleet: u32| json!({"type":"move","source":"4,0","destination":"5,0","moveGroup":"ships","units":{"settler":0,"explorer":0,"fleet":fleet}});
        assert_eq!(agent.score(&on_center, &away(1)), -10.0);
        on_center["fleets"]["4,0"]["0"]["fleet"] = json!(2);
        assert!(agent.score(&on_center, &away(1)) > -10.0, "a second Fleet may go");

        // Wonders: the observation's printed Prestige replaces the 31.36 table.
        view["market"] = json!([{"key":"dysonLattice"}]);
        let table = capacity_value(&view, 0, "dysonLattice").unwrap();
        view["marketPrestige"] = json!([5]);
        assert_eq!(
            capacity_value(&view, 0, "dysonLattice").unwrap(),
            table - 5.0
        );
        // Military cards: printed stats from the observation (Boarding Marines +2).
        assert_eq!(tactic_stats(&view, "boardingMarines"), (1.0, 0.0, false));
        view["tacticStats"] = json!({"boardingMarines":{"attack":2,"shield":0,"pierce":false}});
        assert_eq!(tactic_stats(&view, "boardingMarines"), (2.0, 0.0, false));

        // Archive Purge keeps 3 Move-order and 2 Construct-order cards.
        let starter = |id: &str, key: &str| json!({"id":id,"key":key,"starter":true});
        view["players"][0]["hand"] = json!([{"id":"purge","key":"archivePurge"}]);
        view["players"][0]["discard"] = json!([
            starter("m1", "move"),
            starter("c1", "construct"),
            starter("m2", "move"),
            starter("c2", "construct")
        ]);
        view["players"][0]["deckContents"] =
            json!([{"key":"move","count":2},{"key":"construct","count":1}]);
        let me = &view["players"][0];
        assert_eq!(bot_purge_choice(me, 2), vec![json!("m1"), json!("c1")]);
        let purge = |trash: Value| json!({"type":"special","card":"purge","key":"archivePurge","trash":trash});
        assert!(
            agent.score(&view, &purge(json!(["m1", "c1"])))
                > agent.score(&view, &purge(json!(["m1", "m2"])))
        );
        view["players"][0]["deckContents"] = json!([]);
        assert!(
            agent.score(&view, &purge(json!([]))) > agent.score(&view, &purge(json!(["m1"]))),
            "With no surplus a rival trashes nothing"
        );
    }

    #[test]
    fn current_agents_bootstrap_data_before_explorers() {
        let agent = BuiltinAgent::new(Strategy::Military, [7; 32]);
        let view = json!({
            "seat": 0,
            "phase": "operations",
            "players": [{
                "resources": {"matter": 4, "energy": 4, "biomass": 2, "data": 0},
                "capacity": 10
            }]
        });
        let bank = json!({"type":"bank_trade","giveType":"energy","getType":"data"});
        assert!(agent.score(&view, &bank) > agent.score(&view, &json!({"type":"pass"})));
    }
    #[test]
    fn archived_rules_and_policies_still_load() {
        for rules in [
            "galactic-reach/4.9",
            "galactic-reach/5.10",
            "galactic-reach/6.11",
            "galactic-reach/7.12",
            "galactic-reach/8.13",
            "galactic-reach/9.14",
            "galactic-reach/10.15",
            "galactic-reach/11.16",
            "galactic-reach/12.17",
            "galactic-reach/13.18",
            "galactic-reach/14.19",
            "galactic-reach/15.20",
            "galactic-reach/16.21",
            "galactic-reach/17.22",
            "galactic-reach/18.23",
            "galactic-reach/19.24",
            "galactic-reach/20.25",
            "galactic-reach/21.26",
            "galactic-reach/22.27",
            "galactic-reach/23.28",
            "galactic-reach/24.29",
            "galactic-reach/25.30",
            "galactic-reach/26.31",
            "galactic-reach/27.32",
            "galactic-reach/28.33",
            "galactic-reach/29.34",
            "galactic-reach/30.35",
            "galactic-reach/31.36",
            "galactic-reach/32.37",
            "galactic-reach/33.38",
        ] {
            let game = GalacticReach::with_rules([19; 32], rules).unwrap();
            assert_eq!(game.rules_version(), rules);
            let mut game = game;
            game.apply_action(0, json!({"type":"pass"})).unwrap();
            assert_eq!(
                game.active_seat(),
                Some(
                    if matches!(
                        rules,
                        "galactic-reach/7.12"
                            | "galactic-reach/8.13"
                            | "galactic-reach/9.14"
                            | "galactic-reach/10.15"
                            | "galactic-reach/11.16"
                            | "galactic-reach/12.17"
                            | "galactic-reach/13.18"
                            | "galactic-reach/14.19"
                            | "galactic-reach/15.20"
                            | "galactic-reach/16.21"
                            | "galactic-reach/17.22"
                            | "galactic-reach/18.23"
                            | "galactic-reach/19.24"
                            | "galactic-reach/20.25"
                            | "galactic-reach/21.26"
                            | "galactic-reach/22.27"
                            | "galactic-reach/23.28"
                            | "galactic-reach/24.29"
                            | "galactic-reach/25.30"
                            | "galactic-reach/26.31"
                            | "galactic-reach/27.32"
                            | "galactic-reach/28.33"
                            | "galactic-reach/29.34"
                            | "galactic-reach/30.35"
                            | "galactic-reach/31.36"
                            | "galactic-reach/32.37"
                            | "galactic-reach/33.38"
                    ) {
                        0
                    } else {
                        1
                    },
                ),
                "Archived passes retain their original timing"
            );
        }
        for policy in [
            "gr-military/1",
            "gr-economy/2",
            "gr-expansion/3",
            "gr-military/4",
            "gr-expansion/5",
            "gr-economy/6",
            "gr-military/7",
            "gr-military/8",
            "gr-military/9",
            "gr-military/10",
            "gr-military/11",
            "gr-military/12",
            "gr-military/13",
            "gr-military/14",
            "gr-military/15",
            "gr-military/16",
            "gr-military/17",
            "gr-military/18",
            "gr-military/19",
            "gr-military/20",
            "gr-military/21",
            "gr-military/22",
            "gr-military/23",
            "gr-military/24",
            "gr-military/25",
            "gr-military/26",
        ] {
            assert_eq!(agent(policy, [23; 32]).unwrap().policy_version(), policy);
        }
    }
    #[test]
    fn adapter_enforces_seats_actions_and_private_observations() {
        let mut g = GalacticReach::new([3; 32]).unwrap();
        let before = g.observe(0).unwrap();
        let me = &before["players"][0];
        assert_eq!(me["hand"].as_array().unwrap().len(), 5);
        for seat in 1..4 {
            assert!(before["players"][seat]["hand"].is_null());
        }
        assert!(me.get("deck").is_none());
        assert!(me.get("militaryDeck").is_none());
        assert!(before.get("advancedDeck").is_none());
        assert_eq!(before["planets"].as_object().unwrap().len(), 91);
        assert!(
            before["planets"]
                .as_object()
                .unwrap()
                .values()
                .all(|p| p.get("type").is_some() && p["special"].is_null())
        );
        assert_eq!(
            before["clusters"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|c| c["kind"] == "unknown" && c["center"].is_null())
                .count(),
            4
        );
        assert!(g.legal_actions(1).is_empty());
        assert!(g.apply_action(1, json!({"type":"pass"})).is_err());
        assert!(
            g.apply_action(0, json!({"type":"move", "destination":"999,999"}))
                .is_err()
        );
        assert_eq!(g.observe(0).unwrap(), before);
        let legal = g.legal_actions(0);
        assert_eq!(legal, g.legal_actions(0));
        assert_eq!(g.observe(0).unwrap(), before);
        g.apply_action(0, json!({"type":"pass"})).unwrap();
        assert_eq!(g.active_seat(), Some(0));
        assert_eq!(g.observe(0).unwrap()["phase"], "buy");
        g.apply_action(0, json!({"type":"finish_buy"})).unwrap();
        assert_eq!(g.active_seat(), Some(1));
        assert_eq!(g.observe(1).unwrap()["phase"], "operations");
    }
    #[test]
    fn reference_policies_complete_reproducible_four_player_matches() {
        let play = || {
            let mut game = GalacticReach::new([8; 32]).unwrap();
            let mut agents: Vec<Box<dyn PlayerAgent<GalacticReach>>> = [
                Strategy::Military,
                Strategy::Economy,
                Strategy::Expansion,
                Strategy::Wanderer,
            ]
            .into_iter()
            .enumerate()
            .map(|(i, s)| {
                Box::new(BuiltinAgent::new(s, [i as u8; 32])) as Box<dyn PlayerAgent<GalacticReach>>
            })
            .collect();
            run_match(&mut game, &mut agents, 10000).unwrap()
        };
        let result = play();
        assert_eq!(result, play());
        assert_eq!(result.rules_version, RULES);
        assert_eq!(result.scores.len(), 4);
        assert_eq!(result.scores.iter().copied().fold(0.0, f64::max), 3.0);
        assert!(result.scores.iter().all(|s| (0.0..=3.0).contains(s)));
    }
    // 31.36 (#rival-cards): the reference rivals that run shared tables buy the new
    // cards, raise their limits toward them, play them and use military tactics.
    #[test]
    fn reference_policies_buy_and_play_capacity_cards() {
        let mut game = GalacticReach::new([8; 32]).unwrap();
        let mut agents: Vec<BuiltinAgent> = [
            Strategy::Military,
            Strategy::Economy,
            Strategy::Expansion,
            Strategy::Military,
        ]
        .into_iter()
        .enumerate()
        .map(|(i, s)| BuiltinAgent::new(s, [i as u8; 32]))
        .collect();
        let (mut bought, mut storage, mut played, mut tactics) = (0, 0, 0, 0);
        for _ in 0..12000 {
            let Some(seat) = game.active_seat() else {
                break;
            };
            let view = game.observe(seat).unwrap();
            let legal = game.legal_actions(seat);
            let action = legal[agents[seat].select_action(&view, &legal)].clone();
            let key = action["key"].as_str().unwrap_or("");
            match action["type"].as_str().unwrap_or("") {
                "buy" if capacity_card(key).is_some() => bought += 1,
                "increase_storage" => storage += 1,
                "special" | "move" | "build" | "colonize" if capacity_card(key).is_some() => {
                    played += 1
                }
                "combat_tactic" if CAPACITY_TACTICS.iter().any(|t| action["tactic"] == t.0) => {
                    tactics += 1
                }
                _ => {}
            }
            game.apply_action(seat, action).unwrap();
        }
        eprintln!(
            "capacity cards: bought {bought}, capacity {storage}, played {played}, military tactics {tactics}"
        );
        assert!(game.scores().is_some(), "the 40-point match finishes");
        assert!(bought >= 4, "rivals buy new market cards ({bought})");
        assert!(storage >= 4, "rivals raise their limits ({storage})");
        assert!(played >= 2, "rivals play new cards ({played})");
    }
    /// A shared table resumes from its snapshot text exactly: every revision in
    /// SHARED_RULES boots, and a resumed engine re-snapshots byte for byte (object
    /// key order included, which the rules depend on) and plays on identically.
    #[test]
    fn shared_tables_resume_exactly_on_every_shared_revision() {
        use std::cell::RefCell;
        use std::rc::Rc;
        for rules in SHARED_RULES {
            let log: Rc<RefCell<Vec<Vec<usize>>>> = Rc::default();
            let mut rng = StdRng::from_seed([9; 32]);
            let record = log.clone();
            let seats: [(String, bool); 4] = std::array::from_fn(|i| (format!("P{i}"), i < 2));
            let mut game = GalacticReach::shared(rules, &seats, 20, move |n, _| {
                let mut order: Vec<usize> = (0..n).collect();
                rand::seq::SliceRandom::shuffle(order.as_mut_slice(), &mut rng);
                record.borrow_mut().push(order.clone());
                order
            })
            .unwrap();
            assert_eq!(game.rules_version(), rules);
            let mut agents: Vec<BuiltinAgent> = (0..4)
                .map(|i| BuiltinAgent::new(Strategy::Economy, [i; 32]))
                .collect();
            let mut step = |g: &mut GalacticReach| {
                let seat = g.active_seat().unwrap();
                let legal = g.legal_actions(seat);
                let pick = agents[seat].select_action(&g.observe(seat).unwrap(), &legal);
                g.apply_action(seat, legal[pick].clone()).unwrap();
                legal[pick].clone()
            };
            for _ in 0..120 {
                step(&mut game);
            }
            let text = game.snapshot().unwrap();
            let used = log.borrow().len();
            let replay = log.clone();
            let mut next = used;
            let mut resumed =
                GalacticReach::shared_on(rules, &seats, 20, Some(&text), move |n, _| {
                    let order = replay.borrow()[next].clone();
                    assert_eq!(order.len(), n);
                    next += 1;
                    order
                })
                .unwrap();
            assert_eq!(
                resumed.snapshot().unwrap(),
                text,
                "{rules}: resumed snapshot is identical"
            );
            for _ in 0..150 {
                let action = step(&mut game);
                let seat = resumed.active_seat().unwrap();
                resumed.apply_action(seat, action).unwrap();
            }
            assert_eq!(
                resumed.snapshot().unwrap(),
                game.snapshot().unwrap(),
                "{rules}: plays on identically"
            );
        }
    }
    #[test]
    fn execution_deadline_interrupts_javascript() {
        assert_eq!(
            GalacticReach::with_timeout([1; 32], Duration::ZERO)
                .err()
                .unwrap(),
            SIMULATION_TIMEOUT
        );
        let mut game = GalacticReach::new([17; 32]).unwrap();
        let before = game.observe(0).unwrap();
        let action = game.legal_actions(0)[0].clone();
        game.deadline.set(Instant::now());
        assert_eq!(
            game.apply_action(0, action).unwrap_err(),
            SIMULATION_TIMEOUT
        );
        assert_eq!(
            game.observe(0).unwrap(),
            before,
            "An expired simulation never applies another action"
        );
        assert!(game.scores().is_none());
    }
}
