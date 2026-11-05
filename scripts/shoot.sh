#!/bin/zsh
# Capture Maker screen states with headless Chrome for comparison with the
# docs/design/maker mockups. Usage: zsh scripts/shoot.sh [state ...]
# With no args, shoots every state.
#
# Each state is captured at BOTH target resolutions:
#   - 1366x768  (the stated target laptop) → built/<state>.png and
#                                             built/<state>_1366x768.png
#   - 1920x1080 (a classroom projector)    → built/<state>_1920x1080.png
# The unsuffixed file stays the 1366x768 shot so existing references keep working.
set -e
cd "$(dirname "$0")/.."

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT="docs/design/maker/built"
BASE="http://localhost:5173/screens.html"
mkdir -p "$OUT"

ALL=(start-empty start-generating start-error editor-quiz editor-flash editor-story editor-end editor-invalid play export-done)
STATES=(${@:-$ALL})

shoot_one() {
  local state=$1 w=$2 h=$3 out=$4
  "$CHROME" --headless=new --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=$w,$h \
    --virtual-time-budget=1500 \
    --screenshot="$out" \
    "$BASE?state=$state" > /dev/null 2>&1
}

for s in $STATES; do
  shoot_one "$s" 1366 768  "$OUT/$s.png"
  shoot_one "$s" 1366 768  "$OUT/${s}_1366x768.png"
  shoot_one "$s" 1920 1080 "$OUT/${s}_1920x1080.png"
  echo "shot $s -> $OUT/$s.png (+ _1366x768, _1920x1080)"
done
