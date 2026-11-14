// Same stack as Perch's ZK adapter: the ZK verifier traps below ~48 KiB.
fn main() {
    if std::env::var("CARGO_CFG_TARGET_FAMILY").as_deref() == Ok("wasm") {
        println!("cargo:rustc-link-arg-cdylib=-zstack-size=131072");
    }
}
