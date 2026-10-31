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

---

### TASK-12: Implement `server/html-template.ts`

Implement `buildHtml(options: { title: string; stackJson: string; playerIife: string }): string`:

- Returns the HTML string from the template in `design.md`.
- Escapes `stack.title` for use as the `<title>` content (no raw `<` or `>`).
- Does not use a templating library — plain string assembly is fine given the
  limited substitution points.

**Done when:** Unit test asserts the output contains `<title>`, `#stack-data`,
and the player IIFE content, and that the `<title>` value is correctly escaped.

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

---

## Phase 4 — Security and correctness tests

### TASK-14: No-external-URLs test (`tests/exporter.test.ts`)

Add a test that exports a valid stack (with one image element using a data URI)
and asserts:

- The resulting HTML string does not match `/https?:\/\//`.

**Done when:** Test passes and is run as part of `vitest run`.

---

### TASK-15: No-API-key test (`tests/exporter.test.ts`)

Add a test that:

1. Sets `process.env.STACKYARD_LLM_API_KEY` to a known sentinel string
   (`"sk-test-sentinel-value-do-not-use"`) before exporting.
2. Exports a valid stack.
3. Asserts the sentinel string does not appear anywhere in the HTML output.

**Done when:** Test passes regardless of whether the env variable is normally
set in the development environment.

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

---

### TASK-18: Staleness check for the committed player bundle

Add a CI script (`scripts/check-player-fresh.sh`) that:

1. Runs `npm run build:player` into a temp directory.
2. Compares the output with the committed `dist/player/player.iife.js`.
3. Exits non-zero if they differ.

Document the script in the root `README.md` under a "Development" section.

**Done when:** The script exits 0 when the source and bundle are in sync, and
exits 1 after any source change that has not been rebuilt.

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
