// tests/reachability.test.ts
// TASK-22 o + i: the "before you share" check finds unreachable cards and
// dead-end quiz answers; repairFlow links them back in; addCardAfter inserts a
// reachable card; buildTypedStack turns typed questions into a playable stack.

import { describe, it, expect } from "vitest";
import { checkReachability } from "../src/shared/reachability.js";
import { addCardAfter, takeLastInsertedCardId, repairFlow } from "../src/editor/operations.js";
import { buildTypedStack } from "../src/editor/localDecks.js";
import { vikingsStack, timesTablesStack } from "../src/shared/readyMadeStacks.js";
import { validate } from "../src/shared/validator.js";
import { isRejected } from "../src/editor/types.js";
import type { Stack } from "../src/shared/types.js";

function asStack(r: Stack | { rejected: true; message: string }): Stack {
  if (isRejected(r as never)) throw new Error("expected a Stack, got Rejected");
  return r as Stack;
}

describe("reachability check (TASK-22 o)", () => {
  it("a healthy linked deck is fully reachable with no dead ends", () => {
    const report = checkReachability(vikingsStack());
    expect(report.ok).toBe(true);
    expect(report.unreachable).toHaveLength(0);
    expect(report.deadEndQuiz).toHaveLength(0);
  });

  it("a card placed after the end card is reported unreachable", () => {
    const stack = vikingsStack();
    // Move a content card to AFTER the end card (the J2 'Add Card' bug shape).
    const endIdx = stack.cards.findIndex((c) => c.kind === "end");
    const quiz = stack.cards.find((c) => c.kind === "quiz")!;
    const without = stack.cards.filter((c) => c.id !== quiz.id);
    const broken: Stack = { ...stack, cards: [...without, quiz] };
    void endIdx;
    const report = checkReachability(broken);
    expect(report.ok).toBe(false);
    expect(report.unreachable.some((c) => c.id === quiz.id)).toBe(true);
  });

  it("repairFlow makes an unreachable quiz card reachable again and stays valid", () => {
    // Use the all-quiz times-tables deck so re-linking quiz answers forward
    // fully restores the chain (flash/story chains are out of repairFlow's
    // quiz-relink scope by design).
    const stack = timesTablesStack();
    const quiz = stack.cards.find((c) => c.kind === "quiz")!;
    const without = stack.cards.filter((c) => c.id !== quiz.id);
    const broken: Stack = { ...stack, cards: [...without, quiz] }; // quiz after end
    expect(checkReachability(broken).ok).toBe(false);

    const fixed = asStack(repairFlow(broken));
    expect(validate(fixed).valid).toBe(true);
    const report = checkReachability(fixed);
    expect(report.ok).toBe(true);
    // The end card is last again.
    expect(fixed.cards[fixed.cards.length - 1]!.kind).toBe("end");
  });
});

describe("addCardAfter (TASK-22 i)", () => {
  it("inserts the new card before the end card, reachable, and records its id", () => {
    const stack = vikingsStack();
    const firstId = stack.cards[0]!.id;
    const next = asStack(addCardAfter(stack, firstId, "quiz"));
    const newId = takeLastInsertedCardId();
    expect(newId).not.toBeNull();

    // It is NOT after the end card.
    const endIdx = next.cards.findIndex((c) => c.kind === "end");
    const newIdx = next.cards.findIndex((c) => c.id === newId);
    expect(newIdx).toBeGreaterThanOrEqual(0);
    expect(newIdx).toBeLessThan(endIdx);

    // The class can reach it, and the stack stays valid.
    expect(validate(next).valid).toBe(true);
    expect(checkReachability(next).reachable.has(newId!)).toBe(true);
  });

  it("refuses to add a second end card", () => {
    const stack = vikingsStack();
    const res = addCardAfter(stack, stack.cards[0]!.id, "end");
    expect(isRejected(res)).toBe(true);
  });
});

