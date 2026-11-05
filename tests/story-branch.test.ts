// tests/story-branch.test.ts
// Story cards branch: each choice leads to its own card (built-app review round
// 2, P0 #2 — the Vikings choices both went to card 6). The ready-made Vikings
// deck and the editor demo stack must give the two choices distinct targets,
// and `warnStack` flags a story card whose choices all share one target.

import { describe, it, expect } from "vitest";
import { vikingsStack } from "../src/shared/readyMadeStacks.js";
import { demoStack } from "../src/editor/demoStack.js";
import { validate, warnStack } from "../src/shared/validator.js";
import type { Stack, Card, ButtonElement } from "../src/shared/types.js";

function storyCards(stack: Stack): Card[] {
  return stack.cards.filter((c) => c.kind === "story");
}

function gotoTargets(card: Card): string[] {
  return card.elements
    .filter((e): e is ButtonElement => e.type === "button")
    .map((b) => b.actions.find((a) => a.type === "goto"))
    .filter((a): a is { type: "goto"; cardId: string } => a !== undefined && a.type === "goto")
    .map((a) => a.cardId);
}

describe("story branches: each choice goes to its own card", () => {
  it("the Vikings deck's branching story card sends its two choices to DIFFERENT cards", () => {
    const stack = vikingsStack();
    expect(validate(stack).valid).toBe(true);

    // The branching story card is the one with two choice buttons.
    const branching = storyCards(stack).find(
      (c) => c.elements.filter((e) => e.type === "button").length >= 2,
    );
    expect(branching, "a branching story card should exist").toBeDefined();

    const targets = gotoTargets(branching!);
    expect(targets.length).toBe(2);
    expect(targets[0]).not.toBe(targets[1]);

    // Both targets exist, and both rejoin the same later card (visibly after
    // the choice) via their own Continue button.
    const byId = new Map(stack.cards.map((c) => [c.id, c]));
    const consequenceA = byId.get(targets[0]!)!;
    const consequenceB = byId.get(targets[1]!)!;
    expect(consequenceA).toBeDefined();
    expect(consequenceB).toBeDefined();
    const rejoinA = gotoTargets(consequenceA);
    const rejoinB = gotoTargets(consequenceB);
    expect(rejoinA.length).toBe(1);
    expect(rejoinB.length).toBe(1);
    expect(rejoinA[0]).toBe(rejoinB[0]); // the branches rejoin
  });

  it("the editor demo stack's story choices also go to DIFFERENT cards", () => {
    const stack = demoStack();
    expect(validate(stack).valid).toBe(true);
    const branching = storyCards(stack).find(
      (c) => c.elements.filter((e) => e.type === "button").length >= 2,
    );
    expect(branching).toBeDefined();
    const targets = gotoTargets(branching!);
    expect(targets.length).toBe(2);
    expect(targets[0]).not.toBe(targets[1]);
  });

  it("neither built deck trips the single-target story warning", () => {
    expect(warnStack(vikingsStack())).toEqual([]);
    expect(warnStack(demoStack())).toEqual([]);
  });
});

describe("warnStack: a story card whose choices all share one target is flagged", () => {
  const base: Stack = {
    id: "11111111-0000-4000-8000-000000000001",
    title: "Branch test",
    theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" },
    cards: [
      {
        id: "22222222-0000-4000-8000-000000000001",
        kind: "story",
        elements: [
          { type: "text", id: "33333333-0000-4000-8000-000000000001", x: 48, y: 104, w: 704, h: 224, content: "Pick one." },
          { type: "button", id: "44444444-0000-4000-8000-000000000001", x: 48, y: 360, w: 344, h: 80, label: "A", actions: [{ type: "goto", cardId: "22222222-0000-4000-8000-000000000003" }] },
          { type: "button", id: "44444444-0000-4000-8000-000000000002", x: 408, y: 360, w: 344, h: 80, label: "B", actions: [{ type: "goto", cardId: "22222222-0000-4000-8000-000000000003" }] },
        ],
        actions: [],
      },
      {
        id: "22222222-0000-4000-8000-000000000003",
        kind: "story",
        elements: [
          { type: "text", id: "33333333-0000-4000-8000-000000000003", x: 48, y: 104, w: 704, h: 224, content: "The end of the path." },
          { type: "button", id: "44444444-0000-4000-8000-000000000003", x: 408, y: 440, w: 344, h: 80, label: "Continue", actions: [{ type: "goto", cardId: "22222222-0000-4000-8000-000000000002" }] },
        ],
        actions: [],
      },
      { id: "22222222-0000-4000-8000-000000000002", kind: "end", elements: [], actions: [] },
    ],
  };

  it("flags a story card whose two choices share one target", () => {
    expect(validate(base).valid).toBe(true); // still a VALID stack — warning, not error
    const warnings = warnStack(base);
    expect(warnings).toEqual([
      { code: "story-single-target", cardId: "22222222-0000-4000-8000-000000000001" },
    ]);
  });

  it("does not flag the story card when the two choices go to different cards", () => {
    const branched: Stack = structuredClone(base);
    const choiceB = branched.cards[0]!.elements[2] as ButtonElement;
    choiceB.actions = [{ type: "goto", cardId: "22222222-0000-4000-8000-000000000002" }];
    expect(validate(branched).valid).toBe(true);
    // The single-target warning is gone (the second story card still has one
    // button, which is never flagged).
    expect(warnStack(branched).some((w) => w.cardId === "22222222-0000-4000-8000-000000000001")).toBe(false);
  });

  it("does not flag a story card with a single button", () => {
    const single: Stack = structuredClone(base);
    single.cards[0] = {
      id: "22222222-0000-4000-8000-000000000001",
      kind: "story",
      elements: [
        { type: "text", id: "33333333-0000-4000-8000-000000000001", x: 48, y: 104, w: 704, h: 224, content: "Only one way." },
        { type: "button", id: "44444444-0000-4000-8000-000000000001", x: 408, y: 440, w: 344, h: 80, label: "Continue", actions: [{ type: "goto", cardId: "22222222-0000-4000-8000-000000000003" }] },
      ],
      actions: [],
    };
    expect(warnStack(single)).toEqual([]);
  });
});
