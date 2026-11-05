# Maker App — Requirements

## Feature summary

The Maker app is the web app the teacher uses. It is the middle of the
Stackyard flow — the bit between generating a stack and exporting the one
offline file:

> sentence → **working stack → edit** → one offline file → class plays it.

The teacher types one sentence, the app calls `POST /api/generate`
(the existing stack generator), and the returned stack opens in an editor: a
list of cards down the side and the selected card in the middle, drawn with the
**same renderer the player uses** so what the teacher sees is what the class
gets. The teacher edits cards the HyperCard way — no code — then plays the
stack inside the app and exports it to a single self-contained HTML file via
`POST /api/export` (a new route that calls the existing exporter).

Stacks live only in the browser (`localStorage`). There are no accounts and no
cloud save — both are out of scope (product.md).

This spec **reuses** and does not re-specify:

- `src/shared/types.ts` — `Stack`, `Card`, `Element`, `Action`, `GenerateRequest`,
  response shapes (canonical).
- `src/shared/validator.ts` — `validate(unknown): ValidationResult`, all nine
  invariants.
- `src/player/renderer.ts` — `renderCard(...)`, the same renderer the exported
  player uses.
- `server/routes/generate.ts` — `handleGenerate`, the existing `POST /api/generate`.
- `server/exporter.ts` — `exportStack(stack): Promise<string>` and
  `ExportValidationError`.

All user-facing text in this feature follows `audience.md` (Irish/UK English,
"card" not "component", "set of cards" not "stack" in UI labels, "pupils" not
"students", plain-language errors). All UI follows `design-system.md`
(stamp-pad look, 18 px floor, shaped tiles, 44 px targets, focus ring,
`prefers-reduced-motion`).

---

## Requirements

### REQ-MKR-01 — Generate a stack from a sentence

**As a** teacher,
**I want to** type one sentence describing what I want and press a button,
**so that** a ready-to-edit set of cards opens without me writing anything.

#### Acceptance criteria

- WHEN the teacher submits a non-empty sentence from the start screen,
  THE SYSTEM SHALL send it as `{ prompt }` to `POST /api/generate` and show a
  waiting state until the response arrives.

- WHEN `POST /api/generate` returns `{ ok: true, stack, isFallback }`,
  THE SYSTEM SHALL load `stack` into the editor and select the first card.

- WHEN the response has `isFallback === true`,
  THE SYSTEM SHALL show a brief plain-language notice that the set of cards was
  built offline and may need a few edits, then open the editor normally.

- WHEN `POST /api/generate` returns `{ ok: false, message }` or the request
  fails,
  THE SYSTEM SHALL show the plain-language `message` (or a generic
  plain-language message on a network failure) and SHALL stay on the start
  screen so the teacher can try again.

- WHEN the teacher submits an empty or whitespace-only sentence,
  THE SYSTEM SHALL disable submission and SHALL NOT call the API.

---

### REQ-MKR-02 — Editor layout: card list and canvas

**As a** teacher,
**I want** a list of my cards down the side and the selected card shown in the
middle,
**so that** I can see the whole set and work on one card at a time.

#### Acceptance criteria

- WHEN a stack is loaded,
  THE SYSTEM SHALL display every card as an entry in a card list, in stack
  order, each entry showing its position ("Card 3 of 10") and kind.

- WHEN the teacher selects a card in the list,
  THE SYSTEM SHALL render that card in the centre canvas using
  `renderCard(...)` from `src/player/renderer.ts` — the same renderer the
  exported player uses.

- WHEN a card is shown in the canvas,
  THE SYSTEM SHALL render it on the 800 × 600 logical canvas scaled to fit the
  editor's canvas area, preserving aspect ratio, with no element clipped.

- WHILE the editor is open,
  THE SYSTEM SHALL keep exactly one card selected at all times.

---

### REQ-MKR-03 — Edit text content

**As a** teacher,
**I want to** change the words on a card,
**so that** the questions and text say exactly what I want.

#### Acceptance criteria

- WHEN the teacher activates a `text` element on the selected card,
  THE SYSTEM SHALL let them edit its `content` and SHALL update the canvas to
  show the new text.

- WHEN the teacher activates a `button` element,
  THE SYSTEM SHALL let them edit its `label`.

- WHEN the teacher finishes an edit,
  THE SYSTEM SHALL write the change into the in-memory stack as a single
  undoable edit.

