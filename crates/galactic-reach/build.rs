//! Counts the rules-changing entries waiting in `changes/` for the next release
//! (`compat: breaking` in an entry's front matter). A dev build of `main` names
//! its rules `<RULES>+dev.<count>`; see docs/release.md#dev-channel.
use std::{fs, path::Path};

fn main() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../changes");
    println!("cargo:rerun-if-changed={}", dir.display());
    let breaking = fs::read_dir(&dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|entry| entry.path())
        .filter(|p| p.extension().is_some_and(|e| e == "md"))
        .filter(|p| p.file_name().is_some_and(|n| n != "README.md"))
        .filter_map(|p| fs::read_to_string(p).ok())
        .filter(|text| {
            text.strip_prefix("---")
                .and_then(|rest| rest.split_once("\n---"))
                .is_some_and(|(front, _)| {
                    front
                        .lines()
                        .any(|line| line.trim().replace(' ', "") == "compat:breaking")
                })
        })
        .count();
    println!("cargo:rustc-env=GALACTIC_REACH_DEV_SERIES={breaking}");
}
