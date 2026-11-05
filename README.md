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

### Screenshotting the Maker screens

`screens.html` + `src/screens-harness.tsx` render one Maker screen state at a
time (`?state=<name>`) so headless Chrome can capture them for comparison with
the mockups in `docs/design/maker/`. Two ways to shoot into
`docs/design/maker/built/`:

```sh
# With the dev server running (npm run dev:maker):
zsh scripts/shoot.sh [state ...]

# Without a server — build once, then shoot over file://:
npx vite build --base=./
zsh scripts/shoot-file.sh [state ...]
```

Each state is captured at 1366×768 (the target laptop) and 1920×1080 (a
classroom projector). `shoot-file.sh` passes Chrome `--allow-file-access-from-files`
so the built ES modules load from a `file://` URL.

## Third-party assets

Stackyard ships two open-source typefaces. Both are self-hosted (no CDN) as
Latin-subset `woff2` files and, in exported stacks, inlined as base64 inside
the single HTML file. The SIL Open Font License 1.1 lets us embed and
redistribute these fonts, but requires that the copyright notice and licence
travel with them, so the obligations below apply to this repo and to every
exported file.

| Font | Used as | Copyright | Licence | Reserved Font Name | Source |
|---|---|---|---|---|---|
| Bricolage Grotesque | Headings (`font-family: "Bricolage Grotesque"`) | Copyright 2022 The Bricolage Grotesque Project Authors | SIL Open Font License 1.1 | None | https://github.com/ateliertriay/bricolage |
| Atkinson Hyperlegible | Body text, shipped as a Latin subset under the renamed family `"Stackyard Reading"` | Copyright 2020 Braille Institute of America, Inc. | SIL Open Font License 1.1 | "Atkinson", "Hyperlegible" | https://github.com/googlefonts/atkinson-hyperlegible |

Full licence text (with each copyright line) lives next to the font files:

- `docs/design/maker/fonts/OFL-BricolageGrotesque.txt`
- `docs/design/maker/fonts/OFL-AtkinsonHyperlegible.txt`

The same `OFL-*.txt` files travel with the fonts when they move to
`src/assets/fonts/` for the app and player.

**Reserved Font Name note.** Atkinson Hyperlegible reserves the names
"Atkinson" and "Hyperlegible". Under the OFL, a subset deletes glyph
components and so counts as a Modified Version, which may not present a
Reserved Font Name to users. The subset is therefore referenced under the
non-reserved family name **"Stackyard Reading"**; only its codepoint coverage
is reduced, the outlines are unchanged. Bricolage Grotesque declares no
Reserved Font Name, so it keeps its name.

Both fonts are also disclosed in the Devpost "libraries / assets" list.
