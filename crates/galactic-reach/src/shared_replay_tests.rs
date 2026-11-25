// Maintained replay coverage lives outside the byte-frozen native policy archive.
use super::*;
use crate::archived_rust::BuiltinAgent;

#[test]
fn heavy_shared_tables_resume_exactly_on_every_shared_revision() {
    use std::cell::RefCell;
    use std::rc::Rc;
    let snapshot = |g: &GalacticReach| {
        g.extend_deadline(SHARED_STEP);
        g.snapshot().unwrap()
    };
    for rules in SHARED_RULES {
        let log: Rc<RefCell<Vec<Vec<usize>>>> = Rc::default();
        let mut rng = StdRng::from_seed([9; 32]);
        let record = log.clone();
        let seats: [(String, bool); 4] = std::array::from_fn(|i| (format!("P{i}"), i < 2));
        let mut game = GalacticReach::shared(rules, &seats, 20, move |n, _| {
            let mut order: Vec<usize> = (0..n).collect();
            rand::seq::SliceRandom::shuffle(order.as_mut_slice(), &mut rng);
            record.borrow_mut().push(order.clone());
            order
        })
        .unwrap();
        assert_eq!(game.rules_version(), rules);
        let mut agents: Vec<BuiltinAgent> = (0..4)
            .map(|i| BuiltinAgent::new(Strategy::Economy, [i; 32]))
            .collect();
        let mut step = |g: &mut GalacticReach| {
            // Each command has the service's request budget, not a whole-replay clock.
            g.extend_deadline(SHARED_STEP);
            let seat = g.active_seat().unwrap();
            let legal = g.legal_actions(seat);
            let pick = agents[seat].select_action(&g.observe(seat).unwrap(), &legal);
            g.apply_action(seat, legal[pick].clone()).unwrap();
            legal[pick].clone()
        };
        for _ in 0..120 {
            step(&mut game);
        }
        let text = snapshot(&game);
        let used = log.borrow().len();
        let replay = log.clone();
        let mut next = used;
        let mut resumed = GalacticReach::shared_on(rules, &seats, 20, Some(&text), move |n, _| {
            let order = replay.borrow()[next].clone();
            assert_eq!(order.len(), n);
            next += 1;
            order
        })
        .unwrap();
        assert_eq!(
            snapshot(&resumed),
            text,
            "{rules}: resumed snapshot is identical"
        );
        for _ in 0..150 {
            let action = step(&mut game);
            resumed.extend_deadline(SHARED_STEP);
            let seat = resumed.active_seat().unwrap();
            resumed.apply_action(seat, action).unwrap();
        }
        assert_eq!(
            snapshot(&resumed),
            snapshot(&game),
            "{rules}: plays on identically"
        );
    }
}
