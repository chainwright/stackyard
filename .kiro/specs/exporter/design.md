# Exporter & Player Runtime — Design

## Overview

The feature has two separable concerns that are tightly coupled by the output
format:

1. **Exporter** (`server/exporter.ts`) — a Node function that accepts a
   validated `Stack` and returns an HTML string.
2. **Player runtime** (`src/player/`) — TypeScript compiled to a single IIFE
   that is injected verbatim into every exported file.

The two halves share only the `Stack` type and the JSON embedded in the HTML.
They never share module state at runtime.

---

## Architecture

```
server/exporter.ts
  │
  ├── src/shared/validator.ts      ← must pass before anything else
  │
  ├── server/inline-assets.ts      ← converts image src → data URI
  │
  ├── src/player/ (pre-built IIFE) ← bundled by Vite at build time
  │     player.iife.js             ← read from disk and injected verbatim
  │
  └── server/html-template.ts      ← assembles the final HTML string
```

### Build-time player bundle

The player is a completely separate Vite library build (`vite.player.config.ts`)
with:

- `lib.entry`: `src/player/index.ts`
- `lib.formats`: `['iife']`
- `lib.name`: `StackyardPlayer`
- `build.target`: `es2018`
- `build.minify`: `true`

The output (`dist/player/player.iife.js`) is committed to the repo so the main
server build does not need to re-bundle the player on every export call. A CI
check asserts the committed bundle is not stale.

### Export pipeline (runtime)

```
export(stack: Stack): string

  1. validate(stack)               → throws ExportValidationError on failure
                                     (wraps ValidationResult.errors from
                                     src/shared/validator.ts)
  2. inlineImages(stack)           → returns a new Stack with all image src
                                     values replaced by data URIs; throws
                                     ExportValidationError("path-traversal")
                                     for any unsafe path
  3. JSON.stringify(inlinedStack)  → the embedded JSON blob
  4. readPlayerIIFE()              → reads the pre-built player.iife.js
  5. htmlTemplate(json, iife)      → returns the final HTML string
```

No file is written by the exporter itself. The caller (the server route or a
test) decides what to do with the returned string.

---

## HTML template structure

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><!-- stack.title --></title>
  <style>
    /* minimal reset + canvas centering, inlined */
  </style>
</head>
<body>
  <div id="player-root"></div>

  <!-- Stack data: parsed by the player runtime at startup -->
  <script id="stack-data" type="application/json">
    <!-- JSON.stringify(inlinedStack) -->
  </script>

  <!-- Player runtime: self-contained IIFE, no external deps -->
  <script>
    <!-- player.iife.js contents -->
  </script>
</body>
</html>
```

Key points:

- `<script type="application/json">` is inert — browsers do not execute it.
  The player reads it with `document.getElementById('stack-data').textContent`.
- All CSS is inlined in `<style>`. There are no `<link>` tags.
- There are no `<img>` tags with external `src` values; every image is a data
  URI already baked into the JSON.
- There are no CDN script tags.

---

## Player runtime design

### Module layout (`src/player/`)

```
src/player/
  index.ts          ← entry point; called by the IIFE wrapper on DOMContentLoaded
  runtime.ts        ← RuntimeState, variable store, action dispatcher
  renderer.ts       ← DOM builder for each element type
  scaler.ts         ← canvas scaling via CSS transform
  audio.ts          ← cheer / buzz sound generation (Web Audio API)
  errors.ts         ← user-facing error display (no stack traces)
```

### RuntimeState

```ts
interface RuntimeState {
  stack: Stack;
  variables: Record<string, string | number>;
  currentCardId: string;
}
```

`variables` is a plain object. The `score` key is initialised to `0` on
startup. All `field` elements read from this object on every render.

### Render loop

The player is entirely event-driven — there is no animation loop or timer
(unless a card uses `goto` in its top-level `actions`, which fires immediately
after render). The render cycle is:

```
navigateTo(cardId)
  1. set state.currentCardId
  2. clear #player-root
  3. render all elements of the card into #player-root
  4. attach button click handlers
  5. fire any card-level actions (e.g., auto-advance goto)
