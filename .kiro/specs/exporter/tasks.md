# Exporter & Player Runtime — Tasks

## Implementation order

Tasks are grouped into five phases. Complete each phase before starting the
next; later phases depend on types and contracts defined earlier.

---

## Phase 1 — Shared foundation (already exists)

### TASK-01: Verify and extend the shared foundation in `src/shared/`

`src/shared/types.ts` and `src/shared/validator.ts` already exist and are the
source of truth for all type definitions and the eight-invariant `validate()`
function. Do not recreate them.

Instead, do the following:

1. **Add invariant 9 to `src/shared/validator.ts`** — after the existing eight
   checks, add a cycle-detection pass over the directed graph of card-level
   `goto` actions (edges from `card.actions`, not button actions). Use
   iterative DFS with a three-colour visited set. If a back-edge is found, add
   `"goto-cycle"` to the errors array.

2. **Add `ExportValidationError` to `server/exporter.ts`** (not to
   `src/shared/`) — a typed subclass of `Error` that carries an
   `errors: string[]` field populated from `ValidationResult.errors`. The
   exporter wraps every failed `validate()` result in this class before
   throwing; it never throws a plain `Error` for validation failures.

3. **Extend `tests/validator.property.test.ts`** — add property-based tests
   for invariant 9:
   - An arbitrary that generates stacks with randomly constructed card-level
     goto graphs that contain at least one cycle; assert `validate()` always
     returns `{ valid: false, errors }` with `"goto-cycle"` in `errors`.
   - An arbitrary that generates stacks with card-level goto graphs that are
     acyclic (or absent); assert `validate()` never returns `"goto-cycle"`.
   - Run at least 500 examples for each.

**Done when:**

- `validate()` rejects a two-card cycle (A → B → A via card-level actions) with
  `"goto-cycle"` in `errors`.
- `validate()` accepts a linear chain (A → B → end) with no `"goto-cycle"`.
- The new property tests pass with zero failures.
- The existing eight-invariant property tests continue to pass unchanged.

✅ **Done** — invariant 9 added to `src/shared/validator.ts` (iterative DFS, three-colour),
`ExportValidationError` added to `server/exporter.ts`, property tests for invariant 9
added to `tests/validator.property.test.ts` (500 runs each). All 146 tests green, typecheck clean.

---

## Phase 2 — Player runtime

### TASK-04: Scaffold the player Vite build config (`vite.player.config.ts`)

Create a separate Vite config that:

- Sets `lib.entry` to `src/player/index.ts`
- Sets `lib.formats` to `['iife']`
- Sets `lib.name` to `StackyardPlayer`
- Sets `build.target` to `es2018`
- Sets `build.minify` to `true`
- Outputs to `dist/player/player.iife.js`

Add a `build:player` script to `package.json`.

**Done when:** `npm run build:player` completes without error and
`dist/player/player.iife.js` exists.

✅ **Done** — `vite.player.config.ts` created (IIFE, es2018, minify, output to `dist/player/player.iife.js`),
`build:player` script added to `package.json`. `npm run build:player` succeeds; output is 5.38 kB gzipped.

---

### TASK-05: Implement `src/player/runtime.ts`

Define `RuntimeState` (interface with `stack`, `variables`, `currentCardId`).
Implement:

- `createRuntime(stack: Stack): RuntimeState` — initialises `variables` with
  `score: 0` and `currentCardId` set to `stack.cards[0].id`.
- `dispatch(actions: Action[], state: RuntimeState, navigate: (id: string) => void): void` —
  processes each action in order. A `goto` action calls `navigate` and stops
  further processing. `score` adds to `state.variables.score`. `set` assigns
  to `state.variables`. `sound` is passed to a callback (injected dependency).

**Done when:** Unit tests in `tests/runtime.test.ts` cover all four action
types, the `goto`-terminates-early behaviour, and the score accumulation across
multiple dispatches.

✅ **Done** — `src/player/runtime.ts` implemented (`RuntimeState`, `createRuntime()`,
`dispatch()` with all four action types and goto-terminates-early). 24 unit tests in
`tests/runtime.test.ts` all pass. Typecheck clean.

---

### TASK-06: Implement `src/player/scaler.ts`

Implement `applyScaling(root: HTMLElement): () => void`:

- Sets `root` to 800 × 600 px with `position: relative`.
- Computes `factor = min(window.innerWidth / 800, window.innerHeight / 600)`.
- Applies `transform: scale(factor)` and `transform-origin: top left` to
  `root`.
- Attaches a `ResizeObserver` to `document.body` to recompute on resize.
- Returns a cleanup function that disconnects the observer.

**Done when:** Unit tests in `tests/scaler.test.ts` assert correct `factor`
values for at least three viewport sizes (1920×1080, 1024×768, 320×480).

✅ **Done** — `src/player/scaler.ts` implemented (`applyScaling()` with ResizeObserver).
9 unit tests in `tests/scaler.test.ts` cover 1920×1080, 1024×768, 320×480, 800×600, plus
position/dimensions/cleanup. All pass.

---

### TASK-07: Implement `src/player/renderer.ts`

Implement `renderCard(card: Card, root: HTMLElement, state: RuntimeState, navigate: (id: string) => void): void`:

- Clears `root.innerHTML`.
- For each element in `card.elements`, creates the appropriate DOM node:
  - `text` → `<p>` with `textContent = element.content`
  - `button` → `<button>` with `textContent = element.label`; on click, call
    `dispatch(element.actions, state, navigate)`
  - `image` → `<img>` with `src = element.src` and `alt = element.alt`
  - `field` → `<span>` with `textContent = String(state.variables[element.variable] ?? '')`
- Positions each element absolutely using `element.x`, `element.y`, `element.w`,
  `element.h`.
- Never uses `innerHTML` with stack-derived content; uses `.textContent` and
  `.setAttribute` only.

**Done when:** Unit tests in `tests/renderer.test.ts` assert the correct DOM
node type, position attributes, and text content for one example of each
element type; and assert that `field` shows an empty string for an unset
variable.

✅ **Done** — `src/player/renderer.ts` implemented with full design-system compliance:
paper/ink/rule/stamp tokens, ring holes, 3 offset card edges, shaped answer tiles (▲◆●■) with
fixed colours, `CORRECT ✓` stamp overlay at -8deg with stamp-land animation, tile shake for
wrong answers, prefers-reduced-motion, aria-live region. 16 unit tests in
`tests/renderer.test.ts` cover all four element types, positioning, quiz tiles, and a11y.

---

### TASK-08: Implement `src/player/audio.ts`

Implement `playSound(sound: 'cheer' | 'buzz'): void`:

- Uses `AudioContext` (or `webkitAudioContext`) and `OscillatorNode` +
  `GainNode` to synthesise a short tone.
- Cheer: rising pitch, ~0.5 s.
- Buzz: low flat tone, ~0.5 s.
- Wraps the entire function body in try/catch; logs nothing, throws nothing on
  failure.

**Done when:** The function exists, compiles, and a unit test confirms it does
not throw when `AudioContext` is stubbed to throw on construction.

✅ **Done** — `src/player/audio.ts` implemented (cheer: rising 440→880 Hz triangle wave,
buzz: 150 Hz sawtooth, both 0.5 s, wrapped in try/catch). Tests in
`tests/player.index.test.ts` confirm it does not throw when `AudioContext` is unavailable
or throws on construction.

---

### TASK-09: Implement `src/player/errors.ts`

Implement `showFatalError(root: HTMLElement): void`:

- Clears `root`.
- Appends a single `<p>` with `textContent`:
  `"Something went wrong. Please ask your teacher to check the file."`
- No stack trace, no error codes — consistent with `audience.md`.

**Done when:** Unit test asserts the exact message text appears in the DOM.

✅ **Done** — `src/player/errors.ts` implemented (`showFatalError()` renders
`"Something went wrong. Please ask your teacher to check the file."`).
Tests in `tests/player.index.test.ts` verify exact message text and content clearing.

---

### TASK-10: Implement `src/player/index.ts` (player entry point)

Wire up all player modules:

1. On `DOMContentLoaded`, read `document.getElementById('stack-data').textContent`.
2. Parse the JSON; call `validate()` on the result.
3. Call `createRuntime(stack)`.
4. Call `applyScaling(root)`.
5. Define `navigateTo(cardId, automatic: boolean)`:
   a. If `automatic` is `true`, increment `state.autoNavCount`; if
      `state.autoNavCount > 20`, call `showFatalError(root)` and return.
   b. If `automatic` is `false`, reset `state.autoNavCount` to `0`.
   c. Look up the card; call `showFatalError(root)` if not found.
   d. Call `renderCard(card, root, state, navigateTo)`.
   e. Call `dispatch(card.actions, state, (id) => navigateTo(id, true))` for
      card-level actions.
6. Call `navigateTo(state.currentCardId, false)`.

Button click handlers must call `navigateTo(id, false)` (user-initiated), not
the automatic variant.

If anything throws before step 6, call `showFatalError(root)`.

**Done when:** `npm run build:player` succeeds, the IIFE is ≤ 50 KB gzipped
(assert in a build-time test or CI step), a smoke test using jsdom confirms
the player initialises without error for a minimal valid stack, and unit tests
in `tests/runtime.test.ts` confirm:
- After 20 consecutive automatic navigations the fatal error is shown and no
  further navigation occurs.
- A user-initiated navigation after 15 automatic ones resets the counter.

✅ **Done** — `src/player/index.ts` implemented. Wires all modules on `DOMContentLoaded`.
`navigateTo(id, automatic)` increments `state.autoNavCount` on automatic navigations,
resets to 0 on user-initiated ones, and calls `showFatalError()` when count exceeds 20.
`npm run build:player` succeeds; gzipped IIFE is 5.38 kB (≤ 50 KB). 9 tests in
`tests/player.index.test.ts` cover the cap (>20 stops + shows error, exact visited count)
and counter reset after 15 auto-navs. All 180 tests green, typecheck clean.

---

## Phase 3 — Exporter

### TASK-11: Implement `server/inline-assets.ts`

Implement `inlineImages(stack: Stack, assetsDir: string): Promise<Stack>`:

- Returns a deep copy of the stack.
- For every `image` element, branches on `element.src`:
  - **`data:` URI** — leave unchanged; do not touch the filesystem.
  - **Relative path** — resolve it safely against `assetsDir`:
    1. Reject any `src` that is an absolute path (starts with `/` or matches
       a platform absolute pattern); throw `ExportValidationError` with
       `"path-traversal"` in `errors`.
    2. Resolve: `const resolved = path.resolve(assetsDir, element.src)`.
    3. Verify `resolved` starts with `assetsDir + path.sep`; if not, throw
       `ExportValidationError` with `"path-traversal"` in `errors`.
    4. Call `fs.realpath(resolved)` and verify the real path also starts with
       `assetsDir + path.sep`; if not, throw `ExportValidationError` with
       `"path-traversal"` in `errors` (catches symlinks that escape the
       directory).
    5. Read the file and convert to a base64 data URI
       (`data:<mime>;base64,<data>`).
- Does not mutate the input stack.
- Throws `ExportValidationError` (not a plain `Error`) for path security
  violations so the caller can handle them uniformly.

**Done when:** Unit tests in `tests/inline-assets.test.ts` cover:
- Already-data-URI case: no-op, filesystem not touched.
- Relative path inside `assetsDir`: file is read and replaced with data URI.
- Path with `..` escaping `assetsDir`: throws `ExportValidationError` with
  `"path-traversal"`.
- Absolute path: throws `ExportValidationError` with `"path-traversal"`.
- Symlink whose real path is outside `assetsDir`: throws `ExportValidationError`
  with `"path-traversal"`.
- Non-existent file inside `assetsDir`: rejects with a descriptive error.

✅ **Done** — `server/inline-assets.ts` implemented. `inlineImages()` deep-copies via
`structuredClone`, passes `data:` URIs through untouched (filesystem never read), rejects
absolute paths and `..` escapes with `ExportValidationError("path-traversal")`, and re-checks
`fs.realpath` against a canonicalised base to catch symlink escapes (macOS `/var`→`/private/var`
handled). Missing files raise a plain "Asset not found" error. 8 unit tests in
`tests/inline-assets.test.ts` cover all six listed cases. Typecheck clean.

---

### TASK-12: Implement `server/html-template.ts`

Implement `buildHtml(options: { title: string; stackJson: string; playerIife: string }): string`:

- Returns the HTML string from the template in `design.md`.
- Escapes `stack.title` for use as the `<title>` content (no raw `<` or `>`).
- Does not use a templating library — plain string assembly is fine given the
  limited substitution points.

**Done when:** Unit test asserts the output contains `<title>`, `#stack-data`,
and the player IIFE content, and that the `<title>` value is correctly escaped.

✅ **Done** — `server/html-template.ts` implemented. `buildHtml()` assembles the
`design.md` document (doctype, `<html lang="en">`, inlined shell CSS, `#player-root`,
inert `#stack-data` JSON block, IIFE `<script>`) by plain string concatenation — no
templating library. The title is HTML-escaped (`&`, `<`, `>`, `"`, `'`). 7 unit tests in
`tests/html-template.test.ts` assert the doctype, `<title>`, `#stack-data`, verbatim IIFE,
`#player-root`, and title escaping. Typecheck clean.

---

### TASK-13: Implement `server/exporter.ts`

Define `ExportValidationError` as a typed subclass of `Error` with an
`errors: string[]` field. This class is the single error type thrown for all
validation and path-security failures in the export pipeline.

Implement `exportStack(stack: Stack): Promise<string>`:

1. Call `validate(stack)` from `src/shared/validator.ts`. If the result is
   `{ valid: false, errors }`, throw `new ExportValidationError(errors)`.
2. Call `inlineImages(stack, assetsDir)` to get `inlinedStack`. Any
   `ExportValidationError` from `inlineImages` propagates unchanged.
3. `JSON.stringify(inlinedStack)` using a replacer that escapes `<`, `>`, `/`
   to their `\uXXXX` equivalents (`\u003c`, `\u003e`, `\u002f`). This ensures
   no raw `https://` or `</script>` can appear in the embedded JSON.
4. Read `dist/player/player.iife.js` from disk.
5. Call `buildHtml({ title: stack.title, stackJson, playerIife })`.
6. Return the resulting string.

No environment variables are read inside this module.

**Done when:** Unit tests in `tests/exporter.test.ts` cover:
- Throws `ExportValidationError` for at least three invariant failures; each
  time `error.errors` contains the expected code (`"end-card-count"`,
  `"invalid-goto"`, `"duplicate-id"`).
- Returns a non-empty string for a valid stack.
- The returned string contains `<!doctype html>`.

✅ **Done** — `server/exporter.ts` `exportStack()` implemented. Validates via
`validate()` and wraps any failure in `ExportValidationError` (never a plain `Error`);
calls `inlineImages(stack, assetsDir)` (default `assetsDir` = project `assets/`, resolved
from `import.meta.url`, no env vars); serialises with `JSON.stringify` then escapes
`<`→`\u003c`, `>`→`\u003e`, `/`→`\u002f` so no raw `</script>` or `https://` survives while
`JSON.parse` round-trips exactly; reads `dist/player/player.iife.js`; returns
`buildHtml(...)`. 8 unit tests in `tests/exporter.test.ts` cover the three invariant failures
(`end-card-count`, `invalid-goto`, `duplicate-id`) with the expected codes, the
`ExportValidationError` type, a non-empty string, `<!doctype html>`, and the escaped-JSON
round-trip. Full suite 224 tests green; typecheck clean.

