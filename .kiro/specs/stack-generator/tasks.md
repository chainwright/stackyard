# Stack Generator — Implementation Tasks

Tasks are ordered so that each one can be built and verified before the next begins. No task writes code that depends on a module that hasn't been defined yet.

---

## Phase 1 — Shared types and validator

### Task 1 — [x] Define shared TypeScript types
**Refs:** REQ-2, design §Module boundaries

- Create `src/shared/types.ts`.
- Export `Stack`, `Theme`, `Card`, `Element`, `TextElement`, `ButtonElement`, `ImageElement`, `FieldElement`, `Action` exactly as specified in `stack-format.md`.
- Export `ValidationResult`:
  ```ts
  type ValidationResult =
    | { valid: true; stack: Stack }
    | { valid: false; errors: string[] };
  ```
- Export `GenerateRequest` and the `GenerateSuccess` / `GenerateError` response shapes from the design.
- No runtime logic in this file — types only.

---

### Task 2 — [x] Implement the shared validator
**Refs:** REQ-2, design §Validator

- Create `src/shared/validator.ts`.
- Export `validate(input: unknown): ValidationResult`.
- Implement all eight invariant checks in order; collect all failures before returning.
- Use the error message keys from the design's validator table (`duplicate-id`, `invalid-goto`, `end-card-count`, `quiz-answer`, `canvas-bounds`, `blank-title`, `no-content-cards`, `invalid-id`).
- Do not throw; always return a `ValidationResult`.
- TypeScript strict mode; no `any`.

---

### Task 3 — [x] Property-based tests for all eight invariants
**Refs:** REQ-2, design §Validator, tech.md §Testing

Write `tests/validator.property.test.ts` using Vitest and fast-check. One `it` block per invariant. Each test must:

1. **`duplicate-id`** — Generate a valid stack, then duplicate one id. Assert `valid === false` and errors includes `duplicate-id`.
2. **`invalid-goto`** — Generate a valid stack, then change a `goto` action's `cardId` to a random UUID not in the stack. Assert `invalid-goto`.
3. **`end-card-count`** — Generate stacks with zero end cards and stacks with two or more end cards. Assert `end-card-count` in both cases. Generate a stack with exactly one end card; assert `valid === true`.
4. **`quiz-answer`** — Generate a quiz card with no correct button and assert `quiz-answer`. Generate a quiz card with two correct buttons and assert `quiz-answer`.
5. **`canvas-bounds`** — Generate an element where `x + w > 800` or `y + h > 600`. Assert `canvas-bounds`.
6. **`blank-title`** — Generate a stack with an empty or whitespace-only title. Assert `blank-title`.
7. **`no-content-cards`** — Generate a stack with only an end card. Assert `no-content-cards`.
8. **`invalid-id`** — Generate a stack with one id replaced by a non-UUID string. Assert `invalid-id`. Generate a stack whose ids are all valid UUID v4 strings; assert `valid === true`.

Each test must also assert that a conforming stack (all invariants satisfied) returns `valid === true`.

---

## Phase 2 — Server modules (no LLM call yet)

### Task 4 — [x] Implement the prompt builder
**Refs:** REQ-1, REQ-6, design §Prompt design

- Create `server/promptBuilder.ts`.
- Export `build(request: GenerateRequest): { system: string; user: string }`.
- Export `buildRetry(request: GenerateRequest, errors: string[]): { system: string; user: string }`.
- System prompt must include: output format instruction, compact Stack schema summary, all eight invariants as numbered rules, and the audience writing rules (short sentences, active voice, Irish/UK English, age-appropriate, "pupils" not "students").
- Clamp any detected card count to a maximum of 20 in the user message.
- Unit test in `tests/promptBuilder.test.ts`: assert the system prompt contains the invariant rules and audience rules; assert the retry message includes the supplied error strings.

---

### Task 5 — [x] Implement the fallback stack builder
**Refs:** REQ-4, design §Fallback stack

- Create `server/fallback.ts`.
- Export `build(request: GenerateRequest): Stack`.
- Produce a three-card stack (intro story → placeholder quiz → end) as described in the design.
- Derive the title from the prompt (trim, cap at 120 characters).
- Generate all IDs deterministically from the prompt string (e.g. using a hash-seeded approach) so the same prompt always returns the same stack.
- Unit test in `tests/fallback.test.ts`:
  - Assert the returned stack passes `validate()` (all eight invariants).
  - Assert the same prompt returns the same stack on repeated calls (determinism).
  - Assert a different prompt returns a different stack.

---

## Phase 3 — LLM gateway

