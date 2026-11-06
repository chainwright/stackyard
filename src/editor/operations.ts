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
import { linkQuizAnswersForward } from "../shared/linkForward.js";
import { ensureForwardLinks, gotoOf, nextCardAfter } from "../shared/flow.js";
import { FLASH_TERM, FLASH_BACK, QUIZ_QUESTION, QUIZ_TILES, MAX_QUIZ_ANSWERS } from "../shared/layout.js";

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
      // A quiz seed must satisfy invariant 4: exactly one correct answer. The
      // question starts at y:104 so it clears the "Card N of M" meta line at
      // y:48 (J2: the counter overlapped the question on new cards).
      return {
        id: cardId,
        kind: "quiz",
        elements: [
          {
            type: "text",
            id: newId(),
            ...QUIZ_QUESTION,
            content: "Your question?",
          },
          {
            type: "button",
            id: newId(),
            ...QUIZ_TILES[0]!,
            label: "Right answer",
            actions: [
              { type: "score", delta: 1 },
              { type: "sound", sound: "cheer" },
            ],
          },
          {
            type: "button",
            id: newId(),
            ...QUIZ_TILES[1]!,
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
          { type: "text", id: newId(), x: 48, y: 104, w: 704, h: 160, content: "Term" },
          { type: "text", id: newId(), x: 48, y: 300, w: 704, h: 160, content: "Explanation" },
        ],
        actions: [],
      };
    }
    case "story": {
      return {
        id: cardId,
        kind: "story",
        elements: [
          { type: "text", id: newId(), x: 48, y: 104, w: 704, h: 200, content: "Your text" },
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

/** The id a freshly-inserted card is given, so callers can select it. */
let lastInsertedCardId: string | null = null;
export function takeLastInsertedCardId(): string | null {
  const id = lastInsertedCardId;
  lastInsertedCardId = null;
  return id;
}

/**
 * Insert a new quiz card immediately AFTER `afterCardId` (never after the end
 * card), and re-link every quiz card's answers so play reaches the new card
 * (J2 #1 / J3 D6: Add Card used to append after "Well done!", unreachable). The
 * new card's own answers advance to the next card too, so there is no dead end.
 * The inserted card's id is recorded so the caller can select it.
 */
export function addCardAfter(
  stack: Stack,
  afterCardId: string,
  kind: Card["kind"] = "quiz",
): Stack | Rejected {
  if (kind === "end") {
    return reject("A set of cards can only have one last card.");
  }
  const endIndex = stack.cards.findIndex((c) => c.kind === "end");
  const afterIndex = stack.cards.findIndex((c) => c.id === afterCardId);

  // Insert right after the current card, but always BEFORE the end card so the
  // new card is part of the playable sequence.
  let at = afterIndex >= 0 ? afterIndex + 1 : stack.cards.length;
  if (endIndex >= 0 && at > endIndex) at = endIndex;

  const card = seedCard(kind);
  lastInsertedCardId = card.id;
  const cards = [...stack.cards.slice(0, at), card, ...stack.cards.slice(at)];
  const inserted: Stack = { ...stack, cards };

  // Re-link quiz answers forward so the new card (and the card before it) lead
  // into the flow — no card is stranded after the end card, and no quiz answer
  // dead-ends (J2's "max score can never be reached" bug). Then make sure the
  // seeded card itself has a way forward (a new flash card gets "Next Card", a
  // new story card gets "Continue" — TASK-26b/o).
  return ensureForwardLinks(linkQuizAnswersForward(inserted));
}

/**
 * Repair the flow so every card is reachable and no quiz answer dead-ends
 * (the one-click fix behind the "before you share" check — J2 item 3):
 *   1. move any content card that sits AFTER the end card to just before it, in
 *      order, so it is part of the playable sequence; then
 *   2. re-link every quiz answer forward (so a quiz answer always advances and
 *      the newly-placed cards are linked into the run).
 * Only reorders and retargets existing cards, so every invariant is preserved.
 */
export function repairFlow(stack: Stack): Stack | Rejected {
  const endIndex = stack.cards.findIndex((c) => c.kind === "end");
  if (endIndex < 0) return reject("A set of cards needs a last card first.");

  const before = stack.cards.slice(0, endIndex);
  const end = stack.cards[endIndex]!;
  const after = stack.cards.slice(endIndex + 1);

  // Keep the end card last; everything else stays in its current relative order.
  const reordered: Card[] = [...before, ...after, end];
  // Link quiz answers forward, then give every other button that goes nowhere —
  // and every flash/story card with nothing to press — a way on (TASK-26b/o).
  return ensureForwardLinks(linkQuizAnswersForward({ ...stack, cards: reordered }));
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

/** True if two axis-aligned boxes overlap (with a small gap tolerance). */
function boxesOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  gap = 0,
): boolean {
  return (
    a.x < b.x + b.w + gap &&
    a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap &&
    a.y + a.h + gap > b.y
  );
}

/**
 * Move an element to (x, y), clamped so the element stays fully on the
 * 800 × 600 canvas: x ∈ [0, 800 - w], y ∈ [0, 600 - h] (invariant 5). A move
 * that would drop the element ON TOP of another element on the same card is
 * REJECTED (the element stays where it was), so a teacher can't stack one
 * answer over another (J3 D7). Dragging simply stops at the obstacle's edge.
 */
export function moveElement(
  stack: Stack,
  elementId: string,
  x: number,
  y: number
): Stack | Rejected {
  const card = cardOfElement(stack, elementId);
  if (card === undefined) return reject("That item isn't here any more.");

  const moving = card.elements.find((el) => el.id === elementId);
  if (moving === undefined) return reject("That item isn't here any more.");

  const clampedX = clamp(x, 0, 800 - moving.w);
  const clampedY = clamp(y, 0, 600 - moving.h);
  const proposed = { x: clampedX, y: clampedY, w: moving.w, h: moving.h };

  // Block dropping one BUTTON on top of another button (e.g. an answer tile
  // over another answer tile — J3 D7). We only guard button-over-button so the
  // check never fights a large question-text box the tiles sit beneath.
  if (moving.type === "button") {
    const collides = card.elements.some(
      (el) => el.id !== elementId && el.type === "button" && boxesOverlap(proposed, el),
    );
    if (collides) {
      // Keep the element where it is rather than stacking it on another tile.
      return reject("Answers can't sit on top of each other. Drop it in a clear spot.");
    }
  }

  return mapCard(stack, card.id, (c) =>
    mapElements(c, (el) =>
      el.id === elementId ? { ...el, x: clampedX, y: clampedY } : el,
    )
  );
}

// ---------------------------------------------------------------------------
// TASK-21 — addTextElement, addButtonElement, addPictureElement,
//           linkButtonToCard
//
// The four toolbar tools (Add Text, Add Button, Add Picture, Link a Card).
// Each is a pure operation through the same chokepoint as the other nine, so
// the stack stays valid by construction (REQ-MKR-09).

/**
 * Maximum size, in bytes, of a picture a teacher may drop onto a card. A
 * picture is inlined as a data URI and travels inside the one exported file,
 * so an over-large image would bloat that file and slow an old laptop. 2 MB of
 * raw image data (~2.7 MB base64) is generous for a classroom illustration and
 * well under the 8 MB export-body limit (tech.md).
 */
export const MAX_PICTURE_BYTES = 2 * 1024 * 1024;

/** Default sizes for a freshly added element (position is computed per card). */
const NEW_TEXT_SIZE = { w: 704, h: 64 } as const;
const NEW_BUTTON_SIZE = { w: 344, h: 80 } as const;
const NEW_IMAGE_BOX = { x: 240, y: 160, w: 320, h: 240 } as const;

/**
 * Find a free y for a new element of height `h` on `card`: the first 32px rule
 * band below the lowest existing element, so a new element lands in empty
 * space (never on top of the question, built-app review P1). Returns `null`
 * when there is no room left on the 600px canvas below the lowest element — so
 * the caller can say "this card is full" rather than dropping the new element
 * on top of an existing one (built-app review round 2, P2 #7).
 */
function freeY(card: Card, h: number): number | null {
  const lowest = card.elements.reduce((max, el) => Math.max(max, el.y + el.h), 40);
  // Snap to the next 32px rule band, with a little breathing room.
  const y = Math.ceil((lowest + 16) / 32) * 32;
  if (y + h > 600) return null; // no free band below the lowest element
  return clamp(y, 40, 600 - h);
}

/** The plain-language message when a card has no room for a new element. */
const CARD_FULL_MESSAGE =
  "This card is full. Make room, or add a new card for more.";

/** Append an element to a card's element list, returning a new stack. */
function addElementToCard(
  stack: Stack,
  cardId: string,
  el: Element
): Stack {
  return mapCard(stack, cardId, (c) => ({
    ...c,
    elements: [...c.elements, el],
  }));
}

/**
 * Add a text element to a card. The element starts with a short placeholder so
 * the teacher sees something to edit, placed in a default on-canvas box so
 * invariant 5 (canvas bounds) always holds.
 */
export function addTextElement(
  stack: Stack,
  cardId: string,
  content = "New text"
): Stack | Rejected {
  const card = stack.cards.find((c) => c.id === cardId);
  if (card === undefined) return reject("That card isn't here any more.");
  const y = freeY(card, NEW_TEXT_SIZE.h);
  if (y === null) return reject(CARD_FULL_MESSAGE);
  const el: Element = {
    type: "text",
    id: newId(),
    x: 48,
    y,
    ...NEW_TEXT_SIZE,
    content,
  };
  return addElementToCard(stack, cardId, el);
}

/**
 * Add a button element to a card with a default label and no actions yet. A
 * plain button carries no `score` action, so it is not an answer tile and
 * cannot disturb a quiz card's one-correct-answer invariant (invariant 4). The
 * teacher wires it up afterwards with "Link a Card".
 */
export function addButtonElement(
  stack: Stack,
  cardId: string,
  label = "New button"
): Stack | Rejected {
  const card = stack.cards.find((c) => c.id === cardId);
  if (card === undefined) return reject("That card isn't here any more.");
  if (label.trim().length === 0) {
    return reject("A button needs some words on it. Type a label.");
  }
  const y = freeY(card, NEW_BUTTON_SIZE.h);
  if (y === null) return reject(CARD_FULL_MESSAGE);
  const el: Element = {
    type: "button",
    id: newId(),
    x: 48,
    y,
    ...NEW_BUTTON_SIZE,
    label,
    actions: [],
  };
  return addElementToCard(stack, cardId, el);
}

/**
 * Add a picture to a card from a local file already read as a data URI. The
 * picture travels inside the one exported file, so:
 *   - `src` must be a `data:` URI (never a remote URL — the file stays
 *     self-contained and offline, tech.md),
 *   - `alt` must be non-empty (every image needs alt text, design-system.md
 *     accessibility), and
 *   - the data must be within MAX_PICTURE_BYTES so the exported file stays
 *     small.
 * Any of these fails with a plain-language rejection and changes nothing.
 */
export function addPictureElement(
  stack: Stack,
  cardId: string,
  dataUri: string,
  alt: string
): Stack | Rejected {
  const card = stack.cards.find((c) => c.id === cardId);
  if (card === undefined) return reject("That card isn't here any more.");
  if (!dataUri.startsWith("data:")) {
    return reject("That picture couldn't be read. Choose a picture file from this computer.");
  }
  if (alt.trim().length === 0) {
    return reject("Describe the picture in a few words so every pupil knows what it shows.");
  }
  if (dataUriByteLength(dataUri) > MAX_PICTURE_BYTES) {
    return reject("That picture is too big. Choose a smaller one, under two megabytes.");
  }
  const el: Element = {
    type: "image",
    id: newId(),
    ...NEW_IMAGE_BOX,
    src: dataUri,
    alt,
  };
  return addElementToCard(stack, cardId, el);
}

/**
 * Point a button (the selected element) at a card — the toolbar "Link a Card"
 * tool. It reuses setGotoTarget's guarantees (target must exist, invariant 2),
 * but first checks the element really is a button so the teacher gets a clear
 * message when nothing linkable is selected.
 */
export function linkButtonToCard(
  stack: Stack,
  buttonId: string,
  targetCardId: string
): Stack | Rejected {
  const card = cardOfElement(stack, buttonId);
  const el = card?.elements.find((e) => e.id === buttonId);
  if (el === undefined || el.type !== "button") {
    return reject("Pick a button first, then choose the card it goes to.");
  }
  return setGotoTarget(stack, buttonId, targetCardId);
}

/**
 * Byte length of the decoded payload of a `data:` URI. For a base64 payload we
 * compute the decoded size from the base64 length (minus padding); for a
 * non-base64 (percent-encoded or plain) payload we measure the UTF-8 bytes of
 * the payload itself.
 */
function dataUriByteLength(dataUri: string): number {
  const comma = dataUri.indexOf(",");
  if (comma < 0) return 0;
  const meta = dataUri.slice(0, comma);
  const payload = dataUri.slice(comma + 1);
  if (/;base64/i.test(meta)) {
    const clean = payload.replace(/[^A-Za-z0-9+/=]/g, "");
    const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
    return Math.floor((clean.length * 3) / 4) - padding;
  }
  // Percent-decoded / plain text payload: measure its UTF-8 byte length.
  try {
    return new TextEncoder().encode(decodeURIComponent(payload)).length;
  } catch {
    return new TextEncoder().encode(payload).length;
  }
}

// ---------------------------------------------------------------------------
// TASK-26o — setFlashSide, addAnswer

/**
 * Set the FRONT (the term) or the BACK (the explanation) of a flash card.
 *
 * The inspector used to do `if (back) editText(...)`, so text typed into the
 * Back box was silently thrown away whenever the card had no second text element
 * yet — which is exactly what every AI-made flash card looked like (J2 step 9).
 * This creates the missing element instead. A flash card's texts are positional:
 * the FIRST text is the front, the SECOND is the back.
 */
export function setFlashSide(
  stack: Stack,
  cardId: string,
  side: "front" | "back",
  content: string,
): Stack | Rejected {
  const card = stack.cards.find((c) => c.id === cardId);
  if (card === undefined) return reject("That card isn't here any more.");
  if (card.kind !== "flash") return reject("Only a flash card has a front and a back.");

  const makeText = (r: { x: number; y: number; w: number; h: number }, text: string): Element => ({
    type: "text",
    id: newId(),
    x: r.x, y: r.y, w: r.w, h: r.h,
    content: text,
  });

  const textIdx = card.elements
    .map((e, i) => (e.type === "text" ? i : -1))
    .filter((i) => i >= 0);

  let elements = card.elements.slice();
  const wanted = side === "front" ? 0 : 1;

  if (textIdx[wanted] !== undefined) {
    elements = elements.map((el, i) =>
      i === textIdx[wanted] && el.type === "text" ? { ...el, content } : el,
    );
  } else if (side === "front") {
    // No text at all yet: the front goes first.
    elements = [makeText(FLASH_TERM, content), ...elements];
  } else {
    // Need a back. Make sure a front exists first, then add the back right
    // after it so the positional "second text" rule holds.
    if (textIdx[0] === undefined) {
      elements = [makeText(FLASH_TERM, ""), ...elements];
      elements.splice(1, 0, makeText(FLASH_BACK, content));
    } else {
      elements.splice(textIdx[0] + 1, 0, makeText(FLASH_BACK, content));
    }
  }
  return mapCard(stack, cardId, (c) => ({ ...c, elements }));
}

/** The plain-language message when a question already has four answers. */
const ANSWERS_FULL_MESSAGE = "A question can have up to four answers.";

/**
 * "+ Add an answer" on a quiz card (J2 step 7): a REAL answer — a coloured tile
 * in the next free slot, wrong by default (the teacher ticks "Right answer" to
 * change that), that goes on to the same card the other answers go to. The old
 * route was "Add Button", which made a plain outlined button with no action; a
 * pupil who tapped it froze the card.
 */
export function addAnswer(
  stack: Stack,
  cardId: string,
  label = "Another answer",
): Stack | Rejected {
  const card = stack.cards.find((c) => c.id === cardId);
  if (card === undefined) return reject("That card isn't here any more.");
  if (card.kind !== "quiz") return reject("Answers belong on a question card.");

  const answers = card.elements.filter(
    (el): el is ButtonElement => el.type === "button" && isAnswerButton(el),
  );
  if (answers.length >= MAX_QUIZ_ANSWERS) return reject(ANSWERS_FULL_MESSAGE);

  const allButtons = card.elements.filter((el) => el.type === "button");
  const slot = QUIZ_TILES.find((t) => !allButtons.some((b) => boxesOverlap(t, b)));
  if (slot === undefined) return reject(ANSWERS_FULL_MESSAGE);

  // Where the siblings go: their first goto, else the next card in deck order.
  const index = stack.cards.findIndex((c) => c.id === cardId);
  const siblingTarget = answers.map((a) => gotoOf(a.actions)).find((t) => t !== null) ?? null;
  const target = siblingTarget ?? nextCardAfter(stack, index)?.id ?? null;

  const actions: Action[] = [
    { type: "score", delta: 0 },
    { type: "sound", sound: "buzz" },
    ...(target !== null ? [{ type: "goto", cardId: target } as Action] : []),
  ];
  const el: Element = {
    type: "button",
    id: newId(),
    x: slot.x, y: slot.y, w: slot.w, h: slot.h,
    label,
    actions,
  };
  return addElementToCard(stack, cardId, el);
}
