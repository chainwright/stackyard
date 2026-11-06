// tests/maker/export.property.test.ts
// TASK-P3 — Property: export after any edit round-trips.
//
// From an arbitrary valid stack, apply a random valid edit sequence through
// store.apply, then exportStack(state.stack). Extract #stack-data from the
// HTML, JSON.parse it, and assert it deepEquals the edited stack. This proves
// the editor never produces a stack the exporter changes or rejects.

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { EditorStore } from "../../src/editor/store.js";
import type { StorageLike } from "../../src/editor/persistence.js";
import { exportStack } from "../../server/exporter.js";
import type { Stack } from "../../src/shared/types.js";
import { validStackArb, opSpecArb } from "./arbitraries.js";

const nullStorage: StorageLike = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

/** Extract and JSON.parse the #stack-data block from exported HTML. */
function extractStack(html: string): Stack {
  const match = html.match(/<script id="stack-data"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error("no #stack-data block found in HTML");
  return JSON.parse(match[1]!) as Stack;
}

describe("TASK-P3: export after any edit round-trips", () => {
  it("embedded JSON always round-trips to the edited stack (>=1000 runs)", async () => {
    await fc.assert(
      fc.asyncProperty(
        validStackArb,
        fc.array(opSpecArb, { minLength: 0, maxLength: 10 }),
        async (start, opSpecs) => {
          const store = new EditorStore(
            { stack: start, screen: "editor" },
            { storage: nullStorage }
          );
          for (const spec of opSpecs) {
            const op = spec(store.getStack()!);
            store.apply(op);
          }

          const edited = store.getStack()!;
          const html = await exportStack(edited);
          const parsed = extractStack(html);
          expect(parsed).toEqual(edited);
        }
      ),
      { numRuns: 1000 }
    );
  }, 30_000); // explicit: heavy run, slow CI runners (z6)
});