- WHEN an edit would leave a text field blank where the schema needs content
  (e.g. a button with an empty label),
  THE SYSTEM SHALL keep the stack valid by rejecting the empty value with a
  plain-language message, not by writing an invalid stack.

---

### REQ-MKR-04 — Answer tiles and marking the right answer

**As a** teacher,
**I want to** edit the answer tiles on a quiz card and mark which one is right,
**so that** the correct answer scores a point and plays the cheer.

#### Acceptance criteria

- WHEN the selected card is a `quiz` card,
  THE SYSTEM SHALL display its answer buttons as the four shaped tiles
  (▲ coral, ◆ sun, ● teal, ■ navy) exactly as `design-system.md` specifies,
  each showing both its shape and its colour.

- WHEN the teacher marks a tile as the correct answer,
  THE SYSTEM SHALL set that button's actions to include
  `{ type: "score", delta: 1 }` and `{ type: "sound", sound: "cheer" }`, and
  SHALL set every other answer button on that card to `delta: 0` with
  `{ type: "sound", sound: "buzz" }`, so the card keeps exactly one correct
  answer (invariant 4).

- WHEN the teacher marks a different tile as correct,
  THE SYSTEM SHALL move the correct marking so that still exactly one answer
  button carries `{ type: "score", delta: 1 }`.

- WHEN the teacher views a quiz card,
  THE SYSTEM SHALL clearly indicate which tile is currently marked correct
  using a means that is not colour alone (e.g. a label or icon), per the
  accessibility rules.

---

### REQ-MKR-05 — Add, remove, and reorder cards

**As a** teacher,
**I want to** add new cards, delete cards I don't need, and change their order,
**so that** the set of cards matches my lesson.

#### Acceptance criteria

- WHEN the teacher adds a card,
  THE SYSTEM SHALL insert a new valid card of a chosen kind at a chosen
  position and SHALL select it.

- WHEN the teacher removes a card,
  THE SYSTEM SHALL delete it, SHALL repair or clear any `goto` action that
  pointed at it so no `goto` targets a missing card (invariant 2), and SHALL
  select an adjacent card.

- IF removing a card would leave the stack with no `end` card, or with no
  non-end card,
  THEN THE SYSTEM SHALL prevent the removal and SHALL show a plain-language
  message explaining why (invariants 3 and 7).

- WHEN the teacher reorders cards,
  THE SYSTEM SHALL change their position in `stack.cards` without changing any
  card's `id`, so existing `goto` targets by id still resolve.

- WHEN any add, remove, or reorder completes,
  THE SYSTEM SHALL have produced a stack that passes `validate()`.

---

### REQ-MKR-06 — Change a card's kind

**As a** teacher,
**I want to** change a card from one kind to another (quiz, flash, story, end),
**so that** I can turn, say, a quiz into a story without starting over.

#### Acceptance criteria

- WHEN the teacher changes a card's `kind`,
  THE SYSTEM SHALL update `card.kind` and SHALL adjust the card's elements and
  actions so the result still passes `validate()` (e.g. giving a new `quiz`
  card exactly one correct answer button).

- IF changing a card to `kind === "end"` would create a second end card,
  THEN THE SYSTEM SHALL prevent the change and SHALL show a plain-language
  message (invariant 3).

- IF changing the only `end` card to another kind would leave no end card,
  THEN THE SYSTEM SHALL prevent the change and SHALL show a plain-language
  message (invariant 3).

---

### REQ-MKR-07 — Wire story buttons: "on click go to card N"

**As a** teacher,
**I want to** make a button on a story card send the pupil to another card,
**so that** I can build simple branching without writing code.

#### Acceptance criteria

- WHEN the teacher sets a story button's destination to another card,
  THE SYSTEM SHALL set that button's actions to include
  `{ type: "goto", cardId }` where `cardId` is the chosen card's id.

