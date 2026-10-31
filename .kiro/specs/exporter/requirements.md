# Exporter & Player Runtime — Requirements

## Feature summary

The exporter takes a validated `Stack` document and produces a single, fully
self-contained HTML file. That file contains the player runtime (compiled
TypeScript IIFE), the stack data (embedded JSON), and all image assets (data
URIs). The exported file works offline from a `file://` URL in any browser
released from 2018 onwards. No server, no account, no internet connection is
required to play it.

---

## Requirements

### REQ-EXP-01 — Self-contained output

**When** the Maker exports a stack,  
**the system shall** produce a single HTML file in which every asset —
player runtime JavaScript, card images, fonts, and sounds — is inlined; the
file shall contain no `http://` or `https://` URLs and shall make no network
requests at runtime.

**Acceptance criteria**

- WHEN the exported HTML file is scanned, THEN it contains zero occurrences of
  `http://` or `https://` as attribute values or inside `<script>` or `<style>`
  blocks.
- WHEN the exported HTML file is opened from a `file://` URL with the browser's
  network access blocked, THEN the player loads and renders the first card
  without error.

---

### REQ-EXP-02 — Player runtime size

**While** the player runtime is bundled into the exported file,  
**the system shall** keep the player JavaScript at or below 50 KB after
minification and gzip compression.

**Acceptance criteria**

- WHEN the player IIFE is extracted from the exported file and compressed with
  gzip at default level, THEN its size is ≤ 51,200 bytes (50 KB).

---

### REQ-EXP-03 — Stack JSON embedding and round-trip fidelity

**When** the exporter embeds the stack in the HTML file,  
**the system shall** serialise the full `Stack` document as JSON inside a
`<script id="stack-data" type="application/json">` element so that the file
can be re-imported losslessly.

**Acceptance criteria**

- WHEN the exported HTML file is parsed and the contents of
  `#stack-data` are deserialised, THEN the resulting object is deep-equal to
  the original `Stack` passed to `export()`.
- WHEN a property-based test generates arbitrary valid stacks with fast-check
  and exports each one, THEN every round-trip (Stack → HTML → Stack) passes
  deep equality for at least 1,000 generated examples with no failures.

---

### REQ-EXP-04 — Export rejects invalid stacks

**If** the `Stack` passed to `export()` fails any invariant defined in
`src/shared/validator.ts`,  
**the system shall** throw a typed `ExportValidationError` — constructed from
the `errors` array returned by `validate()` — before producing any output and
shall not write a partial file.

**Acceptance criteria**

- WHEN `export()` is called with a stack that has no `end` card, THEN it throws
  `ExportValidationError` whose `errors` array includes `"end-card-count"`.
- WHEN `export()` is called with a stack containing a `goto` action that
  references a non-existent card ID, THEN it throws `ExportValidationError`
  whose `errors` array includes `"invalid-goto"`.
- WHEN `export()` is called with a stack containing a duplicate element ID,
  THEN it throws `ExportValidationError` whose `errors` array includes
  `"duplicate-id"`.
- WHEN `export()` is called with a fully valid stack, THEN it does not throw
  and returns an HTML string.

---

### REQ-EXP-05 — No secrets in exported output

**When** the exporter produces an HTML file,  
**the system shall** ensure that no API keys, server-side environment variables,
or authentication tokens are present anywhere in the file.

**Acceptance criteria**

- WHEN the exported HTML is inspected, THEN it contains no occurrence of the
  string value of any server-side environment variable whose name contains
  `KEY`, `SECRET`, or `TOKEN` (case-insensitive).
- WHEN a test exports a stack in an environment where `STACKYARD_LLM_API_KEY`
  is set to a known sentinel value, THEN that sentinel value does not appear
  anywhere in the output.

---

### REQ-PLY-01 — Card rendering on scaled canvas

**When** the player displays a card,  
**the system shall** render the card on an 800 × 600 logical canvas scaled
uniformly to fit the device's viewport while preserving the aspect ratio, with
no content clipped.

**Acceptance criteria**

- WHEN the player renders a card on a 1920 × 1080 viewport, THEN all elements
  are visible and the canvas occupies the maximum space without cropping.
