#!/usr/bin/env bash
# Build src-tauri/icons/icon-dev.icns from icon-dev.png using macOS iconutil.
# Run after scripts/make-dev-icons.py regenerates the PNG variants.
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
src="$root/src-tauri/icons/icon-dev.png"
iconset="$(mktemp -d)/icon-dev.iconset"
trap 'rm -rf "$(dirname "$iconset")"' EXIT

if [[ ! -f "$src" ]]; then
  echo "missing $src — run scripts/make-dev-icons.py first" >&2
  exit 1
fi

if ! command -v sips >/dev/null || ! command -v iconutil >/dev/null; then
  echo "sips/iconutil required (macOS toolchain)" >&2
  exit 1
fi

mkdir -p "$iconset"
for size in 16 32 64 128 256 512; do
  sips -s format png -z "$size" "$size" "$src" --out "$iconset/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  if [[ "$double" -le 1024 ]]; then
    sips -s format png -z "$double" "$double" "$src" --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
  fi
done

iconutil -c icns "$iconset" -o "$root/src-tauri/icons/icon-dev.icns"
echo "wrote src-tauri/icons/icon-dev.icns"
