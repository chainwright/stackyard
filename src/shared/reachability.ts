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
import { primaryText } from "./cardTitle.js";

/**
 * Every default word the editor's operations put on a card (src/editor/
 * operations.ts imports THESE for its seeds and defaults, so this list cannot
 * drift from them — TASK-28m: "Another answer" slipped through a hand list).
 */
export const PLACEHOLDER_WORDS = {
  question: "Your question?",
  rightAnswer: "Right answer",
  wrongAnswer: "Wrong answer",
  anotherAnswer: "Another answer",
  term: "Term",
  explanation: "Explanation",
  story: "Your text",
  newText: "New text",
  newButton: "New button",
} as const;

const PLACEHOLDER_SET: ReadonlySet<string> = new Set(Object.values(PLACEHOLDER_WORDS));

/**
 * True when a card still holds any placeholder word it was created with — in a
 * text or on a button, on any kind of card. (The end card has no seed text to
 * leave behind.)
 */
export function isPlaceholderCard(card: Card): boolean {
  if (card.kind === "end") return false;
  if (primaryText(card) === PLACEHOLDER_WORDS.question) return true;
  return card.elements.some((e) =>
    e.type === "text"
      ? PLACEHOLDER_SET.has(e.content.trim())
      : e.type === "button"
        ? PLACEHOLDER_SET.has(e.label.trim())
        : false,
  );
}

/** Placeholder cards, in deck order. */
export function placeholderCards(stack: Stack): Card[] {
  return stack.cards.filter(isPlaceholderCard);
}

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
  /**
   * Reachable cards that can never get to the end card: a branch that loops
   * back on itself (card 3's only button goes to card 3). The class would play
   * forever. Cards already listed as dead ends or stuck are not repeated
   * (TASK-27 z3).
   */
  trapped: Card[];
  /**
   * Cards still holding the words "+ Add Card" gave them ("Your question?",
   * "Right answer", "Term", "Your text"…): started but never filled in. They
   * play, so the class would meet them (TASK-27f).
   */
  placeholders: Card[];
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

  // Reverse reachability: walk BACKWARDS from the end card(s) over every goto
  // (card-level auto-advance AND buttons). A live card that is not reached this
  // way can never finish.
  const canFinish = new Set<string>(stack.cards.filter((c) => c.kind === "end").map((c) => c.id));
  const incoming = new Map<string, string[]>();
  for (const c of stack.cards) {
    for (const to of outgoing(c)) {
      if (!byId.has(to)) continue;
      const list = incoming.get(to);
      if (list) list.push(c.id);
      else incoming.set(to, [c.id]);
    }
  }
  const back = [...canFinish];
  while (back.length > 0) {
    const id = back.pop()!;
    for (const from of incoming.get(id) ?? []) {
      if (!canFinish.has(from)) {
        canFinish.add(from);
        back.push(from);
      }
    }
  }
  const stuckIds = new Set(stuck.map((c) => c.id));
  const trapped = live.filter(
    (c) => !reported.has(c.id) && !stuckIds.has(c.id) && !canFinish.has(c.id),
  );

  const placeholders = placeholderCards(stack);

  return {
    reachable,
    unreachable,
    deadEndQuiz,
    deadEndOther,
    stuck,
    trapped,
    placeholders,
    ok:
      unreachable.length === 0 &&
      deadEndQuiz.length === 0 &&
      deadEndOther.length === 0 &&
      stuck.length === 0 &&
      trapped.length === 0 &&
      placeholders.length === 0,
  };
}

/** A short plain-language line for each kind of problem, for the share check. */
export function describeProblems(
  report: ReachabilityReport,
  label: (card: Card) => string,
): string[] {
  const lines: string[] = [];
  // A card name may already end in "." / "?" / "…": end the sentence once, never "..".
  const finish = (s: string): string => (/[.!?…]$/.test(s) ? s : s + ".");
  const mid = (s: string): string => s.replace(/\.+$/, (m) => (m.length > 1 ? "." : m));
  for (const c of report.unreachable) lines.push(finish(`The class can't reach ${mid(label(c))}`));
  for (const c of report.deadEndQuiz) lines.push(`${mid(label(c))} has an answer that goes nowhere.`);
  for (const c of report.deadEndOther) lines.push(`${mid(label(c))} has a button that goes nowhere.`);
  for (const c of report.stuck) lines.push(`${mid(label(c))} has no way to move on.`);
  for (const c of report.trapped) lines.push(`${mid(label(c))} loops back on itself and never reaches the last card.`);
  for (const c of report.placeholders) lines.push(`${mid(label(c))} still has the words it started with — fill it in or remove it.`);
  return lines;
}

/**
 * The first card (in deck order) that has anything wrong with it, for "Take me to
 * the card". Unreachable cards count too.
 */
export function firstProblemCard(report: ReachabilityReport, stack: Stack): Card | undefined {
  const bad = new Set<string>(
    [
      ...report.unreachable,
      ...report.deadEndQuiz,
      ...report.deadEndOther,
      ...report.stuck,
      ...report.trapped,
      ...report.placeholders,
    ].map((c) => c.id),
  );
  return stack.cards.find((c) => bad.has(c.id));
}
