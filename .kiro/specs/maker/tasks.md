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

### TASK-21: `addTextElement`, `addButtonElement`, `addPictureElement`, `linkButtonToCard` + wire the toolbar — Done
**Refs:** REQ-MKR-17, design §Edit operations, §The four toolbar tools

> **Done:** Added the four pure operations to `operations.ts` and wired the four toolbar tool cards (Add Text / Add Button / Add Picture / Link a Card) to them through `store.apply` — replacing the earlier "coming soon" stubs. `addTextElement` and `addButtonElement` append a default on-canvas element and select it; `addButtonElement` adds a plain (no-`score`) button so a quiz card's invariant 4 is untouched; `addPictureElement` reads a local file as a `data:` URI (self-contained, offline), requires non-empty alt text, and caps the decoded size at `MAX_PICTURE_BYTES` (2 MB); `linkButtonToCard` checks the selected element is a button (plain message otherwise), then delegates to `setGotoTarget`. All four are exercised in the P1–P3 edit-sequence property tests (added to `tests/maker/arbitraries.ts`). 12 new unit tests in `tests/maker/operations.test.ts` and 4 new toolbar tests in `tests/maker/toolbar.test.ts`. Deliberate break: disabled `addPictureElement`'s required-alt check once — the "rejects empty alt" test went red — then restored it and it passed. Full suite 393 pass, `npx tsc --noEmit` clean.

- Add four pure operations to `src/editor/operations.ts`, each
  `(stack, args) => Stack | Rejected`, pure and copy-not-mutate:
  - `addTextElement(stack, cardId, content?)` — append a `text` element in a
    default on-canvas box (invariant 5).
  - `addButtonElement(stack, cardId, label?)` — append a `button` with a default
    label and empty `actions`; reject a blank label. No `score` action, so a
    quiz card keeps invariant 4.
  - `addPictureElement(stack, cardId, dataUri, alt)` — append an `image` from a
    `data:` URI; reject a non-`data:` src, blank alt, or data over
    `MAX_PICTURE_BYTES` (2 MB).
  - `linkButtonToCard(stack, buttonId, targetCardId)` — check the element is a
    button, then delegate to `setGotoTarget` (invariant 2).
- Wire the four toolbar tool cards (`src/editor/Toolbar.tsx`) to these ops
  through `store.apply`. Add Picture uses a hidden file input + an alt-text
  prompt; Link a Card opens an inline card picker (plain names, never raw ids)
  and shows a plain message when no button is selected.
- Include all four ops in the P1–P3 edit-sequence property tests via
  `tests/maker/arbitraries.ts`.
- Break the new validation once on purpose and watch a test go red, then
  restore it.

**Done when:** Unit tests assert each op adds the right element / wires the
right `goto`, keeps the stack passing `validate()`, rejects its bad inputs
(blank label, non-`data:` src, blank alt, over-size picture, non-button link
target) with a plain-language message and no mutation; toolbar tests assert the
four tool cards dispatch the matching op through `store.apply` and that Link a
Card without a button selected shows a plain message; P1–P3 still pass with the
four ops in the operation mix; `npm test` and `npx tsc --noEmit` are both clean.

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

### TASK-10M: Static HTML mockups of every screen state (`docs/design/maker/`) — Done
**Refs:** REQ-MKR-15, REQ-MKR-16, design §Static design mockups, design-system.md

> **Done:** Hand-wrote all ten self-contained screen-state mockups under `docs/design/maker/` (`start-empty`, `start-generating`, `start-error`, `editor-quiz`, `editor-flash`, `editor-story`, `editor-end`, `editor-invalid`, `play`, `export-done`) plus an `index.html` linking them, all in the Stamp Pad design system with the exact colour/type/spacing tokens, shaped answer tiles (▲◆●■), ring holes, three card-edge layers, ruled lines, the 18 px floor, the CORRECT ✓ stamp, and the card drawn the same way the player renders it. Content uses Ms. Brennan's Vikings-in-Ireland quiz. No external URLs/fonts (system fallbacks only), no banned patterns; HTML validated as well-formed and every index link resolves.

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

### TASK-11: App shell and screen switch (`src/main.tsx`, `src/editor/app.tsx`) — Done
**Refs:** REQ-MKR-02, REQ-MKR-14, design §Architecture, design-system §Maker app shell

> **Done:** Added Preact (dep `preact@11.1.1`; its automatic JSX runtime is compiled by esbuild via `jsx:"automatic"`/`jsxImportSource:"preact"` in both `vite.config.ts` and `vitest.config.ts`, so no extra Vite plugin and no newer Vite major were pulled in). Built `src/main.tsx` → `<App>` (screen switch Start|Editor|Play over the `EditorStore`), the shared navy top-bar wordmark (`TopBar.tsx`), the consolidated Stamp-Pad stylesheet (`src/editor/styles.css`, fonts self-hosted at `src/assets/fonts`), `a11y.ts` aria-live announcer, and `icons.tsx`. On load `persistence.load()` opens the editor on a valid saved stack else the Start screen; a discarded corrupt save shows a gentle Start notice. Added npm scripts `dev:maker`/`build:maker`/`preview:maker`, a screenshot harness (`screens.html`, `src/screens-harness.tsx`, `scripts/shoot.sh`) and `docs/design/maker/built/`. `tests/maker/app-shell.test.ts` green (3 tests), full suite 320 pass, src/server tsc clean (pre-existing `tests/font-name.test.ts` strict-index errors are unrelated). Screenshots of `start-empty` and `editor-quiz` compared to the mockups: shell, canvas, tiles and fonts match.

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

### TASK-12: Start screen (`src/editor/StartScreen.tsx`, `src/editor/api.ts` generate) — Done
**Refs:** REQ-MKR-01, design §Architecture

> **Done:** Built `StartScreen.tsx` matching the start-empty / start-generating / start-error mockups (sentence textarea, example tabs, peek stack, rings; Build disabled while empty/whitespace) and `api.ts` `generateStack` (POST /api/generate; network + error handling, plain-language messages). On submit it flips to the generating screen, then loads the stack and opens the editor on success (announcing an "offline" notice when `isFallback`), or shows the plain-language message and stays on Start on error/failure. `tests/maker/generate-flow.test.ts` green (6 tests: empty→no request, enable-on-input, success→editor, fallback notice, error message, network failure); full suite 326 pass, src/server tsc clean. Screenshots of all three start states compared to the mockups — match (the generating counter reads "Working…" instead of a per-card "N of 10" because the generate route returns a complete stack with no streaming progress API).

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

### TASK-13: Card list (`src/editor/CardList.tsx`) — Done
**Refs:** REQ-MKR-02, REQ-MKR-05, design-system §Accessibility

> **Done:** Built `CardList.tsx` matching the mockup: one ≥44 px focusable entry per card with its position number, kind shape (quiz grid / flash book / story arrow / end flag), a two-line label (the card's most meaningful text) and a grip; the selected entry is highlighted (`aria-current`) and shows ↑/↓ move controls. Selecting sets `selectedCardId`; Add Card / move / Remove go through `store.apply(addCard|reorderCards|removeCard)`, and a rejected removal (sole end card) surfaces a plain-language message via the editor banner and changes nothing. Also added a 10-card Vikings `demoStack` for the screenshot harness. `tests/maker/card-list.test.ts` green (5 tests); full suite 331 pass, src/server tsc clean. Screenshot of the card list compared to the mockup — matches.

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

### TASK-14: Canvas (`src/editor/Canvas.tsx`) — reuse `renderCard` — Done
**Refs:** REQ-MKR-02, design §Canvas

> **Done:** Built `Canvas.tsx` which draws the selected card into a scaled 820×640 wrapper with the REUSED `renderCard(card, root, createRuntime(stack), noopNavigate, noopPlaySound)` — no editor-specific renderer. Fit scale uses the design-system Maker rule `min((w-48)/812,(h-48)/612)` clamped to [0.9, 1.35] and recomputes on resize (guarded for jsdom, which has no ResizeObserver). A capture-phase click maps a clicked `.sy-element` wrapper (renderer DOM, index-aligned to `card.elements`) to its id and sets `selectedElementId` without touching `renderer.ts`; a navy selection overlay with a "Drag to move" tab is drawn as a sibling layer. `tests/maker/canvas.test.ts` green (3 tests: text/labels via the reused renderer, click→select, re-render on card switch); full suite 334 pass, src/server tsc clean. Canvas verified in the editor-quiz screenshot against the mockup.

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

### TASK-15: Inspector (`src/editor/Inspector.tsx`) — Done
**Refs:** REQ-MKR-03, REQ-MKR-04, REQ-MKR-06, REQ-MKR-07

> **Done:** Built `Inspector.tsx` that adapts to the selected element/card and dispatches via `store.apply`: quiz answer → label input (`editLabel`) + navy "Right answer" toggle (`markCorrect`) + card type (`changeKind`) + "when picked, go to…" picker (`setGotoTarget`); story button → button text + goto picker; flash → Front (term)/Back (explanation) fields (`editText`); end card → heading field + score-line hint (no kind change); text → content field. The goto picker lists existing cards by plain name ("Card N — …", "Last card"), never raw ids; the correct-answer indicator is a navy tag/tick, never colour alone. Also added the editor-only navy "✓ Right answer" tile overlay and story "→ Card N" branch labels in the Canvas, plus the flash Front/Back segmented control. `tests/maker/inspector.test.ts` green (5 tests: editLabel, markCorrect exactly-one, goto picker names/no-raw-ids, changeKind, rejected empty label leaves stack unchanged + plain message); full suite 339 pass, src/server tsc clean. Screenshots of quiz/flash/story/end/invalid compared to the mockups — quiz, flash and story match; two deliberate deviations: (1) the Export button is **disabled** on an invalid stack per TASK-16's "Done when" (the mockup's enabled-as-fixer idea was not adopted by the spec), and (2) the end-card canvas previews the renderer's true zero-score state ("Score 0 of N") rather than the mockup's illustrative "3 of 8" stamp collection, because the editor can't know a score before play and the renderer/player must stay unchanged; the inspector explains the stamp-per-correct behaviour.

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

### TASK-16: Toolbar and undo/redo UI (`src/editor/Toolbar.tsx`) — Done
**Refs:** REQ-MKR-05, REQ-MKR-10, REQ-MKR-12, design-system §Export button