---

## Phase 4 — Security and correctness tests

### TASK-14: No-external-URLs test (`tests/exporter.test.ts`)

Add a test that exports a valid stack (with one image element using a data URI)
and asserts:

- The resulting HTML string does not match `/https?:\/\//`.

**Done when:** Test passes and is run as part of `vitest run`.

✅ **Done** — "no external URLs (TASK-14)" test added to `tests/exporter.test.ts`: exports a
valid stack with a data-URI image element and asserts the HTML matches no `/https?:\/\//`.
Removed the redundant `xmlns="http://www.w3.org/2000/svg"` from the four inline answer-tile
SVGs in `src/player/renderer.ts` (not needed when SVG is injected via `innerHTML` into an HTML
document) and rebuilt the player bundle, so the exported file now contains zero URLs. Full
suite green (228 tests); typecheck clean.

---

### TASK-15: No-API-key test (`tests/exporter.test.ts`)

Add a test that:

1. Sets `process.env.STACKYARD_LLM_API_KEY` to a known sentinel string
   (`"sk-test-sentinel-value-do-not-use"`) before exporting.
2. Exports a valid stack.
3. Asserts the sentinel string does not appear anywhere in the HTML output.

**Done when:** Test passes regardless of whether the env variable is normally
set in the development environment.

✅ **Done** — "no API key in output (TASK-15)" test added to `tests/exporter.test.ts`: sets
`process.env.STACKYARD_LLM_API_KEY` to the sentinel `"sk-test-sentinel-value-do-not-use"`,
exports a valid stack, and asserts the sentinel does not appear in the HTML. The env var is
saved and restored in a `finally` block so the test leaves no side effect. Passes whether or
not the var is pre-set (the exporter reads no env vars). Full suite green; typecheck clean.

---

### TASK-15b: URL-escaping round-trip test (`tests/exporter.test.ts`)

Add a test that:

1. Creates a valid stack where at least one card's text element contains the
   string `"Visit https://example.com for more."`.
2. Exports the stack via `exportStack()`.
3. Asserts the raw HTML string contains zero occurrences of `"https://"`.
4. Extracts the text content of `#stack-data` from the HTML string and parses
   it with `JSON.parse`.
5. Asserts the parsed card text is exactly `"Visit https://example.com for more."`
   (i.e., the JSON round-trip restores the original URL).
6. Repeats steps 1–5 substituting `"http://"` for `"https://"`.

**Done when:** Both assertions (no raw URL in HTML, exact value after parse)
pass for both `https://` and `http://` variants.

✅ **Done** — "URL escaping round-trip (TASK-15b)" test added to `tests/exporter.test.ts`,
parametrised over `https://` and `http://`. Sets a card's text to
`"Visit <scheme>example.com for more."`, exports, asserts the raw HTML contains zero
occurrences of the scheme, then extracts `#stack-data`, `JSON.parse`s it, and asserts the
parsed card text equals the original byte-for-byte (the `\u002f` escapes restore to `/`).
Both variants pass (2 cases). Full suite green (228 tests); typecheck clean.

---

## Phase 5 — Round-trip property test

### TASK-16: Round-trip property test (`tests/roundtrip.property.test.ts`)

Using fast-check:

1. Define (or reuse from TASK-01) an arbitrary that generates valid `Stack`
   documents with varied card counts, element types, and action combinations.
2. For each generated stack:
   a. Call `exportStack(stack)`.
   b. Extract the text content of `#stack-data` from the HTML string
      (use a regex or a minimal HTML parser — no browser needed).
   c. Parse the JSON.
   d. Assert deep equality with the original stack.
3. Run at least 1,000 examples (`{ numRuns: 1000 }`).

**Done when:** `vitest run tests/roundtrip.property.test.ts` reports zero
failures across all runs.

✅ **Done** — `tests/roundtrip.property.test.ts` created. A fast-check arbitrary generates
valid stacks with 1–5 content cards (quiz/story/flash in any mix) wired into a linear,
acyclic goto chain to a single end card, varied non-button elements (text with tricky
chars incl. URLs, `</script>`, quotes, emoji; data-URI images; score fields), optional
card-level auto-advance and sound actions, and a uniqueness filter so every stack passes
`validate()`. For each: `exportStack()` → regex-extract `#stack-data` → `JSON.parse` →
`expect(parsed).toEqual(stack)`. Runs `{ numRuns: 1000 }`, zero failures; typecheck clean.

---

## Phase 6 — CI and size guard

### TASK-17: Player bundle size assertion

Add a Vitest test (or a standalone Node script invoked from `package.json`)
that:

1. Reads `dist/player/player.iife.js`.
2. Compresses it with Node's built-in `zlib.gzipSync` at default level.
3. Asserts the compressed size is ≤ 51,200 bytes.

Add this check to the `test` script in `package.json` so it fails the build
if the budget is exceeded.

**Done when:** The check passes after TASK-10 and is re-run after every
`build:player`.

