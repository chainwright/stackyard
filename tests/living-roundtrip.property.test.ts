// tests/living-roundtrip.property.test.ts
// TASK-24 invariant: the living file round-trips losslessly.
//
//   stack → exportLivingStack → (edit nothing) → replaceStackData(same stack)
//         → extract #stack-data → deepEquals stack
//
// replaceStackData is exactly what the living file's Save a Copy uses, and the
// extraction is the same regex the exporter round-trip test uses. So an
// unedited Save a Copy is lossless, and an edited one carries the edit.

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import { exportLivingStack } from "../server/exporter.js";
import { replaceStackData } from "../src/shared/escapeStackJson.js";
import type { Stack, Card, Element, Action } from "../src/shared/types.js";

const uuidV4 = (): fc.Arbitrary<string> => fc.uuid({ version: 4 });

const themeArb = fc.record({
  background: fc.constantFrom("#000", "#fff", "#FBF8F1"),
  foreground: fc.constantFrom("#000", "#fff", "#1E2A47"),
  font: fc.constantFrom("sans-serif", "serif", "system-ui"),
});

const contentArb = fc.oneof(
  fc.string(),
  fc.constantFrom(
    "Tags: <b> & </script> & <svg/>",
    "Visit https://example.com",
    "Quote \"x\" and 'y' and back\\slash",
    "Emoji ✓ ✗ ◆ ▲",
    "",
  ),
);

const boundsArb = fc
  .record({ x: fc.integer({ min: 0, max: 799 }), y: fc.integer({ min: 0, max: 599 }) })
  .chain(({ x, y }) =>
    fc.record({
      x: fc.constant(x),
      y: fc.constant(y),
      w: fc.integer({ min: 1, max: 800 - x }),
      h: fc.integer({ min: 1, max: 600 - y }),
    }),
  );

function quizCardArb(cardId: string, nextId: string): fc.Arbitrary<Card> {
  return fc
    .record({
      correct: uuidV4(),
      wrong: fc.uniqueArray(uuidV4(), { minLength: 1, maxLength: 3 }),
      qid: uuidV4(),
    })
    .chain((ids) =>
      boundsArb.chain((qb) =>
        contentArb.map((q): Card => {
          const correctActions: Action[] = [
            { type: "score", delta: 1 },
            { type: "goto", cardId: nextId },
          ];
          const wrongActions: Action[] = [
            { type: "score", delta: 0 },
            { type: "goto", cardId: nextId },
          ];
          return {
            id: cardId,
            kind: "quiz",
            elements: [
              { type: "text", id: ids.qid, x: qb.x, y: qb.y, w: qb.w, h: qb.h, content: q },
              { type: "button", id: ids.correct, x: 0, y: 0, w: 100, h: 40, label: "Right", actions: correctActions },
              ...ids.wrong.map((wid, i): Element => ({
                type: "button", id: wid, x: 0, y: 50 + i * 50, w: 100, h: 40, label: `Wrong ${i}`, actions: wrongActions,
              })),
            ],
            actions: [],
          };
        }),
      ),
    );
}

const validStackArb: fc.Arbitrary<Stack> = fc
  .record({
    stackId: uuidV4(),
    endId: uuidV4(),
    endFieldId: uuidV4(),
    title: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
    theme: themeArb,
    cardIds: fc.uniqueArray(uuidV4(), { minLength: 1, maxLength: 4 }),
  })
  .chain((spec) => {
    const arbs = spec.cardIds.map((cid, i) => {
      const next = i < spec.cardIds.length - 1 ? spec.cardIds[i + 1]! : spec.endId;
      return quizCardArb(cid, next);
    });
    return fc.tuple(...arbs).map((cards): Stack => {
      const end: Card = {
        id: spec.endId,
        kind: "end",
        elements: [{ type: "field", id: spec.endFieldId, x: 0, y: 0, w: 200, h: 50, variable: "score" }],
        actions: [],
      };
      return { id: spec.stackId, title: spec.title, theme: spec.theme, cards: [...cards, end] };
    });
  })
  .filter((stack) => {
    const ids: string[] = [stack.id];
    for (const c of stack.cards) {
      ids.push(c.id);
      for (const e of c.elements) ids.push(e.id);
    }
    return new Set(ids).size === ids.length;
  });

/** Extract and parse the #stack-data block (same as the exporter round-trip). */
function extractStack(html: string): Stack {
  const m = html.match(/<script id="stack-data"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("no #stack-data block");
  return JSON.parse(m[1]!) as Stack;
}

describe("living file size budget (TASK-24 d)", () => {
  it("a representative deck's living file is ≤ 500 KB with fonts", async () => {
    const { vikingsStack } = await import("../src/shared/readyMadeStacks.js");
    const living = await exportLivingStack(vikingsStack());
    const bytes = Buffer.byteLength(living, "utf8");
    const kb = bytes / 1024;
    // Reported for the record; the budget is 500 KB.
    expect(kb, `living file is ${kb.toFixed(1)} KB`).toBeLessThanOrEqual(500);
  });
});

describe("living file round-trips losslessly (TASK-24)", () => {
  it("export living → Save a Copy with no edit → identical stack (≥300 runs)", async () => {
    await fc.assert(
      fc.asyncProperty(validStackArb, async (stack) => {
        const livingHtml = await exportLivingStack(stack);
        // "Save a Copy" with the unchanged stack = replaceStackData with the same stack.
        const copy = replaceStackData(livingHtml, stack);
        expect(copy).not.toBeNull();
        expect(extractStack(copy!)).toEqual(stack);
      }),
      { numRuns: 300 },
    );
  });

  it("edit a question → Save a Copy → the edit is in the copy's stack", async () => {
    await fc.assert(
      fc.asyncProperty(validStackArb, fc.string(), async (stack, newText) => {
        const livingHtml = await exportLivingStack(stack);
        // Edit the first text element's content (what the editor does).
        const edited: Stack = structuredClone(stack);
        const firstText = edited.cards[0]!.elements.find((e) => e.type === "text");
        if (!firstText || firstText.type !== "text") return; // nothing to edit
        firstText.content = newText;
        const copy = replaceStackData(livingHtml, edited);
        expect(copy).not.toBeNull();
        expect(extractStack(copy!)).toEqual(edited);
      }),
      { numRuns: 200 },
    );
  });

  it("the copy is still a living file (keeps the living runtime + Teacher tab path)", async () => {
    const stack = (await import("../src/shared/readyMadeStacks.js")).vikingsStack();
    const livingHtml = await exportLivingStack(stack);
    const copy = replaceStackData(livingHtml, stack)!;
    // The regenerated copy keeps everything but the stack JSON, so the living
    // runtime (and its Teacher tab, a stable marker the minifier preserves in
    // the injected CSS string) and the mount point survive.
    expect(copy).toContain("sy-teacher-tab");
    expect(copy).toContain('id="player-root"');
    expect(copy).toContain('id="stack-data"');
  });
});
