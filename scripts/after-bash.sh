#!/bin/sh
# scripts/after-bash.sh — run by the PostToolUse hook on execute_bash.
# Kiro's PostFileSave hooks do not fire for files written by a shell command
# (TASK-27: 167 of 179 tool calls were execute_bash, 0 hook firings). So when
# the command that just ran looks like it WROTE a file, re-run the invariant
# gate here. Reads the hook's JSON from stdin; other commands exit 0 at once.
#
# "Looks like a write" = any line of scripts/after-bash.patterns matches (sed -i,
# perl -i, python -, heredocs, node -e, tee, cat >, and any `> file` / `>> file`
# redirect, which covers echo/printf/cat/here-doc writes — TASK-29d). A redirect
# to /dev/null and `2>&1` do not count.
#
# AFTER_BASH_DRY_RUN=1 prints which way it would go instead of running npm (tests).

here="$(cd "$(dirname "$0")" && pwd)"
input="$(cat)"
if printf '%s' "$input" | sed 's#/dev/null##g' | grep -Eq -f "$here/after-bash.patterns"; then
  if [ "${AFTER_BASH_DRY_RUN:-}" = "1" ]; then
    echo "would-run"
    exit 0
  fi
  cd "$here/.." || exit 0
  npm run check:invariants >/dev/null 2>&1
  status=$?
  if [ "$status" -ne 0 ]; then
    echo "check:invariants failed after a shell edit — run it and fix before going on." >&2
    exit 1
  fi
elif [ "${AFTER_BASH_DRY_RUN:-}" = "1" ]; then
  echo "skip"
fi
exit 0
