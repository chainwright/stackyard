// tests/validator.property.test.ts
// Property-based tests for all seven invariants in src/shared/validator.ts.
// One `it` block per invariant, using Vitest + fast-check.

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { validate } from "../src/shared/validator.js";
import type { Stack, Card, Element, Action, ButtonElement } from "../src/shared/types.js";

// ---------------------------------------------------------------------------
// Arbitraries — building blocks for generating valid stacks

const uuid = (): fc.Arbitrary<string> =>
  fc.uuid().filter((s) => s.length > 0);

const themeArb = fc.record({
  background: fc.constantFrom("#000", "#fff", "blue", "red"),
  foreground: fc.constantFrom("#000", "#fff", "blue", "red"),
  font: fc.constantFrom("sans-serif", "serif", "monospace"),
});

/** Generate a non-negative integer and ensure x+w <= max, y+h <= max */
const boundsArb = (maxX: number, maxY: number) =>
  fc.record({
    x: fc.integer({ min: 0, max: maxX - 1 }),
    y: fc.integer({ min: 0, max: maxY - 1 }),
  }).chain(({ x, y }) =>
    fc.record({
      x: fc.constant(x),
      y: fc.constant(y),
      w: fc.integer({ min: 1, max: maxX - x }),
      h: fc.integer({ min: 1, max: maxY - y }),
    })
  );

const textElementArb = (id: string): fc.Arbitrary<Element> =>
  boundsArb(800, 600).map(({ x, y, w, h }) => ({
    type: "text" as const,
    id,
    x, y, w, h,
    content: "some text",
  }));

const buttonElementArb = (
  id: string,
  actions: Action[]
): fc.Arbitrary<ButtonElement> =>
  boundsArb(800, 600).map(({ x, y, w, h }) => ({
    type: "button" as const,
    id,
    x, y, w, h,
    label: "Click me",
    actions,
  }));

/**
 * Build a minimal valid quiz card.
 * Exactly one correct button (score delta 1) and one incorrect button.
 */
function quizCard(
  id: string,
  correctBtnId: string,
  incorrectBtnId: string,
  gotoCardId: string
): Card {
  return {
    id,
    kind: "quiz",
    elements: [
      {
        type: "button",
        id: correctBtnId,
        x: 0, y: 0, w: 100, h: 40,
        label: "Correct",
        actions: [
          { type: "score", delta: 1 },
          { type: "sound", sound: "cheer" },
          { type: "goto", cardId: gotoCardId },
        ],
      },
      {
        type: "button",
        id: incorrectBtnId,
        x: 0, y: 50, w: 100, h: 40,
        label: "Wrong",
        actions: [
          { type: "score", delta: 0 },
          { type: "sound", sound: "buzz" },
          { type: "goto", cardId: gotoCardId },
        ],
      },
    ],
    actions: [],
  };
}

function endCard(id: string): Card {
  return {
    id,
    kind: "end",
    elements: [
      {
        type: "field",
        id: `${id}-score`,
        x: 0, y: 0, w: 200, h: 50,
        variable: "score",
      },
    ],
    actions: [],
  };
}

function storyCard(id: string, gotoCardId: string, btnId: string): Card {
  return {
    id,
    kind: "story",
    elements: [
      {
        type: "button",
        id: btnId,
        x: 0, y: 0, w: 100, h: 40,
        label: "Next",
        actions: [{ type: "goto", cardId: gotoCardId }],
      },
    ],
    actions: [],
  };
}

/**
 * Produce a minimal valid stack: one quiz card + one end card.
 * All IDs drawn from uuid() so they are unique across runs.
 */
const validStackArb: fc.Arbitrary<Stack> = fc
  .tuple(uuid(), uuid(), uuid(), uuid(), uuid(), uuid(), uuid(), themeArb)
  .map(
    ([stackId, quizId, endId, correctBtnId, incorrectBtnId, endFieldId, _storyBtnId, theme]) => {
      const stack: Stack = {
        id: stackId,
        title: "A valid stack",
        theme,
        cards: [
          quizCard(quizId, correctBtnId, incorrectBtnId, endId),
          {
            ...endCard(endId),
            elements: [
              { type: "field", id: endFieldId, x: 0, y: 0, w: 200, h: 50, variable: "score" },
            ],
          },
        ],
      };
      return stack;
    }
  );

// ---------------------------------------------------------------------------
// 1. duplicate-id

describe("invariant: duplicate-id", () => {
  it("reports duplicate-id when any id is reused", () => {
    fc.assert(
      fc.property(validStackArb, (stack) => {
        // Duplicate the stack's own id onto the first card
        const broken: Stack = {
          ...stack,
          cards: [
            { ...stack.cards[0]!, id: stack.id },
            ...stack.cards.slice(1),
          ],
        };
        const result = validate(broken);
        expect(result.valid).toBe(false);
        if (!result.valid) expect(result.errors).toContain("duplicate-id");
      })
    );
  });

  it("accepts a stack with all unique ids", () => {
    fc.assert(
      fc.property(validStackArb, (stack) => {
        const result = validate(stack);
        expect(result.valid).toBe(true);
      })
    );
  });
});

