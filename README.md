# Stackyard

Make a clickable lesson from one sentence. Works offline.

Inspired by HyperCard. Built for Kiroween 2026 with Kiro.

## Development

Install dependencies with `npm ci`, then:

- `npm test` — rebuilds the player bundle and runs the full Vitest suite
  (unit, integration, and property tests). The suite includes a size guard
  that fails if the gzipped player bundle exceeds 50 KB.
- `npm run typecheck` — runs `tsc --noEmit` in strict mode.
- `npm run build:player` — bundles the player runtime
  (`src/player/`) into `dist/player/player.iife.js`.

### Keeping the player bundle fresh

The player runtime is pre-built into `dist/player/player.iife.js`, which is
committed to the repo so the exporter can inline it without re-bundling. After
changing anything under `src/player/`, rebuild and commit the bundle:

```sh
npm run build:player
```

CI runs `scripts/check-player-fresh.sh` to catch a stale bundle. The script
rebuilds the player into a temporary directory and compares it with the
committed file:

```sh
./scripts/check-player-fresh.sh
```

It exits `0` when the committed bundle matches a fresh build and `1` when they
differ (i.e. the source changed but the bundle was not rebuilt).
