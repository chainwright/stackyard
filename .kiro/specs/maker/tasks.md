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

## Phase 8c — Built-app review fixes (2026-11-05)

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


## Phase 14 — Round-4 review fixes (TASK-28)

Source: `judge_2026-11-06_r4/J1–J5`. Spec first, then code, then a test that fails without each fix. Source files are edited with Kiro's file tools (fs_write / str_replace), not shell or python edit scripts, so the save hooks really run.

### TASK-28h: "+ Add Card" splices links for every card type  *(J4 P1-1, P1)*
  - **Bug.** `addCardAfter` relinked quiz answers only. After a flash or story card the previous card's Next still pointed at the old next card, so the new card was unreachable; `repairFlow` ("Link these in for me") had the same blind spot and did nothing.
  - **Fix.** One shared `linkInto(stack, index)` in `src/shared/flow.ts`: on the card before an inserted card, every goto (button-level and card-level) that pointed at the old next card now points at the new card; if the card before has no such goto, it gets one. The new card's own forward link goes to the old next card. `repairFlow` applies the same splice to every unreachable card.
  - **Acceptance criteria.** Property test: for any stack from the ready-made decks plus random insertions, and for every insertion index and kind, after `addCardAfter` every card is reachable from the first card and every card can reach the end. Unit test: `repairFlow` clears an unreachable card that follows a flash card and one that follows a story card.

