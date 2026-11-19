//! Release channels (docs/release.md). A stable server deals the released
//! rules (`galactic_reach::RULES`). A dev server runs `main` and deals
//! `<RULES>+dev.<n>`, where `n` counts the rules-changing entries waiting in
//! `changes/`: a merge that changes rules starts a new dev revision, and a
//! save-compatible merge keeps it.
//!
//! A dev server keeps the engine sources of every dev revision it has dealt
//! (`gr_rule_builds`), so a table in progress keeps the engine it was dealt with
//! after a rules-changing merge deploys. A save-compatible merge keeps the
//! revision, so its tables resume from their snapshots on the new engine and its
//! browsers get the new interface at once. A kept revision is pruned once no
//! unfinished shared or private (server-saved) table plays it and it has not been
//! current for [`KEEP_FOR`] (time for guest games in browsers, which the server
//! cannot see). A private table's dev revision is the `devRules` its save was
//! dealt with; `solo_tables.rules_version` names only the released rules.
use galactic_reach::{ADAPTER_SOURCE, APP_SOURCE, Sources};
use rusqlite::{Connection, OptionalExtension, params};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::store::Store;

/// How long a superseded dev revision stays playable without a server table.
pub const KEEP_FOR: u64 = 14 * 24 * 60 * 60;

/// Engine sources kept for one dev revision.
pub struct Kept {
    pub app: String,
    pub adapter: String,
    pub commit: String,
}
impl Kept {
    pub fn sources(&self) -> Sources<'_> {
        Sources {
            app: &self.app,
            adapter: &self.adapter,
        }
    }
}

/// Where a table's engine comes from.
pub enum Engine {
    /// Compiled into this server: the released rules or an archived revision.
    Builtin,
    /// A dev revision's kept sources (the current one included).
    Kept(Arc<Kept>),
}

