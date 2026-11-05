# Stack Generator — Design

## Overview

The stack generator is a server-side module (`server/stackGenerator.ts`) that accepts a teacher's prompt, calls an LLM once with a strict JSON schema instruction, validates the response with the shared validator, retries once if validation fails, and falls back to a deterministic stack if the LLM is unavailable. No part of this module — including the API key, raw LLM response, or error details — is ever sent to the browser.

---

## Module boundaries

```
server/
  llmGateway.ts       # Thin wrapper: makes the HTTP call, reads the API key, returns raw text
  stackGenerator.ts   # Orchestration: prompt → LLM → validate → retry → fallback → Stack
  fallback.ts         # Builds a deterministic fallback Stack from a GenerateRequest
  promptBuilder.ts    # Assembles the system prompt and user message for the LLM

src/shared/
  types.ts            # Stack, Card, Element, Action type definitions (canonical)
  validator.ts        # validate(stack): ValidationResult — enforces all 7 invariants
```

The Maker app calls `POST /api/generate` on the dev server (or the same-origin server in production). The route handler calls `stackGenerator.generate(request)` and returns either a `GenerateSuccess` or `GenerateError` response shape to the client.

---

## Data flow

```
Client
  │  POST /api/generate  { prompt: string }
  ▼
Route handler (server/routes/generate.ts)
  │  validates request shape; rejects empty/too-long prompts immediately
  ▼
stackGenerator.generate(request)
  │
  ├─ promptBuilder.build(request)          → { system, user }
  │
  ├─ llmGateway.call({ system, user })     → raw string  (or throws LlmError)
  │    │  reads STACKYARD_LLM_API_KEY from process.env
  │    │  sets response_format: { type: "json_object" }
  │    │  never leaks the key into return value
  │
  ├─ JSON.parse(raw)                       → unknown
  │
  ├─ validator.validate(parsed)            → ValidationResult
  │
  ├─ if PASS ──────────────────────────────→ GenerateSuccess { stack, isFallback: false }
  │
  ├─ if FAIL (first attempt)
  │    ├─ promptBuilder.buildRetry(request, errors)  → { system, user }
  │    ├─ llmGateway.call(...)             → raw string
  │    ├─ JSON.parse → validate
  │    ├─ if PASS ─────────────────────────→ GenerateSuccess { stack, isFallback: false }
  │    └─ if FAIL ─────────────────────────→ GenerateError { message: "..." }
  │
  └─ if LlmError (unreachable / non-2xx)
       ├─ fallback.build(request)          → Stack  (deterministic, always valid)
       └─ GenerateSuccess { stack, isFallback: true }
```

---

## Response shapes (server → client)

```ts
type GenerateSuccess = {
  ok: true;
  stack: Stack;
  isFallback: boolean;  // true when the LLM was unavailable
};

type GenerateError = {
  ok: false;
  message: string;  // plain language; never a stack trace or raw error code
};
```

---

## LLM call contract (`llmGateway.ts`)

- Reads `process.env.STACKYARD_LLM_API_KEY`. Throws a configuration error at startup if absent.
- Sends a single chat completion request with:
  - `response_format: { type: "json_object" }` (forces JSON output on compatible APIs).
  - A `max_tokens` ceiling (e.g. 4096) to bound latency and cost.
  - `temperature: 0.7` for the first attempt; `temperature: 0.2` for the retry (more conservative).
- Returns the raw content string. Does **not** return headers, usage stats, or any field that might carry server-side information.
- Throws `LlmUnavailableError` for network failures and non-2xx responses.
- Throws `LlmMalformedError` if the response body cannot be parsed as JSON.

---

## Prompt design (`promptBuilder.ts`)

### System prompt (constant)

The system prompt instructs the LLM to act as a lesson card generator and specifies:

