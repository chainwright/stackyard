// tests/roundtrip.property.test.ts
// Property-based round-trip test (TASK-16).
//
// For an arbitrary valid Stack:
//   parse(extract(exportStack(stack))) deepEquals stack
//
// The exporter inlines the full validated stack JSON verbatim — no field is
// omitted, renamed, or transformed — so the extracted-and-parsed stack must be
// byte-for-byte identical to the original. Images use data URIs only, so the
// filesystem-reading branch of inlineImages is never exercised here (that path
// is covered by tests/inline-assets.test.ts); this keeps the round-trip exact.

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import { exportStack } from "../server/exporter.js";
import type { Stack, Card, Element, Action } from "../src/shared/types.js";

// ---------------------------------------------------------------------------
// Arbitraries

/** Always produces a valid RFC 4122 v4 UUID. */
const uuidV4 = (): fc.Arbitrary<string> => fc.uuid({ version: 4 });

const themeArb = fc.record({
  background: fc.constantFrom("#000", "#fff", "#FBF8F1", "blue", "red"),
  foreground: fc.constantFrom("#000", "#fff", "#1E2A47", "blue", "red"),
  font: fc.constantFrom("sans-serif", "serif", "monospace", "system-ui"),
});

/** A 1×1 transparent PNG data URI — a legitimate inlined image. */
const PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

/**
 * Bounds that always satisfy the canvas-bounds invariant (x+w ≤ 800,
 * y+h ≤ 600).
 */
const boundsArb = fc
  .record({
    x: fc.integer({ min: 0, max: 799 }),
    y: fc.integer({ min: 0, max: 599 }),
  })
  .chain(({ x, y }) =>
    fc.record({
      x: fc.constant(x),
      y: fc.constant(y),
      w: fc.integer({ min: 1, max: 800 - x }),
      h: fc.integer({ min: 1, max: 600 - y }),
    }),
  );

/** Text that may include tricky characters the serialiser must preserve. */
const contentArb = fc.oneof(
  fc.string(),
  fc.constantFrom(
    "Visit https://example.com for more.",
    "Try http://школа.example for the lesson.",
    "Tags: <b> & </script> & <svg/>",
    "Emoji ✓ ✗ ◆ ▲ ● ■",
    "Quote \"double\" and 'single' and back\\slash",
    "",
  ),
);

/** A non-interactive element (text, image, or field). */
function nonButtonElementArb(id: string): fc.Arbitrary<Element> {
  return fc.oneof(
    boundsArb.chain((b) =>
      contentArb.map(
        (content): Element => ({ type: "text", id, ...b, content }),
      ),
    ),
    boundsArb.chain((b) =>
      fc
        .string()
        .map(
          (alt): Element => ({
            type: "image",
            id,
            ...b,
            src: PNG_DATA_URI,
            alt,
          }),
        ),
    ),
    boundsArb.map(
      (b): Element => ({ type: "field", id, ...b, variable: "score" }),
    ),
  );
}

/**
 * A quiz card: exactly one correct button (score delta 1) plus one-to-three
 * incorrect buttons, all advancing to `nextCardId`. Satisfies the
 * quiz-answer invariant.
 */
function quizCardArb(
  cardId: string,
  nextCardId: string,
): fc.Arbitrary<Card> {
  return fc
    .record({
      correctBtn: uuidV4(),
      wrongBtns: fc.uniqueArray(uuidV4(), { minLength: 1, maxLength: 3 }),
      qText: uuidV4(),
      withSound: fc.boolean(),
    })
    .chain((ids) =>
      boundsArb.map((qBounds): Card => {
        const correctActions: Action[] = [
          { type: "score", delta: 1 },
          ...(ids.withSound
            ? ([{ type: "sound", sound: "cheer" }] as Action[])
            : []),
          { type: "goto", cardId: nextCardId },
        ];
        const wrongActions: Action[] = [
          { type: "score", delta: 0 },
          ...(ids.withSound
            ? ([{ type: "sound", sound: "buzz" }] as Action[])
            : []),
          { type: "goto", cardId: nextCardId },
        ];
        return {
          id: cardId,
          kind: "quiz",
          elements: [
            {
              type: "text",
              id: ids.qText,
              x: qBounds.x,
              y: qBounds.y,
              w: qBounds.w,
              h: qBounds.h,
              content: "A question?",
            },
            {
              type: "button",
              id: ids.correctBtn,
              x: 0,
              y: 0,
              w: 100,
              h: 40,
              label: "Right",
              actions: correctActions,
            },
            ...ids.wrongBtns.map(
              (wid, i): Element => ({
                type: "button",
                id: wid,
                x: 0,
                y: 50 + i * 50,
                w: 100,
                h: 40,
                label: `Wrong ${i}`,
                actions: wrongActions,
              }),
            ),
          ],
          actions: [],
        };
      }),
    );
}

/**
 * A story card with a mix of non-button elements and a single "Next" button
 * that advances to `nextCardId`. A card-level goto to `nextCardId` is
 * sometimes added — always forward in the linear chain, so the goto graph
 * stays acyclic (invariant 9).
 */