pub struct Channel {
    /// `stable` or `dev`.
    pub name: &'static str,
    /// The rules new tables are dealt with.
    pub rules: String,
    /// The deployed commit, shown beside a dev revision.
    pub commit: String,
    store: Option<Arc<Store>>,
    kept: Mutex<HashMap<String, Arc<Kept>>>,
}
impl Channel {
    /// Released rules only, as before the dev channel existed.
    pub fn stable() -> Self {
        Self {
            name: "stable",
            rules: galactic_reach::RULES.into(),
            commit: String::new(),
            store: None,
            kept: Mutex::default(),
        }
    }
    /// A dev server dealing `rules` (normally `galactic_reach::dev_rules()`) and
    /// keeping engines in `store`.
    pub fn dev(store: Arc<Store>, rules: String, commit: String) -> Self {
        Self {
            name: "dev",
            rules,
            commit,
            store: Some(store),
            kept: Mutex::default(),
        }
    }
    /// `GALACTIC_REACH_CHANNEL=dev` selects the dev channel. The deployed commit
    /// comes from `GIT_COMMIT` (deploy/dev-host) or Render's `RENDER_GIT_COMMIT`.
    pub fn from_env(store: &Arc<Store>, get: impl Fn(&str) -> Option<String>) -> Self {
        if get("GALACTIC_REACH_CHANNEL").as_deref() != Some("dev") {
            return Self::stable();
        }
        let commit = get("GIT_COMMIT")
            .or_else(|| get("RENDER_GIT_COMMIT"))
            .map(|c| c.chars().take(7).collect())
            .unwrap_or_else(|| "local".into());
        Self::dev(store.clone(), galactic_reach::dev_rules(), commit)
    }
    pub fn is_dev(&self) -> bool {
        self.store.is_some()
    }
    /// Records this build as the current engine of its dev revision, then prunes
    /// revisions nothing needs. Run once at startup.
    pub fn keep_current(&self, now: u64) -> rusqlite::Result<usize> {
        self.keep_current_as(APP_SOURCE, ADAPTER_SOURCE, now)
    }
    /// [`Self::keep_current`] with explicit sources (tests stand in for a build).
    pub fn keep_current_as(&self, app: &str, adapter: &str, now: u64) -> rusqlite::Result<usize> {
        let Some(store) = &self.store else {
            return Ok(0);
        };
        let db = store.0.lock().map_err(|_| rusqlite::Error::InvalidQuery)?;
        db.execute(
            "INSERT INTO gr_rule_builds(rules,app,adapter,commit_id,current_at) VALUES(?1,?2,?3,?4,?5)
             ON CONFLICT(rules) DO UPDATE SET app=?2,adapter=?3,commit_id=?4,current_at=?5",
            params![self.rules, app, adapter, self.commit, now],
        )?;
        // An unfinished private table names its dev revision only inside its save; a
        // malformed save names none rather than failing startup.
        db.execute(
            "DELETE FROM gr_rule_builds WHERE rules<>?1 AND current_at<?2
             AND rules NOT IN (SELECT rules FROM gr_shared_tables WHERE status<>'finished')
             AND rules NOT IN (SELECT dealt FROM (
                 SELECT CASE WHEN json_valid(state) THEN json_extract(state,'$.state.devRules') END AS dealt,
                        CASE WHEN json_valid(state) THEN json_extract(state,'$.state.winner') END AS winner
                 FROM solo_tables WHERE state IS NOT NULL)
               WHERE dealt IS NOT NULL AND winner IS NULL)",
            params![self.rules, now.saturating_sub(KEEP_FOR)],
        )
    }
    /// The engine for a table dealt with `rules`, if this server can run it.
    pub fn engine(&self, rules: &str) -> Option<Engine> {
        if self.is_dev() && is_dev_rules(rules) {
            let kept = self.kept(rules).or_else(|| {
                // Not recorded yet (keep_current runs at startup): this build is it.
                (rules == self.rules).then(|| {
                    Arc::new(Kept {
                        app: APP_SOURCE.into(),
                        adapter: ADAPTER_SOURCE.into(),
                        commit: self.commit.clone(),
                    })
                })
            });
            return kept.map(Engine::Kept);
        }
        galactic_reach::shared_rules(rules).map(|_| Engine::Builtin)
    }
    /// A kept dev revision's sources, cached after the first read.
    pub fn kept(&self, rules: &str) -> Option<Arc<Kept>> {
        let store = self.store.as_ref()?;
        let mut cache = self.kept.lock().ok()?;
        if let Some(kept) = cache.get(rules) {
            return Some(kept.clone());
        }
        let row = {
            let db = store.0.lock().ok()?;
            db.query_row(
                "SELECT app,adapter,commit_id FROM gr_rule_builds WHERE rules=?",
                [rules],
                |r| {
                    Ok(Kept {
                        app: r.get(0)?,
                        adapter: r.get(1)?,
                        commit: r.get(2)?,
                    })
                },
            )
            .optional()
            .ok()??
        };
        let kept = Arc::new(row);
        cache.insert(rules.into(), kept.clone());
        Some(kept)
    }
    /// The browser that plays a table's rules: the current game, a kept dev
    /// revision (its engine with the current interface), or an archived copy.
    pub fn client_path(&self, rules: &str) -> String {
        let version = rules.rsplit('/').next().unwrap_or(rules);
        if rules == self.rules {
            "/galactic-reach/".into()
        } else if is_dev_rules(rules) {
            format!("/galactic-reach/dev/{version}/")
        } else {
            format!("/galactic-reach/rules/{version}/")
        }
    }
    /// `channel.js`: tells the browser which rules it plays, so a dev page keeps
    /// its own save keys and a shared table opens the matching client.
    pub fn script(&self, rules: &str, commit: &str) -> String {
        let label = match self.name {
            "dev" => format!(
                "dev · {} · {commit}",
                rules.rsplit('/').next().unwrap_or(rules)
            ),
            _ => String::new(),
        };
        format!(
            "globalThis.galacticReachChannel={};\n",
            serde_json::json!({"channel": self.name, "rules": rules, "commit": commit, "label": label})
        )
    }
}

/// Dev revisions carry `+dev.`; released and archived revisions never do.
pub fn is_dev_rules(rules: &str) -> bool {
    rules.contains("+dev.")
}

pub fn migrate(db: &Connection) -> rusqlite::Result<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS gr_rule_builds(
            rules TEXT PRIMARY KEY, app TEXT NOT NULL, adapter TEXT NOT NULL,
            commit_id TEXT NOT NULL, current_at INTEGER NOT NULL)",
    )
}
