# Maker App — Tasks

## Implementation order

Tasks are grouped into phases. Each task is testable on its own and depends
only on tasks before it. The shared types, validator, renderer, runtime,
generate route, and exporter are **reused unchanged** — the only change to
`src/player/` is the pure `mountPlayer` extraction in TASK-17a. UI is built with
**Preact**; no other UI libraries.

```
Phase 1   server export route            TASK-01 → TASK-02
Phase 2   editor foundation (store)       TASK-03 → TASK-04 → TASK-05
Phase 3   pure operations                 TASK-06 … TASK-10
Phase 4   property tests                  TASK-P1, TASK-P2, TASK-P3
Phase 4b  design mockups (review gate)    TASK-10M
Phase 5   UI shell + screens (Preact)     TASK-11 … TASK-16
Phase 6   mountPlayer, Play, export, save TASK-17a → TASK-17 → TASK-18 → TASK-19
Phase 7   accessibility pass              TASK-20
```

---

## Phase 1 — Server export route

### TASK-01: Implement `server/routes/export.ts` — Done
**Refs:** REQ-MKR-13, design §Export flow (server)

> **Done:** Added `handleExport` (405/400/422/500 paths, raw `text/html` success with `Content-Disposition`), plus shared `plainMessageFrom`/`safeFileName` in `src/shared/messages.ts`; `tests/maker/export.route.test.ts` green (6 tests), full suite 236 pass, tsc clean.


- Create `handleExport(req, res)` modelled on `server/routes/generate.ts`
  (reuse the same `sendJson` / `readBody` helper shapes).
- Reject non-POST with 405; unreadable/invalid JSON body with 400; a body with
  no object `stack` with 400 — all with plain-language messages.
- Call `exportStack(parsed.stack)` from `server/exporter.ts`.
- On `ExportValidationError`, respond 422 with JSON
  `{ ok:false, message }` where `message` comes from a `plainMessageFrom(errors)`
  helper (audience.md wording, never a raw code).
- On success, respond `200` with `Content-Type: text/html; charset=utf-8`, a
  `Content-Disposition: attachment; filename="<safe-title>.html"` header (via a
  shared `safeFileName(title)` helper — letters/digits/hyphens only, `.html`
  suffix, `lesson.html` fallback), and the HTML body verbatim.
- On any other throw, log server-side only and respond 500 with a generic
  plain-language message. Never place an API key, env var, or stack trace in
  any response body.

**Done when:** `tests/maker/export.route.test.ts` (calling the handler
directly, exporter stubbed where needed) asserts: non-POST → 405; missing
`stack` → 400 JSON; a stack that fails validation → 422 JSON with a plain
message and no HTML; a valid stack → 200 `text/html` whose body starts with
`<!doctype html>` and whose `Content-Disposition` header carries a safe
`filename="….html"`; and that no sentinel secret (`STACKYARD_LLM_API_KEY` set
to a known value) appears in any response body.

---

### TASK-02: Register `/api/export` in `server/index.ts` — Done
**Refs:** REQ-MKR-13, design §Export flow (server)

