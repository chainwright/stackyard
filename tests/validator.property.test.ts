// tests/validator.property.test.ts
// Property-based tests for all eight invariants in src/shared/validator.ts.
// One `it` block per invariant, using Vitest + fast-check.

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { validate } from "../src/shared/validator.js";
import type { Stack, Card, Element, Action, ButtonElement } from "../src/shared/types.js";

// ---------------------------------------------------------------------------
// Arbitraries — building blocks for generating valid stacks

/** Always produces a valid RFC 4122 v4 UUID. */
const uuidV4 = (): fc.Arbitrary<string> => fc.uuid({ version: 4 });

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

function endCard(id: string, fieldId: string): Card {
  return {
    id,
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
 * All IDs are UUID v4 so they satisfy invariant 8.
 */
const validStackArb: fc.Arbitrary<Stack> = fc
  .tuple(uuidV4(), uuidV4(), uuidV4(), uuidV4(), uuidV4(), uuidV4(), uuidV4(), themeArb)
  .filter(([stackId, quizId, endId, correctBtnId, incorrectBtnId, endFieldId, _extra, _theme]) =>
    // All IDs must be distinct
    new Set([stackId, quizId, endId, correctBtnId, incorrectBtnId, endFieldId]).size === 6
  )
  .map(
    ([stackId, quizId, endId, correctBtnId, incorrectBtnId, endFieldId, _storyBtnId, theme]) => {
      const stack: Stack = {
        id: stackId,
        title: "A valid stack",
        theme,
        cards: [
          quizCard(quizId, correctBtnId, incorrectBtnId, endId),
          endCard(endId, endFieldId),
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
      fc.property(validStackArb, uuidV4(), (stack, bogusId) => {
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
      fc.property(validStackArb, uuidV4(), uuidV4(), (stack, extraEndId, extraFieldId) => {
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
      fc.property(validStackArb, uuidV4(), (stack, extraBtnId) => {
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
        fc.tuple(uuidV4(), uuidV4(), uuidV4(), themeArb),
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

// ---------------------------------------------------------------------------
// 8. invalid-id

/** An arbitrary that always produces a string that is NOT a valid UUID v4. */
const nonUuidArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant("not-a-uuid"),
  fc.constant(""),
  fc.constant("00000000-0000-1000-8000-000000000000"), // v1, not v4
  fc.constant("00000000-0000-5000-8000-000000000000"), // v5, not v4
  fc.constant("xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"), // template, not hex
  fc.hexaString({ minLength: 32, maxLength: 32 }),      // 32 hex chars, no dashes
  fc.string({ minLength: 1, maxLength: 40 }).filter(
    (s) => !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
  ),
);

describe("invariant: invalid-id", () => {
  it("reports invalid-id when the stack id is not a UUID v4", () => {
    fc.assert(
      fc.property(validStackArb, nonUuidArb, (stack, badId) => {
        const broken: Stack = { ...stack, id: badId };
        const result = validate(broken);
        expect(result.valid).toBe(false);
        if (!result.valid) expect(result.errors).toContain("invalid-id");
      })
    );
  });

  it("reports invalid-id when a card id is not a UUID v4", () => {
    fc.assert(
      fc.property(validStackArb, nonUuidArb, (stack, badId) => {
        const broken: Stack = {
          ...stack,
          cards: [
            { ...stack.cards[0]!, id: badId },
            ...stack.cards.slice(1),
          ],
        };
        const result = validate(broken);
        expect(result.valid).toBe(false);
        if (!result.valid) expect(result.errors).toContain("invalid-id");
      })
    );
  });

  it("reports invalid-id when an element id is not a UUID v4", () => {
    fc.assert(
      fc.property(validStackArb, nonUuidArb, (stack, badId) => {
        const firstCard = stack.cards[0]!;
        const firstEl = firstCard.elements[0];
        if (!firstEl) return;
        const broken: Stack = {
          ...stack,
          cards: [
            {
              ...firstCard,
              elements: [
                { ...firstEl, id: badId },
                ...firstCard.elements.slice(1),
              ],
            },
            ...stack.cards.slice(1),
          ],
        };
        const result = validate(broken);
        expect(result.valid).toBe(false);
        if (!result.valid) expect(result.errors).toContain("invalid-id");
      })
    );
  });

  it("accepts a stack where all ids are valid UUID v4", () => {
    fc.assert(
      fc.property(validStackArb, (stack) => {
        const result = validate(stack);
        expect(result.valid).toBe(true);
      })
    );
  });
});

// ---------------------------------------------------------------------------
// 9. goto-cycle

describe("invariant: goto-cycle", () => {
  /**
   * Arbitrary that generates a stack with a deliberate cycle in card-level gotos.
   * Strategy: take a valid stack and wire card-level goto chains into a cycle.
   *
   * We build a chain  A -> B -> C -> ... -> A  using card-level actions.
   * The cards themselves are valid (story kind), so only the goto graph is cyclic.
   */
  const cyclicGotoStackArb: fc.Arbitrary<Stack> = fc
    .tuple(
      uuidV4(), // stack id
      fc.array(
        fc.tuple(uuidV4(), uuidV4()), // [cardId, elementId] for each story card
        { minLength: 2, maxLength: 6 }
      ),
      fc.tuple(uuidV4(), uuidV4()), // [endCardId, endFieldId]
      themeArb,
    )
    .filter(([stackId, cardPairs, [endId, endFieldId], _theme]) => {
      const allIds = [
        stackId,
        ...cardPairs.flatMap(([cid, eid]) => [cid, eid]),
        endId,
        endFieldId,
      ];
      return new Set(allIds).size === allIds.length;
    })
    .map(([stackId, cardPairs, [endId, endFieldId], theme]) => {
      const n = cardPairs.length;

      // Build story cards where card[i]'s card-level action goes to card[(i+1)%n],
      // forming a cycle among the story cards.
      const storyCards: Card[] = cardPairs.map(([cardId, elemId], i) => {
        const nextCardId = cardPairs[(i + 1) % n]![0]!;
        return {
          id: cardId,
          kind: "story" as const,
          elements: [
            {
              type: "text" as const,
              id: elemId,
              x: 0,
              y: 0,
              w: 200,
              h: 50,
              content: `Card ${i}`,
            },
          ],
          // Card-level goto: creates the cycle
          actions: [{ type: "goto" as const, cardId: nextCardId }],
        };
      });

      const endCardObj: Card = {
        id: endId,
        kind: "end",
        elements: [
          {
            type: "field" as const,
            id: endFieldId,
            x: 0,
            y: 0,
            w: 200,
            h: 50,
            variable: "score",
          },
        ],
        actions: [],
      };

      const stack: Stack = {
        id: stackId,
        title: "Cyclic stack",
        theme,
        cards: [...storyCards, endCardObj],
      };
      return stack;
    });

  it(
    "reports goto-cycle when card-level gotos form a cycle (≥500 runs)",
    () => {
      fc.assert(
        fc.property(cyclicGotoStackArb, (stack) => {
          const result = validate(stack);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.errors).toContain("goto-cycle");
          }
        }),
        { numRuns: 500 },
      );
    },
  );

  /**
   * Arbitrary that generates a stack with an acyclic (or absent) card-level
   * goto graph.
   *
   * Strategy: build a linear chain  A -> B -> C -> end  using card-level
   * actions. There is no back-edge, so no cycle.
   */
  const acyclicGotoStackArb: fc.Arbitrary<Stack> = fc
    .tuple(
      uuidV4(), // stack id
      fc.array(
        fc.tuple(uuidV4(), uuidV4()), // [cardId, elementId]
        { minLength: 1, maxLength: 5 }
      ),
      fc.tuple(uuidV4(), uuidV4()), // [endCardId, endFieldId]
      themeArb,
    )
    .filter(([stackId, cardPairs, [endId, endFieldId], _theme]) => {
      const allIds = [
        stackId,
        ...cardPairs.flatMap(([cid, eid]) => [cid, eid]),
        endId,
        endFieldId,
      ];
      return new Set(allIds).size === allIds.length;
    })
    .map(([stackId, cardPairs, [endId, endFieldId], theme]) => {
      const n = cardPairs.length;

      // Linear chain: card[i] -> card[i+1]; last card -> end (no cycle).
      const storyCards: Card[] = cardPairs.map(([cardId, elemId], i) => {
        const nextId = i < n - 1 ? cardPairs[i + 1]![0]! : endId;
        return {
          id: cardId,
          kind: "story" as const,
          elements: [
            {
              type: "text" as const,
              id: elemId,
              x: 0,
              y: 0,
              w: 200,
              h: 50,
              content: `Card ${i}`,
            },
          ],
          actions: [{ type: "goto" as const, cardId: nextId }],
        };
      });

      const endCardObj: Card = {
        id: endId,
        kind: "end",
        elements: [
          {
            type: "field" as const,
            id: endFieldId,
            x: 0,
            y: 0,
            w: 200,
            h: 50,
            variable: "score",
          },
        ],
        actions: [],
      };

      const stack: Stack = {
        id: stackId,
        title: "Acyclic stack",
        theme,
        cards: [...storyCards, endCardObj],
      };
      return stack;
    });

  it(
    "never reports goto-cycle for acyclic card-level goto graphs (≥500 runs)",
    () => {
      fc.assert(
        fc.property(acyclicGotoStackArb, (stack) => {
          const result = validate(stack);
          // There must be no goto-cycle error.
          // (The stack may fail other invariants — we only assert no goto-cycle.)
          if (!result.valid) {
            expect(result.errors).not.toContain("goto-cycle");
          }
        }),
        { numRuns: 500 },
      );
    },
  );

  it("accepts a linear chain A → B → end (concrete acceptance test)", () => {
    // Uses fixed UUIDs so the test is deterministic.
    const stackId = "10000000-0000-4000-8000-000000000001";
    const cardA   = "20000000-0000-4000-8000-000000000002";
    const elemA   = "30000000-0000-4000-8000-000000000003";
    const cardB   = "40000000-0000-4000-8000-000000000004";
    const elemB   = "50000000-0000-4000-8000-000000000005";
    const endId   = "60000000-0000-4000-8000-000000000006";
    const endFld  = "70000000-0000-4000-8000-000000000007";

    const stack: Stack = {
      id: stackId,
      title: "Linear chain",
      theme: { background: "#fff", foreground: "#000", font: "sans-serif" },
      cards: [
        {
          id: cardA,
          kind: "story",
          elements: [
            { type: "text", id: elemA, x: 0, y: 0, w: 200, h: 50, content: "A" },
          ],
          actions: [{ type: "goto", cardId: cardB }],
        },
        {
          id: cardB,
          kind: "story",
          elements: [
            { type: "text", id: elemB, x: 0, y: 0, w: 200, h: 50, content: "B" },
          ],
          actions: [{ type: "goto", cardId: endId }],
        },
        {
          id: endId,
          kind: "end",
          elements: [
            { type: "field", id: endFld, x: 0, y: 0, w: 200, h: 50, variable: "score" },
          ],
          actions: [],
        },
      ],
    };

    const result = validate(stack);
    expect(result.valid).toBe(true);
    if (!result.valid) expect(result.errors).not.toContain("goto-cycle");
  });

  it("rejects a two-card cycle A → B → A via card-level actions (concrete rejection test)", () => {
    const stackId = "10000000-0000-4000-8000-000000000001";
    const cardA   = "20000000-0000-4000-8000-000000000002";
    const elemA   = "30000000-0000-4000-8000-000000000003";
    const cardB   = "40000000-0000-4000-8000-000000000004";
    const elemB   = "50000000-0000-4000-8000-000000000005";
    const endId   = "60000000-0000-4000-8000-000000000006";
    const endFld  = "70000000-0000-4000-8000-000000000007";

    const stack: Stack = {
      id: stackId,
      title: "Two-card cycle",
      theme: { background: "#fff", foreground: "#000", font: "sans-serif" },
      cards: [
        {
          id: cardA,
          kind: "story",
          elements: [
            { type: "text", id: elemA, x: 0, y: 0, w: 200, h: 50, content: "A" },
          ],
          // Card-level goto A → B
          actions: [{ type: "goto", cardId: cardB }],
        },
        {
          id: cardB,
          kind: "story",
          elements: [
            { type: "text", id: elemB, x: 0, y: 0, w: 200, h: 50, content: "B" },
          ],
          // Card-level goto B → A (back-edge, forms cycle)
          actions: [{ type: "goto", cardId: cardA }],
        },
        {
          id: endId,
          kind: "end",
          elements: [
            { type: "field", id: endFld, x: 0, y: 0, w: 200, h: 50, variable: "score" },
          ],
          actions: [],
        },
      ],
    };

    const result = validate(stack);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toContain("goto-cycle");
  });
});
