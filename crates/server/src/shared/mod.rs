//! Shared multi-human Galactic Reach tables.
//!
//! The server is authoritative. A table is its event log (`log::TableLog`): seat
//! actions plus the hidden-information authority's shuffles, so the live position
//! is `fold(log)`. Seats send commands; the table service matches each one to a
//! legal action of the rules engine, applies it, appends it, and tells every
//! connected seat to refresh its own private view (`authority::HiddenInfoAuthority`).
//! AI rivals are server-driven seats in the same log.
pub mod authority;
pub mod log;

use crate::*;
use authority::HiddenInfoAuthority;
use axum::response::sse::{Event as SseEvent, KeepAlive, Sse};
use galactic_reach::{BuiltinAgent, GalacticReach, SHARED_STEP, Strategy};
use game_core::{GameAdapter, PlayerAgent};
use log::{Event, NewEvent, Seat, Table, TableLog};
use rusqlite::Connection;
use serde_json::Value;
use std::{
    cell::RefCell,
    collections::{HashMap, HashSet, VecDeque},
    rc::Rc,
    sync::{Mutex, mpsc},
    time::Duration,
};

/// Pause between AI rival decisions, so people can follow the board.
pub const AI_PACE: Duration = Duration::from_millis(600);

#[derive(Debug, PartialEq)]
pub enum Refusal {
    NotFound,
    Conflict(String),
    Bad(String),
    Internal(String),
}
impl From<Refusal> for ApiError {
    fn from(r: Refusal) -> Self {
        match r {
            Refusal::NotFound => ApiError(
                StatusCode::NOT_FOUND,
                "This shared table does not exist.".into(),
            ),
            Refusal::Conflict(m) => ApiError(StatusCode::CONFLICT, m),
            Refusal::Bad(m) => ApiError(StatusCode::BAD_REQUEST, m),
            Refusal::Internal(m) => internal(m),
        }
    }
}
fn broken(e: impl ToString) -> Refusal {
    Refusal::Internal(e.to_string())
}

/// Supplies the engine's shuffles: logged ones first while folding, then fresh
/// ones from the authority, which are kept until the table service appends them.
struct Feed {
    table: String,
    authority: Arc<dyn HiddenInfoAuthority>,
    logged: VecDeque<Event>,
    fresh: Vec<NewEvent>,
    count: u64,
    error: Option<String>,
}
impl Feed {
    fn next(&mut self, n: usize, purpose: &str) -> Result<Vec<usize>, String> {
        let order = match self.logged.pop_front() {
            Some(event) => self.authority.replay_shuffle(&event, n, purpose)?,
            None => {
                let shuffle = self
                    .authority
                    .shuffle(&self.table, self.count, n, purpose)?;
                self.fresh.push(shuffle.event);
                shuffle.order
            }
        };
        self.count += 1;
        Ok(order)
    }
}

/// An action still in effect (not undone), as Undo needs to see it.
struct Played {
    seq: u64,
    seat: usize,
    /// The turn it was taken in (the engine's turn counter); absent on old events.
    turn: Option<u64>,
    /// What it revealed, if anything: Undo cannot go back past it.
    revealed: Option<String>,
}
impl Played {
    fn from(seq: u64, seat: usize, public: &Value) -> Self {
        Self {
            seq,
            seat,
            turn: public["turn"].as_u64(),
            // Events from before Undo existed carry no turn and count as checkpoints.
            revealed: match &public["revealed"] {
                Value::String(r) => Some(r.clone()),
                Value::Null if public.get("turn").is_some() => None,
                _ => Some("an earlier action".into()),
            },
        }
    }
}

/// What Undo would take back for a seat right now.
struct UndoWindow {
    /// Undo cancels this seat's actions after this sequence number.
    to: u64,
    actions: usize,
    /// Why Undo cannot reach the start of the turn, when a reveal stops it.
    stop: Option<String>,
}