### Task 6 — [x] Implement the LLM gateway
**Refs:** REQ-5, design §LLM call contract

- Create `server/llmGateway.ts`.
- Export `call(messages: { system: string; user: string }): Promise<string>`.
- Read the API key from `process.env.STACKYARD_LLM_API_KEY` only. Throw a `ConfigurationError` at call time if the variable is absent or empty.
- Send an OpenAI-compatible chat completion request with `response_format: { type: "json_object" }`, `max_tokens: 4096`, and `temperature` as a parameter (default `0.7`).
- Return only the raw content string from the first choice.
- Throw `LlmUnavailableError` for network failures and non-2xx responses.
- Never include the API key value in any thrown error message or return value.
- Export `LlmUnavailableError` and `LlmMalformedError` as named error classes.
- Unit test in `tests/llmGateway.test.ts` using a fetch stub:
  - Assert a successful response returns the content string.
  - Assert a 500 response throws `LlmUnavailableError`.
  - Assert a network failure throws `LlmUnavailableError`.
  - Assert the API key does not appear in any thrown error message.

---

## Phase 4 — Stack generator orchestration

### Task 7 — [x] Implement the stack generator
**Refs:** REQ-1, REQ-2, REQ-3, REQ-4, design §Data flow

- Create `server/stackGenerator.ts`.
- Export `generate(request: GenerateRequest): Promise<GenerateSuccess | GenerateError>`.
- Implement the full flow from the design's data flow diagram:
  1. Build prompt → call LLM → parse JSON → validate.
  2. On validation failure: build retry prompt → call LLM again → parse → validate.
  3. On second failure: return `GenerateError` with a plain-language message.
  4. On `LlmUnavailableError` at any point: return fallback stack with `isFallback: true`.
- Use `temperature: 0.7` for the first call and `temperature: 0.2` for the retry.
- Never let the API key or raw LLM error details appear in the returned value.
- Unit tests in `tests/stackGenerator.test.ts` using stubs for `llmGateway` and `validator`:
  - Assert a valid first-attempt response returns `{ ok: true, isFallback: false }`.
  - Assert a failing first attempt followed by a valid retry returns `{ ok: true, isFallback: false }`.
  - Assert two failing attempts return `{ ok: false }`.
  - Assert an `LlmUnavailableError` returns `{ ok: true, isFallback: true }` with a valid fallback stack.
  - Assert the returned stack in all success cases passes `validate()`.

---

## Phase 5 — HTTP route

### Task 8 — [x] Implement the generate route
**Refs:** REQ-7, design §Route handler

- Create `server/routes/generate.ts`.
- Register `POST /api/generate`.
- Validate the request body: reject empty/whitespace prompt (400) and prompts over 500 characters (400) with plain-language messages (no stack traces).
- Call `stackGenerator.generate(request)`.
- On `GenerateSuccess`: respond 200 with `{ ok: true, stack, isFallback }`. Strip all other fields.
- On `GenerateError`: respond 422 with `{ ok: false, message }`.
- On unexpected errors: respond 500 with a generic plain-language message; log the real error server-side only.
- Integration test in `tests/generate.route.test.ts`:
  - Assert empty prompt → 400.
  - Assert prompt > 500 chars → 400.
  - Assert valid prompt with stubbed generator → 200 with expected shape.
  - Assert generator error → 422.
  - Assert response body contains no API key, no raw error text.

---

## Phase 6 — End-to-end smoke test

### Task 9 — [x] End-to-end smoke test (LLM stubbed)
**Refs:** REQ-1, REQ-2, REQ-3, REQ-4

- Create `tests/stackGenerator.e2e.test.ts`.
- Stub `llmGateway.call` to return a hard-coded valid stack JSON string on the first call.
- Call `generate({ prompt: "a five-card quiz about Irish rivers" })` and assert:
  - Response is `GenerateSuccess`.
  - `stack` passes `validate()` with `valid === true`.
  - `isFallback` is `false`.
- Add a second scenario where the stub returns an invalid stack on attempt 1 and a valid stack on attempt 2. Assert `isFallback === false` and `valid === true`.
- Add a third scenario where the stub always throws `LlmUnavailableError`. Assert `isFallback === true` and the returned stack passes `validate()`.

---

## Phase 7 — Progressive delivery (streaming)

### Task 10 — [x] Stream generated cards to the client (REQ-8)

Stream the finished stack to the Start screen card-by-card so cards are dealt
one at a time with their real questions, while keeping the non-streaming path
for existing tests and clients.

- **`src/shared/types.ts`** — add the NDJSON line types `GenerateStreamStart`,
  `GenerateStreamCard`, `GenerateStreamDone`, `GenerateStreamError`, and the
  `GenerateStreamMessage` union.
