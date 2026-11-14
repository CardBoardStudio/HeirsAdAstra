//! Galactic Reach waiting room. A host's table gets a private invite link, seats
//! fill as signed-in friends join, and the host chooses the number of AI rivals
//! and their difficulty before Start.
//!
//! The current browser engine seats exactly one human against three standard
//! rivals. Start therefore opens the table only for that configuration; other
//! choices are kept with the table and Start explains what is still missing.
use crate::*;
use axum::extract::Query;
use rusqlite::{Connection, OptionalExtension, params};

const SEATS: u32 = 4;
/// Difficulty choices, named after the existing Galactic Reach AI policies.
pub const DIFFICULTIES: [(&str, &str, &str); 2] = [
    (
        "standard",
        "Standard",
        "Vanguard, Architect and Pathfinder, the rivals in today's browser game.",
    ),
    (
        "easy",
        "Easy",
        "Wanderer: seeded random legal play, from the AI arena.",
    ),
];

pub fn migrate(db: &Connection) -> rusqlite::Result<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS gr_lobbies(
        table_id TEXT PRIMARY KEY REFERENCES solo_tables(id) ON DELETE CASCADE,
        invite TEXT NOT NULL UNIQUE, ai_rivals INTEGER NOT NULL DEFAULT 3,
        difficulty TEXT NOT NULL DEFAULT 'standard', status TEXT NOT NULL DEFAULT 'waiting',
        created INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS gr_lobby_seats(
        table_id TEXT NOT NULL REFERENCES gr_lobbies(table_id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES accounts(id), joined INTEGER NOT NULL,
        PRIMARY KEY(table_id,user_id));",
    )
}

/// Opens a waiting room for a freshly created table and returns its invite token.
pub fn open(db: &Connection, table_id: &str) -> ApiResult<String> {
    let invite =
        uuid::Uuid::new_v4().simple().to_string() + &uuid::Uuid::new_v4().simple().to_string();
    db.execute(
        "INSERT INTO gr_lobbies(table_id,invite,created) VALUES(?,?,?)",
        params![table_id, invite, now()],
    )
    .map_err(internal)?;
    Ok(invite)
}

pub fn url(id: &str) -> String {
    format!("/?game=galactic-reach#lobby/{id}")
}

/// The waiting-room status of a table, if it was created with one.
pub fn status(db: &Connection, table_id: &str) -> ApiResult<Option<String>> {
    db.query_row(
        "SELECT status FROM gr_lobbies WHERE table_id=?",
        [table_id],
        |r| r.get(0),
    )
    .optional()
    .map_err(internal)
}

/// Waiting rooms this account joined as a guest, for the table shelf.
pub fn joined(db: &Connection, user_id: &str) -> ApiResult<Vec<serde_json::Value>> {
    let mut query = db
        .prepare(
            "SELECT t.id,t.name,l.status,(SELECT count(*) FROM gr_lobby_seats s2 WHERE s2.table_id=t.id)
             FROM gr_lobby_seats s JOIN gr_lobbies l USING(table_id) JOIN solo_tables t ON t.id=s.table_id
             WHERE s.user_id=? ORDER BY s.joined DESC",
        )
        .map_err(internal)?;
    let rows = query
        .query_map([user_id], |r| {
            Ok(json!({"id":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?,"game":"galactic-reach",
                "rules_version":galactic_reach::RULES,"status":r.get::<_,String>(2)?,
                "players":1+r.get::<_,u32>(3)?,"round":1,"guest":true,"url":url(&r.get::<_,String>(0)?)}))
        })
        .map_err(internal)?;
    rows.collect::<Result<_, _>>().map_err(internal)
}

struct Lobby {
    name: String,
    owner: (String, String),
    invite: String,
    ai_rivals: u32,
    difficulty: String,
    status: String,
    guests: Vec<(String, String)>,
}
impl Lobby {
    fn humans(&self) -> u32 {
        1 + self.guests.len() as u32
    }
    fn member(&self, id: &str) -> bool {
        self.owner.0 == id || self.guests.iter().any(|g| g.0 == id)
    }
    /// Why Start cannot open this configuration yet, if it cannot.
    fn blocked(&self) -> Option<&'static str> {
        if !self.guests.is_empty() {
            Some(
                "Galactic Reach seats one human per game today. Friends can wait here, but a shared game needs the multiplayer table service, which is not built yet.",
            )
        } else if self.ai_rivals != 3 {
            Some(
                "The current rules always seat three rivals. Fewer rivals needs a rules change, which is not made yet.",
            )
        } else if self.difficulty != "standard" {
            Some("Easy rivals (Wanderer) play in the AI arena but not yet in the browser game.")
        } else {
            None
        }
    }
}

