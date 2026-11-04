#!/usr/bin/env bash
# scripts/check-player-fresh.sh
#
# Staleness check for the committed player bundle (TASK-18).
#
# Rebuilds the player IIFE into a temporary directory and compares it with the
# committed dist/player/player.iife.js. Exits non-zero if they differ — i.e.
# if the committed bundle is stale relative to src/player/**.
#
# Usage:  ./scripts/check-player-fresh.sh
# CI:     run after `npm ci`; a non-zero exit fails the build.

set -euo pipefail

# Resolve the repo root (this script lives in <root>/scripts/).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

COMMITTED="dist/player/player.iife.js"

if [[ ! -f "${COMMITTED}" ]]; then
  echo "check-player-fresh: committed bundle not found at ${COMMITTED}" >&2
  echo "check-player-fresh: run 'npm run build:player' and commit the result." >&2
  exit 1
fi

# Build into a temporary directory that is cleaned up on exit.
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

# Reuse the committed Vite config but redirect the output directory.
npx vite build --config vite.player.config.ts --outDir "${TMP_DIR}" >/dev/null 2>&1

FRESH="${TMP_DIR}/player.iife.js"

if [[ ! -f "${FRESH}" ]]; then
  echo "check-player-fresh: build did not produce ${FRESH}" >&2
  exit 1
fi

if cmp -s "${COMMITTED}" "${FRESH}"; then
  echo "check-player-fresh: OK — committed player bundle is up to date."
  exit 0
else
  echo "check-player-fresh: STALE — ${COMMITTED} differs from a fresh build." >&2
  echo "check-player-fresh: run 'npm run build:player' and commit the result." >&2
  exit 1
fi
