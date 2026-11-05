// tests/link-forward.test.ts
// linkQuizAnswersForward: quiz answers advance to the next card, never straight
// to the end card unless the quiz is the last question (P0 #1 in the built-app
// review). Also checks the demo stack and a generator-shaped stack.

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { linkQuizAnswersForward } from "../src/shared/linkForward.js";
import { validate } from "../src/shared/validator.js";
import { demoStack } from "../src/editor/demoStack.js";
import type { Stack, Card, ButtonElement } from "../src/shared/types.js";

// ---------------------------------------------------------------------------
// Helpers

function answerButtons(card: Card): ButtonElement[] {
  return card.elements.filter(
    (e): e is ButtonElement =>
      e.type === "button" && e.actions.some((a) => a.type === "score"),
  );
}

function gotoTarget(btn: ButtonElement): string | null {
  const g = btn.actions.find((a) => a.type === "goto");
  return g && g.type === "goto" ? g.cardId : null;
}

/** Build an N-quiz stack where every answer points at the end card (the bug). */
function allAnswersToEndStack(nQuiz: number): Stack {
  const endId = "aaaaaaaa-0000-4000-8000-00000000ffff";
  const cards: Card[] = [];
  for (let i = 0; i < nQuiz; i++) {
    const id = `bbbbbbbb-0000-4000-8000-${String(i).padStart(12, "0")}`;
    cards.push({
      id,
      kind: "quiz",
      elements: [
        { type: "text", id: `cccccccc-0000-4000-8000-${String(i).padStart(12, "0")}`, x: 48, y: 104, w: 704, h: 128, content: `Q${i}?` },
        { type: "button", id: `dddddddd-0000-4000-8000-${String(i).padStart(12, "0")}`, x: 48, y: 296, w: 344, h: 96, label: "Right", actions: [{ type: "score", delta: 1 }, { type: "goto", cardId: endId }] },
        { type: "button", id: `eeeeeeee-0000-4000-8000-${String(i).padStart(12, "0")}`, x: 408, y: 296, w: 344, h: 96, label: "Wrong", actions: [{ type: "score", delta: 0 }, { type: "goto", cardId: endId }] },
      ],
      actions: [],
    });
  }
  cards.push({ id: endId, kind: "end", elements: [{ type: "field", id: "ffffffff-0000-4000-8000-000000000001", x: 48, y: 420, w: 704, h: 60, variable: "score" }], actions: [] });
  return { id: "11111111-0000-4000-8000-000000000001", title: "Flow", theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" }, cards };
}

// ---------------------------------------------------------------------------

describe("linkQuizAnswersForward — quiz answers advance to the next card", () => {
  it("retargets every answer from the end card to the following card", () => {
    const before = allAnswersToEndStack(4);
    const after = linkQuizAnswersForward(before);
    const endId = after.cards[after.cards.length - 1]!.id;

    for (let i = 0; i < after.cards.length; i++) {
      const card = after.cards[i]!;
      if (card.kind !== "quiz") continue;
      const nextId = after.cards[i + 1]!.id;
      for (const btn of answerButtons(card)) {
        expect(gotoTarget(btn)).toBe(nextId);
      }
    }
    // Only the last quiz (index 3) targets the end card.
    expect(answerButtons(after.cards[3]!).map(gotoTarget).every((t) => t === endId)).toBe(true);
    // Earlier quizzes do NOT target the end card.
    for (let i = 0; i < 3; i++) {
      for (const btn of answerButtons(after.cards[i]!)) {
        expect(gotoTarget(btn)).not.toBe(endId);
      }
    }
  });

  it("a quiz answer never targets the end card unless it is the last question", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 12 }), (nQuiz) => {
        const after = linkQuizAnswersForward(allAnswersToEndStack(nQuiz));
        const endIndex = after.cards.findIndex((c) => c.kind === "end");
        const endId = after.cards[endIndex]!.id;
        for (let i = 0; i < after.cards.length; i++) {
          const card = after.cards[i]!;
          if (card.kind !== "quiz") continue;
          const isLastQuestion = i === endIndex - 1;
          for (const btn of answerButtons(card)) {
            const target = gotoTarget(btn);
            if (target === endId) {
              // Only allowed when this quiz is the last card before the end.
              expect(isLastQuestion).toBe(true);
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it("leaves non-answer buttons (story branches, Start, Next) untouched", () => {
    const stack = demoStack();
    const after = linkQuizAnswersForward(stack);
    // The story card's branch buttons keep their own gotos.
    const story = after.cards.find((c) => c.kind === "story")!;
    const branchButtons = story.elements.filter((e) => e.type === "button");
    expect(branchButtons.length).toBeGreaterThan(0);
    for (const b of branchButtons) {
      if (b.type !== "button") continue;
      // A story branch is not a quiz answer (no score action).
      expect(b.actions.some((a) => a.type === "score")).toBe(false);
    }
  });

  it("keeps the stack valid", () => {
    const after = linkQuizAnswersForward(allAnswersToEndStack(5));
    expect(validate(after).valid).toBe(true);
  });

  it("the demo stack's quizzes advance to the next card, not the end", () => {
    const stack = demoStack();
    expect(validate(stack).valid).toBe(true);
    const endIndex = stack.cards.findIndex((c) => c.kind === "end");
    const endId = stack.cards[endIndex]!.id;
    for (let i = 0; i < stack.cards.length; i++) {
      const card = stack.cards[i]!;
      if (card.kind !== "quiz") continue;
      const isLastQuestion = i === endIndex - 1;
      for (const btn of answerButtons(card)) {
        const target = gotoTarget(btn);
        expect(target).toBe(stack.cards[i + 1]!.id);
        if (!isLastQuestion) expect(target).not.toBe(endId);
      }
    }
  });
});