- WHEN the player renders a card on a 1024 × 768 viewport, THEN the canvas
  scales proportionally and no element extends beyond the visible area.
- WHEN the player renders a card on a 320 × 480 viewport, THEN the canvas
  scales down and remains fully visible without horizontal scrolling.

---

### REQ-PLY-02 — goto action

**When** a button with a `goto` action is activated,  
**the system shall** navigate to the referenced card immediately and render it
in place of the current card.

**Acceptance criteria**

- WHEN the player processes a `{ type: "goto", cardId: "X" }` action, THEN
  card `X` becomes the active card.
- WHEN the player processes a `goto` whose `cardId` does not match any card in
  the stack, THEN the player displays a non-technical error message to the
  pupil and does not crash.

---

### REQ-PLY-03 — score action

**When** a `score` action fires,  
**the system shall** add `delta` to the running integer score stored in the
runtime variable `score`.

**Acceptance criteria**

- WHEN a `{ type: "score", delta: 1 }` action fires and the current score is
  `n`, THEN the score variable becomes `n + 1`.
- WHEN a `{ type: "score", delta: 0 }` action fires, THEN the score variable
  is unchanged.
- WHEN multiple `score` actions fire across several cards, THEN the final score
  is the sum of all deltas.

---

### REQ-PLY-04 — sound action

**When** a `sound` action fires,  
**the system shall** play the named sound (`cheer` or `buzz`) using the Web
Audio API or an inlined audio data URI; if the browser cannot play audio, the
player shall continue silently without error.

**Acceptance criteria**

- WHEN a `{ type: "sound", sound: "cheer" }` action fires, THEN the cheer
  audio plays once from the start.
- WHEN a `{ type: "sound", sound: "buzz" }` action fires, THEN the buzz audio
  plays once from the start.
- WHEN audio playback is unavailable (e.g., the browser has no audio output),
  THEN no uncaught exception is thrown and the player remains functional.

---

### REQ-PLY-05 — set action

**When** a `set` action fires,  
**the system shall** assign the given value to the named runtime variable,
creating it if it does not already exist.

**Acceptance criteria**

- WHEN a `{ type: "set", variable: "colour", value: "red" }` action fires,
  THEN `runtime.variables["colour"]` equals `"red"`.
- WHEN a `set` action fires for a variable that was previously set, THEN the
  variable's value is overwritten with the new value.

---

### REQ-PLY-06 — field element displays runtime variable

**When** the player renders a `field` element,  
**the system shall** display the current value of the named runtime variable;
if the variable is not yet set, the field shall display an empty string.

**Acceptance criteria**

- WHEN a `field` element with `variable: "score"` is rendered and the score is
  `7`, THEN the element displays `"7"`.
- WHEN a `field` element references a variable that has not been set, THEN the
  element displays an empty string.
- WHEN the runtime variable changes (e.g., after a `score` action), THEN the
  `field` element updates to reflect the new value on the next card render.

---

### REQ-PLY-07 — End card shows final score

**When** the player navigates to the `end` card,  
**the system shall** display the final value of the `score` variable.

**Acceptance criteria**

- WHEN the player reaches the `end` card after answering all quiz questions,
  THEN the displayed score equals the total number of correct answers.
- WHEN the player reaches the `end` card with a score of zero, THEN `0` is
  displayed (not blank).

---

### REQ-PLY-08 — Browser compatibility

**While** the player runtime is executing,  
**the system shall** function correctly in the following browsers without
polyfills loaded from a network: Chrome 70+, Firefox 63+, Safari 12+,
Edge 18+.

**Acceptance criteria**

- WHEN the TypeScript compiler target is set, THEN it is `ES2018` or lower.
- WHEN the exported HTML is validated, THEN it contains no ES2020+ syntax
  (optional chaining, nullish coalescing, `BigInt`, etc.) in the inlined
  player script.

---

### REQ-PLY-09 — card-level auto-advance action

**When** a card has an `actions` array at the card level containing a `goto`
action,  
**the system shall** fire those actions automatically when the card is rendered,
without requiring any button press.

**Acceptance criteria**

- WHEN a card's `actions` array contains `{ type: "goto", cardId: "X" }` and
  the card is displayed, THEN the player navigates to card `X` after processing
  the action (enabling timed or automatic flows).