1. **Output format** — Return only a JSON object that conforms to the `Stack` schema. No prose, no markdown fences, no extra keys.
2. **Schema summary** — A compact inline description of `Stack`, `Card`, `Element`, and `Action` types (not the full TypeScript, just enough for the model to produce the right shape).
3. **Invariant checklist** — All eight invariants listed as numbered rules the model must satisfy before responding.
4. **Audience rules** — Short sentences; active voice; Irish/UK English spelling; age-appropriate for the year group; "pupils" not "students"; one clearly correct quiz answer per card.
5. **ID instruction** — Generate UUIDs for all `id` fields. Every id must be unique within the document.

### User message (dynamic)

Constructed from the `GenerateRequest`:

```
Generate a stack for: "<prompt>"
```

If a card count is detected in the prompt, it is normalised here (e.g. clamped to 20).

### Retry user message

```
The previous stack had these validation errors:

<bulleted list of error messages from ValidationResult>

Fix all of them and return the corrected stack for: "<prompt>"
```

---

## Validator (`src/shared/validator.ts`)

`validate(unknown): ValidationResult`

Returns `{ valid: true, stack: Stack }` or `{ valid: false, errors: string[] }`.

Checks, in order:

| # | Invariant | Error message key |
|---|-----------|-------------------|
| 1 | All IDs unique within the document | `duplicate-id` |
| 2 | All `goto` targets exist in `stack.cards` | `invalid-goto` |
| 3 | Exactly one `end` card | `end-card-count` |
| 4 | Each `quiz` card has exactly one correct button | `quiz-answer` |
| 5 | All elements within 800×600 canvas | `canvas-bounds` |
| 6 | `stack.title` not blank | `blank-title` |
| 7 | At least one non-end card | `no-content-cards` |
| 8 | All IDs are valid RFC 4122 v4 UUIDs | `invalid-id` |

All failing invariants are collected before returning — the validator does not short-circuit on the first error, so a single LLM response can produce a complete list of problems for the retry prompt.

---

## Fallback stack (`fallback.ts`)

`build(request: GenerateRequest): Stack`

Produces a deterministic stack without calling the LLM. The output must pass all eight invariants.

Structure (example for a quiz prompt):

- **Card 1 — intro**: `kind: "story"`. Title text from the prompt. One "Start" button that navigates to card 2.
- **Card 2 — placeholder quiz**: `kind: "quiz"`. Generic question text ("Question 1"). Two answer buttons: one correct (score delta 1, cheer sound), one incorrect (score delta 0, buzz sound). Navigates to the end card.
- **Card 3 — end**: `kind: "end"`. Score display.

All IDs are generated deterministically using a seeded UUID function keyed on the prompt string, so the same prompt always produces the same fallback stack. This is useful for testing.

The fallback stack's title is derived from the prompt (truncated to 120 chars, trimmed).

---

## Security invariants

- `STACKYARD_LLM_API_KEY` is accessed only inside `llmGateway.ts`.
- No other module imports or reads the key.
- The key is never logged, returned in any response shape, or interpolated into an error message.
- The route handler strips all fields from the `GenerateSuccess` payload except `ok`, `stack`, and `isFallback` before sending to the client.

---

## Error handling summary

| Situation | Behaviour |
|-----------|-----------|
| Empty or too-long prompt | 400, plain-language message, no LLM call |
| LLM returns invalid JSON | treated as validation failure; retry once |
| Stack fails validation (attempt 1) | retry with error list |
| Stack fails validation (attempt 2) | 422, plain-language message |
| LLM unreachable / non-2xx | return fallback stack, `isFallback: true` |
| API key not configured | 500 at startup; logged server-side only |

---

## Progressive delivery (NDJSON) — truly incremental

Progressive delivery is genuinely incremental, not cosmetic. On the streaming
path the LLM is asked for the stack as **JSON Lines** — a one-line stack header
followed by one card object per line (`promptBuilder.buildStream`, no
`response_format`; JSON mode and token streaming don't combine on every
OpenAI-compatible endpoint). `llmGateway.callStream` makes the `stream: true`
request and yields content deltas as Server-Sent Events arrive. The token stream
is parsed incrementally: the moment a card's line is complete and passes
`validateCard()`, that card is written to the client. So each card reaches the
Start screen as the model actually produces it — the first card lands long
before the last.

