//! JSON-lines bridge for retained Node studies. Standard policies are deterministic;
//! Wanderer is deliberately excluded so no native random draws go unrecorded.
use galactic_reach::{BuiltinAgent, Strategy};
use game_core::PlayerAgent;
use serde::Deserialize;
use serde_json::Value;
use std::io::{self, BufRead, Write};

#[derive(Deserialize)]
struct Request {
    id: Value,
    profile: String,
    observation: Value,
    legal: Vec<Value>,
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut output = io::BufWriter::new(io::stdout().lock());
    for line in io::stdin().lock().lines() {
        let request: Request = serde_json::from_str(&line?)?;
        let strategy = match request.profile.as_str() {
            "economy" => Strategy::Economy,
            "military" => Strategy::Military,
            "expansion" => Strategy::Expansion,
            _ => return Err("Study bridge accepts only deterministic standard policies".into()),
        };
        if request.legal.is_empty() {
            return Err("Study request has no legal actions".into());
        }
        let mut agent = BuiltinAgent::new(strategy, [0; 32]);
        let index = agent.select_action(&request.observation, &request.legal);
        serde_json::to_writer(
            &mut output,
            &serde_json::json!({"id":request.id,"index":index,"policy":strategy.version(),"nativeRandomDraws":0}),
        )?;
        writeln!(output)?;
        output.flush()?;
    }
    Ok(())
}