// ---------------------------------------------------------------------------
// 2. invalid-goto

describe("invariant: invalid-goto", () => {
  it("reports invalid-goto when a button goto targets a non-existent card", () => {
    fc.assert(
      fc.property(validStackArb, uuid(), (stack, bogusId) => {
        // Make sure bogusId is not a real card id
        fc.pre(!stack.cards.some((c) => c.id === bogusId));
        // Replace every goto in card[0]'s first button with bogusId
        const firstCard = stack.cards[0]!;
        const brokenElements = firstCard.elements.map((el) => {
          if (el.type !== "button") return el;
          return {
            ...el,
            actions: el.actions.map((a) =>
              a.type === "goto" ? { ...a, cardId: bogusId } : a
            ),
          } satisfies ButtonElement;
        });
        const broken: Stack = {
          ...stack,
          cards: [
            { ...firstCard, elements: brokenElements },
            ...stack.cards.slice(1),
          ],
        };
        const result = validate(broken);
        expect(result.valid).toBe(false);
        if (!result.valid) expect(result.errors).toContain("invalid-goto");
      })
    );
  });

  it("accepts a stack where all goto targets exist", () => {
    fc.assert(
      fc.property(validStackArb, (stack) => {
        const result = validate(stack);
        expect(result.valid).toBe(true);
      })
    );
  });
});

// ---------------------------------------------------------------------------
// 3. end-card-count

describe("invariant: end-card-count", () => {
  it("reports end-card-count when there are zero end cards", () => {
    fc.assert(
      fc.property(validStackArb, (stack) => {
        // Turn the end card into a story card
        const broken: Stack = {
          ...stack,
          cards: stack.cards.map((c) =>
            c.kind === "end" ? { ...c, kind: "story" as const } : c
          ),
        };
        const result = validate(broken);
        expect(result.valid).toBe(false);
        if (!result.valid) expect(result.errors).toContain("end-card-count");
      })
    );
  });

  it("reports end-card-count when there are two or more end cards", () => {
    fc.assert(
      fc.property(validStackArb, uuid(), uuid(), (stack, extraEndId, extraFieldId) => {
        fc.pre(
          extraEndId !== stack.id &&
          !stack.cards.some((c) => c.id === extraEndId || c.id === extraFieldId) &&
          extraEndId !== extraFieldId
        );
        const extraEnd: Card = {
          id: extraEndId,
          kind: "end",
          elements: [
            { type: "field", id: extraFieldId, x: 0, y: 0, w: 100, h: 50, variable: "score" },
          ],
          actions: [],
        };
        const broken: Stack = {
          ...stack,
          cards: [...stack.cards, extraEnd],
        };
        const result = validate(broken);
        expect(result.valid).toBe(false);
        if (!result.valid) expect(result.errors).toContain("end-card-count");
      })
    );
  });

  it("accepts a stack with exactly one end card", () => {
    fc.assert(
      fc.property(validStackArb, (stack) => {
        const endCount = stack.cards.filter((c) => c.kind === "end").length;
        expect(endCount).toBe(1);
        const result = validate(stack);
        expect(result.valid).toBe(true);
      })
    );
  });
});

// ---------------------------------------------------------------------------
// 4. quiz-answer

describe("invariant: quiz-answer", () => {
  it("reports quiz-answer when a quiz card has no correct button", () => {
    fc.assert(
      fc.property(validStackArb, (stack) => {
        // Remove the score delta=1 action from all buttons in quiz cards
        const broken: Stack = {
          ...stack,
          cards: stack.cards.map((card) => {
            if (card.kind !== "quiz") return card;
            return {
              ...card,
              elements: card.elements.map((el) => {
                if (el.type !== "button") return el;
                return {
                  ...el,
                  actions: el.actions.filter(
                    (a) => !(a.type === "score" && a.delta === 1)
                  ),
                } satisfies ButtonElement;
              }),
            };
          }),
        };
        const result = validate(broken);
        expect(result.valid).toBe(false);
        if (!result.valid) expect(result.errors).toContain("quiz-answer");
      })
    );
  });

  it("reports quiz-answer when a quiz card has two correct buttons", () => {
    fc.assert(
      fc.property(validStackArb, uuid(), (stack, extraBtnId) => {
        fc.pre(
          !stack.cards.some((c) => c.id === extraBtnId) &&
          !stack.cards.flatMap((c) => c.elements).some((e) => e.id === extraBtnId)
        );
        const endId = stack.cards.find((c) => c.kind === "end")!.id;
        const broken: Stack = {
          ...stack,
          cards: stack.cards.map((card) => {
            if (card.kind !== "quiz") return card;
            // Add a second correct button
            const secondCorrect: ButtonElement = {
              type: "button",
              id: extraBtnId,
              x: 200, y: 0, w: 100, h: 40,
              label: "Also Correct",
              actions: [
                { type: "score", delta: 1 },
                { type: "goto", cardId: endId },
              ],
            };
            return {
              ...card,
              elements: [...card.elements, secondCorrect],
            };
          }),
        };
        const result = validate(broken);
        expect(result.valid).toBe(false);
        if (!result.valid) expect(result.errors).toContain("quiz-answer");
      })
    );
  });

  it("accepts a quiz card with exactly one correct button and at least one incorrect button", () => {
    fc.assert(
      fc.property(validStackArb, (stack) => {
        const result = validate(stack);
        expect(result.valid).toBe(true);
      })
    );
  });
});

