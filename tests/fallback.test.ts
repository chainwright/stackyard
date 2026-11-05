// tests/fallback.test.ts
// The offline fallback returns a REAL ready-made deck (built-app review P0 #4),
// not the old three-card "Correct Answer"/"Wrong Answer" stub. The sentence
// that matches a Start-screen example gets that deck; any other sentence gets
// the closest deck, flagged as a ready-made example.

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { build, buildReadyMade } from "../server/fallback.js";
import { validate } from "../src/shared/validator.js";
import type { GenerateRequest, Card, ButtonElement } from "../src/shared/types.js";

function req(prompt: string): GenerateRequest {
  return { prompt };
}

function answerButtons(card: Card): ButtonElement[] {
  return card.elements.filter(
    (e): e is ButtonElement => e.type === "button" && e.actions.some((a) => a.type === "score"),
  );
}

// ---------------------------------------------------------------------------
// Matching the three Start-screen examples

describe("fallback.buildReadyMade — matches the Start-screen examples", () => {
  it("the Vikings example → the Vikings deck (matched)", () => {
    const r = buildReadyMade(req("A 10-card quiz about the Vikings in Ireland, the right answer plays a cheer"));
    expect(r.key).toBe("vikings");
    expect(r.matched).toBe(true);
    expect(r.stack.title).toBe("Vikings in Ireland");
  });

  it("the times tables example → the times tables deck (matched)", () => {
    const r = buildReadyMade(req("A quiz game for the times tables up to 12"));
    expect(r.key).toBe("times-tables");
    expect(r.matched).toBe(true);
    expect(r.stack.title).toBe("Times Tables Game");
  });

  it("the Irish words example → the Irish words deck (matched)", () => {
    const r = buildReadyMade(req("Flashcards for ten everyday words in Irish"));
    expect(r.key).toBe("irish-words");
    expect(r.matched).toBe(true);
    expect(r.stack.title).toBe("Everyday Words in Irish");
  });

  it("an unrelated free-text sentence → the closest deck, NOT matched", () => {
    const r = buildReadyMade(req("a lesson about the solar system and the planets"));
    expect(r.matched).toBe(false);
    // Still a real, complete, valid deck.
    expect(validate(r.stack).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Every ready-made deck is real, valid, and plays through

describe("fallback.build — real ready-made decks", () => {
  const prompts = [
    "A 10-card quiz about the Vikings in Ireland",
    "A quiz game for the times tables up to 12",
    "Flashcards for ten everyday words in Irish",
  ];

  for (const prompt of prompts) {
    const stack = build(req(prompt));

    it(`"${prompt.slice(0, 24)}…" produces a valid stack`, () => {
      expect(validate(stack).valid).toBe(true);
    });

    it(`"${prompt.slice(0, 24)}…" has exactly one end card and at least 3 cards`, () => {
      expect(stack.cards.filter((c) => c.kind === "end")).toHaveLength(1);
      expect(stack.cards.length).toBeGreaterThanOrEqual(3);
    });

    it(`"${prompt.slice(0, 24)}…" has no placeholder "Correct Answer"/"Wrong Answer" labels`, () => {
      const labels = stack.cards.flatMap((c) =>
        c.elements.filter((e) => e.type === "button").map((e) => (e as ButtonElement).label),
      );
      expect(labels).not.toContain("Correct Answer");
      expect(labels).not.toContain("Wrong Answer");
    });

    it(`"${prompt.slice(0, 24)}…" links quiz answers forward (not straight to the end)`, () => {
      const endIndex = stack.cards.findIndex((c) => c.kind === "end");
      const endId = stack.cards[endIndex]!.id;
      for (let i = 0; i < stack.cards.length; i++) {
        const card = stack.cards[i]!;
        if (card.kind !== "quiz") continue;
        const isLastQuestion = i === endIndex - 1;
        for (const btn of answerButtons(card)) {
          const g = btn.actions.find((a) => a.type === "goto");
          const target = g && g.type === "goto" ? g.cardId : null;
          expect(target).toBe(stack.cards[i + 1]!.id);
          if (!isLastQuestion) expect(target).not.toBe(endId);
        }
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Determinism + property: any prompt yields a valid ready-made deck

describe("fallback.build — determinism and validity for any prompt", () => {
  it("same prompt returns the same deck", () => {
    const p = "a five-card quiz about space";
    expect(JSON.stringify(build(req(p)))).toBe(JSON.stringify(build(req(p))));
  });

  it("any non-empty prompt up to 500 chars yields a valid ready-made deck", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 500 }), (prompt) => {
        const stack = build({ prompt });
        const result = validate(stack);
        if (!result.valid) {
          throw new Error(`validate() failed for "${prompt.slice(0, 40)}": ${result.errors.join(", ")}`);
        }
        expect(result.valid).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});
