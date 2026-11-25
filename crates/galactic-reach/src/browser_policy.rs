use super::*;
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BrowserProfile {
    Military,
    MilitaryFocused,
    Economy,
    Market,
    Expansion,
}
impl BrowserProfile {
    pub fn name(self) -> &'static str {
        match self {
            Self::Military => "military",
            Self::MilitaryFocused => "militaryFocused",
            Self::Economy => "economy",
            Self::Market => "market",
            Self::Expansion => "expansion",
        }
    }
    pub fn version(self) -> &'static str {
        match self {
            Self::Military => "gr-browser-military/1",
            Self::MilitaryFocused => "gr-browser-military-focused/1",
            Self::Economy => "gr-browser-economy/1",
            Self::Market => "gr-browser-market/1",
            Self::Expansion => "gr-browser-expansion/1",
        }
    }
    pub fn parse(version: &str) -> Option<Self> {
        [
            Self::Military,
            Self::MilitaryFocused,
            Self::Economy,
            Self::Market,
            Self::Expansion,
        ]
        .into_iter()
        .find(|p| p.version() == version)
    }
}
/// A transport handle, not another decision policy. The engine executes browser JS.
pub struct BrowserAgent(pub BrowserProfile);
impl PlayerAgent<GalacticReach> for BrowserAgent {
    fn policy_version(&self) -> &str {
        self.0.version()
    }
    fn select_action(&mut self, _: &Value, legal: &[Value]) -> usize {
        if legal == [json!({"type":"browser_policy","profile":self.0.name()})] {
            0
        } else {
            usize::MAX
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn browser_policy_is_explicit_and_cannot_control_human_seats() {
        let mut g = GalacticReach::new([7; 32]).unwrap();
        let forged = json!({"type":"browser_policy","profile":"economy"});
        assert!(g.apply_action(0, forged.clone()).is_err());
        g.set_browser_profiles([Some(BrowserProfile::Economy), None, None, None])
            .unwrap();
        assert_eq!(g.legal_actions(0), vec![forged.clone()]);
        assert!(
            g.apply_action(0, json!({"type":"browser_policy","profile":"military"}))
                .is_err()
        );
        let before = g.snapshot().unwrap();
        g.apply_action(0, forged).unwrap();
        assert_ne!(g.snapshot().unwrap(), before);
        assert!(BrowserProfile::parse("gr-economy/29").is_none());
        assert!(
            agent("gr-economy/29", [7; 32]).is_err(),
            "New agent creation must reject retired policies"
        );
        assert!(
            historical_agent("gr-economy/29", [7; 32]).is_ok(),
            "Historical replay dispatch remains available"
        );
    }
    #[test]
    fn browser_agents_require_registration() {
        let mut agent = BrowserAgent(BrowserProfile::Market);
        assert_eq!(
            agent.select_action(&Value::Null, &[json!({"type":"pass"})]),
            usize::MAX
        );
    }
    #[test]
    fn focused_military_is_a_distinct_browser_profile() {
        let profile = BrowserProfile::MilitaryFocused;
        assert_eq!(BrowserProfile::parse(profile.version()), Some(profile));
        assert_ne!(profile.version(), BrowserProfile::Military.version());
        let mut g = GalacticReach::new([7; 32]).unwrap();
        g.set_browser_profiles([Some(profile), None, None, None])
            .unwrap();
        let action = json!({"type":"browser_policy","profile":profile.name()});
        assert_eq!(g.legal_actions(0), vec![action.clone()]);
        g.apply_action(0, action).unwrap();
    }
}
