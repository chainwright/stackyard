// tests/round6-flow.test.ts
// TASK-30i: "Link these in for me" understands forks. The repros are B and C from
// p_r6.mts (judge_2026-11-09_r6).

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { addCardAfter, repairFlow, takeLastInsertedCardId, takeLastInsertNote } from "../src/editor/operations.js";
import { isRejected } from "../src/editor/types.js";
import { validate } from "../src/shared/validator.js";
import { checkReachability, describeProblems, firstProblemCard } from "../src/shared/reachability.js";
import { outTargets } from "../src/shared/flow.js";
import { cardRefLabel } from "../src/shared/cardTitle.js";
import type { Card, Stack } from "../src/shared/types.js";

const id = (n: number): string => `b6b60000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const THEME = { background: "#fff", foreground: "#000", font: "sans-serif" };
function story(n: number, text: string, targets: Array<[string, number]>): Card {
  return {
    id: id(n), kind: "story", actions: [],
    elements: [
      { type: "text", id: id(1000 + n), x: 48, y: 104, w: 704, h: 120, content: text },
      ...targets.map(([label, to], i) => ({
        type: "button" as const, id: id(2000 + n * 10 + i), x: 48, y: 240 + i * 100, w: 704, h: 80,
        label, actions: [{ type: "goto" as const, cardId: id(to) }],
      })),
    ],
  };
}
const endCard = (n: number): Card => ({
  id: id(n), kind: "end", actions: [],
  elements: [{ type: "text", id: id(1000 + n), x: 48, y: 200, w: 704, h: 80, content: "The end" }],
});
const deck = (cards: Card[]): Stack => ({ id: id(9000), title: "T", theme: THEME, cards });
function asStack(r: unknown): Stack {
  if (isRejected(r as never)) throw new Error("rejected");
  return r as Stack;
}
const buttonCount = (s: Stack, cardId: string): number =>
  s.cards.find((c) => c.id === cardId)!.elements.filter((e) => e.type === "button").length;

const forest = (): Stack =>
  deck([
    story(0, "A fork in the path.", [["Go to the cave", 2], ["Go to the forest", 3]]),
    story(1, "A quiet glade.", [["Continue", 4]]),
    story(2, "The cave is dark.", [["Continue", 4]]),
    story(3, "The forest.", [["Look around", 1], ["Leave", 4]]),
    endCard(4),
  ]);

describe("TASK-30i: repro B — a card added after a fork", () => {
  it("TASK-30i: the new card does NOT lead to deck-next (the glade); it leads only to where the branches rejoin", () => {
    const next = asStack(addCardAfter(forest(), id(0), "story"));
    const newId = takeLastInsertedCardId()!;
    expect(takeLastInsertNote()).toContain("Choose where this card leads");
    const fresh = next.cards.find((c) => c.id === newId)!;
    expect(outTargets(fresh)).not.toContain(id(1)); // the glade is ONE branch's card
    expect(outTargets(fresh)).toEqual([id(4)]); // the only card both branches reach
  });

  it("TASK-30i: with no common rejoin card the new card leads nowhere", () => {
    const split = deck([
      story(0, "Fork.", [["Left", 1], ["Right", 2]]),
      story(1, "Left end.", [["Done", 3]]),
      story(2, "Right then more.", [["On", 4]]),
      endCard(3),
      endCard(4),
    ]);
    // Two end cards are not a valid deck; only the link logic is under test, so use the flow helper directly.
    const next = asStack(addCardAfter(split, id(0), "story"));
    takeLastInsertNote();
    const newId = takeLastInsertedCardId()!;
    const fresh = next.cards.find((c) => c.id === newId)!;
    expect(outTargets(fresh)).not.toContain(id(1));
    expect(outTargets(fresh)).not.toContain(id(2));
  });

  it("TASK-30i: 'Link these in for me' never gives the fork card a third button; the new card stays flagged, naming the choice", () => {
    const withNew = asStack(addCardAfter(forest(), id(0), "story"));
    const newId = takeLastInsertedCardId()!;
    takeLastInsertNote();
    const fixed = asStack(repairFlow(withNew));
    expect(buttonCount(fixed, id(0))).toBe(2);
    expect(validate(fixed).valid).toBe(true);
    const report = checkReachability(fixed);
    expect(report.unreachable.map((c) => c.id)).toEqual([newId]);
    const lines = describeProblems(report, (c) => cardRefLabel(fixed, c));
    expect(lines.join(" ")).toContain("Choose which story choice should lead here");
    // "Take me to the card" opens the fork card, where the choice is made.
    expect(firstProblemCard(report, fixed)?.id).toBe(id(0));
  });

  it("TASK-30i: an unreachable card behind a one-way story card is still linked in", () => {
    const base = deck([
      story(0, "Start.", [["Continue", 2]]),
      story(1, "Hidden scene.", [["Continue", 2]]),
      endCard(2),
    ]);
    const fixed = asStack(repairFlow(base));
    expect(checkReachability(fixed).unreachable).toEqual([]);
  });
});

describe("TASK-30i: repro C — a bonus scene that says 'Start again'", () => {
  it("TASK-30i: the deck still starts on 'Start.' and the bonus scene is linked in", () => {
    const c0 = deck([
      story(0, "Start.", [["Continue", 1]]),
      story(1, "Middle.", [["Continue", 3]]),
      story(2, "Bonus scene (stranded).", [["Continue", 3], ["Start again", 0]]),
      endCard(3),
    ]);
    expect(checkReachability(c0).unreachable).toHaveLength(1);
    const fixed = asStack(repairFlow(c0));
    const firstText = fixed.cards[0]!.elements.find((e) => e.type === "text") as { content: string };
    expect(firstText.content).toBe("Start.");
    expect(fixed.cards[0]!.id).toBe(id(0));
    expect(checkReachability(fixed).unreachable).toEqual([]);
    expect(validate(fixed).valid).toBe(true);
  });
});

describe("TASK-30i: property — repairFlow never adds a button to a story card with two or more choices", () => {
  const stackArb = fc
    .integer({ min: 3, max: 7 })
    .chain((n) =>
      fc.record({
        n: fc.constant(n),
        links: fc.array(fc.array(fc.nat(20), { minLength: 1, maxLength: 3 }), { minLength: n, maxLength: n }),
      }),
    )
    .map(({ n, links }) => {
      const cards: Card[] = [];
      for (let i = 0; i < n; i++) {
        const targets = links[i]!.map((x, k) => [`Choice ${k}`, i + 1 + (x % (n - i))] as [string, number]);
        cards.push(story(i, `Scene ${i}`, targets));
      }
      return deck([...cards, endCard(n)]);
    });

  it("TASK-30i: after an insertion and a repair, no story card with ≥ 2 choices has more buttons than before", () => {
    fc.assert(
      fc.property(stackArb, fc.nat(30), (stack, pick) => {
        const candidates = stack.cards.filter((c) => c.kind !== "end");
        const p = candidates[pick % candidates.length]!;
        const withNew = asStack(addCardAfter(stack, p.id, "story"));
        takeLastInsertedCardId();
        takeLastInsertNote();
        const fixed = asStack(repairFlow(withNew));
        for (const c of withNew.cards) {
          const before = c.elements.filter((e) => e.type === "button").length;
          if (c.kind === "story" && before >= 2) expect(buttonCount(fixed, c.id), c.id).toBe(before);
        }
        return validate(fixed).valid;
      }),
      { numRuns: 300 },
    );
  }, 30_000);
});