/// Names what changed between two `undoMark` reveal summaries, or a fresh shuffle.
fn revealed(before: &Value, after: &Value, shuffled: bool) -> Option<String> {
    let (b, a) = (&before["reveal"], &after["reveal"]);
    let changed = |k: &str| b[k] != a[k];
    let reason = if shuffled {
        "cards were shuffled"
    } else if changed("decks") {
        "cards were drawn"
    } else if changed("market") {
        "a new market card was turned up"
    } else if changed("relics") {
        "a new relic card was turned up"
    } else if changed("surveys") {
        "a world or moon was surveyed"
    } else if changed("located") {
        "a relic was located"
    } else if changed("combat") || changed("combats") {
        "a battle was revealed"
    } else {
        return None;
    };
    Some(reason.into())
}

struct Live {
    table: Table,
    engine: GalacticReach,
    feed: Rc<RefCell<Feed>>,
    head: u64,
    agents: HashMap<usize, BuiltinAgent>,
    played: Vec<Played>,
}
impl Live {
    /// Undo (rulebook #shared-tables): only the seat to move, only within its
    /// current turn, and never back past an action that revealed hidden information.
    fn undo_window(&self, seat: usize) -> Result<UndoWindow, String> {
        if self.table.status == "finished" {
            return Err("The game is over.".into());
        }
        if self.engine.active_seat() != Some(seat) {
            return Err("Undo works on your own turn.".into());
        }
        let turn = self.engine.undo_mark()?["turn"].as_u64();
        let mut first = None;
        let mut stop = None;
        for p in self.played.iter().rev() {
            if p.seat != seat || p.turn.is_none() || p.turn != turn {
                break;
            }
            if let Some(r) = &p.revealed {
                stop = Some(r.clone());
                break;
            }
            first = Some(p.seq);
        }
        match (first, stop) {
            (Some(seq), stop) => Ok(UndoWindow {
                to: seq - 1,
                actions: self.played.iter().filter(|p| p.seq >= seq).count(),
                stop,
            }),
            (None, Some(r)) => Err(format!(
                "Undo stops here: {r}, so earlier choices this turn are final."
            )),
            (None, None) => Err("Nothing to undo this turn.".into()),
        }
    }
    fn take_fresh(&self) -> Result<Vec<NewEvent>, String> {
        let mut feed = self.feed.borrow_mut();
        if let Some(e) = feed.error.take() {
            return Err(e);
        }
        Ok(std::mem::take(&mut feed.fresh))
    }
    fn seat_of(&self, account: &str) -> Option<usize> {
        self.table
            .seats
            .iter()
            .find(|s| s.account.as_deref() == Some(account))
            .map(|s| s.seat)
    }
}

/// Builds the engine for `table`, folding `events` (empty for a new table).
fn build(
    table: Table,
    events: Vec<Event>,
    authority: Arc<dyn HiddenInfoAuthority>,
) -> Result<Live, String> {
    if table.authority != authority.name() {
        return Err(format!("This table was dealt by {}.", table.authority));
    }
    if table.rules != galactic_reach::RULES {
        return Err(format!(
            "This shared table plays {}, and shared play runs only the current rules.",
            table.rules
        ));
    }
    let head = events.last().map(|e| e.seq).unwrap_or(0);
    let (shuffles, rest): (Vec<Event>, Vec<Event>) =
        events.into_iter().partition(|e| e.kind == "shuffle");
    let feed = Rc::new(RefCell::new(Feed {
        table: table.id.clone(),
        authority,
        logged: shuffles.into(),
        fresh: vec![],
        count: 0,
        error: None,
    }));
    let source = feed.clone();
    let seats: [(String, bool); 4] = std::array::from_fn(|i| {
        let seat = &table.seats[i];
        (seat.name.clone(), seat.human())
    });
    let engine = GalacticReach::shared(&seats, move |n, purpose| {
        let mut feed = source.borrow_mut();
        feed.next(n, purpose).unwrap_or_else(|e| {
            feed.error = Some(e);
            vec![]
        })
    })?;
    let mut live = Live {
        table,
        engine,
        feed,
        head,
        agents: HashMap::new(),
        played: vec![],
    };
    // An `undo` event cancels its seat's actions after `to`. Undo never reaches
    // a shuffle, so every logged permutation is still consumed in order.
    let undone: Vec<(u64, u64)> = rest
        .iter()
        .filter(|e| e.kind == "undo")
        .filter_map(|e| Some((e.public["to"].as_u64()?, e.seq)))
        .collect();
    for event in rest.iter().filter(|e| e.kind == "action") {
        if undone
            .iter()
            .any(|(to, at)| event.seq > *to && event.seq < *at)
        {
            continue;
        }
        live.engine.extend_deadline(SHARED_STEP);
        let seat = event.seat.ok_or("A logged action has no seat.")?;
        live.engine
            .apply_action(seat, event.public["action"].clone())
            .map_err(|e| format!("Table log event {} no longer applies: {e}", event.seq))?;
        live.played
            .push(Played::from(event.seq, seat, &event.public));
    }
    if let Some(e) = live.feed.borrow_mut().error.take() {
        return Err(e);
    }
    if !live.feed.borrow().logged.is_empty() {
        return Err("The table log has shuffles the game never used.".into());
    }
    Ok(live)
}

