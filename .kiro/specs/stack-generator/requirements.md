# Stack Generator — Requirements

## Overview

The stack generator takes a single sentence from the teacher and returns a complete, valid `Stack` JSON document ready for editing and export. It is the first step in the Stackyard flow: sentence → working stack.

---

## User Stories

### REQ-1: Generate a stack from a sentence

**As a** teacher,  
**I want to** type one sentence describing what I want (e.g. "a 10-card quiz about the Vikings in Ireland, the right answer plays a cheer"),  
**so that** I get a ready-to-edit set of lesson cards without writing anything myself.

#### Acceptance Criteria

- WHEN the teacher submits a non-empty prompt,  
  THE SYSTEM SHALL return a `Stack` document containing at least two cards, exactly one of which has `kind === "end"`.

- WHEN the teacher's prompt mentions a card count (e.g. "10 cards"),  
  THE SYSTEM SHALL attempt to generate that many non-end cards, capped at 20.

- WHEN the teacher's prompt mentions a card type (`quiz`, `flash`, `story`),  
  THE SYSTEM SHALL use that type for the generated content cards.

- WHEN the teacher's prompt does not mention a card type,  
  THE SYSTEM SHALL default to `quiz` cards.

- WHEN the teacher's prompt does not specify a year group or age,  
  THE SYSTEM SHALL generate content appropriate for 4th class (approximately 9–10 years old).

- WHEN the teacher's prompt specifies a year group or age,  
  THE SYSTEM SHALL adjust the language complexity and vocabulary to match.

---

### REQ-2: Generated stack passes all format invariants

**As a** teacher,  
**I want** the generated cards to work correctly in the editor and player,  
**so that** I don't need to fix broken links or missing answers before using them.

#### Acceptance Criteria

- WHEN a stack is returned to the client,  
  THE SYSTEM SHALL ensure every `id` (stack, card, element) is a unique UUID v4 within the document.

- WHEN a stack is returned to the client,  
  THE SYSTEM SHALL ensure every `goto` action references a `cardId` that exists in `stack.cards`.

- WHEN a stack is returned to the client,  
  THE SYSTEM SHALL ensure the stack contains exactly one card with `kind === "end"`.

- WHEN a stack is returned to the client and a card has `kind === "quiz"`,  
  THE SYSTEM SHALL ensure that card has exactly one button with a `{ type: "score", delta: 1 }` action (the correct answer) and at least one button without it.

- WHEN a stack is returned to the client,  
  THE SYSTEM SHALL ensure every element's bounding box satisfies `x + w ≤ 800` and `y + h ≤ 600`.

- WHEN a stack is returned to the client,  
  THE SYSTEM SHALL ensure `stack.title` is not blank after trimming.

- WHEN a stack is returned to the client,  
  THE SYSTEM SHALL ensure the stack contains at least one card that is not `kind === "end"`.

- WHEN a stack is returned to the client,  
  THE SYSTEM SHALL ensure every `id` (stack, card, element) is a valid RFC 4122 v4 UUID (36 characters, version nibble `4`, variant bits `8`–`b`).

---

### REQ-3: Retry on validation failure

**As a** teacher,  
**I want** the system to fix a broken generated stack without me doing anything,  
**so that** I don't see errors caused by the AI making a formatting mistake.

#### Acceptance Criteria

- WHEN the LLM returns a stack that fails one or more validator checks,  
  THE SYSTEM SHALL make exactly one further LLM call, passing the original prompt and the list of validation errors.

- WHEN the retried stack also fails validation,  
  THE SYSTEM SHALL not make any further LLM calls and SHALL return an error to the client.

- WHEN the retried stack passes validation,  
  THE SYSTEM SHALL return it to the client as if it were the first attempt.

---

### REQ-4: Deterministic fallback when the LLM is unavailable

**As a** teacher,  
**I want** to get a working (if generic) set of cards even when the internet is down,  
**so that** I can still use Stackyard in a classroom with no reliable connection.

#### Acceptance Criteria

- WHEN the LLM API is unreachable or returns a non-recoverable error,  
  THE SYSTEM SHALL return a deterministic fallback stack built from the teacher's prompt without calling the LLM again.

- WHEN the fallback stack is returned,  
  THE SYSTEM SHALL ensure it passes all eight format invariants.

- WHEN the fallback stack is returned,  
  THE SYSTEM SHALL include a flag in the response indicating it is a fallback, so the client can display an appropriate message to the teacher.

---

### REQ-5: API key security

**As a** product owner,  
**I want** the LLM API key to remain server-side at all times,  
**so that** teachers' school accounts and our API quota are never exposed.

#### Acceptance Criteria

- WHEN the stack generator runs,  
  THE SYSTEM SHALL read the API key from a server-side environment variable only.

- WHEN a stack is returned to the client,  
  THE SYSTEM SHALL NOT include the API key, any LLM response headers, or any other server credentials in the payload.

