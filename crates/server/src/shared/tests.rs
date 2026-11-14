use super::authority::{HiddenInfoAuthority, TrustedAuthority};
use super::log::SqliteTableLog;
use super::*;
use crate::tests::{app, call};

impl Service {
    /// Test driver access: the active seat, its observation and legal actions.
    async fn turn(self: &Arc<Self>, id: &str) -> Option<(usize, Value, Vec<Value>)> {
        let id = id.to_string();
        self.call(move |t| {
            let live = t.live(&id)?;
            Ok(live.engine.active_seat().map(|seat| {
                (
                    seat,
                    live.engine.observe(seat).unwrap(),
                    live.engine.legal_actions(seat),
                )
            }))
        })
        .await
        .unwrap()
    }
    /// The engine's own private view after forgetting it and folding the log again.
    async fn refolded(self: &Arc<Self>, id: &str, seat: usize) -> Value {
        let id = id.to_string();
        self.call(move |t| {
            let before = t.live(&id)?.engine.private_state(seat).map_err(broken)?;
            t.live.remove(&id);
            let after = t.live(&id)?.engine.private_state(seat).map_err(broken)?;
            assert_eq!(before, after, "fold(log) rebuilds the same position");
            Ok(after)
        })
        .await
        .unwrap()
    }
}

fn table(id: &str, people: &[(&str, &str)]) -> Table {
    let people: Vec<(String, String)> = people
        .iter()
        .map(|(a, n)| (a.to_string(), n.to_string()))
        .collect();
    Table {
        id: id.into(),
        name: "Test table".into(),
        rules: galactic_reach::RULES.into(),
        authority: String::new(),
        status: "active".into(),
        seats: seats(&people),
    }
}
fn store_with(accounts: &[&str]) -> Arc<Store> {
    let store = Arc::new(Store::open(":memory:").unwrap());
    {
        let db = store.0.lock().unwrap();
        for id in accounts {
            db.execute(
                "INSERT INTO accounts(id,name,kind,created) VALUES(?,?,'human',0)",
                [id, id],
            )
            .unwrap();
        }
    }
    store
}

#[test]
fn trusted_shuffles_commit_and_replay_only_their_own_purpose() {
    let a = TrustedAuthority;
    let s = a.shuffle("t", 0, 12, "deck:1").unwrap();
    let mut sorted = s.order.clone();
    sorted.sort();
    assert_eq!(sorted, (0..12).collect::<Vec<_>>());
    assert!(
        !s.event.public.to_string().contains("order"),
        "the public record carries a commitment, not the order"
    );
    let logged = Event {
        seq: 1,
        kind: "shuffle".into(),
        seat: None,
        public: s.event.public.clone(),
        private: s.event.private.clone(),
        hash: String::new(),
    };
    assert_eq!(a.replay_shuffle(&logged, 12, "deck:1").unwrap(), s.order);
    assert!(a.replay_shuffle(&logged, 12, "deck:2").is_err());
    assert!(a.replay_shuffle(&logged, 11, "deck:1").is_err());
    let reveal = a.reveal("t", std::slice::from_ref(&logged)).unwrap();
    assert_eq!(reveal.public["shuffles"][0]["valid"], true);
    assert_eq!(reveal.public["shuffles"][0]["order"], json!(s.order));
    let mut forged = logged.clone();
    forged.private.as_mut().unwrap()["order"][0] = json!(99);
    assert_eq!(
        a.reveal("t", &[forged]).unwrap().public["shuffles"][0]["valid"],
        false,
        "an opening that does not match its commitment is flagged"
    );
}