> **Done:** Built `Toolbar.tsx` matching the mockup: Add Text / Add Button / Add Picture / Link a Card tool cards, Undo / Redo icon buttons, and the Export button (the single `--color-stamp` use). Undo/Redo call `store.undo()`/`store.redo()` and are disabled when `canUndo()`/`canRedo()` are false; Export is disabled unless `store.canExport()` (and while exporting). Export calls an `onExport` prop (wired in TASK-18). The four add-element tools have no backing pure operation in scope, so they match the mockup visually and give a gentle plain-language notice when pressed (editing existing cards is fully supported). `tests/maker/toolbar.test.ts` green (4 tests: undo/redo enablement tracks history, Export disabled on invalid/enabled on valid, stamp styling + label, onExport fires); full suite 343 pass, src/server tsc clean. Toolbar verified in the editor screenshots against the mockup.

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

### TASK-17a: Extract `mountPlayer(stack, root)` into `src/player/mount.ts` — Done
**Refs:** REQ-MKR-11, design §Play mode, §Why extract `mountPlayer`

> **Done:** Moved the mount/navigation routine verbatim out of `src/player/index.ts` into `src/player/mount.ts` as `mountPlayer(stack, root): () => void` (runtime creation, `applyScaling`, `navigateTo(id, automatic)` with the auto-advance counter + 20-step fatal-error guard, `renderCard`, `playSound`), returning a teardown that stops the scaler observer and clears the root. `index.ts` is now a thin wrapper that reads `#stack-data`, validates, and calls `mountPlayer`. Pure refactor, no behaviour change. Rebuilt the IIFE (`npm run build:player`): 20.3 KB / **6.4 KB gzipped** (≤ 50 KB), the size test is green, and `scripts/check-player-fresh.sh` exits 0 against the rebuilt+committed bundle. All existing player tests still pass, and `tests/player/mount.test.ts` asserts a minimal valid stack mounts (first card rendered), teardown clears the root, and the guard stops after 20 auto-navs. Full suite 347 pass, src/server tsc clean.

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

### TASK-17: Play mode (`src/editor/PlayOverlay.tsx`) — via `mountPlayer` — Done
**Refs:** REQ-MKR-11, design §Play mode

> **Done:** Built `PlayOverlay.tsx` — a full-screen overlay that mounts the current stack through the SHARED `mountPlayer(stack, root)` from `src/player/mount.js` (the exact function the exported player entry calls), keeps the teardown handle, and tears down on exit. No editing chrome is shown while playing; exiting returns to the editor with the previous `selectedCardId` and writes nothing back to `state.stack`. `tests/maker/play-overlay.test.ts` green (4 tests: first card renders with no toolbar/inspector/card-list, exit restores the same selection and an unchanged saved stack, answering the correct tile advances to the end card showing "Score 1 of 1", and both PlayOverlay and the exported `index.ts` import the same `mountPlayer`). Full suite 351 pass, src/server tsc clean. Screenshot compared to the play mockup — the card renders identically through the shared renderer; Play mode shows a "Back to Editing" exit where the exported-player mockup shows the live score, because Play needs an exit affordance and the shared `mountPlayer` owns its runtime score internally (reading it would require a player change, which is out of scope).

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

### TASK-18: Export download (`src/editor/api.ts` export + Toolbar) — Done
**Refs:** REQ-MKR-12, design §Export flow (client)

> **Done:** `api.ts` `exportStack` POSTs `{ stack }` to `/api/export`; on `200` it reads the body as **text** (byte-exact, no transform) and the filename from `Content-Disposition` (falling back to the shared `safeFileName(title)`); on 422/400 it returns the plain-language JSON `message` and no bytes; on network failure a plain-language message. `triggerDownload` builds a `text/html` Blob + object URL + temporary `<a download>`. Wired into `EditorScreen`/`Toolbar`: Export shows an "Exporting…" state, triggers the download, then shows the `ExportDone` overlay ("Exported ✓" stamp, filename, next-steps, Open the File / Back to Editing / Export again); errors show the plain-language banner and leave `state.stack` untouched. `tests/maker/export-download.test.ts` green (7 tests: byte-exact body + filename, Content-Disposition fallback, 422 message, network failure, Blob download, EditorScreen success→confirmation+download, 422→message+no download+unchanged stack). Verified a real round-trip against the running server (`200 text/html`, `filename="Vikings-Quiz.html"`, `<!doctype html>` body). Full suite 358 pass, request-size-limits 11/11 green, src/server tsc clean. export-done screenshot matches the mockup.

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

### TASK-19: Wire persistence into the store lifecycle — Done
**Refs:** REQ-MKR-14, design §Persistence

> **Done:** Confirmed and tested the wiring: `store.apply` saves on every committed edit and `store.setStack` saves on a successful generate (both via the debounced `persistence.save`); a failed generate never calls `setStack`, so the prior save is untouched; and `app.tsx` discards an unparseable/invalid saved stack on load and shows a gentle Start-screen notice ("…we've started fresh") without throwing. `tests/maker/persistence-wiring.test.ts` green (5 tests: committed edit saves and parses back to the current stack, successful generate saves the new stack, failed generate leaves the prior save intact, corrupted save → Start screen + notice + no throw, invalid-but-parseable save discarded with notice). Full suite 363 pass, src/server tsc clean.

- Ensure every committed edit and every successful generate calls
  `persistence.save`; a failed generate does not overwrite the existing save;
  an invalid saved stack on load is discarded with a gentle Start-screen notice.

**Done when:** A test asserts: after an edit the saved value parses and equals
the current stack; a failed generate leaves the prior saved stack intact; a
corrupted saved value sends the app to the Start screen with a notice and no
thrown error.

---

## Phase 7 — Accessibility pass

### TASK-20: Accessibility (`a11y.ts`) and audit — Done
**Refs:** REQ-MKR-15, REQ-MKR-16, design §Accessibility, design-system §Accessibility

> **Done:** `a11y.ts` owns one visually-hidden `aria-live="polite"` region wired into `store.apply` (every success/failure/undo announces a plain-language message) via the `announce` hook `app.tsx` supplies. The shared focus-ring rule (3 px solid `--color-ink`, offset 2 px) is applied to every interactive element through `:focus-visible` in `styles.css`; no positive `tabindex` anywhere and the canvas is keyboard-focusable (`tabIndex={0}`). Keyboard element-move added to the Canvas: arrow nudges 1 px / Shift+arrow 10 px, each calling `store.apply(moveElement(...), { coalesceKey: "move:"+elementId })` so a rapid burst coalesces into a single undo step (clamped on-canvas). Bumped the one sub-18 px badge to 18 px so the whole editor chrome respects the floor. `tests/maker/a11y.test.ts` green (12 tests: announcer is a polite sr-only region, edits announce, arrow nudges move + clamp, a 5-nudge burst undoes in one step, no `font-size` < 18 px and no interactive target < 44 px in editor CSS, the focus-ring rule, and an audience.md string-lint over the editor + shared messages proving no "stack" wording, Irish/UK spelling, and no raw validator codes). Full suite 375 pass, src/server tsc clean, player staleness + 6.4 KB gzip budget green.

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

## Phase 8 — Canvas fidelity pass (built screens vs mockups)

### TASK-22: Editor canvas meta line + binder rings; re-shoot at both resolutions — Done
**Refs:** REQ-MKR-02, design-system §Card anatomy, §Card scaling & layout

> **Done:** Fixed two editor-canvas differences from the mockups, both as editor-only chrome layered over the reused `renderCard` (no change to `renderer.ts`):
> 1. **Meta line** — a short "Card N of M" text element was rendering at 44px as part of the big question heading. `Canvas.tsx` now retags a short meta text element (`h ≤ 40` and not the tallest text on the card) from `.sy-question` to `.sy-meta` (20px), matching the mockup's small line above the question.
> 2. **Binder rings** — the standing metal ring loops were missing/clipped (the player renderer draws only flat punched holes, and its injected `.sy-card { overflow: hidden }` clipped anything above the card). `Canvas.tsx` now appends the two standing `.sy-ring` loops to the rendered `.sy-card`, and editor-scoped CSS (`.canvas-area .sy-card { overflow: visible }` + hiding `.sy-ring-holes` under the loops) keeps them from being clipped or doubled.
>
> Re-shot `docs/design/maker/built/` at **1366×768** and **1920×1080** (`scripts/shoot.sh` now captures both; the unsuffixed file stays the 1366 shot, plus `_1366x768` and `_1920x1080` variants) and compared each by eye with its mockup. The editor quiz/flash/story/end/invalid screens and the two start screens and export-done now match. `npm test` (393) and `npx tsc --noEmit` both clean.

**Remaining intentional deviations (built vs mockup):**

- **Play mode** (`play.png`) renders through the shared `mountPlayer` — the exact code the exported file runs — so it shows the player's real output, which differs from the hand-drawn `play.html` mockup in two ways, both out of scope here because changing them means changing the shared player/renderer and the exported bundle:
  1. the meta line "Card 1 of 10" shows as a 44px heading (the player classes every quiz/flash text element as `.sy-question`); and
  2. the top-of-card rings are the renderer's flat punched holes, not standing loops.
  These only appear because the screenshot harness feeds the demo stack (which carries a "Card N of M" text element) into the real player; generated/exported stacks have no such meta element, so the exported file is unaffected. The editor-canvas fix above is deliberately editor-only and does not touch `renderer.ts`.
