# Maker App — Design

## Overview

The Maker app is a Vite + TypeScript single-page app built with **Preact**
(tech.md explicitly allows it; no other UI libraries are used). It owns three
screens — **Start**, **Editor**, and **Play** — over a single in-memory `Stack`
that is mirrored to `localStorage`. It reuses the existing server and runtime
modules wholesale and adds exactly one new server route, `POST /api/export`.

The guiding rule is **what-you-see-is-what-the-class-gets**: the editor canvas
and Play mode both render through `src/player/renderer.ts`, the same code the
exported file runs. The editor never has its own card renderer.

```
sentence → POST /api/generate → Stack in editor
         → edit (always-valid) → Play (same runtime) 
         → POST /api/export → download one HTML file
```

---

## What is reused (not re-specified)

| Concern | Reused module | How the Maker uses it |
|---------|---------------|------------------------|
| Types | `src/shared/types.ts` | Single source of truth for `Stack`, `Card`, `Element`, `Action`, `GenerateRequest`, `GenerateSuccess`, `GenerateError`. |
| Validation | `src/shared/validator.ts` → `validate(unknown)` | Called after every edit, before enabling Export, and when loading from `localStorage`. All nine invariants. |
| Card rendering | `src/player/renderer.ts` → `renderCard(card, root, state, navigate, playSound)` | Draws the selected card in the editor canvas and every card in Play mode. |
| Runtime | `src/player/runtime.ts` → `createRuntime`, `dispatch` | Drives Play mode exactly as the exported player does. |
| Player mount | `src/player/mount.ts` → `mountPlayer(stack, root)` (**extracted** from `src/player/index.ts`) | The exported player entry and Play mode both call this one function, so Play mode is literally the code the class gets. |
| Generation | `server/routes/generate.ts` → `handleGenerate` (`POST /api/generate`) | Start screen calls it; returns `{ ok, stack, isFallback }`. |
| Export | `server/exporter.ts` → `exportStack(stack)`, `ExportValidationError` | Called by the **new** `POST /api/export` route. |
| Server shell | `server/index.ts` → `createServer()` | Extended to register the new route alongside `/api/generate`. |

The Maker adds **no** new type definitions for the stack schema, **no** second
validator, and **no** second renderer. The only change to `src/player/` is a
pure refactor: lifting the mount/navigation loop out of `index.ts` into a
reusable `mountPlayer(stack, root)` (same code, no behaviour change), so the
player size budget and the staleness check stay green.

---

## Architecture

```
src/
  main.tsx                ← SPA entry; mounts <App>, restores from localStorage
  editor/
    app.tsx               ← top-level screen switch (Start | Editor | Play)
    store.ts              ← EditorStore: the single source of truth (see below)
    operations.ts         ← pure edit operations (Stack → Stack)
    history.ts            ← undo/redo ring over Stack snapshots
    persistence.ts        ← localStorage save/load (validate on load)
    api.ts                ← fetch wrappers for /api/generate and /api/export
    StartScreen.tsx       ← sentence input → generate
    CardList.tsx          ← side list of cards (select, add, remove, reorder)
    Canvas.tsx            ← centre canvas; wraps renderCard(...)
    Inspector.tsx         ← edit text, label, kind, mark-correct, goto target
    drag.ts               ← pointer + keyboard move of a button within a card
    PlayOverlay.tsx       ← Play mode: calls mountPlayer over the current stack
    Toolbar.tsx           ← Text / Button / Picture / Go to card… / Undo / Redo / Export
    a11y.ts               ← focus management + aria-live announcer
  player/                 ← REUSED runtime + renderer (unchanged behaviour)
    mount.ts              ← NEW (refactor): mountPlayer(stack, root)
    index.ts              ← now a thin wrapper that calls mountPlayer on DOMContentLoaded
  shared/                 ← REUSED types + validator (unchanged)

server/
  routes/
    generate.ts           ← REUSED
    export.ts             ← NEW: POST /api/export → exportStack(stack)
  index.ts                ← extended to route /api/export
  exporter.ts             ← REUSED
```

The UI is **Preact** (`.tsx` components); no other UI libraries. State lives in
the single `EditorStore`; components subscribe to it and call `store.apply`,
`store.undo`, `store.redo`. The store and operations are plain TypeScript and
framework-independent, so they are unit-testable without rendering a component.