- **`src/shared/validator.ts`** — export `validateCard(input)` for per-card
  shape validation (whole-stack invariants stay in `validate()`).
- **`server/stream-generate.ts`** — `streamGenerate(request, sink, deps?)`:
  call `generate()`; on `ok:false` or a throw, write one plain-language `error`
  line; otherwise write `start`, then each card (shape-validated; a bad card
  stops with `error`), then `validate()` the whole stack and write `done`
  (or `error`). `deps.generate` is injectable for tests.
- **`server/routes/generate.ts`** — when `Accept: application/x-ndjson`, after
  the same prompt validation + 16 KB `readBody`, respond `200` with
  `Content-Type: application/x-ndjson` and stream via `streamGenerate`. The
  default JSON path is unchanged.
- **`src/editor/api.ts`** — `generateStackStream(prompt, handlers, fetch?)`:
  request NDJSON, read the body with a `ReadableStream` reader, fire
  `onStart`/`onCard`, and resolve with the same `GenerateOutcome` shape. A
  broken stream (no `done`/`error`) or an unparseable line resolves to a plain
  `{ ok:false }`.
- **`src/editor/StartScreen.tsx`** — generate via `generateStackStream`; deal
  each streamed card onto the pile with an "N of M" label and its real question.

**Tests**

- `tests/stream-generate.test.ts` — start/card/done order; every card streamed
  in deck order; fallback flag carried; `ok:false` → one error line; a throw →
  clean error (no stack trace); a malformed card mid-stream → error, no done;
  a two-end assembled stack → error, no done (broken-stream coverage).
- `tests/generate.route.test.ts` — NDJSON Accept streams start/cards/done;
  `ok:false` → single error line (HTTP still 200); empty prompt still 400 under
  NDJSON; the default JSON path still returns one JSON body.
- `tests/maker/generate-flow.test.ts` — Start screen over NDJSON: success →
  editor; fallback → offline notice; error line → stays on Start; a broken
  stream (no done) → stays on Start with a plain message.

**Done when:** `npm test` and `npx tsc --noEmit` are clean; the streamed path
deals cards one by one with "N of M" and real questions; the non-streaming JSON
path is unchanged; a broken stream is covered by tests and falls back cleanly.

✅ **Done** — NDJSON line types + `validateCard` added; `server/stream-generate.ts`
streams start → cards (shape-validated) → done, with clean plain-language `error`
fallback for any failure (generator error, throw, malformed card, or whole-stack
validation failure). The route streams on `Accept: application/x-ndjson` and keeps
the JSON path for the default Accept. `generateStackStream` on the client deals
cards as they arrive; `StartScreen` shows "Card N of M" with the real question on
the dealt pile. New/updated tests across the three files, including a broken
stream. Full suite green (413 tests), typecheck clean.

> **Note (superseded by Task 11):** Task 10 streamed a *finished* stack
> card-by-card — the cards were dealt only after `generate()` had fully
> returned, so "N of 10" was cosmetic. Task 11 makes the LLM path genuinely
> incremental.

---

### Task 11 — [x] Make the streamed LLM path genuinely incremental (REQ-8)

Task 10 awaited the whole `generate()` before writing any card, so the client
received every card at once after the full wait. Make the real LLM path stream
card-by-card as the model produces each one, honestly, while keeping the
non-streaming JSON path and all existing tests.

- **`server/llmGateway.ts`** — add `callStream(messages, options)`: an async
  generator that calls the same OpenAI-compatible endpoint with `stream: true`
  and yields content deltas from the SSE `data:` lines. Same key handling,
  base URL, model, temperature and no-secrets guarantees as `call`; same
  request-timeout policy. `call` stays for the JSON path and tests.
- **`server/promptBuilder.ts`** — add `buildStream(request)`: the streaming
  system prompt asks for JSON Lines (a `{"kind":"stack",…}` header line then one
  `{"kind":"card","card":{…}}` line per card), with the same seven invariants,
  the same audience rules, and the same user message / card-count clamp as
  `build`.
- **`server/stream-generate.ts`** — rewrite `streamGenerate` to:
  1. `attemptStreamedLlm`: drive `callStream(buildStream(request))`, reassemble
     split/partial lines with an incremental `LineBuffer`, emit `start` on the
     header line, and emit each `card` the instant its line completes and passes
     `validateCard()`; on stream end, `validate()` the assembled stack and
     return it.
  2. On success → `done`. On ANY failure (no key, non-2xx, dead stream,
     malformed card, whole-stack validation fail) → if cards were already
     dealt, emit `reset`, then fall back via `streamFallback`.
  3. `streamFallback`: run the non-streaming `generate()` (retry + offline
     fallback) and stream its stack out, pacing cards with a cosmetic,
     offline-fallback-only delay (injectable `sleep`). Plain-language `error`
     if even the fallback cannot produce a stack.
  `deps` injects `generate`, `callStream`, `buildStream`, `sleep` for tests.
