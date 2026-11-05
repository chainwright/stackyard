// tests/maker/operations.test.ts
// Unit tests for the pure edit operations in src/editor/operations.ts.
// Grows across TASK-06 … TASK-10.

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  editText,
  editLabel,
  markCorrect,
  addCard,
  removeCard,
  reorderCards,
  changeKind,
  setGotoTarget,
  moveElement,
} from "../../src/editor/operations.js";
import { validate } from "../../src/shared/validator.js";
import { isRejected } from "../../src/editor/types.js";
import type { Stack, ButtonElement } from "../../src/shared/types.js";
import { quizStack, storyStack } from "./fixtures.js";

/** Count correct answer buttons (score delta 1) on the first (quiz) card. */
function correctCount(stack: Stack, cardId: string): number {
  const card = stack.cards.find((c) => c.id === cardId)!;
  return card.elements.filter(
    (el) =>
      el.type === "button" &&
      (el as ButtonElement).actions.some(
        (a) => a.type === "score" && a.delta === 1
      )
  ).length;
}

const QUIZ_TEXT_ID = "40000000-0000-4000-8000-000000000004";
const CORRECT_BTN_ID = "50000000-0000-4000-8000-000000000005";
const WRONG_BTN_ID = "60000000-0000-4000-8000-000000000006";

function asStack(result: Stack | { rejected: true }): Stack {
  if (isRejected(result as never)) throw new Error("expected a Stack, got Rejected");
  return result as Stack;
}

// ---------------------------------------------------------------------------
// TASK-06 — editText