#[test]
fn sqlite_log_appends_in_order_and_rejects_a_stale_head() {
    let store = store_with(&["a", "b"]);
    let log = SqliteTableLog(store);
    let t = table("t1", &[("a", "Ada"), ("b", "Bo")]);
    log.create(&t).unwrap();
    assert_eq!(log.table("t1").unwrap().unwrap().seats, t.seats);
    assert_eq!(log.tables_for("b").unwrap()[0].id, "t1");
    assert!(log.tables_for("c").unwrap().is_empty());
    let event = |n| NewEvent {
        kind: "action",
        seat: Some(0),
        public: json!({"action":{"type":"pass","n":n}}),
        private: None,
    };
    assert_eq!(log.append("t1", 0, &[event(1), event(2)]).unwrap(), 2);
    assert!(
        log.append("t1", 1, &[event(3)]).is_err(),
        "a writer that missed an event cannot append"
    );
    assert_eq!(log.append("t1", 2, &[event(3)]).unwrap(), 3);
    let events = log.read("t1").unwrap();
    assert_eq!(
        events.iter().map(|e| e.seq).collect::<Vec<_>>(),
        vec![1, 2, 3]
    );
    assert!(events.windows(2).all(|w| w[0].hash != w[1].hash));
}

#[tokio::test]
async fn private_views_never_hold_another_seats_hand_or_deck_order() {
    let store = store_with(&["a", "b"]);
    let service = Service::start(
        Arc::new(SqliteTableLog(store)),
        Arc::new(TrustedAuthority),
        Duration::ZERO,
    );
    service
        .open(table("t2", &[("a", "Ada"), ("b", "Bo")]))
        .await
        .unwrap();
    let full = service
        .call(|t| {
            let live = t.live("t2")?;
            live.engine.extend_deadline(SHARED_STEP);
            Ok(live.engine.private_state(0).unwrap())
        })
        .await
        .unwrap();
    // Seat 0's own projection still holds its hand; compare against seat 1's view.
    let ada = service.view("t2", "a").await.unwrap();
    let bo = service.view("t2", "b").await.unwrap();
    assert_eq!(
        (ada["seat"].as_u64(), bo["seat"].as_u64()),
        (Some(0), Some(1))
    );
    let ada_hand: Vec<String> = full["players"][0]["hand"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["id"].as_str().unwrap().to_string())
        .collect();
    assert_eq!(ada_hand.len(), 5);
    let bo_text = bo.to_string();
    for id in &ada_hand {
        assert!(
            !bo_text.contains(&format!("\"{id}\"")),
            "Bo's view contains Ada's card {id}"
        );
    }
    assert_eq!(bo["state"]["players"][0]["hand"], json!([]));
    assert_eq!(bo["state"]["players"][0]["handCount"], 5);
    assert_eq!(bo["state"]["players"][0]["deck"], json!([]));
    assert!(
        bo["state"]["relicDeck"]
            .as_array()
            .unwrap()
            .iter()
            .all(|c| c == &json!({"hidden":true}))
    );
    assert!(
        bo["state"]["advancedDeck"]
            .as_array()
            .unwrap()
            .iter()
            .all(|c| c == &json!({"hidden":true}))
    );
    // A seat's own deck is listed without its order.
    let deck: Vec<&str> = bo["state"]["players"][1]["deck"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["key"].as_str().unwrap())
        .collect();
    let mut sorted = deck.clone();
    sorted.sort();
    assert_eq!(deck, sorted);
    assert!(
        !bo_text.contains("\"salt\"") && !bo_text.contains("\"order\""),
        "no authority secret reaches a seat"
    );
    assert_eq!(service.view("t2", "stranger").await, Err(Refusal::NotFound));
}

async fn account(a: &App, name: &str) -> String {
    let (s, h, _) = call(
        a,
        "POST",
        "/api/accounts/register",
        "",
        json!({"name":name}),
    )
    .await;
    assert_eq!(s, StatusCode::OK);
    h[header::SET_COOKIE]
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .into()
}

