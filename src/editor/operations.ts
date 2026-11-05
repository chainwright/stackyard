// src/editor/operations.ts
// Pure edit operations: (stack, args) => Stack | Rejected.
//
// Every operation returns a NEW stack (structural copy); it never mutates the
// input. The store runs validate() on the result and only commits valid
// stacks, so these operations are the editor's single source of edit logic.

import type {
  Stack,
  Card,
  Element,
  ButtonElement,
  Action,
} from "../shared/types.js";
import { reject, type Rejected } from "./types.js";

// ---------------------------------------------------------------------------
// Small helpers

/** Generate a fresh RFC 4122 v4 UUID. */
function newId(): string {
  return crypto.randomUUID();
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/** True if a button carries a correct-answer score action. */
function isAnswerButton(btn: ButtonElement): boolean {
  return btn.actions.some((a) => a.type === "score");
}

/** Map every element on a card through `fn`, returning a new card. */
function mapElements(card: Card, fn: (el: Element) => Element): Card {
  return { ...card, elements: card.elements.map(fn) };
}

/** Map a single card (by id) through `fn`, returning a new stack. */
function mapCard(stack: Stack, cardId: string, fn: (card: Card) => Card): Stack {
  return {
    ...stack,
    cards: stack.cards.map((c) => (c.id === cardId ? fn(c) : c)),
  };
}

/** Find which card owns an element id. */
function cardOfElement(stack: Stack, elementId: string): Card | undefined {
  return stack.cards.find((c) => c.elements.some((el) => el.id === elementId));
}

// ---------------------------------------------------------------------------
// TASK-06 — editText, editLabel

/**
 * Replace a text element's `content`. Returns a new stack unchanged if the
 * element is not a text element or does not exist (keeps the stack valid).
 */
export function editText(
  stack: Stack,
  elementId: string,
  content: string
): Stack | Rejected {
  const card = cardOfElement(stack, elementId);
  if (card === undefined) return reject("That text isn't here any more.");
  return mapCard(stack, card.id, (c) =>
    mapElements(c, (el) =>
      el.id === elementId && el.type === "text" ? { ...el, content } : el
    )
  );
}

/**
 * Replace a button element's `label`. Rejects an empty (whitespace-only)
 * label so the stack never holds a blank button label.
 */
export function editLabel(
  stack: Stack,
  elementId: string,
  label: string
): Stack | Rejected {
  if (label.trim().length === 0) {
    return reject("A button needs some words on it. Type a label.");
  }
  const card = cardOfElement(stack, elementId);
  if (card === undefined) return reject("That button isn't here any more.");
  return mapCard(stack, card.id, (c) =>
    mapElements(c, (el) =>
      el.id === elementId && el.type === "button" ? { ...el, label } : el
    )
  );
}

// ---------------------------------------------------------------------------
// TASK-07 — markCorrect (invariant 4)

/** Replace any existing score action on a button with a single delta. */
function withScore(actions: Action[], delta: number): Action[] {
  const kept = actions.filter((a) => a.type !== "score" && a.type !== "sound");
  const sound: Action = {
    type: "sound",
    sound: delta === 1 ? "cheer" : "buzz",
  };
  // Keep goto (and any set) actions; put score + sound first for readability.
  return [{ type: "score", delta }, sound, ...kept];
}

/**
 * Mark one quiz-card button the correct answer. Sets the chosen button to
 * score:1 + cheer and every OTHER answer button on the card to score:0 + buzz,
 * leaving each button's goto (and other) actions intact. Idempotent; always
 * yields exactly one correct answer (invariant 4).
 */
export function markCorrect(
  stack: Stack,
  cardId: string,
  buttonId: string
): Stack | Rejected {
  const card = stack.cards.find((c) => c.id === cardId);
  if (card === undefined) return reject("That card isn't here any more.");

  const answerButtons = card.elements.filter(
    (el): el is ButtonElement => el.type === "button" && isAnswerButton(el)
  );
  const target = answerButtons.find((b) => b.id === buttonId);
  if (target === undefined) {
    return reject("That tile isn't an answer on this card.");
  }

  return mapCard(stack, cardId, (c) =>
    mapElements(c, (el) => {
      if (el.type !== "button" || !isAnswerButton(el)) return el;
      const delta = el.id === buttonId ? 1 : 0;
      return { ...el, actions: withScore(el.actions, delta) };
    })
  );
}

// ---------------------------------------------------------------------------
// TASK-08 — addCard, removeCard, reorderCards

/** Build a valid seed card of the given kind with fresh UUIDs. */
function seedCard(kind: Card["kind"]): Card {
  const cardId = newId();
  switch (kind) {
    case "quiz": {
      // A quiz seed must satisfy invariant 4: exactly one correct answer.
      return {
        id: cardId,
        kind: "quiz",
        elements: [
          {
            type: "text",
            id: newId(),
            x: 40, y: 40, w: 720, h: 120,
            content: "Your question?",
          },
          {
            type: "button",
            id: newId(),
            x: 40, y: 200, w: 340, h: 80,
            label: "Right answer",
            actions: [
              { type: "score", delta: 1 },
              { type: "sound", sound: "cheer" },
            ],
          },
          {
            type: "button",
            id: newId(),
            x: 420, y: 200, w: 340, h: 80,
            label: "Wrong answer",
            actions: [
              { type: "score", delta: 0 },
              { type: "sound", sound: "buzz" },
            ],
          },
        ],
        actions: [],
      };
    }
    case "flash": {
      return {
        id: cardId,
        kind: "flash",
        elements: [
          { type: "text", id: newId(), x: 40, y: 60, w: 720, h: 160, content: "Term" },
          { type: "text", id: newId(), x: 40, y: 260, w: 720, h: 160, content: "Explanation" },
        ],
        actions: [],
      };
    }
    case "story": {
      return {
        id: cardId,
        kind: "story",
        elements: [
          { type: "text", id: newId(), x: 40, y: 60, w: 720, h: 200, content: "Your text" },
        ],
        actions: [],
      };
    }
    case "end": {
      return {
        id: cardId,
        kind: "end",
        elements: [
          { type: "field", id: newId(), x: 40, y: 250, w: 720, h: 80, variable: "score" },
        ],
        actions: [],
      };
    }
  }
}

/**
 * Insert a new valid seed card of `kind` at `index` (clamped to the card range).
 * Rejects adding a second end card (invariant 3).
 */
export function addCard(
  stack: Stack,
  kind: Card["kind"],
  index: number
): Stack | Rejected {
  if (kind === "end" && stack.cards.some((c) => c.kind === "end")) {
    return reject("A set of cards can only have one last card.");
  }
  const card = seedCard(kind);
  const at = clamp(index, 0, stack.cards.length);
  const cards = [...stack.cards.slice(0, at), card, ...stack.cards.slice(at)];
  return { ...stack, cards };
}

/** Strip every goto action that targets `removedId` from an action list. */
function stripGotosTo(actions: Action[], removedId: string): Action[] {
  return actions.filter((a) => !(a.type === "goto" && a.cardId === removedId));
}

/**
 * Remove a card. Clears every button-level and card-level goto that targeted
 * it so no goto dangles (invariant 2). Rejects removing the only end card or
 * the only non-end card (invariants 3 and 7).
 */
export function removeCard(stack: Stack, cardId: string): Stack | Rejected {
  const target = stack.cards.find((c) => c.id === cardId);
  if (target === undefined) return reject("That card isn't here any more.");

  if (target.kind === "end") {
    return reject("A set of cards needs a last card, so this one can't go.");
  }
  const nonEndCount = stack.cards.filter((c) => c.kind !== "end").length;
  if (nonEndCount <= 1) {
    return reject("You need at least one card before the last one.");
  }

  const remaining = stack.cards
    .filter((c) => c.id !== cardId)
    .map((c) => ({
      ...c,
      actions: stripGotosTo(c.actions, cardId),
      elements: c.elements.map((el) =>
        el.type === "button"
          ? { ...el, actions: stripGotosTo(el.actions, cardId) }
          : el
      ),
    }));

  return { ...stack, cards: remaining };
}

/**
 * Move the card at `from` to `to`. Ids never change, so goto targets by id
 * keep resolving (invariant 2 preserved automatically). Out-of-range indices
 * are clamped.
 */
export function reorderCards(
  stack: Stack,
  from: number,
  to: number
): Stack | Rejected {
  const n = stack.cards.length;
  const fromIdx = clamp(from, 0, n - 1);
  const toIdx = clamp(to, 0, n - 1);
  if (fromIdx === toIdx) return { ...stack, cards: [...stack.cards] };
  const cards = [...stack.cards];
  const [moved] = cards.splice(fromIdx, 1);
  cards.splice(toIdx, 0, moved!);
  return { ...stack, cards };
}

// ---------------------------------------------------------------------------
// TASK-09 — changeKind

/** True if a card already has a valid quiz answer set (invariant 4). */
function hasValidQuizAnswers(card: Card): boolean {
  const answers = card.elements.filter(
    (el): el is ButtonElement => el.type === "button" && isAnswerButton(el)
  );
  const correct = answers.filter((b) =>
    b.actions.some((a) => a.type === "score" && a.delta === 1)
  );
  return correct.length === 1 && answers.length - correct.length >= 1;
}

/** Append a seeded correct + wrong answer pair to a card's elements. */
function withSeededAnswers(card: Card): Card {
  return {
    ...card,
    elements: [
      ...card.elements,
      {
        type: "button",
        id: newId(),
        x: 40, y: 360, w: 340, h: 80,
        label: "Right answer",
        actions: [
          { type: "score", delta: 1 },
          { type: "sound", sound: "cheer" },
        ],
      },
      {
        type: "button",
        id: newId(),
        x: 420, y: 360, w: 340, h: 80,
        label: "Wrong answer",
        actions: [
          { type: "score", delta: 0 },
          { type: "sound", sound: "buzz" },
        ],
      },
    ],
  };
}

/**
 * Change a card's kind. Seeds quiz answers when becoming a quiz so invariant 4
 * holds. Rejects creating a second end card or removing the only end card
 * (invariant 3).
 */
export function changeKind(
  stack: Stack,
  cardId: string,
  kind: Card["kind"]
): Stack | Rejected {
  const target = stack.cards.find((c) => c.id === cardId);
  if (target === undefined) return reject("That card isn't here any more.");
  if (target.kind === kind) return { ...stack, cards: [...stack.cards] };

  if (kind === "end" && stack.cards.some((c) => c.kind === "end")) {
    return reject("A set of cards can only have one last card.");
  }
  if (target.kind === "end" && kind !== "end") {
    const otherEnd = stack.cards.some((c) => c.id !== cardId && c.kind === "end");
    if (!otherEnd) {
      return reject("A set of cards needs a last card, so this one must stay the last card.");
    }
  }

  return mapCard(stack, cardId, (c) => {
    let updated: Card = { ...c, kind };
    if (kind === "quiz" && !hasValidQuizAnswers(updated)) {
      updated = withSeededAnswers(updated);
    }
    return updated;
  });
}

// ---------------------------------------------------------------------------
// TASK-10 — setGotoTarget, moveElement

/**
 * Point a button's `goto` at an existing card. Replaces any existing goto on
 * that button, keeping its other actions. Rejects an unknown target
 * (invariant 2).
 */
export function setGotoTarget(
  stack: Stack,
  buttonId: string,
  targetCardId: string
): Stack | Rejected {
  if (!stack.cards.some((c) => c.id === targetCardId)) {
    return reject("That card isn't here. Choose a card that exists.");
  }
  const card = cardOfElement(stack, buttonId);
  if (card === undefined) return reject("That button isn't here any more.");

  return mapCard(stack, card.id, (c) =>
    mapElements(c, (el) => {
      if (el.id !== buttonId || el.type !== "button") return el;
      const withoutGoto = el.actions.filter((a) => a.type !== "goto");
      return {
        ...el,
        actions: [...withoutGoto, { type: "goto", cardId: targetCardId }],
      };
    })
  );
}

/**
 * Move an element to (x, y), clamped so the element stays fully on the
 * 800 × 600 canvas: x ∈ [0, 800 - w], y ∈ [0, 600 - h] (invariant 5).
 */
export function moveElement(
  stack: Stack,
  elementId: string,
  x: number,
  y: number
): Stack | Rejected {
  const card = cardOfElement(stack, elementId);
  if (card === undefined) return reject("That item isn't here any more.");

  return mapCard(stack, card.id, (c) =>
    mapElements(c, (el) => {
      if (el.id !== elementId) return el;
      const clampedX = clamp(x, 0, 800 - el.w);
      const clampedY = clamp(y, 0, 600 - el.h);
      return { ...el, x: clampedX, y: clampedY };
    })
  );
}
