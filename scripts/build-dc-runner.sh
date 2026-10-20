#!/usr/bin/env bash
# Builds the standalone dc-runner executable: esbuild bundle -> SEA blob -> inject into a copy
# of the node binary. Run this INSIDE the Linux build container (dc-runner-build.Dockerfile) —
# the produced binary embeds whatever `node` binary is present at injection time, so running
# this script directly on a contributor's own machine would produce a binary for THEIR OS, not
# the Linux servers DC customers actually run on.
set -euo pipefail

OUT_DIR="dist/dc-runner"
mkdir -p "$OUT_DIR"

VERSION="$(node -p "require('./package.json').version")"
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

echo "Building dc-runner v$VERSION ($COMMIT)..."

# 1. Bundle the CLI + every import (including pg/mysql2, which are pure JS — no native addons)
#    into one CommonJS file. --platform=node keeps Node builtins (fs, net, tls, crypto,
#    readline) unbundled, since those exist inside the target runtime already.
npx esbuild dc-runner/cli.js \
  --bundle \
  --platform=node \
  --target=node24 \
  --format=cjs \
  --define:__DC_RUNNER_VERSION__="\"$VERSION\"" \
  --define:__DC_RUNNER_COMMIT__="\"$COMMIT\"" \
  --outfile="$OUT_DIR/bundle.cjs"

# 2. Generate the SEA blob from the bundle, per dc-runner/sea-config.json.
node --experimental-sea-config dc-runner/sea-config.json

# 3. Copy the CURRENT node binary. This must be the binary running inside this build
#    (container/CI runner) — never a contributor's own OS's node.
BINARY_NAME="dc-runner-linux-x64"
cp "$(command -v node)" "$OUT_DIR/$BINARY_NAME"

# 4. Inject the blob into the binary copy. (No codesign step here — that's a macOS-only
#    requirement for local testing; Linux binaries need no signature at all.)
npx postject "$OUT_DIR/$BINARY_NAME" NODE_SEA_BLOB "$OUT_DIR/sea-prep.blob" \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

chmod +x "$OUT_DIR/$BINARY_NAME"

# 5. Ship the readable source alongside the binary, so a customer's security team can review
#    exactly what will run against their database before running the compiled binary.
tar czf "$OUT_DIR/dc-runner-source.tar.gz" dc-runner/*.js checks stats.js dbConnection.js public/js/report.js

( cd "$OUT_DIR" && sha256sum "$BINARY_NAME" "dc-runner-source.tar.gz" > SHA256SUMS )

echo "Done. Artifacts in $OUT_DIR/:"
ls -la "$OUT_DIR"