- WHEN the exported HTML file is produced (any stage),  
  THE SYSTEM SHALL NOT inline the API key or any server-side secret into the file.

---

### REQ-6: Generated content follows audience writing rules

**As a** teacher,  
**I want** the generated card text to be clear and age-appropriate,  
**so that** my pupils can read and answer the questions without confusion.

#### Acceptance Criteria

- WHEN card content is generated,  
  THE SYSTEM SHALL instruct the LLM to use short sentences, active voice, and no technical jargon.

- WHEN card content is generated,  
  THE SYSTEM SHALL instruct the LLM to use Irish/UK English spelling (colour, recognise, etc.).

- WHEN card content is generated for a quiz card,  
  THE SYSTEM SHALL instruct the LLM to provide one clearly correct answer and at least two clearly incorrect answers.

- WHEN card content is generated,  
  THE SYSTEM SHALL instruct the LLM to use "pupils" not "students" in any generated text.

---

### REQ-8: Truly progressive delivery of generated cards

**As a** teacher,
**I want** to watch each card appear the moment the AI finishes it,
**so that** the wait feels alive and I see the real questions taking shape as
they are written, not all at once after a long pause.

#### Acceptance Criteria

- WHEN the client requests `POST /api/generate` with `Accept: application/x-ndjson`,
  THE SYSTEM SHALL ask the LLM to emit the stack as JSON Lines (a stack-header
  line, then one card object per line) with `stream: true`, parse the token
  stream incrementally, and write each `card` message to the client the moment
  that card's line is complete and passes shape validation — before the LLM
  response has finished.

- WHEN the LLM stream delivers a card line split across network chunks, or a
  partial line, THE SYSTEM SHALL reassemble the line before parsing it and
  SHALL NOT emit a card until its line is complete.

- WHEN the client requests NDJSON,
  THE SYSTEM SHALL stream newline-delimited JSON: exactly one `start` message,
  then one `card` message per card in the order the model produces them, then
  exactly one terminator (`done` with the whole validated stack, or `error`).
  A `reset` message MAY precede a second `start` (see below).

- WHEN the client does not request NDJSON,
  THE SYSTEM SHALL keep the existing single-response JSON behaviour unchanged
  (`GenerateSuccess` / `GenerateError`), produced by the non-streaming path.

- WHEN a card is streamed,
  THE SYSTEM SHALL shape-validate that card before writing it, and SHALL
  validate the whole assembled stack before the `done` message.

- WHEN the LLM stream fails for ANY reason — no API key, the service is
  unreachable or returns a non-2xx response, the stream dies partway, a card
  line is malformed, or the assembled stack fails whole-stack validation —
  THE SYSTEM SHALL stop the streamed attempt and fall back to the non-streaming
  retry + deterministic offline path. If cards were already dealt from the
  abandoned partial stream, THE SYSTEM SHALL first emit a `reset` message and
  THE CLIENT SHALL clear every dealt card before the replacement stack streams
  in. If even the fallback path cannot produce a stack, THE SYSTEM SHALL emit a
  single plain-language `error` message (never a stack trace or raw error code).

- WHEN the deterministic offline fallback is streamed,
  THE SYSTEM SHALL pace the cards with a small fixed delay so the dealing shows
  in a demo, and THIS PACING SHALL apply only to the offline fallback — never to
  the real LLM path, where the gap between cards is the model's own output rate.

- WHEN NDJSON is requested but the prompt is empty, whitespace-only, or longer
  than 500 characters,
  THE SYSTEM SHALL still reject it with a 400 before streaming (REQ-7), applying
  the same 16 KB request-body limit as the JSON path.

- WHEN cards stream in,
  THE CLIENT SHALL deal each card onto the pile as it arrives with the card's
  real question — labelled "Card N of M" on the fallback path (total known) and
  "Card N" on the live LLM path (total not known up front).

- WHEN the LLM stream is used,
  THE SYSTEM SHALL carry the same API-key handling and no-secrets guarantees as
  the non-streaming call: the key is read only from a server-side environment
  variable, sent only in the request header, and never appears in any streamed
  message or error.

---

### REQ-7: Input validation

**As a** teacher,  
**I want** the system to catch obviously bad requests early,  
**so that** I get a clear message and don't waste time waiting for a generation that can't work.

#### Acceptance Criteria

- WHEN the teacher submits an empty or whitespace-only prompt,  
  THE SYSTEM SHALL reject the request immediately and SHALL return a plain-language error without calling the LLM.

- WHEN the teacher submits a prompt longer than 500 characters,  
  THE SYSTEM SHALL reject the request immediately and SHALL return a plain-language error without calling the LLM.

- WHEN the request payload is malformed (missing required fields, wrong types),  
  THE SYSTEM SHALL return a 400 response with a plain-language error message.