---

## The editor store

A single object holds all editor state. Everything flows through it so that
validation, persistence, and undo/redo have exactly one place to hook in.

```ts
interface EditorState {
  screen: "start" | "editor" | "play";
  stack: Stack | null;          // current, always-valid when non-null
  selectedCardId: string | null;
  selectedElementId: string | null;
  history: HistoryState;        // see history.ts
  lastValidation: ValidationResult;
  isFallback: boolean;          // from the last generate
  status: "idle" | "generating" | "exporting";
}
```

`EditorStore` exposes a single mutation entry point:

```ts
// Apply a pure operation, validate, commit to history, persist, re-render.
// `coalesceKey` merges a rapid burst of same-key edits into one undo step
// (see Keyboard-nudge coalescing under Drag).
store.apply(op: EditOperation, opts?: { coalesceKey?: string }): ApplyResult;
```

`ApplyResult` is `{ ok: true }` or `{ ok: false; message: string }` (plain
language). This one method enforces REQ-MKR-09 (never a dead export): every
mutation goes through `apply`, which validates before committing.

---

## Edit operations (pure functions)

All edits are pure functions in `operations.ts` with the shape
`(stack: Stack, args) => Stack`. They never mutate the input; they return a new
stack (structural copy). The store runs `validate()` on the result and only
commits if valid (or if the operation is defined to always preserve validity).

| Operation | Signature (args) | Invariants it must preserve |
|-----------|------------------|-----------------------------|
| `editText` | `elementId, content` | 3 (empty handled by store rejection) |
| `editLabel` | `elementId, label` | reject empty label |
| `markCorrect` | `cardId, buttonId` | **4** — set chosen button to `score:1`+`cheer`; all other answer buttons to `score:0`+`buzz` |
| `addCard` | `kind, index` | 1,3,7,8 — new card gets a fresh UUID; a new quiz card is seeded with exactly one correct answer |
| `removeCard` | `cardId` | 2,3,7 — re-point/clear every `goto` (card- and button-level) that targeted it; refuse if it is the only end card or the only non-end card |
| `changeKind` | `cardId, kind` | 3,4 — refuse if it would create/remove the sole end card; seed quiz answers when becoming a quiz |
| `reorderCards` | `fromIndex, toIndex` | ids unchanged ⇒ 2 preserved automatically |
| `setGotoTarget` | `buttonId, targetCardId` | 2 — target must exist; 9 not affected (button gotos excluded from cycle graph) |
| `moveElement` | `elementId, x, y` | **5** — clamp so `x+w ≤ 800`, `y+h ≤ 600` |

### markCorrect detail (invariant 4)

Invariant 4 requires a quiz card to have exactly one button with
`{ type: "score", delta: 1 }` and at least one without. `markCorrect`:

1. Identifies the answer buttons on the card (buttons that carry a `score`
   action — i.e. the tiles, not a navigation button).
2. Sets the chosen button's actions to include `{ type: "score", delta: 1 }`
   and `{ type: "sound", sound: "cheer" }`.
3. Sets every other answer button to `{ type: "score", delta: 0 }` and
   `{ type: "sound", sound: "buzz" }`.
4. Leaves any `goto` on those buttons intact (e.g. advance to the next card).

This is idempotent and always yields exactly one correct answer.

### removeCard detail (invariant 2)

Before dropping the card, `removeCard` rewrites the whole stack:

- Any **button** `goto` whose `cardId` equals the removed id is **cleared**
  (the `goto` action removed) — the button simply does nothing until re-wired,
  which keeps invariant 2 satisfied.
- Any **card-level** `goto` to the removed id is removed from that card's
  `actions`.
- If the removal would leave zero end cards or zero non-end cards, the
  operation returns a sentinel the store surfaces as a rejection
  (plain-language message), and nothing changes.

Because card ids never change on reorder, `reorderCards` cannot break
invariant 2.

---

## Always-valid guarantee (REQ-MKR-09)