Opt-in by `Accept: application/x-ndjson` on `POST /api/generate`. The default
path (single JSON body via the non-streaming `generate()`) is untouched, so
existing clients and tests keep working. The 16 KB request limit and prompt
validation are identical on both paths.

```
Client ──POST /api/generate, Accept: application/x-ndjson──▶ route handler
  (same prompt validation + 16 KB readBody as the JSON path)
        │
        ▼
server/stream-generate.ts  streamGenerate(request, sink)
  │
  ├─ attemptStreamedLlm(request, sink):            ← the real progressive path
  │     callStream(buildStream(request))  → async deltas
  │     LineBuffer reassembles split/partial lines into whole JSON lines
  │     line 1 (stack header) → write { type:"start", total:0, title, isFallback:false }
  │     each card line:
  │        parseCardLine + validateCard(card)  (shape only)
  │           ok   → write { type:"card", index, card }   ← emitted immediately
  │           fail → abort the attempt
  │     on stream end: assemble { id,title,theme,cards } and validate() it
  │           ok   → return the whole stack
  │           fail → abort the attempt
  │     any throw (no key, non-2xx, dead stream) → abort the attempt
  │
  ├─ attempt ok  → write { type:"done", stack, isFallback:false } ; end
  │
  └─ attempt failed:
        if cards were already dealt → write { type:"reset" }   (client clears them)
        streamFallback(request, sink):
           generate(request)   → GenerateSuccess | GenerateError  (retry + offline fallback)
           ok:false → write { type:"error", message } ; end
           ok       → write start, each card (paced, OFFLINE-FALLBACK-ONLY),
                      validate() the whole stack, write done ; end
```

The `total` on a streamed `start` is `0` (unknown up front — the model has not
said how many cards it will emit); the client shows a live "Card N" count. On
the fallback path the whole stack is known, so `start.total` is the real count
and the Generating screen shows "Card N of M".

**Offline-fallback pacing.** The deterministic offline fallback has no real
model latency, so `streamFallback` sleeps a small fixed gap
(`FALLBACK_DEAL_PACING_MS`) between cards purely so the dealing animation shows
in a demo. This pause is used nowhere on the real LLM path, where the gap
between cards is the model's genuine output rate; the constant is commented as
offline-only and the sleep is injectable so tests run instantly.

Line types (`src/shared/types.ts`): `GenerateStreamStart`, `GenerateStreamCard`,
`GenerateStreamDone`, `GenerateStreamError`, and `GenerateStreamReset`. A
`validateCard(input)` export in `src/shared/validator.ts` checks one card's
structural shape; `validate()` remains the whole-stack check and is the single
source of truth before any `done`. The HTTP response is always 200 — the
stream's final line carries success or failure — so the body flushes before
generation finishes.

Client (`src/editor/api.ts` `generateStackStream`): reads the NDJSON body with a
`ReadableStream` reader, invokes `onStart` / `onCard` / `onReset` callbacks as
lines arrive, and resolves with the same `GenerateOutcome` shape as the
non-streaming `generateStack`. A transport failure, an unparseable line, or a
stream that ends without a `done`/`error` line all resolve to a plain-language
`{ ok:false }`. On `reset` the Start screen clears every card it has dealt so
the pile matches the replacement stack.

### Security on the streaming path

`llmGateway.callStream` carries the identical key-handling and no-secrets
guarantees as `call`: the API key is read only from the environment, sent only
in the `Authorization` header, and never appears in any yielded value or thrown
error. Raw LLM errors are collapsed to plain-language `LlmUnavailableError`
messages, and `stream-generate` only ever forwards `start` / `card` / `done` /
`reset` / plain-language `error` lines — never a stack trace or raw error code.
`callStream` uses the same request-timeout policy as `call`.

---

## Not in scope for this feature

- Support for more than one LLM provider (OpenAI-compatible API only).
- Caching or deduplication of identical prompts.
- Rate limiting or quota management.
- Saving the generated stack to persistent storage.
