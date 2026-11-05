#!/bin/zsh
# Dev-only: shoot the built harness via file:// (no dev server needed).
# Requires a prior `npx vite build --base=./` so dist/maker uses relative asset
# paths, and Chrome's --allow-file-access-from-files so ES modules load from
# file://. Mirrors scripts/shoot.sh output into docs/design/maker/built/.
#   zsh scripts/shoot-file.sh [state ...]
set -e
cd "$(dirname "$0")/.."

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT="docs/design/maker/built"
BASE="file://$(pwd)/dist/maker/screens.html"
mkdir -p "$OUT"

ALL=(start-empty start-generating start-error editor-quiz editor-flash editor-story editor-end editor-invalid play export-done)
STATES=(${@:-$ALL})

shoot_one() {
  local state=$1 w=$2 h=$3 out=$4
  "$CHROME" --headless=new --hide-scrollbars --force-device-scale-factor=1 \
    --allow-file-access-from-files \
    --window-size=$w,$h \
    --virtual-time-budget=3000 \
    --screenshot="$out" \
    "$BASE?state=$state" > /dev/null 2>&1
}

for s in $STATES; do
  shoot_one "$s" 1366 768  "$OUT/$s.png"
  shoot_one "$s" 1366 768  "$OUT/${s}_1366x768.png"
  shoot_one "$s" 1920 1080 "$OUT/${s}_1920x1080.png"
  echo "shot $s"
done