```
store.apply(op, opts?):
  next = op(state.stack)              // pure; may return a Rejected sentinel
  if next is Rejected:
    announce(message); return { ok:false, message }
  result = validate(next)
  if !result.valid:
    // Operation had a bug or an un-repairable combination.
    announce(plainMessageFrom(result.errors)); return { ok:false, message }
  if opts?.coalesceKey == lastCommit.coalesceKey
     and now - lastCommit.at < 600ms:   // same-key burst, not sealed
    // Replace the live stack in place; keep the pre-burst snapshot in `past`.
  else:
    history.commit(state.stack)         // push previous for undo
  lastCommit = { coalesceKey: opts?.coalesceKey, at: now }
  state.stack = next
  state.lastValidation = { valid:true, stack: next }
  persistence.save(next)              // localStorage (debounced)
  render()
  announce(successMessage(op))        // aria-live
  return { ok:true }
```

Export is enabled **iff** `state.lastValidation.valid`. Because `apply` only
ever commits a valid stack, the editor can never present a dead Export button
for a stack it produced. The property test in TASK-P1 asserts this for
arbitrary operation sequences.

`plainMessageFrom(errors)` maps validator error codes to audience-rule
sentences (never shows the raw code):

| Code | Message (plain language) |
|------|--------------------------|
| `quiz-answer` | "This question needs exactly one right answer. Pick the correct tile." |
| `invalid-goto` | "A button points to a card that isn't here any more. Choose a card for it." |
| `end-card-count` | "A set of cards needs exactly one last card." |
| `no-content-cards` | "You need at least one card before the last one." |
| `canvas-bounds` | "Something is off the edge of the card. Move it back on." |
| `blank-title` | "Give your set of cards a name." |
| `duplicate-id` / `invalid-id` / `goto-cycle` | "Something went wrong with this card. Please undo your last change." |

---

## Undo / redo (`history.ts`)

Undo/redo stores **whole-stack snapshots**, not diffs. Snapshots are cheap
here (stacks are small, ≤ ~20 cards) and make REQ-MKR-10's exact-restore
guarantee trivial and testable.

```ts
interface HistoryState {
  past: Stack[];     // snapshots before each committed edit
  future: Stack[];   // snapshots undone, available to redo
}
```

- `commit(prev)` pushes `prev` onto `past` and clears `future`.
- `undo()` moves `stack` → `future`, pops `past` → `stack`.
- `redo()` moves `stack` → `past`, pops `future` → `stack`.
- Snapshots are deep copies (`structuredClone`) so later edits cannot mutate a
  stored snapshot.

Because a snapshot is the exact previous `Stack`, "undo after any edit restores
the exact previous stack" (REQ-MKR-10) is a `deepEqual` assertion. A bounded
ring (e.g. 100 entries) caps memory; the property test uses short sequences so
the bound never trims mid-test.

---

## Canvas: reusing the player renderer (REQ-MKR-02)

`Canvas.tsx` builds a scaled 800 × 600 root and calls the reused renderer:

```ts
import { renderCard } from "../player/renderer.js";
import { createRuntime } from "../player/runtime.js";

function drawSelected(card: Card, stack: Stack, root: HTMLElement) {
  const state = createRuntime(stack);       // fresh preview runtime
  renderCard(card, root, state,
    /* navigate */ () => {},                 // no-op in edit mode
    /* playSound */ () => {});               // silent in edit mode
}
```

- In **edit** mode, `navigate` and `playSound` are no-ops: clicking a tile does
  not advance or make sound; it selects the element for editing (the editor
  attaches its own capture-phase click handling on top of the rendered DOM to
  map a click to an element id, without modifying `renderer.ts`).
- Scaling reuses the same `min(w/800, h/600)` approach as `src/player/scaler.ts`
  (or imports it directly) so the editor preview matches the player exactly.

Selection overlay (highlight, drag handles for buttons) is drawn by the editor
as a sibling layer above the rendered card, keyed by element `id` and position.
It never writes into the renderer's DOM.

---

## Drag within a card (REQ-MKR-08)

`drag.ts` handles pointer and keyboard moves of the selected **button**:

- Pointer: on `pointerdown` over a button's selection handle, track
  `pointermove` deltas; convert screen deltas to logical (÷ scale factor);
  update a live preview; on `pointerup`, `store.apply(moveElement(...))` as one
  edit.
- Keyboard: when a button is selected, arrow keys nudge by 1 px (Shift+arrow by
  10 px).
- Clamp in `moveElement`: `x = clamp(x, 0, 800 - w)`, `y = clamp(y, 0, 600 - h)`
  so invariant 5 holds by construction.