fn load(db: &Connection, id: &str) -> ApiResult<Lobby> {
    let found = db
        .query_row(
            "SELECT t.name,t.owner_id,a.name,l.invite,l.ai_rivals,l.difficulty,l.status
             FROM gr_lobbies l JOIN solo_tables t ON t.id=l.table_id JOIN accounts a ON a.id=t.owner_id
             WHERE l.table_id=?",
            [id],
            |r| {
                Ok(Lobby {
                    name: r.get(0)?,
                    owner: (r.get(1)?, r.get(2)?),
                    invite: r.get(3)?,
                    ai_rivals: r.get(4)?,
                    difficulty: r.get(5)?,
                    status: r.get(6)?,
                    guests: vec![],
                })
            },
        )
        .optional()
        .map_err(internal)?;
    let mut lobby = found.ok_or(ApiError(
        StatusCode::NOT_FOUND,
        "This waiting room does not exist.".into(),
    ))?;
    let mut query = db
        .prepare("SELECT a.id,a.name FROM gr_lobby_seats s JOIN accounts a ON a.id=s.user_id WHERE s.table_id=? ORDER BY s.joined,a.id")
        .map_err(internal)?;
    lobby.guests = query
        .query_map([id], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(internal)?
        .collect::<Result<_, _>>()
        .map_err(internal)?;
    Ok(lobby)
}

fn view(app: &App, id: &str, lobby: &Lobby, me: &str) -> serde_json::Value {
    let host = lobby.owner.0 == me;
    let mut seats = vec![json!({"kind":"host","name":lobby.owner.1,"you":host})];
    seats.extend(
        lobby
            .guests
            .iter()
            .map(|(gid, name)| json!({"kind":"friend","name":name,"you":gid==me})),
    );
    let open = SEATS - lobby.humans() - lobby.ai_rivals;
    seats.extend((0..lobby.ai_rivals).map(|_| json!({"kind":"ai","difficulty":lobby.difficulty})));
    seats.extend((0..open).map(|_| json!({"kind":"open"})));
    json!({
        "id":id,"name":lobby.name,"status":lobby.status,"host":host,"member":lobby.member(me),
        "rules_version":galactic_reach::RULES,"ai_rivals":lobby.ai_rivals,"difficulty":lobby.difficulty,
        "max_ai_rivals":SEATS-lobby.humans(),"min_ai_rivals":u32::from(lobby.humans()==1),
        "difficulties":DIFFICULTIES.iter().map(|(id,name,about)|json!({"id":id,"name":name,"description":about})).collect::<Vec<_>>(),
        "seats":seats,"blocked":lobby.blocked(),
        "invite_url":host.then(|| format!("{}/?game=galactic-reach#lobby/{id}/{}", app.origin, lobby.invite)),
        "table_url":(lobby.status=="started").then(|| format!("/galactic-reach/?table={id}")),
    })
}

#[derive(Deserialize, Default)]
pub struct Invite {
    #[serde(default)]
    invite: Option<String>,
}
fn valid_id(id: &str) -> ApiResult<()> {
    if id.len() == 32 && id.bytes().all(|b| b.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err(bad("Invalid table link."))
    }
}
fn invited(lobby: &Lobby, invite: Option<&str>) -> bool {
    invite.is_some_and(|t| t.len() == lobby.invite.len() && t == lobby.invite)
}

/// Members see the room; anyone holding the invite link may preview it before joining.
pub async fn get(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(q): Query<Invite>,
) -> ApiResult<Json<serde_json::Value>> {
    valid_id(&id)?;
    let u = user(&app, &headers)?;
    let db = app.store.0.lock().map_err(internal)?;
    let lobby = load(&db, &id)?;
    if !lobby.member(&u.id) && !invited(&lobby, q.invite.as_deref()) {
        return Err(ApiError(
            StatusCode::NOT_FOUND,
            "This waiting room does not exist.".into(),
        ));
    }
    Ok(Json(view(&app, &id, &lobby, &u.id)))
}

pub async fn join(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<Invite>,
) -> ApiResult<Json<serde_json::Value>> {
    valid_id(&id)?;
    let u = user(&app, &headers)?;
    let db = app.store.0.lock().map_err(internal)?;
    let lobby = load(&db, &id)?;
    if !invited(&lobby, input.invite.as_deref()) && !lobby.member(&u.id) {
        return Err(ApiError(
            StatusCode::NOT_FOUND,
            "This waiting room does not exist.".into(),
        ));
    }
    if !lobby.member(&u.id) {
        if lobby.status != "waiting" {
            return Err(bad("This game has already started."));
        }
        if lobby.humans() >= SEATS {
            return Err(bad("Every seat at this table is taken."));
        }
        db.execute(
            "INSERT INTO gr_lobby_seats(table_id,user_id,joined) VALUES(?,?,?)",
            params![id, u.id, now()],
        )
        .map_err(internal)?;
        // A friend takes an AI seat when the table is full.
        db.execute(
            "UPDATE gr_lobbies SET ai_rivals=min(ai_rivals,?) WHERE table_id=?",
            params![SEATS - lobby.humans() - 1, id],
        )
        .map_err(internal)?;
    }
    Ok(Json(view(&app, &id, &load(&db, &id)?, &u.id)))
}

pub async fn leave(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    valid_id(&id)?;
    let u = user(&app, &headers)?;
    let db = app.store.0.lock().map_err(internal)?;
    db.execute(
        "DELETE FROM gr_lobby_seats WHERE table_id=? AND user_id=?",
        params![id, u.id],
    )
    .map_err(internal)?;
    Ok(Json(json!({"left":true})))
}

#[derive(Deserialize)]
pub struct Settings {
    ai_rivals: u32,
    difficulty: String,
}
fn host_lobby(db: &Connection, id: &str, me: &str) -> ApiResult<Lobby> {
    valid_id(id)?;
    let lobby = load(db, id)?;
    if lobby.owner.0 != me {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "Only the host can change this table.".into(),
        ));
    }
    if lobby.status != "waiting" {
        return Err(bad("This game has already started."));
    }
    Ok(lobby)
}

