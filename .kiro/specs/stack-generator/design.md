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
3. **Invariant checklist** — All seven invariants listed as numbered rules the model must satisfy before responding.
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

All failing invariants are collected before returning — the validator does not short-circuit on the first error, so a single LLM response can produce a complete list of problems for the retry prompt.

---

## Fallback stack (`fallback.ts`)

`build(request: GenerateRequest): Stack`

Produces a deterministic stack without calling the LLM. The output must pass all seven invariants.

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

## Not in scope for this feature

- Streaming the generation response.
- Support for more than one LLM provider (OpenAI-compatible API only).
- Caching or deduplication of identical prompts.
- Rate limiting or quota management.
- Saving the generated stack to persistent storage.