### Keyboard-nudge coalescing (REQ-MKR-08 / REQ-MKR-10)

A burst of keyboard nudges on the **same element**, with **no other edit in
between** and **gaps under 600 ms**, collapses into a single undoable edit, so
one undo returns the element to where it was before the burst began.

The store supports this with a lightweight *coalesce key*:

```ts
store.apply(op, { coalesceKey?: string });
```

- The nudge handler passes `coalesceKey = "move:" + elementId`.
- If the previous committed edit carried the **same** `coalesceKey` and the
  previous commit was **< 600 ms** ago, `apply` **replaces** the top of the
  `history.past`/current-stack pair in place (updating the current stack to the
  new position) instead of pushing a new `past` entry — so the pre-burst
  snapshot is the one undo restores.
- Any edit with a different (or absent) `coalesceKey`, or a gap ≥ 600 ms, or a
  selection change, starts a fresh undo entry. A short timer also "seals" the
  burst after 600 ms of inactivity so a later nudge cannot re-open it.
- Pointer drags are **not** coalesced: each completed drag is its own edit.

This keeps REQ-MKR-10's "undo restores the exact previous stack" true at the
granularity of a *burst*: the state restored is the one immediately before the
first nudge of the burst.

---

## Play mode (REQ-MKR-11)

Play mode calls the **shared** `mountPlayer(stack, root)` — the exact function
the exported player entry calls — in a container that covers the editor:

```ts
import { mountPlayer } from "../player/mount.js";

function startPlay(stack: Stack, root: HTMLElement): () => void {
  // Same code path the class runs. Returns a teardown handle.
  return mountPlayer(stack, root);
}
```

`mountPlayer(stack, root)` is the refactored-out mount/navigation routine that
previously lived inline in `src/player/index.ts`. It:

- creates the runtime (`createRuntime`, `score = 0`, first card),
- defines `navigateTo(id, automatic)` with the auto-advance counter and the
  20-step fatal-error guard,
- renders each card with `renderCard` and sounds with `playSound`,
- returns a teardown function (disconnect observers, clear root).

The exported player's `index.ts` becomes a thin wrapper: on
`DOMContentLoaded`, read `#stack-data`, `validate`, then call
`mountPlayer(stack, root)`. Because both paths call the identical function,
Play mode is literally the code the class gets (verified by the test in
TASK-17a). This refactor changes no behaviour, so the player size budget
(≤ 50 KB gzipped) and the staleness check stay green.

Exiting Play mode:

- calls the teardown handle `mountPlayer` returned (discarding its throwaway
  `RuntimeState`),
- restores `screen = "editor"` with the previous `selectedCardId`,
- writes **nothing** back to `state.stack` — playing never edits (REQ-MKR-11).

---

## Persistence (`persistence.ts`, REQ-MKR-14)

```
KEY = "stackyard:maker:v1"

save(stack):   localStorage.setItem(KEY, JSON.stringify(stack))
load():        raw = localStorage.getItem(KEY)
               if !raw: return null
               parsed = JSON.parse(raw)        // guarded
               result = validate(parsed)
               return result.valid ? result.stack : DISCARD(null)
```

- Saved on every committed edit and on a successful generate (debounced to
  avoid thrashing on rapid edits — a small trailing debounce, e.g. 300 ms).
- On load, an invalid or unparseable saved stack is discarded silently (no
  error shown as a crash); the app shows the Start screen with a gentle notice.
- New generation replaces the saved stack **only after** the new stack arrives
  valid — a failed generate leaves the old save intact (REQ-MKR-14).
- Nothing is ever sent to a server for storage. The only server calls are
  `/api/generate` and `/api/export`.

---

## Export flow (REQ-MKR-12, REQ-MKR-13)

### Client (`api.ts`, toolbar Export button)

```
onExport():
  if (!state.lastValidation.valid) return    // button is disabled anyway
  status = "exporting"
  res = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stack: state.stack }),
  })
  if (res.ok):
    html = await res.text()                   // raw HTML body, byte-exact
    filename = filenameFromDisposition(res) ?? safeFileName(stack.title)
    triggerDownload(html, filename)
  else:
    { message } = await res.json()            // errors are always JSON
    announce(message)                          // plain language, no download
  status = "idle"
```

