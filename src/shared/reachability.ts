// src/shared/reachability.ts
// A "before you share" check (J2 item 3): find cards the class can never reach,
// and quiz answers that dead-end (no way forward). The validator guarantees a
// stack is well-formed and every goto targets a real card, but it does NOT
// guarantee every card is reachable from card 1 or that a quiz answer leads
// anywhere — so a teacher can add a card after the end card, or a quiz answer
// with no goto, and only discover it mid-lesson. This surfaces both.
//
// Pure: reads the stack, returns a report.

import type { Stack, Card, Action } from "./types.js";

export interface ReachabilityReport {
  /** Card ids reachable from the first card by following any goto. */
  reachable: Set<string>;
  /** Cards that play can never reach (ids), in deck order. */
  unreachable: Card[];
  /** Quiz cards that have at least one answer with no goto (a dead end). */
  deadEndQuiz: Card[];
  /** True when nothing is wrong. */
  ok: boolean;
}

/** Every goto target id in an action list. */
function gotoTargets(actions: Action[]): string[] {
  const out: string[] = [];
  for (const a of actions) if (a.type === "goto") out.push(a.cardId);
  return out;
}

/** All cards a given card can lead to (card-level AND button-level gotos). */
function outgoing(card: Card): string[] {
  const out = [...gotoTargets(card.actions)];
  for (const el of card.elements) {
    if (el.type === "button") out.push(...gotoTargets(el.actions));
  }
  return out;
}

/** True if a quiz card has an answer button that goes nowhere (no goto). */
function hasDeadEndAnswer(card: Card): boolean {
  if (card.kind !== "quiz") return false;
  const answers = card.elements.filter(
    (el) => el.type === "button" && el.actions.some((a) => a.type === "score"),
  );
  return answers.some(
    (el) => el.type === "button" && !el.actions.some((a) => a.type === "goto"),
  );
}

/**
 * Walk the deck from card 1, following every goto, and report what can't be
 * reached and which quiz answers dead-end.
 */
export function checkReachability(stack: Stack): ReachabilityReport {
  const byId = new Map(stack.cards.map((c) => [c.id, c]));
  const reachable = new Set<string>();
  const first = stack.cards[0];

  if (first !== undefined) {
    const queue: string[] = [first.id];
    reachable.add(first.id);
    while (queue.length > 0) {
      const id = queue.shift()!;
      const card = byId.get(id);
      if (card === undefined) continue;
      for (const next of outgoing(card)) {
        if (!reachable.has(next) && byId.has(next)) {
          reachable.add(next);
          queue.push(next);
        }
      }
    }
  }

  const unreachable = stack.cards.filter((c) => !reachable.has(c.id));
  const deadEndQuiz = stack.cards.filter((c) => reachable.has(c.id) && hasDeadEndAnswer(c));

  return {
    reachable,
    unreachable,
    deadEndQuiz,
    ok: unreachable.length === 0 && deadEndQuiz.length === 0,
  };
}
