// tests/maker/arbitraries.ts
// Shared fast-check arbitraries for the Maker property tests:
//   - a valid starting Stack (quiz/story/flash content cards + one end card)
//   - a single random, type-correct editor operation bound to ids that exist
//
// The operation arbitrary picks args at generation time; the property tests
// re-resolve "an id that exists" against the live stack at application time by
// having each op carry a selector (index) rather than a hard id, so the op is
// always applicable to the current stack.

import * as fc from "fast-check";
import type { Stack, Card, Element, Action, ButtonElement } from "../../src/shared/types.js";
import type { EditOperation } from "../../src/editor/types.js";
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
  addTextElement,
  addButtonElement,
  addPictureElement,
  linkButtonToCard,
} from "../../src/editor/operations.js";

// A tiny valid PNG data URI (1×1 transparent pixel) for addPictureElement.
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const uuidV4 = (): fc.Arbitrary<string> => fc.uuid({ version: 4 });

const themeArb = fc.record({
  background: fc.constantFrom("#000", "#fff", "#FBF8F1"),
  foreground: fc.constantFrom("#000", "#fff", "#1E2A47"),
  font: fc.constantFrom("sans-serif", "serif", "monospace"),
});

function quizCard(cardId: string, ids: string[], nextId: string): Card {
  const [qText, correct, wrong] = ids;
  return {
    id: cardId,
    kind: "quiz",
    elements: [
      { type: "text", id: qText!, x: 0, y: 0, w: 400, h: 50, content: "Q?" },
      {
        type: "button",
        id: correct!,
        x: 0, y: 60, w: 300, h: 50,
        label: "Right",
        actions: [
          { type: "score", delta: 1 },
          { type: "sound", sound: "cheer" },
          { type: "goto", cardId: nextId },
        ],
      },
      {
        type: "button",
        id: wrong!,
        x: 0, y: 120, w: 300, h: 50,
        label: "Wrong",
        actions: [
          { type: "score", delta: 0 },
          { type: "sound", sound: "buzz" },
          { type: "goto", cardId: nextId },
        ],
      },
    ],
    actions: [],
  };
}

function storyCard(cardId: string, ids: string[], nextId: string): Card {
  const [text, btn] = ids;
  return {
    id: cardId,
    kind: "story",
    elements: [
      { type: "text", id: text!, x: 0, y: 0, w: 400, h: 50, content: "Story" },
      {
        type: "button",
        id: btn!,
        x: 0, y: 60, w: 200, h: 50,
        label: "Next",
        actions: [{ type: "goto", cardId: nextId }],
      },
    ],
    actions: [],
  };
}

function flashCard(cardId: string, ids: string[]): Card {
  const [front, back] = ids;
  return {
    id: cardId,
    kind: "flash",
    elements: [
      { type: "text", id: front!, x: 0, y: 0, w: 400, h: 100, content: "Term" },
      { type: "text", id: back!, x: 0, y: 120, w: 400, h: 100, content: "Meaning" },
    ],
    actions: [],
  };
}

function endCardOf(cardId: string, fieldId: string): Card {
  return {
    id: cardId,
    kind: "end",
    elements: [
      { type: "field", id: fieldId, x: 0, y: 0, w: 200, h: 50, variable: "score" },
    ],
    actions: [],
  };
}

/** A valid stack: 1-4 content cards (quiz/story/flash) chained to one end card. */
export const validStackArb: fc.Arbitrary<Stack> = fc
  .record({
    stackId: uuidV4(),
    endId: uuidV4(),
    endFieldId: uuidV4(),
    title: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
    theme: themeArb,
    contentKinds: fc.array(fc.constantFrom("quiz", "story", "flash"), {
      minLength: 1,
      maxLength: 4,
    }),
    // Enough spare UUIDs for every element id across all content cards (3 each).
    elementIds: fc.uniqueArray(uuidV4(), { minLength: 12, maxLength: 12 }),
    cardIds: fc.uniqueArray(uuidV4(), { minLength: 4, maxLength: 4 }),
  })
  .map((spec) => {
    const n = spec.contentKinds.length;
    const cards: Card[] = spec.contentKinds.map((kind, i) => {
      const cardId = spec.cardIds[i]!;
      const nextId = i < n - 1 ? spec.cardIds[i + 1]! : spec.endId;
      const ids = spec.elementIds.slice(i * 3, i * 3 + 3);
      if (kind === "quiz") return quizCard(cardId, ids, nextId);
      if (kind === "flash") return flashCard(cardId, ids);
      return storyCard(cardId, ids, nextId);
    });
    cards.push(endCardOf(spec.endId, spec.endFieldId));
    return {
      id: spec.stackId,
      title: spec.title,
      theme: spec.theme,
      cards,
    } satisfies Stack;
  })
  .filter((stack) => {
    // Guard uniqueness across the whole document (UUID collisions ~ impossible).
    const ids: string[] = [stack.id];
    for (const c of stack.cards) {
      ids.push(c.id);
      for (const el of c.elements) ids.push(el.id);
    }
    return new Set(ids).size === ids.length;
  });

// ---------------------------------------------------------------------------
// Operation selectors — resolved against the LIVE stack at application time.

/** Pick an element of a given predicate from any card; returns [cardId, el]. */
function pickElement(
  stack: Stack,
  which: (el: Element) => boolean,
  seed: number
): { cardId: string; el: Element } | null {
  const matches: { cardId: string; el: Element }[] = [];
  for (const c of stack.cards) {
    for (const el of c.elements) {
      if (which(el)) matches.push({ cardId: c.id, el });
    }
  }
  if (matches.length === 0) return null;
  return matches[seed % matches.length]!;
}

