// server/promptBuilder.ts
// Assembles the system prompt and user message for the LLM.
// No LLM calls made here — pure string construction.

import type { GenerateRequest } from "../src/shared/types.js";

// ---------------------------------------------------------------------------
// System prompt (constant)

const SYSTEM_PROMPT = `You are a lesson card generator for Stackyard.
Your only job is to output a valid JSON object that conforms to the Stack schema below.
Do not output prose, markdown fences, explanations, or any text outside the JSON object.

## Stack schema

{
  "id": "<UUID v4>",
  "title": "<string, max 120 chars>",
  "theme": {
    "background": "<CSS colour string>",
    "foreground": "<CSS colour string>",
    "font": "<CSS font-family string>"
  },
  "cards": [
    {
      "id": "<UUID v4>",
      "kind": "quiz" | "flash" | "story" | "end",
      "elements": [ ...Element ],
      "actions": [ ...Action ]
    }
  ]
}

Element types:
- { "type": "text", "id": "<UUID>", "x": n, "y": n, "w": n, "h": n, "content": "..." }
- { "type": "button", "id": "<UUID>", "x": n, "y": n, "w": n, "h": n, "label": "...", "actions": [...] }
- { "type": "image", "id": "<UUID>", "x": n, "y": n, "w": n, "h": n, "src": "...", "alt": "..." }
- { "type": "field", "id": "<UUID>", "x": n, "y": n, "w": n, "h": n, "variable": "score" }

Action types:
- { "type": "goto", "cardId": "<UUID of an existing card>" }
- { "type": "score", "delta": 1 }   (correct answer) or { "type": "score", "delta": 0 }
- { "type": "sound", "sound": "cheer" }  or  { "type": "sound", "sound": "buzz" }
- { "type": "set", "variable": "<name>", "value": "<string or number>" }

## Invariants — you must satisfy all seven before responding

1. **Unique IDs** — Every id (stack, cards, elements) must be a UUID v4, unique within the document.
2. **Valid goto targets** — Every "goto" action must reference a cardId that exists in the stack.
3. **Exactly one end card** — The cards array must contain exactly one card with kind "end".
4. **Quiz answer rule** — Every card with kind "quiz" must have exactly one button whose actions include { "type": "score", "delta": 1 } (the correct answer) and at least one button that does not.
5. **Canvas bounds** — Every element must fit within an 800×600 canvas: x + w ≤ 800 and y + h ≤ 600.
6. **Non-empty title** — stack.title must not be blank or whitespace only.
7. **At least one non-end card** — The stack must contain at least one card that is not kind "end".

## Audience writing rules — apply to all generated card text

- Write for the year group specified in the prompt (default: 4th class, approximately 9–10 years old).
- Use everyday words. Avoid jargon.
- Short sentences. Active voice. One idea per sentence.
- Irish/UK English spelling: colour, behaviour, recognise, organise, fulfil, practise, licence (noun).
- Say "pupils" not "students".
- Questions must be unambiguous — one clearly correct answer.
- Title case for button labels. Sentence case for all other text.
`;

// ---------------------------------------------------------------------------
// Card count clamping

const COUNT_PATTERNS = [
  /\b(\d+)\s*(?:-\s*card|card)/i,
  /\b(\d+)\s*question/i,
  /\b(\d+)\s*slide/i,
];

const MAX_CARDS = 20;

function extractCardCount(prompt: string): number | null {
  for (const pattern of COUNT_PATTERNS) {
    const match = pattern.exec(prompt);
    if (match?.[1] !== undefined) {
      const n = parseInt(match[1], 10);
      if (!isNaN(n) && n > 0) return n;
    }
  }
  return null;
}

function buildUserBody(prompt: string): string {
  const detected = extractCardCount(prompt);
  if (detected !== null && detected > MAX_CARDS) {
    return (
      `Generate a stack for: "${prompt}"\n\n` +
      `Note: you requested ${detected} cards — cap the stack at ${MAX_CARDS} cards maximum.`
    );
  }
  return `Generate a stack for: "${prompt}"`;
}

// ---------------------------------------------------------------------------
// Public API

export function build(request: GenerateRequest): { system: string; user: string } {
  return {
    system: SYSTEM_PROMPT,
    user: buildUserBody(request.prompt),
  };
}

export function buildRetry(
  request: GenerateRequest,
  errors: string[]
): { system: string; user: string } {
  const bulletList = errors.map((e) => `  • ${e}`).join("\n");
  const user =
    `The previous stack had these validation errors:\n\n${bulletList}\n\n` +
    `Fix all of them and return the corrected stack for: "${request.prompt}"`;
  return {
    system: SYSTEM_PROMPT,
    user,
  };
}