function storyCardArb(
  cardId: string,
  nextCardId: string,
): fc.Arbitrary<Card> {
  return fc
    .record({
      btnId: uuidV4(),
      elemIds: fc.uniqueArray(uuidV4(), { minLength: 0, maxLength: 2 }),
      autoAdvance: fc.boolean(),
    })
    .chain((ids) =>
      fc
        .tuple(...ids.elemIds.map((eid) => nonButtonElementArb(eid)))
        .map((nonButtons): Card => {
          const actions: Action[] = ids.autoAdvance
            ? [{ type: "goto", cardId: nextCardId }]
            : [];
          return {
            id: cardId,
            kind: "story",
            elements: [
              ...nonButtons,
              {
                type: "button",
                id: ids.btnId,
                x: 0,
                y: 0,
                w: 100,
                h: 40,
                label: "Next",
                actions: [{ type: "goto", cardId: nextCardId }],
              },
            ],
            actions,
          };
        }),
    );
}

/** A flash card: two text elements (front/back) and a "Next" button. */
function flashCardArb(
  cardId: string,
  nextCardId: string,
): fc.Arbitrary<Card> {
  return fc
    .record({
      frontId: uuidV4(),
      backId: uuidV4(),
      btnId: uuidV4(),
    })
    .map(
      (ids): Card => ({
        id: cardId,
        kind: "flash",
        elements: [
          {
            type: "text",
            id: ids.frontId,
            x: 0,
            y: 0,
            w: 400,
            h: 100,
            content: "Term",
          },
          {
            type: "text",
            id: ids.backId,
            x: 0,
            y: 120,
            w: 400,
            h: 100,
            content: "Explanation",
          },
          {
            type: "button",
            id: ids.btnId,
            x: 0,
            y: 240,
            w: 100,
            h: 40,
            label: "Next",
            actions: [{ type: "goto", cardId: nextCardId }],
          },
        ],
        actions: [],
      }),
    );
}

/**
 * A valid stack with a varied number of content cards (quiz/story/flash) wired
 * into a linear chain ending at a single end card. All IDs are distinct
 * UUID v4s so invariants 1 and 8 hold.
 */
const validStackArb: fc.Arbitrary<Stack> = fc
  .record({
    stackId: uuidV4(),
    endId: uuidV4(),
    endFieldId: uuidV4(),
    title: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
    theme: themeArb,
    // Between 1 and 5 content cards, each with its own card id and a kind tag.
    contentCards: fc.array(
      fc.record({ cardId: uuidV4(), kind: fc.constantFrom("quiz", "story", "flash") }),
      { minLength: 1, maxLength: 5 },
    ),
  })
  .chain((spec) => {
    // Resolve the per-card arbitraries into concrete cards, chaining gotos
    // forward: card[i] → card[i+1]; last content card → end.
    const n = spec.contentCards.length;
    const cardArbs = spec.contentCards.map((c, i) => {
      const nextId =
        i < n - 1 ? spec.contentCards[i + 1]!.cardId : spec.endId;
      switch (c.kind) {
        case "quiz":
          return quizCardArb(c.cardId, nextId);
        case "flash":
          return flashCardArb(c.cardId, nextId);
        default:
          return storyCardArb(c.cardId, nextId);
      }
    });
    return fc.tuple(...cardArbs).map((contentCards): Stack => {
      const endCard: Card = {
        id: spec.endId,
        kind: "end",
        elements: [
          {
            type: "field",
            id: spec.endFieldId,
            x: 0,
            y: 0,
            w: 200,
            h: 50,
            variable: "score",
          },
        ],
        actions: [],
      };
      return {
        id: spec.stackId,
        title: spec.title,
        theme: spec.theme,
        cards: [...contentCards, endCard],
      };
    });
  })
  // Guard: every id across the whole document must be unique. Collisions are
  // astronomically unlikely with UUID v4 but we filter to be certain, so the
  // generated stack always passes validate() (otherwise exportStack throws).
  .filter((stack) => {
    const ids: string[] = [stack.id];
    for (const card of stack.cards) {
      ids.push(card.id);
      for (const el of card.elements) ids.push(el.id);
    }
    return new Set(ids).size === ids.length;
  });

// ---------------------------------------------------------------------------
// Extraction helper

/** Extract and JSON.parse the #stack-data block from an exported HTML string. */
function extractStack(html: string): Stack {
  const match = html.match(
    /<script id="stack-data"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!match) throw new Error("no #stack-data block found in HTML");
  return JSON.parse(match[1]!) as Stack;
}

// ---------------------------------------------------------------------------
// Property

describe("round-trip: parse(extract(export(stack))) deepEquals stack (TASK-16)", () => {
  it("round-trips an arbitrary valid stack with zero loss (≥1000 runs)", async () => {
    await fc.assert(
      fc.asyncProperty(validStackArb, async (stack) => {
        const html = await exportStack(stack);
        const parsed = extractStack(html);
        expect(parsed).toEqual(stack);
      }),
      { numRuns: 1000 },
    );
  });
});
