//! Invite-only hosting (docs/invite-only.md). With `ACCESS=invite-only`, only a
//! signed-in Nido account that is an administrator, or that claimed an
//! invitation an administrator has not revoked, gets past the landing page and
//! the sign-in and claim flow. Access is decided on every request.
use crate::*;
use axum::http::HeaderName;
use rusqlite::OptionalExtension;
use std::{collections::HashMap, sync::Mutex};

#[derive(Default)]
pub struct Policy {
    pub invite_only: bool,
    client_ip_header: Option<HeaderName>,
    /// Per-client sign-in attempts in the current minute.
    attempts: Mutex<(u64, HashMap<String, u32>)>,
}
impl Policy {
    pub fn new(invite_only: bool, client_ip_header: Option<HeaderName>) -> Self {
        Self {
            invite_only,
            client_ip_header,
            ..Self::default()
        }
    }
}

/// What a visitor can reach without membership: the landing page and the code
/// it loads, health, the Nido sign-in flow, sign-out, and invitation claim.
const PUBLIC: &[&str] = &[
    "/",
    "/index.html",
    "/lab/lab.css",
    "/lab/lab.js",
    "/lab/replay.js",
    "/lab/heirs-emblem.svg",
    "/lab/heirs-emblem-round.svg",
    "/lab/heirs-emblem-mark.svg",
    "/api/health",
    "/api/session",
    "/api/auth/nido",
    "/api/auth/nido/callback",
    "/api/auth/logout",
    "/api/invites/inspect",
    "/api/invites/accept",
];
pub fn is_public(path: &str) -> bool {
    PUBLIC.contains(&path)
}

/// Sign-in and claim endpoints, limited per client as well as globally.
const SIGN_IN: &[&str] = &[
    "/api/auth/nido",
    "/api/auth/nido/callback",
    "/api/invites/inspect",
    "/api/invites/accept",
    "/api/accounts/register",
    "/api/accounts/login",
];
const PER_CLIENT_PER_MINUTE: u32 = 20;
const TRACKED_CLIENTS: usize = 10_000;

/// The global bucket (`accounts::rate_limit`) bounds total sign-in work. With a
/// trusted proxy header, one client also cannot use up that bucket alone.
pub fn limit(app: &App, path: &str, headers: &HeaderMap) -> ApiResult<()> {
    let Some(name) = &app.nido.access.client_ip_header else {
        return Ok(());
    };
    if !SIGN_IN.contains(&path) {
        return Ok(());
    }
    // A proxy appends the address it saw, so the last entry is the one to trust.
    let client = headers
        .get(name)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.rsplit(',').next())
        .map(str::trim)
        .unwrap_or("unknown")
        .to_string();
    let mut guard = app.nido.access.attempts.lock().map_err(internal)?;
    let (window, counts) = &mut *guard;
    if *window != now() / 60 {
        *window = now() / 60;
        counts.clear();
    }
    if counts.len() >= TRACKED_CLIENTS && !counts.contains_key(&client) {
        return Err(too_many());
    }
    let attempts = counts.entry(client).or_default();
    *attempts += 1;
    if *attempts > PER_CLIENT_PER_MINUTE {
        return Err(too_many());
    }
    Ok(())
}
fn too_many() -> ApiError {
    ApiError(
        StatusCode::TOO_MANY_REQUESTS,
        "Too many sign-in requests. Try again in a minute.".into(),
    )
}

#[derive(Debug, PartialEq)]
pub enum Standing {
    Anonymous,
    Uninvited,
    Member,
}
/// Recovery-key, development and preview sessions never count: invite-only
/// hosts admit Nido accounts only.
pub fn standing(app: &App, headers: &HeaderMap) -> ApiResult<Standing> {
    if !app.nido.access.invite_only {
        return Ok(Standing::Member);
    }
    let Some(token) = cookie(headers, "drawing_board_alien_v11_session") else {
        return Ok(Standing::Anonymous);
    };
    let db = app.store.0.lock().map_err(internal)?;
    let member: Option<bool> = db
        .query_row(
            "SELECT s.user_id LIKE 'nido:%' AND NOT s.development AND (
                EXISTS(SELECT 1 FROM account_roles r WHERE r.account_id=s.user_id AND r.role='admin')
                OR EXISTS(SELECT 1 FROM invitation_claims c JOIN invitations i ON i.id=c.invitation_id
                    WHERE c.account_id=s.user_id AND i.revoked=0))
            FROM sessions s JOIN accounts a ON a.id=s.user_id
            WHERE s.token_hash=? AND s.expires>? AND a.kind='human'",
            rusqlite::params![digest(&token), now()],
            |r| r.get(0),
        )
        .optional()
        .map_err(internal)?;
    Ok(match member {
        None => Standing::Anonymous,
        Some(false) => Standing::Uninvited,
        Some(true) => Standing::Member,
    })
}

