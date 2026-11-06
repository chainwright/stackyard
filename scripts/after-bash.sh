#!/bin/sh
# scripts/after-bash.sh — run by the PostToolUse hook on execute_bash.
# Kiro's PostFileSave hooks do not fire for files written by a shell command
# (TASK-27: 167 of 179 tool calls were execute_bash, 0 hook firings). So when
# the command that just ran looks like it WROTE a file, re-run the invariant
# gate here. Reads the hook's JSON from stdin; other commands exit 0 at once.

input="$(cat)"
if printf '%s' "$input" | grep -Eq 'sed -i|python3? +-|python3? <<|cat *>|tee |perl -p?i|>> *[a-zA-Z./]|node -e'; then
  cd "$(dirname "$0")/.." || exit 0
  npm run check:invariants >/dev/null 2>&1
  status=$?
  if [ "$status" -ne 0 ]; then
    echo "check:invariants failed after a shell edit — run it and fix before going on." >&2
    exit 1
  fi
fi
exit 0
