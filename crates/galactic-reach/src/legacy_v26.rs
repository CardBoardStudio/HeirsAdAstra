use super::*;

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
/// Hits, shields and pierce of a combat tactic: the two basic tactics or a military card.
fn tactic_stats(key: &str) -> (f64, f64, bool) {
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
fn capacity_value(view: &Value, seat: usize, key: &str) -> Option<f64> {
    let (table_cost, prestige, military) = capacity_card(key)?;
    let cost = observed_cost(view, key).unwrap_or(table_cost);
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
                let (hits, shield, pierce) = tactic_stats(action["tactic"].as_str().unwrap_or(""));
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
                if !explorer && settlers > 0.0 && here_center && (here["owner"] != json!(seat)) {
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