/// The current rival for a seat's stored policy. A table keeps the policy it was
/// dealt with, but its moves are in the log, so a newer version of the same
/// profile (`gr-economy/25` to `/26`) takes over its future decisions.
fn rival(policy: &str) -> Option<Strategy> {
    Strategy::parse(policy).or_else(|| {
        [
            Strategy::Military,
            Strategy::Economy,
            Strategy::Expansion,
            Strategy::Wanderer,
        ]
        .into_iter()
        .find(|s| s.version().split('/').next() == policy.split('/').next())
    })
}

/// Finds the one legal action a seat command names. A command lists some of the
/// action's fields (for example `{type:'resource',card}` without the computed gain).
fn resolve(legal: &[Value], intent: &Value) -> Result<Value, String> {
    let fields = intent
        .as_object()
        .filter(|o| o.contains_key("type"))
        .ok_or("Each command needs a type.")?;
    let matches: Vec<&Value> = legal
        .iter()
        .filter(|a| fields.iter().all(|(k, v)| a.get(k) == Some(v)))
        .collect();
    match matches.as_slice() {
        [one] => Ok((*one).clone()),
        [] => Err("That move is not available now.".into()),
        many => many
            .iter()
            .find(|a| *a == &intent)
            .map(|a| (*a).clone())
            .ok_or_else(|| "That command matches more than one move.".into()),
    }
}