`triggerDownload` creates a `Blob([html], { type: "text/html" })`, an object
URL, and a temporary `<a download="…">` click — all in the browser, no server
round-trip for the download itself. The downloaded bytes are exactly the
exporter's output (REQ-MKR-12: do not alter bytes).

`safeFileName(title)` reduces the title to **safe characters only** — letters,
digits, and hyphens — collapsing runs of unsafe characters to a single hyphen,
trimming leading/trailing hyphens, and appending `.html`. If nothing safe
remains it falls back to `lesson.html`. The client prefers the `filename` the
server already put in `Content-Disposition` (computed by the same rule), so the
two always agree.

### Server (`server/routes/export.ts`, NEW)

Mirrors the structure of `routes/generate.ts` (same `sendJson`, `readBody`
helpers, same security posture):

```
handleExport(req, res):
  if method !== POST → 405
  body = readBody(req); parsed = JSON.parse(body)        // 400 on failure
  if parsed has no object `stack` → 400 plain-language
  try:
    html = await exportStack(parsed.stack)               // reused exporter
  catch (e):
    if e instanceof ExportValidationError:
      → 422 { ok:false, message: plainMessageFrom(e.errors) }
    else:
      console.error(e)                                   // server-side only
      → 500 { ok:false, message: "Something went wrong on our end. Please try again." }
    return
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Disposition": `attachment; filename="${safeFileName(parsed.stack.title)}"`,
  })
  res.end(html)                                           // raw HTML, byte-exact
```

`safeFileName(title)` is the shared helper (letters/digits/hyphens only,
`.html` suffix, `lesson.html` fallback) so the header and the client agree.
`exportStack` already calls `validate()` internally, so the route does not
re-validate; it only needs to recognise `ExportValidationError` and translate
`error.errors` to a plain-language message (reusing the same
`plainMessageFrom` mapping as the editor). No API key, env var, or stack trace
is ever placed in a response body (REQ-MKR-13), matching the generate route.

`server/index.ts` gains one branch:

```ts
if (method === "POST" && url === "/api/export") {
  await handleExport(req, res).catch(/* same 500 guard as generate */);
  return;
}
```

### Response-shape decision (settled)

- **Success** — `200 text/html; charset=utf-8` with the file body **verbatim**,
  plus `Content-Disposition: attachment; filename="<safe-title>.html"`. Byte
  fidelity (REQ-MKR-12) is the deciding factor: a JSON envelope would re-encode
  the HTML through `JSON.stringify`/`parse`; raw `text/html` avoids any
  transform and lets the client download the body directly.
- **Errors** — always `application/json`, plain-language: `422` for an
  `ExportValidationError`, `400` for a missing/invalid stack shape, `500` for an
  unexpected error. Never partial HTML, never a raw code or stack trace.

---

## Accessibility (`a11y.ts`, REQ-MKR-15)

- **Focus order**: Start → sentence field → Generate. Editor → toolbar → card
  list → canvas (selected element handles) → inspector. A documented tab order
  per screen; no positive `tabindex`.
- **Focus ring**: a single shared CSS rule applies 3 px solid `--color-ink`,
  offset 2 px, to `:focus-visible` on every interactive element. No outline is
  suppressed without this replacement (design-system.md).
- **18 px floor**: the editor chrome uses the design-system type scale; the
  canvas uses the renderer, which already enforces the floor. A lint/test check
  can assert no `font-size` below 18 px in the editor CSS.
- **Shaped tiles**: tiles are rendered by `renderer.ts`, which already pairs
  each tile with its shape; the editor's "mark correct" indicator is a label or
  tick, not a colour change alone.
- **aria-live**: `a11y.ts` owns one visually-hidden `aria-live="polite"` region.
  `store.apply` announces success/failure through it; Play mode reuses the
  renderer's own aria-live for the stamp.
- **44 px targets**: toolbar buttons, card-list entries, and element handles are
  sized ≥ 44 × 44 px.
- **Reduced motion**: all motion lives in `renderer.ts` / shared CSS already
  wrapped in `prefers-reduced-motion`; the editor adds no unwrapped animation.

---

## Static design mockups (review gate, before any UI code)

