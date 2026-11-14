#!/usr/bin/env bash
# Bundle the Testnet seat and copy the browser prover into the served game
# directory (default dist/galactic-reach/zk). Called by scripts/build-web.sh.
set -euo pipefail
cd "$(dirname "$0")"
out="${1:-../dist/galactic-reach/zk}"
[ -d node_modules/@aztec/bb.js ] || npm ci --no-audit --no-fund
mkdir -p "$out/vendor"
node_modules/.bin/esbuild web/seat.mjs --bundle --format=esm --platform=browser --outfile="$out/seat.js" \
  --external:@aztec/bb.js --external:@noir-lang/noir_js --inject:web/buffer-shim.js --define:global=globalThis --log-level=warning
cp web/seat.css web/gr_draw.json "$out/"
rm -rf "$out/vendor"/*
cp -R node_modules/@aztec/bb.js/dest/browser "$out/vendor/bb.js"
cp -R node_modules/@noir-lang/noir_js/lib "$out/vendor/noir_js"
cp -R node_modules/@noir-lang/acvm_js/web "$out/vendor/acvm_js"
cp -R node_modules/@noir-lang/noirc_abi/web "$out/vendor/noirc_abi"
mkdir -p "$out/vendor/pako" && cp node_modules/pako/dist/pako.esm.mjs "$out/vendor/pako/"
