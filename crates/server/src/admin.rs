//! Administrator overview: every invitation with who claimed it, and every
//! registered account (docs/invite-only.md#admin-dashboard). Read-only, and it
//! reports only what the store already records. Token hashes, recovery-key
//! hashes and Nido public keys never leave the server.
use crate::*;
use rusqlite::{Connection, params};
use std::collections::HashMap;

/// Each list is capped; `truncated` says when a cap was reached.
const LIMIT: usize = 1000;

#[derive(Serialize)]
struct Claim {
    invitation_id: String,
    account_id: String,
    name: Option<String>,
    claimed: u64,
}

fn status(revoked: bool, uses: u32, max_uses: u32, expires: u64, now: u64) -> &'static str {
    if revoked {
        "revoked"
    } else if uses >= max_uses {
        "used-up"
    } else if expires <= now {
        "expired"
    } else {
        "active"
    }
}

/// How an account came to this server. A bootstrap link outranks a member
/// link; `admin-grant` is the host CLI, which leaves no claim behind.
fn joined(id: &str, admin: bool, roles: &[&str]) -> &'static str {
    if roles.contains(&"admin") {
        "bootstrap"
    } else if !roles.is_empty() {
        "invitation"
    } else if admin {
        "admin-grant"
    } else if id.starts_with("dev:") || id.starts_with("preview:") {
        "temporary"
    } else {
        "direct"
    }
}

fn sign_in(id: &str) -> &'static str {
    match id.split(':').next() {
        Some("nido") => "nido",
        Some("human") => "recovery-key",
        Some("preview") => "preview",
        _ => "development",
    }
}

