#!/usr/bin/env bash
# Runs the in-app self-test under Xvfb and writes screenshots to docs/screenshots (Linux dev box).
set -e
cd "$(dirname "$0")/.."
OUT="${1:-$PWD/shots}"
rm -rf "$OUT"; mkdir -p "$OUT"
export MAMBA_SELFTEST="$OUT" MAMBA_SHOTS="$OUT" MAMBA_WINSIZE="${MAMBA_WINSIZE:-1500x940}" MAMBA_SHOW=1
xvfb-run -a -s "-screen 0 1600x1000x24" ./node_modules/.bin/electron . --no-sandbox --disable-gpu || true
cat "$OUT/mamba-selftest.txt"
grep -q "SELFTEST OK" "$OUT/mamba-selftest.txt"
