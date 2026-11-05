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