struct Tables {
    live: HashMap<String, Live>,
    /// The last reason an AI rival could not move, per table, shown to every seat.
    ai_errors: HashMap<String, String>,
    log: Arc<dyn TableLog>,
    authority: Arc<dyn HiddenInfoAuthority>,
}
impl Tables {
    fn live(&mut self, id: &str) -> Result<&mut Live, Refusal> {
        if !self.live.contains_key(id) {
            let table = self
                .log
                .table(id)
                .map_err(broken)?
                .ok_or(Refusal::NotFound)?;
            let events = self.log.read(id).map_err(broken)?;
            if table.rules != galactic_reach::RULES {
                return Err(Refusal::Conflict(format!(
                    "This shared table plays {}. Shared play runs only the current rules, so it cannot continue on this server.",
                    table.rules
                )));
            }
            let live = build(table, events, self.authority.clone()).map_err(broken)?;
            self.live.insert(id.into(), live);
        }
        let live = self.live.get_mut(id).ok_or(Refusal::NotFound)?;
        live.engine.extend_deadline(SHARED_STEP);
        Ok(live)
    }
    /// Appends what just happened; on any failure forgets the engine so the next
    /// request folds the log again from the last stored event.
    fn commit(&mut self, id: &str, mut events: Vec<NewEvent>) -> Result<u64, Refusal> {
        let outcome = (|| {
            let live = self.live.get_mut(id).ok_or(Refusal::NotFound)?;
            events.extend(live.take_fresh().map_err(broken)?);
            let finished = live.engine.scores().is_some() && live.table.status != "finished";
            let first = live.head + 1;
            let mut head = self
                .log
                .append(id, live.head, &events)
                .map_err(Refusal::Conflict)?;
            for (i, e) in events.iter().enumerate() {
                if let ("action", Some(seat)) = (e.kind, e.seat) {
                    live.played
                        .push(Played::from(first + i as u64, seat, &e.public));
                }
            }
            if finished {
                let all = self.log.read(id).map_err(broken)?;
                let reveal = self.authority.reveal(id, &all).map_err(broken)?;
                head = self.log.append(id, head, &[reveal]).map_err(broken)?;
                self.log.finish(id).map_err(broken)?;
                live.table.status = "finished".into();
            }
            live.head = head;
            Ok(head)
        })();
        if outcome.is_err() {
            self.live.remove(id);
        }
        outcome
    }
    fn open(&mut self, mut table: Table) -> Result<u64, Refusal> {
        table.authority = self.authority.name().into();
        let id = table.id.clone();
        let live = build(table.clone(), vec![], self.authority.clone()).map_err(broken)?;
        self.log.create(&table).map_err(broken)?;
        self.live.insert(id.clone(), live);
        self.commit(&id, vec![])
    }
    fn view(&mut self, id: &str, account: &str) -> Result<Value, Refusal> {
        let authority = self.authority.clone();
        let ai_error = self.ai_errors.get(id).cloned();
        let live = self.live(id)?;
        let seat = live.seat_of(account).ok_or(Refusal::NotFound)?;
        let active = live.engine.active_seat();
        let state = authority.private_view(&live.engine, seat).map_err(broken)?;
        let hints = if active == Some(seat) {
            live.engine.hints(seat).map_err(broken)?
        } else {
            json!({})
        };
        let undo = match live.undo_window(seat) {
            Ok(w) => json!({"available": true, "actions": w.actions, "stop": w.stop}),
            Err(reason) => json!({"available": false, "reason": reason}),
        };
        Ok(json!({
            "id": live.table.id, "name": live.table.name, "rules_version": live.table.rules,
            "authority": live.table.authority, "status": live.table.status, "seq": live.head,
            "seat": seat, "active": active,
            "seats": live.table.seats.iter().map(|s| json!({"seat":s.seat,"name":s.name,"human":s.human(),"you":s.seat==seat})).collect::<Vec<_>>(),
            "state": state, "hints": hints, "undo": undo,
            "ai_error": ai_error,
        }))
    }
    fn act(
        &mut self,
        id: &str,
        account: &str,
        seq: u64,
        intents: &[Value],
    ) -> Result<Value, Refusal> {
        let live = self.live(id)?;
        let seat = live.seat_of(account).ok_or(Refusal::NotFound)?;
        if live.table.status == "finished" {
            return Err(Refusal::Conflict("This game is over.".into()));
        }
        if seq != live.head {
            return Err(Refusal::Conflict(
                "The table changed. Your view has been refreshed.".into(),
            ));
        }
        if intents.is_empty() || intents.len() > 12 {
            return Err(Refusal::Bad("Send between 1 and 12 commands.".into()));
        }
        let mut events = vec![];
        let mut stopped = None;
        let mut failed = None;
        for intent in intents {
            if live.engine.active_seat() != Some(seat) {
                stopped = Some("It is not your turn.".to_string());
                break;
            }
            let action = match resolve(&live.engine.legal_actions(seat), intent) {
                Ok(a) => a,
                Err(e) => {
                    stopped = Some(e);
                    break;
                }
            };
            let before = match live.engine.undo_mark() {
                Ok(m) => m,
                Err(e) => {
                    failed = Some(e);
                    break;
                }
            };
            if let Err(e) = live.engine.apply_action(seat, action.clone()) {
                failed = Some(e);
                break;
            }
            let (after, fresh) = match (live.engine.undo_mark(), live.take_fresh()) {
                (Ok(after), Ok(fresh)) => (after, fresh),
                (Err(e), _) | (_, Err(e)) => {
                    failed = Some(e);
                    break;
                }
            };
            events.push(NewEvent {
                kind: "action",
                seat: Some(seat),
                public: json!({"action": action, "turn": before["turn"], "revealed": revealed(&before, &after, !fresh.is_empty())}),
                private: None,
            });
            events.extend(fresh);
        }
        if let Some(e) = failed {
            // A rules exception may leave a half-applied position: fold again.
            self.live.remove(id);
            return Err(broken(e));
        }
        if events.is_empty() {
            return Err(Refusal::Conflict(stopped.unwrap_or_default()));
        }
        let applied = events.iter().filter(|e| e.kind == "action").count();
        let head = self.commit(id, events)?;
        Ok(json!({"seq": head, "applied": applied, "stopped": stopped}))
    }
    /// Takes back the seat's choices this turn, as far as the last reveal. The
    /// undo is itself appended; the next fold skips the actions it cancels.
    fn undo(&mut self, id: &str, account: &str, seq: u64) -> Result<Value, Refusal> {
        let live = self.live(id)?;
        let seat = live.seat_of(account).ok_or(Refusal::NotFound)?;
        if seq != live.head {
            return Err(Refusal::Conflict(
                "The table changed. Your view has been refreshed.".into(),
            ));
        }
        let window = live.undo_window(seat).map_err(Refusal::Conflict)?;
        let event = NewEvent {
            kind: "undo",
            seat: Some(seat),
            public: json!({"to": window.to, "actions": window.actions}),
            private: None,
        };
        let appended = self.log.append(id, seq, &[event]);
        // Fold again either way: the position is now the log without those actions.
        self.live.remove(id);
        let head = appended.map_err(Refusal::Conflict)?;
        self.live(id)?;
        Ok(json!({"seq": head, "undone": window.actions, "stop": window.stop}))
    }
    /// Plays one decision for an AI seat. Returns whether an AI seat acts next.
    fn step_ai(&mut self, id: &str) -> Result<bool, Refusal> {
        let live = self.live(id)?;
        let Some(seat) = live.engine.active_seat() else {
            return Ok(false);
        };
        let Some(policy) = live.table.seats[seat].policy.clone() else {
            return Ok(false);
        };
        let strategy =
            rival(&policy).ok_or_else(|| broken(format!("Unknown AI policy {policy}.")))?;
        let agent = live.agents.entry(seat).or_insert_with(|| {
            let mut seed = [0u8; 32];
            rand::rngs::OsRng.fill_bytes(&mut seed);
            BuiltinAgent::new(strategy, seed)
        });
        let observation = live
            .engine
            .observe(seat)
            .ok_or_else(|| broken("No AI view."))?;
        let legal = live.engine.legal_actions(seat);
        let action = legal
            .get(agent.select_action(&observation, &legal))
            .cloned()
            .ok_or_else(|| broken("The AI chose an illegal action."))?;
        let before = live.engine.undo_mark().map_err(broken)?;
        let applied = live.engine.apply_action(seat, action.clone());
        if let Err(e) = applied {
            self.live.remove(id);
            return Err(broken(e));
        }
        let after = live.engine.undo_mark().map_err(broken)?;
        let shuffled = !live.feed.borrow().fresh.is_empty();
        let event = NewEvent {
            kind: "action",
            seat: Some(seat),
            public: json!({"action": action, "policy": policy, "turn": before["turn"], "revealed": revealed(&before, &after, shuffled)}),
            private: None,
        };
        self.commit(id, vec![event])?;
        let live = self.live(id)?;
        Ok(live
            .engine
            .active_seat()
            .is_some_and(|s| live.table.seats[s].policy.is_some()))
    }
    fn ai_to_move(&mut self, id: &str) -> Result<bool, Refusal> {
        let live = self.live(id)?;
        Ok(live
            .engine
            .active_seat()
            .is_some_and(|s| live.table.seats[s].policy.is_some()))
    }
    /// The full record, hidden orders included: only once the game has ended.
    fn report(&mut self, id: &str, account: &str) -> Result<Value, Refusal> {
        let live = self.live(id)?;
        live.seat_of(account).ok_or(Refusal::NotFound)?;
        if live.table.status != "finished" {
            return Err(Refusal::Conflict(
                "The game report opens when the game ends, so no seat sees hidden cards early."
                    .into(),
            ));
        }
        let standings = live.engine.scores();
        let table = live.table.clone();
        let events = self.log.read(id).map_err(broken)?;
        Ok(json!({
            "reportFormat": "galactic-reach-shared-table-report/1", "table": table, "scores": standings,
            "events": events.iter().map(|e| json!({"seq":e.seq,"kind":e.kind,"seat":e.seat,"public":e.public,"private":e.private,"hash":e.hash})).collect::<Vec<_>>(),
        }))
    }
}