✅ **Done** — `tests/player-size.test.ts` reads `dist/player/player.iife.js`, gzips it with
Node's built-in `zlib.gzipSync` at the default level, and asserts the compressed size is
≤ 51,200 bytes (current: ~6.4 kB). The `test` script in `package.json` is now
`"npm run build:player && vitest run"`, so the bundle is rebuilt and re-checked on every
`npm test`. `npm test` passes (230 tests); typecheck clean.

---

### TASK-18: Staleness check for the committed player bundle

Add a CI script (`scripts/check-player-fresh.sh`) that:

1. Runs `npm run build:player` into a temp directory.
2. Compares the output with the committed `dist/player/player.iife.js`.
3. Exits non-zero if they differ.

Document the script in the root `README.md` under a "Development" section.

**Done when:** The script exits 0 when the source and bundle are in sync, and
exits 1 after any source change that has not been rebuilt.

✅ **Done** — `scripts/check-player-fresh.sh` (executable) rebuilds the player via
`npx vite build --config vite.player.config.ts --outDir <tmp>` into a `mktemp -d` directory
(cleaned up with a `trap`), then `cmp -s` against the committed
`dist/player/player.iife.js`; exits 0 if identical, 1 if they differ or the committed bundle
is missing. Verified: in-sync → exit 0; after changing the error-message string in
`src/player/errors.ts` → exit 1; reverted → exit 0 again. Documented under a "Development"
section in the root `README.md`. No new dependencies (uses Vite's own CLI).

---

## Phase 7 — Derived card chrome

### TASK-19: Draw derived "Card N of M" meta, standing rings, and running score (REQ-PLY-11)

A stack generated by the LLM or the fallback builder has no meta element, so the
player showed no "Card N of M" line. Add this as chrome **derived** by the
renderer from the deck position and runtime state — never stored in the stack,
so the stack format and the round-trip are unchanged.

1. **`src/player/renderer.ts`** — add an optional `chrome: { position?, total? }`
   parameter to `renderCard`. When both are present and the card is not an
   `end` card, draw a `.sy-meta-chrome` line reading `"Card <position> of
   <total>"` (class `.sy-meta`, 20px, top-left). Always draw the two standing
   binder-ring loops (`.sy-rings`) as a sibling of `.sy-card` (so the card's
   `overflow: hidden` does not clip them) with a punched hole beneath each loop
   aligned to the loop. When `state.variables.score` is a number, draw a
   `.sy-score-chrome` "Score N" pill top-right. Set `--text-meta` to 20px so the
   line stays ≥ 18px at the 0.9 minimum scale.
2. **`src/player/mount.ts`** — compute the deck position (1-based among non-end
   cards) and pass it as `chrome` to `renderCard`. The end card gets `{}`.
3. **`src/editor/Canvas.tsx`** — pass the same derived `chrome` and delete the
   editor-only `addRings` / `restyleMetaText` hacks; the renderer now owns both,
   so the editor preview and the player draw identical chrome from one place.
4. **`server/fallback.ts`** — lay content out below the top chrome band
   (question at y ≈ 104, answer tiles at y ≈ 296/424) so the derived meta and
   score never overlap the content. No format change.
5. **`src/editor/demoStack.ts`** — drop the baked "Card N of 10" meta text
   elements; the renderer derives them now.
6. Tests: extend `tests/renderer.test.ts` (meta shown with chrome, absent
   without, not a stored element, two sibling rings, end card has no meta,
   live score, `--text-meta: 20px`) and `tests/player/mount.test.ts` (mount
   derives "Card 1 of 2" from the deck).

**Done when:**

- The exported player and Play mode draw the "Card N of M" meta line, standing
  rings, and running score for a generated stack, matching the play mockups.
- A real fallback stack, exported and opened in headless Chrome at 1366×768 and
  1920×1080, shows the chrome and matches `docs/design/maker/play.html` by eye.
- `npm test` and `npx tsc --noEmit` are clean; the player bundle stays
  ≤ 50 KB gzipped and `scripts/check-player-fresh.sh` passes.
- The round-trip property test still passes with zero loss (no stored element
  added).

✅ **Done** — `renderCard` takes a derived `chrome` arg and draws the
`.sy-meta-chrome` "Card N of M" line, `.sy-rings` standing loops (sibling of the
card, holes aligned beneath), and a `.sy-score-chrome` "Score N" pill;
`--text-meta` raised to 20px. `mountPlayer` and `Canvas` derive the deck
position and pass it; the editor's `addRings`/`restyleMetaText` hacks were
removed. `fallback.ts` lays content below the chrome band; `demoStack.ts` drops
the baked meta. 8 new tests (renderer + mount). Verified by exporting a fallback
stack and a quiz stack and screenshotting the `file://` player at 1366×768 and
1920×1080 — meta, rings, score, and four tiles all render and match the play
mockup. Player bundle 7.1 kB gzipped; staleness check green; round-trip property
test unchanged. 401 tests green, typecheck clean.

---

## Task dependency summary

```
TASK-01 (extend shared foundation: invariant 9 + ExportValidationError)
  │
  ├─ TASK-05 (runtime)  ─┐
  ├─ TASK-06 (scaler)    ├─ TASK-10 (player entry — with loop guard)
  ├─ TASK-07 (renderer)  │    └─ TASK-04 (vite config)
  ├─ TASK-08 (audio)    ─┘    └─ TASK-17 (size guard)
  ├─ TASK-09 (errors)
  ├─ TASK-11 (inline assets — with path security)
  └─ TASK-12 (html template)
       └─ TASK-13 (exporter — ExportValidationError)
            ├─ TASK-14 (no-URLs test)
            ├─ TASK-15 (no-API-key test — STACKYARD_LLM_API_KEY)
            ├─ TASK-15b (URL-escaping round-trip test)
            ├─ TASK-16 (round-trip property test)
            └─ TASK-18 (staleness check)
```


---

## Phase 6 — The living file (TASK-24)

### TASK-24: the exported HTML can edit itself, offline
**Refs:** `judge_2026-11-05/J3_wow_design.md` §5 ("make the exported file edit itself, offline… HyperCard's defining trait brought back, and it removes the dependence on the server"); REQ-EXP-01 (self-contained, zero network); stack-format.md invariants 1–9.

**What it is.** A second export shape — the *living file* — that still plays
exactly as the class file does (default view = **Play**), but also carries a
small, offline, in-file **card editor** and a **Save a Copy** that writes a new
self-contained living file. HyperCard's trait: the stack IS its own authoring
tool, with no server and no network.

**Sub-items and acceptance criteria.**

**a) Living runtime bundle** `src/living/` → `dist/living/living.iife.js` (IIFE,
ES2018, built by `vite.living.config.ts`). It reuses the shared validator,
`src/editor/operations.ts`, `src/shared/reachability.ts`, the player renderer
and `mountPlayer` — no server, no `fetch`, no new runtime dependency. It mounts
on an exported living file and provides:
  - **Play** (default on every open) — the exact current player (`mountPlayer`).
  - A small, unobtrusive **"Teacher"** tab in a corner. Clicking it shows a
    simple confirm ("Are you the teacher?") — a guard, not security — then opens
    the editor. Play is the default each time the file opens (the tab state is
    never persisted).
  - **Editor**: edit text, edit button labels, set a button's "go to card…",
    add a card, remove a card, and **Try It** (play the current card in place),
    all through the shared pure `operations.ts` so every edit stays valid.
  - **Save a Copy**: writes a NEW self-contained HTML file via a Blob download
    (no network); the original file is never modified; the copy is itself a
    living file.
  - **Done when:** opening an exported living file shows Play by default; the
    Teacher tab + confirm opens the editor; text/buttons/goto/add/remove/Try It
    all work offline; Save a Copy downloads a new file without any network call.