/// Two accounts play a whole shared game through the HTTP API, with the table
/// service's AI rivals in the other two seats.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn two_accounts_play_a_shared_game_to_the_end_over_http() {
    let a = app(true);
    let host = account(&a, "Ada").await;
    let friend = account(&a, "Bo").await;
    let stranger = account(&a, "Cy").await;
    let created = call(
        &a,
        "POST",
        "/api/tables",
        &host,
        json!({"game":"galactic-reach","name":"Friday","lobby":true}),
    )
    .await
    .2;
    let id = created["id"].as_str().unwrap().to_string();
    let lobby = format!("/api/tables/{id}/lobby");
    let room = call(&a, "GET", &lobby, &host, json!({})).await.2;
    let invite = room["invite_url"]
        .as_str()
        .unwrap()
        .rsplit('/')
        .next()
        .unwrap()
        .to_string();
    let joined = call(
        &a,
        "POST",
        &format!("{lobby}/join"),
        &friend,
        json!({"invite":invite}),
    )
    .await
    .2;
    assert!(
        joined["blocked"].is_null(),
        "two people and two rivals can start"
    );
    let started = call(&a, "POST", &format!("{lobby}/start"), &host, json!({}))
        .await
        .2;
    assert_eq!(started["table_url"], url(&id));
    assert_eq!(started["shared"], true);
    let guest_room = call(&a, "GET", &lobby, &friend, json!({})).await.2;
    assert_eq!(guest_room["table_url"], url(&id), "guests can open it too");
    let shelf = call(&a, "GET", "/api/tables", &friend, json!({})).await.2;
    assert!(
        shelf
            .as_array()
            .unwrap()
            .iter()
            .any(|t| t["url"] == url(&id))
    );
    assert_eq!(
        call(&a, "GET", &format!("/api/tables/{id}"), &host, json!({}))
            .await
            .2["shared_url"],
        url(&id)
    );

    let endpoint = format!("/api/shared/{id}");
    assert_eq!(
        call(&a, "GET", &endpoint, &stranger, json!({})).await.0,
        StatusCode::NOT_FOUND
    );
    let first = call(&a, "GET", &endpoint, &host, json!({})).await.2;
    assert_eq!(first["seats"][0]["name"], "Ada");
    assert_eq!(first["seats"][1]["name"], "Bo");
    assert_eq!(first["seats"][2]["human"], false);
    assert_eq!(
        call(&a, "GET", &format!("{endpoint}/report"), &host, json!({}))
            .await
            .0,
        StatusCode::CONFLICT,
        "no report while cards are hidden"
    );

    let cookies = [host.clone(), friend.clone()];
    let mut agents = [
        BuiltinAgent::new(Strategy::Economy, [1; 32]),
        BuiltinAgent::new(Strategy::Expansion, [2; 32]),
    ];
    let mut human_moves = 0;
    let (mut undid, mut refused_after_reveal) = (false, false);
    let mut checked_stale = false;
    for _ in 0..20000 {
        let Some((seat, observation, legal)) = a.shared.turn(&id).await else {
            break;
        };
        if seat > 1 {
            tokio::time::sleep(Duration::from_millis(2)).await;
            continue;
        }
        let me = &cookies[seat];
        let view = call(&a, "GET", &endpoint, me, json!({})).await.2;
        assert_eq!(view["active"], seat);
        let other = &view["state"]["players"][1 - seat];
        assert_eq!(
            other["hand"],
            json!([]),
            "a seat never sees the other's hand"
        );
        let other_seat = call(&a, "GET", &endpoint, &cookies[1 - seat], json!({}))
            .await
            .2;
        let seq = view["seq"].as_u64().unwrap();
        // The seat not to move cannot act, and a stale view cannot either.
        let wrong = call(
            &a,
            "POST",
            &format!("{endpoint}/act"),
            &cookies[1 - seat],
            json!({"seq":other_seat["seq"],"actions":[{"type":"pass"}]}),
        )
        .await;
        assert_eq!(wrong.0, StatusCode::CONFLICT);
        let action = legal[agents[seat].select_action(&observation, &legal)].clone();
        if !checked_stale && seq > 0 {
            checked_stale = true;
            let stale = call(
                &a,
                "POST",
                &format!("{endpoint}/act"),
                me,
                json!({"seq":seq-1,"actions":[action.clone()]}),
            )
            .await;
            assert_eq!(stale.0, StatusCode::CONFLICT);
        }
        // Send the command as a browser would: without fields the server computes.
        let mut intent = action.clone();
        if intent["type"] == "resource" {
            intent.as_object_mut().unwrap().remove("gain");
        }
        let (status, _, result) = call(
            &a,
            "POST",
            &format!("{endpoint}/act"),
            me,
            json!({"seq":seq,"actions":[intent]}),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{result}");
        assert_eq!(result["applied"], 1);
        human_moves += 1;
        let after = &result["view"];
        let undo_path = format!("{endpoint}/undo");
        if after["active"] == seat {
            if action["type"] == "buy" && action["source"] == "market" && !refused_after_reveal {
                // Turning up a new market card is a reveal: Undo stops there.
                refused_after_reveal = true;
                assert_eq!(after["undo"]["available"], false);
                let r = call(&a, "POST", &undo_path, me, json!({"seq":after["seq"]})).await;
                assert_eq!(r.0, StatusCode::CONFLICT);
                assert!(
                    r.2["error"]
                        .as_str()
                        .unwrap()
                        .starts_with("Undo stops here: a new market card")
                );
            } else if action["type"] == "resource" && !undid {
                undid = true;
                assert_eq!(after["undo"]["available"], true);
                let hand = after["state"]["players"][seat]["hand"]
                    .as_array()
                    .unwrap()
                    .len();
                let r = call(&a, "POST", &undo_path, me, json!({"seq":after["seq"]})).await;
                assert_eq!(r.0, StatusCode::OK, "{}", r.2);
                assert!(r.2["undone"].as_u64().unwrap() >= 1);
                assert!(
                    r.2["view"]["state"]["players"][seat]["hand"]
                        .as_array()
                        .unwrap()
                        .len()
                        > hand
                );
            }
        }
    }
    assert!(human_moves > 20, "both people played many decisions");
    assert!(undid, "a person undid a conversion over HTTP");
    // `refused_after_reveal` depends on the shuffles: when a person buys from the
    // market mid-turn, Undo must refuse (checked above); the deterministic case is
    // `undo_takes_back_this_turn_but_not_past_a_reveal_or_the_turn`.
    let _ = refused_after_reveal;
    let end = call(&a, "GET", &endpoint, &friend, json!({})).await.2;
    assert_eq!(end["status"], "finished");
    assert!(end["state"]["winner"].is_u64());
    a.shared.refolded(&id, 1).await;
    let report = call(&a, "GET", &format!("{endpoint}/report"), &host, json!({})).await;
    assert_eq!(report.0, StatusCode::OK);
    let events = report.2["events"].as_array().unwrap();
    let reveal = events.last().unwrap();
    assert_eq!(reveal["kind"], "reveal");
    assert!(
        reveal["public"]["shuffles"]
            .as_array()
            .unwrap()
            .iter()
            .all(|s| s["valid"] == true),
        "every shuffle opens to its commitment"
    );
    assert!(
        events
            .iter()
            .any(|e| e["seat"] == 2 && e["kind"] == "action")
    );
    assert!(events.iter().any(|e| e["kind"] == "undo"));
    // Reveal detection on real play: conversions reveal nothing, market buys turn up a card.
    let actions = || events.iter().filter(|e| e["kind"] == "action");
    assert!(
        actions()
            .filter(|e| e["public"]["action"]["type"] == "resource")
            .all(|e| e["public"]["revealed"].is_null())
    );
    assert!(
        actions().any(|e| e["public"]["action"]["source"] == "market"
            && e["public"]["revealed"] == "a new market card was turned up")
    );
}