fn overview_json(db: &Connection, invite_only: bool) -> ApiResult<serde_json::Value> {
    let now = now();
    let mut claims_by_invite: HashMap<String, Vec<Claim>> = HashMap::new();
    let mut claims_by_account: HashMap<String, Vec<serde_json::Value>> = HashMap::new();
    {
        let mut query = db
            .prepare(
                "SELECT c.invitation_id,c.account_id,a.name,c.claimed,i.label,i.role
                 FROM invitation_claims c JOIN invitations i ON i.id=c.invitation_id
                 LEFT JOIN accounts a ON a.id=c.account_id ORDER BY c.claimed,c.rowid",
            )
            .map_err(internal)?;
        let rows = query
            .query_map([], |r| {
                Ok((
                    Claim {
                        invitation_id: r.get(0)?,
                        account_id: r.get(1)?,
                        name: r.get(2)?,
                        claimed: r.get(3)?,
                    },
                    r.get::<_, String>(4)?,
                    r.get::<_, String>(5)?,
                ))
            })
            .map_err(internal)?;
        for row in rows {
            let (claim, label, role) = row.map_err(internal)?;
            claims_by_account
                .entry(claim.account_id.clone())
                .or_default()
                .push(json!({"invitation_id":claim.invitation_id,"label":label,"role":role,"claimed":claim.claimed}));
            claims_by_invite
                .entry(claim.invitation_id.clone())
                .or_default()
                .push(claim);
        }
    }

    let mut query = db
        .prepare(
            "SELECT i.id,i.label,i.role,i.created_by,a.name,i.created,i.expires,i.max_uses,i.uses,i.revoked
             FROM invitations i LEFT JOIN accounts a ON a.id=i.created_by
             ORDER BY i.created DESC,i.rowid DESC LIMIT ?",
        )
        .map_err(internal)?;
    let mut invitations = Vec::new();
    let (mut links, mut offered, mut accepted, mut active) = (0u32, 0u32, 0u32, 0u32);
    let rows = query
        .query_map([LIMIT as u64 + 1], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, Option<String>>(4)?,
                r.get::<_, u64>(5)?,
                r.get::<_, u64>(6)?,
                r.get::<_, u32>(7)?,
                r.get::<_, u32>(8)?,
                r.get::<_, bool>(9)?,
            ))
        })
        .map_err(internal)?;
    for row in rows {
        let (id, label, role, by_id, by_name, created, expires, max_uses, uses, revoked) =
            row.map_err(internal)?;
        let status = status(revoked, uses, max_uses, expires, now);
        if role == "member" {
            links += 1;
            offered += max_uses;
            accepted += uses;
            active += u32::from(status == "active");
        }
        let claims = claims_by_invite.remove(&id).unwrap_or_default();
        invitations.push(json!({
            "id": id, "label": label, "role": role,
            "created_by": by_id.map(|id| json!({"id": id, "name": by_name})),
            "created": created, "expires": expires,
            "max_uses": max_uses, "uses": uses, "status": status,
            "claims": claims,
        }));
    }
    let invitations_truncated = invitations.len() > LIMIT;
    invitations.truncate(LIMIT);

    let mut query = db
        .prepare(
            "SELECT a.id,a.name,a.created,
                EXISTS(SELECT 1 FROM account_roles r WHERE r.account_id=a.id AND r.role='admin'),
                (SELECT count(*) FROM sessions s WHERE s.user_id=a.id AND s.expires>?1),
                (SELECT max(n.checked_at) FROM sessions s JOIN nido_sessions n USING(token_hash)
                    WHERE s.user_id=a.id AND s.expires>?1),
                (SELECT count(*) FROM solo_tables t WHERE t.owner_id=a.id),
                (SELECT count(DISTINCT g.table_id) FROM gr_shared_seats g WHERE g.account_id=a.id),
                EXISTS(SELECT 1 FROM invitation_claims c JOIN invitations i ON i.id=c.invitation_id
                    WHERE c.account_id=a.id AND i.revoked=0)
             FROM accounts a WHERE a.kind='human' ORDER BY a.created DESC,a.rowid DESC LIMIT ?2",
        )
        .map_err(internal)?;
    let mut accounts = Vec::new();
    let rows = query
        .query_map(params![now, LIMIT as u64 + 1], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, u64>(2)?,
                r.get::<_, bool>(3)?,
                r.get::<_, u32>(4)?,
                r.get::<_, Option<u64>>(5)?,
                r.get::<_, u32>(6)?,
                r.get::<_, u32>(7)?,
                r.get::<_, bool>(8)?,
            ))
        })
        .map_err(internal)?;
    for row in rows {
        let (id, name, created, admin, sessions, last_seen, solo, shared, invited) =
            row.map_err(internal)?;
        let claims = claims_by_account.remove(&id).unwrap_or_default();
        let roles: Vec<&str> = claims.iter().filter_map(|c| c["role"].as_str()).collect();
        let joined = joined(&id, admin, &roles);
        let sign_in = sign_in(&id);
        // Mirrors access::standing; on an open host every signed-in account plays.
        let has_access = !invite_only || (sign_in == "nido" && (admin || invited));
        accounts.push(json!({
            "id": id, "name": name, "created": created, "sign_in": sign_in,
            "joined": joined, "invitations": claims, "admin": admin,
            "has_access": has_access, "active_sessions": sessions, "last_seen": last_seen,
            "solo_tables": solo, "shared_tables": shared,
        }));
    }
    let accounts_truncated = accounts.len() > LIMIT;
    accounts.truncate(LIMIT);
    // Totals cover every account, not only the listed ones.
    let (total_accounts, admins, with_sessions): (u32, u32, u32) = db
        .query_row(
            "SELECT count(*),
                count(*) FILTER (WHERE EXISTS(SELECT 1 FROM account_roles r WHERE r.account_id=a.id)),
                count(*) FILTER (WHERE EXISTS(SELECT 1 FROM sessions s WHERE s.user_id=a.id AND s.expires>?))
             FROM accounts a WHERE a.kind='human'",
            [now],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(internal)?;
    Ok(json!({
        "invite_only": invite_only,
        "generated": now,
        "totals": {
            "links_created": links, "links_active": active,
            "seats_offered": offered, "links_accepted": accepted,
            "accounts": total_accounts, "admins": admins, "signed_in": with_sessions,
        },
        "invitations": invitations,
        "invitations_truncated": invitations_truncated,
        "accounts": accounts,
        "accounts_truncated": accounts_truncated,
    }))
}

