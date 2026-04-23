#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NOTCH_DIR="$ROOT_DIR/native/PinStackNotch"

if [[ ! -d "$NOTCH_DIR" ]]; then
  echo "[build-notch] Missing directory: $NOTCH_DIR" >&2
  exit 1
fi

if ! command -v swift >/dev/null 2>&1; then
  echo "[build-notch] swift not found in PATH" >&2
  exit 1
fi

cd "$NOTCH_DIR"
echo "[build-notch] Building PinStackNotch (release)..."
swift build -c release

echo "[build-notch] Build finished: $NOTCH_DIR/.build/release/PinStackNotch"