#[tokio::test]
async fn a_live_view_streams_the_current_seat_view_first() {
    use axum::{body::Body, http::Request};
    use http_body_util::BodyExt;
    use tower::ServiceExt;
    let a = app(true);
    let host = account(&a, "Ada").await;
    let friend = account(&a, "Bo").await;
    {
        let db = a.store.0.lock().unwrap();
        db.execute(
            "INSERT INTO solo_tables(id,owner_id,name,created,updated,rules_version) SELECT 'ffffffffffffffffffffffffffffffff',id,'Stream',0,0,'x' FROM accounts WHERE name='Ada'",
            [],
        )
        .unwrap();
    }
    let ids: Vec<(String, String)> = {
        let db = a.store.0.lock().unwrap();
        ["Ada", "Bo"]
            .iter()
            .map(|n| {
                db.query_row("SELECT id,name FROM accounts WHERE name=?", [n], |r| {
                    Ok((r.get(0)?, r.get(1)?))
                })
                .unwrap()
            })
            .collect()
    };
    let id = "ffffffffffffffffffffffffffffffff";
    a.shared
        .open(Table {
            id: id.into(),
            name: "Stream".into(),
            rules: galactic_reach::RULES.into(),
            authority: String::new(),
            status: "active".into(),
            seats: seats(&ids),
        })
        .await
        .unwrap();
    let request = |cookie: &str| {
        Request::builder()
            .uri(format!("/api/shared/{id}/stream"))
            .header("cookie", cookie)
            .body(Body::empty())
            .unwrap()
    };
    a.shared.set_ping_every(Duration::from_millis(100));
    let response = crate::router(a.clone())
        .oneshot(request(&friend))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let mut body = response.into_body();
    let frame = body.frame().await.unwrap().unwrap().into_data().unwrap();
    let text = String::from_utf8(frame.to_vec()).unwrap();
    assert!(text.starts_with("event: view\n"), "{text}");
    let data = text.lines().find_map(|l| l.strip_prefix("data: ")).unwrap();
    let view: Value = serde_json::from_str(data).unwrap();
    assert_eq!(view["seat"], 1);
    let _ = host;
    // A quiet stream sends `ping {seq}` so a page can spot silence or a gap.
    async fn next(body: &mut axum::body::Body) -> String {
        let frame = tokio::time::timeout(Duration::from_secs(5), body.frame())
            .await
            .expect("the stream keeps talking")
            .unwrap()
            .unwrap()
            .into_data()
            .unwrap();
        String::from_utf8(frame.to_vec()).unwrap()
    }
    let ping = loop {
        let text = next(&mut body).await;
        if text.starts_with("event: ping\n") {
            break text;
        }
    };
    let data = ping.lines().find_map(|l| l.strip_prefix("data: ")).unwrap();
    assert_eq!(
        serde_json::from_str::<Value>(data).unwrap()["seq"],
        view["seq"]
    );
    // A change pushes the new view to the other seat.
    let seq = view["seq"].as_u64().unwrap();
    a.shared
        .act(id, &ids[0].0, seq, vec![json!({"type":"pass"})])
        .await
        .unwrap();
    let pushed = loop {
        let text = next(&mut body).await;
        if text.starts_with("event: view\n") {
            break text;
        }
    };
    let data = pushed
        .lines()
        .find_map(|l| l.strip_prefix("data: "))
        .unwrap();
    assert!(
        serde_json::from_str::<Value>(data).unwrap()["seq"]
            .as_u64()
            .unwrap()
            > seq
    );
    // At shutdown every stream ends, so browsers reconnect to the next server
    // rather than hearing a frozen copy of the table from the old process.
    a.shared.close();
    let ended = loop {
        match tokio::time::timeout(Duration::from_secs(5), body.frame()).await {
            Ok(None) => break true,
            Ok(Some(_)) => continue,
            Err(_) => break false,
        }
    };
    assert!(ended, "the stream ends at shutdown");
    let stranger = account(&a, "Cy").await;
    assert_eq!(
        crate::router(a.clone())
            .oneshot(request(&stranger))
            .await
            .unwrap()
            .status(),
        StatusCode::NOT_FOUND
    );
}

