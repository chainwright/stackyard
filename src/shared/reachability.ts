// src/shared/reachability.ts
// A "before you share" check (J2 item 3): find cards the class can never reach,
// and buttons that dead-end (no way forward). The validator guarantees a stack
// is well-formed and every goto targets a real card, but it does NOT guarantee
// every card is reachable from card 1 or that a button leads anywhere — so a
// teacher can add a card after the end card, or a button with no goto, and only
// discover it mid-lesson. This surfaces all of it.
//
// Round 2 (TASK-26b/o) widened it: the first version only looked at quiz answers
// that carried a score, so it was silent about the two dead ends a real teacher
// hit — a flash card with no way forward, and a quiz button made with "Add
// Button" (no action at all).
//
// Pure: reads the stack, returns a report.

import type { Stack, Card, Action } from "./types.js";
import { buttonsWithoutGoto, cardHasForward } from "./flow.js";

export interface ReachabilityReport {
  /** Card ids reachable from the first card by following any goto. */
  reachable: Set<string>;
  /** Cards that play can never reach (ids), in deck order. */
  unreachable: Card[];
  /** Reachable quiz cards with at least one button (answer or plain) that goes nowhere. */
  deadEndQuiz: Card[];
  /** Reachable flash/story cards with at least one button that goes nowhere. */
  deadEndOther: Card[];
  /**
   * Reachable non-end cards with NO way forward at all (no button, no
   * auto-advance) — e.g. a flash card with nothing to press. Cards already in
   * one of the dead-end lists are not repeated here.
   */
  stuck: Card[];
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

/**
 * Walk the deck from card 1, following every goto, and report what can't be
 * reached, which buttons dead-end, and which cards have no way forward.
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
  const live = stack.cards.filter((c) => reachable.has(c.id) && c.kind !== "end");
  const deadEndQuiz = live.filter((c) => c.kind === "quiz" && buttonsWithoutGoto(c).length > 0);
  const deadEndOther = live.filter(
    (c) => c.kind !== "quiz" && buttonsWithoutGoto(c).length > 0,
  );
  const reported = new Set([...deadEndQuiz, ...deadEndOther].map((c) => c.id));
  const stuck = live.filter((c) => !reported.has(c.id) && !cardHasForward(c));

  return {
    reachable,
    unreachable,
    deadEndQuiz,
    deadEndOther,
    stuck,
    ok:
      unreachable.length === 0 &&
      deadEndQuiz.length === 0 &&
      deadEndOther.length === 0 &&
      stuck.length === 0,
  };
}

/** A short plain-language line for each kind of problem, for the share check. */
export function describeProblems(
  report: ReachabilityReport,
  label: (card: Card) => string,
): string[] {
  const lines: string[] = [];
  for (const c of report.unreachable) lines.push(`The class can't reach ${label(c)}.`);
  for (const c of report.deadEndQuiz) lines.push(`${label(c)} has an answer that goes nowhere.`);
  for (const c of report.deadEndOther) lines.push(`${label(c)} has a button that goes nowhere.`);
  for (const c of report.stuck) lines.push(`${label(c)} has no way to move on.`);
  return lines;
}