- **`src/shared/types.ts`** — add `GenerateStreamReset` to the union.
- **`src/editor/api.ts`** — `generateStackStream` handles the `reset` line
  (clear dealt state) via a new `onReset` handler; tolerates `total === 0`.
- **`src/editor/StartScreen.tsx`** — clear the dealt pile on `onReset`; show
  "Card N" when the total is unknown (live LLM) and "Card N of M" when known
  (fallback).

**Tests**

- `tests/stream-generate.test.ts` — fake streaming endpoint that sends partial
  lines, lines split across chunks, a malformed card in the middle, a stream
  that dies halfway, and a slow stream; asserts the first card reaches the sink
  before the stream ends, reset+fallback on each failure mode, and no reset
  when nothing was dealt. `LineBuffer` unit tests for the incremental parser.
- `tests/llmGateway.test.ts` — `callStream` over a stubbed `ReadableStream`:
  in-order deltas, lines split across chunks, `stream:true`/no `response_format`,
  `[DONE]` sentinel, non-2xx → `LlmUnavailableError`, network failure, a stream
  that dies partway, key never leaked.
- `tests/promptBuilder.test.ts` — `buildStream` emits JSON-Lines framing and
  still carries every invariant + audience rule; reuses the `build` user body.
- `tests/maker/generate-flow.test.ts` — a `reset` mid-stream clears the
  partially-dealt cards and lands the replacement stack in the editor.

The incremental parser was deliberately broken once (an off-by-one in
`LineBuffer.takeCompleteLines`) to confirm the stream tests go red, then
reverted.

**Mutation re-check (deadlines pass):** `LineBuffer.takeCompleteLines` was broken
again on purpose — it emitted the trailing partial line before its newline
arrived — and 3 split-chunk tests went red (the `LineBuffer` partial-line and
remainder test plus the "handles lines split across chunks and partial lines"
stream test), confirming the split-chunk coverage still bites. Restored
immediately; suite green again.

**Done when:** `npm test` and `npx tsc --noEmit` are clean; the LLM path deals
each card as the model produces it (first card before the stream ends, proven
by test); the non-streaming JSON path is unchanged; the offline fallback still
deals card-by-card with clearly offline-only pacing.

✅ **Done** — `callStream` (SSE, `stream:true`) and `buildStream` (JSON Lines)
added; `stream-generate` now parses the token stream incrementally and emits each
card the moment its line validates, falling back (with a `reset` when cards were
already dealt) to the retry + offline path on any failure. Offline-only pacing is
commented and injectable. Client handles `reset` and unknown totals. 21 new/updated
tests across four files; the parser was broken on purpose to see red, then fixed.
Full suite green (434 tests), typecheck clean.

**Follow-up — upstream deadlines + client disconnect.** Both LLM calls now carry
explicit `AbortController` deadlines (see tech.md §LLM integration): `call` has a
45 s total budget; `callStream` has a 90 s total budget and a 20 s idle (no-chunk)
cap that resets on every chunk. On any deadline the upstream fetch is aborted and
the call throws `LlmUnavailableError` with a plain-language message that never
leaks the URL or key. `callStream` also accepts the client's connection signal;
`/api/generate` wires `req`'s close event to it, so a mid-stream client disconnect
aborts the upstream request (the server stops paying for tokens nobody reads) and
`streamGenerate` skips the fallback when the client is gone. New fake-timer tests
cover each deadline and both disconnect cases.


---

## Phase — Round-2 review fixes to generation (TASK-26 b, c, d, g, j)

> Owned here: b (flash dead end), c (layout), d (invented pictures), g (generator
> logging/timeouts/budget), j (distractor style). The rest of TASK-26 is in
> `exporter/tasks.md` (a, e) and `maker/tasks.md` (f, h, i, k–o).

**Why:** the first live review with real generation (5 Nov evening, J1–J5) found
that the model's output was trusted as-is. Every generated deck with a flash card
froze on that card, the model's coordinates overprinted the "Card N of M" line,
and an invented picture path made a deck impossible to export.