fn hand_count(view: &Value, seat: usize) -> u64 {
    view["state"]["players"][seat]["handCount"]
        .as_u64()
        .unwrap()
}

/// Undo (rulebook #shared-tables): back to the start of the current turn, never past
/// a reveal, never after the turn ends; every seat's view rolls back; the log stays
/// append-only and folds to the same position.
#[tokio::test]
async fn undo_takes_back_this_turn_but_not_past_a_reveal_or_the_turn() {
    let store = store_with(&["a", "b"]);
    let log = Arc::new(SqliteTableLog(store));
    let service = Service::start(log.clone(), Arc::new(TrustedAuthority), Duration::ZERO);
    service
        .open(table("t3", &[("a", "Ada"), ("b", "Bo")]))
        .await
        .unwrap();
    let ada = service.view("t3", "a").await.unwrap();
    assert_eq!(ada["active"], 0);
    assert_eq!(ada["undo"]["available"], false);
    assert_eq!(ada["undo"]["reason"], "Nothing to undo this turn.");
    let cards: Vec<String> = ada["state"]["players"][0]["hand"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["id"].as_str().unwrap().to_string())
        .collect();
    let convert = |card: &str| vec![json!({"type":"resource","card":card})];

    // Two conversions this turn; Bo sees Ada's hand shrink, then Ada undoes both.
    let mut seq = ada["seq"].as_u64().unwrap();
    for card in &cards[..2] {
        seq = service.act("t3", "a", seq, convert(card)).await.unwrap()["seq"]
            .as_u64()
            .unwrap();
    }
    let bo = service.view("t3", "b").await.unwrap();
    assert_eq!(hand_count(&bo, 0), 3);
    let ada = service.view("t3", "a").await.unwrap();
    assert_eq!(ada["undo"]["available"], true);
    assert_eq!(ada["undo"]["actions"], 2);
    assert_eq!(
        service.undo("t3", "b", seq).await,
        Err(Refusal::Conflict("Undo works on your own turn.".into()))
    );
    assert!(
        matches!(
            service.undo("t3", "a", seq - 1).await,
            Err(Refusal::Conflict(_))
        ),
        "a stale view cannot undo"
    );
    let undone = service.undo("t3", "a", seq).await.unwrap();
    assert_eq!(undone["undone"], 2);
    seq = undone["seq"].as_u64().unwrap();
    let bo = service.view("t3", "b").await.unwrap();
    assert_eq!(hand_count(&bo, 0), 5, "the other seat's view rolls back");
    let ada = service.view("t3", "a").await.unwrap();
    assert_eq!(hand_count(&ada, 0), 5);
    assert_eq!(ada["undo"]["reason"], "Nothing to undo this turn.");
    service.refolded("t3", 0).await;

    // A reveal is a checkpoint. Mark one conversion as revealing (as a draw
    // would be) straight in the log; Undo then stops just after it.
    let logged = NewEvent {
        kind: "action",
        seat: Some(0),
        public: json!({"action": {"type":"resource","card":cards[0],"key":cards[0].split('-').next().unwrap(),
            "gain": if cards[0].starts_with("move") {json!({"energy":1})} else {json!({"matter":1})}},
            "turn": log.read("t3").unwrap().iter().rev().find(|e| e.kind=="action").unwrap().public["turn"],
            "revealed": "cards were drawn"}),
        private: None,
    };
    seq = log.append("t3", seq, &[logged]).unwrap();
    service
        .call(|t| {
            t.live.remove("t3");
            Ok(())
        })
        .await
        .unwrap();
    let ada = service.view("t3", "a").await.unwrap();
    assert_eq!(ada["undo"]["available"], false);
    assert_eq!(
        ada["undo"]["reason"],
        "Undo stops here: cards were drawn, so earlier choices this turn are final."
    );
    seq = service
        .act("t3", "a", seq, convert(&cards[1]))
        .await
        .unwrap()["seq"]
        .as_u64()
        .unwrap();
    let ada = service.view("t3", "a").await.unwrap();
    assert_eq!(ada["undo"]["actions"], 1);
    assert_eq!(ada["undo"]["stop"], "cards were drawn");
    seq = service.undo("t3", "a", seq).await.unwrap()["seq"]
        .as_u64()
        .unwrap();
    assert_eq!(
        hand_count(&service.view("t3", "b").await.unwrap(), 0),
        4,
        "only the choice after the reveal is taken back"
    );
    assert!(
        matches!(service.undo("t3", "a", seq).await, Err(Refusal::Conflict(r)) if r.starts_with("Undo stops here"))
    );

    // Passing ends the Operations turn; the Buy turn that follows starts fresh.
    seq = service
        .act("t3", "a", seq, vec![json!({"type":"pass"})])
        .await
        .unwrap()["seq"]
        .as_u64()
        .unwrap();
    assert_eq!(
        service.undo("t3", "a", seq).await,
        Err(Refusal::Conflict("Nothing to undo this turn.".into()))
    );
    service.refolded("t3", 1).await;
    // The log only grew: two undo events, nothing deleted.
    let kinds: Vec<String> = log
        .read("t3")
        .unwrap()
        .iter()
        .map(|e| e.kind.clone())
        .collect();
    assert_eq!(kinds.iter().filter(|k| *k == "undo").count(), 2);
    assert_eq!(log.read("t3").unwrap().last().unwrap().seq, seq);
}