pub async fn overview(
    State(app): State<App>,
    headers: HeaderMap,
) -> ApiResult<Json<serde_json::Value>> {
    invites::admin(&app, &headers)?;
    let db = app.store.0.lock().map_err(internal)?;
    Ok(Json(overview_json(&db, app.nido.access.invite_only)?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::{app, call};
    fn cookie(h: &HeaderMap) -> String {
        h[header::SET_COOKIE]
            .to_str()
            .unwrap()
            .split(';')
            .next()
            .unwrap()
            .into()
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
    async fn register(a: &App, name: &str, invite: &str) -> (String, serde_json::Value) {
        let (s, h, body) = call(
            a,
            "POST",
            "/api/accounts/register",
            "",
            json!({"name":name,"invite_token":invite}),
        )
        .await;
        assert_eq!(s, StatusCode::OK, "{body}");
        (cookie(&h), body)
    }
    fn account<'a>(overview: &'a serde_json::Value, name: &str) -> &'a serde_json::Value {
        overview["accounts"]
            .as_array()
            .unwrap()
            .iter()
            .find(|a| a["name"] == name)
            .unwrap()
    }

    #[tokio::test]
    async fn overview_is_admin_only() {
        let a = app(false);
        let setup = invites::bootstrap(&a).unwrap();
        let (host, _) = register(&a, "Host", &token(&setup)).await;
        let (_, _, invite) = call(
            &a,
            "POST",
            "/api/admin/invites",
            &host,
            json!({"label":"Friends","max_uses":2}),
        )
        .await;
        let (member, _) = register(&a, "Member", &token(&invite)).await;
        let path = "/api/admin/overview";
        assert_eq!(
            call(&a, "GET", path, "", json!({})).await.0,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            call(&a, "GET", path, &member, json!({})).await.0,
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            call(&a, "GET", path, &host, json!({})).await.0,
            StatusCode::OK
        );
        // A temporary identity is never an administrator, even with the role.
        let dev = app(true);
        let (_, h, _) = call(&dev, "POST", "/api/auth/dev", "", json!({"name":"Temp"})).await;
        let temp = cookie(&h);
        let id = call(&dev, "GET", "/api/account", &temp, json!({})).await.2["id"].clone();
        dev.store
            .0
            .lock()
            .unwrap()
            .execute(
                "INSERT INTO account_roles VALUES(?,'admin')",
                [id.as_str().unwrap()],
            )
            .unwrap();
        assert_eq!(
            call(&dev, "GET", path, &temp, json!({})).await.0,
            StatusCode::FORBIDDEN
        );
    }

    #[tokio::test]
    async fn overview_reports_links_claims_and_accounts_without_secrets() {
        let a = app(false);
        let setup = invites::bootstrap(&a).unwrap();
        let (host, host_key) = register(&a, "Host", &token(&setup)).await;
        let create = |label: &'static str, uses: u32| {
            let a = a.clone();
            let host = host.clone();
            async move {
                call(
                    &a,
                    "POST",
                    "/api/admin/invites",
                    &host,
                    json!({"label":label,"max_uses":uses}),
                )
                .await
                .2
            }
        };
        let friends = create("Friends", 3).await;
        let solo = create("Solo seat", 1).await;
        let stale = create("Stale", 2).await;
        let pulled = create("Pulled", 2).await;
        let (_, ada) = register(&a, "Ada", &token(&friends)).await;
        register(&a, "Bea", &token(&friends)).await;
        register(&a, "Cy", &token(&solo)).await;
        a.store
            .0
            .lock()
            .unwrap()
            .execute(
                "UPDATE invitations SET expires=1 WHERE id=?",
                [stale["id"].as_str().unwrap()],
            )
            .unwrap();
        // A wallet the host CLI made an administrator; it never claimed a link.
        access::grant_admin(&a, &stellar_strkey::Contract([7; 32]).to_string()).unwrap();
        call(
            &a,
            "POST",
            &format!(
                "/api/admin/invites/{}/revoke",
                pulled["id"].as_str().unwrap()
            ),
            &host,
            json!({}),
        )
        .await;
        let (s, _, o) = call(&a, "GET", "/api/admin/overview", &host, json!({})).await;
        assert_eq!(s, StatusCode::OK);

        let totals = &o["totals"];
        assert_eq!(
            totals["links_created"], 4,
            "bootstrap link is not a member link"
        );
        assert_eq!(totals["links_active"], 1);
        assert_eq!(totals["seats_offered"], 8);
        assert_eq!(totals["links_accepted"], 3);
        assert_eq!(totals["accounts"], 5);
        assert_eq!(totals["admins"], 2);
        assert_eq!(totals["signed_in"], 4);

        let by_label = |label: &str| {
            o["invitations"]
                .as_array()
                .unwrap()
                .iter()
                .find(|i| i["label"] == label)
                .unwrap()
                .clone()
        };
        let f = by_label("Friends");
        assert_eq!(f["status"], "active");
        assert_eq!(
            (f["uses"].clone(), f["max_uses"].clone()),
            (json!(2), json!(3))
        );
        assert_eq!(f["created_by"]["name"], "Host");
        let names: Vec<_> = f["claims"]
            .as_array()
            .unwrap()
            .iter()
            .map(|c| c["name"].clone())
            .collect();
        assert_eq!(names, [json!("Ada"), json!("Bea")]);
        assert!(f["claims"][0]["claimed"].as_u64().unwrap() > 0);
        assert_eq!(by_label("Solo seat")["status"], "used-up");
        assert_eq!(by_label("Stale")["status"], "expired");
        assert_eq!(by_label("Pulled")["status"], "revoked");
        let setup_link = by_label("Set up the first administrator");
        assert_eq!(setup_link["role"], "admin");
        assert!(setup_link["created_by"].is_null());

        let h = account(&o, "Host");
        assert_eq!(
            (h["joined"].clone(), h["admin"].clone()),
            (json!("bootstrap"), json!(true))
        );
        assert_eq!(h["sign_in"], "recovery-key");
        assert_eq!(h["active_sessions"], 1);
        let ada_row = account(&o, "Ada");
        assert_eq!(ada_row["joined"], "invitation");
        assert_eq!(ada_row["invitations"][0]["label"], "Friends");
        assert_eq!(ada_row["admin"], false);
        assert_eq!(
            ada_row["has_access"], true,
            "open hosts admit every account"
        );
        let wallet = o["accounts"]
            .as_array()
            .unwrap()
            .iter()
            .find(|a| a["id"].as_str().unwrap().starts_with("nido:"))
            .unwrap();
        assert_eq!(
            (wallet["joined"].clone(), wallet["sign_in"].clone()),
            (json!("admin-grant"), json!("nido"))
        );
        assert_eq!(wallet["active_sessions"], 0);
        assert!(wallet["last_seen"].is_null());

        // Only hashes are stored; neither they nor the secrets may appear.
        let body = o.to_string();
        let db = a.store.0.lock().unwrap();
        let mut secrets: Vec<String> = db
            .prepare("SELECT token_hash FROM sessions UNION ALL SELECT token_hash FROM invitations UNION ALL SELECT credential_hash FROM accounts WHERE credential_hash IS NOT NULL")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        secrets.extend([token(&friends), token(&setup)]);
        secrets.push(host_key["recovery_key"].as_str().unwrap().into());
        secrets.push(ada["recovery_key"].as_str().unwrap().into());
        assert!(secrets.len() > 8);
        for secret in secrets {
            assert!(!body.contains(&secret), "overview leaked {secret}");
        }
    }

    #[test]
    fn invite_only_access_mirrors_the_gate() {
        let a = app(false);
        let db = a.store.0.lock().unwrap();
        let wallet = |seed: u8| {
            nido::ensure_account(&db, &stellar_strkey::Contract([seed; 32]).to_string()).unwrap()
        };
        let (member, revoked, uninvited) = (wallet(1), wallet(2), wallet(3));
        db.execute_batch(
            "INSERT INTO invitations(id,token_hash,label,role,created,expires,max_uses,uses,revoked)
             VALUES('live','h1','Live','member',1,1,5,1,0),('gone','h2','Gone','member',1,1,5,1,1);",
        )
        .unwrap();
        db.execute(
            "INSERT INTO invitation_claims VALUES('live',?,5)",
            [&member],
        )
        .unwrap();
        db.execute(
            "INSERT INTO invitation_claims VALUES('gone',?,6)",
            [&revoked],
        )
        .unwrap();
        let o = overview_json(&db, true).unwrap();
        let access = |id: &str| {
            o["accounts"]
                .as_array()
                .unwrap()
                .iter()
                .find(|a| a["id"] == id)
                .unwrap()["has_access"]
                .clone()
        };
        assert_eq!(access(&member), true);
        assert_eq!(access(&revoked), false, "revoking a link removes access");
        assert_eq!(access(&uninvited), false);
        assert_eq!(o["totals"]["links_accepted"], 2);
        assert_eq!(o["invitations"][0]["claims"].as_array().unwrap().len(), 1);
    }
}