### TASK-26b: generated flash cards must never dead-end  *(P0, 3 of 3 live decks)*
  - **Bug.** The model returned a flash card as ONE text plus a Next button. The player flips only with a second text and draws Next only on the back, so the card never moved on. The prompt never said what a flash card must contain; nothing in the validator or "before you share" check covered it.
  - **Fix at every layer.**
    1. *Prompt:* a "Flash cards" rule in BOTH prompts — text 1 is the term (at most four words), text 2 is the explanation, one "Next Card" button.
    2. *Server normalisation:* a flash card with one text is split into term + explanation at a clean separator (`:`, ` – `, ` — `, ` - `, a newline); with no clean split it is converted to a **story** card with a "Continue" button. The Next button always exists and always has a `goto` (to the next card in deck order).
    3. *Player:* a card with no forward control still draws one (a flash card with no back shows Next on the FRONT; any non-end card whose controls all lack a `goto` offers a "Next Card" to the next card in order). A button with no `goto` never greys out the card and stops.
    4. *Check:* `checkReachability` reports `stuck` cards (non-end cards with no way forward) and answers/buttons that go nowhere; `repairFlow` fixes them.
  - **Acceptance criteria.**
    - A test with the exact malformed shape (one text + a Next button; and one text with no button) normalises to a playable card, and the player draws a forward control on the front.
    - Property test over random stacks: after `repairFlow` + normalisation, **every non-end card has a forward control that targets an existing card** and walking forward from card 1 always reaches the end card.
    - The "before you share" check flags a flash card with no way forward and a quiz/story button that goes nowhere.

### TASK-26c: never trust model coordinates for core text  *(P0)*
  - **Bug.** Generated cards used the model's layout (text at y=40, h=120): the question printed over "Card N of M", long questions ran into the answer tiles, and the CORRECT stamp landed on both.
  - **Fix.** After validation, re-lay generated quiz / flash / story cards onto the same template as the ready-made decks (`src/shared/layout.ts`): a reserved top band (nothing above y=96), a question box that ends before the stamp gutter above the tiles, a 2×2 tile grid, stacked story choices, a fixed flash term/explanation/Next. The renderer fits text to its box (`src/shared/fitText.ts`, never below 20 px) so a long question or a two-line answer cannot overflow. Applied per streamed card too, so the dealing preview is clean.
  - **Acceptance criteria.**
    - For long questions (up to 240 characters) and long answers, no two core elements' rectangles intersect and nothing intrudes into the top band, at the 1366×768 and 1920×1080 player scales; the fitted text height never exceeds its box.
    - The model's `y=40` input produces `y ≥ 104` output; out-of-bounds model coordinates are clamped rather than failing validation and burning a retry.

### TASK-26d: model-invented pictures must never reach the editor or the export  *(P0)*
  - **Bug.** The prompt offered `{"type":"image","src":"..."}`; the model invented `images/cheval.png`, the validator passed it, and Export answered 422 ("A picture on a card couldn't be found").
  - **Fix.** Remove `image` from both model-facing schemas; strip any image element whose `src` is not an embedded `data:` URI before validation/streaming (both paths).
  - **Acceptance criteria.** A test feeds model output with relative-path pictures through both the one-shot and the streaming path; the resulting stack has no such image and **exports with 200** (class AND living). A property test: for any model output built from valid cards plus arbitrary image elements, the generated stack exports.

### TASK-26g: generator logging, the "timeout" reason, and the retry budget
  - **Bug.** `reasonFromError` sniffed the message for "time" but the gateway says "took too long", so the `timeout` reason could never be produced; a stream fallback logged twice; the streamed attempt's own failure cause was swallowed; no test pinned that a retry counts against the daily budget (mutant D survived).
  - **Fix.** `LlmUnavailableError` carries a `kind` (`timeout | cancelled | http | network | empty | dropped`) set where it is thrown; `reasonFromError` maps from `kind`, never from text. The stream attempt logs its own redacted cause once; the duplicate "served ready-made deck" line is dropped.
  - **Acceptance criteria.** A deadline produces `fallbackReason: "timeout"` on both paths; exactly one log line per fallback; a test where the first attempt fails validation asserts `onModelCall` is called **twice** (and fails if the retry stops counting).

### TASK-26j: plausible distractors in sentence case
  - **Bug.** Answers came back in Title Case ("Along Edges Of Tectonic Plates") with joke distractors ("It Turns Into Wood"). The prompt itself said "Title case for button labels".
  - **Fix.** Both prompts: wrong answers are plausible and from the same category; answer labels are sentence case; only navigation buttons ("Next Card", "Continue") are Title Case. The normaliser converts an unmistakable Title Case label (3+ words, a capitalised small word mid-label) to sentence case, and drops "Question 3:" / "Q3." prefixes from generated question text (the card counter already shows position, and inserting a card breaks the numbering).
  - **Acceptance criteria.** Unit tests for the Title Case rule (converted: "Along Edges Of Tectonic Plates"; untouched: "Mount Vesuvius", "Brian Boru") and the prefix rule; the prompt tests assert the new rules are present in both prompts and the old "Title case for button labels" line is gone.