type Job = Box<dyn FnOnce(&mut Tables) + Send>;

/// Owns every live engine on one thread (the QuickJS engine is not `Send`).
pub struct Service {
    jobs: Mutex<mpsc::Sender<Job>>,
    log: Arc<dyn TableLog>,
    /// `(table, seq)` after every append, for live views.
    pub changes: tokio::sync::broadcast::Sender<(String, u64)>,
    ai_pace: Duration,
    /// See [`PING_EVERY`], in milliseconds; tests shorten it.
    ping_ms: std::sync::atomic::AtomicU64,
    ai_running: Mutex<HashSet<String>>,
}
impl Service {
    pub fn start(
        log: Arc<dyn TableLog>,
        authority: Arc<dyn HiddenInfoAuthority>,
        ai_pace: Duration,
    ) -> Arc<Self> {
        let (tx, rx) = mpsc::channel::<Job>();
        let shelf = log.clone();
        std::thread::Builder::new()
            .name("galactic-reach-tables".into())
            .spawn(move || {
                let mut tables = Tables {
                    live: HashMap::new(),
                    ai_errors: HashMap::new(),
                    log,
                    authority,
                };
                for job in rx {
                    job(&mut tables);
                }
            })
            .expect("start the table service");
        Arc::new(Self {
            jobs: Mutex::new(tx),
            log: shelf,
            changes: tokio::sync::broadcast::channel(256).0,
            ai_pace,
            ping_ms: (PING_EVERY.as_millis() as u64).into(),
            ai_running: Mutex::new(HashSet::new()),
        })
    }
    pub fn ping_every(&self) -> Duration {
        Duration::from_millis(self.ping_ms.load(std::sync::atomic::Ordering::Relaxed))
    }
    #[cfg(test)]
    pub fn set_ping_every(&self, every: Duration) {
        self.ping_ms.store(
            every.as_millis() as u64,
            std::sync::atomic::Ordering::Relaxed,
        );
    }
    async fn call<R: Send + 'static>(
        &self,
        f: impl FnOnce(&mut Tables) -> Result<R, Refusal> + Send + 'static,
    ) -> Result<R, Refusal> {
        let (tx, rx) = tokio::sync::oneshot::channel();
        self.jobs
            .lock()
            .map_err(broken)?
            .send(Box::new(move |t| {
                let _ = tx.send(f(t));
            }))
            .map_err(broken)?;
        rx.await.map_err(broken)?
    }
    fn announce(&self, id: &str, seq: u64) {
        let _ = self.changes.send((id.to_string(), seq));
    }
    pub async fn open(self: &Arc<Self>, table: Table) -> Result<u64, Refusal> {
        let id = table.id.clone();
        let seq = self.call(move |t| t.open(table)).await?;
        self.announce(&id, seq);
        self.kick(&id);
        Ok(seq)
    }
    pub async fn view(self: &Arc<Self>, id: &str, account: &str) -> Result<Value, Refusal> {
        let (id, account) = (id.to_string(), account.to_string());
        self.call(move |t| t.view(&id, &account)).await
    }
    pub async fn act(
        self: &Arc<Self>,
        id: &str,
        account: &str,
        seq: u64,
        intents: Vec<Value>,
    ) -> Result<Value, Refusal> {
        let (key, account) = (id.to_string(), account.to_string());
        let result = self
            .call(move |t| t.act(&key, &account, seq, &intents))
            .await?;
        self.announce(id, result["seq"].as_u64().unwrap_or_default());
        self.kick(id);
        Ok(result)
    }
    pub async fn undo(
        self: &Arc<Self>,
        id: &str,
        account: &str,
        seq: u64,
    ) -> Result<Value, Refusal> {
        let (key, account) = (id.to_string(), account.to_string());
        let result = self.call(move |t| t.undo(&key, &account, seq)).await?;
        self.announce(id, result["seq"].as_u64().unwrap_or_default());
        Ok(result)
    }
    pub async fn report(self: &Arc<Self>, id: &str, account: &str) -> Result<Value, Refusal> {
        let (id, account) = (id.to_string(), account.to_string());
        self.call(move |t| t.report(&id, &account)).await
    }
    /// Starts the table's AI loop if an AI seat is to move and none is running.
    pub fn kick(self: &Arc<Self>, id: &str) {
        if !self
            .ai_running
            .lock()
            .map(|mut r| r.insert(id.to_string()))
            .unwrap_or(false)
        {
            return;
        }
        let service = self.clone();
        let id = id.to_string();
        tokio::spawn(async move {
            let key = id.clone();
            let mut more = service
                .call(move |t| t.ai_to_move(&key))
                .await
                .unwrap_or(false);
            while more {
                tokio::time::sleep(service.ai_pace).await;
                let key = id.clone();
                match service.call(move |t| t.step_ai(&key)).await {
                    Ok(next) => {
                        let key = id.clone();
                        let _ = service.call(move |t| Ok(t.ai_errors.remove(&key))).await;
                        let key = id.clone();
                        if let Ok(seq) = service.call(move |t| Ok(t.live(&key)?.head)).await {
                            service.announce(&id, seq);
                        }
                        more = next;
                    }
                    Err(e) => {
                        tracing::error!(table=%id, error=?e, "AI rival could not move");
                        let (key, reason) = (
                            id.clone(),
                            match e {
                                Refusal::Internal(m) | Refusal::Conflict(m) | Refusal::Bad(m) => m,
                                Refusal::NotFound => "The table is missing.".into(),
                            },
                        );
                        let _ = service
                            .call(move |t| {
                                t.ai_errors
                                    .insert(key, format!("An AI rival could not move: {reason}"));
                                Ok(())
                            })
                            .await;
                        service.announce(&id, 0);
                        more = false;
                    }
                }
            }
            if let Ok(mut running) = service.ai_running.lock() {
                running.remove(&id);
            }
        });
    }
}

