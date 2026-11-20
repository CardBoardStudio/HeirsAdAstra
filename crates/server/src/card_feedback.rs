//! Galactic Reach card feedback for the 31.36 Capacity Cards experiment. The card
//! gallery posts a like, dislike or neutral vote and a short note per stable card id
//! (Nxx normal, Mxx military, Rxx relic). The host appends each entry as one JSON line
//! to the file named by `CARD_FEEDBACK_PATH`. Without that variable the endpoint is
//! disabled, so public previews store nothing and the gallery keeps feedback in the
//! browser instead.
use crate::*;
use std::io::Write;
use std::path::{Path as FilePath, PathBuf};
use std::sync::Mutex;

/// Serializes appends so concurrent submissions never interleave within a line.
static WRITE: Mutex<()> = Mutex::new(());
const VOTES: [&str; 3] = ["like", "dislike", "neutral"];
const NOTE_LIMIT: usize = 1000;

#[derive(Deserialize)]
pub struct Feedback {
    card: String,
    vote: String,
    #[serde(default)]
    note: String,
    #[serde(default)]
    game: String,
}

fn storage_path() -> Option<PathBuf> {
    std::env::var_os("CARD_FEEDBACK_PATH")
        .filter(|path| !path.is_empty())
        .map(PathBuf::from)
}

/// Checks a submission and returns the stored fields.
fn validate(input: &Feedback) -> ApiResult<serde_json::Value> {
    let card = input.card.as_bytes();
    if card.len() != 3
        || !matches!(card[0], b'N' | b'M' | b'R')
        || !card[1..].iter().all(u8::is_ascii_digit)
    {
        return Err(bad("Use a card id such as N01, M10 or R01."));
    }
    if !VOTES.contains(&input.vote.as_str()) {
        return Err(bad("Choose like, dislike or neutral."));
    }
    let note = input.note.trim();
    if note.chars().count() > NOTE_LIMIT || note.chars().any(|c| c.is_control() && c != '\n') {
        return Err(bad(format!(
            "Keep the note under {NOTE_LIMIT} printable characters."
        )));
    }
    let game = input.game.trim();
    if game.chars().count() > 80 || game.chars().any(char::is_control) {
        return Err(bad("Keep the game label under 80 characters."));
    }
    Ok(json!({"card":input.card,"vote":input.vote,"note":note,"game":game}))
}

fn append(path: &FilePath, entry: &serde_json::Value) -> std::io::Result<()> {
    let _guard = WRITE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)?;
    writeln!(file, "{entry}")
}

/// Whether this host stores feedback, so the gallery can say where a vote goes.
pub async fn status() -> Json<serde_json::Value> {
    Json(json!({"enabled":storage_path().is_some(),"rules_version":galactic_reach::RULES}))
}

pub async fn submit(
    State(app): State<App>,
    headers: HeaderMap,
    Json(input): Json<Feedback>,
) -> ApiResult<Json<serde_json::Value>> {
    let path = storage_path().ok_or(ApiError(
        StatusCode::NOT_FOUND,
        "Card feedback storage is not enabled on this host.".into(),
    ))?;
    let mut entry = validate(&input)?;
    entry["at"] = json!(now());
    entry["rules_version"] = json!(galactic_reach::RULES);
    if let Ok(player) = user(&app, &headers) {
        entry["player"] = json!(player.name);
    }
    append(&path, &entry).map_err(internal)?;
    Ok(Json(json!({"saved":true})))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn feedback(card: &str, vote: &str, note: &str) -> Feedback {
        Feedback {
            card: card.into(),
            vote: vote.into(),
            note: note.into(),
            game: "solo vs 3 AI".into(),
        }
    }

    #[test]
    fn accepts_card_ids_votes_and_short_notes() {
        let entry = validate(&feedback("N26", "like", "  Worth the climb.  ")).unwrap();
        assert_eq!(entry["card"], "N26");
        assert_eq!(entry["note"], "Worth the climb.");
        assert!(validate(&feedback("M10", "neutral", "")).is_ok());
        for card in ["R01", "R15"] {
            let entry = validate(&feedback(card, "like", "A useful relic.")).unwrap();
            assert_eq!(entry["card"], card);
        }
        for (card, vote, note) in [
            ("X01", "like", ""),
            ("N1", "like", ""),
            ("N001", "like", ""),
            ("R1", "like", ""),
            ("R001", "like", ""),
            ("N01", "love", ""),
            ("N01", "like", "bell\u{7}"),
        ] {
            assert!(
                validate(&feedback(card, vote, note)).is_err(),
                "{card} {vote}"
            );
        }
        assert!(validate(&feedback("N01", "dislike", &"x".repeat(NOTE_LIMIT + 1))).is_err());
    }

    #[test]
    fn appends_one_json_line_per_entry() {
        let dir = std::env::temp_dir().join(format!("card-feedback-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("feedback.jsonl");
        append(&path, &json!({"card":"N01","vote":"like"})).unwrap();
        append(&path, &json!({"card":"M02","note":"two\nlines"})).unwrap();
        append(
            &path,
            &json!({"card":"R15","vote":"dislike","note":"relic feedback"}),
        )
        .unwrap();
        let text = std::fs::read_to_string(&path).unwrap();
        let lines: Vec<serde_json::Value> = text
            .lines()
            .map(|line| serde_json::from_str(line).unwrap())
            .collect();
        assert_eq!(lines.len(), 3);
        assert_eq!(lines[1]["note"], "two\nlines");
        assert_eq!(lines[2]["card"], "R15");
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