- **Play mode exit** shows a "Back to Editing" control where the exported-player mockup shows the live score — carried over from TASK-17 (Play needs an exit affordance; the shared `mountPlayer` owns its runtime score internally).
- **End card** (`editor-end.png`) previews the renderer's true zero-score state ("Score 0 of N") rather than the mockup's illustrative "3 of 8" stamp collection — carried over from TASK-15 (the editor can't know a score before play, and the renderer must stay unchanged).
- **Invalid state** (`editor-invalid.png`) shows the Export button **disabled** rather than the mockup's enabled-as-fixer idea — carried over from TASK-16's "Done when".
- **Generating screen** (`start-generating.png`) reads "Working…" rather than a per-card "N of 10" counter — carried over from TASK-12 (the generate route returns a complete stack with no streaming progress API).

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

---

## Phase 8 — Built-app review fixes (2026-11-05)

An outside judge ran the built app and scored it 5.0 against the 7.8 mockup set
(`docs/design/review/MAKER_MOCKUPS_JUDGE.md`, "Built app verdict"). The class saw
the Round 1 player, not the Round 3 mockups. These tasks close that gap in the
order the verdict gives.

### TASK-R1: Quiz answers advance to the next card — Done
**Refs:** REQ-MKR-18, stack-format.md invariant 2, verdict P0 #1

> **Done:** Added `src/shared/linkForward.ts` (`linkQuizAnswersForward`): a pure
> rewrite that points every quiz answer's `goto` at the NEXT card in deck order
> (the last quiz before the end targets the end card), leaving non-answer buttons
> — story branches, "Start", "Next Card", "Play again" — untouched. Wired it into
> every place a stack is built: `src/editor/demoStack.ts` (now a fully playable
> deck: quizzes link forward, flash cards carry a "Next Card" button, the story
> branch rejoins), the LLM path in `server/stackGenerator.ts` (normalises the
> validated stack), and the streamed path's assembled `done` stack in
> `server/stream-generate.ts`. Both prompts (`server/promptBuilder.ts`) gained a
> "Card flow" rule so the model emits forward links in the first place. Tests:
> `tests/link-forward.test.ts` (unit + a fast-check property: a quiz answer never
> targets the end card unless it is the last question) and `tests/play-through.ts`
> (via the shared `mountPlayer`: answering walks every card in order and the end
> card shows the real score — `Score 5 of 5`, and `Score 1 of 3` with wrong
> answers). Full suite 450 pass, tsc clean.

**Done when:** a played stack visits every card in order and the end card shows
the real score; a property test proves no quiz answer targets the end card unless
it is the last question. ✓

### TASK-R2: Player fonts — real families + fonts inlined in the export — Done
**Refs:** REQ-MKR-12, design-system.md "The exported HTML must carry the font notice", verdict P0 #2

> **Done:** (a) `src/player/renderer.ts` now sets body / meta / tile / field text
> to `'Stackyard Reading'` (the family the app actually loads), not the unloaded
> `'Atkinson Hyperlegible'`, so the editor canvas and the player render body text
> in the real face. (b) `server/exporter.ts` reads the three Latin-subset woff2
> files (`src/assets/fonts/{bricolage,reading-400,reading-700}.woff2`) and inlines
> them as base64 `@font-face` data URIs, each with an OFL notice comment
> (copyright line + "SIL Open Font License 1.1" + source) above it; the reading
> font uses only the copyright line, never the reserved-name line, so no reserved
> font name reaches the HTML. `server/html-template.ts` gained a `fontFaces`
> option, injected into the page `<style>`. No external URL is loaded (the fonts
> and the image are data URIs), so the file stays offline. Tests
> (`tests/exporter.test.ts`): the exported HTML declares three `@font-face` as
> `data:font/woff2;base64` URIs, carries the OFL notice, contains no "Atkinson"/
> "Hyperlegible", and loads no external resource (rewrote the TASK-14 URL check to
> forbid fetchable URLs while allowing a source URL inside a CSS comment). The
> 50 KB player-bundle budget is unchanged and its test now states explicitly that
> the fonts are part of the export, not the player bundle. Full suite 454 pass,
> tsc clean.

**Done when:** the exported HTML declares `@font-face` for all three fonts as
woff2 data URIs, no "Atkinson" name appears, and the export loads nothing over
the network. ✓

### TASK-R3: Try It flips the edited card in place and plays it — Done
**Refs:** REQ-MKR-11, design-system.md Motion, editor-try.html, verdict P0 #3

> **Done:** Try It is now an in-editor mode, not a full-screen swap. The old
> `src/editor/PlayOverlay.tsx` is gone; `src/editor/TryItCanvas.tsx` renders the
> SHARED `mountPlayer` inside the editor canvas area (top bar, card list,
> inspector "Trying your card" and toolbar all stay), starting at the card being
> edited (`store.selectedCardId`), with a "Back to Editing" paper pill that flips
> back. `app.tsx` renders `EditorScreen` for both `editor` and `play`; the Try It
> button shows pressed "Trying It". `mountPlayer` gained options: `startCardId`
> (play begins at the selected card), `flip` (the design-system
> `card-exit → card-enter` rotateX, 240 ms, top-centre origin, on every
> user-initiated card change, skipped under `prefers-reduced-motion`), and a
> `scaler` seam so Try It fits the card into the editor area instead of taking
> over `document.body` (the exported player still uses the viewport scaler). Auto-
> advance (card-level goto) stays instant so the 20-step loop guard is unchanged.
> Tests: rewrote `tests/maker/play-overlay.test.ts` (in-editor play, starts at the
> selected card not card 1, Back to Editing restores the editor with an unchanged
> stack, answering reaches the end score, shares `mountPlayer`); added flip /
> startCardId / reduced-motion cases to `tests/player/mount.test.ts`. Full suite
> 459 pass, tsc clean.

**Done when:** Try It starts on the card being edited, flips that card in place
and plays it, "Back to Editing" flips back, the player flips on every card
change, and `prefers-reduced-motion` is respected. ✓

### TASK-R4: Offline fallback is real ready-made decks per example — Done
**Refs:** REQ-MKR-01, REQ-MKR-18, verdict P0 #4

> **Done:** The offline fallback no longer returns the three-card "Correct
> Answer"/"Wrong Answer" stub. `src/shared/readyMadeStacks.ts` holds three
> complete, 4th-class decks — Vikings in Ireland (quiz + flash + a story branch),
> a times-tables game (3×4 … 12×12), and everyday Irish-words flashcards
> (Dia duit, Slán, Go raibh maith agat … + a check quiz) — each valid and with
> quiz answers linked forward. `pickReadyMade(prompt)` matches the Start-screen
> example sentences by keyword and returns that deck (`matched: true`); any other
> sentence gets the closest deck with `matched: false`. `server/fallback.ts` now
> delegates to it (`build` / `buildReadyMade`), and `server/stackGenerator.ts`
> sets `isReadyMadeExample` when the fallback deck was NOT a match. That flag
> flows through the stream (`start`/`done`), the api client, and the store into
> an honest editor banner: "We couldn't reach the internet, so this is a
> ready-made example. Edit it, or try your own sentence again." Tests: rewrote
> `tests/fallback.test.ts` (each example matches its deck; an unrelated sentence
> gets the closest deck flagged not-matched; every deck is valid, carries no
> placeholder labels, and links answers forward; a 300-run property that any
> prompt yields a valid deck). Full suite 457 pass, tsc clean.
>
> Note: the live Render deploy still needs the LLM key set and warm so the real
> deal-in plays for matched sentences; the fallback is the no-key safety net.

**Done when:** each example sentence yields its matching ready-made deck; any
other sentence yields the closest ready-made deck with an honest note; no deck
contains placeholder content. ✓

### TASK-R5: Round 3 player look + real drag + Add Button/Text fixes — Done
**Refs:** REQ-MKR-08, design-system.md Rubber stamp / end card / desk, verdict P0 #5, P1

> **Done, player visuals (`src/player/renderer.ts`, `scaler.ts`):**
> - CORRECT ✓ stamp is now an ink stamp straddling the tile's TOP edge on the
>   label side (`top:-24px; left:64px; rotate(-8deg); 30px; background:transparent;
>   mix-blend-mode:multiply`), over the paper (4.67:1), never over the answer word.
> - Wrong answer: after the shake, a boxed ✗ lands at 100% strength (44px, same
>   top-edge placement) instead of the old faint 40% inline mark.
> - End card: the 14px pips are gone; it's a 64px slot grid — one slot per
>   question, earned slots a red ✓ at varied rotations, the rest empty dashed ink
>   outlines (score = stamps).
> - Player desk is the warm `#C9A47C` with the CSS grain (was flat `#D4C9B0`).
>
> **Done, editor (`Canvas.tsx`, `operations.ts`, renderer):**
> - Real pointer drag for "Drag to move": pointerdown selects + starts a drag,
>   pointermove moves through the shared `moveElement` (canvas-clamped), the whole
>   drag coalescing into ONE undo step via `move:<id>`.
> - Add Button on a quiz no longer restyles the four tiles: the renderer now
>   treats a quiz button as an answer tile only when it HAS actions, so a toolbar
>   button (empty actions) renders as a generic button and the tiles stay tiles.
> - Add Text / Add Button land in the first free rule band below the lowest
>   element (`freeY`), never on top of the question.
>
> Tests: `renderer.test.ts` stamp rule updated to the top-edge ink placement;
> `timing-endcard.test.ts` updated to the slot grid (earned/empty counts);
> `canvas.test.ts` gains: a plain button keeps the tiles as tiles, Add Text lands
> below the lowest element, and a pointer drag moves an element in one undo step.
> Full suite 460 pass, tsc clean. Re-shot `built/play.png`, `editor-end.png`,
> `editor-quiz.png` and the exported player (`built/exported-player_1920x1080.png`
> via `scripts/export-demo.ts`): warm desk, real fonts, standing rings, the
> stamp-collection end card.

**Done when:** the exported player shows the Round 3 look (ink stamp, boxed ✗,
end-card stamp collection, warm desk); dragging moves an element; Add Button on a
quiz keeps the tiles; Add Text lands in free space. ✓

### TASK-R6: Remaining built-app polish — Done
**Refs:** verdict P1 list + "Remaining fixes" #7

> **Done:**
> - **No score while editing**: `.canvas-area:not(.tryit-area) .sy-score-chrome`
>   is hidden, so the editing canvas shows no "Score 0"; Try It (real play) keeps
>   it. (styles.css)
> - **Card count agrees**: the derived "Card N of M" now counts EVERY card (the
>   card list already counts them all), in both `mount.ts` and `Canvas.tsx`, so
>   the card and the list read the same ("Card 3 of 10", 10 rows). The end card
>   still shows no meta line.
> - **Flash Front/Back no longer clipped**: the fit reserves the control height
>   above the card (`fitScale(area, reservedTop)`), so the Front/Back switch sits
>   fully below the top bar at 1366×768.
> - **Long answer labels** shrink with ellipsis (`.sy-tile-label`), and the
>   editor "✓ Right answer" navy tag sits in the tile's top-right corner inside,
>   never overlapping the label or poking past the edge.
> - **Story / nav buttons** render as chunky 32px bold paper tabs with a pressed
>   bottom edge (`.sy-button`), matching the mockup.
> - **export-done over the editor**: the harness now shows the overlay on the
>   editor desk (the stack visible under the 45% scrim), matching the real flow;
>   the editor rings sit under the fixed scrim.
> - **start-empty**: the Vikings sentence is pre-filled (one click → the demo),
>   so Build Cards starts enabled.
> - **start-generating**: the counter shows the count DEALT ("Card 4 of 10",
>   matching the top card — the off-by-one is gone) and the honest
>   "About 20 seconds." line is back.
>
> Deliberate deviation kept: on a (harness-forced) invalid stack the Export
> button stays **disabled**. The real editor can never hold an invalid stack —
> every mutation goes through `store.apply`, which validates before committing
> (REQ-MKR-09 "never a dead export") — so the disabled state only appears in the
> forced `editor-invalid` harness screenshot, where it honestly signals "not
> exportable yet". Making it enabled-but-jump would weaken the guarantee for no
> real-flow benefit.
>
> Full suite 460 pass, tsc clean. Re-shot every `built/` state and the exported
> player; compared by eye against the mockups — shell, fonts, desk, rings,
> stamp-collection end card, Try It flip, forward-linked quizzes, example tabs,
> pre-fill, and the export overlay all match.

**Done when:** the editor shows no score, card counts agree, the flash switch is
not clipped, long labels fit, export-done sits over the editor, start-empty is
pre-filled and start-generating's counter matches the card. ✓

---

## Phase 9 — Second built-app review fixes (2026-11-05)

The judge ran the app again and scored it 6.5 (up from 5.0) against the ~8 bar
(`docs/design/review/MAKER_MOCKUPS_JUDGE.md`, "Built app verdict, round 2").
Quiz play and the export were at mockup level; flash cards and the story branch
held the app back, plus a polish list. These tasks close that gap in the order
the verdict gives.

### TASK-R7: Flash cards flip (front only → tap → back in body type) — Done
**Refs:** REQ-MKR-11, design-system.md Motion, play-flash-back.html, verdict round 2 P0 #1

> **Done:** `src/player/renderer.ts` now renders a playable flash card (two text
> elements and/or a Next Card button) through a dedicated `renderFlashCard`: the
> FRONT shows the term only as `.sy-flash-term` (44px, centred) with a "Tap the
> card to see the answer" hint and no Next Card; a tap, or Enter/Space on the
> focusable card, flips to the BACK — the term small (`.sy-flash-term-small`,
> 32px) plus the explanation in body type (`.sy-flash-back`, 26px / 40px
> line-height, left-aligned) and "Next Card" bottom-right clear of the text —
> replaying the design-system rotateX card flip (skipped under
> prefers-reduced-motion); a tap flips back. A Next Card click advances and does
> not also flip. The editor's single-side flash preview (one text element, no
> button) still falls through to the regular element path so click-selection
> keeps working, and the editor back preview is retagged to body type. New
> `tests/flash-play.test.ts`: front shows term only, tap flips to the back in
> body type, tap flips back, Enter flips, Next Card advances without flipping,
> and the whole Irish-words example plays end to end to `Score 1 of 1`. Full
> suite 465, `tsc` clean.