**Gate (TASK-26 b, c, d, g, j):** `npm test` and `npx tsc --noEmit` exit 0.


---

## Phase — Round-3 review fixes to generation (TASK-27 b, e, m, t, A, B)

> Owned here: **b** (cut text at boundaries), **e** (defensible distractors), **m**
> (re-mint ids), **t** (say when pictures were not added), plus two J4 findings in
> our own normaliser (**A**, **B**). The rest of TASK-27 is in `exporter/tasks.md`
> (f-living, g, j, x, r) and `maker/tasks.md` (a, c, d, f, h, i, k, l, v–y, n, o,
> p, q, s, u).

**Why:** round 3 (`judge_2026-11-05_r3`) found that the LIVE model's output was still
trusted in three more ways: one mistyped id withdrew a whole correct deck (J5 P0-2),
text was cut in the middle of a word (J3 P1-2), and wrong answers a child could defend
reached the class (J2 P1-2).

### TASK-27m: re-mint every id server-side  *(P0)*
  - **Bug.** The README's own example sentence fell back live: the model wrote ids like `00000000-0000-4000-8000-0000000100 01` (a space) and non-v4 ids. `validateCard` accepted the card (so it was dealt), the whole-stack `validate` then failed on `invalid-id`, the 11 on-topic cards were retracted at 45 s, and the retry hit its deadline: a ready-made deck at 90 s.
  - **Fix.** Ids are *ours*, not the model's. Before validation, `sanitizeRawStack` / `sanitizeRawCard` mint a fresh v4 id for the stack, every card and every element, map old card id → new id, and rewrite every `goto.cardId` (a target that matches no card, or an old id that was duplicated, becomes the next card in deck order, else the end card). Duplicate ids are therefore harmless. The streaming path re-mints per card before dealing, using a stack-wide map so a goto to a LATER card still resolves; the final assembled stack is re-mapped consistently. Both prompts say ids may be any short unique strings.
  - **Acceptance criteria.**
    - A property test: any otherwise-valid model deck whose ids are arbitrary strings (spaces, duplicates, empty, non-v4, numbers-as-strings) goes through `generate()` AND `streamGenerate()` to `done` with `isFallback: false`, in ONE model call.
    - Gotos survive the re-mint (a branch still reaches the same card it did); a goto to an unknown id points at the next card.
    - Ids in the finished deck are valid, unique v4 ids and are not the model's.
    - `validateCard` check ids too, so a bad card is never dealt and then retracted.
    - The exact ids from the live failure (the space, the non-v4 `00000002-0100-…`) are a named test.

### TASK-27b: cut text at a sentence or word boundary, never mid-word  *(P1)*
  - **Bug.** `cap()` sliced at a fixed length and added "…" ("Now tell a p…" on the Viking end card, the last frame the class sees). The same helper cut questions (240), labels (90), bodies (600), the flash term (80).
  - **Fix.** `cap()` keeps whole sentences if any fit inside the limit, else cuts at the last word boundary, and adds "…" only when it cut inside a sentence. The end-card heading keeps its first one or two whole sentences. Both prompts ask for an end line of 70 characters or fewer.
  - **Acceptance criteria.** Unit tests: an 85-character end line comes back with no "…" mid-word and ends on a whole word or sentence; questions, labels, bodies and the flash term each cut at a boundary; text under the limit is untouched; a single word longer than the limit is hard-cut (no infinite loop).

### TASK-27e: wrong answers must be clearly wrong  *(P1)*
  - **Bug.** "What do robins mainly eat?" marked *Grass seeds* wrong (robins do eat seeds); *Field mouse* was a wrong answer for "which animal eats slugs, worms and insects" (it eats insects). A child answering correctly from what they know gets a red ✗.
  - **Fix.** Both prompts: every wrong answer must be CLEARLY false for the age group; no option that is partly true or true in some season or situation; prefer a different category from the right answer (not a close relative of it); if a question could have two defensible answers, rewrite the question. A cheap self-check in the normaliser: a wrong answer whose label is identical (case-insensitive) to the right answer, or a duplicate wrong answer, is dropped while at least one wrong answer remains.
  - **Acceptance criteria.** The rule text is asserted in all three prompts (one-shot, streaming, retry); the self-check drops an answer duplicating the right one and a duplicated wrong one, and never leaves a quiz card without a wrong answer.

