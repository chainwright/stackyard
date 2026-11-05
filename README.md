# Stackyard

Make a clickable lesson from one sentence. The **lesson file works offline**.

Inspired by HyperCard. Built for Kiroween 2026 with Kiro.

**Live app:** https://stackyard-sdqt.onrender.com

## What it is

A teacher types one sentence — "a 10-card quiz about the Vikings in Ireland, the
right answer plays a cheer" — and Stackyard builds a set of interactive lesson
cards (quiz, flashcards, a branching story, a score card). The teacher can edit
any card (move a button, change an answer, link a card to another) and then
**export the whole lesson as one self-contained HTML file**. That file plays on
any laptop from 2018 onward with no internet, no account and no install.

Two halves:

- **The Maker** (the editor) is a web app. It needs the server once, to generate
  and to export. Generation calls a model server-side; if the model is
  unavailable the Maker hands back a ready-made deck you can edit (and says so).
- **The Player** is the exported file. It is fully offline: all fonts and the
  runtime are inlined; it makes **zero network requests**.

"Works offline" means the **exported lesson file**, not the Maker.

## Why HyperCard

HyperCard let non-programmers build clickable, branching "stacks" in 1987 and
nothing really replaced it for them. Stackyard brings that back for a teacher
with patchy classroom Wi-Fi: the authoring input is a sentence, the output is a
scored lesson the class plays, every stack satisfies nine validity invariants so
it always plays to an end score, and the exported file is re-importable
(round-tripped losslessly, checked by a 1,000-run property test).

## Prior art (and what only Stackyard does)

- **Decker** (a modern HyperCard-tradition tool) exports one offline HTML with
  the runtime inside — but it has no generation and uses a scripting language.
- **H5P / Lumi** export an offline interactive activity for teachers — but
  authoring is form-based per content type, with no generation from a sentence
  and no free-form card editing.
- **AI quiz makers** turn a topic into a quiz — but they export to
  PDF/Word/platform links, need accounts, and give one-shot output you can't
  edit card by card.

What only Stackyard does: **a teacher's sentence → a validated, branching,
always-playable stack → direct card editing → one self-contained offline file.**

## Libraries and model

| Dependency | Role | Licence |
|---|---|---|
| Preact | the Maker UI (only runtime UI dependency) | MIT |
| tsx | run/transpile TypeScript for the server | MIT |
| Vite | dev server + builds (Maker SPA, player IIFE) | MIT |
| Vitest | test runner | MIT |
| fast-check | property-based tests | MIT |
| jsdom | DOM for player/UI tests | MIT |
| TypeScript | strict type checking | Apache-2.0 |

The generator calls an **OpenAI-compatible** chat endpoint, configured on the
live deploy for **Anthropic** (`STACKYARD_LLM_BASE_URL` / `STACKYARD_LLM_MODEL`).
The model is used **only in the Maker, at build time** — it never runs in, and
is never inlined into, the exported file. Fonts are listed under
[Third-party assets](#third-party-assets).

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

GitHub Actions (`.github/workflows/ci.yml`) runs `npm test`, `npx tsc --noEmit`
and `scripts/check-player-fresh.sh` on every push and pull request. The
freshness script rebuilds the player into a temporary directory and compares it
with the committed file:

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

## Run it / Deploy it

Stackyard runs as **one web service**: the same Node server serves the built
Maker SPA and answers the `/api` routes, so there is a single thing to deploy.

Run the production server locally:

```sh
npm ci
npm run build:player   # bundles the player runtime
npm run build:maker    # builds the Maker SPA into dist/maker
npm start              # serves dist/maker + /api on PORT (default 3001)
```

Then open `http://localhost:3001`. `npm start` sets `NODE_ENV=production`, which
turns on static serving. Without a model key the generator falls back to the
built-in ready-made decks, so the app still works offline.

Environment variables (server-only; the model key never reaches the browser):

| Variable | Purpose | Default |
|---|---|---|
| `STACKYARD_LLM_API_KEY` | Model API key (set in the host's dashboard, never committed) | — |
| `STACKYARD_LLM_BASE_URL` | OpenAI-compatible endpoint (live deploy uses Anthropic) | `https://api.openai.com/v1` |
| `STACKYARD_LLM_MODEL` | Model name | `gpt-4o-mini` |
| `PORT` | Port to listen on | `3001` |
| `TRUST_PROXY` | `1` behind a trusted proxy (e.g. Render), so a forwarding header is used for the client's rate-limit identity | off |
| `CLIENT_IP_HEADER` | the single-value client-IP header the proxy sets; on Render set to `cf-connecting-ip`. Falls back to the rightmost `X-Forwarded-For` entry (never the client-controlled leftmost) | — |
| `DEBUG_CLIENT_ADDR` | `1` logs the forwarding headers + chosen client address for the first few generate requests (temporary diagnostics) | off |
| `GENERATE_RATE_PER_10MIN` | Per-client generate limit per 10 minutes (schools share one address) | `20` |
| `EXPORT_RATE_PER_10MIN` | Per-client export limit per 10 minutes | `60` |
| `GENERATE_DAILY_CAP` | Global real model calls per UTC day; over the cap the app serves ready-made decks | `300` |

Because the public instance holds a paid key, `/api/generate` has two guards:

- a **per-client rate limit** — over it, the request gets a friendly **HTTP 429**
  with a `Retry-After` header and a plain message (not a deck); the Maker's
  start screen then offers ready-made decks you can open locally; and
- a **global daily budget** — once the day's real model calls are spent, the
  request is served from the offline ready-made decks and makes no model call.

A request that is served from a ready-made deck (budget spent, or no key) makes
no model call and does not consume a per-client rate-limit slot.

### Deploy to Render (free web service)

`render.yaml` is a one-service blueprint. In Render, choose **New → Blueprint**,
point it at this repo, and set `STACKYARD_LLM_API_KEY` in the dashboard (it is
`sync: false`, so it is never read from the repo). The build runs
`npm ci && npm run build:player && npm run build:maker`, the service starts with
`npm start`, and `/api/health` is the health check (a cheap keep-warm ping that
makes no model call).

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