**Done when:** the player and the export show the flash front only; a tap or
Enter flips to the back (explanation, body size); a tap flips back; Next Card
never overlaps text; the Irish example plays end to end; tests include a played
flash deck. ✓

### TASK-R8: Story branches — each choice its own card; branch warning — Done
**Refs:** REQ-MKR-07, stack-format.md invariant 2, verdict round 2 P0 #2

> **Done:** The ready-made Vikings deck (`src/shared/readyMadeStacks.ts`) and the
> editor demo deck (`src/editor/demoStack.ts`) now send the story's two choices
> to two distinct consequence cards (the raid; the longphort), each a short
> `story` card with a "Continue" button that rejoins the deck at the same later
> card — a real split-then-rejoin branch, not two buttons at one target. Both
> generator prompts (`server/promptBuilder.ts` `build` and `buildStream`) gained
> a "Story cards" rule: give every choice its own `goto`, never point two choices
> at one card, make each a consequence card, rejoin after. A new non-blocking
> `warnStack(stack)` in `src/shared/validator.ts` returns a `story-single-target`
> warning for any story card whose two-plus choices all share a target (a warning,
> not an invariant — the teacher may mean it); the inspector shows a gentle note
> when a selected story card trips it. Tests: `tests/story-branch.test.ts` (both
> built decks branch and rejoin, trip no warning; `warnStack` flags a shared
> target and clears when the choices differ or there is one button) and new
> prompt-builder assertions. Full suite grew; `tsc` clean.

**Done when:** each choice goes to its own card; the Vikings deck is fixed; the
generator prompt and the fallback produce real branches; a validator warning (or
test) flags two choices on one story card unless the teacher set it. ✓

### TASK-R9: Offline deal pacing + honest building wording — Done
**Refs:** REQ-MKR-01, verdict round 2 P1 #3

> **Done:** The offline fallback pace in `server/stream-generate.ts` is raised
> 140 → 400 ms a card, so a ten-card deck deals over about four seconds and each
> card visibly lands instead of flashing past as translucent overprints (the pace
> is still fallback-only; the live path uses the model's real output rate). The
> building screen's line is now honest per path: the `start` message's
> `isFallback` / `isReadyMadeExample` flow into the Start screen, and
> `GeneratingScreen` shows "Each card appears as it's ready." offline and
> "…About 20 seconds." only for the live model. A `generate-flow` test renders the
> generating screen on both paths and asserts the time estimate appears only
> online. `tsc` clean.

**Done when:** the fallback paces so the cards visibly land (~4 s for 10) and the
building wording is honest offline (no "About 20 seconds" for a ready-made deck).
✓

### TASK-R10: Card list flash rows show the term — Done
**Refs:** REQ-MKR-02, verdict round 2 P1 #4

> **Done:** `CardList.tsx`'s `cardLabel` now uses a flash card's FIRST text (the
> front term) rather than its longest text (the back), so a flash row reads
> "Dia duit" / "Longphort", not the English meaning. A `card-list` test builds a
> flash card whose back is longer than the front and asserts the row shows the
> front. `tsc` clean.

**Done when:** flash cards in the card list show the word (front), not the
answer. ✓

### TASK-R11: Toolbar disabled during Try It; Back to Editing flips back — Done
**Refs:** REQ-MKR-11, verdict round 2 P1 #5 / P2 #6

> **Done:** `Toolbar.tsx` gained a `disabled` prop; `EditorScreen` passes it while
> trying, dimming the whole toolbar (`.toolbar-disabled`) and setting `disabled`
> (plus `aria-disabled`) on every tool / Undo / Redo / Export, so an edit tool can
> no longer change the card being played and the controls leave the keyboard tab
> order. `TryItCanvas`'s "Back to Editing" now plays the card-exit rotateX on the
> live card (respecting reduced motion) before switching to the editor, so the
> card flips back instead of snapping. A `play-overlay` test asserts the toolbar
> is dimmed and every control disabled while trying; the Back-to-Editing test
> waits for the flip. `tsc` clean.

**Done when:** during Try It the toolbar is disabled visually and for keyboard,
and Back to Editing flips the card back with the same animation. ✓

### TASK-R12: Remaining polish items — Done
**Refs:** verdict round 2 P2 #7, #8

> **Done:**
> - **Full card:** `freeY` returns `null` when no 32px band is left below the
>   lowest element, and `addTextElement` / `addButtonElement` reject with "This
>   card is full. Make room, or add a new card for more." instead of dropping the
>   element on top of an existing one. An `operations` test adds to a full quiz
>   card and asserts the rejection.
> - **Story branch labels** are centred under each button (`.branch-label`).
> - **End-card inspector** shows a read-only "Score 3 of 8" preview field, not a
>   stray Bricolage "Score" heading.
> - **Try It inspector** has a paper box around the first line and clear spacing;
>   starting mid-deck adds a note that the final score only counts the cards
>   played.
> - **Right-answer reveal:** after a wrong pick the renderer marks the correct
>   tile (`data-correct`) and shows a faint INK outline (`.sy-tile-reveal`, never
>   red) during the 600 ms hold, so pupils learn which answer was right. A
>   `renderer` test asserts the reveal class and its ink outline.
>
> Full suite 478 pass, `tsc` clean. Re-shot every `built/` state plus new
> `play-flash`, `play-flash-back`, `play-story` and exported-player flash/story
> shots; compared by eye against the mockups — the flash flip, the real story
> branch, the honest deal-in, the disabled Try-It toolbar, the end-card preview
> and the right-answer reveal all match.

**Done when:** the small polish items in the verdict (full-card placement,
centred branch labels, end-card preview, Try It inspector spacing + score scope,
right-answer reveal) are addressed. ✓

### TASK-R13: Built-app verdict round 3 — sticky notice, flash back, small items — Done
**Refs:** `docs/design/review/MAKER_MOCKUPS_JUDGE.md` "Built app verdict, round 3" P1 #1, P1 #2, P2 #3, #4, #5

> **Done (the three items the 7.8 verdict put at the bar):**
>
> 1. **The "This card is full" notice no longer sticks or traps Try It.** The
>    notice is `EditorScreen` component state; it was only cleared on the next
>    toolbar action, so it survived a card change and the Try It toggle (the
>    screen is reused for both, so it never remounted) and in Try It it pushed
>    the canvas down under the "Back to Editing" pill. Now:
>    - `CardList.select()` calls `onNotice(null)`, so moving to another card
>      clears it;
>    - the Try It toggle in `EditorScreen` calls `setNotice(null)` on enter and
>      leave, and the banner is gated `notice !== null && !trying`, so it never
>      renders in the play view;
>    - `.try-pill` gets `position: relative; z-index: 50` so it always stacks
>      above any banner, and the pill works.
>    `tests/maker/sticky-notice.test.ts` drives the real `App`: a full card
>    raises the notice, a card change clears it, entering Try It clears it and
>    the pill returns to the editor, and the shipped `.try-pill` rule carries the
>    z-index.
>
> 2. **One fixed flash-BACK layout regardless of the deck's element positions.**
>    `renderFlashCard` already derives the back from fixed `.sy-flash-*` CSS
>    classes (it never reads authored x/y), but the Irish deck showed "Next Card"
>    sitting over "Tap the card to flip back". The hint is now capped to the
>    left column (`width: 344px`, ends at x=392, left-aligned) and the Next Card
>    starts at x=408, so they can never overlap; the back stays term top-left,
>    body left-aligned, hint bottom-left, Next Card bottom-right. A new
>    `tests/play-again-flash-back.test.ts` renders a deliberately COLLIDING deck
>    (term bottom-right, back centred, Next Card top-left) and the real Irish
>    deck and asserts the fixed classes, no leaked inline positions, and the
>    hint/Next-Card rects not intersecting.
>
> 3. **The small items:**
>    - **Sentence ↔ deck agree.** The pre-filled example said "A 10-card quiz"
>      but the Vikings deck is 12 cards (6 quiz, 2 flash, 3 story, 1 end). The
>      sentence now reads "A lesson about the Vikings in Ireland with quiz
>      questions and a story choice, the right answer plays a cheer" (both the
>      live and `__demoError` copies).
>    - **End-card preview total.** The inspector's score preview was a hard-coded
>      "Score 3 of 8". It now computes the deck's real quiz-card count and shows
>      "Score __ of {N}" ("Score __ of 6" for Vikings), the same denominator the
>      player uses.
>    - **Play Again in the exported file.** `renderEndCard` now renders a navy
>      "Play Again" paper tab (never stamp red) under the stamp grid; it calls a
>      new `resetRuntime(state)` (score back to 0, auto-nav guard reset) then
>      `navigate(firstCardId, false)`, so a class gets a clean second go with the
>      flip. Tested in `play-again-flash-back.test.ts`: the button renders,
>      zeroes the score and navigates to card 1.
>
> Two new jsdom test files wired into `vitest.config.ts`'s per-file glob list.
> Full suite **489 pass**, `tsc` clean, player bundle 9.46 KB gzipped (of 50 KB).
> Re-shot the Irish answer side (new `exported-player-irish-back`), Try It
> (`play-flash-back`, `play`), the end card (`exported-player-end`,
> `editor-end`) and the exported player (`exported-player`); the Irish back is
> left-aligned with the hint and Next Card clear of each other, and the end card
> shows "Score 0 of 6" with the Play Again tab.

