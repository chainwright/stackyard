// tests/maker/history.property.test.ts
// TASK-P2 — Property: undo after any edit restores the exact previous stack.
//
// Three arbitraries:
//   1. a single random valid operation: one undo == pre-edit stack (deepEqual)
//   2. a burst of 2-10 same-element nudges with the same coalesceKey and
//      gaps < 600 ms: ONE undo restores the pre-burst stack
//   3. a burst broken by a >= 600 ms gap: it takes TWO undos to reach the
//      pre-burst stack

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { EditorStore, COALESCE_WINDOW_MS } from "../../src/editor/store.js";
import type { StorageLike } from "../../src/editor/persistence.js";
import { moveElement } from "../../src/editor/operations.js";
import type { Stack, Element } from "../../src/shared/types.js";
import { validStackArb, opSpecArb } from "./arbitraries.js";

const nullStorage: StorageLike = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

/** A controllable clock whose value the test drives explicitly. */
function clockFrom(ref: { t: number }) {
  return () => ref.t;
}

/** Pick the first element id on the stack (there is always at least one). */
function firstElementId(stack: Stack): string {
  for (const c of stack.cards) {
    const el: Element | undefined = c.elements[0];
    if (el) return el.id;
  }
  // Fallback should never happen — every content card seeds an element.
  return stack.cards[0]!.elements[0]!.id;
}

describe("TASK-P2: undo restores the exact previous stack", () => {
  it("one undo after a single edit yields the pre-edit stack (>=1000 runs)", () => {
    fc.assert(
      fc.property(validStackArb, opSpecArb, (start, spec) => {
        const store = new EditorStore(
          { stack: start, screen: "editor" },
          { storage: nullStorage }
        );
        const before = structuredClone(store.getStack()!);
        const op = spec(store.getStack()!);
        const res = store.apply(op);

        if (res.ok) {
          store.undo();
          expect(store.getStack()).toEqual(before);
        } else {
          // Rejected / no-op: the stack must be unchanged already.
          expect(store.getStack()).toEqual(before);
        }
      }),
      { numRuns: 1000 }
    );
  }, 30_000); // explicit: heavy run, slow CI runners (z6)

  it("a coalesced nudge burst (gaps <600ms) undoes to pre-burst in ONE step (>=1000 runs)", () => {
    fc.assert(
      fc.property(
        validStackArb,
        fc.array(
          fc.record({
            x: fc.integer({ min: -2000, max: 2000 }),
            y: fc.integer({ min: -2000, max: 2000 }),
            gap: fc.integer({ min: 0, max: COALESCE_WINDOW_MS - 1 }),
          }),
          { minLength: 2, maxLength: 10 }
        ),
        (start, nudges) => {
          const ref = { t: 1000 };
          const store = new EditorStore(
            { stack: start, screen: "editor" },
            { storage: nullStorage, now: clockFrom(ref) }
          );
          const before = structuredClone(store.getStack()!);
          const elementId = firstElementId(store.getStack()!);
          const key = "move:" + elementId;

          for (const n of nudges) {
            ref.t += n.gap; // gap < 600ms keeps the burst coalescing
            store.apply((s) => moveElement(s, elementId, n.x, n.y), {
              coalesceKey: key,
            });
          }

          // One undo returns to the pre-burst state.
          store.undo();
          expect(store.getStack()).toEqual(before);
          expect(store.canUndo()).toBe(false);
        }
      ),
      { numRuns: 1000 }
    );
  }, 30_000); // explicit: heavy run, slow CI runners (z6)

  it("a gap-broken burst takes TWO undos to reach pre-burst (>=1000 runs)", () => {
    fc.assert(
      fc.property(
        validStackArb,
        fc.record({
          x1: fc.integer({ min: 0, max: 400 }),
          y1: fc.integer({ min: 0, max: 400 }),
          x2: fc.integer({ min: 0, max: 400 }),
          y2: fc.integer({ min: 0, max: 400 }),
        }),
        (start, m) => {
          const ref = { t: 1000 };
          const store = new EditorStore(
            { stack: start, screen: "editor" },
            { storage: nullStorage, now: clockFrom(ref) }
          );
          const before = structuredClone(store.getStack()!);
          const elementId = firstElementId(store.getStack()!);
          const key = "move:" + elementId;

          store.apply((s) => moveElement(s, elementId, m.x1, m.y1), {
            coalesceKey: key,
          });
          ref.t += COALESCE_WINDOW_MS; // >= 600ms breaks the burst
          store.apply((s) => moveElement(s, elementId, m.x2, m.y2), {
            coalesceKey: key,
          });

          // First undo does NOT (necessarily) reach pre-burst...
          store.undo();
          // ...but a second undo must.
          store.undo();
          expect(store.getStack()).toEqual(before);
        }
      ),
      { numRuns: 1000 }
    );
  }, 30_000); // explicit: heavy run, slow CI runners (z6)
});
