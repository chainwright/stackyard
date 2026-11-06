// tests/maker/operations.property.test.ts
// TASK-P1 — Property: any edit sequence from a valid stack stays valid.
//
// Starting from an arbitrary valid stack, apply a random sequence of editor
// operations through store.apply. After EVERY step the current stack must
// pass validate(). store.apply only commits valid stacks (rejecting or
// refusing anything else), so the invariant should hold by construction.

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { EditorStore } from "../../src/editor/store.js";
import type { StorageLike } from "../../src/editor/persistence.js";
import { validate } from "../../src/shared/validator.js";
import { validStackArb, opSpecArb } from "./arbitraries.js";

/** A throwaway no-op storage so persistence never touches a real localStorage. */
const nullStorage: StorageLike = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

describe("TASK-P1: any edit sequence from a valid stack stays valid", () => {
  it("every intermediate and final stack passes validate() (>=1000 runs)", () => {
    fc.assert(
      fc.property(
        validStackArb,
        fc.array(opSpecArb, { minLength: 1, maxLength: 12 }),
        (start, opSpecs) => {
          // Sanity: the generated starting stack is valid.
          expect(validate(start).valid).toBe(true);

          const store = new EditorStore(
            { stack: start, screen: "editor" },
            { storage: nullStorage }
          );

          for (const spec of opSpecs) {
            const current = store.getStack()!;
            const op = spec(current);
            store.apply(op); // commits only if valid; otherwise leaves stack intact
            // After every step the live stack is valid.
            expect(validate(store.getStack()!).valid).toBe(true);
          }
        }
      ),
      { numRuns: 1000 }
    );
  }, 30_000); // explicit: heavy run, slow CI runners (z6)
});
