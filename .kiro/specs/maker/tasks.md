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