#[test]
fn reveal_checkpoints_name_what_changed() {
    let mark = |decks: u64, market: u64| json!({"turn":3,"reveal":{"decks":[decks],"market":market,"relics":0,"surveys":[],"located":[],"combat":null,"combats":null}});
    assert_eq!(revealed(&mark(5, 9), &mark(5, 9), false), None);
    assert_eq!(
        revealed(&mark(5, 9), &mark(5, 9), true).as_deref(),
        Some("cards were shuffled")
    );
    assert_eq!(
        revealed(&mark(5, 9), &mark(3, 9), false).as_deref(),
        Some("cards were drawn")
    );
    assert_eq!(
        revealed(&mark(5, 9), &mark(5, 8), false).as_deref(),
        Some("a new market card was turned up")
    );
}

/// Server rivals move on the current rules, including at a table dealt with an
/// older version of their policies (a stuck table must resume after a redeploy).
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn server_rivals_move_on_the_current_rules_even_with_older_policy_versions() {
    assert!(rival("gr-economy/25").is_some() && rival("gr-military/1").is_some());
    assert!(rival("someone-else/26").is_none());
    let store = store_with(&["a"]);
    let log = Arc::new(SqliteTableLog(store));
    let service = Service::start(log.clone(), Arc::new(TrustedAuthority), Duration::ZERO);
    for (id, old) in [("current", false), ("older", true)] {
        let mut t = table(id, &[("a", "Ada")]);
        if old {
            for seat in t.seats.iter_mut().filter(|s| s.policy.is_some()) {
                let profile = seat
                    .policy
                    .as_ref()
                    .unwrap()
                    .split('/')
                    .next()
                    .unwrap()
                    .to_string();
                seat.policy = Some(format!("{profile}/25"));
            }
        }
        service.open(t).await.unwrap();
        let seq = service.view(id, "a").await.unwrap()["seq"]
            .as_u64()
            .unwrap();
        service
            .act(
                id,
                "a",
                seq,
                vec![json!({"type":"pass"}), json!({"type":"finish_buy"})],
            )
            .await
            .unwrap();
        let mut moved = false;
        for _ in 0..400 {
            let events = log.read(id).unwrap();
            if [1, 2, 3].iter().all(|s| {
                events
                    .iter()
                    .any(|e| e.kind == "action" && e.seat == Some(*s))
            }) {
                moved = true;
                break;
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
        assert!(moved, "every rival at the {id} table moved");
        assert!(service.view(id, "a").await.unwrap()["ai_error"].is_null());
    }
}