/// The refusal for a request this host does not admit, if any. The caller has
/// already re-verified a Nido session, so a revoked passkey reads as signed out.
pub fn refusal(
    app: &App,
    path: &str,
    query: Option<&str>,
    headers: &HeaderMap,
) -> Option<Response> {
    if !app.nido.access.invite_only || is_public(path) {
        return None;
    }
    let standing = match standing(app, headers) {
        Ok(Standing::Member) => return None,
        Ok(standing) => standing,
        Err(e) => return Some(e.into_response()),
    };
    let (status, message) = if standing == Standing::Anonymous {
        (
            StatusCode::UNAUTHORIZED,
            "This server is invite-only. Sign in with Nido to continue.",
        )
    } else {
        (
            StatusCode::FORBIDDEN,
            "This server is invite-only. Ask an administrator for an invitation link.",
        )
    };
    if path.starts_with("/api/") {
        return Some(
            (
                status,
                Json(json!({"error":message,"access":"invite-required"})),
            )
                .into_response(),
        );
    }
    let back = query.map_or_else(|| path.to_string(), |q| format!("{path}?{q}"));
    let next: String = url::form_urlencoded::byte_serialize(back.as_bytes()).collect();
    let action = if standing == Standing::Anonymous {
        format!(r#"<a href="/api/auth/nido?return_to={next}">Continue with Nido</a>"#)
    } else {
        r#"<a href="/">Open the start page</a>"#.into()
    };
    let page = format!(
        r#"<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Invite required · Heirs Ad Astra</title><style>body{{font:16px/1.5 system-ui,sans-serif;background:#0b1622;color:#d7edf8;display:grid;place-items:center;min-height:100vh;margin:0}}main{{max-width:32rem;padding:2rem}}a{{color:#79e3f2}}</style><main><h1>Invite required</h1><p>{message}</p><p>{action}</p></main></html>"#
    );
    Some((status, axum::response::Html(page)).into_response())
}

/// Host CLI (`grant-admin`): make a Nido wallet an administrator without
/// issuing any link. Shell access to the host is the root of trust here.
pub fn grant_admin(app: &App, address: &str) -> ApiResult<String> {
    let db = app.store.0.lock().map_err(internal)?;
    let id = nido::ensure_account(&db, address)?;
    db.execute(
        "INSERT OR IGNORE INTO account_roles VALUES(?,'admin')",
        [&id],
    )
    .map_err(internal)?;
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::call;
    use axum::{body::Body, http::Request};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    fn app(client_ip_header: Option<&str>) -> App {
        let mut app = crate::tests::app(false);
        // Nido must be on for its sessions to count; fresh checks need no network.
        app.nido = Arc::new(
            nido::Config::new(true, "https://soroban-testnet.stellar.org".into())
                .unwrap()
                .with_access(Policy::new(
                    true,
                    client_ip_header.map(|h| HeaderName::try_from(h).unwrap()),
                )),
        );
        app
    }
    fn wallet(seed: u8) -> String {
        stellar_strkey::Contract([seed; 32]).to_string()
    }
    /// A session as the Nido callback leaves it, verified just now.
    fn nido_session(app: &App, seed: u8) -> String {
        let db = app.store.0.lock().unwrap();
        let id = nido::ensure_account(&db, &wallet(seed)).unwrap();
        let token = accounts::issue_session(&db, &HeaderMap::new(), &id, "Pilot").unwrap();
        db.execute(
            "INSERT INTO nido_sessions VALUES(?,?,?)",
            rusqlite::params![digest(&token), "04aa", now()],
        )
        .unwrap();
        format!("drawing_board_alien_v11_session={token}")
    }
    fn recovery_session(app: &App) -> (String, String) {
        let db = app.store.0.lock().unwrap();
        let id = format!("human:{}", uuid::Uuid::new_v4());
        db.execute(
            "INSERT INTO accounts(id,name,kind,credential_hash,created) VALUES(?,'Key',?,?,?)",
            rusqlite::params![id, "human", digest("dbk_test"), now()],
        )
        .unwrap();
        let token = accounts::issue_session(&db, &HeaderMap::new(), &id, "Key").unwrap();
        (id, format!("drawing_board_alien_v11_session={token}"))
    }
    async fn page(app: &App, path: &str, cookie: &str) -> (StatusCode, String) {
        let request = Request::builder()
            .uri(path)
            .header("cookie", cookie)
            .body(Body::empty())
            .unwrap();
        let response = router(app.clone()).oneshot(request).await.unwrap();
        let status = response.status();
        let body = response.into_body().collect().await.unwrap().to_bytes();
        (status, String::from_utf8_lossy(&body).into())
    }
    fn token(invite: &serde_json::Value) -> String {
        invite["url"]
            .as_str()
            .unwrap()
            .rsplit('/')
            .next()
            .unwrap()
            .into()
    }
    /// Everything a member uses: account data, tables, live streams, pages.
    async fn assert_refused(app: &App, cookie: &str, status: StatusCode) {
        for path in [
            "/api/tables",
            "/api/account",
            "/api/catalog",
            "/api/admin/invites",
            "/api/shared/00000000000000000000000000000000/stream",
        ] {
            let (s, _, body) = call(app, "GET", path, cookie, json!({})).await;
            assert_eq!(s, status, "{path}");
            assert_eq!(body["access"], "invite-required", "{path}");
        }
        let (s, html) = page(app, "/galactic-reach/?table=abc", cookie).await;
        assert_eq!(s, status);
        assert!(html.contains("Invite required"));
        let (s, _) = page(app, "/voidwright/", cookie).await;
        assert_eq!(s, status);
    }

    #[tokio::test]
    async fn anonymous_visitors_reach_only_the_landing_and_sign_in_flow() {
        let a = app(None);
        assert_refused(&a, "", StatusCode::UNAUTHORIZED).await;
        let (_, html) = page(&a, "/galactic-reach/?table=abc", "").await;
        assert!(
            html.contains(r#"href="/api/auth/nido?return_to=%2Fgalactic-reach%2F%3Ftable%3Dabc""#)
        );
        assert_eq!(
            call(&a, "GET", "/api/health", "", json!({})).await.0,
            StatusCode::OK
        );
        let (s, _, session) = call(&a, "GET", "/api/session", "", json!({})).await;
        assert_eq!(s, StatusCode::OK);
        assert_eq!(session["invite_only"], true);
        assert_eq!(session["member"], false);
        assert_eq!(session["registration_available"], false);
        for path in ["/", "/lab/lab.js"] {
            let (s, _) = page(&a, path, "").await;
            assert!(
                s != StatusCode::UNAUTHORIZED && s != StatusCode::FORBIDDEN,
                "{path}"
            );
        }
        // Recovery-key enrollment and sign-in are closed to the public.
        for path in ["/api/accounts/register", "/api/accounts/login"] {
            assert_eq!(
                call(
                    &a,
                    "POST",
                    path,
                    "",
                    json!({"name":"X","recovery_key":"dbk_x"})
                )
                .await
                .0,
                StatusCode::UNAUTHORIZED
            );
        }
    }

    #[tokio::test]
    async fn signed_in_but_uninvited_nido_accounts_are_refused() {
        let a = app(None);
        let stranger = nido_session(&a, 3);
        assert_refused(&a, &stranger, StatusCode::FORBIDDEN).await;
        let (_, html) = page(&a, "/galactic-reach/", &stranger).await;
        assert!(html.contains(r#"href="/""#));
        let (_, _, session) = call(&a, "GET", "/api/session", &stranger, json!({})).await;
        assert_eq!(session["user"]["nido"], true);
        assert_eq!(session["member"], false);
    }

    #[tokio::test]
    async fn invitation_admits_nido_accounts_until_revoked() {
        let a = app(None);
        let host_id = grant_admin(&a, &wallet(1).to_lowercase()).unwrap();
        assert_eq!(host_id, format!("nido:{}", wallet(1)));
        let host = nido_session(&a, 1);
        let (s, _, session) = call(&a, "GET", "/api/session", &host, json!({})).await;
        assert_eq!(s, StatusCode::OK);
        assert_eq!(session["member"], true);
        assert_eq!(
            call(&a, "GET", "/api/tables", &host, json!({})).await.0,
            StatusCode::OK
        );
        let (s, _, invite) = call(
            &a,
            "POST",
            "/api/admin/invites",
            &host,
            json!({"label":"Friday","max_uses":2,"days":1}),
        )
        .await;
        assert_eq!(s, StatusCode::OK);

        // Anyone holding the link may read its label, but claiming takes Nido.
        assert_eq!(
            call(
                &a,
                "POST",
                "/api/invites/inspect",
                "",
                json!({"token":token(&invite)})
            )
            .await
            .2["label"],
            "Friday"
        );
        assert_eq!(
            call(
                &a,
                "POST",
                "/api/invites/accept",
                "",
                json!({"token":token(&invite)})
            )
            .await
            .0,
            StatusCode::UNAUTHORIZED
        );
        let (_, key_holder) = recovery_session(&a);
        assert_eq!(
            call(
                &a,
                "POST",
                "/api/invites/accept",
                &key_holder,
                json!({"token":token(&invite)})
            )
            .await
            .0,
            StatusCode::FORBIDDEN
        );
        assert_refused(&a, &key_holder, StatusCode::FORBIDDEN).await;

        let guest = nido_session(&a, 2);
        assert_eq!(
            call(
                &a,
                "POST",
                "/api/invites/accept",
                &guest,
                json!({"token":token(&invite)})
            )
            .await
            .0,
            StatusCode::OK
        );
        assert_eq!(
            call(&a, "GET", "/api/tables", &guest, json!({})).await.0,
            StatusCode::OK
        );
        let (s, _) = page(&a, "/galactic-reach/", &guest).await;
        assert!(s != StatusCode::UNAUTHORIZED && s != StatusCode::FORBIDDEN);
        // Members are not administrators.
        assert_eq!(
            call(&a, "GET", "/api/admin/invites", &guest, json!({}))
                .await
                .0,
            StatusCode::FORBIDDEN
        );

        let revoke = format!(
            "/api/admin/invites/{}/revoke",
            invite["id"].as_str().unwrap()
        );
        assert_eq!(
            call(&a, "POST", &revoke, &host, json!({})).await.0,
            StatusCode::OK
        );
        assert_refused(&a, &guest, StatusCode::FORBIDDEN).await;
        assert_eq!(
            call(&a, "GET", "/api/tables", &host, json!({})).await.0,
            StatusCode::OK
        );
    }

    #[tokio::test]
    async fn bootstrap_link_admits_one_nido_admin_then_closes() {
        let a = app(None);
        let setup = invites::bootstrap(&a).unwrap();
        let (_, key_holder) = recovery_session(&a);
        assert_eq!(
            call(
                &a,
                "POST",
                "/api/invites/accept",
                &key_holder,
                json!({"token":token(&setup)})
            )
            .await
            .0,
            StatusCode::FORBIDDEN
        );
        let captain = nido_session(&a, 9);
        assert_eq!(
            call(
                &a,
                "POST",
                "/api/invites/accept",
                &captain,
                json!({"token":token(&setup)})
            )
            .await
            .0,
            StatusCode::OK
        );
        assert_eq!(
            call(&a, "GET", "/api/admin/invites", &captain, json!({}))
                .await
                .0,
            StatusCode::OK
        );
        // Once used, the setup link is dead for everyone and cannot be reissued.
        assert_eq!(
            call(
                &a,
                "POST",
                "/api/invites/inspect",
                "",
                json!({"token":token(&setup)})
            )
            .await
            .0,
            StatusCode::BAD_REQUEST
        );
        let late = nido_session(&a, 10);
        assert_eq!(
            call(
                &a,
                "POST",
                "/api/invites/accept",
                &late,
                json!({"token":token(&setup)})
            )
            .await
            .0,
            StatusCode::BAD_REQUEST
        );
        assert_refused(&a, &late, StatusCode::FORBIDDEN).await;
        assert!(invites::bootstrap(&a).is_err());
    }

    #[tokio::test]
    async fn sign_in_is_limited_per_client_behind_a_trusted_proxy() {
        let a = app(Some("x-forwarded-for"));
        let inspect = |client: &'static str| {
            let a = a.clone();
            async move {
                let request = Request::builder()
                    .method("POST")
                    .uri("/api/invites/inspect")
                    .header("content-type", "application/json")
                    .header("x-drawing-board", "1")
                    // A client-supplied first entry must not pick the bucket.
                    .header("x-forwarded-for", format!("1.2.3.4, {client}"))
                    .body(Body::from(json!({"token":"0".repeat(64)}).to_string()))
                    .unwrap();
                router(a).oneshot(request).await.unwrap().status()
            }
        };
        for _ in 0..PER_CLIENT_PER_MINUTE {
            assert_eq!(inspect("203.0.113.7").await, StatusCode::BAD_REQUEST);
        }
        assert_eq!(inspect("203.0.113.7").await, StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(inspect("198.51.100.2").await, StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn cross_site_writes_are_refused_and_open_hosts_are_unchanged() {
        let a = crate::tests::app(true);
        let request = Request::builder()
            .method("POST")
            .uri("/api/auth/dev")
            .header("content-type", "application/json")
            .header("x-drawing-board", "1")
            .header("sec-fetch-site", "cross-site")
            .body(Body::from(json!({"name":"Eve"}).to_string()))
            .unwrap();
        assert_eq!(
            router(a.clone()).oneshot(request).await.unwrap().status(),
            StatusCode::FORBIDDEN
        );
        // ACCESS unset: anonymous visitors still get the ordinary sign-in prompts.
        let (_, _, session) = call(&a, "GET", "/api/session", "", json!({})).await;
        assert_eq!(session["invite_only"], false);
        assert_eq!(session["member"], true);
        let (s, _) = page(&a, "/galactic-reach/", "").await;
        assert!(s != StatusCode::UNAUTHORIZED && s != StatusCode::FORBIDDEN);
        assert_eq!(
            call(&a, "GET", "/api/tables", "", json!({})).await.0,
            StatusCode::UNAUTHORIZED
        );
    }
}