**b) Living template + exporter.** `exportLivingStack(stack)` produces the living
HTML: the `#stack-data` block (escape-safe, same guarantees as today), the
inlined fonts, and the living bundle. Save a Copy regenerates the file by taking
the current document's HTML and replacing ONLY the `#stack-data` content with
the newly escaped stack JSON — so a copy is byte-identical except the stack and
is therefore trivially also a living file.
  - **Done when:** `exportLivingStack` returns a self-contained HTML string;
    Save a Copy's regenerated HTML parses back to the edited stack via the same
    `#stack-data` extraction the round-trip test uses.

**c) Invariants it must keep.**
  - **Lossless round trip:** stack → living file → (edit nothing) → Save a Copy →
    the extracted stack JSON is identical to the input (property test). Edit →
    Save → reopen → the edit is present.
  - **The 9 stack invariants** (stack-format.md) hold for anything Save a Copy
    writes: Save a Copy runs `validate()` and refuses to write an invalid stack.
  - **"Before you share"** reachability check (`checkReachability`) runs before
    Save a Copy; if cards are unreachable or an answer dead-ends, the teacher is
    warned (and offered the repair) before the copy is written.
  - **Zero network requests** in the living file, in Play AND in Edit (verified
    in headless Chromium with networking blocked).
  - **Escaping:** user text from the edited stack is embedded with the same
    guarantees as today's exporter (no `</script>` breakout, no inline event
    handlers); add hostile-text tests for the Save-a-Copy path.

**d) Size budget.** The living file is ≤ **500 KB** with fonts. Report the actual
size. The play-only export stays available as **"Export for class (smaller)"**.
  - **Done when:** a test asserts the living file for a representative deck is
    ≤ 500 KB; the size is reported.

**e) Maker export choice.** When exporting, the Maker shows the choice, with
**"Living file (you can edit it later without Stackyard)"** as the default, and
"Export for class (smaller)" as the alternative.
  - **Done when:** the export flow offers both, defaulting to the living file.

**Gate:** `npm test` and `npx tsc --noEmit` exit 0; a headless-Chromium check
with network blocked opens an exported living file from disk, switches to
Teacher, changes card 1's question, Saves a Copy, opens the copy, and sees the
change in Play.

> **Design note (why not bundle the whole Maker):** the Maker's `EditorScreen`
> is coupled to the store, persistence and the generate/export API (server
> calls). The living file must be server-free and small, so `src/living/` is a
> lean vanilla-TS editor built on the SHARED pure pieces (validator, operations,
> reachability, renderer, mountPlayer). Save a Copy re-emits the current
> document rather than re-templating from scratch, which keeps the copy a living
> file with zero duplication of the template.


---

## Phase 7 — Round-2 review fixes to the living file (TASK-26 a, e)