Before writing any Preact component, every editor screen state is drawn as a
**static HTML mockup** in the Stamp Pad design system under
`docs/design/maker/`, so the look is reviewed before UI code exists. The
mockups are hand-written HTML/CSS using the design-system tokens (no build step,
no framework) and must render by opening the file in a browser.

Required states (one file each, or clearly separated sections):

| Mockup | Screen state |
|--------|--------------|
| `start-empty.html` | Start screen, empty sentence field, Build disabled |
| `start-generating.html` | Start screen, waiting/generating state |
| `start-error.html` | Start screen with a plain-language error message |
| `editor-quiz.html` | Editor with a **quiz** card selected (shaped tiles, mark-correct indicator) |
| `editor-flash.html` | Editor with a **flash** card selected |
| `editor-story.html` | Editor with a **story** card selected (goto buttons) |
| `editor-end.html` | Editor with the **end** card selected (score display) |
| `editor-invalid.html` | Editor showing an invalid-edit plain-language message and disabled Export |
| `play.html` | Play mode (cards only, no editing chrome) |
| `export-done.html` | Export finished / download-triggered confirmation |

These are **reference mockups**, not shipped code; the real UI is built with
Preact (see TASK-11+) to match them. They anchor the design review and give the
UI tasks a concrete visual target.

---

## Error handling summary

| Situation | Behaviour |
|-----------|-----------|
| Empty sentence on Start | Generate disabled; no API call |
| `/api/generate` → `{ ok:false }` | Show `message`; stay on Start |
| `/api/generate` network failure | Generic plain-language message; stay on Start |
| Fallback stack (`isFallback`) | Open editor; show "built offline" notice |
| Edit would break an invariant | Reject or auto-repair in `store.apply`; plain-language announce; stack stays valid |
| Nothing to undo/redo | Action disabled |
| Saved stack invalid on load | Discard silently; Start screen + gentle notice |
| `/api/export` → `ExportValidationError` | 422; plain-language message; no download |
| `/api/export` network / 500 | Plain-language message; editor unchanged |

No stack trace, raw code, or the word "stack" ever reaches the teacher
(REQ-MKR-16).

---

## Security model

- The browser never holds an API key; generation and export are both
  server-side. The export route follows the generate route's rule: strip
  everything from responses except the intended payload; log real errors
  server-side only.
- `exportStack` reads no env vars and inlines no secrets (per the exporter
  spec). The Maker does not change that.
- The client treats `localStorage` content as untrusted on load: it is
  `JSON.parse`d in a guard and must pass `validate()` before use.

### Request size limits

Both `POST /api/generate` and `POST /api/export` read the request body through
the shared `readBody(req, res, maxBytes)` helper (`server/readBody.ts`). It
stops reading once the body passes the limit, replies `413` with a
plain-language JSON message, and destroys the request stream, so one oversized
request cannot exhaust server memory. Limits: generate 16 KB (a sentence),
export 8 MB (a stack with inlined images). The export route additionally caps
what the validator leaves unbounded — more than `MAX_CARDS` cards or any text
field over `MAX_TEXT_LENGTH` (`server/exportLimits.ts`) is refused with `413`
before `exportStack` runs. Tests: `tests/request-size-limits.test.ts`.

---

## Testing strategy