// ---------------------------------------------------------------------------
// 5. canvas-bounds

describe("invariant: canvas-bounds", () => {
  it("reports canvas-bounds when an element overflows x+w > 800", () => {
    fc.assert(
      fc.property(validStackArb, (stack) => {
        // Force the first element of card[0] to overflow horizontally
        const firstCard = stack.cards[0]!;
        const firstEl = firstCard.elements[0];
        if (!firstEl) return; // skip if no elements (shouldn't happen with our arb)
        const overflowEl: Element = { ...firstEl, x: 750, w: 100 }; // 750+100=850 > 800
        const broken: Stack = {
          ...stack,
          cards: [
            {
              ...firstCard,
              elements: [overflowEl, ...firstCard.elements.slice(1)],
            },
            ...stack.cards.slice(1),
          ],
        };
        const result = validate(broken);
        expect(result.valid).toBe(false);
        if (!result.valid) expect(result.errors).toContain("canvas-bounds");
      })
    );
  });

  it("reports canvas-bounds when an element overflows y+h > 600", () => {
    fc.assert(
      fc.property(validStackArb, (stack) => {
        const firstCard = stack.cards[0]!;
        const firstEl = firstCard.elements[0];
        if (!firstEl) return;
        const overflowEl: Element = { ...firstEl, y: 560, h: 100 }; // 560+100=660 > 600
        const broken: Stack = {
          ...stack,
          cards: [
            {
              ...firstCard,
              elements: [overflowEl, ...firstCard.elements.slice(1)],
            },
            ...stack.cards.slice(1),
          ],
        };
        const result = validate(broken);
        expect(result.valid).toBe(false);
        if (!result.valid) expect(result.errors).toContain("canvas-bounds");
      })
    );
  });

  it("accepts a stack where all elements fit within 800×600", () => {
    fc.assert(
      fc.property(validStackArb, (stack) => {
        const result = validate(stack);
        expect(result.valid).toBe(true);
      })
    );
  });
});

// ---------------------------------------------------------------------------
// 6. blank-title

describe("invariant: blank-title", () => {
  it("reports blank-title for an empty string title", () => {
    fc.assert(
      fc.property(validStackArb, (stack) => {
        const broken: Stack = { ...stack, title: "" };
        const result = validate(broken);
        expect(result.valid).toBe(false);
        if (!result.valid) expect(result.errors).toContain("blank-title");
      })
    );
  });

  it("reports blank-title for a whitespace-only title", () => {
    fc.assert(
      fc.property(
        validStackArb,
        fc.stringMatching(/^\s+$/),
        (stack, wsTitle) => {
          const broken: Stack = { ...stack, title: wsTitle };
          const result = validate(broken);
          expect(result.valid).toBe(false);
          if (!result.valid) expect(result.errors).toContain("blank-title");
        }
      )
    );
  });

  it("accepts a stack with a non-blank title", () => {
    fc.assert(
      fc.property(validStackArb, (stack) => {
        const result = validate(stack);
        expect(result.valid).toBe(true);
      })
    );
  });
});

// ---------------------------------------------------------------------------
// 7. no-content-cards

describe("invariant: no-content-cards", () => {
  it("reports no-content-cards when the stack has only an end card", () => {
    fc.assert(
      fc.property(
        fc.tuple(uuid(), uuid(), uuid(), themeArb),
        ([stackId, endId, fieldId, theme]) => {
          fc.pre(
            stackId !== endId &&
            endId !== fieldId &&
            stackId !== fieldId
          );
          const stackWithOnlyEnd: Stack = {
            id: stackId,
            title: "Only end",
            theme,
            cards: [
              {
                id: endId,
                kind: "end",
                elements: [
                  {
                    type: "field",
                    id: fieldId,
                    x: 0, y: 0, w: 200, h: 50,
                    variable: "score",
                  },
                ],
                actions: [],
              },
            ],
          };
          const result = validate(stackWithOnlyEnd);
          expect(result.valid).toBe(false);
          if (!result.valid) expect(result.errors).toContain("no-content-cards");
        }
      )
    );
  });

  it("accepts a stack with at least one non-end card", () => {
    fc.assert(
      fc.property(validStackArb, (stack) => {
        const result = validate(stack);
        expect(result.valid).toBe(true);
      })
    );
  });
});