> TASK-26 is split across three specs by concern. This file owns **a** and **e**
> (the living file). `stack-generator/tasks.md` owns b, c, d, g, j (generation).
> `maker/tasks.md` owns f, h, i, k, l, m, n, o and the index.

### TASK-26a: Save a Copy writes the pristine file, not the live DOM  *(P0)*
**Refs:** `judge_2026-11-05_r2/J4` N1, `J3` N2, `J1` item 10, `J2` step 18. Round 2 found every Save-a-Copy file opens on a frozen editor: `saveCopy.ts` serialised `document.documentElement.outerHTML` while the editor overlay was mounted, so the copy carried the dead overlay, a hidden Teacher tab, injected styles and the rendered card, and grew with every save (147→171 KB). Both gates were green because the unit test passed its own pristine HTML and the browser gate only looked for the edited text *anywhere* in the DOM.
  - **Fix.** Snapshot the pristine document ONCE at start-up, before anything mounts (`src/living/boot.ts`, called from `index.ts`; `mountLivingApp` also snapshots first thing as a safety net), and build every copy by replacing only the `#stack-data` block of that snapshot. `saveCopy()` no longer reads the live DOM by default; a call without a snapshot is an error, not a silent fallback.
  - **Acceptance criteria.**
    1. A copy has **0** `.sy-living-overlay`, **exactly 1** Teacher tab, the **same number of `<style>` blocks** as the original, and opens in **Play** (an answer tile is the hit target at its centre and a click on it advances the card).
    2. **Idempotent size:** copy → open → save → open → save gives byte-identical sizes (3 saves in a row), and the first copy is within a few hundred bytes of the original.
    3. A copy of a copy is still a living file (Teacher tab present, edits survive).
    4. The unit test drives the **real** default path (no injected `currentHtml`) in jsdom: boot → Teacher → edit → Save a Copy (captured Blob) → boot the copy in a fresh document → assert 1–3 above.
    5. `scripts/check-living-file.ts` opens the reopened copy in headless Chromium with the network blocked, asserts the 1–3 above, **clicks an answer and asserts the card advances**, opens Teacher → **Play** in the copy and asserts it plays again, plays the third-generation copy through to the end card, and asserts sizes of three saves in a row are identical. It no longer treats "the edited text appears somewhere in the DOM" as success.
    6. **Save a Copy saves under a new name:** `"<title> (copy).html"` (never the original name), via one shared `copyFileName(title)`.
  - **Done when:** the tests above exist and fail on the old `outerHTML` implementation (mutation-check: restore it and see red).

### TASK-26e: the living editor selects answers after an edit, and can change the right answer  *(P1)*
**Refs:** `J3` N3/N4, `J2` step 16.
  - **Bug.** After a text edit `refreshPreviewOnly()` re-rendered the card without re-attaching the capture-phase selection listener, so a click on an answer *played* it (✗ stamp) instead of selecting it. The editor also could not change which answer is right, and the card list did not refresh after an edit.
  - **Fix.** One `mountPreview()` shared by `renderCanvas` and `refreshPreviewOnly` (so selection can never be lost again); a **"This one is right"** radio for an answer button using the shared `markCorrect` operation (exactly one right answer, invariant 4, always holds); the card-list label refreshes on text input; the editor does not scroll the page sideways while typing.
  - **Acceptance criteria.**
    1. After typing in the question box, clicking an answer selects it (inspector shows the answer fields) and does **not** play it (no stamp, no navigation).
    2. Selecting a wrong answer and choosing "This one is right" makes it the only right answer (score 1, others 0) and the saved stack still validates.
    3. Editing a question updates that card's label in the left list immediately.
  - **Done when:** each criterion has a jsdom test that fails on the old code.

**Gate (TASK-26 a, e):** `npm test` and `npx tsc --noEmit` exit 0; `npm run check:living-file` passes with the new click-through.

> **Design note (supersedes the TASK-24 note above):** "Save a Copy re-emits the *current document*" was wrong for a document that has been mounted. The invariant is now: **a copy is built from the pristine snapshot taken before any UI mounts, with only `#stack-data` replaced.** The live DOM is never serialised.


---

## Phase 8 — Round-3 fixes to the living file and the file names (TASK-27 f, g, j, x, r)

> Owned here: the living file (**x**, **j**, the Save-a-Copy half of **f**), file
> names (**g**) and the font licence text (**r**).

### TASK-27x: typing into a flash card's Front/Back updates the preview  *(P1)*
  - **Bug.** `flashFields` applied the edit and refreshed the card LIST but never the card PREVIEW; the canvas kept the old word until another card was selected (J1 P1-4, J4 P1-3). Round-2 fixed the same class of bug for the other fields with one shared `mountPreview`; this handler bypassed it.
  - **Fix.** Every field handler ends in the one `refreshPreviewOnly()`.
  - **Acceptance criteria.** DOM test: type "XYZ" into Front and into Back; the canvas text contains it immediately, and the list label too.

### TASK-27f (living half): Save a Copy checks first, and spots a placeholder card  *(P2)*
  - **Fix.** Save a Copy runs the same "before you share" check as the Maker, **before** writing, and the check also flags an untouched placeholder card (question "Your question?", answers "Right answer" / "Wrong answer", or a flash card still "Term" / "Explanation", or a story still "Your text"). The confirm lists each problem and offers to go to the card.
  - **Acceptance criteria.** A copy with a placeholder card prompts; declining writes nothing (no download) and selects the offending card; accepting writes.

