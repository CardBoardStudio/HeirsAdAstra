//! Browser routes for release channels (channel.rs, docs/release.md#dev-channel).
//!
//! `/galactic-reach/channel.js` names the rules the current page plays. On a dev
//! server, `/galactic-reach/dev/<revision>/` opens a kept dev revision: its own
//! engine (`app.js`, `adapter.js`, `channel.js`) with the current interface
//! (every other file redirects to the current `/galactic-reach/` copy), so an
//! interface-only merge reaches tables still playing an older dev revision.
use super::channel;
use crate::*;
use axum::extract::Path;
use axum::response::Redirect;

const JS: &str = "text/javascript; charset=utf-8";

fn script(body: String) -> Response {
    (
        [
            (header::CONTENT_TYPE, JS),
            (header::CACHE_CONTROL, "no-cache"),
        ],
        body,
    )
        .into_response()
}

pub async fn channel_script(State(app): State<App>) -> Response {
    let channel = &app.shared.channel;
    script(channel.script(&channel.rules, &channel.commit))
}

/// An archived release's page names its own rules: never a dev revision.
pub async fn archived_script(Path(version): Path<String>) -> Response {
    script(format!(
        "globalThis.galacticReachChannel={};\n",
        serde_json::json!({"channel": "archived", "rules": format!("galactic-reach/{version}")})
    ))
}

/// The kept engine for `/galactic-reach/dev/<version>/`, on a dev server only.
fn kept(app: &App, version: &str) -> Result<(String, Arc<channel::Kept>), ApiError> {
    let rules = format!("galactic-reach/{version}");
    let missing = || {
        ApiError(
            StatusCode::NOT_FOUND,
            "No dev build of these rules is kept here.".into(),
        )
    };
    if !channel::is_dev_rules(&rules) {
        return Err(missing());
    }
    let kept = app.shared.channel.kept(&rules).ok_or_else(missing)?;
    Ok((rules, kept))
}

pub async fn page(
    State(app): State<App>,
    Path(version): Path<String>,
) -> Result<Response, ApiError> {
    kept(&app, &version)?;
    let html = tokio::fs::read_to_string("dist/galactic-reach/index.html")
        .await
        .map_err(|_| ApiError(StatusCode::NOT_FOUND, "The game page is not built.".into()))?;
    Ok((
        [
            (header::CONTENT_TYPE, "text/html; charset=utf-8"),
            (header::CACHE_CONTROL, "no-cache"),
        ],
        html,
    )
        .into_response())
}

pub async fn asset(
    State(app): State<App>,
    Path((version, file)): Path<(String, String)>,
) -> Result<Response, ApiError> {
    let (rules, kept) = kept(&app, &version)?;
    Ok(match file.as_str() {
        "" | "index.html" => return page(State(app), Path(version)).await,
        "app.js" => script(kept.app.clone()),
        "adapter.js" => script(kept.adapter.clone()),
        "channel.js" => script(app.shared.channel.script(&rules, &kept.commit)),
        other if other.split('/').any(|part| part == ".." || part.is_empty()) => {
            return Err(ApiError(StatusCode::NOT_FOUND, "Not found.".into()));
        }
        other => Redirect::temporary(&format!("/galactic-reach/{other}")).into_response(),
    })
}
