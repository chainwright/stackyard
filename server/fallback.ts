// server/fallback.ts
// Builds a deterministic fallback Stack from a GenerateRequest.
// The same prompt always produces the same stack (no LLM call).
// The output must pass all seven invariants in src/shared/validator.ts.

import type { GenerateRequest, Stack, Card } from "../src/shared/types.js";

// ---------------------------------------------------------------------------
// Deterministic UUID generation from a seed string
//
// We need UUID v4-shaped strings that are unique within one stack and
// reproducible across calls for the same prompt. Strategy:
//   1. Hash the prompt to a 32-bit seed with a simple, fast hash (djb2).
//   2. Derive each UUID by hashing (seed + index) repeatedly.
//   3. Format as 8-4-4-4-12 hex with the version/variant bits set per RFC 4122.

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    // djb2: h = h * 33 ^ char
    h = Math.imul(h, 33) ^ s.charCodeAt(i);
  }
  // Unsigned 32-bit
  return h >>> 0;
}

/**
 * Produce a 128-bit value as a Uint8Array, seeded by (seed XOR index).
 * Uses a simple LCG for each byte so we don't need a crypto import.
 */
function seededBytes(seed: number, index: number): Uint8Array {
  const bytes = new Uint8Array(16);
  // Mix seed and index
  let state = (seed ^ (index * 2654435761)) >>> 0;
  for (let i = 0; i < 16; i++) {
    // LCG: state = (state * 1664525 + 1013904223) mod 2^32
    state = Math.imul(state, 1664525) + 1013904223;
    state = state >>> 0;
    bytes[i] = state >>> 24;
  }
  return bytes;
}

/**
 * Format 16 bytes as a RFC 4122 v4 UUID string.
 * Sets version bits (byte 6 → 0x4x) and variant bits (byte 8 → 0x8x-0xbx).
 */
function bytesToUuidV4(bytes: Uint8Array): string {
  // Safe: we always pass exactly 16 bytes from seededBytes
  const b = bytes;
  // version 4
  const b6 = ((b[6] ?? 0) & 0x0f) | 0x40;
  // variant 10xx
  const b8 = ((b[8] ?? 0) & 0x3f) | 0x80;

  const hex = (n: number, len: number): string =>
    n.toString(16).padStart(len, "0");

  return (
    hex((b[0] ?? 0) * 256 * 256 * 256 + (b[1] ?? 0) * 256 * 256 + (b[2] ?? 0) * 256 + (b[3] ?? 0), 8) +
    "-" +
    hex((b[4] ?? 0) * 256 + (b[5] ?? 0), 4) +
    "-" +
    hex(b6 * 256 + (b[7] ?? 0), 4) +
    "-" +
    hex(b8 * 256 + (b[9] ?? 0), 4) +
    "-" +
    hex(
      (b[10] ?? 0) * 256 * 256 * 256 * 256 * 256 +
      (b[11] ?? 0) * 256 * 256 * 256 * 256 +
      (b[12] ?? 0) * 256 * 256 * 256 +
      (b[13] ?? 0) * 256 * 256 +
      (b[14] ?? 0) * 256 +
      (b[15] ?? 0),
      12
    )
  );
}

/** Generate the nth deterministic UUID for a given prompt. */
function deterministicUuid(seed: number, index: number): string {
  return bytesToUuidV4(seededBytes(seed, index));
}

// ---------------------------------------------------------------------------
// Fallback stack construction

/**
 * Build a deterministic three-card fallback stack:
 *   Card 0 — story (intro): title text + "Start" button → quiz card
 *   Card 1 — quiz (placeholder): question + correct button + incorrect button → end card
 *   Card 2 — end: score display field
 */
export function build(request: GenerateRequest): Stack {
  const rawTitle = request.prompt.trim().slice(0, 120);
  // Ensure title is never blank (prompt is validated upstream, but be safe)
  const title = rawTitle.length > 0 ? rawTitle : "Lesson";

  const seed = djb2(request.prompt);

  // Allocate IDs: 0=stack, 1=intro card, 2=quiz card, 3=end card,
  //               4=intro text el, 5=start btn el, 6=quiz text el,
  //               7=correct btn el, 8=incorrect btn el, 9=end field el
  const ids = Array.from({ length: 10 }, (_, i) => deterministicUuid(seed, i));

  const [stackId, introId, quizId, endId,
         introTextId, startBtnId, quizTextId,
         correctBtnId, incorrectBtnId, endFieldId] = ids as [
    string, string, string, string,
    string, string, string,
    string, string, string
  ];

  // Content starts below y≈96 so it never collides with the player's derived
  // top chrome (the "Card N of M" meta line at y=48 and the running score at
  // the top-right). The player draws that chrome itself; the stack only holds
  // the card content, matching the mockup layout (question at y≈104, answer
  // tiles at y≈296/424).
  const introCard: Card = {
    id: introId,
    kind: "story",
    elements: [
      {
        type: "text",
        id: introTextId,
        x: 48,
        y: 104,
        w: 704,
        h: 224,
        content: title,
      },
      {
        type: "button",
        id: startBtnId,
        x: 320,
        y: 460,
        w: 160,
        h: 60,
        label: "Start",
        actions: [{ type: "goto", cardId: quizId }],
      },
    ],
    actions: [],
  };

  const quizCard: Card = {
    id: quizId,
    kind: "quiz",
    elements: [
      {
        type: "text",
        id: quizTextId,
        x: 48,
        y: 104,
        w: 704,
        h: 128,
        content: "Question 1: What is the topic of this lesson?",
      },
      {
        type: "button",
        id: correctBtnId,
        x: 48,
        y: 296,
        w: 344,
        h: 96,
        label: "Correct Answer",
        actions: [
          { type: "score", delta: 1 },
          { type: "sound", sound: "cheer" },
          { type: "goto", cardId: endId },
        ],
      },
      {
        type: "button",
        id: incorrectBtnId,
        x: 408,
        y: 296,
        w: 344,
        h: 96,
        label: "Wrong Answer",
        actions: [
          { type: "score", delta: 0 },
          { type: "sound", sound: "buzz" },
          { type: "goto", cardId: endId },
        ],
      },
    ],
    actions: [],
  };

  const endCard: Card = {
    id: endId,
    kind: "end",
    elements: [
      {
        type: "field",
        id: endFieldId,
        x: 300,
        y: 250,
        w: 200,
        h: 60,
        variable: "score",
      },
    ],
    actions: [],
  };

  const stack: Stack = {
    id: stackId,
    title,
    theme: {
      background: "#1a1a2e",
      foreground: "#e0e0e0",
      font: "sans-serif",
    },
    cards: [introCard, quizCard, endCard],
  };

  return stack;
}
