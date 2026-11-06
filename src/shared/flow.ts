// src/shared/flow.ts
// "Every card can move forward" (TASK-26b). The validator guarantees a stack is
// well-formed and every goto lands on a real card; it does NOT guarantee that a
// pupil can get OFF a card. Round 2 found three ways to be stuck:
//   - a generated flash card with one text and a Next button that only showed on
//     the (non-existent) back,
//   - a flash card the teacher added, which had no button at all,
//   - a quiz button made with "Add Button", which had no action.
//
// This module is the one definition of "has a way forward", shared by:
//   - the player (draws a Next Card when a card has none),
//   - the generator's normaliser and the editor's repair (link it in),
//   - the "before you share" check (reachability.ts).
//
// Pure: reads cards, returns data or new stacks. Guarded by
// tests/flow.property.test.ts (run by the invariants-on-save hook).

import type { Stack, Card, Action, ButtonElement, Element } from "./types.js";
import { FLASH_NEXT, STORY_CONTINUE } from "./layout.js";

/** The first goto target in an action list, or null. */
export function gotoOf(actions: Action[]): string | null {
  for (const a of actions) if (a.type === "goto") return a.cardId;
  return null;
}

/** Buttons on a card. */
export function buttonsOf(card: Card): ButtonElement[] {
  return card.elements.filter((e): e is ButtonElement => e.type === "button");
}

/** Buttons on a card that go nowhere (no goto). */
export function buttonsWithoutGoto(card: Card): ButtonElement[] {
  return buttonsOf(card).filter((b) => gotoOf(b.actions) === null);
}

/**
 * True when a pupil can move off this card: a card-level goto (auto-advance) or
 * at least one button that has a goto. The end card never needs one.
 */
export function cardHasForward(card: Card): boolean {
  if (card.kind === "end") return true;
  if (gotoOf(card.actions) !== null) return true;
  return buttonsOf(card).some((b) => gotoOf(b.actions) !== null);
}

/** The card after `index` in deck order, or the end card, or undefined. */
export function nextCardAfter(stack: Stack, index: number): Card | undefined {
  const next = stack.cards[index + 1];
  if (next !== undefined) return next;
  return stack.cards.find((c) => c.kind === "end" && c !== stack.cards[index]);
}

/** Add a goto to an action list unless it already has one. */
function withGoto(actions: Action[], target: string): Action[] {
  return gotoOf(actions) !== null ? actions : [...actions, { type: "goto", cardId: target }];
}

function newId(): string {
  return crypto.randomUUID();
}

/**
 * Link every non-end card forward:
 *   - each button with no goto gains a goto to the next card in deck order,
 *   - a flash card with no button gains a "Next Card" button,
 *   - a story card with no button (and no card-level goto) gains "Continue".
 * Buttons that already have a goto are left alone (a story branch keeps its
 * branch). Only adds actions/elements and retargets nothing, so every invariant
 * the input satisfied still holds (ids stay unique and v4, new gotos target real
 * cards, new elements sit inside the canvas, the quiz answer rule is untouched).
 */
export function ensureForwardLinks(stack: Stack): Stack {
  const cards = stack.cards.map((card, index): Card => {
    if (card.kind === "end") return card;
    const target = nextCardAfter(stack, index);
    if (target === undefined || target.id === card.id) return card;

    let elements: Element[] = card.elements.map((el) =>
      el.type === "button" && gotoOf(el.actions) === null
        ? { ...el, actions: withGoto(el.actions, target.id) }
        : el,
    );

    const hasButton = elements.some((e) => e.type === "button");
    const autoAdvance = gotoOf(card.actions) !== null;
    if (!hasButton && !autoAdvance) {
      if (card.kind === "flash") {
        elements = [...elements, makeButton("Next Card", FLASH_NEXT, target.id)];
      } else if (card.kind === "story") {
        elements = [...elements, makeButton("Continue", STORY_CONTINUE, target.id)];
      }
    }
    return elements === card.elements ? card : { ...card, elements };
  });
  return { ...stack, cards };
}

function makeButton(
  label: string,
  r: { x: number; y: number; w: number; h: number },
  target: string,
): ButtonElement {
  return {
    type: "button",
    id: newId(),
    x: r.x, y: r.y, w: r.w, h: r.h,
    label,
    actions: [{ type: "goto", cardId: target }],
  };
}

/**
 * The player's guaranteed forward step from card `index`: the first goto the
 * card offers, else the next card in deck order (what the player's safety-net
 * "Next Card" does). Used by the play-through property test to prove a deck can
 * always be walked to its end.
 */
export function forwardStep(stack: Stack, index: number): string | null {
  const card = stack.cards[index];
  if (card === undefined || card.kind === "end") return null;
  const own = gotoOf(card.actions);
  if (own !== null) return own;
  for (const b of buttonsOf(card)) {
    const t = gotoOf(b.actions);
    if (t !== null) return t;
  }
  return nextCardAfter(stack, index)?.id ?? null;
}