/**
 * A single random operation, encoded as a function that, given the live stack,
 * resolves type-correct args against ids that exist right now and returns an
 * EditOperation. If no suitable target exists, it returns a no-op that returns
 * the same stack (so the sequence always makes progress safely).
 */
export type OpSpec = (stack: Stack) => EditOperation;

const noop: EditOperation = (s) => s;

export const opSpecArb: fc.Arbitrary<OpSpec> = fc.oneof(
  // editText
  fc.record({ kind: fc.constant("editText" as const), seed: fc.nat(), content: fc.string() }).map(
    (o): OpSpec => (stack) => {
      const hit = pickElement(stack, (el) => el.type === "text", o.seed);
      return hit ? (s) => editText(s, hit.el.id, o.content) : noop;
    }
  ),
  // editLabel (non-empty)
  fc.record({ kind: fc.constant("editLabel" as const), seed: fc.nat(), label: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0) }).map(
    (o): OpSpec => (stack) => {
      const hit = pickElement(stack, (el) => el.type === "button", o.seed);
      return hit ? (s) => editLabel(s, hit.el.id, o.label) : noop;
    }
  ),
  // markCorrect — pick a quiz card's answer button
  fc.record({ kind: fc.constant("markCorrect" as const), seed: fc.nat() }).map(
    (o): OpSpec => (stack) => {
      const quizzes = stack.cards.filter((c) => c.kind === "quiz");
      if (quizzes.length === 0) return noop;
      const card = quizzes[o.seed % quizzes.length]!;
      const answers = card.elements.filter(
        (el): el is ButtonElement =>
          el.type === "button" && el.actions.some((a) => a.type === "score")
      );
      if (answers.length === 0) return noop;
      const btn = answers[o.seed % answers.length]!;
      return (s) => markCorrect(s, card.id, btn.id);
    }
  ),
  // addCard — content kinds only (adding end is rejected when one exists)
  fc.record({ kind: fc.constant("addCard" as const), cardKind: fc.constantFrom<Card["kind"]>("quiz", "story", "flash"), idx: fc.nat() }).map(
    (o): OpSpec => (stack) => (s) => addCard(s, o.cardKind, o.idx % (stack.cards.length + 1))
  ),
  // removeCard — pick any card (op rejects sole end / sole non-end safely)
  fc.record({ kind: fc.constant("removeCard" as const), seed: fc.nat() }).map(
    (o): OpSpec => (stack) => {
      const card = stack.cards[o.seed % stack.cards.length]!;
      return (s) => removeCard(s, card.id);
    }
  ),
  // reorderCards
  fc.record({ kind: fc.constant("reorderCards" as const), from: fc.nat(), to: fc.nat() }).map(
    (o): OpSpec => (stack) => (s) => reorderCards(s, o.from % stack.cards.length, o.to % stack.cards.length)
  ),
  // changeKind — pick a card and a kind (op rejects illegal end transitions)
  fc.record({ kind: fc.constant("changeKind" as const), seed: fc.nat(), newKind: fc.constantFrom<Card["kind"]>("quiz", "story", "flash", "end") }).map(
    (o): OpSpec => (stack) => {
      const card = stack.cards[o.seed % stack.cards.length]!;
      return (s) => changeKind(s, card.id, o.newKind);
    }
  ),
  // setGotoTarget — pick a button and an existing target card
  fc.record({ kind: fc.constant("setGotoTarget" as const), btnSeed: fc.nat(), cardSeed: fc.nat() }).map(
    (o): OpSpec => (stack) => {
      const hit = pickElement(stack, (el) => el.type === "button", o.btnSeed);
      if (!hit) return noop;
      const target = stack.cards[o.cardSeed % stack.cards.length]!;
      return (s) => setGotoTarget(s, hit.el.id, target.id);
    }
  ),
  // moveElement — pick any element, any (possibly out-of-range) coords
  fc.record({ kind: fc.constant("moveElement" as const), seed: fc.nat(), x: fc.integer({ min: -2000, max: 2000 }), y: fc.integer({ min: -2000, max: 2000 }) }).map(
    (o): OpSpec => (stack) => {
      const hit = pickElement(stack, () => true, o.seed);
      return hit ? (s) => moveElement(s, hit.el.id, o.x, o.y) : noop;
    }
  ),
  // addTextElement — add a text element to any card
  fc.record({ kind: fc.constant("addTextElement" as const), seed: fc.nat(), content: fc.string() }).map(
    (o): OpSpec => (stack) => {
      const card = stack.cards[o.seed % stack.cards.length]!;
      return (s) => addTextElement(s, card.id, o.content);
    }
  ),
  // addButtonElement — add a plain (non-answer) button to any card
  fc.record({ kind: fc.constant("addButtonElement" as const), seed: fc.nat(), label: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0) }).map(
    (o): OpSpec => (stack) => {
      const card = stack.cards[o.seed % stack.cards.length]!;
      return (s) => addButtonElement(s, card.id, o.label);
    }
  ),
  // addPictureElement — add a picture (valid data URI + alt) to any card
  fc.record({ kind: fc.constant("addPictureElement" as const), seed: fc.nat(), alt: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0) }).map(
    (o): OpSpec => (stack) => {
      const card = stack.cards[o.seed % stack.cards.length]!;
      return (s) => addPictureElement(s, card.id, TINY_PNG, o.alt);
    }
  ),
  // linkButtonToCard — link a button to an existing card
  fc.record({ kind: fc.constant("linkButtonToCard" as const), btnSeed: fc.nat(), cardSeed: fc.nat() }).map(
    (o): OpSpec => (stack) => {
      const hit = pickElement(stack, (el) => el.type === "button", o.btnSeed);
      if (!hit) return noop;
      const target = stack.cards[o.cardSeed % stack.cards.length]!;
      return (s) => linkButtonToCard(s, hit.el.id, target.id);
    }
  )
);
