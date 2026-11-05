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

### REQ-8: Progressive delivery of generated cards

**As a** teacher,
**I want** to watch the cards appear one by one while my set is built,
**so that** the wait feels alive and I can see the real questions taking shape instead of a spinner.

#### Acceptance Criteria

- WHEN the client requests `POST /api/generate` with `Accept: application/x-ndjson`,
  THE SYSTEM SHALL stream the result as newline-delimited JSON: exactly one
  `start` message, then one `card` message per card in deck order, then exactly
  one terminator (`done` with the whole stack, or `error`).

- WHEN the client does not request NDJSON,
  THE SYSTEM SHALL keep the existing single-response JSON behaviour unchanged
  (`GenerateSuccess` / `GenerateError`).

- WHEN a card is streamed,
  THE SYSTEM SHALL shape-validate that card before writing it, and SHALL
  validate the whole assembled stack before the `done` message.

- WHEN a streamed card fails shape validation, or the assembled stack fails
  whole-stack validation, or generation fails,
  THE SYSTEM SHALL emit a single `error` message with a plain-language string
  (never a stack trace or raw error code) and stop — a clean fallback.

- WHEN NDJSON is requested but the prompt is empty, whitespace-only, or longer
  than 500 characters,
  THE SYSTEM SHALL still reject it with a 400 before streaming (REQ-7), applying
  the same 16 KB request-body limit as the JSON path.

- WHEN cards stream in,
  THE CLIENT SHALL deal each card onto the pile as it arrives, labelled "N of M"
  with the card's real question.

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
