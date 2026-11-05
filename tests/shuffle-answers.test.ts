// tests/shuffle-answers.test.ts
// TASK-22 f + g: the correct answer is not always the first tile, and the
// ready-made deck content is believable and factually sound.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { shuffleQuizAnswers } from "../src/shared/shuffleAnswers.js";
import { linkQuizAnswersForward } from "../src/shared/linkForward.js";
import {
  vikingsStack,
  timesTablesStack,
  irishWordsStack,
} from "../src/shared/readyMadeStacks.js";
import { validate } from "../src/shared/validator.js";
import type { Stack, Card, ButtonElement } from "../src/shared/types.js";

/** The index (0-based) of the correct answer button within a quiz card. */
function correctIndex(card: Card): number {
  const answers = card.elements.filter(
    (e): e is ButtonElement => e.type === "button" && e.actions.some((a) => a.type === "score"),
  );
  return answers.findIndex((b) => b.actions.some((a) => a.type === "score" && a.delta === 1));
}

function quizCards(stack: Stack): Card[] {
  return stack.cards.filter((c) => c.kind === "quiz");
}

describe("answer shuffle (TASK-22 f)", () => {
  it("every ready-made deck still has exactly one correct answer per quiz card", () => {
    for (const build of [vikingsStack, timesTablesStack, irishWordsStack]) {
      const stack = build();
      expect(validate(stack).valid).toBe(true);
      for (const card of quizCards(stack)) {
        const answers = card.elements.filter(
          (e): e is ButtonElement => e.type === "button" && e.actions.some((a) => a.type === "score"),
        );
        const correct = answers.filter((b) => b.actions.some((a) => a.type === "score" && a.delta === 1));
        expect(correct).toHaveLength(1);
        expect(answers.length - correct.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("the correct answer is NOT always the first tile across the times-tables deck", () => {
    // 8 quiz cards: with a shuffle the correct index must vary (not all 0).
    const indices = quizCards(timesTablesStack()).map(correctIndex);
    expect(indices.length).toBeGreaterThanOrEqual(4);
    const distinct = new Set(indices);
    expect(distinct.size).toBeGreaterThan(1);
  });

  it("every correct answer still links forward (keeps its goto after shuffle)", () => {
    const stack = vikingsStack();
    for (const card of quizCards(stack)) {
      const answers = card.elements.filter(
        (e): e is ButtonElement => e.type === "button" && e.actions.some((a) => a.type === "score"),
      );
      for (const a of answers) {
        expect(a.actions.some((x) => x.type === "goto")).toBe(true);
      }
    }
  });

  it("is deterministic per stack id (same stack shuffles the same way)", () => {
    const a = JSON.stringify(timesTablesStack().cards);
    const b = JSON.stringify(timesTablesStack().cards);
    expect(a).toBe(b);
  });

  it("property: shuffling keeps validity, the one-correct rule, and element ids", () => {
    // A valid v4 uuid with a controllable prefix nibble sequence.
    const hexQuad = fc.stringMatching(/^[0-9a-f]{8}$/);
    fc.assert(
      fc.property(hexQuad, (hex) => {
        // Start from a linked (not-yet-shuffled) deck, give it a fresh id, and
        // shuffle — the id seeds the permutation.
        const base = linkQuizAnswersForward(vikingsStack());
        const stack: Stack = { ...base, id: `${hex}-0000-4000-8000-000000000001` };
        const shuffled = shuffleQuizAnswers(stack);

        expect(validate(shuffled).valid).toBe(true);

        // Same multiset of element ids as the input (round-trip-safe).
        const idsBefore = stack.cards.flatMap((c) => c.elements.map((e) => e.id)).sort();
        const idsAfter = shuffled.cards.flatMap((c) => c.elements.map((e) => e.id)).sort();
        expect(idsAfter).toEqual(idsBefore);

        // Exactly one correct answer per quiz card.
        for (const card of quizCards(shuffled)) {
          const answers = card.elements.filter(
            (e): e is ButtonElement => e.type === "button" && e.actions.some((a) => a.type === "score"),
          );
          expect(answers.filter((b) => b.actions.some((a) => a.type === "score" && a.delta === 1))).toHaveLength(1);
        }
      }),
      { numRuns: 50 },
    );
  });
});

describe("ready-made content (TASK-22 g)", () => {
  it("the Vikings deck no longer asks the false 'who sailed first' question", () => {
    const stack = vikingsStack();
    const questions = stack.cards
      .filter((c) => c.kind === "quiz")
      .map((c) => {
        const t = c.elements.find((e) => e.type === "text");
        return t && t.type === "text" ? t.content : "";
      });
    expect(questions.some((q) => /sailed to ireland first/i.test(q))).toBe(false);
  });

  it("the Vikings deck has no joke distractors (Cars / Phones / Plastic)", () => {
    const stack = vikingsStack();
    const labels = stack.cards.flatMap((c) =>
      c.elements.filter((e): e is ButtonElement => e.type === "button").map((b) => b.label),
    );
    for (const joke of ["Cars", "Phones", "Plastic"]) {
      expect(labels).not.toContain(joke);
    }
  });

  it("the longphort flash card describes a river/inlet, not the coast", () => {
    const stack = vikingsStack();
    const flash = stack.cards.find(
      (c) => c.kind === "flash" && c.elements.some((e) => e.type === "text" && e.content === "Longphort"),
    )!;
    const back = flash.elements.filter((e) => e.type === "text")[1];
    const text = back && back.type === "text" ? back.content : "";
    expect(text).toMatch(/river|inlet/i);
    expect(text).not.toMatch(/on the coast/i);
  });
});