describe("editText", () => {
  it("updates content on a copy without mutating the input", () => {
    const stack = quizStack();
    const before = structuredClone(stack);
    const next = asStack(editText(stack, QUIZ_TEXT_ID, "New question?"));
    expect(stack).toEqual(before); // input untouched
    const text = next.cards[0]!.elements.find((e) => e.id === QUIZ_TEXT_ID)!;
    expect(text.type === "text" && text.content).toBe("New question?");
    expect(validate(next).valid).toBe(true);
  });

  it("rejects when the element no longer exists", () => {
    const stack = quizStack();
    const res = editText(stack, "99999999-9999-4999-8999-999999999999", "x");
    expect(isRejected(res)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TASK-06 — editLabel

describe("editLabel", () => {
  it("updates a button label on a copy and keeps the stack valid", () => {
    const stack = quizStack();
    const before = structuredClone(stack);
    const next = asStack(editLabel(stack, CORRECT_BTN_ID, "Waterford"));
    expect(stack).toEqual(before);
    const btn = next.cards[0]!.elements.find((e) => e.id === CORRECT_BTN_ID)!;
    expect(btn.type === "button" && btn.label).toBe("Waterford");
    expect(validate(next).valid).toBe(true);
  });

  it("rejects an empty / whitespace-only label", () => {
    const stack = quizStack();
    expect(isRejected(editLabel(stack, WRONG_BTN_ID, ""))).toBe(true);
    expect(isRejected(editLabel(stack, WRONG_BTN_ID, "   "))).toBe(true);
  });

  it("works on a story card's button too", () => {
    const stack = storyStack();
    const btnId = "51000000-0000-4000-8000-000000000005";
    const next = asStack(editLabel(stack, btnId, "Continue"));
    const btn = next.cards[0]!.elements.find((e) => e.id === btnId)!;
    expect(btn.type === "button" && btn.label).toBe("Continue");
    expect(validate(next).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TASK-07 — markCorrect

const QUIZ_CARD_ID = "20000000-0000-4000-8000-000000000002";

describe("markCorrect", () => {
  it("leaves exactly one correct button and at least one incorrect", () => {
    const stack = quizStack();
    // Mark the currently-wrong tile correct.
    const next = asStack(markCorrect(stack, QUIZ_CARD_ID, WRONG_BTN_ID));
    expect(correctCount(next, QUIZ_CARD_ID)).toBe(1);

    const card = next.cards[0]!;
    const buttons = card.elements.filter(
      (e): e is ButtonElement => e.type === "button"
    );
    const correct = buttons.filter((b) =>
      b.actions.some((a) => a.type === "score" && a.delta === 1)
    );
    const incorrect = buttons.filter((b) =>
      b.actions.some((a) => a.type === "score" && a.delta === 0)
    );
    expect(correct).toHaveLength(1);
    expect(incorrect.length).toBeGreaterThanOrEqual(1);
    expect(correct[0]!.id).toBe(WRONG_BTN_ID);
    expect(validate(next).valid).toBe(true);
  });

  it("re-marking a different tile moves the single correct marking", () => {
    const stack = quizStack();
    const step1 = asStack(markCorrect(stack, QUIZ_CARD_ID, WRONG_BTN_ID));
    const step2 = asStack(markCorrect(step1, QUIZ_CARD_ID, CORRECT_BTN_ID));
    expect(correctCount(step2, QUIZ_CARD_ID)).toBe(1);
    const card = step2.cards[0]!;
    const correct = card.elements.find(
      (e) =>
        e.type === "button" &&
        (e as ButtonElement).actions.some(
          (a) => a.type === "score" && a.delta === 1
        )
    )!;
    expect(correct.id).toBe(CORRECT_BTN_ID);
  });

  it("the correct button keeps its goto and gains a cheer; wrong gets buzz", () => {
    const stack = quizStack();
    const next = asStack(markCorrect(stack, QUIZ_CARD_ID, CORRECT_BTN_ID));
    const correct = next.cards[0]!.elements.find(
      (e) => e.id === CORRECT_BTN_ID
    ) as ButtonElement;
    const wrong = next.cards[0]!.elements.find(
      (e) => e.id === WRONG_BTN_ID
    ) as ButtonElement;
    expect(correct.actions.some((a) => a.type === "goto")).toBe(true);
    expect(correct.actions.some((a) => a.type === "sound" && a.sound === "cheer")).toBe(true);
    expect(wrong.actions.some((a) => a.type === "sound" && a.sound === "buzz")).toBe(true);
  });

  it("rejects a button that is not an answer tile", () => {
    const stack = quizStack();
    const res = markCorrect(stack, QUIZ_CARD_ID, "nope-0000-4000-8000-000000000000");
    expect(isRejected(res)).toBe(true);
  });

  it("property: exactly one correct always holds after marking any tile (>=500 runs)", () => {
    // Arbitrary: a quiz card with 2-4 answer buttons; pick any one to mark.
    // Generate enough unique UUIDs for every id (5 fixed + nBtns buttons).
    const quizArb = fc.integer({ min: 2, max: 4 }).chain((nBtns) =>
      fc
        .uniqueArray(fc.uuid({ version: 4 }), {
          minLength: 5 + nBtns,
          maxLength: 5 + nBtns,
        })
        .chain((ids) =>
          fc.integer({ min: 0, max: nBtns - 1 }).map((markIdx) => {
            const [stackId, quizId, endId, endField, qText] = ids;
            const btnIds = ids.slice(5);
            const buttons: ButtonElement[] = Array.from(
              { length: nBtns },
              (_unused, i) => ({
                type: "button",
                id: btnIds[i]!,
                x: 0,
                y: i * 60,
                w: 300,
                h: 50,
                label: `Answer ${i}`,
                actions: [
                  { type: "score", delta: i === 0 ? 1 : 0 },
                  { type: "goto", cardId: endId! },
                ],
              })
            );
            const stack: Stack = {
              id: stackId!,
              title: "Prop quiz",
              theme: { background: "#fff", foreground: "#000", font: "serif" },
              cards: [
                {
                  id: quizId!,
                  kind: "quiz",
                  elements: [
                    { type: "text", id: qText!, x: 0, y: 0, w: 400, h: 50, content: "Q?" },
                    ...buttons,
                  ],
                  actions: [],
                },
                {
                  id: endId!,
                  kind: "end",
                  elements: [
                    { type: "field", id: endField!, x: 0, y: 0, w: 200, h: 50, variable: "score" },
                  ],
                  actions: [],
                },
              ],
            };
            return { stack, cardId: quizId!, buttonId: btnIds[markIdx]! };
          })
        )
    );

    fc.assert(
      fc.property(quizArb, ({ stack, cardId, buttonId }) => {
        const next = markCorrect(stack, cardId, buttonId);
        expect(isRejected(next)).toBe(false);
        const result = next as Stack;
        expect(correctCount(result, cardId)).toBe(1);
        expect(validate(result).valid).toBe(true);
      }),
      { numRuns: 500 }
    );
  });
});

// ---------------------------------------------------------------------------
// TASK-08 — addCard, removeCard, reorderCards

const END_CARD_ID = "30000000-0000-4000-8000-000000000003";

describe("addCard", () => {
  it("adds each content kind and keeps the stack valid", () => {
    for (const kind of ["quiz", "flash", "story"] as const) {
      const stack = quizStack();
      const next = asStack(addCard(stack, kind, 1));
      expect(next.cards).toHaveLength(stack.cards.length + 1);
      expect(next.cards[1]!.kind).toBe(kind);
      expect(validate(next).valid).toBe(true);
    }
  });

  it("gives a new quiz card exactly one correct answer", () => {
    const stack = storyStack();
    const next = asStack(addCard(stack, "quiz", 0));
    const quiz = next.cards[0]!;
    expect(correctCount(next, quiz.id)).toBe(1);
    expect(validate(next).valid).toBe(true);
  });

  it("rejects adding a second end card", () => {
    const stack = quizStack();
    expect(isRejected(addCard(stack, "end", 1))).toBe(true);
  });

  it("does not mutate the input stack", () => {
    const stack = quizStack();
    const before = structuredClone(stack);
    addCard(stack, "story", 0);
    expect(stack).toEqual(before);
  });
});

describe("removeCard", () => {
  it("clears button and card-level gotos that targeted the removed card", () => {
    // Start from a story stack, add a middle card, and point gotos at it.
    const base = storyStack();
    const withMiddle = asStack(addCard(base, "story", 1));
    const middleId = withMiddle.cards[1]!.id;

    // Point the first card's button goto AND a card-level goto at the middle.
    const wired: Stack = {
      ...withMiddle,
      cards: withMiddle.cards.map((c, i) => {
        if (i !== 0) return c;
        return {
          ...c,
          actions: [{ type: "goto", cardId: middleId }],
          elements: c.elements.map((el) =>
            el.type === "button"
              ? { ...el, actions: [{ type: "goto", cardId: middleId }] }
              : el
          ),
        };
      }),
    };
    expect(validate(wired).valid).toBe(true);

    const next = asStack(removeCard(wired, middleId));
    // No goto anywhere still points at the removed card.
    const allGotos = next.cards.flatMap((c) => [
      ...c.actions,
      ...c.elements.flatMap((el) => (el.type === "button" ? el.actions : [])),
    ]);
    expect(allGotos.some((a) => a.type === "goto" && a.cardId === middleId)).toBe(false);
    expect(validate(next).valid).toBe(true);
  });

  it("rejects removing the only end card", () => {
    const stack = quizStack();
    expect(isRejected(removeCard(stack, END_CARD_ID))).toBe(true);
  });

  it("rejects removing the only non-end card", () => {
    const stack = quizStack(); // one quiz (non-end) + one end
    expect(isRejected(removeCard(stack, QUIZ_CARD_ID))).toBe(true);
  });

  it("removes a card when more than one non-end card remains", () => {
    const base = quizStack();
    const withExtra = asStack(addCard(base, "story", 1));
    const extraId = withExtra.cards[1]!.id;
    const next = asStack(removeCard(withExtra, extraId));
    expect(next.cards.some((c) => c.id === extraId)).toBe(false);
    expect(validate(next).valid).toBe(true);
  });
});

describe("reorderCards", () => {
  it("changes order but keeps every id and stays valid", () => {
    const base = quizStack();
    const withExtra = asStack(addCard(base, "story", 1)); // [quiz, story, end]
    const idsBefore = withExtra.cards.map((c) => c.id).sort();

    const next = asStack(reorderCards(withExtra, 0, 1)); // swap quiz/story
    expect(next.cards[0]!.kind).toBe("story");
    expect(next.cards[1]!.kind).toBe("quiz");
    expect(next.cards.map((c) => c.id).sort()).toEqual(idsBefore);
    expect(validate(next).valid).toBe(true);
  });

  it("clamps out-of-range indices and does not mutate input", () => {
    const base = quizStack();
    const before = structuredClone(base);
    const next = asStack(reorderCards(base, 99, -5));
    expect(next.cards).toHaveLength(base.cards.length);
    expect(base).toEqual(before);
    expect(validate(next).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TASK-09 — changeKind

describe("changeKind", () => {
  it("quiz -> story stays valid", () => {
    const stack = quizStack();
    const next = asStack(changeKind(stack, QUIZ_CARD_ID, "story"));
    expect(next.cards[0]!.kind).toBe("story");
    expect(validate(next).valid).toBe(true);
  });

  it("story -> quiz seeds exactly one correct answer and stays valid", () => {
    const stack = storyStack();
    const storyId = stack.cards[0]!.id;
    const next = asStack(changeKind(stack, storyId, "quiz"));
    expect(next.cards[0]!.kind).toBe("quiz");
    expect(correctCount(next, storyId)).toBe(1);
    expect(validate(next).valid).toBe(true);
  });

  it("rejects changing a card to end when an end card already exists", () => {
    const stack = quizStack();
    expect(isRejected(changeKind(stack, QUIZ_CARD_ID, "end"))).toBe(true);
  });

  it("rejects changing the only end card away from end", () => {
    const stack = quizStack();
    expect(isRejected(changeKind(stack, END_CARD_ID, "story"))).toBe(true);
  });

  it("allows moving the end role to another card (two-step is fine)", () => {
    // Add a story card, make the current end a story (rejected while sole end),
    // so instead: change a non-end to end is rejected too (sole end exists).
    // This confirms the guard: you can't create a second end in one step.
    const base = quizStack();
    const withExtra = asStack(addCard(base, "story", 1));
    const extraId = withExtra.cards[1]!.id;
    expect(isRejected(changeKind(withExtra, extraId, "end"))).toBe(true);
  });

  it("does not mutate the input stack", () => {
    const stack = storyStack();
    const before = structuredClone(stack);
    changeKind(stack, stack.cards[0]!.id, "quiz");
    expect(stack).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// TASK-10 — setGotoTarget, moveElement

describe("setGotoTarget", () => {
  const STORY_BTN_ID = "51000000-0000-4000-8000-000000000005";

  it("sets a button goto to an existing card and stays valid", () => {
    const stack = storyStack();
    const next = asStack(setGotoTarget(stack, STORY_BTN_ID, END_CARD_ID));
    const btn = next.cards[0]!.elements.find((e) => e.id === STORY_BTN_ID)!;
    const gotos =
      btn.type === "button"
        ? btn.actions.filter((a) => a.type === "goto")
        : [];
    expect(gotos).toHaveLength(1);
    expect(gotos[0]!.type === "goto" && gotos[0]!.cardId).toBe(END_CARD_ID);
    expect(validate(next).valid).toBe(true);
  });

  it("rejects an unknown target card", () => {
    const stack = storyStack();
    const res = setGotoTarget(stack, STORY_BTN_ID, "99999999-9999-4999-8999-999999999999");
    expect(isRejected(res)).toBe(true);
  });

  it("does not mutate the input stack", () => {
    const stack = storyStack();
    const before = structuredClone(stack);
    setGotoTarget(stack, STORY_BTN_ID, END_CARD_ID);
    expect(stack).toEqual(before);
  });
});

describe("moveElement", () => {
  it("clamps a move beyond the right/bottom edge so x+w<=800 and y+h<=600", () => {
    const stack = quizStack();
    // Correct button is 340x80. Push it far off the edge.
    const next = asStack(moveElement(stack, CORRECT_BTN_ID, 9999, 9999));
    const el = next.cards[0]!.elements.find((e) => e.id === CORRECT_BTN_ID)!;
    expect(el.x + el.w).toBeLessThanOrEqual(800);
    expect(el.y + el.h).toBeLessThanOrEqual(600);
    expect(el.x).toBe(800 - el.w);
    expect(el.y).toBe(600 - el.h);
    expect(validate(next).valid).toBe(true);
  });

  it("clamps negative coordinates to zero", () => {
    const stack = quizStack();
    const next = asStack(moveElement(stack, CORRECT_BTN_ID, -50, -50));
    const el = next.cards[0]!.elements.find((e) => e.id === CORRECT_BTN_ID)!;
    expect(el.x).toBe(0);
    expect(el.y).toBe(0);
  });

  it("keeps a valid in-range move exactly", () => {
    const stack = quizStack();
    const next = asStack(moveElement(stack, CORRECT_BTN_ID, 100, 120));
    const el = next.cards[0]!.elements.find((e) => e.id === CORRECT_BTN_ID)!;
    expect(el.x).toBe(100);
    expect(el.y).toBe(120);
  });

  it("property: result always fits the canvas for any input (>=500 runs)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -5000, max: 5000 }),
        fc.integer({ min: -5000, max: 5000 }),
        (x, y) => {
          const next = moveElement(quizStack(), CORRECT_BTN_ID, x, y) as Stack;
          const el = next.cards[0]!.elements.find((e) => e.id === CORRECT_BTN_ID)!;
          expect(el.x).toBeGreaterThanOrEqual(0);
          expect(el.y).toBeGreaterThanOrEqual(0);
          expect(el.x + el.w).toBeLessThanOrEqual(800);
          expect(el.y + el.h).toBeLessThanOrEqual(600);
        }
      ),
      { numRuns: 500 }
    );
  });
});

// ---------------------------------------------------------------------------
// TASK-21 — addTextElement, addButtonElement, addPictureElement,
//           linkButtonToCard (the four toolbar tools)

import {
  addTextElement,
  addButtonElement,
  addPictureElement,
  linkButtonToCard,
  MAX_PICTURE_BYTES,
} from "../../src/editor/operations.js";

// A tiny valid PNG data URI (1×1 transparent pixel).
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("addTextElement", () => {
  it("adds a text element to a card and keeps the stack valid", () => {
    const stack = quizStack();
    const before = structuredClone(stack);
    const next = asStack(addTextElement(stack, QUIZ_CARD_ID, "A new note"));
    expect(stack).toEqual(before); // input untouched
    const card = next.cards.find((c) => c.id === QUIZ_CARD_ID)!;
    const added = card.elements.filter((e) => e.type === "text");
    expect(added.some((t) => t.type === "text" && t.content === "A new note")).toBe(true);
    expect(validate(next).valid).toBe(true);
  });

  it("the added text sits on the canvas (invariant 5)", () => {
    const stack = quizStack();
    const next = asStack(addTextElement(stack, QUIZ_CARD_ID));
    for (const card of next.cards) {
      for (const el of card.elements) {
        expect(el.x + el.w).toBeLessThanOrEqual(800);
        expect(el.y + el.h).toBeLessThanOrEqual(600);
      }
    }
  });

  it("rejects an unknown card", () => {
    const stack = quizStack();
    expect(isRejected(addTextElement(stack, "99999999-9999-4999-8999-999999999999"))).toBe(true);
  });
});

describe("addButtonElement", () => {
  it("adds a plain button and keeps a quiz card valid (not an answer tile)", () => {
    const stack = quizStack();
    const before = structuredClone(stack);
    const next = asStack(addButtonElement(stack, QUIZ_CARD_ID, "Continue"));
    expect(stack).toEqual(before);
    // The quiz card still has exactly one correct answer — the new button
    // carries no score action, so it does not count as a tile.
    expect(correctCount(next, QUIZ_CARD_ID)).toBe(1);
    const card = next.cards.find((c) => c.id === QUIZ_CARD_ID)!;
    expect(card.elements.some((e) => e.type === "button" && e.label === "Continue")).toBe(true);
    expect(validate(next).valid).toBe(true);
  });

  it("rejects a blank label", () => {
    const stack = quizStack();
    expect(isRejected(addButtonElement(stack, QUIZ_CARD_ID, "   "))).toBe(true);
  });

  it("rejects an unknown card", () => {
    const stack = quizStack();
    expect(isRejected(addButtonElement(stack, "99999999-9999-4999-8999-999999999999"))).toBe(true);
  });
});

describe("addPictureElement", () => {
  it("adds an image from a data URI with alt text and stays valid", () => {
    const stack = storyStack();
    const cardId = stack.cards[0]!.id;
    const next = asStack(addPictureElement(stack, cardId, TINY_PNG, "A Viking longship"));
    const card = next.cards.find((c) => c.id === cardId)!;
    const img = card.elements.find((e) => e.type === "image");
    expect(img && img.type === "image" && img.src).toBe(TINY_PNG);
    expect(img && img.type === "image" && img.alt).toBe("A Viking longship");
    expect(validate(next).valid).toBe(true);
  });

  it("rejects a non-data-URI src (keeps the file self-contained)", () => {
    const stack = storyStack();
    const cardId = stack.cards[0]!.id;
    expect(isRejected(addPictureElement(stack, cardId, "https://example.com/a.png", "A photo"))).toBe(true);
  });

  it("rejects empty alt text (accessibility)", () => {
    const stack = storyStack();
    const cardId = stack.cards[0]!.id;
    expect(isRejected(addPictureElement(stack, cardId, TINY_PNG, "   "))).toBe(true);
  });

  it("rejects a picture over the size cap", () => {
    const stack = storyStack();
    const cardId = stack.cards[0]!.id;
    // Build a base64 payload whose decoded size exceeds MAX_PICTURE_BYTES.
    const bytesNeeded = MAX_PICTURE_BYTES + 1024;
    const base64Len = Math.ceil(bytesNeeded / 3) * 4;
    const huge = "data:image/png;base64," + "A".repeat(base64Len);
    expect(isRejected(addPictureElement(stack, cardId, huge, "Too big"))).toBe(true);
  });

  it("does not mutate the input stack", () => {
    const stack = storyStack();
    const before = structuredClone(stack);
    addPictureElement(stack, stack.cards[0]!.id, TINY_PNG, "A photo");
    expect(stack).toEqual(before);
  });
});

describe("linkButtonToCard", () => {
  const STORY_BTN_ID = "51000000-0000-4000-8000-000000000005";

  it("links a button to an existing card and stays valid", () => {
    const stack = storyStack();
    const next = asStack(linkButtonToCard(stack, STORY_BTN_ID, END_CARD_ID));
    const btn = next.cards[0]!.elements.find((e) => e.id === STORY_BTN_ID)!;
    const gotos = btn.type === "button" ? btn.actions.filter((a) => a.type === "goto") : [];
    expect(gotos).toHaveLength(1);
    expect(gotos[0]!.type === "goto" && gotos[0]!.cardId).toBe(END_CARD_ID);
    expect(validate(next).valid).toBe(true);
  });

  it("rejects when the selected element is not a button", () => {
    const stack = storyStack();
    const textId = stack.cards[0]!.elements.find((e) => e.type === "text")!.id;
    expect(isRejected(linkButtonToCard(stack, textId, END_CARD_ID))).toBe(true);
  });

  it("rejects an unknown target card", () => {
    const stack = storyStack();
    expect(isRejected(linkButtonToCard(stack, STORY_BTN_ID, "99999999-9999-4999-8999-999999999999"))).toBe(true);
  });
});