describe("buildTypedStack (TASK-22 q)", () => {
  it("builds a valid playable stack from typed questions (no server)", () => {
    const stack = buildTypedStack("Fractions", [
      { question: "1/2 + 1/2 = ?", right: "1", wrong: ["0", "1/4"] },
      { question: "What is a half of 10?", right: "5", wrong: ["2", "20"] },
    ]);
    expect(stack).not.toBeNull();
    expect(validate(stack!).valid).toBe(true);
    // Two quiz cards + one end card.
    expect(stack!.cards.filter((c) => c.kind === "quiz")).toHaveLength(2);
    expect(stack!.cards.filter((c) => c.kind === "end")).toHaveLength(1);
    // Fully reachable, no dead ends.
    expect(checkReachability(stack!).ok).toBe(true);
  });

  it("returns null when no question has a right + a wrong answer", () => {
    expect(buildTypedStack("x", [{ question: "", right: "", wrong: [""] }])).toBeNull();
    expect(buildTypedStack("x", [{ question: "Q", right: "A", wrong: [""] }])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TASK-26b/o — the two dead ends the round-2 teacher actually hit

import { describeProblems } from "../src/shared/reachability.js";
import { ensureForwardLinks } from "../src/shared/flow.js";
import type { Stack as StackT, Card as CardT } from "../src/shared/types.js";

const U = (n: number): string => `cafe0000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

function deck(content: CardT[]): StackT {
  return {
    id: U(1),
    title: "T",
    theme: { background: "#fff", foreground: "#000", font: "sans-serif" },
    cards: [...content, { id: U(99), kind: "end", elements: [{ type: "field", id: U(98), x: 0, y: 0, w: 100, h: 50, variable: "score" }], actions: [] }],
  };
}

describe("TASK-26o: the share check catches both dead ends", () => {
  it("flags a flash card with no way forward (nothing to press)", () => {
    const flash: CardT = {
      id: U(10), kind: "flash", actions: [],
      elements: [
        { type: "text", id: U(11), x: 0, y: 0, w: 100, h: 50, content: "Term" },
        { type: "text", id: U(12), x: 0, y: 60, w: 100, h: 50, content: "Explanation" },
      ],
    };
    const report = checkReachability(deck([flash]));
    expect(report.ok).toBe(false);
    expect(report.stuck.map((c) => c.id)).toEqual([U(10)]);
    // The score card is (correctly) also unreachable when the only card is stuck.
    const lines = describeProblems(report, (c) => (c.kind === "end" ? "the last card" : "Card 1 — Term"));
    expect(lines).toContain("Card 1 — Term has no way to move on.");
    expect(lines).toContain("The class can't reach the last card.");
  });

  it("flags a flash card whose Next button goes nowhere", () => {
    const flash: CardT = {
      id: U(10), kind: "flash", actions: [],
      elements: [
        { type: "text", id: U(11), x: 0, y: 0, w: 100, h: 50, content: "Term" },
        { type: "button", id: U(12), x: 0, y: 60, w: 100, h: 50, label: "Next Card", actions: [] },
      ],
    };
    const report = checkReachability(deck([flash]));
    expect(report.deadEndOther.map((c) => c.id)).toEqual([U(10)]);
    expect(report.ok).toBe(false);
  });

  it("flags a quiz button made with Add Button (no action at all), not just scored answers", () => {
    const quizCard: CardT = {
      id: U(20), kind: "quiz", actions: [],
      elements: [
        { type: "text", id: U(21), x: 0, y: 0, w: 100, h: 50, content: "Q?" },
        { type: "button", id: U(22), x: 0, y: 60, w: 100, h: 50, label: "Right", actions: [{ type: "score", delta: 1 }, { type: "goto", cardId: U(99) }] },
        { type: "button", id: U(23), x: 0, y: 120, w: 100, h: 50, label: "Wrong", actions: [{ type: "score", delta: 0 }, { type: "goto", cardId: U(99) }] },
        { type: "button", id: U(24), x: 0, y: 180, w: 100, h: 50, label: "Clouds", actions: [] },
      ],
    };
    const report = checkReachability(deck([quizCard]));
    expect(report.deadEndQuiz.map((c) => c.id)).toEqual([U(20)]);
    expect(describeProblems(report, () => "Card 1")).toEqual(["Card 1 has an answer that goes nowhere."]);
  });

  it("does not repeat a card in two lists", () => {
    const flash: CardT = {
      id: U(10), kind: "flash", actions: [],
      elements: [
        { type: "text", id: U(11), x: 0, y: 0, w: 100, h: 50, content: "Term" },
        { type: "button", id: U(12), x: 0, y: 60, w: 100, h: 50, label: "Next Card", actions: [] },
      ],
    };
    const report = checkReachability(deck([flash]));
    expect(report.deadEndOther).toHaveLength(1);
    expect(report.stuck).toHaveLength(0);
  });

  it("repairFlow closes both dead ends and the check goes green", () => {
    const flash: CardT = {
      id: U(10), kind: "flash", actions: [],
      elements: [
        { type: "text", id: U(11), x: 0, y: 0, w: 100, h: 50, content: "Term" },
        { type: "text", id: U(12), x: 0, y: 60, w: 100, h: 50, content: "Explanation" },
      ],
    };
    const quizCard: CardT = {
      id: U(20), kind: "quiz", actions: [],
      elements: [
        { type: "text", id: U(21), x: 0, y: 0, w: 100, h: 50, content: "Q?" },
        { type: "button", id: U(22), x: 0, y: 60, w: 100, h: 50, label: "Right", actions: [{ type: "score", delta: 1 }] },
        { type: "button", id: U(23), x: 0, y: 120, w: 100, h: 50, label: "Wrong", actions: [{ type: "score", delta: 0 }] },
        { type: "button", id: U(24), x: 0, y: 180, w: 100, h: 50, label: "Clouds", actions: [] },
      ],
    };
    const broken = deck([flash, quizCard]);
    expect(checkReachability(broken).ok).toBe(false);
    const fixed = repairFlow(broken) as StackT;
    expect(checkReachability(fixed).ok).toBe(true);
    // The flash card gained a Next Card that goes on to the quiz.
    const next = fixed.cards[0]!.elements.find((e) => e.type === "button");
    expect(next && next.type === "button" && next.label).toBe("Next Card");
  });

  it("a healthy deck stays healthy through ensureForwardLinks (no-op)", () => {
    const s = vikingsStack();
    expect(JSON.stringify(ensureForwardLinks(s))).toBe(JSON.stringify(s));
  });
});