pub fn url(id: &str) -> String {
    format!("/galactic-reach/?shared={id}")
}
/// Whether the waiting room `id` became a shared table, and its status.
pub fn status(db: &Connection, id: &str) -> ApiResult<Option<String>> {
    use rusqlite::OptionalExtension;
    db.query_row(
        "SELECT status FROM gr_shared_tables WHERE id=?",
        [id],
        |r| r.get(0),
    )
    .optional()
    .map_err(internal)
}

/// Seats a waiting room's people in join order, then the host's AI rivals.
pub fn seats(humans: &[(String, String)]) -> Vec<Seat> {
    const RIVALS: [(&str, Strategy); 4] = [
        ("Cyan Concord", Strategy::Military),
        ("Ember Directorate", Strategy::Military),
        ("Violet Assembly", Strategy::Economy),
        ("Helios Compact", Strategy::Expansion),
    ];
    (0..4)
        .map(|seat| match humans.get(seat) {
            Some((account, name)) => Seat {
                seat,
                account: Some(account.clone()),
                name: name.clone(),
                policy: None,
            },
            None => Seat {
                seat,
                account: None,
                name: RIVALS[seat].0.into(),
                policy: Some(RIVALS[seat].1.version().into()),
            },
        })
        .collect()
}

/// Shared tables where the signed-in account holds a seat.
pub async fn list(State(app): State<App>, headers: HeaderMap) -> ApiResult<Json<Value>> {
    let u = user(&app, &headers)?;
    let tables = app.shared.log.tables_for(&u.id).map_err(internal)?;
    Ok(Json(json!(tables.iter().map(|t| json!({
        "id": t.id, "name": t.name, "rules_version": t.rules, "status": t.status, "url": url(&t.id),
        "seats": t.seats.iter().map(|s| json!({"seat":s.seat,"name":s.name,"human":s.human(),"you":s.account.as_deref()==Some(&u.id)})).collect::<Vec<_>>(),
    })).collect::<Vec<_>>())))
}

