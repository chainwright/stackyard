// src/shared/linkForward.ts
// linkQuizAnswersForward(stack): rewrite every quiz card's answer buttons so
// they advance to the NEXT card in the deck, not the end card.
//
// Why this exists
// ---------------
// A quiz is a sequence the class works through. If every answer jumps straight
// to the end card, the first click ends the game and the score is always 0 or 1
// — exactly the "Score 0 of 6" bug the built-app review hit. The fix is a single
// rule applied everywhere a stack is built (the demo stack, the LLM generator's
// output, and the offline fallback): a quiz answer goes to the card that follows
// it in play order, and only the LAST quiz before the end card targets the end.
//
// Scope
// -----
//   - Only buttons that carry a `score` action are treated as quiz answers. A
//     plain button (no score) keeps its own `goto` — e.g. a story branch, a
//     "Start" button, or a "Play again" button on the end card.
//   - Only the button's `goto` action is rewritten; its score/sound/set actions
//     are untouched, and a button with no `goto` gains one.
//   - Non-quiz cards (flash, story, end) are left exactly as they are.
//   - "Next card" = the first card AFTER this one in `stack.cards` order. If a
//     quiz is the last card before the end (or the last card outright), its
//     answers target the end card, so the run still reaches the score screen.
//
// Pure: returns a new stack; never mutates the input. The result preserves every
// stack-format invariant the input satisfied (ids, bounds and the quiz
// one-correct-answer rule are unchanged; every rewritten goto targets a card
// that exists, so invariant 2 holds).

import type { Stack, Card, Action, ButtonElement } from "./types.js";

/** True if a button is a quiz answer (it carries a score action). */
function isAnswerButton(btn: ButtonElement): boolean {
  return btn.actions.some((a) => a.type === "score");
}

/** Replace (or add) a button's single goto action, keeping the rest in order. */
function withGoto(actions: Action[], targetCardId: string): Action[] {
  let replaced = false;
  const next = actions.map((a) => {
    if (a.type === "goto") {
      replaced = true;
      return { type: "goto", cardId: targetCardId } as Action;
    }
    return a;
  });
  if (!replaced) next.push({ type: "goto", cardId: targetCardId });
  return next;
}

/**
 * Return a copy of `stack` in which every quiz answer advances to the next
 * card in play order (the last quiz before the end targets the end card).
 * Non-quiz cards and non-answer buttons are unchanged.
 */
export function linkQuizAnswersForward(stack: Stack): Stack {
  const cards = stack.cards;
  const endCard = cards.find((c) => c.kind === "end");

  const rewritten: Card[] = cards.map((card, index) => {
    if (card.kind !== "quiz") return card;

    // The next card after this one in deck order; fall back to the end card
    // when this quiz is the last card (so the run still reaches the score).
    const nextCard = cards[index + 1] ?? endCard;
    if (nextCard === undefined) return card; // no target available (shouldn't happen)
    const targetId = nextCard.id;

    const elements = card.elements.map((el) => {
      if (el.type !== "button" || !isAnswerButton(el)) return el;
      return { ...el, actions: withGoto(el.actions, targetId) };
    });

    return { ...card, elements };
  });

  return { ...stack, cards: rewritten };
}
