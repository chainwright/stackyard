// tests/round5-flow.test.ts
// TASK-29a (inserting a card never rewires a story), TASK-29b (no doubled full
// stop in share-check lines), TASK-29p (card names in the share check).
// The J4 repros are p6.mts (fork / cave / forest / glade) and p7.mts
// (market / longship) from judge_2026-11-06_r5.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { addCardAfter, repairFlow, takeLastInsertedCardId, takeLastInsertNote } from "../src/editor/operations.js";
import { isRejected } from "../src/editor/types.js";
import { validate } from "../src/shared/validator.js";
import { checkReachability, describeProblems } from "../src/shared/reachability.js";
import { outTargets } from "../src/shared/flow.js";
import { cardRefLabel, wordCut } from "../src/shared/cardTitle.js";
import type { Card, Stack } from "../src/shared/types.js";

const id = (n: number): string => `a5a50000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const THEME = { background: "#fff", foreground: "#000", font: "sans-serif" };

function story(n: number, text: string, targets: Array<[string, number]>): Card {
  return {
    id: id(n),
    kind: "story",
    actions: [],
    elements: [
      { type: "text", id: id(1000 + n), x: 48, y: 104, w: 704, h: 120, content: text },
      ...targets.map(([label, to], i) => ({
        type: "button" as const,
        id: id(2000 + n * 10 + i),
        x: 48,
        y: 240 + i * 100,
        w: 704,
        h: 80,
        label,
        actions: [{ type: "goto" as const, cardId: id(to) }],
      })),
    ],
  };
}
const endCard = (n: number): Card => ({
  id: id(n), kind: "end", actions: [],
  elements: [{ type: "text", id: id(1000 + n), x: 48, y: 200, w: 704, h: 80, content: "The end" }],
});
const deck = (cards: Card[]): Stack => ({ id: id(9000), title: "Branching", theme: THEME, cards });

function asStack(r: unknown): Stack {
  if (isRejected(r as never)) throw new Error("rejected");
  return r as Stack;
}
/** Every button id → its first goto target. */
function targetsByButton(s: Stack): Map<string, string | null> {
  const m = new Map<string, string | null>();
  for (const c of s.cards) {
    for (const e of c.elements) {
      if (e.type === "button") m.set(e.id, (e.actions.find((a) => a.type === "goto") as { cardId: string } | undefined)?.cardId ?? null);
    }
  }
  return m;
}
const text = (s: Stack, cardId: string): string =>
  (s.cards.find((c) => c.id === cardId)?.elements.find((e) => e.type === "text") as { content: string } | undefined)?.content ?? "?";

describe("TASK-29a: the J4 repros", () => {
  // p7: 0 fork (Market -> 1, Longship -> 2); 1 market -> end; 2 longship -> end; 3 end
  const market = (): Stack =>
    deck([
      story(0, "You reach the harbour.", [["Market", 1], ["Longship", 2]]),
      story(1, "At the market.", [["Continue", 3]]),
      story(2, "On the longship.", [["Continue", 3]]),
      endCard(3),
    ]);

  it("p7: a card added after the MARKET branch goes market → new → end, and the longship branch is untouched", () => {
    const base = market();
    const next = asStack(addCardAfter(base, id(1), "story"));
    const newId = takeLastInsertedCardId()!;
    expect(takeLastInsertNote()).toBeNull(); // not a fork
    const market1 = next.cards.find((c) => c.id === id(1))!;
    expect(outTargets(market1)).toEqual([newId]);
    const fresh = next.cards.find((c) => c.id === newId)!;
    expect(outTargets(fresh)).toEqual([id(3)]); // to where the market used to go, NOT the longship
    expect(outTargets(next.cards.find((c) => c.id === id(2))!)).toEqual([id(3)]);
    const r = checkReachability(next);
    expect(r.unreachable).toEqual([]);
    expect(r.trapped).toEqual([]);
    expect(validate(next).valid).toBe(true);
  });

  // p6: 0 fork (cave -> 2, forest -> 3); 1 glade (-> end, reached from 3); 2 cave -> end; 3 forest (-> 1, -> end); 4 end
  const forest = (): Stack =>
    deck([
      story(0, "You reach a fork.", [["Go to the cave", 2], ["Go to the forest", 3]]),
      story(1, "A secret glade.", [["Continue", 4]]),
      story(2, "The cave is dark.", [["Continue", 4]]),
      story(3, "The forest.", [["Look around", 1], ["Leave", 4]]),
      endCard(4),
    ]);

  it("p6: a card added after a FORK leaves every choice alone, says where to go next, and is not linked in", () => {
    const base = forest();
    const before = targetsByButton(base);
    const next = asStack(addCardAfter(base, id(0), "story"));
    const newId = takeLastInsertedCardId()!;
    expect(takeLastInsertNote()).toContain("Choose where this card leads");
    for (const [btn, to] of before) expect(targetsByButton(next).get(btn), btn).toBe(to);
    const r = checkReachability(next);
    expect(r.unreachable.map((c) => c.id)).toEqual([newId]); // only the new card, told to the teacher
    expect(r.trapped).toEqual([]);
  });

  it("p6: 'Link these in for me' does NOT merge branches: no existing choice changes target", () => {
    const base = forest();
    const withNew = asStack(addCardAfter(base, id(0), "story"));
    const newId = takeLastInsertedCardId()!;
    takeLastInsertNote();
    const before = targetsByButton(withNew);
    const fixed = asStack(repairFlow(withNew));
    for (const [btn, to] of before) {
      const now = targetsByButton(fixed).get(btn);
      // Either unchanged, or a pure splice onto the stranded card that goes on to the old target.
      expect(now === to || (now === newId && outTargets(fixed.cards.find((c) => c.id === newId)!).includes(to!)), btn).toBe(true);
    }
    // The cave and the glade keep their own endings.
    expect(outTargets(fixed.cards.find((c) => c.id === id(2))!)).toEqual([id(4)]);
    expect(outTargets(fixed.cards.find((c) => c.id === id(1))!)).toEqual([id(4)]);
    expect(validate(fixed).valid).toBe(true);
  });
});

describe("TASK-29a: property — random BRANCHING stacks keep every existing link", () => {
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
        // choices go to a LATER card (index in (i, n]); n is the end card
        const targets: Array<[string, number]> = links[i]!.map((x, k) => [`Choice ${k}`, i + 1 + (x % (n - i))] as [string, number]);
        cards.push(story(i, `Scene ${i}`, targets));
      }
      return deck([...cards, endCard(n)]);
    });

  it("after any insertion every existing button keeps its target (or was the one spliced), and what was reachable still is", () => {
    fc.assert(
      fc.property(stackArb, fc.nat(30), fc.constantFrom("quiz", "flash", "story"), (stack, pick, kind) => {
        const candidates = stack.cards.filter((c) => c.kind !== "end");
        const p = candidates[pick % candidates.length]!;
        const reachBefore = checkReachability(stack).reachable;
        const before = targetsByButton(stack);
        const next = asStack(addCardAfter(stack, p.id, kind as Card["kind"]));
        const newId = takeLastInsertedCardId()!;
        takeLastInsertNote();
        if (!validate(next).valid) return false;
        const fresh = next.cards.find((c) => c.id === newId)!;
        const after = targetsByButton(next);
        const pTargets = outTargets(p);
        for (const [btn, to] of before) {
          const now = after.get(btn);
          if (now === to) continue;
          // Only the card before may change, only when it led to exactly ONE place, and only onto the new card…
          const owner = p.elements.some((e) => e.id === btn);
          if (!(owner && pTargets.length === 1 && now === newId && to === pTargets[0])) return false;
          // …which then goes on to that same place.
          if (!outTargets(fresh).includes(to!)) return false;
        }
        const reachAfter = checkReachability(next).reachable;
        for (const c of reachBefore) if (!reachAfter.has(c)) return false;
        if (reachBefore.has(p.id) && pTargets.length <= 1 && !reachAfter.has(newId)) return false; // linked in
        return true;
      }),
      { numRuns: 300 },
    );
  }, 30_000);

  it("after repairFlow no existing button changes target except a pure splice", () => {
    fc.assert(
      fc.property(stackArb, fc.nat(30), (stack, pick) => {
        const candidates = stack.cards.filter((c) => c.kind !== "end");
        const p = candidates[pick % candidates.length]!;
        const withNew = asStack(addCardAfter(stack, p.id, "story"));
        takeLastInsertedCardId();
        takeLastInsertNote();
        const before = targetsByButton(withNew);
        const fixed = asStack(repairFlow(withNew));
        const after = targetsByButton(fixed);
        // A chain of pure splices may move a link onto a card that itself got spliced onward,
        // so the test is "the old target is still reached THROUGH the new one".
        const reaches = (from: string, goal: string): boolean => {
          const seen = new Set<string>();
          const todo = [from];
          while (todo.length > 0) {
            const x = todo.pop()!;
            if (x === goal) return true;
            if (seen.has(x)) continue;
            seen.add(x);
            const c = fixed.cards.find((k) => k.id === x);
            if (c) todo.push(...outTargets(c));
          }
          return false;
        };
        for (const [btn, to] of before) {
          const now = after.get(btn);
          if (now === to) continue;
          if (now === null || now === undefined || !reaches(now, to!)) return false;
        }
        return validate(fixed).valid;
      }),
      { numRuns: 300 },
    );
  }, 30_000);
});

describe("TASK-29b: the share check never doubles a full stop", () => {
  it("a label that already ends in '.' or '…' gets one stop, not two", () => {
    const stack = deck([story(0, "The cave is dark..", [["Go", 2]]), story(1, "Hidden.", [["Go", 2]]), endCard(2)]);
    const report = checkReachability(stack);
    expect(report.unreachable.map((c) => c.id)).toEqual([id(1)]);
    for (const label of ["Card 2 — The cave is dark..", "Card 2 — What is one quarter of 20…", "Card 2 — Is it 5?", "Card 2 — Plain"]) {
      const lines = describeProblems(report, () => label);
      for (const line of lines) {
        expect(line, line).not.toMatch(/\.\./);
        expect(line, line).not.toMatch(/…\./);
        expect(line, line).not.toMatch(/\?\./);
      }
    }
  });
});

describe("TASK-29p: the card name in 'Before you share' keeps the number that tells cards apart", () => {
  it("cuts at a word boundary, ends with '…' when cut, and keeps '20' in a long question", () => {
    const q = "What is one quarter of 20 sweets shared fairly between the pupils in a class?";
    expect(wordCut(q, 44)).toMatch(/…$/);
    expect(wordCut(q, 44).length).toBeLessThanOrEqual(44);
    expect(q.startsWith(wordCut(q, 44).slice(0, -1))).toBe(true);
    expect(wordCut(q, 44).slice(0, -1).endsWith(" ")).toBe(false);
    const stack = deck([
      story(0, "What is one quarter of 20?", [["Go", 1]]),
      story(1, q, [["Go", 2]]),
      endCard(2),
    ]);
    expect(cardRefLabel(stack, stack.cards[0]!)).toBe("Card 1 — What is one quarter of 20?");
    expect(cardRefLabel(stack, stack.cards[1]!)).toMatch(/^Card 2 — What is one quarter of 20 sweets .*…$/);
    expect(wordCut("Short one", 44)).toBe("Short one");
  });
});