### TASK-27t: say so when pictures were not added  *(P2)*
  - **Bug.** A teacher who asks for pictures gets none and no word about it (J1 P2-3, J5).
  - **Fix.** After a generated deck is ready, if the sentence mentions a picture ("picture", "photo", "image", "illustration", "drawing"), the Maker shows one plain line: "Pictures aren't added automatically yet. Use Add Picture." The wait copy says "usually 30–60 s" (one live run took 60 s).
  - **Acceptance criteria.** The note appears for such a sentence on a model-built deck and not otherwise; the wait screen says "30–60 seconds" and never "20 seconds" or "30–45".

### TASK-27A: never lowercase a proper noun  *(J4 P1-2)*
  - **Bug.** `sentenceCaseLabel` lowercased every word after the first once it saw one capitalised small word: "The Battle Of Hastings" → "The battle of hastings", "Isle Of Man" → "Isle of man". The comment said names were safe; names with a function word were not.
  - **Fix.** Lowercase only the small function words ("Of", "The", "In" …), never the content words: "Along Edges Of Tectonic Plates" → "Along Edges of Tectonic Plates". The prompt still asks for sentence case, so this only touches a model that ignored it.
  - **Acceptance criteria.** The five names J4 measured are unchanged except for function words (`The Battle of Hastings`, `United States of America`, `Isle of Man`, `Bank of England`, `Treaty of Versailles`).

### TASK-27B: a pronoun is not a flash-card term  *(J4 P2-1)*
  - **Bug.** The `X is/are/means …` rule made "This", "There", "It" the term.
  - **Fix.** Reject pronoun and expletive subjects (this, that, these, those, it, there, they, he, she, we, you, i); fall through to the story-card conversion.
  - **Acceptance criteria.** "This is the process where plants make food…", "There are 206 bones…" and "It is when water vapour cools…" each convert to a story card, not a one-word term.

**Gate (TASK-27 b, e, m, t, A, B):** `npm test` and `npx tsc --noEmit` exit 0.

### TASK-27 z1–z6 (J4 addendum)
  - **z1 (done as TASK-27A).** Only small function words are lowercased; proper nouns keep their capitals. Tests add place and people names (Brian Boru and the Dal Cais, Saint Patrick of Ireland).
  - **z2 (done as TASK-27B).** A pronoun or a term under three letters is never a flash front. Tests cover this/there/it/these/they and keep a real subject ("Evaporation").
  - **z4.** `/api/generate` reads and validates the body (JSON, size, non-blank prompt, ≤500 characters) *before* it counts a rate or budget slot. Malformed requests answer 400 and cost nothing. *Acceptance:* with a limit of one, six malformed requests then one valid one → the valid one is served, and the next valid one is limited.
  - **z5.** The retry/fallback path gets the client's disconnect signal: `generate()` passes it to the model call, starts no retry once it has aborted, and `streamFallback` writes nothing further. An early `start` line (`total: 0`, no title) is written before the fallback begins so the client is never in silence. *Acceptance:* tests for the signal reaching `generate()`, the early line arriving while `generate()` is still running, and no `error`/`card`/`done` after a disconnect.
  - **z6.** The 1000-run property tests carry an explicit 30 s timeout (on top of the global 60 s `testTimeout`). *Acceptance:* `CI=true npm run check:claims` exits 0.


### TASK-28i: `cap()` respects decimals and abbreviations  *(J4 P2-1)*
  - **Bug.** The sentence pass ran its lookahead on the cut window, so a `.` at the cut counted as a sentence end: "The answer is 2.5 kilograms…" → "The answer is 2."; "…improved by Dr. Thomas Edison…" → "…improved by Dr.", both with no "…".
  - **Fix.** A `.` followed by a digit is never a sentence end; the abbreviations Dr, Mr, Mrs, Ms, St, e.g., i.e., etc., vs, No are skipped; the lookahead is tested against the FULL text, not the window; "…" is appended whenever any text is dropped.
  - **Acceptance criteria.** Unit tests for both examples (no cut after "2." or "Dr."), and a test that any shortened text ends with "…" or a real sentence end that is also the end of the original.

### TASK-28p: wrong answers are plausible, and the prompt has no tuned examples  *(J2 P2 #4)*
  - **Bug.** The prompt quoted one judge's topic word for word (robins/seeds, field mice/insects), and "clearly false" over-corrected into jokes ("a holiday to Italy").
  - **Fix.** The wrong-answer rule is general: plausible for the age group, from the same topic, never jokes or absurd options, still clearly false. No topic-specific examples.
  - **Acceptance criteria.** Prompt test: both rules present; none of robin, seed, field mouse, mice, insect, Italy appears in the prompt.