pub async fn view(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    let u = user(&app, &headers)?;
    let view = app.shared.view(&id, &u.id).await?;
    app.shared.kick(&id);
    Ok(Json(view))
}

#[derive(Deserialize)]
pub struct Act {
    seq: u64,
    actions: Vec<Value>,
}
pub async fn act(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<Act>,
) -> ApiResult<Json<Value>> {
    let u = user(&app, &headers)?;
    let result = app.shared.act(&id, &u.id, input.seq, input.actions).await;
    let view = app.shared.view(&id, &u.id).await?;
    let mut result = result?;
    result["view"] = view;
    Ok(Json(result))
}

#[derive(Deserialize)]
pub struct Undo {
    seq: u64,
}
/// Undo the signed-in seat's choices this turn, back to its last reveal.
pub async fn undo(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<Undo>,
) -> ApiResult<Json<Value>> {
    let u = user(&app, &headers)?;
    let mut result = app.shared.undo(&id, &u.id, input.seq).await?;
    result["view"] = app.shared.view(&id, &u.id).await?;
    Ok(Json(result))
}

pub async fn report(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    let u = user(&app, &headers)?;
    Ok(Json(app.shared.report(&id, &u.id).await?))
}

/// How often an otherwise quiet stream sends a `ping` carrying the table's
/// latest sequence number. A proxy (tailscale serve) can keep a browser's stream
/// open after the server behind it restarted, delivering nothing and raising no
/// error; the ping lets the page notice silence and missed changes and resync.
pub const PING_EVERY: Duration = Duration::from_secs(10);