- WHEN a card's top-level `actions` array is empty, THEN no automatic
  navigation occurs.

---

### REQ-EXP-06 — No cycle in the card-level goto graph

**If** the card-level `actions` arrays of a stack form a cycle in the directed
graph of automatic navigations,  
**the system shall** reject the stack at export time by throwing
`ExportValidationError` whose `errors` array includes `"goto-cycle"`.

This is invariant 9 of `src/shared/validator.ts`.

**Acceptance criteria**

- WHEN `export()` is called with two cards whose card-level `actions` each
  contain a `goto` pointing to the other (A → B → A), THEN it throws
  `ExportValidationError` with `"goto-cycle"` in `errors`.
- WHEN `export()` is called with a chain of three cards where card C's
  card-level `actions` point back to card A, THEN it throws
  `ExportValidationError` with `"goto-cycle"` in `errors`.
- WHEN `export()` is called with a stack where no card-level `actions`
  contain a `goto`, THEN it does not throw for this invariant.
- WHEN `export()` is called with card-level `goto` actions that form a
  directed acyclic graph (e.g., A → B → end), THEN it does not throw for
  this invariant.
- WHEN a property-based test generates stacks with randomly constructed
  card-level goto graphs, THEN the validator correctly accepts all acyclic
  graphs and rejects all cyclic ones.

---

### REQ-PLY-10 — Runtime guard against infinite auto-advance loops

**While** the player is processing automatic card-level `goto` actions,  
**the system shall** stop and display a friendly error if more than 20
consecutive automatic navigations occur without a user interaction.

**Acceptance criteria**

- WHEN the player executes 20 consecutive automatic navigations without any
  button press, THEN on the 21st automatic navigation it stops, clears the
  canvas, and displays: `"Something went wrong. Please ask your teacher to
  check the file."`
- WHEN the player executes fewer than 20 consecutive automatic navigations
  and then the pupil presses a button, THEN the counter resets and normal
  play continues.
- WHEN the player executes a sequence of user-initiated navigations of any
  length, THEN the guard does not trigger.

---

### REQ-EXP-07 — inlineImages path security

**When** the exporter processes image elements,  
**the system shall** only resolve relative paths that stay within a designated
assets directory; it shall reject absolute paths, paths that escape the assets
directory via `..`, and symlinks that resolve outside the directory.

**Acceptance criteria**

- WHEN an image element's `src` is already a data URI (`data:` scheme), THEN
  `inlineImages` leaves it unchanged without touching the filesystem.
- WHEN an image element's `src` is a relative path that resolves within the
  assets directory, THEN `inlineImages` reads the file and replaces `src`
  with the corresponding base64 data URI.
- WHEN an image element's `src` contains `..` that would escape the assets
  directory (e.g., `../../etc/passwd`), THEN `inlineImages` throws
  `ExportValidationError` with `"path-traversal"` in `errors` and does not
  read from that path.
- WHEN an image element's `src` is an absolute path (starts with `/`), THEN
  `inlineImages` throws `ExportValidationError` with `"path-traversal"` in
  `errors`.
- WHEN an image element's `src` resolves to a symlink whose real path lies
  outside the assets directory, THEN `inlineImages` throws
  `ExportValidationError` with `"path-traversal"` in `errors`.
- WHEN the `src` is a relative path to a file that does not exist inside the
  assets directory, THEN `inlineImages` rejects with a descriptive error and
  does not produce partial output.

---

### REQ-EXP-08 — URL-escaping round-trip for embedded stack JSON

**When** the exporter embeds the stack JSON in the HTML file,  
**the system shall** escape every raw `https://` and `http://` URL that
appears in any string field of the stack so that the exported file contains
no bare URL schemes, while the stack data still round-trips back to the
original text exactly after JSON parsing.

**Acceptance criteria**

- WHEN a stack whose card text contains `"https://example.com"` is exported,
  THEN the resulting HTML string contains no raw occurrence of `"https://"`.
- WHEN the `#stack-data` JSON from that exported file is parsed, THEN the
  card text value is exactly `"https://example.com"` (the original string,
  restored by JSON parsing).
- WHEN the same test is run for a URL containing `"http://"`, THEN the same
  two criteria hold.
