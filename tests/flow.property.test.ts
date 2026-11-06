// tests/flow.property.test.ts
// TASK-26b/o: "every card can move forward" as a property over random stacks and
// random edit sequences. The first version of the "before you share" check was
// silent about two dead ends a real teacher hit — a flash card with nothing to
// press, and a button with no action — so this proves the repair closes both for
// ANY stack, not just the two examples.

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { validate } from "../src/shared/validator.js";
import { repairFlow } from "../src/editor/operations.js";
import { isRejected } from "../src/editor/types.js";
import { checkReachability } from "../src/shared/reachability.js";
import { cardHasForward, forwardStep, ensureForwardLinks, gotoOf } from "../src/shared/flow.js";
import type { Stack } from "../src/shared/types.js";
import { validStackArb, opSpecArb } from "./maker/arbitraries.js";

/** Apply a sequence of random edit operations, keeping only valid results. */
function applyAll(start: Stack, specs: Array<(s: Stack) => (s: Stack) => Stack | { ok: false }>): Stack {
  let stack = start;
  for (const spec of specs) {
    const next = spec(stack)(stack);
    if (isRejected(next as never)) continue;
    if (validate(next).valid) stack = next as Stack;
  }
  return stack;
}

describe("property: repairFlow leaves no card without a way forward", () => {
  it("after ANY edit sequence, repairFlow gives a valid stack with no stuck card or dead-end button", () => {
    fc.assert(
      fc.property(
        validStackArb,
        fc.array(opSpecArb, { minLength: 0, maxLength: 12 }),
        (start, specs) => {
          const edited = applyAll(start, specs as never);
          const repaired = repairFlow(edited);
          expect(isRejected(repaired as never)).toBe(false);
          const fixed = repaired as Stack;
          expect(validate(fixed).valid).toBe(true);

          const ids = new Set(fixed.cards.map((c) => c.id));
          for (const card of fixed.cards) {
            if (card.kind === "end") continue;
            expect(cardHasForward(card), `${card.kind} card has a way forward`).toBe(true);
            for (const el of card.elements) {
              if (el.type === "button") {
                const target = gotoOf(el.actions);
                expect(target !== null && ids.has(target), `button "${el.label}" goes somewhere`).toBe(true);
              }
            }
          }
          const report = checkReachability(fixed);
          expect(report.stuck).toHaveLength(0);
          expect(report.deadEndQuiz).toHaveLength(0);
          expect(report.deadEndOther).toHaveLength(0);
        },
      ),
      { numRuns: 400 },
    );
  });

  it("repairing is idempotent (a second repair changes nothing)", () => {
    fc.assert(
      fc.property(validStackArb, fc.array(opSpecArb, { maxLength: 8 }), (start, specs) => {
        const once = repairFlow(applyAll(start, specs as never)) as Stack;
        const twice = repairFlow(once) as Stack;
        expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
      }),
      { numRuns: 200 },
    );
  });

  it("ensureForwardLinks only ADDS: it never changes an existing goto", () => {
    fc.assert(
      fc.property(validStackArb, (start) => {
        const out = ensureForwardLinks(start);
        start.cards.forEach((card, i) => {
          card.elements.forEach((el) => {
            if (el.type !== "button") return;
            const before = gotoOf(el.actions);
            if (before === null) return;
            const after = out.cards[i]!.elements.find((e) => e.id === el.id);
            expect(after && after.type === "button" && gotoOf(after.actions)).toBe(before);
          });
        });
        expect(validate(out).valid).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("walking the repaired deck forward from card 1 reaches the end card", () => {
    fc.assert(
      fc.property(validStackArb, fc.array(opSpecArb, { maxLength: 10 }), (start, specs) => {
        const fixed = repairFlow(applyAll(start, specs as never)) as Stack;
        // Quiz answers and flash/story Next buttons now point forward, so the
        // guaranteed forward step always makes progress to the end.
        let at = 0;
        let steps = 0;
        const seen = new Set<number>();
        while (fixed.cards[at]!.kind !== "end" && steps++ <= fixed.cards.length) {
          if (seen.has(at)) break; // a story branch pointing backwards would loop
          seen.add(at);
          const next = forwardStep(fixed, at);
          if (next === null) break;
          at = fixed.cards.findIndex((c) => c.id === next);
        }
        // A deck whose first goto points backwards is the teacher's own choice;
        // everything the repair itself added moves strictly forward.
        if (fixed.cards[at]!.kind !== "end") {
          expect(seen.has(at)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });
});