```

**Auto-advance loop guard:** The player maintains a counter of consecutive
automatic navigations (those triggered by card-level `actions`, not by a button
press). The counter increments on each automatic `goto` and resets to zero on
any button-initiated navigation. If the counter reaches 20, the player stops,
calls `showFatalError`, and does not process further `goto` actions. This is a
runtime safety net for stacks that slip past the validator (e.g., hand-edited
files); the validator's invariant 9 is the primary defence.

Each element type maps to a DOM node:

| Element type | DOM node       | Notes                                          |
|--------------|----------------|------------------------------------------------|
| `text`       | `<p>`          | Positioned absolutely within the scaled canvas |
| `button`     | `<button>`     | Click fires the element's `actions` array      |
| `image`      | `<img>`        | `src` is a data URI from the JSON              |
| `field`      | `<span>`       | `textContent` = `String(variables[variable])`  |

All elements are positioned with `position: absolute` and coordinates taken
directly from the element's `x`, `y`, `w`, `h` fields (which are in the
800 × 600 logical space). The containing canvas `div` is 800 × 600 px, then
scaled by CSS `transform: scale(factor)` so it fits the viewport.

### Canvas scaling

```
factor = min(viewportWidth / 800, viewportHeight / 600)
canvas.style.transform = `scale(${factor})`
canvas.style.transformOrigin = 'top left'
```

A `ResizeObserver` recalculates `factor` when the window size changes. No
JavaScript layout measurements are needed because only the outer `div` scales;
all inner coordinates remain in the original 800 × 600 space.

### Action dispatcher

```ts
function dispatch(actions: Action[], state: RuntimeState): void
```

Actions are processed in array order, synchronously, except `sound` which is
fire-and-forget. The dispatcher handles all four action types:

| Action | Effect                                               |
|--------|------------------------------------------------------|
| `goto` | Calls `navigateTo(action.cardId)`                    |
| `score`| `state.variables.score += action.delta`              |
| `sound`| Calls `audio.play(action.sound)` (non-blocking)      |
| `set`  | `state.variables[action.variable] = action.value`    |

A `goto` action terminates further processing of the current actions array
(subsequent actions after a `goto` are not evaluated).

### Audio

Cheer and buzz are generated programmatically with the Web Audio API
(`OscillatorNode` + `GainNode`) so no audio files need to be inlined. The
sounds are short (< 1 s) and simple. If `AudioContext` is unavailable, the
`play()` call is wrapped in a try/catch and silently ignored.

### Error handling

If a `goto` targets a missing card (should not happen with a validated stack,
but a hand-edited file might), the player clears the canvas and renders a
plain message: `"Something went wrong. Please ask your teacher to check the
file."` No stack trace, no technical detail — consistent with the audience
rules in `audience.md`.

---

## Key design decisions

### Why a pre-built IIFE rather than inline source?

The exporter runs on the server. Bundling TypeScript at export time would
require Vite/esbuild as a server dependency, add latency per export, and make
the server harder to test. A pre-built artifact is simpler: the exporter just
reads a file. The CI staleness check (`dist/player/player.iife.js` matches
`src/player/**`) is the safety net.

### Why `<script type="application/json">` for the stack data?

- Browsers do not execute it, so malformed JSON cannot cause a script error.
- It survives HTML minification without escaping issues (no `</script>` in
  JSON values unless a card title contains that exact string — which the
  validator can forbid as an invariant if needed).
- It makes the stack trivially extractable for re-import: one
  `getElementById` call.

### Why not a `<template>` element or a data attribute?

`<template>` contents are not accessible via `.textContent` in all target
browsers. A `data-*` attribute would require encoding the JSON string as an
HTML attribute value, adding escaping complexity.

### Why Web Audio API for sounds instead of inlined audio files?

Two short synthesised tones add ~0 bytes to the player and avoid the licensing
and format-compatibility questions of embedded audio files. The cheer/buzz
distinction (pitch, rhythm) is sufficient for the product need. If richer
sounds are required in the future, they can be inlined as base64-encoded audio
data URIs in the `sound` action payload — but that is out of scope.

### Why ES2018 as the compilation target?

Chrome 70 (2018), Firefox 63 (2018), Safari 12 (2018), and Edge 18 (2018) all
support ES2018 features (async/await, rest/spread, tagged template literals).
Targeting ES2018 avoids the need for any regenerator-runtime or core-js
polyfills, keeping the bundle small and the file self-contained.

### Round-trip guarantee

The exporter inlines the full, validated `Stack` JSON verbatim. No field is
omitted, renamed, or transformed for the player's benefit — the player reads
the exact same schema the editor writes. This makes the property-based
round-trip test trivial: `parse(extract(export(stack))) deepEquals stack`.

The JSON serialiser escapes `/` as `\u002f`, so a card text value of
`"https://example.com"` becomes `"https:\u002f\u002f example.com"` in the
raw HTML. This satisfies REQ-EXP-01 (no bare `https://` in output) while
preserving exact string fidelity: `JSON.parse` restores `\u002f` to `/`,
so the round-trip value is identical to the original.

---

## Security model

- The exporter runs in the server process. It receives a `Stack` object, not
  user-supplied HTML.