- WHEN the teacher chooses a destination,
  THE SYSTEM SHALL offer only cards that exist in the current stack, named in
  plain language ("Card 4", or the card's own text), never a raw id.

- WHEN a destination card is later removed or reordered,
  THE SYSTEM SHALL keep every button `goto` pointing at a card that still
  exists (repairing or clearing it on removal), so the stack stays valid
  (invariant 2).

---

### REQ-MKR-08 — Drag a button within a card

**As a** teacher,
**I want to** drag a button to a new spot on the card,
**so that** the card looks the way I want.

#### Acceptance criteria

- WHEN the teacher drags a button element on the canvas,
  THE SYSTEM SHALL update that element's `x` and `y` and SHALL keep its
  bounding box within the canvas so `x + w ≤ 800` and `y + h ≤ 600`
  (invariant 5).

- WHEN a drag would move an element past a canvas edge,
  THE SYSTEM SHALL clamp the position so the element stays fully on the canvas.

- WHEN a drag completes,
  THE SYSTEM SHALL record the move as a single undoable edit.

- WHEN the teacher has no pointer (keyboard only),
  THE SYSTEM SHALL provide a keyboard means to move the selected element (e.g.
  arrow keys nudge `x`/`y`), subject to the same clamping.

- WHEN the teacher makes a burst of keyboard nudges on the same element with no
  other edit in between and gaps under 600 ms,
  THE SYSTEM SHALL coalesce the whole burst into a single undoable edit, so one
  undo returns the element to its position before the burst began.

- WHEN a nudge on the element follows a gap of 600 ms or more, or any other
  edit intervenes,
  THE SYSTEM SHALL start a new undoable edit for the next nudge.

---

### REQ-MKR-09 — Every edit keeps the stack valid (never a dead export)

**As a** teacher,
**I want** my set of cards to stay exportable no matter what I edit,
**so that** the Export button always produces a file that works.

#### Acceptance criteria

- WHEN any edit operation completes,
  THE SYSTEM SHALL run `validate()` from `src/shared/validator.ts` on the
  resulting stack.

- IF an edit would make the stack fail any invariant,
  THEN THE SYSTEM SHALL either repair it automatically (e.g. re-point a `goto`
  on card removal) or reject the edit with a plain-language message, and SHALL
  NOT leave the in-memory stack in an invalid state.

- WHILE the current stack is valid,
  THE SYSTEM SHALL keep the Export action enabled.

- WHILE the current stack is invalid for any reason the editor could not
  repair,
  THE SYSTEM SHALL disable the Export action and SHALL show a plain-language
  summary of what needs fixing (never a raw error code or stack trace).

- FOR ANY sequence of editor operations starting from a valid stack,
  THE SYSTEM SHALL end in a state that passes `validate()` (verified by a
  property-based test).

---

### REQ-MKR-10 — Undo and redo

**As a** teacher,
**I want to** undo a change I didn't mean to make, and redo it if I change my
mind,
**so that** I can experiment without fear.

#### Acceptance criteria

- WHEN the teacher undoes,
  THE SYSTEM SHALL restore the stack to exactly the state it had before the
  most recent edit.

- WHEN the teacher redoes after an undo,
  THE SYSTEM SHALL re-apply the edit that was undone.

- WHEN the teacher makes a new edit after undoing,
  THE SYSTEM SHALL discard the redo history beyond that point.

- WHEN there is nothing to undo or redo,
  THE SYSTEM SHALL disable the corresponding action.

- FOR ANY single edit applied to a valid stack, THEN undo immediately
  afterwards,
  THE SYSTEM SHALL produce a stack deep-equal to the stack before that edit
  (verified by a property-based test).

- WHEN the teacher undoes after a coalesced burst of keyboard nudges
  (REQ-MKR-08),
  THE SYSTEM SHALL treat the whole burst as one edit and restore the element to
  its position before the burst began, in a single undo.

---

### REQ-MKR-11 — Play mode inside the app

**As a** teacher,
**I want to** play my set of cards inside the app before I export,
**so that** I can check it works the way the class will see it.

#### Acceptance criteria

- WHEN the teacher starts Play mode,
  THE SYSTEM SHALL run the current stack through the shared
  `mountPlayer(stack, root)` function in `src/player/` — the exact same function
  the exported player entry calls — so Play mode behaviour is literally the code
  the class gets.

- WHILE in Play mode,
  THE SYSTEM SHALL hide all editing controls and SHALL show only the cards,
  exactly as a pupil would see them.

- WHEN the teacher answers questions and reaches the `end` card in Play mode,
  THE SYSTEM SHALL show the final score computed from the `score` actions.

- WHEN the teacher exits Play mode,
  THE SYSTEM SHALL return to the editor with the same stack and selection, with
  no change written to the stack by playing it.

---

### REQ-MKR-12 — Export to one offline file

**As a** teacher,
**I want to** press Export and get a single file I can open on any laptop,
**so that** the class can play it offline with no internet.

#### Acceptance criteria

- WHEN the teacher presses Export and the current stack is valid,
  THE SYSTEM SHALL send the stack to `POST /api/export` and SHALL download the
  returned HTML as a single file whose name is derived from the stack title,
  reduced to safe characters only (letters, digits, hyphens) with a `.html`
  suffix, falling back to a default name when the title has no safe characters.

- WHEN `POST /api/export` returns the HTML,
  THE SYSTEM SHALL trigger a browser download of exactly those bytes and SHALL
  NOT alter them.

- IF `POST /api/export` returns a validation error,
  THEN THE SYSTEM SHALL show a plain-language message describing what needs
  fixing and SHALL NOT download a file.

- WHEN the export request fails (network error),
  THE SYSTEM SHALL show a plain-language message and SHALL leave the editor
  unchanged.

- FOR ANY valid stack produced by any sequence of edits, THEN export, THEN
  re-reading the embedded stack JSON from the downloaded HTML,
  THE SYSTEM SHALL yield a stack deep-equal to the edited stack (round-trip,
  verified by a property-based test against the exporter).

---

### REQ-MKR-13 — Export route (`POST /api/export`)

**As a** product owner,
**I want** the export to run through the existing server exporter,
**so that** the Maker never bundles the player or reads secrets in the browser.

#### Acceptance criteria

- WHEN `POST /api/export` receives a request body containing a stack,
  THE SYSTEM SHALL call `exportStack(stack)` from `server/exporter.ts` and
  SHALL respond `200` with the HTML string verbatim, `Content-Type:
  text/html; charset=utf-8`, and a `Content-Disposition: attachment` header
  whose `filename` is derived from the stack title using safe characters only
  (letters, digits, hyphens) with a `.html` suffix.

- WHEN `exportStack` throws `ExportValidationError`,
  THE SYSTEM SHALL respond with a 422 **JSON** body
  `{ ok: false, message }` — a plain-language message built from
  `error.errors` — and SHALL NOT return partial HTML.

- WHEN the request body is missing or is not a valid stack shape,
  THE SYSTEM SHALL respond with a 400 **JSON** body and a plain-language
  message.

- WHEN the route produces any response,
  THE SYSTEM SHALL NOT include any API key, server environment variable, or
  stack trace in the body (consistent with the generate route).

---

### REQ-MKR-14 — Stacks persist in the browser only

**As a** teacher,
**I want** my set of cards to still be there if I reload the page,
**so that** I don't lose work — without needing an account.

#### Acceptance criteria

- WHEN the stack changes (any edit, or a new generation),
  THE SYSTEM SHALL save the current stack to `localStorage`.

- WHEN the app loads and a saved stack exists in `localStorage`,
  THE SYSTEM SHALL offer to reopen it (or reopen it directly) instead of
  forcing the teacher back to the start screen.

- WHEN a saved stack in `localStorage` fails `validate()` (e.g. a format change
  since it was saved),
  THE SYSTEM SHALL discard it safely and SHALL return to the start screen with
  a plain-language notice, not an error.

- WHEN the teacher starts a new set of cards,
  THE SYSTEM SHALL replace the saved stack only after the new one is generated,
  so a failed generation does not destroy existing work.

- THE SYSTEM SHALL NOT send any stack to a server for storage, and SHALL NOT
  create any account or cloud copy (out of scope per product.md).

---

### REQ-MKR-15 — Accessibility

**As a** teacher using a keyboard, a screen reader, or an old projector,
**I want** every action reachable and every element legible,
**so that** I and my pupils can use Stackyard regardless of device.

#### Acceptance criteria

- WHEN the editor renders any interactive control (card list entry, tile,
  toolbar button, element handle),
  THE SYSTEM SHALL make it reachable and operable by keyboard alone, with a
  logical focus order.

- WHEN any interactive element receives focus,
  THE SYSTEM SHALL show the standard focus ring (3 px solid `--color-ink`,
  offset 2 px) per `design-system.md`.

- THE SYSTEM SHALL render no text smaller than 18 px anywhere in the editor
  chrome or on the card canvas.

- THE SYSTEM SHALL show every answer tile with both its shape icon and its
  colour, so meaning never depends on colour alone.

- WHEN an edit succeeds, fails, or is undone,
  THE SYSTEM SHALL announce the outcome to assistive technology via an
  `aria-live="polite"` region, in plain language.

- WHEN any interactive element is a touch or click target,
  THE SYSTEM SHALL make it at least 44 × 44 px.

- WHEN motion would play (card advance, stamp, shake in Play mode),
  THE SYSTEM SHALL respect `prefers-reduced-motion: reduce` per
  `design-system.md`.

---

### REQ-MKR-17 — Toolbar tools: add text, button, picture; link a card

**As a** teacher,
**I want** the four toolbar tools (Add Text, Add Button, Add Picture, Link a
Card) to really add things to the selected card,
**so that** I can build on what Stackyard made instead of seeing a button that
does nothing.

#### Acceptance criteria

- WHEN the teacher presses Add Text,
  THE SYSTEM SHALL add a new `text` element to the selected card through the
  store's apply chokepoint, placed within the 800 × 600 canvas (invariant 5),
  and SHALL select it for editing.

- WHEN the teacher presses Add Button,
  THE SYSTEM SHALL add a new `button` element with a default label and no
  actions to the selected card through the apply chokepoint, placed within the
  canvas, and SHALL select it. A plain button carries no `score` action, so
  adding one to a `quiz` card SHALL NOT disturb invariant 4.

- WHEN the teacher presses Add Picture and chooses a picture file from this
  computer,
  THE SYSTEM SHALL read the file as a `data:` URI (so the exported file stays
  self-contained and offline, tech.md), SHALL require a non-empty alt-text
  description (design-system.md accessibility), and SHALL add an `image`
  element through the apply chokepoint.

- IF the chosen picture is not a readable image, has no alt text, or is larger
  than the picture size cap,
  THEN THE SYSTEM SHALL reject the add with a plain-language message and SHALL
  change nothing.

- WHEN the teacher presses Link a Card with a `button` selected and chooses a
  destination card,
  THE SYSTEM SHALL set that button's `goto` to the chosen card through the
  apply chokepoint, offering only cards that exist, named in plain language
  (never a raw id), keeping invariant 2.

- IF the teacher presses Link a Card with no button selected,
  THEN THE SYSTEM SHALL show a plain-language message asking them to pick a
  button first, and SHALL change nothing.

- WHEN any of the four tools completes,
  THE SYSTEM SHALL have produced a stack that passes `validate()` (the tools
  go through the same apply chokepoint as the other nine operations, so this
  holds by construction and is covered by the edit-sequence property tests
  P1–P3).

---

### REQ-MKR-16 — Audience-rule plain language throughout

**As a** teacher,
**I want** every label and message to read clearly,
**so that** I never see jargon or a raw error.

#### Acceptance criteria

- WHEN the editor shows any label, button, or message,
  THE SYSTEM SHALL follow `audience.md`: Title Case for buttons, sentence case
  for other labels, Irish/UK English spelling, "card"/"set of cards" wording,
  "pupils" not "students".

- WHEN anything goes wrong,
  THE SYSTEM SHALL show one sentence saying what happened and one saying what
  to do next, and SHALL NEVER show a stack trace, raw error code, or the word
  "stack".

---

### REQ-MKR-18 — A quiz plays through card by card

**As a** teacher,
**I want** every quiz answer to move the class on to the next card,
**so that** the whole set is played and the last card shows the real score.

#### Acceptance criteria

- WHEN a stack is built (the demo deck, the LLM generator's output, or the
  offline fallback),
  THE SYSTEM SHALL point every quiz answer's "go to" at the next card in play
  order, and only the last quiz before the last card SHALL target the last card.

- WHEN the class answers a quiz — right or wrong —
  THE SYSTEM SHALL advance to the next card (never jump straight to the last
  card), so a full play-through visits every card in order and the last card
  shows the running score.

- THE SYSTEM SHALL leave non-answer buttons (story branches, a "Start" button,
  a "Next card" button, a "Play again" button) with their own "go to" targets.

---

## Out of scope for this feature

- User accounts, sign-up, cloud save or sync (product.md).
- Collaborative or multi-user editing.
- Analytics or tracking.
- Generating card content locally in the browser (generation stays server-side
  via `POST /api/generate`).
- Bundling the player runtime in the browser (export stays server-side via
  `POST /api/export` → `exportStack`).
- Image upload/management beyond what the stack schema already carries (data
  URIs / relative paths handled by the exporter's `inlineImages`).
- Re-specifying the types, validator, renderer, generate route, or exporter —
  all reused as-is.