pub async fn settings(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<Settings>,
) -> ApiResult<Json<serde_json::Value>> {
    let u = user(&app, &headers)?;
    let db = app.store.0.lock().map_err(internal)?;
    let lobby = host_lobby(&db, &id, &u.id)?;
    let max = SEATS - lobby.humans();
    let min = u32::from(lobby.humans() == 1);
    if input.ai_rivals < min || input.ai_rivals > max {
        return Err(bad(format!(
            "Choose between {min} and {max} AI rivals for this table."
        )));
    }
    if !DIFFICULTIES.iter().any(|d| d.0 == input.difficulty) {
        return Err(bad("Choose a listed difficulty."));
    }
    db.execute(
        "UPDATE gr_lobbies SET ai_rivals=?,difficulty=? WHERE table_id=?",
        params![input.ai_rivals, input.difficulty, id],
    )
    .map_err(internal)?;
    Ok(Json(view(&app, &id, &load(&db, &id)?, &u.id)))
}

pub async fn start(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let u = user(&app, &headers)?;
    let db = app.store.0.lock().map_err(internal)?;
    let lobby = host_lobby(&db, &id, &u.id)?;
    if let Some(reason) = lobby.blocked() {
        return Err(ApiError(StatusCode::CONFLICT, reason.into()));
    }
    db.execute(
        "UPDATE gr_lobbies SET status='started' WHERE table_id=?",
        [&id],
    )
    .map_err(internal)?;
    Ok(Json(view(&app, &id, &load(&db, &id)?, &u.id)))
}

#[cfg(test)]
mod tests {
    #[test]
    fn rulebook_masthead_names_the_current_rules() {
        let book = include_str!("../../../prototypes/galactic-reach/rulebook.html");
        let version = galactic_reach::RULES.rsplit('/').next().unwrap();
        assert!(book.contains(&format!(
            "{} · {version}",
            galactic_reach::EXPERIMENT.to_uppercase()
        )));
    }
}
