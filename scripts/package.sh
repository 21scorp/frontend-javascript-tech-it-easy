#!/usr/bin/env bash
# Package WISP for itch.io / any static host: one self-contained zip.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="wisp-$(grep -oP 'BUILD: "\K[^"]+' js/config.js).zip"
rm -f "$OUT"
zip -qr "$OUT" \
  index.html manifest.webmanifest sw.js \
  css js assets \
  -x "*.DS_Store"
echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"