### TASK-29g: a quiz does not repeat the flash card before it  *(J1 P2-5)*
  - **Fix.** Prompt rule: quiz questions must not simply repeat a flash card's term-and-definition pair word for word; ask about it differently, or about something else.
  - **Acceptance criteria.** Prompt test: the rule is in the one-shot, streaming and retry prompts.

### TASK-29h: the first card comes sooner, and we measure it  *(J1 #5)*
  - **Fix.** The stream path emits the header and then the first card the moment each is parsed (no batching), and logs time-to-header and time-to-first-card (`ttfc`) in one operator line (no key, no URL).
  - **Acceptance criteria.** Test with a fake clock/stream: the `start` and the first `card` lines are written before the second chunk is read; the log line contains `ttfc=`.

### TASK-29k: the end card can carry a longer message, and there is one ending  *(J3 N1, P2)*
  - **Bug.** A request for "a long encouraging message on the last card" made the model emit a fake flash card ("You did it!" + "Tap the card to see the answer") followed by the real end card showing the prompt's own example line, so the class got two endings.
  - **Fix.** The end card has an optional body slot (heading ≤ 70, body ≤ 300). The prompt says longer encouragement goes in the end card's second text, asks for an end line that names the topic, and does not use "Well done — you finished!" as an example line to copy. The normaliser folds a final non-quiz card that sits right before the end card and has a celebratory front into the end card's body, and never fills the heading with the stock example line when the model wrote its own.
  - **Acceptance criteria.** A test with the exact repro (flash "You did it!" + long back, then an end card) gives ONE ending whose body carries the long message; the stock line appears only when the model wrote nothing.

### TASK-29p (prompt half): options fit the question's form  *(J2 #5)*
  - **Fix.** General prompt rule: the answer options must fit the form of the question; a "which is bigger, A or B?" question offers only A and B.
  - **Acceptance criteria.** The rule is in every prompt and no prompt carries the review's example.


### TASK-30a (generator half): fold a closing message only when it really is one  *(J4 P1-1, P1)*
  - **Bug.** `foldEndLikeCard` + `soundsLikeEnding` deleted a vocabulary card whose term was a praise word ("Well done → Maith thú", "Congratulations → Félicitations") and replaced the end card's text with it.
  - **Fix.** `foldEndLikeCard(stack, { prompt })` folds only if (1) the candidate's longer text is more than 120 characters and at least two sentences, (2) the deck's other flash cards are not mostly short term → translation pairs (back ≤ 60, front ≤ 40 characters), and (3) the sentence asked for a closing message/ending OR the end card has no body. `finaliseGeneratedStackDetailed` also returns `movedClosingMessage`; the stream `done` and the one-shot response carry it. The prompt is passed to both.
  - **Review fix.** Guard (0): a candidate with a short-term front (≤ 4 words, no `. ! ? ; : …`) in a deck whose other non-end cards are all flash cards with short-term fronts is vocabulary and is never folded. `asksForClosingMessage` needs a message word tied to the last/final/end card ("then the last card" alone is not asking).
  - **Acceptance criteria.** See `maker/tasks.md` TASK-30a. Plus: with the prompt asking for "a long encouraging message on the last card" the 29k repro folds; the same deck with a sentence that does not ask and an end card that already has a body is left exactly as it is.


### TASK-31c (generator half) / 31e: a shorter wait and a better flash rule  *(J04 4.4/4.6c, FIX P2-6)*
  - **Bug.** The model thinks for 20 to 24 s before its first token; the prompt asks it to plan every card id and to emit coordinates the server throws away; the idle deadline starts before the first chunk; the flash rule says "word for word".
  - **Fix.** `STACKYARD_LLM_THINKING` (Anthropic host: off by default) adds `"thinking": {"type": "disabled"}` to `call` and `callStream`. The prompt asks for ids `c1, c2, …` in order and drops x/y/w/h from the requested elements (the normaliser already re-lays out text and buttons on every path). `STREAM_FIRST_TOKEN_DEADLINE_MS` (45 s) guards the wait for the first content delta; `STREAM_IDLE_DEADLINE_MS` (20 s) only starts after it. The flash rule is "Don't ask for the definition just given on a flash card within the previous 3 cards; ask about it differently, or about something else."
  - **Acceptance criteria.** See `maker/tasks.md` TASK-31c and TASK-31e.