**Done when:** the card-full notice clears on the next action / card change /
mode switch and never covers Back to Editing; the flash back is one fixed layout
with no hint/Next-Card overlap on the Irish and Vikings decks; the sentence and
deck card counts agree; the end-card preview total matches the deck; and the
exported end card has a working Play Again that restarts from card 1 with the
score reset. `npm test` (489) and `tsc` green. ✓

---

## Phase 8b — Public deployment (one web service)

### TASK-21: Deployable as ONE public web service (Render free web, Node 24)
**Refs:** tech.md (Node 24; "All LLM calls … server-side only"; "The API key never reaches the browser"); product.md ("works the first time"); the live-Maker ask so judges can open the running app.

**Goal:** the same Node server that answers `/api/*` also serves the built Maker
SPA, so one Render free web service hosts the whole app. The public instance
holds a PAID model key, so `/api/generate` must not be an open proxy anyone can
drain: a per-client rate limit and a global daily budget bound the worst-case
spend, and over either limit the app degrades to the existing offline
ready-made decks rather than failing.

Sub-items and acceptance criteria:

**a) Static Maker from the build directory (production).**
- In production (`NODE_ENV=production` or `SERVE_STATIC=1`) the server serves the
  built Maker from `dist/maker` (the real `build.outDir` in `vite.config.ts`,
  kept separate from the player build in `dist/player`).
- Only `GET`/`HEAD` serve static files; other methods on a non-`/api/` path → 405.
- Path resolution is safe: percent-decode, normalise, and reject anything that
  resolves outside the build root — including encoded `..` (`%2e%2e`), backslashes,
  mixed `..%2f`, and a NUL byte. A rejected path never reads a file outside root.
- Correct `Content-Type` for `.html .js .mjs .css .woff2 .svg .png .json .ico .txt`.
- `/` serves `index.html`; an extension-less path that is NOT under `/api/` falls
  back to `index.html` (SPA routing). A path with a file extension that is missing
  → 404 (no fallback), so a missing asset is not masked by the SPA shell.
- Hashed assets under `/assets/` get `Cache-Control: public, max-age=31536000, immutable`;
  `index.html` gets `Cache-Control: no-cache`.