/// Server-sent events: the seat's private view now, then after every change,
/// with a `ping {seq}` whenever the stream is otherwise quiet.
pub async fn stream(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<impl IntoResponse> {
    let u = user(&app, &headers)?;
    // Subscribe before reading the first view, so no change can fall in between.
    let changes = app.shared.changes.subscribe();
    let first = app.shared.view(&id, &u.id).await?;
    app.shared.kick(&id);
    let seq = first["seq"].as_u64().unwrap_or_default();
    let ping = app.shared.ping_every();
    let state = (Some(first), changes, app, id, u.id, seq);
    let events = futures_util::stream::unfold(
        state,
        move |(first, mut changes, app, id, account, mut seq)| async move {
            use tokio::sync::broadcast::error::RecvError;
            if let Some(view) = first {
                let event = SseEvent::default().event("view").data(view.to_string());
                return Some((
                    Ok::<_, std::convert::Infallible>(event),
                    (None, changes, app, id, account, seq),
                ));
            }
            let changed = loop {
                match tokio::time::timeout(ping, changes.recv()).await {
                    Ok(Ok((table, at))) if table == id => {
                        seq = seq.max(at);
                        break true;
                    }
                    Ok(Ok(_)) => continue,
                    // Missed messages: refresh rather than risk a stale view.
                    Ok(Err(RecvError::Lagged(_))) => break true,
                    Ok(Err(RecvError::Closed)) => return None,
                    Err(_) => break false,
                }
            };
            let event = if changed {
                // Coalesce a burst of changes into one refresh.
                while let Ok((table, at)) = changes.try_recv() {
                    if table == id {
                        seq = seq.max(at);
                    }
                }
                let view = app.shared.view(&id, &account).await.ok()?;
                seq = view["seq"].as_u64().unwrap_or(seq);
                SseEvent::default().event("view").data(view.to_string())
            } else {
                SseEvent::default()
                    .event("ping")
                    .data(json!({"seq": seq}).to_string())
            };
            Some((Ok(event), (None, changes, app, id, account, seq)))
        },
    );
    let mut response = Sse::new(events)
        .keep_alive(KeepAlive::default())
        .into_response();
    response
        .headers_mut()
        .insert("x-accel-buffering", "no".parse().unwrap());
    Ok(response)
}

#[cfg(test)]
mod tests;