### TASK-27g: file names tell the files apart  *(P2)*
  - **Bug.** Class and living exports had the same name; every copy was "(copy)", so a copy of a copy collided in Downloads.
  - **Fix.** The class export gets a `-class` suffix (`<title>-class.html`); the living export keeps `<title>.html`. A copy is named from the file it was made from: `<title> (copy).html`, then `(copy 2)`, `(copy 3)`… The number is read from the title's own file name, which the living file knows (`location`/`document.title` carry no number, so the copy number is stored in the file as `data-copy="N"` on `#stack-data` and incremented on each Save a Copy, replaced by `replaceStackData`).
  - **Acceptance criteria.** Unit tests: `classFileName`, `copyFileName(title, n)`; chaining three saves in jsdom names them `(copy)`, `(copy 2)`, `(copy 3)`; the server's Content-Disposition for a class export ends `-class.html`, and the Maker's download uses the same name; byte-stability of copies is unchanged apart from the counter digit (the browser gate still asserts identical sizes for same-length counters).

### TASK-27j: the living editor looks like the Maker  *(P2)*
  - **Fix.** Scale cap 1 → 1.4 (as the player). List labels single line with ellipsis. The "Back to editing" pill sits above the rings. Inspector type uses the Maker's tokens (18 px labels, 44 px controls). Wording matches the website: "Front (the term)", "Back (the explanation)", "Answer", "Right answer", "Card 1 — …". A "+ Add an answer" control on quiz cards (the shared `addAnswer`).
  - **Acceptance criteria.** Tests: the fit scale reaches 1.4 on a large area and never exceeds it; list buttons carry the ellipsis style; the inspector uses the website's labels (string-equal to the Maker's); "+ Add an answer" adds a linked answer and stops at four.

### TASK-27r: the OFL licence text travels in the export  *(P2)*
  - **Bug.** The export carried the copyright line and a URL; the subset fonts' licence name table is empty, so only a pointer to the licence travelled with the file. OFL §2 asks for the notice AND the licence.
  - **Fix.** Inline the SIL OFL 1.1 text once in a CSS comment in both templates.
  - **Acceptance criteria.** Test: both the class and the living export contain "SIL OPEN FONT LICENSE Version 1.1" and "PERMISSION & CONDITIONS".

**Gate (TASK-27 exporter items):** `npm test` and `npx tsc --noEmit` exit 0; `npm run check:living-file` passes.


### TASK-28n/o/j: the Teacher tab (living editor)  *(J2, J4)*
  - **28n.** "Remove this card" asks first ("Remove card N — …?"); cancelling removes nothing.
  - **28o.** After "+ Add an answer" the NEW answer is selected, so typing goes into it, not into the answer that was selected before.
  - **28j.** List labels are distinct: "Card N — " is not part of the truncation budget, and when two labels would still collide the text is lengthened until they differ (or ends with the card's answer/term).
  - **28q (Teacher).** The "If they pick this, show card…" dropdown uses "—", the same form as the website and list.
  - **Acceptance criteria.** Living tests: cancel on Remove keeps the card; accept removes it; after Add an answer the Answer field holds "Another answer" and typing changes the new tile only; labels of different cards differ on a generated-style deck whose questions share a long prefix; dropdown options contain " — " and no " · ".

### TASK-28a: REQ-EXP-01 matches what is shipped
  - See `maker/tasks.md` Phase 14 (28a). The exporter test is renamed to cite REQ-EXP-01.

### TASK-28k: the round-3 fixes are pinned by the project's own mutation tool
  - `scripts/mutation-check.ts` gains one mutant each for: the ANSI strip in the claims parser, proper-noun casing, the flash preview refresh, the pronoun term guard, trap-loop reachability, body-before-slot, and the fallback's disconnect signal. **Acceptance:** `npm run check:mutants` reports every mutant killed.


### TASK-29n (Teacher tab) / 29a (living half): the Teacher tab follows the same rules  *(J2, J4)*
  - "+ Add an answer" focuses and selects the new Answer box. "Add a card after this" uses the same non-rewiring splice (a fork leaves the new card unlinked and says "Choose where this card leads"). A copy of a branching file saved after an insert keeps every existing choice's target.
  - **Acceptance criteria.** Living tests: focus after Add an answer; a branching deck keeps its choices after "Add a card after this" and shows the fork note.


### TASK-30g (Teacher tab half) / 30i (living half): the Teacher tab  *(J2, J3, J4)*
  - **30g.** In the Teacher tab the end card's heading and message are editable (fields in the inspector, backed by the same text operations as the Maker; the message is created when absent and removed when cleared, max 300). A saved copy keeps the edited message.
  - **30i.** The Teacher tab's "Add a card after this" and repair use the same fork-aware path as the Maker.
  - **Drag (optional, not done this round).** Drag in the Teacher tab through the same `moveElement` operation as the Maker, on an 8 px grid.
  - **Acceptance criteria.** Living tests: editing the end heading/message changes the preview; Save a Copy keeps them; clearing the message removes the text element. 30i/30k as in `maker/tasks.md`.