- Every response (static, API, 404) carries `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, and a CSP that includes
  `frame-ancestors 'none'` and under which the built Maker actually loads and runs
  (verified by loading `/` and an asset against the real build).
- **Done when:** the real built Maker loads from the server at `/`, its hashed
  assets load with the immutable cache header, and the traversal strings above
  never return a file from outside `dist/maker`.

**b) Health route.**
- `GET /api/health` → `200` `{"ok":true}` (JSON), makes no model call, and is cheap
  enough for a keep-warm pinger.
- **Done when:** a request to `/api/health` returns 200 `{"ok":true}` and the model
  gateway is never invoked.

**c) Per-client rate limit on `POST /api/generate` (in memory).**
- Client identity = the first address in `X-Forwarded-For` ONLY when `TRUST_PROXY=1`
  (Render sets the header); otherwise the socket remote address. `X-Forwarded-For`
  is ignored entirely unless `TRUST_PROXY=1`.
- Default 6 generations per rolling 10 minutes per client, tunable via
  `GENERATE_RATE_PER_10MIN`. The 7th request within the window → `429` with a
  `Retry-After` header (seconds) and the SAME friendly error shape the client already
  handles: JSON `{ ok:false, message }` for the default path, and a single NDJSON
  `{"type":"error","message":…}` line (HTTP 200 body is fine for the stream, but the
  limit is enforced BEFORE any model work either way; for the limit we use 429 on the
  JSON path and a 429 + error line is not required — see note). The message is the
  human line "Lots of people are building right now — try again in a few minutes, or
  start from a ready-made deck."
- The limiter's memory is bounded: stale entries (window fully elapsed) are evicted,
  and a hard cap on tracked clients prevents a flood of distinct addresses from
  growing the map without limit.
- **Done when:** the 7th request in the window gets 429 + `Retry-After`; a different
  client in the same window is unaffected; after the window elapses the client is
  allowed again; `X-Forwarded-For` only changes identity when `TRUST_PROXY=1`; and a
  flood of distinct client ids does not grow the map beyond the cap.

**d) Global daily model-call budget.**
- Count REAL model calls per UTC day; cap via `GENERATE_DAILY_CAP` (default 300).
- Once the cap is reached, `/api/generate` answers from the existing offline
  fallback decks (same honest ready-made labelling the fallback already carries) and
  NEVER calls the model; the cap breach is logged once per day.
- The counter resets at UTC midnight.
- **Done when:** after the cap is hit the model gateway is not called (verified with a
  spy) and the response is a ready-made fallback deck; the counter resets at UTC
  midnight (fake timers).

**e) Production entry + Render blueprint + README.**
- `npm start` runs the production server (static Maker + API) via `tsx`, with
  `NODE_ENV=production` so static serving is on.
- `render.yaml`: one `web` service, env `node`, `buildCommand`
  `npm ci && npm run build:player && npm run build:maker`, `startCommand` `npm start`,
  `healthCheckPath /api/health`, and envVars `STACKYARD_LLM_API_KEY` (`sync: false`),
  `STACKYARD_LLM_BASE_URL`, `STACKYARD_LLM_MODEL`, `TRUST_PROXY=1`, `NODE_VERSION 24`.
- README gains a short "Run it / Deploy it" section (no secrets).
- **Done when:** `npm start` serves the built app and API locally; `render.yaml`
  validates as the single-service blueprint above; README documents running and
  deploying without leaking secrets.

**f) Tests (vitest, real server on an ephemeral port).**
- Traversal: `/../package.json`, `/%2e%2e/package.json`, `/assets/..%2f..%2fpackage.json`,
  backslash variants, and a NUL byte never return a file outside `dist/maker`.
- SPA fallback for an extension-less non-API path; a missing extensioned asset → 404.
- Unknown `/api/*` stays JSON 404 (never the SPA shell).
- `/api/health` → 200 `{"ok":true}`.
- Limiter: 7th request in the window → 429 + `Retry-After`; a different client
  unaffected; window expiry allows again (fake timers); `X-Forwarded-For` ignored
  unless `TRUST_PROXY=1`; eviction keeps the map bounded.
- Daily cap: after the cap the model gateway is not called (spy) and the response is a
  fallback deck; cap resets at UTC midnight (fake timers).
- **Done when:** all of the above pass and every pre-existing test stays green;
  `npm test` and `npx tsc --noEmit` both exit 0.

> **Note on the 429 + NDJSON shape:** the rate limit is checked before the body is
> even read, so both the default and NDJSON requests get a real `429` with
> `Retry-After` and a JSON `{ ok:false, message }` body. The Maker's streaming
> client already handles a non-OK HTTP status by reading the JSON `message`
> (`api.ts` `generateStackStream`: "A non-OK HTTP status means the request was
> rejected before streaming"), so no client change is needed for the shape — only
> the human wording is surfaced.

### TASK-21g: the per-visitor rate limit is bypassable on Render (spoofable client IP)
**Refs:** TASK-21c; verified live against `https://stackyard-sdqt.onrender.com` — 6 requests with `X-Forwarded-For: 203.0.113.9` → 200, 7th → 429, then the same request with `X-Forwarded-For: 203.0.113.77` → 200.

**Problem:** the limiter keyed on the FIRST (leftmost) `X-Forwarded-For` entry.
Render appends the real client IP to the END of `X-Forwarded-For`; the leftmost
entry is whatever the visitor sent, so a client can rotate the leftmost value
per request and get a fresh bucket every time, bypassing the per-visitor limit.

**Fix:**

1. **Trust the proxy-appended entry, not the client-sent one.**
   - New env `CLIENT_IP_HEADER` (e.g. `cf-connecting-ip`, `true-client-ip`,
     `x-real-ip`): a single-value header the trusted proxy sets to the real
     client IP.
   - When `TRUST_PROXY=1` **and** `CLIENT_IP_HEADER` is set and present on the
     request, the client address is that header's value (single value, trimmed;
     if multi-valued, the first value).
   - When `TRUST_PROXY=1` and that header is absent (or `CLIENT_IP_HEADER`
     unset), fall back to the **RIGHTMOST** `X-Forwarded-For` entry (the one the
     nearest trusted proxy appended) — never the leftmost client-controlled one.
   - When `TRUST_PROXY` is unset, keep using the socket remote address (ignore
     all forwarding headers).
   - **Done when:** two requests whose leftmost `X-Forwarded-For` differs but
     whose rightmost entry is identical share ONE rate-limit bucket;
     `CLIENT_IP_HEADER` changes the bucket only when `TRUST_PROXY=1`.

2. **Temporary diagnostics (off by default).**
   - When env `DEBUG_CLIENT_ADDR=1`, log for at most the first **5**
     `POST /api/generate` requests after start, one line each, containing only:
     the `x-forwarded-for`, `true-client-ip`, `cf-connecting-ip`, `x-real-ip`
     header values and the socket address, then the address the limiter chose.
   - No request body and no other headers are logged. Off by default (no log
     lines when the flag is unset).
   - **Done when:** with the flag set, at most 5 diagnostic lines are logged
     (one per generate request, capped at 5); with the flag unset, none are.

3. **Tests:**
   - Leftmost-XFF spoofing no longer changes the bucket (different leftmost,
     same rightmost → shared bucket → still rate-limited).
   - `CLIENT_IP_HEADER` honoured only with `TRUST_PROXY=1` (ignored when unset).
   - Diagnostics log at most 5 lines and only with the flag.

4. **`render.yaml`:** add `DEBUG_CLIENT_ADDR` with value `"1"` for now (removed
   after we read the logs).

> **Note:** the rightmost-XFF default is correct for exactly one trusted proxy
> hop (Render). `CLIENT_IP_HEADER` is the robust fix because a single-value
> provider header (e.g. Cloudflare's `cf-connecting-ip`) can't be spoofed past
> the proxy. We keep the rightmost-XFF fallback so the limiter still keys on a
> non-client-controlled value even if the header isn't set.

---

## Phase 9b — 5 Nov judge-panel fixes (live app)

### TASK-22: fixes from the 5 Nov AI review panel (J1 official, J2 teacher, J3 wow/design, J4 engineering, J5 hound)
**Refs:** `judge_2026-11-05/J1_official.md`, `J2_teacher.md`, `J3_wow_design.md`, `J4_engineering.md`, `J5_hound.md`. Related specs: exporter (a, k), stack-generator (d), maker (the rest).

Each sub-item has acceptance criteria ("Done when"). Every pre-existing test stays green; `npm test` and `npx tsc --noEmit` exit 0.

**a) [J4 H1] "Open the File" is blank on the live site.** The exported file opened as a `blob:` inherits the app CSP (`script-src 'self'`, `font-src 'self'`), which blocks the player's inline `<script>` and `data:` fonts.
- Fix so the exported file plays when opened from the app AND when downloaded. Chosen approach: open the exported file in-app via the shared `mountPlayer` (same renderer as Try It) in a new document/overlay that does NOT inherit the restrictive CSP — no blob script execution needed — and revoke any created object URL.
- **Done when:** after Export, "Open the File" shows the playing player (not a blank page), verified in headless Chromium against the production build served by `npm start`; the downloaded file still plays from disk.

**b) [J4 M1/M3] Client disconnect must abort the upstream model call.** `req.on("close")` never fires after `readBody` consumed the body; listen on `res` close instead (`res.on("close", () => { if (!res.writableFinished) abort(); })`).
- Correct the KIRO_LOG/spec lines that overclaim the abort worked.
- **Done when:** an HTTP-level test with a mock upstream proves the upstream `callStream` is aborted when the client destroys the connection mid-stream (M3 mutant killed).

**c) [J4 M2/J1] Daily cap counts REAL paid model calls.** Record one unit per actual upstream call (first attempt AND retry), at the moment the call is made — not one unit per request before validation. A request served from a ready-made deck with no model call must NOT count against the per-visitor rate limit either. Raise the default per-visitor limit to **20** per 10 minutes (schools share one address); keep it env-tunable (`GENERATE_RATE_PER_10MIN`).
- **Done when:** a request that makes two upstream calls records 2; a forced-fallback request records 0 and does not consume a rate-limit slot; the default limit is 20 (pinned by a test); existing budget/limiter tests stay green.

**d) [J5/J1/J3] Honest fallback messages.** The Maker must say WHY a ready-made deck was served: "AI generation isn't set up on this server", "Today's AI budget is used up", "The AI didn't answer in time" (or similar), never "We couldn't reach the internet" unless the browser is actually offline (`navigator.onLine === false` or the fetch itself threw). Carry a `fallbackReason` from the server (`no-key` | `cap` | `timeout` | `error`) on the stream `start`/`done` and the non-stream JSON, and log the reason server-side on the stream path (J4: stream-generate.ts:262).
- **Done when:** each reason maps to its honest sentence in the Maker; a true network failure (fetch throws) shows the offline sentence; the server logs the reason once; types carry `fallbackReason`.

**e) [J1/J3] 429 screen offers ready-made decks.** The rate-limit (and any generation-failure) screen shows real buttons that open each ready-made deck locally (built client-side, no server call).
- **Done when:** on a 429/failure the Start screen shows three deck buttons that load the Vikings / Times tables / Irish words deck straight into the editor with no network call.

**f) [J3 P0] Correct answer is not always the first tile.** Shuffle answer-tile order per quiz card, deterministically per stack (seed from `stack.id`) so export round-trips stay lossless, keeping the correct pointer right, for generated and ready-made decks. Instruct the generator to vary the correct position.
- **Done when:** a property test shows the correct index is not constant across a deck and every quiz card still has exactly one correct answer linked forward; the roundtrip property stays green.

**g) [J1/J3] Ready-made deck content.** Believable wrong answers (no "Cars / Phones / Plastic"); fix the factual error "Who sailed to Ireland first? → Vikings"; the longphort is on a river, not "the coast". Check every ready-made card for accuracy.
- **Done when:** the Vikings deck's card 1 is factually true; no joke distractors remain; fallback tests still pass (valid, deterministic, linked forward).

**h) [J1/J3] Long answers wrap.** Answer labels wrap to two lines in the player and the exported file instead of truncating with an ellipsis.
- **Done when:** a long label ("Norsemen from Norway") renders on two lines (no `text-overflow: ellipsis` clip) in the player CSS; renderer tests stay green.

**i) [J3/J1] Editor correctness.** "+ Add Card" inserts after the current card (never after the last card), selects it, and links it into the flow so play reaches it. The answer inspector must not say "No answer is the right one yet" when another answer is marked right. Dragging must not drop one answer on top of another. Ruled lines must not run through question text, and the CORRECT stamp must not cover the answer word at 1920×1080.
- **Done when:** Add Card lands reachable + selected; the inspector copy names the current right answer when another is correct; drag rejects an overlapping drop (or nudges clear); the `.sy-card::after` rule grid and `.sy-stamp`/question geometry no longer collide (stamp bottom clears the label; question sits clear of a rule).

**j) [J1] Phone-width editor.** Under a laptop/tablet width, the editor shows "Stackyard's editor needs a laptop or tablet; the files it makes play on any device" instead of a broken layout.
- **Done when:** below a threshold width the editor renders the notice (CSS + a small responsive guard), and the player/exported file are unaffected.

**k) [J4 low] Robustness.** Malformed export bodies → 400 (not 500); missing relative image paths handled without 500; an error handler on the static file stream; do not serve `screens.html` in production; remove the stale `tests/maker/start-screen.test.ts` glob from `vitest.config.ts`; a light rate limit on `POST /api/export`.
- **Done when:** `{stack:{cards:[null]}}` → a 4xx with a plain message; a non-`data:` image src → a 4xx (not 500); the static stream has an `error` listener; `screens.html` is excluded from the production static root; the stale glob is gone; `/api/export` is behind a looser limiter.

**l) [J5] README for judges.** Live link at top; what "works offline" means (the exported file; the Maker needs the server); correct env table (`CLIENT_IP_HEADER=cf-connecting-ip` on Render, `DEBUG_CLIENT_ADDR`); replace the false "CI runs check-player-fresh.sh" with a real GitHub Actions workflow that runs `npm test` + `tsc` + the freshness check; say plainly the per-visitor limit returns a friendly 429; list npm libraries + the model provider (Anthropic, OpenAI-compatible) with licences; name prior art (Decker, H5P/Lumi) and what only Stackyard does.
- **Done when:** the README reflects reality, a `.github/workflows` CI exists, and the claims J5 flagged are corrected.

**m) [J5] KIRO_LOG honesty.** Call the reviewers "our AI review panel", not "outside judge"; note the loosened external-URL test honestly (OFL font comments contain https links; the player makes 0 requests).
- **Done when:** the KIRO_LOG wording is corrected with a dated note.

**n) [J4] Mutation gaps.** A test that fails if per-card `validateCard` is removed on the stream path; and the disconnect-abort coverage from (b).
- **Done when:** removing the stream-path per-card validation makes a test fail; the disconnect abort has a test.

**o) [J2] "Before you share" export check.** On the export screen, list cards the class can never reach and scores that can't be completed, with a one-click "link it in" fix where possible. The flash card's "Next Card" button must be selectable and re-linkable in the editor.
- **Done when:** a reachability check (from card 1 over all gotos, card-level and button) lists unreachable cards and dead-end quiz answers; a one-click fix links an unreachable card after the current one; the flash "Next Card" button is selectable in the editor and its goto editable.

**p) [J2] Plain words.** "Link a Card" → "Go to card…"; "When picked, go to…" → "If they pick this, show card…"; start with an empty sentence box (examples stay as chips); fix the card counter overlapping the question.
- **Done when:** the labels read as above; the Start textarea is empty with the examples as chips; the "Card N of M" meta no longer overlaps the question text.

**q) [J2] "Type your own questions".** When AI generation is unavailable, offer a quick local form (question + right answer + 2–3 wrong answers, repeatable) that builds a playable stack locally — no server model.
- **Done when:** a form on the Start/fallback screen turns typed questions into a valid stack (through the shared validator) and opens it in the editor with no network call.

> **Note on scope:** J3's "living file" (edit inside the exported HTML) and the Openverse picture MCP are NOT in TASK-22 — they are larger follow-ups. TASK-22 fixes the correctness, honesty, robustness and teacher-usability defects the panel found on the live build.


---

## Phase 10 — Real Kiro depth: hooks, a custom agent, an MCP server (TASK-23)

### TASK-23: fill the empty Kiro features for real work (5 Nov panel J1 + J4)
**Refs:** `judge_2026-11-05/J1_official.md` ("hooks, MCP, agents and powers … all four are zero"; `.kiro/agents/` empty and untracked), `J4_engineering.md` ("No hooks, no MCP config, `.kiro/agents/` empty"). The 2025 Resurrection winner shipped 4 hooks and 2 custom MCP servers; this closes the Kiro-depth gap with features that do actual work, each used at least once and recorded in `docs/KIRO_LOG.md`.

Schemas follow the current kiro.dev docs: hooks are JSON in `.kiro/hooks/<id>.json` (`version`, `hooks[]` with `name`/`trigger`/`matcher` path-regex/`action`); custom agents are Markdown-with-frontmatter or JSON in `.kiro/agents/`; MCP servers are registered in `.kiro/settings/mcp.json` (`command`/`args`/`env`/`disabled`/`autoApprove`).

**a) Hooks in `.kiro/hooks/` (JSON, documented schema).**
  1. **invariants-on-save** — `FileSave`, matcher `^src/(shared|player)/.*\.(ts|tsx)$` → runs the stack invariant/property tests and the player bundle-size check; reports failures in chat.
  2. **ready-made-content-check** — `FileSave`, matcher `readyMadeStacks\.ts$` → runs a content check (`scripts/check-decks`): every quiz card has exactly one correct answer, the correct position varies across each deck, no duplicate answers within a card, and no answer label longer than the two-line wrap width.
  3. **export-regression-check** — `FileSave`, matcher `^server/(securityHeaders|exporter|html-template)\.ts$` → runs a headless check (`scripts/check-export-opens`) that an exported file opens from disk and plays (renders a card, no blank page) — the regression shipped on 5 Nov (J4 H1).
  4. **pre-submit** — `Manual` trigger → `npm test` + `tsc --noEmit` + build + the README claim checker (b), in one command.
  - **Done when:** the four hook files exist and validate against the documented schema; each command runs green on a clean tree; running hook 1 (edit + save a `shared`/`player` file) and hook 2 (edit `readyMadeStacks.ts`) actually executes its check.

**b) README claim checker `scripts/check-claims`.** Asserts the README's stated numbers match reality: the test count (`npm test` total), the player gzipped size (KB, within a small tolerance), the number of stack invariants, and the property-test run count. Exits non-zero on drift. Hook 4 runs it.
  - **Done when:** the README carries a "By the numbers" block with the exact values; `scripts/check-claims` passes on the current tree and fails if a number is edited to be wrong.

**c) Custom agent `.kiro/agents/lesson-checker`.** A reviewer persona (read-only) that reads a stack JSON and flags: factual errors, ambiguous questions, joke/implausible distractors, and reading level for 8–10-year-olds. Run it on the three ready-made decks; record findings and fixes in KIRO_LOG.
  - **Done when:** the agent file exists with a clear persona and read-only tools; it has been run against the three decks and its findings (and any fixes) are in KIRO_LOG.

**d) MCP server `mcp/openverse` (local stdio, Node/TS, minimal deps).** Tools:
  - `search_images(query, license="cc0|pdm")` → Openverse public API; returns `title`, `creator`, `license`, `source` URL, `thumbnail` URL per result.
  - `fetch_image_as_data_uri(url, maxKB)` → fetch an image and return a `data:` URI, with an **allowlist** of Openverse/Wikimedia hosts, **no off-list redirects**, a **size cap** (`maxKB`), and a **timeout**.
  Register it in `.kiro/settings/mcp.json`. Use it via Kiro to pick one public-domain image per ready-made deck and embed it into the deck as a data URI, with a credit line on the card (licence + creator + source).
  - **Done when:** the server builds and its own tests pass — host allowlist enforced, off-list redirect refused, size cap enforced, timeout honoured; it is registered in `.kiro/settings/mcp.json`; each ready-made deck's first card carries one inlined public-domain image and a visible credit line; the decks still pass the validator and the export round-trip.

**e) KIRO_LOG.** One dated entry per item (a–d), honest about what each hook/agent/MCP actually caught or produced.
  - **Done when:** KIRO_LOG has the entries with concrete findings.

**Gate:** `npm test` and `npx tsc --noEmit` exit 0; the MCP server's own tests pass.

> **Note:** Kiro IDE 1.0 has no user-creatable "manual button" hook trigger; hook 4 uses the `Manual` trigger recognised by the hook schema (and is also runnable directly as `npm run pre-submit`). File-save hooks fire on agent-made saves per the Kiro docs; the commands are plain `npm`/`node` so they are equally runnable by hand and in CI.

---

## Phase 11 — Live-check follow-ups (TASK-25)

### TASK-25: the card list must not be named after an image credit; image credits must be truthful (5 Nov live check)
**Refs:** live check 5 Nov (`sy_export2.png`). On the Vikings deck's first card the editor's card list read "Image: Stackyard — CC0 (public…" — it took the image CREDIT line as the card's name; and that credit named `https://openverse.org` even though the image was drawn by us, not found on Openverse.

**a) The card title must come from the question/front/story, never a caption or image credit.**
  - One shared helper, `src/shared/cardTitle.ts` (`primaryText` / `cardTitle` / `truncateLabel`): the primary text is the TOPMOST text element (smallest `y`, tie-break `x`) — the question/front/story body — so a bottom-positioned caption or image credit is never chosen, regardless of length or array order. A flash card is still named by its front (first text element).
  - All card-naming call sites use it: `CardList`, `Toolbar` and `Inspector` pickers (which previously picked the LONGEST text, so the long credit line won), plus `ExportDone` and the living-file editor.
  - **Done when:** a card carrying a question plus a longer image-credit text element is named after the question; a test covers it.

**b) Image credits must be truthful.**
  - A `DeckImage` drawn by us reads "Illustration: Stackyard, CC0" and carries NO source URL; `creditSource` is optional and only set for an image that really came from a source (a live Openverse pick written by `scripts/pick-deck-images.ts`, which also sets `creditKind: "image"`). `creditLine` renders "Illustration: Creator, Licence" with no source, or "Image: Creator — Licence — Source" with one.
  - `scripts/check-decks.ts` (the `ready-made-content-check` hook) gains a rule: a credit line that names "Openverse" must carry a real `openverse.org` source URL.
  - **Done when:** the three ready-made images read as our own CC0 illustrations with no Openverse link; the check-decks rule fails a credit that names Openverse without a real Openverse URL; tests cover both.

**Gate:** `npm test` and `npx tsc --noEmit` exit 0.


---

## Phase 12 — Round-2 review fixes (TASK-26)

**Refs:** `judge_2026-11-05_r2/J1–J5` (live app, real generation, 5 Nov evening). The panel's headline: the core promise now works live, but real generated content hit layout and flow bugs the hand-laid decks never showed, the living file's Save a Copy wrote a dead file, and two of our gates were green for the wrong reason.

**Where each item lives:**

| Item | Spec file |
|---|---|
| a, e (living file) | `exporter/tasks.md` Phase 7 |
| b, c, d, g, j (generation) | `stack-generator/tasks.md` (Round-2 phase) |
| f, h, i, k, l, m, n, o | this file, below |

### TASK-26f: an honest wait screen  *(P1)*
  - **Bug.** "About 20 seconds" while real builds took 37–40 s, with ~25 s of a frozen "Preparing…".
  - **Fix.** Say "About 30–45 seconds". Show progress from the stream: an elapsed-seconds counter that always moves; on the stream's `start` event, "Writing “<title>” — card 1…"; then "Card N written".
  - **Acceptance.** The generating screen never says "20 seconds"; before `start` it shows a moving counter; after `start` it shows the title; after cards it shows the count. Tested.

### TASK-26h: Openverse MCP limits  *(P2, dev-time tool)*
  - **Fix.** Clamp `maxKB` to 1–512 inside `fetchImageAsDataUri` (so no caller can lift the cap), and keep the abort timer alive through the body read so a slow-drip body times out.
  - **Acceptance.** A test passes `maxKB: 1e9` and sees the 512 KB cap enforced; a test with a body that never finishes times out.

### TASK-26i: ready-made deck banner, short credit, two-line answers  *(P1)*
  - **Bugs.** Picking a ready-made deck showed a false "The lesson builder is resting right now". The picture credit printed a raw Flickr URL that ran off the card. Two-line answers overflowed their tiles.
  - **Fix.** A deliberately chosen ready-made deck gets its own honest line ("Here's a ready-made deck you can edit."), never a failure message. The on-card credit shows the creator, licence and **domain only** (`Photo: Gary Lee Todd, PDM — flickr.com`); the full URL lives in the inspector and the text element's `title`/alt. Answer labels fit their tile (fit-text, up to three lines).
  - **Acceptance.** Choosing a ready-made deck sets no failure reason and the banner is the honest line; no credit line contains `http`; the full URL is in the inspector when the credit is selected; a long answer's fitted text fits its tile.

### TASK-26k: Kiro hooks in the format Kiro actually loads  *(P1, Kiro depth)*
  - **Checked against the Kiro IDE 1.x hook docs:** hooks are standalone `.kiro/hooks/*.json` with `"version": "v1"` (the `.kiro.hook` / `when` / `then` shape is the pre-1.0 format); `timeout` is a sibling of `action`, not inside it; valid triggers are PascalCase (`PostFileSave`, `PostTaskExec`, …) — `Manual` is not one.
  - **Fix.** Move `timeout` next to `action` in all four hooks; make the file-path matchers tolerant of an absolute path; `pre-submit` becomes a `PostTaskExec` hook (it was a legacy `Manual` trigger) and stays runnable as `npm run pre-submit`.
  - **Acceptance.** A test validates every hook file against the documented schema (version, `hooks[]`, name, PascalCase trigger from the valid list, `action.type` of `command`/`agent` with its required field, `timeout` outside `action`). Each hook is then triggered once in this Kiro session and the firing recorded in `docs/KIRO_LOG.md` **only if it truly fired**; otherwise the log says it could not be confirmed.

### TASK-26l: pre-submit green, CI runs the claims checker  *(P1)*
  - **Fix.** `check:claims` gains `--fix`, which rewrites the README numbers from the checker's measured values (never by hand); CI runs `check:claims`; the README test count is updated through `--fix`. The checker also covers the build-script line in the README.
  - **Acceptance.** `npm run pre-submit` exits 0; `ci.yml` contains a `check:claims` step; a test covers the `--fix` rewrite.

### TASK-26m: README for judges and sample files  *(P1)*
  - Fix the "the app still works offline" sentence (only the exported file does); add the three `STACKYARD_LLM_*` switches to the env table; list the three Flickr public-domain photos with creators and links in the asset list; add a screenshot/GIF placeholder section; ship **three sample exported files** in `samples/`, generated by `npm run samples` from the ready-made decks and playable offline; label `docs/design/reference-stamp-pad-tiles.png` as AI-generated in the README and in a note next to the file.
  - **Acceptance.** A test checks the three samples exist, validate, make no external requests, and the README mentions each; the AI-generated label exists next to the image.

### TASK-26n: tile shapes are an accessibility feature  *(P2)*
  - Note in `design-system.md` and the README that each answer tile carries a shape (▲ ◆ ● ■) as well as a colour so colour-blind pupils can say "the triangle"; the order resembles other quiz tools and that is deliberate (a familiar pattern), not copied styling.
  - **Acceptance.** Both documents contain the note.

### TASK-26o: the teacher's editing dead ends  *(J2)*
  - **Flash Back box.** Text typed into "Back (the explanation)" when the card has no second text element was silently dropped. It now creates the back (`setFlashSide`), and the Front box does the same.
  - **Before you share** also catches a flash card with no way forward and any answer/button that goes nowhere (see 26b).
  - **"+ Add an answer"** on a quiz card (toolbar tool and inspector) creates a real wrong-by-default answer in the next free tile slot that links forward — not a dead "Add Button". Maximum four.
  - **Save a Copy name** — see 26a.6.
  - **"Question N:" prefixes** are dropped from generated text (see 26j).
  - **Acceptance.** Tests: Back text is kept on a card with no back; the share check flags both dead ends; Add an answer adds a linked answer and stops at four; a played-through deck never greys out and stops.

**Gate (TASK-26):** `npm test`, `npx tsc --noEmit` and `npm run pre-submit` exit 0; `npm run check:living-file` passes with the new click-through.


---

## Phase 13 — Round-3 review fixes (TASK-27)

**Refs:** `judge_2026-11-05_r3/J1–J5` (live app, 5 Nov night). Round 3 found no P0 in the core promise. What was left: the money frame (the CORRECT stamp strikes through a wrapped answer), a red CI, stale samples, one mistyped id withdrawing a whole deck, and a long tail of editor/start-screen layout.

**Where each item lives:**

| Item | Spec file |
|---|---|
| b, e, m, t, A, B (generation) | `stack-generator/tasks.md` (Round-3 phase) |
| x, j, f (living half), g, r | `exporter/tasks.md` Phase 8 |
| a, c, d, f, h, i, k, l, v, w, y, n, o, p, q, s, u | this file, below |

### TASK-27a: the stamp never touches the answer  *(P1, the money frame)*
  - **Bug.** `.sy-stamp` (top −34 px, ~50 px tall, rotated) reached 16–20 px into the tile; labels wrap to up to three lines and start ~10 px below the tile's top, so the CORRECT stamp struck through the first line of every wrapped right answer, and ✗ sat on the first letters of a wrong one. The text-fit gate never fired a stamp.
  - **Fix.** One quiz template (`src/shared/layout.ts`) with a real stamp gutter: question box 104–248, answer tiles 88 px tall at y 296 and 432 (48 px above each row). The stamp is smaller (~0.85 scale: 24 px type) and seated in the gutter with its bottom edge on the tile's top edge; ✗ likewise. The hand-laid ready-made decks and the editor's seed card use the same constants.
  - **Acceptance criteria.** Real Chrome (`scripts/check-text-fit.ts`): on a card with four long answers, click the right tile and a wrong tile (one in each row) and assert `stampRect ∩ labelTextRect == 0`, `stampRect ∩ questionTextRect == 0` and `stampRect ∩ otherTileRects == 0` at scale 0.9 and scale 1.4. Mutation: restore the old stamp offset and the gate fails.

### TASK-27c: the "✓ Right answer" tag does not cover the answer  *(P2)*
  - **Fix.** The editor tag hangs as a tab above the tile's top-right edge (inside the stamp gutter), never over the label.
  - **Acceptance criteria.** Tag rectangle ∩ label text rectangle = 0 for a 3-line answer, in jsdom by geometry and in real Chrome in the Maker gate.

### TASK-27d: the start screen fits and scrolls  *(P1)*
  - **Bug.** `.start-area` centred with `overflow:hidden`, so at 1366×768 the heading sat under the bar and "Type your own questions" was cut off with no way to scroll (also a phone). Two rows repeated the same three names with different behaviour.
  - **Fix.** `justify-content: safe center` plus `overflow-y: auto` (and `margin: auto` on the card). ONE row of example chips; "open a ready-made deck" becomes a single text link row that is visibly different ("Open a ready-made deck: Vikings · Times tables · Irish words"). The peek tiles are clipped inside their card at 1920.
  - **Acceptance criteria.** Real Chrome at 1366×768: h1 top ≥ the bar's bottom and "Type your own questions" fully inside the viewport with no scrolling; at 1366×657 and 390×844 the h1 is reachable and every control can be scrolled into view; the three example names appear once on the page.

### TASK-27f (Maker half): "Before you share" runs BEFORE the download
  - **Bug.** The warning appeared on the "Your file is ready" screen after the file had already downloaded.
  - **Fix.** Export runs the check first. If anything is wrong, a dialog lists it with **"Export anyway"** and **"Take me to the card"** (selects the first offending card); nothing is downloaded until the teacher chooses. A card still holding placeholder text ("Your question?" / "Right answer" / "Wrong answer"; flash "Term"/"Explanation"; story "Your text") counts as a problem (`placeholderCards` in `src/shared/reachability.ts`, shared with the living file).
  - **Acceptance criteria.** Pressing Export on a deck with a dead-end answer triggers no download; "Export anyway" downloads; "Take me to the card" selects the card; a healthy deck exports in one click; a placeholder card is flagged.

### TASK-27h: one way to add an answer; icons that do not collapse
  - **Fix.** On a quiz card the toolbar's plain "Add Button" is hidden (a plain button there is the dead end J2 hit; its "This card is full" message contradicted "+ Add an answer"); the one "Add Answer" stays. `.tool-card svg { flex-shrink: 0 }` and a fixed size so icons never shrink to 24×2 px at 1366; the toolbar wraps its label rather than the icon; "Export File" stays on one line (`white-space: nowrap`).
  - **Acceptance criteria.** Toolbar test: no "Add Button" tool on a quiz card, present on story/flash; real Chrome at 1366×768 on a quiz card: every `.tool-card svg` is ≥ 20×20 px and the Export button's height ≤ 60 px (one line).

### TASK-27i: story cards have presence  *(P2)*
  - **Fix.** `fitBody` for a story body goes up to 30 px (still fitted); the body is vertically centred in its box; a one-choice "Continue" card shrinks the body box to the text.
  - **Acceptance criteria.** A short story body renders at 30 px; a long one still fits (text-fit gate on the story card passes at 1366 and 1920).

### TASK-27k: the wait screen is personal from t = 0  *(P2)*
  - **Fix.** The teacher's own sentence is written on the top card from the first frame; the card's text is inset below the rings (≥ 48 px); the dealt stack scales with the viewport.
  - **Acceptance criteria.** Before the first card, the top card shows the sentence; its text container's top padding ≥ 48 px; the stack uses a viewport-based scale.

### TASK-27l: small copy and feedback
  - **Fix.** The end card's live-region text no longer doubles punctuation ("journey.. Score"); the running score and the end-card score/stamps are hidden until the deck has a quiz card (and, on the running score, until one has been played); a score of 0 reads "Score 0 of 3" under a neutral line, not "Well done!". A wrong pick gives the right tile a clear highlight (thick ink border and a "✓" tab) for the hold, not a thin outline.
  - **Acceptance criteria.** Tests for each: no `..` / `!.` in the announcement; story-only decks show no score chrome and no "Score 0 of 0"; score 0 uses the neutral heading; the revealed right tile carries the highlight class and a ✓ marker.

### TASK-27v: CI is green  *(P0, J1)*
  - **Bug.** On GitHub Actions `CI` is set, Vitest colours its output even in a pipe, and `check-claims`'s regex never matched `Tests  810 passed`: "[DRIFT] tests: README 810 vs actual -1". It also hid a real test failure behind the same `-1`. The 1000-run property tests also exceeded Vitest's 5 s default under load (CI red, local `pre-submit` flaky).
  - **Fix.** Run the child with `NO_COLOR=1 FORCE_COLOR=0` and strip ANSI before parsing; a failing run reports "N tests failing" and an unparseable one "could not parse the test total", never `-1` as drift. The heavy property tests get an explicit 60 s timeout, and Vitest's `testTimeout` is 30 s.
  - **Acceptance criteria.** `claims-lib` parses a coloured summary line, a "1 failed | 809 passed" line, and refuses to guess; the 1000-run tests carry explicit timeouts (asserted by reading the test sources).

### TASK-27w: story branch tags do not overprint the next choice
  - **Bug.** `storyLayout` left a 12 px gap; the editor draws a ~20 px "→ Card N" label under each button.
  - **Fix.** The gap between story choices grows from 12 px to 32 px so the editor's "→ Card N" label (about 20 px) fits under each choice; the story body box shrinks to compensate.
  - **Acceptance criteria.** Geometry test over 2, 3 and 4 choices; real Chrome (Maker gate): no `.branch-label` rectangle intersects any button or the card edge.

### TASK-27y: README for a judge, and the score on story-only decks
  - **Fix.** README gains "Built with Kiro" (steering, specs, hooks, agent, MCP, property tests, mutation script) linking `.kiro/` and `docs/kiro-sessions/`. The ready-made deck photo is inset so it does not cover the ring.
  - **Acceptance criteria.** README has the section and the links resolve to files that exist; the picture element on a ready-made first card does not intersect the ring holes' rectangle.

### TASK-27n: samples are fresh
  - **Bug.** `samples/*.html` still carried the pictures the code had replaced; the test only compared titles.
  - **Fix.** Regenerate; the test deep-equals the whole embedded stack against the ready-made deck; `npm run check:samples` regenerates into a temp dir and compares bytes with `samples/`; it runs in `pre-submit` and CI (local edit to `ci.yml`; pushed separately by the maintainers).

### TASK-27o: `pre-submit` is a Manual hook again
  - **Evidence.** Kiro IDE 1.4.62 and kiro-cli 3.0 both ship a `Manual` trigger (J5 read the shipped code). Round 2 changed it to `PostTaskExec` on a wrong belief.
  - **Fix.** `"trigger": "Manual"`; `tests/hooks.test.ts` allows it; fire it once from this Kiro session and record the firing only if it truly fired.

### TASK-27p/q/s/u: docs honesty (`J5`)
  - README picture prose matches `readyMadeImages.ts` (credits, licences, "Chiara Coetzee"); `KIRO_LOG` superseded markers, "I" → "we", no "Nothing committed.", attribution of the post-TASK-26 commit; duplicate Phase 8/9 headings in this file renumbered; the tile-shape note drops "deliberate"; README says "plays in any current browser on a school laptop (built for ES2018)" and its CI sentence includes `check:claims` and the samples check; `docs/kiro-sessions/` holds short excerpts (the TASK-26 prompt, the hook-firing lines, the lesson-checker run) with no secrets.
  - **Acceptance criteria.** Tests read the README, the log, the credits and the directory.

**Gate (TASK-27):** `npm test`, `npx tsc --noEmit` and `npm run pre-submit` exit 0; `npm run check:living-file` and `npm run check:text-fit` pass (the latter with the new stamp, story-tag, start-screen and toolbar assertions).

### TASK-27 z3: every card can still reach the end  *(J4 P2-2)*
  - **Bug.** `checkReachability` only walked forward from card 1, so a branch whose only button points to itself passed ("1→{2,3}, 2→end, 3→3"). A J4 mutant that ignored card-level (auto-advance) gotos also survived.
  - **Fix.** A reverse pass from the end card(s) over every goto, card-level and button-level. Reachable non-end cards that cannot get to an end are `report.trapped`, counted in `ok`, listed in the share check ("… loops back on itself and never reaches the last card") and offered by "Take me to the card". Cards already reported as dead ends or stuck are not repeated.
  - **Acceptance criteria.** A trap-loop fixture and a two-card loop are reported; a card reachable only by a card-level goto is reachable and not trapped; a property test (random small graphs) checks `ok` ⇒ every reachable card reaches the end, against an independent depth-first oracle.