> **Done:** Wired `/api/export` into `createServer()` (dispatch any method so GET → handler's 405) with the same 500 guard as generate; `tests/maker/export.server.test.ts` green (3 tests), full suite 239 pass, tsc clean.


- Add a `POST /api/export` branch alongside the existing `/api/generate`
  branch, with the same unhandled-error 500 guard.

**Done when:** An integration test boots `createServer()` on an ephemeral port,
`POST`s a valid stack to `/api/export`, and receives `200 text/html` with a
`<!doctype html>` body; `POST`ing an invalid stack returns 422 JSON with a
plain message; a `GET /api/export` returns 405.

---

## Phase 2 — Editor foundation

### TASK-03: Editor state types and `history.ts` — Done
**Refs:** REQ-MKR-10, design §Undo/redo, §The editor store

> **Done:** Added `src/editor/types.ts` (EditorState, HistoryState, EditOperation, Rejected) reusing the shared schema, and `history.ts` (commit/undo/redo/canUndo/canRedo over `structuredClone` snapshots, bounded ring of 100); `tests/maker/history.test.ts` green (7 tests), full suite 246 pass, tsc clean.


- Define `EditorState` and `HistoryState` as in the design (reusing `Stack`
  etc. from `src/shared/types.ts`; add **no** new stack-schema types).
- Implement `history.ts`: `commit(prev)`, `undo()`, `redo()`,
  `canUndo()`, `canRedo()`, storing deep copies (`structuredClone`) in
  `past`/`future`; `commit` clears `future`; bounded ring (e.g. 100).

**Done when:** `tests/maker/history.test.ts` asserts: commit then undo returns
the committed snapshot; redo re-applies it; a new commit after undo clears
`future`; `canUndo`/`canRedo` reflect emptiness; a stored snapshot is not
mutated when the live stack is later changed.

---

### TASK-04: Implement `persistence.ts` — Done
**Refs:** REQ-MKR-14, design §Persistence

> **Done:** Added `src/editor/persistence.ts` with trailing-debounced `save` (300 ms, injectable storage + `flush`), guarded `load` (parse then `validate`, discard on failure → null), and `clear` under `stackyard:maker:v1`; `tests/maker/persistence.test.ts` green (7 tests), full suite 253 pass, tsc clean.


- `save(stack)` → `localStorage["stackyard:maker:v1"] = JSON.stringify(stack)`,
  trailing-debounced (~300 ms).
- `load()` → parse guarded; run `validate()`; return the stack only if valid,
  else discard and return `null`.
- `clear()` to remove the key.

**Done when:** `tests/maker/persistence.test.ts` (with a `localStorage` stub)
asserts: a valid saved stack round-trips through `load()`; an unparseable value
yields `null` without throwing; a parseable-but-invalid stack yields `null`;
`save` writes under the `stackyard:maker:v1` key.

---

### TASK-05: Implement `store.ts` (the `apply` chokepoint) — Done
**Refs:** REQ-MKR-09, REQ-MKR-10, design §Always-valid guarantee

> **Done:** Added `src/editor/store.ts` (`EditorStore`): single `apply` chokepoint that runs the op, surfaces Rejected/invalid without committing, validates before commit, coalesces same-`coalesceKey` edits < 600 ms (injectable clock) into one undo step, persists on commit, and exposes `undo`/`redo`/`canExport`/`setStack`; `tests/maker/store.test.ts` green (9 tests), full suite 262 pass, tsc clean.


- Implement `EditorStore` holding `EditorState`.
- `apply(op, opts?)`: run the pure op; if it returns a rejection sentinel,
  announce and return `{ ok:false, message }`; else `validate()` the result; if
  invalid, announce a plain message and return `{ ok:false, message }`
  **without** committing; if valid, either push a new `history.commit(prev)` or,
  when `opts.coalesceKey` matches the previous commit's key and the previous
  commit was < 600 ms ago, replace the live stack in place (keeping the
  pre-burst snapshot), then `persistence.save`, re-render hook, announce
  success, return `{ ok:true }`.
- Track `lastCommit = { coalesceKey, at }`; seal a burst after 600 ms of
  inactivity.
- `undo()` / `redo()` delegate to `history.ts` and re-render/persist.
- Expose `canExport()` = `lastValidation.valid`.
- Include a `plainMessageFrom(errors)` helper (shared with the export route)
  mapping each validator code to an audience-rule sentence, and a
  `safeFileName(title)` helper (shared with the export route and the download).

**Done when:** `tests/maker/store.test.ts` asserts: a valid op commits and
leaves `canExport()` true; an op whose result is invalid (injected stub op) is
**not** committed, leaves the previous stack intact, and returns
`{ ok:false }`; undo after a valid op restores the previous stack; `apply`
calls `persistence.save` exactly once per committed edit; **two `apply` calls
with the same `coalesceKey` < 600 ms apart produce a single undo step that
restores the pre-burst stack, while the same two with a ≥ 600 ms gap (or an
intervening different-key edit) produce two undo steps**.

---

## Phase 3 — Pure edit operations (`operations.ts`)

Every operation is `(stack, args) => Stack | Rejected`, pure, returning a new
stack. Each task includes a unit test proving it preserves its invariants.

### TASK-06: `editText`, `editLabel` — Done
**Refs:** REQ-MKR-03

> **Done:** Added `editText` and `editLabel` to `src/editor/operations.ts` (pure, copy-not-mutate; `editLabel` rejects a blank label); tests in `tests/maker/operations.test.ts` green (5 tests), full suite 267 pass, tsc clean.


- `editText(stack, elementId, content)` returns a new stack with the text
  element's `content` replaced.
- `editLabel(stack, elementId, label)` replaces a button's `label`; returns a
  rejection sentinel if `label` is empty after trimming.

**Done when:** Unit tests show content/label updated on a copy (input not
mutated), and that an empty label is rejected and the result (when applied via
the store) still passes `validate()`.

---

### TASK-07: `markCorrect` — Done
**Refs:** REQ-MKR-04, design §markCorrect detail

> **Done:** Added `markCorrect` (chosen answer → score:1 + cheer, all other answer buttons → score:0 + buzz, gotos preserved, idempotent); unit tests + a fast-check property (500 runs) assert exactly-one-correct and `validate()` pass. Full suite 272, tsc clean.


- Set the chosen answer button's actions to include `score:1` + `cheer`; set
  every other answer button on the card to `score:0` + `buzz`; keep any `goto`
  on those buttons.

**Done when:** Unit tests assert that after `markCorrect` the quiz card has
exactly one button with `{score,delta:1}` and at least one without; re-marking
a different tile moves the single correct marking; the result passes
`validate()` (invariant 4). A property test over arbitrary quiz cards asserts
"exactly one correct" always holds after marking.

---

### TASK-08: `addCard`, `removeCard`, `reorderCards` — Done
**Refs:** REQ-MKR-05, design §removeCard detail

> **Done:** Added `addCard` (fresh-UUID seed per kind, quiz seed has one correct answer, rejects a 2nd end), `removeCard` (strips button + card-level gotos to the removed id, rejects sole end/sole non-end), and `reorderCards` (ids unchanged, clamped); 10 unit tests added. Full suite 282, tsc clean.


- `addCard(stack, kind, index)`: insert a valid seed card with a fresh UUID; a
  `quiz` seed has exactly one correct answer.
- `removeCard(stack, cardId)`: clear every button and card-level `goto` that
  targeted the removed card; reject if it is the only end card or the only
  non-end card.
- `reorderCards(stack, from, to)`: reposition without changing any id.

**Done when:** Unit tests assert: adding each kind yields a stack that passes
`validate()`; removing a card re-points/clears gotos so no `invalid-goto`
remains; removing the sole end card or sole non-end card is rejected;
reordering changes order but not ids and keeps `validate()` passing.

---

### TASK-09: `changeKind` — Done
**Refs:** REQ-MKR-06

> **Done:** Added `changeKind` (updates `kind`, seeds a correct/wrong answer pair when a card becomes a quiz, rejects creating a 2nd end or un-ending the sole end card); 6 unit tests added. Full suite 288, tsc clean.


- `changeKind(stack, cardId, kind)`: update `kind`; seed quiz answers when
  becoming a quiz; reject if it would create a second end card or remove the
  only end card.

**Done when:** Unit tests assert: quiz→story and story→quiz both pass
`validate()` (the new quiz has exactly one correct answer); changing a card to
`end` when an end card already exists is rejected; changing the only end card
away from `end` is rejected.

---

### TASK-10: `setGotoTarget`, `moveElement` — Done
**Refs:** REQ-MKR-07, REQ-MKR-08

> **Done:** Added `setGotoTarget` (replaces a button's goto, rejects unknown targets) and `moveElement` (clamps to x∈[0,800-w], y∈[0,600-h], invariant 5); 7 unit tests incl. a 500-run clamp property. Full suite 295, tsc clean.


- `setGotoTarget(stack, buttonId, targetCardId)`: set the button's `goto` to an
  existing card; reject an unknown target.
- `moveElement(stack, elementId, x, y)`: clamp to `x ∈ [0, 800-w]`,
  `y ∈ [0, 600-h]`.

**Done when:** Unit tests assert: a valid target sets the `goto` and passes
`validate()`; an unknown target is rejected; a move beyond any edge is clamped
so `x+w ≤ 800` and `y+h ≤ 600` (invariant 5) for a range of inputs.

---

## Phase 4 — Property-based tests (editor invariants)

### TASK-P1: Property — any edit sequence from a valid stack stays valid — Done
**Refs:** REQ-MKR-09, design §Testing strategy

> **Done:** Added `tests/maker/arbitraries.ts` (valid-stack + random op-sequence arbitraries) and `tests/maker/operations.property.test.ts`: 1000 runs, `validate()` passes after every step. Deliberate break: disabled the store's validate-before-commit guard and removed `moveElement`'s clamp together — the property went red (off-canvas stack committed) — then restored both and it passed again. Full suite 296, tsc clean.


- In `tests/maker/operations.property.test.ts`, define a fast-check arbitrary
  that produces a valid starting stack (reuse the exporter/validator valid-stack
  arbitrary) and a random sequence of operations (each op with randomly chosen,
  type-correct args referencing ids that exist at application time).
- Apply the sequence through `store.apply` (or directly through the operations
  with the store's reject-on-invalid rule).
- After every step, assert `validate(state.stack).valid === true`.
- Run ≥ 1,000 examples.

**Done when:** The test runs ≥ 1,000 sequences with zero failures; every
intermediate and final stack passes `validate()`.

---

### TASK-P2: Property — undo after any edit restores the exact previous stack — Done
**Refs:** REQ-MKR-10, design §Undo/redo

> **Done:** Added `tests/maker/history.property.test.ts`: (1) single edit → one undo deepEquals pre-edit, (2) 2-10 same-key nudges <600 ms → one undo to pre-burst, (3) gap-broken burst → two undos; each 1000 runs. Deliberate break: disabled the store's `shouldCoalesce` branch — the one-step-burst property went red — then restored it and all three passed. Full suite 299, tsc clean.


- In `tests/maker/history.property.test.ts`, generate a valid stack and a
  single random valid operation. Snapshot the stack (deep copy), apply the op
  via the store, then `undo()`.
- Assert the post-undo stack is `deepEqual` to the pre-edit snapshot.
- Add a second arbitrary: a snapshot, then a **burst** of 2–10 `moveElement`
  nudges on the same element applied with the same `coalesceKey` and simulated
  gaps < 600 ms; a single `undo()` must restore the pre-burst snapshot
  (`deepEqual`). A third arbitrary interleaves a ≥ 600 ms gap mid-burst and
  asserts it then takes **two** undos to reach the pre-burst snapshot.
- Run ≥ 1,000 examples; include operations of every type.

**Done when:** All runs pass; `undo` yields a stack deep-equal to the pre-edit
stack for every operation type, and a coalesced nudge burst undoes to its
pre-burst state in one step while a gap-broken burst takes two.

---

### TASK-P3: Property — export after any edit round-trips — Done
**Refs:** REQ-MKR-12, design §Testing strategy

> **Done:** Added `tests/maker/export.property.test.ts`: generate a valid stack, apply a random edit sequence via the store, `exportStack`, extract `#stack-data`, parse, deepEqual the edited stack; 1000 runs. Deliberate break: made the exporter append `!` to the title during serialisation — the property went red (round-trip mismatch) — then restored it and it passed. Full suite 300, tsc clean.


- In `tests/maker/export.property.test.ts`, generate a valid stack, apply a
  random valid edit sequence, then call `exportStack(state.stack)`.
- Extract `#stack-data` from the returned HTML (regex, as in the exporter's own
  round-trip test), `JSON.parse` it, and assert it is `deepEqual` to
  `state.stack`.
- Run ≥ 1,000 examples.

**Done when:** All runs pass; the embedded JSON always round-trips to the edited
stack, confirming the editor never produces a stack the exporter changes or
rejects.

---

## Phase 4b — Design mockups (review gate before UI)

### TASK-10M: Static HTML mockups of every screen state (`docs/design/maker/`)
**Refs:** REQ-MKR-15, REQ-MKR-16, design §Static design mockups, design-system.md

- Hand-write static HTML/CSS mockups (Stamp Pad design system tokens; no
  framework, no build step) under `docs/design/maker/`, one file per state:
  `start-empty.html`, `start-generating.html`, `start-error.html`,
  `editor-quiz.html`, `editor-flash.html`, `editor-story.html`,
  `editor-end.html`, `editor-invalid.html`, `play.html`, `export-done.html`.
- Each mockup uses only the design-system colours, fonts (self-hosted, no CDN),
  spacing, card anatomy, shaped tiles, focus-ring, and the 18 px floor.
- The `editor-invalid.html` mockup shows a plain-language invalid-edit message
  and a disabled Export button; `editor-quiz.html` shows the mark-correct
  indicator (label/tick, not colour alone).
- These are reference mockups only — no application code, no git changes here.

**Done when:** All ten files exist under `docs/design/maker/` and each renders
correctly when opened directly in a browser (`file://`), with no console errors
and no external network requests; a reviewer sign-off on the look gates the UI
tasks below.

---

## Phase 5 — UI shell and screens (Preact)

### TASK-11: App shell and screen switch (`src/main.tsx`, `src/editor/app.tsx`)
**Refs:** REQ-MKR-02, REQ-MKR-14, design §Architecture, design-system §Maker app shell

- Build with **Preact** (no other UI libraries). Mount `<App>`; render the
  design-system top bar (ink background, "Stackyard" wordmark) and the screen
  container, matching the TASK-10M mockups.
- On load, call `persistence.load()`: if a valid stack exists, open the editor
  on it; else show the Start screen.
- Switch between `start` / `editor` / `play` from `EditorState.screen`.

**Done when:** A jsdom smoke test asserts: with an empty `localStorage` the
Start screen renders; with a valid saved stack the editor renders that stack's
first card; the top bar shows the "Stackyard" wordmark.

---

### TASK-12: Start screen (`src/editor/StartScreen.tsx`, `src/editor/api.ts` generate)
**Refs:** REQ-MKR-01, design §Architecture

- Preact component matching `start-empty/generating/error` mockups. Sentence
  input + "Build" button (Title Case per audience.md); button disabled while the
  field is empty/whitespace.
- On submit: `status = "generating"`, `POST /api/generate`; on `ok:true` load
  the stack into the store and switch to the editor (show a "built offline"
  notice when `isFallback`); on `ok:false` or network failure show the
  plain-language message and stay on Start.

**Done when:** `tests/maker/generate-flow.test.ts` (fetch stubbed) asserts:
empty input keeps the button disabled and makes no request; a success response
switches to the editor with the returned stack; `isFallback:true` shows the
offline notice; an error response shows the message and stays on Start.

---

### TASK-13: Card list (`src/editor/CardList.tsx`)
**Refs:** REQ-MKR-02, REQ-MKR-05, design-system §Accessibility

- Preact component. Render one entry per card in stack order, each showing
  "Card N of M" and the kind, each a ≥ 44 px keyboard-focusable control.
- Selecting an entry sets `selectedCardId` and re-renders the canvas.
- Add / Remove / Move-up / Move-down controls call `store.apply` with
  `addCard` / `removeCard` / `reorderCards`.

**Done when:** A test asserts: the list shows one entry per card with the right
position label; selecting an entry updates `selectedCardId`; add/remove/reorder
go through `store.apply` and the list re-renders in the new order; a rejected
removal (sole end card) shows a plain-language message and does not change the
list.

---

### TASK-14: Canvas (`src/editor/Canvas.tsx`) — reuse `renderCard`
**Refs:** REQ-MKR-02, design §Canvas

- Preact component that, after mount, draws the selected card into a scaled
  800 × 600 root with
  `renderCard(card, root, createRuntime(stack), noopNavigate, noopPlaySound)`.
- Reuse the player's scale factor (`min(w/800, h/600)`); recompute on resize.
- Attach a capture-phase click handler that maps a clicked element to its id and
  sets `selectedElementId` — without modifying `renderer.ts`.

**Done when:** A jsdom test asserts: the selected card's text/labels appear in
the canvas DOM via the reused renderer; clicking a rendered element selects it
(`selectedElementId` set); switching the selected card re-renders the canvas.

---

### TASK-15: Inspector (`src/editor/Inspector.tsx`)
**Refs:** REQ-MKR-03, REQ-MKR-04, REQ-MKR-06, REQ-MKR-07

- For the selected element/card, show controls that call the matching
  operation via `store.apply`:
  - text `content` / button `label` editing (`editText` / `editLabel`),
  - "mark this the right answer" on a quiz tile (`markCorrect`),
  - change card kind (`changeKind`),
  - "on click go to…" destination picker listing existing cards by plain name
    (`setGotoTarget`).
- The correct-answer indicator uses a label/tick, not colour alone.

**Done when:** A test asserts each control dispatches the correct operation with
the correct args; the goto picker lists only existing cards (never raw ids); a
rejected edit (empty label, duplicate end card) surfaces a plain-language
message and leaves the stack unchanged.

---

### TASK-16: Toolbar and undo/redo UI (`src/editor/Toolbar.tsx`)
**Refs:** REQ-MKR-05, REQ-MKR-10, REQ-MKR-12, design-system §Export button

- Preact component. Bottom toolbar per design-system: Text / Button / Picture /
  "Go to card…" / Undo / Redo, and the Export button (the only `--color-stamp`
  use), matching the mockups.
- Undo/Redo call `store.undo()`/`store.redo()` and are disabled when
  `canUndo()`/`canRedo()` are false.
- Export button disabled unless `store.canExport()`.

**Done when:** A test asserts: Undo/Redo enablement tracks history state; the
Export button is disabled when the stack is (forced) invalid and enabled when
valid; the Export button carries the stamp styling and ≥ 44 px target.

---

## Phase 6 — Shared player mount, Play, export, persistence wiring

### TASK-17a: Extract `mountPlayer(stack, root)` into `src/player/mount.ts`
**Refs:** REQ-MKR-11, design §Play mode, §Why extract `mountPlayer`

- Move the mount/navigation routine currently inline in `src/player/index.ts`
  into a new `src/player/mount.ts` exporting
  `mountPlayer(stack: Stack, root: HTMLElement): () => void` — same code
  (runtime creation, `navigateTo(id, automatic)` with the auto-advance counter
  and 20-step fatal-error guard, `renderCard`, `playSound`), returning a
  teardown function.
- Rewrite `src/player/index.ts` as a thin wrapper: on `DOMContentLoaded`, read
  `#stack-data`, `validate`, then call `mountPlayer(stack, root)`.
- This is a pure refactor — no behaviour change.
- Rebuild the player bundle (`npm run build:player`).

**Done when:** `npm run build:player` succeeds and the gzipped IIFE is still
≤ 50 KB (size test green); the staleness check (`scripts/check-player-fresh.sh`)
exits 0 against the rebuilt-and-committed bundle; all existing player tests
(`tests/runtime.test.ts`, `tests/player.index.test.ts`, etc.) still pass
unchanged; and a new `tests/player/mount.test.ts` asserts a minimal valid stack
mounts via `mountPlayer` (first card rendered) and the auto-advance guard still
stops at 20.

---

### TASK-17: Play mode (`src/editor/PlayOverlay.tsx`) — via `mountPlayer`
**Refs:** REQ-MKR-11, design §Play mode

- Preact overlay that covers the editor and calls the **shared**
  `mountPlayer(stack, root)` from `src/player/mount.ts` — the exact function the
  exported player entry calls — over the current stack. Keep the teardown handle
  it returns.
- Hide all editing chrome while playing. On exit, call the teardown handle and
  return to the editor with the previous selection; write nothing back to
  `state.stack`.

**Done when:** A jsdom test asserts: starting Play renders the first card with
no toolbar/inspector present; answering through to the `end` card shows the
score from the `score` actions; exiting Play returns to the editor with the
same `selectedCardId` and a stack `deepEqual` to the pre-play stack; and
`tests/player/mount.test.ts` proves the exported `player/index.ts` and Play mode
go through the **one** `mountPlayer` function (e.g. by spying/importing the same
symbol), so Play mode is literally the code the class gets.

---

### TASK-18: Export download (`src/editor/api.ts` export + Toolbar)
**Refs:** REQ-MKR-12, design §Export flow (client)

- On Export: `POST /api/export` with `{ stack }`; on `200`, read the body as
  **text** and trigger a browser download (`Blob` + object URL + temporary `<a
  download>`), file-named from the server's `Content-Disposition` filename or,
  as a fallback, the shared `safeFileName(title)` (letters/digits/hyphens,
  `.html`, `lesson.html` fallback); on 422/400 show the plain-language JSON
  `message` and download nothing; on network failure show a plain-language
  message and leave the editor unchanged.
- Do not alter the response bytes before download.

**Done when:** A test (fetch + download stubbed) asserts: a `200 text/html`
response triggers a download whose Blob content equals the response body
byte-for-byte and whose file name is the safe `.html` name; a 422 shows the
message and triggers no download; a network failure shows a message and leaves
`state.stack` unchanged.

---

### TASK-19: Wire persistence into the store lifecycle
**Refs:** REQ-MKR-14, design §Persistence

- Ensure every committed edit and every successful generate calls
  `persistence.save`; a failed generate does not overwrite the existing save;
  an invalid saved stack on load is discarded with a gentle Start-screen notice.

**Done when:** A test asserts: after an edit the saved value parses and equals
the current stack; a failed generate leaves the prior saved stack intact; a
corrupted saved value sends the app to the Start screen with a notice and no
thrown error.

---

## Phase 7 — Accessibility pass

### TASK-20: Accessibility (`a11y.ts`) and audit
**Refs:** REQ-MKR-15, REQ-MKR-16, design §Accessibility, design-system §Accessibility

- Implement the shared `aria-live="polite"` announcer used by `store.apply` and
  wire outcome messages (success/failure/undo) through it.
- Apply the shared focus-ring rule (3 px solid `--color-ink`, offset 2 px) to
  all interactive elements via `:focus-visible`; set a documented tab order per
  screen with no positive `tabindex`.
- Provide keyboard element-move: arrow / Shift+arrow nudges call
  `store.apply(moveElement(...), { coalesceKey: "move:" + elementId })` so a
  burst coalesces into one undo step (REQ-MKR-08 / REQ-MKR-10).
- Assert the 18 px floor and ≥ 44 px targets in the editor CSS.

**Done when:** Tests assert: every interactive control is reachable by keyboard
in the documented order; an edit announces a plain-language message in the
aria-live region; arrow-key nudges move the selected button (clamped) via
`moveElement`, and a rapid burst undoes in a single step; a style check finds no
`font-size` below 18 px and no interactive target below 44 px in the editor
chrome; all user-facing strings follow audience.md (no raw code, no "stack"
wording, Irish/UK spelling) — checked by a string-lint test over the editor's
message table.

---

## Task dependency summary

```
TASK-01 (export route) ── TASK-02 (register route)

TASK-03 (state + history) ─┬─ TASK-05 (store.apply)
TASK-04 (persistence) ─────┘        │
                                    ├─ TASK-06 editText/editLabel
                                    ├─ TASK-07 markCorrect
                                    ├─ TASK-08 add/remove/reorder
                                    ├─ TASK-09 changeKind
                                    └─ TASK-10 setGotoTarget/moveElement
                                         │
     ┌───────────────────────────────────┴──────────────┐
     TASK-P1 (always valid)  TASK-P2 (undo exact, incl. coalesced nudges)  TASK-P3 (export round-trip)

TASK-10M (static mockups — review gate) ── gates all UI tasks below

TASK-05 + ops + TASK-10M ──┬─ TASK-11 app shell (Preact) ─ TASK-12 start ─ TASK-13 card list
                           ├─ TASK-14 canvas (reuse renderCard)
                           ├─ TASK-15 inspector
                           └─ TASK-16 toolbar/undo-redo
                                ├─ TASK-17a mountPlayer extraction (size + staleness green)
                                │     └─ TASK-17 Play (via shared mountPlayer)
                                ├─ TASK-18 export download ── needs TASK-02
                                └─ TASK-19 persistence wiring
                                     └─ TASK-20 accessibility pass (nudge coalescing)
```