### TASK-28m: every default placeholder label is flagged  *(J2 P1, J2/J4)*
  - **Bug.** "+ Add an answer" makes a tile labelled "Another answer"; the placeholder list in `reachability.ts` was a hand list that did not include it, so it reached the class with no warning (website export and the living file's Save a Copy).
  - **Fix.** The default labels live in ONE exported object (`PLACEHOLDER_WORDS` in `src/shared/reachability.ts`, including `anotherAnswer`); `operations.ts` uses it for its seeds, so the list can't drift from the defaults.
  - **Acceptance criteria.** A test that adds an answer to a card and checks the card is flagged; a test that walks every value of `PLACEHOLDER_WORDS` and checks a card holding it is flagged.

### TASK-28d: the drag pill and the "✓ Right answer" tab never overlap  *(J3 N1, P2)*
  - **Fix.** When the selected element is the right answer, the drag pill sits at the left edge of the selection (`left: 0`), the right-answer tab is right-aligned over the tile.
  - **Acceptance criteria.** `check-maker-fit` selects the right tile at 1366 and 1920 and asserts the two rects do not intersect.

### TASK-28e: Start screen at 1920  *(J3 N2, P3)*
  - **Fix.** The peek card clips its tiles inside itself; the three example chips fit on one row (shorter labels).
  - **Acceptance criteria.** `check-maker-fit` at 1366 and 1920: every `.peek-tile` lies inside `.peek-card`; the example chips share one row.

### TASK-28f: honest wait copy  *(J3 N3)*
  - **Fix.** "Usually 20–45 seconds." (measured live: 20.3 s, 25.5 s, 23–30 s; the slowest seen was 59.7 s on the fallback path, which the counter covers).
  - **Acceptance criteria.** The wait-screen tests and the mutant carry the new string.

### TASK-28g: the flip has weight  *(J3 D10)*
  - **Fix.** The card faces are opaque, the hinge takes ~360 ms, a shadow sweeps across during the turn. `prefers-reduced-motion: reduce` keeps the 100 ms cross-fade.
  - **Acceptance criteria.** Renderer/CSS test: the flip duration is 360 ms, the keyframes include the shadow, and the reduced-motion block removes the animation.

### TASK-28q: small Maker/Teacher polish  *(J2 P2)*
  - **Fix.** The pictures notice sits clear of the card's rings; the Teacher dropdown uses "—" like the website; the Teacher list is wider at ≥1600 px.
  - **Acceptance criteria.** The Teacher dropdown option text equals the website's `cardRefLabel` form; `check-maker-fit` covers the notice case (see r).

### TASK-28r: a banner never hides the canvas controls  *(J1 P1-1, P2-2, P2-3)*
  - **Bug.** At 1366×768 with a notice showing, `.canvas-area` centred a column taller than the area, so the flash Front/Back switch slid under the banner and the card's rings were clipped.
  - **Fix.** The canvas area lays out *below* the banner (`safe center`, scale fitted to the space left after the banner). The Start screen's top padding is trimmed so Build Cards is above the fold at 1366×657.
  - **Acceptance criteria.** `check-maker-fit` adds "banner shown" cases (ready-made Irish deck and a picture-request banner) at 1366×768 and 1366×657: the Front/Back switch is the hit target at its centre; the card's ring tops are not under the banner; Build Cards' bottom ≤ viewport height at 1366×657.

### TASK-28s: the pre-submit hook uses a documented trigger  *(J1 P1-2, J4)*
  - **Decision.** kiro.dev's hook-types page lists `Manual` as not supported in the IDE and "listed but not invocable" in CLI v3; the trigger enum in this Kiro build has no `Manual`. The documented trigger that fits "when a spec task is done" is `PostTaskExec`. `pre-submit` goes back to it, and an on-demand path is a manual steering file (`.kiro/steering/pre-submit.md`, `inclusion: manual`).
  - **Acceptance criteria.** `tests/hooks.test.ts` rejects `Manual`, requires `pre-submit` to be `PostTaskExec`, and checks the steering file exists with `inclusion: manual`. README, KIRO_LOG and `docs/kiro-sessions` stop calling it a run-on-demand button. A firing is recorded only if the session store shows one.

### TASK-28t / 28b / 28a: documents tell the truth  *(J5, J1)*
  - **28a.** REQ-EXP-01 reads "…shall load nothing from the network at runtime; inert licence source URLs inside comments are allowed". Its test asserts exactly that: no `src=`/`href=`/`url(`/`@import`/fetch to http(s) at runtime; comment URLs are allowed.
  - **28b.** Every TASK id in the three `tasks.md` appears in a test, script or hook. A new test (`tests/task-traceability.test.ts`) fails if one does not. The 7 TASK-27 ids (27c, 27j, 27o, 27p, 27t, 27w, 27y) are traced into test titles.
  - **28t.** Docs say "N of M task ids appear in tests or gates" with the number from that test, never "every". README gains a screens section from real screenshots of the current build and a note that the GitHub About website is the live demo URL.
  - **28c.** KIRO_LOG: "Chiara Coetzee"; the samples were NOT regenerated at that commit; the honest line about shell edits and save hooks. README: the lesson checker was run on the ready-made decks.

### TASK-28u: edit with file tools; a PostToolUse guard  *(J5 P1-1)*
  - **Fix.** `.kiro/steering/tech.md` gains the rule "edit source files with fs_write / str_replace so the save hooks run". A `PostToolUse` hook on `execute_bash` (trigger verified in this Kiro build's enum) runs `check:invariants` when the shell command looks like it wrote a file.
  - **Acceptance criteria.** `tests/hooks.test.ts` checks the new hook's shape and that the steering rule is present. KIRO_LOG records a firing only if the session store shows one.

**Gate (TASK-28):** `npm test`, `npx tsc --noEmit`, `CI=true npm run pre-submit` exit 0; `check:living-file`, `check:text-fit` (with the banner cases) and `check:samples` pass.


## Phase 15 — Round-5 review fixes (TASK-29)

Source: `judge_2026-11-06_r5/J1–J5`. Spec first, then code, then a test that fails without each fix. Source is edited with Kiro's file tools (steering rule in `tech.md`).

### TASK-29a: inserting a card never rewires a story  *(J4 P1-1, P1)*
  - **Bug.** `linkInto` assumed play reaches the new card from the card before it in deck order, and overwrote that card's first button when nothing pointed at the card after it. On a branching story that merged two branches silently, and `repairFlow` ("Link these in for me") did the same by overwriting a side card's Continue. The share check was then clean, so a corrupted story shipped.
  - **Fix.** Splice on the real edge. Let X be the one place the card before the new card (P) leads. P → X becomes P → new → X (every link of P to X moves to the new card; the new card goes to X, not to the deck-order next). If P has no link at all, it gets one to the new card. If P leads to two or more different cards (a fork) nothing is changed: the new card is added unlinked and the editor says "Choose where this card leads". Quiz answers are no longer re-pointed wholesale. `repairFlow` never overwrites a link: it moves a link to an unreachable card only when that card leads on to the same place (a pure splice), otherwise it adds a link (a free button, or an unused one).
  - **Acceptance criteria.** The J4 repros (`p6.mts` fork/cave/forest/glade; `p7.mts` market/longship) are unit tests. A property test over random BRANCHING stacks (2–3 choices per story card): after any insertion every button that existed before keeps its target except an edge that was spliced (and then the new card leads to the old target); every card that was reachable still is; the new card is reachable unless P was a fork; after `repairFlow` no existing button's target changed except a pure splice. A mutant that restores the overwrite goes red.

### TASK-29b: share-check lines do not double the full stop  *(J4 P2-1)*
  - **Fix.** Labels lose a trailing `.`, `!`, `?` (or "…") before the sentence's own full stop is added.
  - **Acceptance criteria.** No line from `describeProblems` contains "..", ". ." or ends in a doubled mark, for a label that ends in "." or "…".

### TASK-29c: `check:trace` counts titles, not mentions  *(J4 P2-2)*
  - **Fix.** An id counts only when it appears in a test title (`it(`/`describe(`/`test(` string) or a gate script's output/name string, not in a comment. The command prints the true number and the docs quote it as "named in a test or gate".
  - **Acceptance criteria.** A comment-only mention does not trace an id (unit test with a temp tree); the repo still reports every declared id traced.

### TASK-29d: docs and the shell-edit hook  *(J4 P2-2, J5)*
  - **Fix.** `KIRO_LOG` l.236 no longer calls `pre-submit` a Manual hook. `scripts/after-bash.sh` also catches `echo … > file`, `printf … > file`, `cat > file`, `tee` and here-docs.
  - **Acceptance criteria.** Tests: the log has no "pre-submit is a Manual hook"; the script's pattern matches each of those commands and not `ls` / `npm test`.

### TASK-29e: the Maker card fits its canvas  *(J1 P2-1, J2 #6; also q)*
  - **Bug.** With a banner (or at 1366×657) the card was not shrunk to the space under the banner, so the canvas scrolled and the bottom ~60 px of the card ran under the toolbar.
  - **Fix.** `fitScale` uses the area's real height (minus the Front/Back switch and the ring room) with a lower bound that lets the card shrink until it fits; the Maker minimum scale of 0.9 stays for the roomy cases only, the card never overflows.
  - **Acceptance criteria.** `check-maker-fit` asserts, for the editor cases (quiz, story, flash+banner, quiz+banner at 768 and 657), that the whole card is visible without scrolling: `scrollHeight <= clientHeight + 2` and the card's bottom ≤ the toolbar's top.

### TASK-29f / 29j: README GIF, header copy, counts  *(J1 P2-2/P2-4, J5 P2-2/P2-3)*
  - **Fix.** `make-readme-media.ts` ends the GIF with the living file: export → open THAT file with the network off → Teacher → change the right answer → Try It → CORRECT → Save a Copy → the copy opens and plays; screen 2 is captured after the transition settles. The header says "The lesson file works offline." The sessions excerpt says 79 firings.
  - **Acceptance criteria.** The script's frames/PNG list names the living-file steps; the app header text is the new line; docs say 79.

### TASK-29i: Manual is described the way kiro.dev describes it  *(J5 P1-1, P2-1)*
  - **Fix.** KIRO_LOG and `pre-submit.json` say: `Manual` is still in the trigger enum, but kiro.dev says CLI v3 lists Manual hooks without a way to invoke them and the IDE no longer creates them; so `pre-submit` is `PostTaskExec` plus an on-demand steering file run as `/pre-submit`.
  - **Acceptance criteria.** No file says "enum has no Manual"; the steering file and docs say `/pre-submit`. The CLI is tried once; a firing is recorded only if it truly ran.

### TASK-29l: sibling choices share a size; start card rules  *(J3 N2, N4)*
  - **Fix.** All choice buttons on a story card are fitted to the smallest size any one needs. The start card's ruled lines do not run through the heading or intro text.
  - **Acceptance criteria.** Renderer test: two choices of different lengths get the same font size. `check-maker-fit`: no rule line crosses the h1 or lede (the start card hides its rules behind a paper block there).

### TASK-29m: a teacher's own last-card heading shows at every score  *(J2 #1)*
  - **Fix.** The player swaps a celebratory heading for "You finished!" at score 0 only when it is one of Stackyard's own stock lines; a heading the teacher typed is kept at every score. The editor preview shows the heading as typed.
  - **Acceptance criteria.** Renderer test: "Brilliant work on fractions!" at score 0 is shown as typed; the stock "Well done — you finished!" at 0 becomes "You finished!".

### TASK-29n: "+ Add an answer" puts the cursor in the new answer  *(J2 #2)*
  - **Fix.** After adding, the Answer box gets focus with its text selected, on the website and in the Teacher tab.
  - **Acceptance criteria.** DOM tests: `document.activeElement` is the Answer input and its selection covers "Another answer".

### TASK-29o: plain zeros on answer tiles  *(J2 #3, J3 N3)*
  - **Fix.** Digits on tiles and questions use a plain zero (`font-variant-numeric: lining-nums` plus `font-feature-settings: "zero" 0` on the reading face, and a Latin-subset check that its zero glyph has no slash alternate selected).
  - **Acceptance criteria.** The tile and question CSS carry the same numeric settings; a test reads both rules.

### TASK-29p: share-check names; "which is bigger" options  *(J2 #4, #5)*
  - **Fix.** The card name in "Before you share" is the card number plus the question up to a word boundary (never mid-word, ending "…" when cut, longer than before so the number "20" survives). The prompt says options must fit the question's form (a two-way comparison offers only the two compared items).
  - **Acceptance criteria.** Unit test with "What is one quarter of 20?"; prompt test for the general rule, with no topic example.

**Gate (TASK-29):** `npm test`, `npx tsc --noEmit`, `CI=true npm run pre-submit` exit 0; `check-living-file`, `check-text-fit`, `check-maker-fit`, `check:samples`, `check:trace` pass.


## Phase 16 — Round-6 review fixes (TASK-30)

Source: `judge_2026-11-09_r6/FIX_LIST.md` + `J1–J5`, and the video hound's README items R1–R4. Spec first, then code, then a test that fails without each fix (the TASK-30x id is in the test title so `check:trace` counts it). Source is edited with Kiro's file tools.

### TASK-30a: the end-card fold never deletes a real card  *(J4 P1-1, live data loss; P1)*
  - **Bug.** `foldEndLikeCard` treated any non-quiz card right before the end card whose front *starts with* a praise word as a fake sign-off and deleted it. Praise words are ordinary vocabulary in language decks: a live Irish praise deck lost "Well done → Maith thú", and a French deck's "Congratulations → Félicitations" became the end heading. Nothing told the teacher.
  - **Fix.** Fold only when ALL hold: the candidate's longer text is long prose (more than 120 characters and at least two sentences — not a term, translation or definition); the deck's other flash cards are not short term → translation pairs; and either the teacher's sentence asked for a message or ending on the last card (the prompt is passed in as optional context) or the model's end card has no body. Otherwise the deck is left exactly as it is. When a fold happens, the stream `done` / one-shot response carries `movedClosingMessage: true` and the Maker shows "We moved your closing message onto the last card."
  - **Acceptance criteria.** The A / A2 repros (`p_r6.mts`) keep every card and leave the end card unchanged; the TASK-29k repro (flash "You did it!" + long back) still folds; a fast-check property: `finaliseGeneratedStack` never reduces the number of flash cards whose back is ≤ 120 characters; the notice shows on the Start screen after a fold; a mutant that restores the keyword-only rule is killed. (Spec for the generator side is in `stack-generator/tasks.md`.)

  - **Review fix (our review of the first pass; probe on the live G2 deck).** Two holes remained. (i) `asksForClosingMessage` matched "then the last card", which only names the end card. It now needs a message word (message, note, words, encouragement, sign-off, goodbye, farewell, ending message…) tied to the last/final/end card; "then the last card" / "end with the last card" alone is NOT asking. (ii) The short-pair test (back ≤ 60) missed real vocabulary backs of 75–100+ characters. A candidate whose front is a short term (≤ 4 words, no sentence punctuation) in a deck where every other non-end card is a flash card with a short-term front is vocabulary and is NEVER folded, whatever its back length or the prompt.
  - **Review acceptance criteria.** The G2 probe with a 153-character, three-sentence "Well done" back keeps 5 cards and `movedClosingMessage` false, for the prompt "…then the last card." and for a prompt that asks for a goodbye message on the last card; a fast-check property: for any deck whose flash fronts are all short terms, no flash card is removed for any prompt string; the 29k repro still folds; one mutant per new guard is killed.

### TASK-30b: the README demo never stamps a wrong fact  *(J1/J2/J5 P1-3; P1)*
  - **Bug.** `make-readme-media.ts` step 7 made "Romans" the right answer to "Which people began raiding Ireland around the year 795?", then stamped CORRECT on it.
  - **Fix.** The Teacher-tab edit is a TRUE edit: retype the label of the tile already marked right ("Vikings" → "Vikings from Norway"), then Try It stamps CORRECT on that same tile. The script never ticks a different radio. Media regenerated.
  - **Acceptance criteria.** A test reads the script and asserts it edits the label of the right tile and never clicks a radio; the regenerated frames 7–9 and the GIF tail are looked at and described.

### TASK-30c: the live app serves the sample lesson files  *(J1, J5; P1)*
  - **Bug.** `/samples/*.html` returned 404 on the live app, so the "open a sample" claim could not be followed.
  - **Fix.** The server serves exactly three names from an allowlist — `irish-words.html`, `times-tables.html`, `vikings-in-ireland.html` — at `/samples/<name>.html` (no URL text reaches the filesystem), `text/html`, `nosniff`, with a CSP for an offline lesson file: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data: blob:; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`. The Maker's own CSP is unchanged. `samples/` ships in the repo checkout, which the Render build already has.
  - **Acceptance criteria.** 200 for each name; 404 for anything else, including `..`, encoded and case variants and a trailing path; the CSP header; a headless check that a served sample renders a card and Save a Copy works under that CSP.

### TASK-30d: the living file first on the Start screen  *(J1 Innovation, P1-5; P1)*
  - **Fix.** One quiet line near the ready-made row: "Open a lesson file (works with Wi-Fi off)" (opens `/samples/vikings-in-ireland.html` in a new tab) with the hint "Try the Teacher tab in its corner." No stamp red.
  - **Acceptance criteria.** DOM test: the link, its `target="_blank"` + `rel="noopener"`, and the hint exist; `check-maker-fit` stays green at 1366×768 and 1366×657 (Build Cards above the fold).

### TASK-30e: README truth  *(video hound R1–R4, J5 P1-3; P1)*
  - **Fix.** R1 the AI-footage sentence; R2 six hooks including `invariants-after-shell-edit`; R3 "Successors like HyperStudio and Decker exist, but none starts from a teacher's sentence."; R4 AI quiz makers "usually live on a platform that needs accounts, or export to forms, LMS formats or PDF."; the demo video link (https://youtu.be/xQvUPdifiVE, 2:35) at the top next to the live app; a line that the README screens and GIF use the ready-made Vikings deck (no live generation).
  - **Acceptance criteria.** A test names the exact replacements and that the README's hook count equals the number of files in `.kiro/hooks/`.

### TASK-30f: the cross-browser record is committed  *(video hound; P1)*
  - **Fix.** `docs/cross-browser/` holds `README.md` (the 6 Nov write-up with its limits, plus a line that it ran before TASK-29/30), `result.json`, and `cross_browser.py` (the script with the one `go_offline` function inlined). The README's offline claim links to it.
  - **Acceptance criteria.** A test checks the three files exist, the script has no `from ui import`, and the README links the folder.

### TASK-30g (Maker half): the last card's message is editable  *(J2 #7, J3 N2, J4 P2-4; P2)*
  - **Fix.** The end-card panel gets a "Message (optional)" textarea under Heading (max 300), backed by the existing text operations on the END_BODY text: created when absent, removed when cleared.
  - **Acceptance criteria.** DOM tests: typing creates the second text, clearing removes it, the 300 limit holds. (Teacher tab half: `exporter/tasks.md`.)

### TASK-30h: the plain-zero font loads in the Maker  *(J4 P2-3, J5 P1-1; P2)*
  - **Bug.** Vite inlined `digits.woff2` as `data:`, the Maker CSP is `font-src 'self'`, so `document.fonts` reported "Stackyard Digits error" and the Maker kept a slashed zero.
  - **Fix.** `build.assetsInlineLimit` never inlines `.woff2`. The CSP is not widened. The exported file still embeds its fonts.
  - **Acceptance criteria.** `check-maker-fit` asserts every `FontFace` in `document.fonts` is `loaded` (after `document.fonts.ready`) on the Start screen and in the editor, and goes red with the old config (a mutant).
  - **Review fix.** The file:// check cannot see the real failure (the server's `font-src 'self'`). A new `scripts/check-maker-fonts.ts` starts the real server (`createServer` serving `dist/maker`, so `applySecurityHeaders` sends the real CSP), opens the Maker over `http://127.0.0.1` in headless Chrome (own CDP client, throwaway profile, never ports 9222/9224), waits for `document.fonts.ready` and fails naming every FontFace whose status is not `loaded`, on the Start screen and in the editor (ready-made deck). It is part of `pre-submit` (`npm run check:maker-fonts`); a mutant restoring the old `assetsInlineLimit` turns it red.

### TASK-30i: fork-aware "Link these in for me"  *(J4 P2-1/P2-2, J2 #8, J3 N1; P2)*
  - **Bug.** After inserting a card at a fork, the new card still led to deck-next (another branch), the repair added a third "Next Card" choice to the fork, a stale "nothing leads to it yet" notice stayed on screen, and a stranded card with a "Start again → card 1" button was moved to the front, changing where the deck starts.
  - **Fix.** At a fork the new card gets no outgoing link (or one to the branches' common rejoin card if there is exactly one). `repairFlow` never adds a button to a story card that has two or more choices; such a card stays flagged with "Choose which story choice should lead here", and "Take me to the card" opens the fork card. The insert notice clears after a successful repair. `repairFlow` never moves a card to the front just because it links to card 1.
  - **Review fix.** "The insert notice clears after a successful repair" is pinned by a rendered DOM test (jsdom): insert after a fork, see the notice, run "Link these in for me" in the share check, the notice is gone — not by a source-text check.
  - **Acceptance criteria.** Unit tests for repros B and C; the branching property test also asserts no story card with ≥ 2 choices gains a button; the notice clears after repair; the share check names the fork.

### TASK-30j: docs leftovers  *(J4, J5; P2)*
  - **Fix.** KIRO_LOG says `/pre-submit` (not `#pre-submit`) at the TASK-23 and TASK-27 hook bullets; the kiro-cli `/pre-submit` claim cites session `2028064e-7d31-4c17-a0db-e0d22ecc728e`; `scripts/after-bash.patterns` also matches `python3 <file>.py`, `cp`, `mv`, `git apply`.
  - **Acceptance criteria.** Doc tests for the strings; the dry-run test for each new command.

### Optional, NOT done this round: drag in the Teacher tab  *(FIX P2-1; was lettered k)*
  - Left open on purpose: the Teacher tab still edits by clicking and typing; dragging an element there is not built. See `exporter/tasks.md`.

**Gate (TASK-30):** `npm test`, `npx tsc --noEmit`, `CI=true npm run pre-submit` exit 0; `npm run check:mutants` reports every mutant killed.

---

## Phase 17 - v2 panel fixes (TASK-31)

Source: `judge_v2_2026-11-09_app/SUMMARY.md`, `J04_engineering.md` (4.4, 4.6, 7) and `J05_hound.md` (4 README table, 6), on commit ee37ab7. Spec first, then code, then a test that fails without each fix, with the TASK-31x id in its title (`check:trace` counts it). Source is edited with Kiro's file tools.

### TASK-31a: README and docs say only what is true  *(J05 R2/R3/R6/R19, MCP bullet, music; P0/P1)*
  - **Bug.** README line 7 links the old video (`xQvUPdifiVE`, 2:35), not the submitted one (v7, 2:52). The README says the file plays "in any current browser on a school laptop" (tested only in headless Chrome by our gates and once in Playwright's Firefox and WebKit builds). The cross-browser sentence omits that the run was on 6 Nov before TASK-29/30. The MCP bullet implies Kiro ran it (it was run as a script outside Kiro). "Successors like HyperStudio and Decker … none starts from a teacher's sentence" has no backing for HyperStudio. The video's music has no licence note. `docs/cross-browser/README.md` carries an internal process line and a wrong script path. `.kiro/steering/pre-submit.md` lists a stale part of the gate.
  - **Fix.** Exact README replacements for line 7 (video `G5aNDWg8UGY`, 2:52, plus the live app), the ES2018 sentence, the cross-browser parenthesis, the MCP bullet and the Decker sentence. The "Demo video: music and generated footage" section links a new `docs/MUSIC_LICENCE.md` that states only the facts the team gave. `docs/cross-browser/README.md` loses the "Under the rule the coordinator set" line and names the script next to it. The steering file says `npm run pre-submit` is the whole gate in `package.json`.
  - **Acceptance criteria.** A test: README line 7 links `G5aNDWg8UGY` and `docs/MUSIC_LICENCE.md` exists and is linked from the README; tests for each exact string; `check:claims` and the docs tests stay green.

### TASK-31b: the Teacher tab fits a phone  *(J01/J03/J04, SUMMARY product P1-3)*
  - **Bug.** At 390x844 the Teacher tab clips the card and the card list takes about 60% of the width.
  - **Fix.** Below 700 px the list collapses into a one-line "Cards" toggle that opens it, the card preview gets the full width (scaled to fit, nothing clipped) and the inspector sits below the card. The desktop layout is unchanged.
  - **Acceptance criteria.** `scripts/check-living-file.ts` opens a sample living file at 390x844, opens the Teacher tab and asserts the card's box is inside the viewport horizontally and not clipped by any ancestor's overflow; it saves `docs/media/teacher-390.png`. A mutant that removes the media query is killed.

### TASK-31c: the wait  *(J04 4.4/4.6c, SUMMARY product P1-2; P0)*
  - **Bug.** Measured on the live model config (claude-haiku-5-5, water-cycle sentence, 12 cards): Build Cards to editor 30.5 s and 33.5 s; first card 20 to 24 s. A raw stream shows the role chunk at 0.7 s and then nothing until the first text at 20 to 24 s: the model thinks before it writes. With `"thinking": {"type": "disabled"}` the first text arrived at 0.58 s and the whole stack at 11.0 s (`reasoning_effort: low` did not help). The prompt also asks the model to "decide all card ids up front", the requested schema carries x/y/w/h the server re-lays out anyway, the deal area is empty while waiting and shows empty answer tiles on a preview card, and `STREAM_IDLE_DEADLINE_MS` (20 s) is armed before the first chunk, so a slow first token falls into the 2 x 45 s retry path.
  - **Fix.** (1) `STACKYARD_LLM_THINKING=on|off`; when off both gateway calls send `"thinking": {"type": "disabled"}`; default off for host `api.anthropic.com`, nothing sent for other hosts; `render.yaml` sets it off with a comment; README env table gains the row. (2) The prompt numbers cards `c1, c2, …` in order instead of planning ids. (3) x/y/w/h leave the requested schema if the server fills them before validation on every path (one-shot, stream, retry, preview card). (4) Outlined ghost cards while waiting for the first card; a dealt preview card never shows empty answer tiles. (5) `STREAM_FIRST_TOKEN_DEADLINE_MS` (45 s) applies until the first content delta; the 20 s idle deadline applies only after it. (6) The `stream timing` log line gains `thinking=on|off`.
  - **Acceptance criteria.** Gateway tests (field present by default for the Anthropic host, absent for another host, env overrides both ways, the key never in an error); prompt tests; a property test that coordinate-free model output always finalises to a valid stack; a DOM test for the ghost cards and the preview tiles; fake-timer tests (first content at 30 s succeeds; a 21 s stall after content aborts as idle; the total deadline is unchanged); the timing line carries `thinking=`.

### TASK-31d: drag in the Teacher tab  *(J04 4.6b, FIX P2-1; P2)*
  - **Bug.** The living preview cannot move an element; the Maker can.
  - **Fix.** The Maker's pointer handler (pointer capture, screen to canvas by dividing by the scale, one coalesced undo step) is ported into the living preview, through the shared `moveElement` operation (canvas clamp, button overlap guard). Preview nodes carry element ids for hit-testing. A drag is one reversible step in the Teacher tab's history.
  - **Acceptance criteria.** A jsdom drag moves the element and the stack stays valid; a fast-check property: any sequence of drags (random deltas, including off-canvas) keeps `validate(stack)` ok and every element inside 800 x 600; `check-living-file` drags a tile, saves a copy and asserts the copy holds the new x/y; a mutant that skips the clamp is killed.

### TASK-31e: the "word for word" rule  *(FIX P2-6)*
  - **Bug.** `promptBuilder.ts` told the model to repeat definitions "word for word".
  - **Fix.** The one-shot, streaming and retry prompts carry: "Don't ask for the definition just given on a flash card within the previous 3 cards; ask about it differently, or about something else."
  - **Acceptance criteria.** A prompt test covers all three prompts and finds no "word for word".

### TASK-31f: log and gate honesty  *(J04 P1, J04 P2)*
  - **Bug.** KIRO_LOG has two different "98" counts that look like one; `check:mutants` hides why a baseline failed.
  - **Fix.** Each "98" carries its date and scope; a TASK-31 entry is added; `scripts/mutation-check.ts` prints the tail of the failing vitest output on a baseline failure.
  - **Acceptance criteria.** A test of the KIRO_LOG strings; a test that the baseline-failure path prints the tail.

### TASK-31h: pictures on generated decks, with no new outbound call  *(SUMMARY product P1-4, FIX_LIST P1-4; optional)*
  - **Bug.** Generated decks have no pictures: the prompt says `Do NOT output "image" elements` and the sanitiser drops any model picture that is not a `data:` URI. The README's pictures are only on the three ready-made decks. The Start screen says "Pictures aren't added automatically yet", and the Maker has no way to remove a picture from a card (no remove path exists for an element).
  - **Fix.** Pictures by NAME from a set we own, never from model bytes.
    - `src/shared/pictograms.ts`: about 40 simple inline SVG pictograms in the design system's ink style (one colour, `#1E2A47`, on transparent, viewBox 0 0 64 64, each under 1.5 KB, no text, no external reference, no script, no `<foreignObject>`, no `href`), licensed with the repo (MIT) and credited on the card as "Picture: Stackyard pictogram". Exports the names, `isPictogramName`, `pictogramDataUri(name)` (built only from our set) and `pictogramNameOfSrc`.
    - Schema: the model may add `{ "type": "image", "picto": "<name>" }` to a quiz, flash or story card (at most one per card, never on the end card). The prompts list the allowed names and say nothing else about images. `sanitizeRawElement` turns a known name (trimmed, lower-case) into an image element whose `src` and `alt` come from OUR set; an unknown name is dropped silently; EVERY other model-supplied image (any `src`) is dropped, so no model-controlled bytes reach `src`.
    - Layout: `normalizeGeneratedCard` takes the pictogram out before the per-kind layout and puts it back in the template's picture slot (top centre, x 356, y 8, 88 x 88, the strip the ready-made decks' pictures use) with the credit line in the caption slot (x 48, y 566, w 340, h 28), on the one-shot, retry, stream and streamed-preview paths. The flash renderer and the Maker's flash preview draw the picture and its credit (they ignored images).
    - Maker: the inspector's "Picture" select (None plus the same names) adds, swaps or removes the picture through a new `setPictogram` operation (a flash card needs its back first). The Start-screen note tells the truth: "We added a simple picture to some cards. For a photo, use Add Picture." or, when none came, "No pictures were added this time. Use Add Picture."
    - README: one line under Pictures.
  - **Acceptance criteria.**
    - Tests (`TASK-31h` in the titles):
      - every pictogram SVG is safe (no `<script`, `on*=`, `href`, `foreignObject`, external URL) and under the size cap;
      - the set has 40 or more lower-case noun names;
      - a property test that for ANY model string the produced `src` is one of the known data URIs, or no image at all;
      - model-supplied images are dropped;
      - at most one per card, none on the end card;
      - the streamed preview card carries it;
      - normalising is idempotent;
      - the flash renderer and the Maker preview draw it;
      - `setPictogram` adds, swaps and removes, and rejects the end card;
      - the Inspector select works;
      - the notice wording.
    - A mutant that passes a model-supplied `src` through is killed.
    - `scripts/check-pictograms.ts` (headless Chrome, network blocked) plays an exported class file and a living file with a pictogram on a quiz, a flash and a story card and finds the picture decoded, inside the card, overlapping nothing, and no network request.
    - `check-text-fit` and `check-maker-fit` stay green with a picture on a quiz card (a case is added to each).
  - **Found on the way (a real Maker bug, not caused by pictures).** Adding the picture scenarios shifted `check-maker-fit`'s id counter, which changes the stack id, and the right answer's shuffle is seeded from the stack id. The quiz scenario at 1366 px then failed: "the Drag to move pill overlaps the Right answer tab". Forcing each position showed it fails whenever the right answer is in the TOP row (tiles A or B) and passes in the bottom row. The gate had been green only because the shuffle happened to pick row 2. **Fix:** on the right tile the pill hangs below the tile (the gutter under it) instead of sharing the top strip with the tab. The quiz scenarios now force the right answer into the top row and the bottom row explicitly (`rightAt`). The existing 28d mutant now restores the old left-edge pill.

### TASK-31g: the fold property states the real invariant  *(our gate run, seed 1135286996)*
  - **Bug.** `tests/round6-generation.test.ts` "TASK-30a: property — when every flash front is a short term…" failed on a random seed: the deck `aa / AA`, `Well done / Q0` kept all its cards (no fold, `movedClosingMessage` false) but the second flash card came out a story card "Well done" with no back. Cause: `isCounterOnly` in `normalizeGenerated.ts` treats ANY text that is just `q`/`question`/`card` plus digits as the model's own "Question 3 of 6" header and drops it, so a real back such as "Q0" vanished and the one-text flash repair turned the card into a story. The property counted flash cards, so it was flaky since TASK-30 (green only for lucky seeds) and asserted the wrong thing.
  - **Fix.** Code: only a counter that is clearly chrome is dropped — the words `question` / `card` with a number, or `q` with "of N" — and a bare `Q0`, `Q1` is kept as real text; a prefix is still stripped only when text FOLLOWS it (`stripQuestionPrefix` already leaves a bare label alone). Test: the property now states the invariant — finalising never removes a card (the non-end card count is unchanged) and every original front is still on some card, for any prompt, unless `movedClosingMessage` is true — and the counterexample runs as an explicit `examples` entry every time.
  - **Acceptance criteria.** A unit test that "Q0", "Q1", "A4" and "No 5" survive as a flash back while "Question 3 of 6" and "Card 2" headers are still dropped; the property passes over several seeds and 5,000 runs once.

**Gate (TASK-31):** `npm test`, `npx tsc --noEmit`, `CI=true npm run pre-submit` exit 0; `npm run check:mutants` reports every mutant killed; `npm run check:claims:fix` if counts moved.

---

## Phase 18 - v2 round-2 fixes (TASK-32)

Source: `judge_v2_2026-11-09_app_r2/SUMMARY.md`, `J04_engineering.md` (Extra B, C, D, section 6) and `J05_hound.md` (R14, R20, E32, section 6), on commit 1ce7395, plus our own measurements on the live model config. Spec first, then code, then a test that fails without each fix, with the TASK-32x id in its title (`check:trace` counts it). Source is edited with Kiro's file tools.

### TASK-32a: the wait copy says what we measured  *(J04 Extra C, SUMMARY P0)*
  - **Bug.** The building screen says "Usually 20–45 seconds" and its comment says "real builds take 30–45 s". Measured at 1ce7395 the editor opens in about 10 s. The 26f mutant pins only "not 20 seconds", not the truth.
  - **Fix.** The copy becomes "Each card appears as it's ready. Usually about 10–20 seconds." The comment gives the measured numbers:
    - live 1ce7395: first card 1.5–2.3 s, editor 9.5–9.7 s;
    - our local runs on the live config: 7.7–9.4 s;
    - before TASK-31: 30–34 s.
  - **Acceptance criteria.** DOM tests assert the new copy and that neither "20–45" nor "about 20 seconds" appears. Mutant 26f restores the old copy and is killed; a second mutant writes "About 20 seconds." and is killed.

### TASK-32b: generation quality  *(J04 Extra D, SUMMARY P1; our live runs: 3 sentences x 2)*
Measured: the quiz count was off the request in 4 of 6 decks; one deck had 4 of 7 quizzes with only 2 answers; "the right answer is a substring of a wrong one" in 2 of 6; the organiser's run had a duplicated "Evaporation" flash card and 6 of 7 two-answer quizzes. Five fixes, sharing `src/shared/lessonCheck.ts` (pure, used by the server, the Maker and the Teacher tab):
  - **b1 — three or four answers.**
    - **Bug.** The prompt says "at least one button that does not" score, so two answers are allowed everywhere, and a 50 % guess reaches the class.
    - **Fix.** All three prompts say: every quiz card has 3 or 4 answer buttons, exactly one right; a two-way comparison ("A or B?") is the only exception, at most one per deck. A quiz card with 2 answers whose question is not a two-way "A or B" comparison is never changed; it is flagged by `lessonWarnings` and shown in "Before you share" as "Card N has only two answers: add one."
    - **Acceptance criteria.** Prompt tests (no "at least one button"). Unit tests for `isTwoWayComparison`. A property test: the share check flags every two-answer non-comparison quiz card and no other quiz card for this reason.
  - **b2 — no repeated cards.**
    - **Bug.** The model repeats a card (the same "Evaporation" front and back), and nothing in `server/` detects it.
    - **Fix.** In `finaliseGeneratedStackDetailed`, before linking, drop any non-end card whose kind and normalised front text equal an earlier card's. Every goto that pointed at the dropped card points where the dropped card led, or at the earlier twin. The result reports `removedRepeats`; the Maker note says "We removed N repeated card(s)."
    - **Acceptance criteria.** Unit tests (the measured Evaporation shape). A property over random stacks with injected duplicates: no duplicate (kind, front) survives, the stack validates, and every originally reachable non-duplicate card stays reachable.
  - **b3 — the counts the teacher asked for.**
    - **Bug.** The model wrote 4 or 7 quizzes for "a 6-question quiz" and 6 or 4 for "a 5-question quiz".
    - **Fix.** `parseRequestedCounts(sentence)` → `{ quiz?, flash?, total? }`. It reads digits and number words one to twelve ("6-question quiz", "two flash cards", "a 10-card …") and returns `{}` when nothing is found. All three prompts carry hard numbers ("Write exactly 6 quiz cards and exactly 2 flash cards."). After finalising, extra quiz or flash cards are dropped from the end, relinked as in b2. When there are fewer, they are kept and the Maker note says "You asked for 6 questions; the model wrote 4."
    - **Acceptance criteria.** Parser unit tests, including "none found". A property: trimming keeps the stack valid, every remaining originally reachable card reachable, and the counts at or below the request.
  - **b4 — a picture never gives the answer away.**
    - **Bug.** On 2–3 cards per deck the pictogram names the right answer (a "sun" on "What heats the water?" → "The sun").
    - **Fix.** A pictogram whose name (or alt word) is a word of its quiz card's right answer is dropped (case- and punctuation-insensitive, plural "s" folded).
    - **Acceptance criteria.** Unit tests and a property: no surviving pictogram name is a word of its card's right answer.
  - **b5 — a cheap lesson check.**
    - **Bug.** The lesson-checker persona (`.kiro/agents/lesson-checker.md`) is dev-time only; generated decks are never checked.
    - **Fix.** The mechanical rules run on every deck in "Before you share" (Maker and Teacher tab), naming the card, as non-blocking warnings. "Export anyway" still exports.
      - duplicate answer labels on a card;
      - the right answer is a substring of a wrong one, or the reverse (case- and punctuation-insensitive);
      - a quiz within 3 cards after a flash card whose question just asks for that flash card's term (the right answer is the term and the question carries most of the definition's words) or its definition (the question names the term and the right answer is mostly the definition's words).
    - **Acceptance criteria.** Unit tests with the measured shape ("Rivers and lakes that lead to the sea" / "The sea"). The three ready-made decks raise no warning (`check:decks`).
  - **Gate.** `scripts/check-generation-quality.ts` runs the whole finalise path over the live-shaped fixtures in `tests/fixtures/generation/` (duplicate Evaporation, two-answer quizzes, 7 quizzes for 6 requested, an ambiguous key). It asserts 0 duplicates, the counts trimmed, and the expected warnings present. Wired into `pre-submit` as `check:generation-quality`. Mutants for b1–b5.

### TASK-32c: no credit line on the child's card  *(SUMMARY P1)*
  - **Bug.** Every generated card with a pictogram prints "Picture: Stackyard pictogram" on the card the child reads. The pictograms are ours (MIT) and need no on-card credit.
  - **Fix.** The normaliser and `setPictogram` add only the image. An old credit line (from an earlier export) is still recognised and removed when the picture is re-placed, swapped or removed. The player and the Maker's flash preview no longer draw it. The README keeps the credit. Photo credits on the ready-made decks stay.
  - **Acceptance criteria.**
    - Tests: no generated card, exported file or rendered card carries the line.
    - `check:pictograms` asserts its absence.
    - A mutant that re-adds the credit is killed.

### TASK-32d: drag on flash and end cards — not feasible; the docs say so  *(J04 Extra B)*
  - **Finding.** The flash card's term and back have no single position. The front draws the term centred at y 264; the back draws it small at the top with the explanation under it. Both are laid out by the flip surface, not by the elements' x / y, and the end card is a centred flex layout. Making them draggable would mean the player honours their x / y, which breaks the flip design on every flash card and changes every exported end card. A drag would also fight the tap that flips.
  - **Decision.** Keep the layout. Every doc says "drag on quiz and story cards (not flash or end cards)": the README, `docs/DEVPOST_WRITEUP.md`, KIRO_LOG and the exporter spec. The Teacher tab's inspector says so on a flash card and on the last card ("This card keeps its own layout, so its words can't be dragged.").
  - **Acceptance criteria.** A DOM test for the inspector hint on flash and end cards (and not on quiz cards). A docs test for the wording.

### TASK-32e: README truth, and the hook counts recounted  *(J05 R14, R20, E32; README:92)*
  - **Bug.** README:111-112 says the invariants mean every stack "always plays to an end score" (reachability is the share check's job). README:119-121's H5P line is refutable. README:92 says the pre-submit hook "fires" (it has never fired). "98 hook firings" names two different counts: the TASK-28 total of three hooks, and TASK-30's after-shell count alone.
  - **Fix.** The exact README sentences given. The recount from the session store, as a table in `docs/kiro-sessions/README.md` ("Hook firings, recounted from the session store (9 Nov)"). KIRO_LOG, kiro-sessions and README use those numbers and say which "98" they mean.
  - **Acceptance criteria.** Docs tests for each string and for every "98" being qualified.

### TASK-32f: keep-warm in the repo  *(J04 section 6 P0)*
  - **Bug.** The keep-warm pinger runs only on a Mac, so it is a single point of failure.
  - **Fix.** A ready-to-install workflow: `schedule` every 10 minutes plus `workflow_dispatch`, `permissions: {}`, one job that runs `curl -fsS --max-time 90` on `/api/health` with one retry, and no secrets. The README "Deploy" section says GitHub may delay scheduled runs and a free instance can still be cold.
  - **Amended (push blocked).** GitHub refused the push: a Personal Access Token without the `workflow` scope can't create or update `.github/workflows/*`. So the workflow lives at `docs/ops/keep-warm.yml` and `.github/workflows/keep-warm.yml` is removed. The coordinator installs it through the GitHub web editor. The README says it becomes active only once copied to `.github/workflows/keep-warm.yml`, and that until then an external pinger keeps the demo warm. It never claims the workflow is running.
  - **Acceptance criteria.**
    - A test reads `docs/ops/keep-warm.yml`: the schedule, the URL, `workflow_dispatch`, `permissions: {}`, and no `secrets.`.
    - The README says the workflow must be installed.
    - If `.github/workflows/keep-warm.yml` exists, it is byte-identical to the docs copy.

### TASK-32g: the write-up is checked like the README  *(J04 section 6 P0, root fix)*
  - **Bug.** The Devpost write-up lives outside the repo and drifted: 9 FALSE claims in the last hound pass, mostly stale numbers.
  - **Fix.** `docs/DEVPOST_WRITEUP.md` is the write-up, copied from `../WRITEUP_DRAFT.md` without its draft heading wording, its "Status" paragraph and its "Notes for the judge loop" section. It is then corrected only where this task makes a sentence false. `scripts/check-claims.ts` (and `--fix`) also checks it, failing with a clear line per drift:
    - traced ids ("N of N" vs `check:trace`);
    - tests, if it states a count;
    - mutants ("N-mutant script", "N of N killed" vs the mutants defined in `scripts/mutation-check.ts`);
    - fast-check properties ("N fast-check properties" vs a scripted count of `fc.property` / `fc.asyncProperty` in `tests/`);
    - player KB;
    - the generated lesson-file size ("about N KB" vs a living export of a fixed fixture deck, ±10 %).

    The README says where the write-up lives.
  - **Acceptance criteria.** A test with a temp copy proves each check goes red on a wrong number. A mutant (the write-up check skipped) is killed.

### TASK-32h: the write-up's "Where it sits" is current, and "an 86-mutant"  *(our review of TASK-32)*
  - **Bug.** `docs/DEVPOST_WRITEUP.md` was copied before the coordinator rewrote "## Where it sits" in `../WRITEUP_DRAFT.md` (14:51 local), so it kept the old "Decker already keeps its editor…" paragraph and the closing "Stackyard joins these…" sentence. And `check:claims --fix` wrote "a 86-mutant script": the pattern only knew "a".
  - **Fix.** The two "Where it sits" paragraphs are taken from the draft verbatim. A diff of the rest against the draft shows only the differences TASK-32 made true. The mutant-script pattern accepts "a" or "an", and `--fix` writes the article the number is spoken with: "an" for 8, 11, 18, 80–89, 800–899, 8,000–8,999, 11,000 and 18,000, otherwise "a".
  - **Acceptance criteria.** A docs test pins the new paragraphs and the absence of the old ones. A unit test covers `articleFor` and `--fix` turning "a 86-mutant" into "an 86-mutant" (and "an 72" into "a 72"). The write-up says "an 86-mutant script".

**Gate (TASK-32):** `npm test`, `npx tsc --noEmit`, `CI=true npm run pre-submit` exit 0; `npm run check:mutants` reports every mutant killed; `npm run check:claims:fix` if counts moved.

## Phase 19 - TASK-33

From the coordinator's note (keep-warm installed) and the teardown of the other HyperCard entries (`../CLONES_TEARDOWN_2026-11-09.md` §3a item 1 and §4 row 6).

### TASK-33a: keep-warm is installed; the README says so
  - **Bug.** The coordinator installed `.github/workflows/keep-warm.yml` on GitHub (commit c65e138, byte-identical to `docs/ops/keep-warm.yml`). The README still says the workflow "becomes active only once it is copied" and that "until then an external pinger keeps the demo warm", which is now false.
  - **Fix.** The README "Keep-warm" paragraph says the workflow is installed and runs every 10 minutes. GitHub may delay scheduled runs, so a free instance can still be cold after a quiet spell. `docs/ops/keep-warm.yml` is the reviewed copy. One KIRO_LOG line.
  - **Acceptance criteria.**
    - The TASK-32f docs test that required "must be installed" now requires the "installed" wording and the absence of the old "becomes active only once" and "Until then" sentences.
    - The byte-identical check stays: if `.github/workflows/keep-warm.yml` exists, it equals `docs/ops/keep-warm.yml`.

### TASK-33b: "the lesson is the file" (with a number you can check)
  - **Finding.** Every other HyperCard revival in this contest brings back the editor. Stackyard brings back the stack you could hand to someone: one HTML lesson that plays, scores and edits itself offline. The README, the write-up and the Start screen don't lead with that, and no checkable number backs it.
  - **Fix.**
    - **README opening.** One or two sentences carry the reframe. Keep "Inspired by HyperCard. Built for Kiroween 2026 with Kiro." and the video and live links. Name no other entries. Say that the file is offline and the Maker is not.
    - **Write-up.** The Inspiration paragraph's last two sentences and one "What it does" bullet carry it. "Where it sits", the Credits and the numbers that check:claims manages stay untouched. "The four numbers in the README" becomes "five", because the README now has five.
    - **Start screen.** One short promise line under the h1: "The lesson is the file: it plays, scores and edits itself, with the Wi-Fi off." It uses existing ink-on-paper styles, with no stamp red and no new colours. `check-maker-fit` stays green at 1366×768 and 1366×657 (Build Cards above the fold). At 390 px nothing changes.
    - **The number.**
      - `scripts/lesson-size.ts` measures the bytes of a LIVING export of the fixed water-cycle fixture (`tests/fixtures/generation/water-cycle-g2.json`).
      - The floppy count is `floor(1,457,664 / bytes)` (FAT12 capacity of a 1.44 MB floppy; never rounded up).
      - The count goes in README "By the numbers" and in the write-up. check:claims checks it in both files, and `--fix` rewrites it.
      - The claim names the fixture, not the samples: the samples carry photos and are larger.
  - **Acceptance criteria.**
    - `tests/export-size.test.ts`:
      - the fixture's living export is at most `floor(1,457,664 / N)` bytes, where N is the README's claimed count;
      - every sample in `samples/` has its size stated and is under its budget;
      - the claim names the water-cycle fixture.
    - Unit tests for `floppyCount` (floor, never ceil) and for the README and write-up floppy checks and `--fix` (temp copies).
    - A DOM test for the Start screen promise line.
    - A mutant that rounds the floppy count up is killed.

**Gate (TASK-33):** `npm test`, `npx tsc --noEmit`, `CI=true npm run pre-submit` exit 0; `npm run check:mutants` reports every mutant killed; `npm run check:claims:fix` if counts moved.

### TASK-33d1: an automated accessibility audit, fixed rather than excused  *(teardown §4 row 7; §3b AfterStack)*
  - **Bug.** Stackyard has never been audited for accessibility. The teardown's AfterStack row shows a rival with one-switch scanning, and we can't show anything comparable.
  - **Fix.**
    - axe-core is a pinned devDependency (exact `4.14.0`, in `package.json` and the lockfile).
    - `scripts/check-a11y.ts` injects it by DevTools evaluation (never a `<script src>`, so every page keeps its real CSP) into headless Chrome on its own port (9351).
    - It runs the WCAG 2.0, 2.1 and 2.2 A and AA rules plus best practice on 14 pages:
      - the Maker Start screen and the editor with a ready-made deck (the real server, the real CSP);
      - the 3 samples in Play and in the Teacher tab;
      - a class export;
      - the first 5 bench files.
    - It writes `docs/accessibility/axe-report.json` and fails on any serious or critical violation.
    - What it finds is fixed in our code:
      - labels tied to the Teacher tab's boxes;
      - a flash card named by its own words;
      - no button inside a button (the Maker's card list, the flash card's Next Card);
      - `<main>`, an `h1` and named landmarks;
      - no `aria-label` without a role.
    - Any excluded rule is listed, with the reason, in `docs/accessibility/README.md`. None is excluded.
  - **Acceptance criteria.**
    - `check:a11y` is in pre-submit and reports 0 serious and 0 critical.
    - DOM tests for each fix.

### TASK-33d3: keyboard only  *(row 7)*
  - **Fix.**
    - Every control is reachable by Tab in reading order: on every card, the card's choices come before the Teacher tab.
    - The focus ring is 3px solid ink (13.4:1 on paper).
    - Enter and Space activate.
    - Escape leaves Try It (in the Maker and the Teacher tab), leaves the Teacher editor back to Play, and closes "Before you share" without exporting.
    - The Teacher tab's preview words are keyboard buttons ("Edit: …"). Enter selects one and moves the cursor into its box.
  - **Acceptance criteria.**
    - `check-a11y` plays `samples/vikings-in-ireland.html` to the end score with real key events only: no mouse and no `element.click()`.
    - Then, by keyboard, it opens the Teacher tab, changes a question, saves a copy that carries the change, and presses Escape.
    - DOM tests for the editor's keyboard selection and Escape.

### TASK-33d5: contrast, computed  *(row 7)*
  - **Fix.**
    - `scripts/check-contrast.ts` reads every text/background colour pair the player and the Maker use out of the source and computes the WCAG ratio.
    - It writes the table into `docs/accessibility/README.md`.
    - It fails under 4.5:1 for body text and 3:1 for large text and UI, and fails if the table is stale.
  - **Acceptance criteria.** Unit tests for the formula against known pairs, and for the thresholds. The gate is in `check:a11y`.

### TASK-33d6: say exactly what was and wasn't checked, with a checked number  *(row 7)*
  - **Fix.**
    - `docs/accessibility/README.md` states the axe version, the pages, the keyboard path, the scan mode and the contrast table.
    - It also states what was NOT done: no screen-reader user test, no VoiceOver or NVDA recording, no testing with disabled pupils.
    - One README line and one write-up line ("Accomplishments") are checked by `check:claims` against `axe-report.json`: the axe version, the pages audited, serious + critical = N, and whether the keyboard-only and scan play-throughs pass. `--fix` inserts or rewrites them.
  - **Acceptance criteria.**
    - Unit tests: a right line passes; a wrong number fails; a line without the disclaimer fails; a line with no report fails; `--fix` inserts and rewrites.
    - Mutants: a tile without its accessible name, the live region turned off, and a scan that never advances are each killed.

## Phase 20 - TASK-35: the teacher swaps joke answers (no model call)

The coordinator's decision after TASK-34: prompt changes levelled off at about 22 joke answers per 100 (`bench/DIAGNOSIS.md`, conclusion). So the teacher gets the control instead, in the Maker, with no model call. The Teacher tab in the file is NOT changed, because the living file has a tight size budget (exporter TASK-35b).

### TASK-35a1: replacement candidates, built from this deck  *(TASK-35 a)*
  - **Fix.** `src/editor/swapCandidates.ts`, `swapCandidates(stack, cardId, elementId)`, gives at most 6 labels.
    - **Sources, in deck order:**
      - every answer label on the deck's OTHER quiz cards (right and wrong);
      - every flash card's term (its first text element).
    - **Filters.** A candidate is never:
      - this card's right answer;
      - already an answer on this card;
      - a suspected joke (`jokeAnswerReason` from `src/shared/lessonCheck.ts`, the existing markers, tried as this wrong answer on this card);
      - empty;
      - longer than `MAX_ANSWER_LABEL` (80 characters, the limit "Type My Own…" also uses).
    - **Comparison.** Labels are compared with `normaliseText`, so case and punctuation are ignored. Repeats are kept once, as first written.
    - **Ranking.**
      - Most related first: the number of words (`foldedWords`, three letters or more) a candidate shares with this card's question and answers.
      - Ties keep deck order, so the list is deterministic. There is no randomness and no model.
  - **Acceptance criteria.**
    - Unit tests for each filter, the ranking, the cap of 6 and determinism.
    - A fast-check property: for any deck and any wrong answer, every candidate passes every filter.

### TASK-35a2: `swapWrongAnswer`, one validated edit  *(TASK-35 a)*
  - **Fix.** `swapWrongAnswer(stack, cardId, elementId, newLabel)` in `src/editor/operations.ts`.
    - **It rejects, in plain words:**
      - a card that is not a quiz;
      - an element that is not an answer on it;
      - the right answer ("That's the right answer. Swap a wrong one.");
      - an empty label;
      - a label over 80 characters;
      - a label already on another answer of this card;
      - the answer's own label.
    - It replaces only that answer's label (trimmed). Its score, sound and goto actions are untouched.
    - It goes through `EditorStore.apply`, the single chokepoint, so it is one undo step and redo works.
  - **Acceptance criteria.**
    - Unit tests for every rejection.
    - The fast-check property from 35a1 goes on: applying any candidate keeps the stack valid, keeps every element's actions identical, changes only that one label, and undo restores the exact stack (redo puts it back).
    - `opSpecArb` gains the op, so the 1,000-run operations property covers it too.

### TASK-35a3: the Swap control in the Maker inspector  *(TASK-35 a)*
  - **Fix.** When a WRONG quiz answer is selected, the inspector shows a "Swap this wrong answer" group.
    - A **Swap** button (`aria-expanded`, `aria-controls`) opens a labelled list of the candidates, each one a button.
    - **Type My Own…** opens a labelled text box (`maxlength` 80) and a **Use This Answer** button.
    - Picking one dispatches `swapWrongAnswer` and closes the list. A rejection shows in the inspector's notice.
    - With no candidates the list says "No other answers in this deck fit here. Type your own." The right answer has no Swap control.
  - **Acceptance criteria.**
    - DOM tests: Swap opens the list; picking a candidate changes only that label; Type My Own… works and rejects a duplicate; undo restores it; the right answer has no Swap control.
    - check:a11y's Maker editor page audits the open Swap list and a joke marker, and still reports 0 serious or critical violations.

### TASK-35a4: suspected joke answers are marked where the teacher sees them  *(TASK-35 a)*
  - **Fix.** The existing lesson-check markers only (`jokeAnswerReason`); there are no new heuristics.
    - **In the Maker canvas,** every wrong answer they flag gets a small tag in the gutter above the tile's top-left: "May be a joke answer". It is a button named "“label” may be a joke answer — swap it", and it selects that tile.
      - It is hidden while that tile is selected, because the inspector shows the note and the drag pill owns the strip.
    - **In the inspector,** the same note, "May be a joke answer — swap it", sits next to the Swap control.
    - Never on the right answer.
    - **Design system:**
      - ink text on paper with an ink hairline, no stamp red;
      - 18px;
      - 44px tall as a target;
      - the ink focus ring.
  - **Acceptance criteria.**
    - DOM tests: a flagged wrong answer shows the tag, and the right answer never does even with a marker word. Clicking the tag selects the tile, and the inspector shows the note.
    - A CSS test: no stamp red in the new rules, and no font size under 18px.

### TASK-35a5: mutants  *(TASK-35 a)*
  - **Fix.** Three entries in `scripts/mutation-check.ts`:
    - the candidate filter lets the right answer through;
    - `swapWrongAnswer` changes the answer's actions;
    - the Swap control bypasses the store's chokepoint (not undoable).
  - **Acceptance criteria.** `npm run check:mutants` kills all of them.

**Pull note (TASK-35 c).** The coordinator changes `.github/workflows/ci.yml` on GitHub (adds check:bench, check:a11y and check:class-results). It is not edited here.

**Gate (TASK-35):**
- `npm test`, `npx tsc --noEmit` and `CI=true npm run pre-submit` exit 0.
- `npm run check:mutants` reports every mutant killed.
- `npm run check:claims:fix` if counts moved.

## Phase 21 - TASK-36: fixes from the round-3 panel on 2a3a29b

Source: `../judge_v2_2026-11-10_app_r3/` (SUMMARY.md; J05_hound.md §4–§6; J03_design.md §3 item 6, "Extra for this round" and fixes 1–9; J04_engineering.md §4.4, §4.12 and §4.13). The player tasks are in `exporter/tasks.md` Phase 10 (TASK-36c2, c5) and the prompt task in `stack-generator/tasks.md` (TASK-36c4). There are no model calls; we have no key.

### TASK-36a1: the write-up's video note is true  *(J05 E5, §5b; SUMMARY P0)*
  - **Bug.** The write-up says "a generated lesson file is now about 185 KB". The living export of the water-cycle fixture is 208,188 B, and live exports are 207–209 KB. It is the hound's only FALSE claim.
  - **Fix.** The hound's §5b replacement for the write-up's first paragraph. It names the 11.7 KB player, the 20–45 s wait, class results not in the video, and that class results, one-switch Scan and "Swap this wrong answer" came after it. The file size is what check:claims measures (decimal KB, rounded), and the counts are what `check:claims:fix` keeps true.
  - **Acceptance criteria.** check:claims passes on the new paragraph. A test finds the "added after the video" sentence.

### TASK-36a2: "about N KB" is checked in decimal KB at ±3 %  *(J05 E5/E46, J04 §4.12; SUMMARY P0)*
  - **Bug.** The rule compared against KiB with ±10 %, so 185 passed against 203.
  - **Fix.** The rule compares against the living export in bytes / 1000 (decimal KB, as a file manager shows it), with ±3 %. `--fix` writes the rounded measured value. The README states no file size, so only the write-up carries the rule.
  - **Acceptance criteria.**
    - A temp-copy test: the real write-up with 185 fails and the measured value passes.
    - The tolerance is 3 % on both sides.
    - The README and the write-up say "±3 %" where they describe it.

### TASK-36b1: the hound's exact replacements  *(J05 §4: E9, E13, E25, E31, E46, E49, E53, E62; R8, R17, R20, R25, R26b)*
  - **Fix.** Each replacement word for word, adjusting only numbers that check:claims owns.
    - R8 (the coordinator's "drop the personal initials" sentence) replaces the README's privacy opener.
    - "Where it sits" changes only by E25 (the AfterStack clause).
  - **Acceptance criteria.**
    - A test finds every replacement sentence in place and the replaced wording gone.
    - The older tests that pinned the replaced README lines (round 6, 7 and 8) follow.

### TASK-36b2: Swap is described where a reader looks  *(J05 §6 P2, §5b row 5)*
  - **Fix.** One sentence in the write-up's Maker bullet and one in the README, saying:
    - what Swap does (offers wrong answers from the same deck, or lets the teacher type her own);
    - that it needs no model call;
    - that it is one undo step.
  - **Acceptance criteria.** A test finds both sentences.

### TASK-36b3: the key-review line names its sample  *(J05 E49 / R26b)*
  - **Fix.** check:claims pins the new wording: "An AI review of N quiz cards from D decks of an earlier bench run (v2) found W wrong keys and A ambiguous ones; the current run's re-recorded decks have C known wrong key(s) (bench/LESSON_CHECKER.md)."
    - N, D, W and A come from `bench/key-review.json`.
    - C is the latest distractor review's wrong-key count over all its decks.
    - `--fix` replaces the old wording.
  - **Acceptance criteria.** Unit tests:
    - the sentence reads back;
    - each wrong number fails, C included;
    - `--fix` replaces the old line;
    - the real README and write-up match the JSONs.

### TASK-36c1: Swap never offers another question's right answer, and prefers the right answer's form  *(J03 Extra: Swap, fixes 5–6)*
  - **Bug.**
    - Swap offered the right answers of Q5 and Q10 as wrong answers on Q3. A pupil may have just learned those as true.
    - It offered noun phrases for a verb-phrase question.
    - The open list was clipped by the toolbar.
  - **Fix.**
    - **No right answers.** A candidate is never ANY quiz card's right answer (case and punctuation ignored).
    - **Form classifier.** `answerForm(label)` is a small, documented classifier:
      - a *number* is digits only;
      - a *verb phrase* starts with a subject pronoun (it, they, he, she, we, you, i), starts with a word in -ing, or starts with a word in -s/-es followed by a particle or object word ("Turns into vapour", "Heats it up");
      - anything else is a *noun phrase*.
    - **Ranking.** Candidates of the same form as this card's right answer rank first, then by shared words, then in deck order.
    - **Scrolling.** Opening the list scrolls it into view (`scrollIntoView({ block: "nearest" })`).
  - **Acceptance criteria.**
    - Unit tests for the classifier and the ranking.
    - The property test adds: no candidate equals any quiz card's right answer.
    - A DOM test checks that the list is scrolled into view on open.
    - A mutant (another card's right answer let through) is killed.

### TASK-36c3: "Before you share" blocks only structural problems  *(J03 Extra, fix 2; J04 §4.13)*
  - **Bug.** On the hero sentence the dialog blocked Export for a flash-then-quiz pair the teacher had asked for, with a garbled message ("Card 4 — What is the name for water vapour turning just asks again…"), and it said "Nothing has been saved yet" although the lesson is kept.
  - **Fix.**
    - **What still opens the dialog:** structural problems. These are the flow problems (a stuck card, an unreachable card, a dead end, unfinished words), two answers with the same words, an answer inside another, a two-answer quiz and a repeated card. Two right answers are already refused by the validator.
    - **What becomes a note:** `restates-flash` and `joke-answer` no longer open it. They are listed as non-blocking notes on the export-done screen, and Export proceeds.
    - **Wording.** Every lesson message names the card with its question in full, in curly quotes, never cut mid-phrase, and reads as one sentence. For example: "Card 4 (“What is the name for water vapour turning back into tiny droplets in the air?”) tests the same word as card 2, which is fine if you meant it as a check."
    - "Nothing has been saved yet" becomes "Not exported yet."
    - The Teacher tab's Save a Copy uses the same split.
  - **Acceptance criteria.**
    - DOM tests with the hero-sentence deck shape: a flash card, then a quiz on the same term, exports without a dialog and shows the note on the done screen.
    - A two-answer quiz still opens the dialog.
    - Each message quotes the full question.
    - A mutant (notes block again) is killed.

### TASK-36c6: keep-warm survives GitHub's 60-day rule, or says it may not  *(J04 §4.4; SUMMARY Product P1)*
  - **Bug.** GitHub disables scheduled workflows in public repositories after 60 days without repository activity, around 9 Jan 2027, inside the judging window.
  - **Fix.**
    - `docs/ops/keepalive.yml`, ready to install (our token cannot push workflow files):
      - monthly cron plus `workflow_dispatch`;
      - `permissions: actions: write`;
      - one `curl` to `PUT /repos/{owner}/{repo}/actions/workflows/keep-warm.yml/enable` with the `GITHUB_TOKEN`;
      - no third-party action and no secrets.
    - The README "Deploy" section says plainly:
      - GitHub disables scheduled workflows in public repos after 60 days without repository activity;
      - we have not been able to verify that the enable call resets that timer;
      - a second pinger runs outside GitHub (our own machine) until results.
  - **Acceptance criteria.** A test checks the file (schedule, dispatch, permissions, the endpoint, no `uses:` and no `secrets.`) and the README sentences.

**Not in this task (J03 fixes 7–9).** The class-results message wording, the start screen and the Maker's "Play this lesson" at 390 px are left for later. The coordinator's TASK-36 list does not include them.

**Gate (TASK-36):**
- `npm test`, `npx tsc --noEmit` and `CI=true npm run pre-submit` exit 0.
- `npm run check:mutants` kills every mutant.
- `npm run check:claims:fix` if counts moved.
- check:a11y reports 0 serious or critical violations.

## Phase 22 - TASK-37: mutation evidence, v8 credits and the video note

### TASK-37a: a logged mutation run backs the mutant count  *(TASK-37 a)*
  - **Why.** The write-up's "N of N killed" was counted from the mutant list, not from a run. Nothing showed that the run happened at this commit.
  - **Fix.**
    - `npm run check:mutants:log` runs the same mutation check (its output still goes to the console). Only if the check exits 0, it writes `docs/mutation-runs/<UTC date>-<short HEAD sha>.log` with:
      - the UTC date-time;
      - the full `git rev-parse HEAD`;
      - whether the working tree was clean;
      - the node version;
      - the sha256 of `scripts/mutation-check.ts`;
      - every KILLED line;
      - the final "mutation-check: N of N mutants killed." line, verbatim.
    - A failed run writes no log.
    - **check:claims.** The write-up's "N of N killed" must equal N from the NEWEST log in `docs/mutation-runs/` (newest by the date-time inside it), and that log's sha256 must equal the current file's. So a changed mutant set forces a fresh run. If either fails, the message ends "re-run npm run check:mutants:log". A missing log fails too.
    - Where the docs state the mutant count (the write-up's Property-based testing row), one short clause points at `docs/mutation-runs/`. The README states no mutant count.
  - **Acceptance criteria.**
    - Temp-dir tests: a stale hash fails, a mismatched N fails, a matching log passes, the newest log wins, and no log fails.
    - A test checks the log format.
    - A mutant (the hash check removed) is killed.
    - A real log exists from a run on this working tree, and it says honestly that the tree was not clean.

### TASK-37b: the credits count the v8 footage  *(TASK-37 b)*
  - **Fix.** In the write-up's Credits and the README's demo-video paragraph, "about 28 s in five sequences, ten shots" becomes "about 24 s in six sequences, eight shots", as our judges counted video v8.
  - **Acceptance criteria.** The test that pinned the old wording checks the new one.

### TASK-37c: the write-up's video note describes v8  *(TASK-37 c)*
  - **Fix.** The paragraph under the video link is rewritten for v8, recorded on the live app at commit 4703964, in two or three sentences.
    - It names what v8 shows:
      - a real generation in real time (13.7 s from Build Cards to the editor in the take; usually 10–20 s);
      - Swap with Undo;
      - one-switch Scan;
      - a pupil's results code on the end card and the teacher's Class Results table (two of the three pupil codes were played by script off camera, as the video says);
      - Save a Copy offline with files of about 212 KB;
      - check:trace and check:claims at that commit.
    - The v7 caveats are dropped.
    - The numbers check:claims owns (traced ids, tests, player KB, file size) stay checked.
    - Line 3 (the video link) is not touched.
  - **Acceptance criteria.** A test finds the new sentences, finds no v7 caveat, and checks that check:claims still reads the paragraph's numbers.
  - **Follow-up (v8b, the final cut).** The credits say "about 23 s" (the final cut's real AI-shot total). The note names the video "v8b": its app takes were recorded on the live app at commit 4703964, and the check:trace and check:claims shown in it ran at commit 8e24ecd. Nothing else in the line changes.

## Phase 23 - TASK-38: judge round 4 text fixes

Source: judge round 4, the hound seat (11 Nov 2026). These are text fixes to `README.md` and `docs/DEVPOST_WRITEUP.md` and the tests that pin them. Nothing under `src/`, `server/`, `mcp/`, `scripts/`, `.github/`, `docs/ops/`, `render.yaml` or `package.json` changes.

### TASK-38a: the hosting text matches render.yaml  *(TASK-38 a)*
  - **Bug.** `render.yaml` says `plan: starter`, a paid instance that does not spin down, and the `keep-warm` workflow is disabled (`disabled_manually` in the GitHub Actions API, checked 11 Nov). The docs still described the live app as a free instance with a slow first load, a keep-warm workflow it needed, and a second pinger.
  - **Fix.**
    - Write-up: the live app is "a paid Render instance, so it stays awake".
    - README "Deploy": the heading names the paid Starter plan (and how to switch to `free`), and the health check "makes no model call".
    - The two README paragraphs "Keep-warm" and "The 60-day rule" become one paragraph: keep-warm is no longer needed, the workflow is disabled, and the two `docs/ops/` files are kept for a free deploy.
  - **Acceptance criteria.** A test finds the new sentences. "free instance; if it has been idle", "up to a minute", "second pinger" and "free web service" are gone from both files.

### TASK-38b: six specs, not five  *(TASK-38 b)*
  - **Bug.** `.kiro/specs/` has six folders, the sixth being `kiro-evidence`, but the docs said five specs.
  - **Fix.** The write-up's Specs and Spec-vs-vibe rows and the README's Specs bullet say six specs: five product features in EARS form plus the small `kiro-evidence` spec for the MCP call record.
  - **Acceptance criteria.** A test checks that `.kiro/specs/` has exactly 6 folders, that the write-up says "Six specs", and that "Five specs", "5 specs" and "for five features" are gone.

### TASK-38c: seven on-screen AI windows, not six sequences  *(TASK-38 c)*
  - **Bug.** The YouTube description of v8b lists seven AI-tagged on-screen windows (0:00–0:02, 0:12–0:15, 0:40–0:41, 1:14–1:20, 1:24–1:28, 1:42–1:44, 2:46–2:49). The credits said "six sequences".
  - **Fix.** "About 23 s in seven on-screen windows, eight shots" in the write-up's Credits and the README's demo-video paragraph.
  - **Acceptance criteria.** A test finds the new wording in both files, and "six sequences" is gone.

### TASK-38d: the category line  *(TASK-38 d)*
  - **Bug.** Neither file named the contest category.
  - **Fix.** Line 3 of each file, under the title and before a blank line: "Category: Resurrection (HyperCard, 1987)".
  - **Acceptance criteria.** A test checks that line 3 of each file is exactly that. The tests that read the write-up by line number follow the inserted line.

### TASK-38e: prior art: OpenMAIC added; AfterStack and NecroCard softened  *(TASK-38 e)*
  - **Bug.**
    - "AfterStack … has no AI and no self-saving copy" claims more than we checked.
    - "another Kiroween 2026 entry (NecroCard)" asserts its entry status.
    - OpenMAIC, an open-source tool that also exports an offline HTML lesson player, was not named.
  - **Fix.**
    - AfterStack: "we found no AI generation or self-saving copy in it".
    - NecroCard: "another project built for Kiroween 2026 (NecroCard, per its own README)".
    - One OpenMAIC sentence in the write-up's "Where it sits" and one bullet in the README's "Prior art".
  - **Acceptance criteria.** A test finds the new sentences, and "has no AI and no self-saving copy" and "another Kiroween 2026 entry (NecroCard)" are gone.

### TASK-38f: the player KB unit is stated  *(TASK-38 f)*
  - **Bug.** The player size is in KiB (1 KB = 1,024 bytes) and lesson files are in decimal KB (TASK-36a2), but neither file said which unit each size used.
  - **Fix.**
    - Write-up: the video note says "(gzipped, 1 KB = 1,024 bytes)", and Accomplishments adds "(1 KB = 1,024 bytes here; lesson-file sizes are decimal KB)".
    - README: the Player bundle line adds "1 KB = 1,024 bytes here".
    - check:claims still reads each number.
  - **Acceptance criteria.** A test finds the unit notes, and check:claims passes.

**Status (11 Nov).** TASK-38a–f are done: the edits are applied, `tests/round10-docs.test.ts` checks them, and the gates pass.

## Phase 24 - TASK-39: judge files and a claim + proof Kiro table

Source: judge round 4 (11 Nov 2026), P1 "JUDGES/EVIDENCE/CLAIMS.md + Kiro table claim+proof", and seat 1-rev's fix "turn each Kiro row into one claim + one proof link; move the caveats to one Limits note". Docs and the docs checker only. Nothing under `src/`, `server/`, `mcp/`, `.github/`, `docs/ops/`, `render.yaml` or `package.json` changes, and `scripts/mutation-check.ts` keeps its 118 mutants. The honesty labels stay in the write-up in short form; the longer explanations move to `EVIDENCE.md`.

### TASK-39a: a 3-minute judging path  *(TASK-39 a)*
  - **Bug.** A judge had to piece the path together from the README, the write-up and the video: where to click, what to look for, and how to check the offline claim.
  - **Fix.** A new `JUDGES.md` at the repo root gives the path in four timed steps (make a lesson, play it with the Wi-Fi off, the file that edits itself and collects class results, how Kiro built it), an optional terminal path, and what the path does not show.
  - **Acceptance criteria.** A test finds the live URL, the sample URL, Build Cards, Export for class, Wi-Fi off and the Network tab, Class Results and Add Codes, Save a Copy, and a link to `EVIDENCE.md#not-proven`.

### TASK-39b: every number with the command that reproduces it  *(TASK-39 b)*
  - **Bug.** The numbers were spread through the README and the write-up, with no single place that said how to reproduce each one or what is not proven.
  - **Fix.** A new `EVIDENCE.md` at the repo root has four sections: "Numbers you can reproduce" (number, meaning, command, file), "Measured once", "Kiro's limits in this build" and "Not proven". The write-up's four long Accomplishments sentences (bench, key review, joke answers, accessibility) are copied in word for word.
  - **Acceptance criteria.** A test finds the four sections and the not-proven labels (no teacher or pupil, AI-reviewed keys, Kiro CLI only). check:claims reads the numbers (TASK-39f).

### TASK-39c: every claim with its status  *(TASK-39 c)*
  - **Bug.** No file listed our public claims with what backs each one and what is missing.
  - **Fix.** A new `CLAIMS.md` at the repo root lists the claims C1–C52 from the README, the write-up and the blog. Each row has a verbatim quote, where it is (file:line or `blog`), a status (TRUE or PARTIAL) and the proof, or "Missing: …" for a PARTIAL row.
  - **Acceptance criteria.** check:claims checks every row (TASK-39g).

### TASK-39d: the write-up's Kiro table is claim + proof  *(TASK-39 d)*
  - **Bug.** The write-up's Kiro rows mixed each claim with long caveats, so they were hard to scan, and the Built-with line repeated the MCP caveat.
  - **Fix.**
    - The Kiro table becomes `| Kiro feature | Claim | Proof |` with nine rows and a link to EVIDENCE.md's Kiro limits.
    - The short labels stay: "not yet recorded firing", "mostly run as a script outside Kiro", "we used no Powers".
    - "Try it in 10 seconds" gains a last bullet linking the three judge files by full GitHub URL.
    - Built with: "Kiro (CLI, specs, steering, hooks, one custom agent and an MCP server; see the Kiro table)".
  - **Acceptance criteria.** A test checks the header, 9 rows, no row longer than 700 characters, the three labels and the three URLs.

### TASK-39e: the README's Built with Kiro is the same kind of table  *(TASK-39 e)*
  - **Bug.** The README's Kiro bullets had the same mix of claim and caveat, and the README did not link the judge files.
  - **Fix.** README line 11 is "**For judges:** …", linking the three files. The Built with Kiro bullets become a `| Kiro feature | Claim | Proof |` table with a link to EVIDENCE.md's Kiro limits.
  - **Acceptance criteria.** A test checks line 11, the header, and that "(not yet recorded firing; run on demand as `/pre-submit`)" is still there.

### TASK-39f: check:claims reads the judge docs and every hook-firings count  *(TASK-39 f)*
  - **Bug.** The new files repeat headline numbers. Without a check they would drift the way the README once did. The "493 hook firings" figure was not checked anywhere.
  - **Fix.**
    - `JUDGES.md`, `EVIDENCE.md` and `CLAIMS.md` must exist.
    - In JUDGES.md and EVIDENCE.md, every one of these phrases must match the measured value: tests, lettered task ids, stack invariants, fast-check properties, round-trip runs, mutants killed, player KB gzipped, lesson-file KB, the floppy count, bench lesson files and hook firings. EVIDENCE.md must carry each phrase; JUDGES.md may omit any of them.
    - EVIDENCE.md must also carry the bench, key-review, joke-answer and accessibility sentences.
    - "N hook firings" is checked against the session recount's "Whole session" total, in the README and the write-up too.
    - `--fix` rewrites drifted numbers in those files and never invents one.
  - **Acceptance criteria.** Unit tests in `tests/claims-docs.test.ts` cover the following: each phrase is read; a drifted number fails; a missing EVIDENCE phrase fails; JUDGES may omit a phrase; the fix logic rewrites a drifted number; and the hook-firings total is read from a sample table.

### TASK-39g: check:claims checks CLAIMS.md  *(TASK-39 g)*
  - **Bug.** A claims table can rot too: a quote edited away in the README, a line number that moved, or a PARTIAL row with nothing marked missing.
  - **Fix.**
    - Each row's ids must be unique, and there must be at least 40 rows.
    - README.md, the write-up and the blog must each be cited at least once.
    - Each status must be TRUE or PARTIAL, and every PARTIAL row must start its last cell with "Missing:".
    - Every `README.md:<n>` or `docs/DEVPOST_WRITEUP.md:<n>` ref must have the quote on line n.
    - `--fix` moves n when the quote is on exactly one other line, and otherwise reports the row.
  - **Acceptance criteria.** Unit tests cover each rule. A quote moved one line fails, and the fix corrects it. A quote that is nowhere fails and is not fixed. A bad status fails. A PARTIAL row without "Missing:" fails.

**Status (11 Nov).** TASK-39a–g are done. `JUDGES.md`, `EVIDENCE.md` and `CLAIMS.md` are at the repo root, and both Kiro tables are claim + proof. check:claims checks the judge files and CLAIMS.md (`tests/claims-docs.test.ts`), `tests/round11-docs.test.ts` checks the wording, and the gates pass.

## Phase 25 - TASK-40: field scan text fixes

Source: the coordinator's field scan of 11 Nov 2026, which read 60+ Kiroween 2026 project pages and new offline-lesson tools outside the contest. Two findings. First, another Kiroween 2026 entry exports a stack as one play-only HTML file, so "Their stacks travel as JSON files or as links back to their tool" is no longer true. Second, several tools outside the contest now export offline single-file lessons, so "a file you can hand on" is no longer ours alone. What no look-alike has is the return trip: the class's results come back as typed codes, with no server. That leads (R1), and "HyperCard's stack you could hand on" (R2) stays as the setup line. This round changes docs and docs tests only. Nothing under `src/`, `server/`, `mcp/`, `.github/`, `docs/ops/`, `render.yaml`, `package.json` or `scripts/mutation-check.ts` changes.

### TASK-40a: the write-up leads with R1  *(TASK-40 a)*
  - **Bug.** The write-up opened with the category and the video. Its first claim, further down, was "a file you can hand on", which other tools now also offer.
  - **Fix.** Line 5 is a new lead paragraph: one sentence becomes a lesson file that plays offline, edits itself, and brings the pupils' results back as typed codes, with no server. HyperCard's hand-on stack is the setup, and the Maker's need for the internet is stated. The video link moves to line 7 and the video note to line 9.
  - **Acceptance criteria.** A test checks lines 3, 5, 7 and 9. Inspiration and What it does are unchanged.

### TASK-40b: the write-up's "Where it sits" for the 2026 field  *(TASK-40 b)*
  - **Bug.** "Their stacks travel as JSON files or as links back to their tool" is false for one entry. The section did not name the new offline single-file lesson tools (Egatari, LessonRemix, Doppel, Syllabind).
  - **Fix.** Four paragraphs:
    - the other Kiroween entries, including the one with a play-only HTML export;
    - offline lesson files are not new, with Egatari, OpenMAIC, LessonRemix, Doppel, Syllabind and Decker as examples;
    - the old Lumi / H5P / quiz-maker / chat-tool paragraph, word for word;
    - what Stackyard puts together, with the typed codes as the part we have not seen.
  - **Acceptance criteria.** A test checks that there are exactly four paragraphs, that the third keeps its old wording, and that "Their stacks travel" and "Some AI lesson tools" are gone.

### TASK-40c: the README top leads with R1  *(TASK-40 c)*
  - **Bug.** README line 5 led with "a file you can hand to a class".
  - **Fix.** Line 5 leads with the same R1 claim as the write-up, keeps "The lesson is the file", and keeps the Maker / offline note. Lines 3, 7, 9 and 11 stay where they are.
  - **Acceptance criteria.** A test checks line 5 word for word, and lines 3, 7, 9 and 11.

### TASK-40d: the README's Why HyperCard and Prior art  *(TASK-40 d)*
  - **Bug.** Why HyperCard and Prior art did not name the play-only HTML export, Egatari or the other single-file tools. "What we haven't found elsewhere" stopped at the self-editing file.
  - **Fix.**
    - Why HyperCard names the play-only export and adds "brings the class's results back without a server".
    - Prior art gains two bullets: Egatari, then LessonRemix, Doppel and Syllabind.
    - "What we haven't found elsewhere" ends with the typed results codes.
  - **Acceptance criteria.** A test finds each new sentence.

### TASK-40e: the blog draft  *(TASK-40 e)*
  - **Bug.** The blog draft's opening made the same "hand-on file" claim and did not mention class results.
  - **Fix.** Two sentences in `BLOG_DRAFT.md` (outside the repo) are replaced, and its "Status 11.11" line says these edits are in the draft but not yet on the live post.
  - **Acceptance criteria.** The blog is not in the repo, so CLAIMS.md marks both new sentences PARTIAL ("in the draft, not yet on the live post"). A test checks those rows.

### TASK-40f: CLAIMS.md follows the new text  *(TASK-40 f)*
  - **Bug.** C9, C10 and C15 quote or cite text that moved or is gone, and the new claims had no rows.
  - **Fix.**
    - C9 and C10 take quotes from the new paragraph 1.
    - C15 cites the README only.
    - New rows from C53 cover the play-only HTML export, Egatari, LessonRemix, Doppel, Syllabind, "the typed codes", the R1 lead and the two blog sentences.
    - `check:claims -- --fix` sets the line numbers.
  - **Acceptance criteria.** check:claims passes, and a test finds rows C53 onward with their statuses.

### TASK-40g: the blog rows C60 and C61 are TRUE  *(TASK-40 g)*
  - **Bug.** C60 and C61 were PARTIAL ("in the draft, not yet on the live post"). The coordinator has since applied both TASK-40e sentences to the live dev.to post through the dev.to API (11 Nov 2026, 14:41 UTC, `edited_at` 2026-11-11T14:41:11Z) and checked both on the live body.
  - **Fix.** In CLAIMS.md, C60 and C61 become TRUE, with the proof "on the live dev.to post since 11 Nov 2026, 14:41 UTC (dev.to API edit, checked by hand)". Nothing else in CLAIMS.md changes. The Status 11.11 line in `BLOG_DRAFT.md` says the two edits were applied to the live post at 14:41 UTC.
  - **Acceptance criteria.** A test checks that both rows are TRUE with the 14:41 UTC proof, and check:claims passes.

**Status (11 Nov).** TASK-40a–f are done. Both files lead with R1, Where it sits names the 2026 field, the README's Why HyperCard and Prior art are updated, the blog draft is edited, and CLAIMS.md has C1–C61. `tests/round12-docs.test.ts` checks the wording, and the gates pass. TASK-40g is done too: the two blog sentences have been on the live post since 14:41 UTC, so C60 and C61 are TRUE.

## Phase 26 - TASK-41: judge round r7 fact fixes

Source: judge round r7, the hound seat (12 Nov 2026). The coordinator checked each finding against git and the code:
- **Steering.** The first commit, `c68ffc7` (30 Oct), added four steering files. `design-system.md` came in `90fa2d8` (31 Oct), after the first code commits but before the player was styled. `pre-submit.md` came in `cd20abf` (6 Nov). So "six steering files … written before any code" is false.
- **Hooks.** Four hooks are `PostFileSave`, one is `PostToolUse` and one is `PostTaskExec` (never fired). "Six hooks run the real checks when Kiro saves the files they watch" overstates it.
- **Class Results.** The table shows counts per question, plus a row of marks per pupil, by initials or "Pupil N". It does not show who got each question right.
- **Joke-answer marker.** Its out-of-sample recall is 0.05, 0.01 and 0.03 (`bench/DIAGNOSIS.md`), so "a suspected joke answer is marked" overstates it.
- **Spec reviews.** KIRO_LOG records review rounds that sent the exporter, Maker and class-results specs back. It records none for the first spec (stack generator), so "we reviewed them like pull requests and sent them back" overstates it.
- **CLI.** The "(built in Kiro)" commit mark starts at TASK-30 (9 Nov). The coordinator, an AI agent working outside Kiro, wrote the briefs, recorded the bench, set up CI, keep-warm and hosting, and edited parts of the write-up. "Built almost all of the code … the few fixes made outside Kiro are logged" is not backed as worded.
- **File size.** About 211 KB is the living file. The play-only class export of the same fixture is 148,880 B.
- **OpenMAIC.** Its README lists the Classroom ZIP as a separate export from the offline HTML, which resolves C15's open question.
- **"Can't get stuck".** "Nothing in them checks that the class can't get stuck" is a negative claim with no source.
- **Blog and social drafts.** "All 176" and "(176 of 176)" are out of date, because the trace count has grown since.

This round changes docs, docs tests and one size test only. Nothing under `src/`, `server/`, `mcp/`, `scripts/`, `.github/`, `docs/ops/`, `render.yaml` or `package.json` changes, and the video, thumbnail and tagline are untouched.

### TASK-41a: steering: four files before any code, not six  *(TASK-41 a)*
  - **Bug.** The write-up's Steering row said all six steering files were "written before any code".
  - **Fix.** The row says the first four (product, tech, stack format, audience) came before any code, the design system the next day before the player was styled, and the pre-submit file on 6 Nov. Its proof cites `c68ffc7`, `90fa2d8` and `cd20abf`.
  - **Acceptance criteria.** A test finds the new sentence and checks git: exactly four steering files were added in the first commit. If git is not available, the test skips. "written before any code. The stack format" is gone.

### TASK-41b: hooks: four on save, one after shell writes, one never fired  *(TASK-41 b)*
  - **Bug.** "Six hooks run the real checks when Kiro saves the files they watch" counted the `PostToolUse` and `PostTaskExec` hooks as save hooks.
  - **Fix.** The Hooks row names four `PostFileSave` hooks, one `PostToolUse` hook and the never-fired `PostTaskExec` gate. "493 hook firings" stays, labelled as our count from the store.
  - **Acceptance criteria.** A test reads the six hook files and finds four `PostFileSave`, one `PostToolUse` and one `PostTaskExec`. The old sentence is gone, and check:claims still reads "493 hook firings".

### TASK-41c: class results: how many per question, a row per pupil by initials or number  *(TASK-41 c)*
  - **Bug.** "Per question, who got it right, wrong or never reached it" described a list of names the table does not show.
  - **Fix.** The write-up says how many got each question right or wrong or never reached it, plus a row of marks per pupil, by initials or Pupil 1, Pupil 2….
  - **Acceptance criteria.** A test finds the new sentence, and "who got it right" is gone.

### TASK-41d: joke-answer marker: say it misses most  *(TASK-41 d)*
  - **Bug.** "(a suspected joke answer is marked)" implied the marker catches joke answers. Out of sample it finds very few.
  - **Fix.** The write-up and the README say "(our check marks a few likely joke answers but misses most, so read every answer)".
  - **Acceptance criteria.** A test finds the new parenthesis in both files, and the old one is gone.

### TASK-41e: spec reviews: which specs went back, and the first one did not  *(TASK-41 e)*
  - **Bug.** "We reviewed them like pull requests and sent them back" implied every spec was sent back.
  - **Fix.** The Spec-vs-vibe row names the three specs that went back (exporter, Maker, class results) and says the first, the stack generator, went straight to code. Its proof cites the KIRO_LOG entries.
  - **Acceptance criteria.** A test finds the new sentence, and "like pull requests and sent them back" is gone.

### TASK-41f: the CLI row: most of the code, and what the coordinator did outside Kiro  *(TASK-41 f)*
  - **Bug.** "Built almost all of the code … The few fixes made outside Kiro are logged" left out the coordinator's work outside Kiro.
  - **Fix.** The CLI row says "most of the code" and names the coordinator's work. Its proof notes that the "(built in Kiro)" mark starts at TASK-30. EVIDENCE.md's Kiro limits section gains a matching bullet.
  - **Acceptance criteria.** A test finds the new row and the new EVIDENCE bullet, and "built almost all of the code" is gone.

### TASK-41g: file size: the living file and the play-only class file, both measured  *(TASK-41 g)*
  - **Bug.** "A generated lesson file is now about 211 KB" did not say that this size is the living file.
  - **Fix.** The write-up adds "with its Teacher tab inside; the play-only class file of the same lesson is 149 KB", and EVIDENCE.md gains a "149 KB" row.
  - **Acceptance criteria.** A test exports the water-cycle fixture with `exportStack` and checks that the "149 KB" in the write-up and EVIDENCE.md is within ±3 % of bytes / 1000. check:claims still reads "about 211 KB".

### TASK-41h: "can't get stuck": no negative claim about other tools  *(TASK-41 h)*
  - **Bug.** "Nothing in them checks that the class can't get stuck" was an unsourced claim about other tools.
  - **Fix.** The write-up says the chat tools' quiz "arrives without an editor inside, or a check that every card leads somewhere, unless you ask for them".
  - **Acceptance criteria.** A test finds the new clause, and the old one is gone.

### TASK-41i: CLAIMS.md re-statuses and new rows  *(TASK-41 i)*
  - **Bug.** Several rows quote replaced wording or have out-of-date statuses (C15, C24, C44, C45), and C60 and C61 had a proof that only said the sentences were live.
  - **Fix.**
    - C15 becomes TRUE, with OpenMAIC's export table as proof.
    - C24 quotes "most of the code" and stays PARTIAL.
    - C44 and C45 quote the new blog sentences and become TRUE.
    - C60 and C61 get proofs that back the content of each sentence.
    - New rows: C62 (the 149 KB file), then C63 onward for the new Steering, Class Results, Hooks, joke-answer and spec-review sentences and the new blog sentence.
  - **Acceptance criteria.** check:claims passes, and a test checks the changed rows.

### TASK-41j: blog and social drafts (outside the repo)  *(TASK-41 j)*
  - **Bug.** The blog and social drafts carry the same overstated sentences, and their trace counts are out of date.
  - **Fix.** The sentences in `BLOG_DRAFT.md` and `SOCIAL_DRAFT.md` follow the repo text. The 176 counts become "176 on 10 Nov; N on 12 Nov", and each draft's Status line says the coordinator applies the edits to the live post.
  - **Acceptance criteria.** The drafts are not in the repo and have no checker. CLAIMS.md C45 quotes the new blog sentence.

**Status (12 Nov).** TASK-41a–j are done:
- The Steering, Hooks, Class Results, joke-answer, spec-review, CLI, file-size and chat-tools sentences follow the checked facts.
- CLAIMS.md has C1–C68.
- The blog and social drafts are edited and carry "206".
- `tests/round13-docs.test.ts` checks it all, and the gates pass.