- `JSON.stringify` is used for embedding the stack — not template-literal
  interpolation — so a card title containing `</script>` cannot break out of
  the JSON block. (The JSON serialiser escapes `<`, `>`, `/` as `\u003c`,
  `\u003e`, `\u002f` — standard behaviour in security-conscious serialisers.
  The exporter must use a serialiser that applies these escapes, or apply them
  manually. This also means raw `https://` URLs in card text are serialised
  as `https:\u002f\u002f`, so the "no `https://` in output" invariant holds
  automatically for stack-embedded text.)
- The player reads the stack from the DOM. It never calls `eval`, `Function()`,
  or `innerHTML` with stack-derived content. All text content is set via
  `.textContent` or `.setAttribute`.
- No environment variable is read inside `server/exporter.ts` or
  `src/player/`. The API key lives only in the LLM gateway module.

### ExportValidationError

`ExportValidationError` is a typed subclass of `Error` defined in
`server/exporter.ts`. It carries an `errors: string[]` field that is the
`errors` array returned by `validate()` from `src/shared/validator.ts`. The
exporter never re-wraps a generic `Error`; all validation failures surface as
`ExportValidationError` so callers can inspect individual error codes.

### Path security in inlineImages

`inlineImages` resolves relative `src` paths only within a single, fixed assets
directory (passed in as an argument; defaults to the project's `assets/`
directory). Before any `fs.readFile` call, it:

1. Resolves the candidate path with `path.resolve(assetsDir, src)`.
2. Checks the resolved path starts with `assetsDir + path.sep`; if not, throws
   `ExportValidationError` with `"path-traversal"` in `errors`.
3. Calls `fs.realpath` on the resolved path and checks the real path also
   starts with `assetsDir + path.sep` (catches symlinks).

Absolute paths and `data:` URIs bypass the resolution step: absolute paths are
rejected immediately; `data:` URIs are left unchanged.

### Goto-cycle invariant (invariant 9)

The validator checks that the directed graph formed by card-level `goto`
actions — where each node is a card and each edge is a card-level auto-advance
— contains no cycle. It uses iterative DFS with a three-colour visited set
(unvisited / in-stack / done). If a back-edge is found, `"goto-cycle"` is added
to `errors`. Button-level `goto` actions are excluded from this graph; only
`card.actions` entries are considered.

---

## Testing strategy

| Test type              | What it covers                                        | Location               |
|------------------------|-------------------------------------------------------|------------------------|
| Unit — exporter        | Throws `ExportValidationError` for each invalid stack shape | `tests/exporter.test.ts` |
| Unit — exporter        | `ExportValidationError.errors` contains the right code for each invariant | `tests/exporter.test.ts` |
| Unit — exporter        | Returns valid HTML string for a minimal valid stack   | `tests/exporter.test.ts` |
| Unit — exporter        | No `http(s)://` URLs in output                        | `tests/exporter.test.ts` |
| Unit — exporter        | Known API key sentinel (`STACKYARD_LLM_API_KEY`) absent from output | `tests/exporter.test.ts` |
| Unit — exporter        | Stack text containing `https://example.com` produces no raw `https://` in HTML; round-trips to original value after JSON parse | `tests/exporter.test.ts` |
| Unit — inline-assets   | `data:` URI src is left unchanged                     | `tests/inline-assets.test.ts` |
| Unit — inline-assets   | Relative path inside assets dir is read and inlined   | `tests/inline-assets.test.ts` |
| Unit — inline-assets   | Path traversal via `..` throws `ExportValidationError("path-traversal")` | `tests/inline-assets.test.ts` |
| Unit — inline-assets   | Absolute path throws `ExportValidationError("path-traversal")` | `tests/inline-assets.test.ts` |
| Unit — inline-assets   | Symlink escaping assets dir throws `ExportValidationError("path-traversal")` | `tests/inline-assets.test.ts` |
| Unit — player renderer | Each element type renders correct DOM node            | `tests/renderer.test.ts` |
| Unit — player actions  | Each action type mutates state correctly              | `tests/runtime.test.ts`  |
| Unit — player scaler   | Scale factor calculation for common viewports         | `tests/scaler.test.ts`   |
| Unit — player runtime  | Auto-advance counter stops at 20 and shows fatal error | `tests/runtime.test.ts` |
| Unit — player runtime  | Counter resets on user-initiated navigation           | `tests/runtime.test.ts` |
| Property — validator   | Invariant 9: cyclic card-level goto graphs always fail; acyclic graphs always pass | `tests/validator.property.test.ts` |
| Property — round-trip  | fast-check: `parse(extract(export(stack))) deepEquals stack` | `tests/roundtrip.property.test.ts` |
| Property — size budget | Exported file ≤ 50 KB gzipped player IIFE             | `tests/exporter.test.ts` |