| Test type | What it covers | Location (suggested) |
|-----------|----------------|----------------------|
| Unit — operations | Each `operations.ts` function returns a new stack and preserves its stated invariants for hand-built fixtures | `tests/maker/operations.test.ts` |
| Unit — markCorrect | Exactly one correct answer after marking; re-marking moves it | `tests/maker/operations.test.ts` |
| Unit — removeCard | Button and card-level gotos to the removed card are cleared; refuses sole end/non-end removal | `tests/maker/operations.test.ts` |
| Unit — history | undo/redo restore snapshots; new edit clears future | `tests/maker/history.test.ts` |
| Unit — persistence | invalid/unparseable saved stack discarded; valid one restored | `tests/maker/persistence.test.ts` |
| Unit — store | `apply` rejects invalid results, keeps `lastValidation.valid`, toggles Export enablement | `tests/maker/store.test.ts` |
| Unit — nudge coalescing | A same-element nudge burst (<600 ms gaps) is one undo step; a gap ≥600 ms or an intervening edit starts a new step | `tests/maker/store.test.ts` |
| Unit — export route | 405/400/422/500 paths; `ExportValidationError` → 422 plain message; 200 returns HTML with `Content-Disposition`; no secret in body | `tests/maker/export.route.test.ts` |
| Unit — safeFileName | Title → safe filename (letters/digits/hyphens, `.html`, `lesson.html` fallback) | `tests/maker/filename.test.ts` |
| Unit — mountPlayer sameness | The exported `player/index.ts` and Play mode both call `mountPlayer`; a spy/import test proves one shared function drives both | `tests/player/mount.test.ts` |
| Integration — generate→editor | Stubbed `/api/generate` success/fallback/error drives the correct screen state | `tests/maker/generate-flow.test.ts` |
| Review — static mockups | Every screen state exists as a static HTML file under `docs/design/maker/` and renders in a browser (design review gate before UI code) | `docs/design/maker/` |
| **Property — always valid** | For any sequence of operations from a valid stack, the result passes `validate()` | `tests/maker/operations.property.test.ts` |
| **Property — undo restores exactly** | For any single edit (and any coalesced nudge burst) on a valid stack, undo yields a stack `deepEqual` to the pre-edit / pre-burst stack | `tests/maker/history.property.test.ts` |
| **Property — export round-trip** | For any valid stack reached by edits, `exportStack` → extract `#stack-data` → parse `deepEqual` the edited stack (builds on the exporter's own round-trip test) | `tests/maker/export.property.test.ts` |

Property tests use fast-check (tech.md) and reuse the valid-stack arbitrary
from the exporter/validator property tests where possible, then apply random
operation sequences on top.

---

## Key design decisions

### Why whole-stack snapshots for undo rather than command diffs?

Stacks are tiny (≤ ~20 cards). Snapshots make "undo restores the exact previous
stack" a one-line `deepEqual` and remove a whole class of inverse-operation
bugs. The cost (memory) is negligible at this scale and bounded by a ring.

### Why a single `store.apply` chokepoint?

REQ-MKR-09 ("never a dead export") is only trustworthy if there is exactly one
path that mutates the stack and it always validates before committing. One
chokepoint also gives one place for persistence and aria-live announcements.

### Why reuse `renderCard` for the editor canvas instead of a bespoke editor view?

The product's one key moment is "what you see is what the class gets". Using the
player's renderer for the editor preview makes that literally true and removes
drift between editor and export. The editor layers selection/drag affordances
*on top*, never inside, the renderer's DOM.

### Why a server export route rather than bundling the player in the browser?

tech.md keeps the player bundle and asset inlining server-side, and the exporter
already reads the pre-built IIFE and runs `validate()`/`inlineImages`. Calling
`exportStack` over a thin route keeps the Maker bundle small and keeps a single
export code path shared with any future caller.

### Why raw-HTML response for export?

Byte fidelity (REQ-MKR-12: do not alter the exporter's bytes). A JSON envelope
would re-encode the HTML through `JSON.stringify`/`parse`; raw `text/html`
avoids any transform and lets the client download the body directly. A
`Content-Disposition: attachment` header names the file so a direct browser
navigation would also download rather than render it.

### Why extract `mountPlayer` into `src/player/`?

Play mode must be *the same code the class runs*, not a lookalike. Lifting the
exported player's mount/navigation loop into `mountPlayer(stack, root)` and
having both the exported `index.ts` and Play mode call it removes any drift
(auto-advance guard, fatal-error handling, sounds) between preview and
production. It is a pure refactor — no behaviour change — so the player size
budget and the committed-bundle staleness check stay green. A test asserts both
entry points go through the one function.

### Why draw static mockups before writing UI code?

The product's value is the look-and-feel of a stamp-pad classroom tool. Drawing
every screen state as static HTML in `docs/design/maker/` lets us review the
design on a real browser/projector before committing to component code, and
gives the Preact tasks an exact target to match.

---

## Not in scope for this feature

- Re-implementing the validator, renderer, runtime, generate route, or
  exporter (all reused). The only change to `src/player/` is the pure
  `mountPlayer` extraction described above.
- UI libraries other than Preact (tech.md: Preact is the chosen option).
- Accounts, cloud save/sync, collaboration, analytics (product.md).
- Rich image management / upload UI beyond the schema's existing `src`/`alt`.
- Theming UI beyond what `Theme` already carries.
- Offline generation in the browser (generation stays server-side).
