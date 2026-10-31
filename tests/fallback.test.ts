// tests/fallback.test.ts
// Unit tests + fast-check property tests for server/fallback.ts.
//
// Property: for ANY non-empty prompt up to 500 characters
//   1. fallback.build() returns a stack that passes validate()
//   2. repeated calls with the same prompt return the identical stack (determinism)

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { build } from "../server/fallback.js";
import { validate } from "../src/shared/validator.js";
import type { GenerateRequest } from "../src/shared/types.js";

// ---------------------------------------------------------------------------
// Helpers

function req(prompt: string): GenerateRequest {
  return { prompt };
}

// ---------------------------------------------------------------------------
// Unit tests — specific known prompts

describe("fallback.build — structure", () => {
  const stack = build(req("a quiz about Irish rivers"));

  it("returns exactly three cards", () => {
    expect(stack.cards).toHaveLength(3);
  });

  it("first card is kind story", () => {
    expect(stack.cards[0]?.kind).toBe("story");
  });

  it("second card is kind quiz", () => {
    expect(stack.cards[1]?.kind).toBe("quiz");
  });

  it("third card is kind end", () => {
    expect(stack.cards[2]?.kind).toBe("end");
  });

  it("title is derived from the prompt (trimmed, capped at 120 chars)", () => {
    const longPrompt = "x".repeat(200);
    const s = build(req(longPrompt));
    expect(s.title).toBe("x".repeat(120));
  });

  it("title is trimmed", () => {
    const s = build(req("  spaces around  "));
    expect(s.title).toBe("spaces around");
  });

  it("stack has a non-blank title", () => {
    expect(stack.title.trim()).not.toBe("");
  });

  it("quiz card has exactly one correct button (score delta 1)", () => {
    const quizCard = stack.cards[1]!;
    const buttons = quizCard.elements.filter((e) => e.type === "button");
    const correct = buttons.filter(
      (e) =>
        e.type === "button" &&
        e.actions.some((a) => a.type === "score" && a.delta === 1)
    );
    expect(correct).toHaveLength(1);
  });

  it("quiz card has at least one incorrect button", () => {
    const quizCard = stack.cards[1]!;
    const buttons = quizCard.elements.filter((e) => e.type === "button");
    const incorrect = buttons.filter(
      (e) =>
        e.type === "button" &&
        !e.actions.some((a) => a.type === "score" && a.delta === 1)
    );
    expect(incorrect.length).toBeGreaterThanOrEqual(1);
  });

  it("all goto actions reference existing card IDs", () => {
    const cardIds = new Set(stack.cards.map((c) => c.id));
    for (const card of stack.cards) {
      for (const el of card.elements) {
        if (el.type === "button") {
          for (const action of el.actions) {
            if (action.type === "goto") {
              expect(cardIds.has(action.cardId)).toBe(true);
            }
          }
        }
      }
    }
  });

  it("all element IDs are unique", () => {
    const ids = [
      stack.id,
      ...stack.cards.map((c) => c.id),
      ...stack.cards.flatMap((c) => c.elements.map((e) => e.id)),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("fallback.build — validate()", () => {
  it("passes validate() for a typical prompt", () => {
    const result = validate(build(req("a quiz about the Vikings in Ireland")));
    expect(result.valid).toBe(true);
  });

  it("passes validate() for a short single-word prompt", () => {
    const result = validate(build(req("maths")));
    expect(result.valid).toBe(true);
  });

  it("passes validate() for a 500-character prompt", () => {
    const result = validate(build(req("a".repeat(500))));
    expect(result.valid).toBe(true);
  });
});

describe("fallback.build — determinism", () => {
  it("same prompt returns the same stack", () => {
    const prompt = "a five-card quiz about space";
    const s1 = build(req(prompt));
    const s2 = build(req(prompt));
    expect(JSON.stringify(s1)).toBe(JSON.stringify(s2));
  });

  it("different prompts return different stacks", () => {
    const s1 = build(req("quiz about the Vikings"));
    const s2 = build(req("quiz about the Normans"));
    // At minimum, IDs should differ
    expect(s1.id).not.toBe(s2.id);
  });

  it("all IDs differ between stacks built from different prompts", () => {
    const s1 = build(req("astronomy quiz"));
    const s2 = build(req("geography quiz"));
    const ids1 = new Set([s1.id, ...s1.cards.map((c) => c.id)]);
    const ids2 = new Set([s2.id, ...s2.cards.map((c) => c.id)]);
    // No overlap (very high probability with deterministic hash)
    for (const id of ids1) {
      expect(ids2.has(id)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// fast-check property test

describe("fallback.build — property: any non-empty prompt up to 500 chars", () => {
  // Arbitrary: any string between 1 and 500 characters
  const promptArb = fc.string({ minLength: 1, maxLength: 500 });

  it("always produces a stack that passes validate()", () => {
    fc.assert(
      fc.property(promptArb, (prompt) => {
        const stack = build({ prompt });
        const result = validate(stack);
        // Provide error detail if it fails
        if (!result.valid) {
          throw new Error(
            `validate() failed for prompt "${prompt.slice(0, 60)}...": ${result.errors.join(", ")}`
          );
        }
        expect(result.valid).toBe(true);
      }),
      { numRuns: 500 }
    );
  });

  it("always produces the same stack for the same prompt (deterministic)", () => {
    fc.assert(
      fc.property(promptArb, (prompt) => {
        const s1 = build({ prompt });
        const s2 = build({ prompt });
        expect(JSON.stringify(s1)).toBe(JSON.stringify(s2));
      }),
      { numRuns: 500 }
    );
  });
});
