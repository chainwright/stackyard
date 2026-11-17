// server/deckQuality.ts
// Stack-level quality passes on a generated deck (TASK-32b), run by
// finaliseGeneratedStackDetailed after the per-card layout and BEFORE the quiz
// answers are linked forward:
//   removeRepeatedCards     (b2) a card whose kind and front repeat an earlier one
//   trimToRequestedCounts   (b3) more quiz / flash cards than the sentence asked for
//   dropGiveawayPictograms  (b4) a picture that names the right answer
// The card passes remove, never rewrite wording. A removed card's incoming gotos are
// pointed where it led (or at its earlier twin), and a removal that would strand
// a card the class could reach before is not made. So every pass keeps the stack
// valid and keeps every other reachable card reachable.
//
// TASK-42b adds two ANSWER passes, run after the card passes: swapFlaggedJokeAnswers
// (b1) and swapRepeatedAnswers (b3). They change one wrong answer's label at a
// time, through the teacher's own Swap rule and swap operation, and never a right
// answer, an action or a card.

import type { Action, ButtonElement, Card, Element, Stack } from "../src/shared/types.js";
import { validate } from "../src/shared/validator.js";
import { outTargets, reachableIds, nextCardAfter } from "../src/shared/flow.js";
import { checkReachability } from "../src/shared/reachability.js";
import { frontKey, foldedWords, rightAnswer, answerKey, isWordAnswer, jokeAnswerReason, quizAnswers } from "../src/shared/lessonCheck.js";
import { primaryText } from "../src/shared/cardTitle.js";
import { pictogramNameOfSrc, isPictogramCredit } from "../src/shared/pictograms.js";
import type { RequestedCounts } from "../src/shared/requestedCounts.js";
import { QUIZ_TILES } from "../src/shared/layout.js";
// TASK-42b1: the teacher's own Swap rule and swap operation. Both are pure
// (they depend only on src/shared); see the TASK-42b1 note in the maker spec
// for why they stay in src/editor.
import { swapCandidates, answerForm } from "../src/editor/swapCandidates.js";
import { swapWrongAnswer } from "../src/editor/operations.js";
import { isRejected } from "../src/editor/types.js";

/** Point every goto in `actions` that targets `from` at `to` (or drop it when `to` is null). */
function retarget(actions: Action[], from: string, to: string | null): Action[] {
  const out: Action[] = [];
  for (const a of actions) {
    if (a.type === "goto" && a.cardId === from) {
      if (to !== null) out.push({ ...a, cardId: to });
    } else out.push(a);
  }
  return out;
}

/**
 * Remove card `id`, pointing every goto that led to it where it led (its single
 * target), else at `twin`, else at the next card in deck order. A card is never
 * pointed at itself: that goto is dropped (the forward-linking pass gives the
 * button a way on). Returns null when the removal would make the stack invalid or
 * strand a card that was reachable before.
 */
export function removeCardRelinked(stack: Stack, id: string, twin?: string): Stack | null {
  const ix = stack.cards.findIndex((c) => c.id === id);
  const dropped = stack.cards[ix];
  if (dropped === undefined || dropped.kind === "end") return null;
  const targets = outTargets(dropped).filter((t) => t !== id);
  // Where it led: its single target; a card that led nowhere hands on to the next
  // card in deck order (pointing back at an EARLIER twin would loop the class back).
  // A fork (two or more targets) hands on to its twin, which has the same choices.
  const led =
    targets.length === 1
      ? targets[0]!
      : targets.length === 0
        ? nextCardAfter(stack, ix)?.id ?? twin ?? null
        : twin ?? targets[0]!;

  const before = reachableIds(stack);
  const cards: Card[] = stack.cards
    .filter((c) => c.id !== id)
    .map((c) => {
      const to = led === c.id ? (twin !== undefined && twin !== c.id ? twin : null) : led;
      return {
        ...c,
        actions: retarget(c.actions, id, to),
        elements: c.elements.map((e): Element => (e.type === "button" ? { ...e, actions: retarget(e.actions, id, to) } : e)),
      };
    });
  const next: Stack = { ...stack, cards };
  if (!validate(next).valid) return null;
  const after = reachableIds(next);
  for (const r of before) if (r !== id && !after.has(r)) return null;
  // Never create a loop the class can't leave.
  if (checkReachability(next).trapped.length > checkReachability(stack).trapped.length) return null;
  return next;
}

/** b2: drop every non-end card whose kind and front repeat an earlier card's. */
export function removeRepeatedCards(stack: Stack): { stack: Stack; removed: number } {
  let current = stack;
  let removed = 0;
  // A repeat whose removal would strand a card (a repeated fork) is kept; the
  // share check flags it ("repeats card N").
  const skipped = new Set<string>();
  for (let guard = 0; guard < stack.cards.length; guard++) {
    const first = new Map<string, string>();
    let candidate: { id: string; twin: string } | null = null;
    for (const c of current.cards) {
      if (c.kind === "end" || primaryText(c).trim().length === 0) continue;
      const key = frontKey(c);
      const twin = first.get(key);
      if (twin === undefined) first.set(key, c.id);
      else if (candidate === null && !skipped.has(c.id)) candidate = { id: c.id, twin };
    }
    if (candidate === null) break;
    const next = removeCardRelinked(current, candidate.id, candidate.twin);
    if (next === null) skipped.add(candidate.id);
    else {
      current = next;
      removed++;
    }
  }
  return { stack: current, removed };
}

/** How many quiz and flash cards a deck has. */
export function countKinds(stack: Stack): { quiz: number; flash: number } {
  return {
    quiz: stack.cards.filter((c) => c.kind === "quiz").length,
    flash: stack.cards.filter((c) => c.kind === "flash").length,
  };
}

/**
 * TASK-42b4: the LAST quiz card (not in `blocked`) whose right answer, in words,
 * repeats an earlier quiz card's right answer ("Condensation" on card 3 and on
 * card 11). Number and yes / no / true / false answers never count.
 */
export function sameAnswerRepeat(stack: Stack, blocked: ReadonlySet<string> = new Set()): Card | undefined {
  const seen = new Set<string>();
  let last: Card | undefined;
  for (const c of stack.cards) {
    if (c.kind !== "quiz") continue;
    const right = rightAnswer(c);
    if (right === undefined || !isWordAnswer(right.label)) continue;
    const key = answerKey(right.label);
    if (seen.has(key)) {
      if (!blocked.has(c.id)) last = c;
    } else seen.add(key);
  }
  return last;
}

/** A right answer: a score action that adds to the score. */
const isRight = (b: ButtonElement): boolean => b.actions.some((a) => a.type === "score" && a.delta > 0);

/**
 * TASK-42b10: how many cards of the deck carry `key` (answerKey) right now: as
 * an answer on a quiz card, or as a flash card's term.
 */
function cardsCarrying(stack: Stack, key: string): number {
  return stack.cards.filter((c) => {
    if (c.kind === "quiz") return quizAnswers(c).some((b) => answerKey(b.label) === key);
    if (c.kind === "flash") {
      const t = c.elements.find((e) => e.type === "text");
      return t !== undefined && t.type === "text" && answerKey(t.content) === key;
    }
    return false;
  }).length;
}

/** TASK-42b10: a safe candidate is at most this many words, after folding. */
export const SAFE_SWAP_MAX_WORDS = 3;

/**
 * TASK-42b1/b3/b10: replace one wrong answer with the first SAFE candidate of
 * the teacher's own Swap rule, applied with the teacher's own swapWrongAnswer
 * (the label changes, the actions never do). Null when no candidate is safe.
 *
 * Safe (TASK-42b10, after the first version spread "It freezes into solid
 * rock" over three cards of a bench deck): the Swap rule's candidate, never
 * matching a right answer or another answer on the card by answerKey, never
 * inside one of them; at most three words; on at most one card of the deck
 * right now; and not already used by this pass in this deck (`used`).
 */
function swapToSafeCandidate(stack: Stack, cardId: string, elementId: string, used: Set<string>): Stack | null {
  const rightKeys = new Set(
    stack.cards.filter((c) => c.kind === "quiz").flatMap((c) => quizAnswers(c).filter(isRight).map((b) => answerKey(b.label))),
  );
  const card = stack.cards.find((c) => c.id === cardId);
  const others = new Set((card === undefined ? [] : quizAnswers(card)).filter((b) => b.id !== elementId).map((b) => answerKey(b.label)));
  const right = card === undefined ? undefined : rightAnswer(card);
  const form = right === undefined ? null : answerForm(right.label);
  for (const label of swapCandidates(stack, cardId, elementId)) {
    const key = answerKey(label);
    if (rightKeys.has(key) || others.has(key)) continue;
    // Nor one answer inside another ("Flat" beside "Flat like a plate").
    if ([...others].some((o) => ` ${o} `.includes(` ${key} `) || ` ${key} `.includes(` ${o} `))) continue;
    if (key.split(" ").length > SAFE_SWAP_MAX_WORDS) continue;
    if (cardsCarrying(stack, key) > 1 || used.has(key)) continue;
    // The same KIND of answer as the right one (a number, a verb phrase or a
    // noun phrase): "Cube" for "Square like a box" beside "Round like a ball",
    // never "A cold, damp day" for "What happens to water during evaporation?".
    if (form !== null && answerForm(label) !== form) continue;
    const next = swapWrongAnswer(stack, cardId, elementId, label);
    if (!isRejected(next) && validate(next).valid) {
      used.add(key);
      return next;
    }
  }
  return null;
}

/**
 * TASK-42b10/b11: remove one WRONG answer from a quiz card, when the card keeps its
 * right answer and at least two wrong answers. The answers that stay are laid
 * out again in tile order (QUIZ_TILES), as a card generated with that many
 * answers. Null when the removal is not allowed or would make the stack invalid.
 */
export function removeWrongAnswer(stack: Stack, cardId: string, elementId: string): Stack | null {
  const card = stack.cards.find((c) => c.id === cardId);
  if (card === undefined || card.kind !== "quiz") return null;
  const answers = quizAnswers(card);
  const target = answers.find((b) => b.id === elementId);
  if (target === undefined || isRight(target)) return null;
  const rest = answers.filter((b) => b.id !== elementId);
  // TASK-42b11: keep the right answer and at least TWO wrong ones, so the pass
  // never causes "has only two answers: add one." (a blocker in Before you share).
  if (!rest.some(isRight) || rest.filter((b) => !isRight(b)).length < 2) return null;
  let slot = 0;
  const elements: Element[] = [];
  for (const e of card.elements) {
    if (e.id === elementId) continue;
    if (e.type === "button" && rest.includes(e)) elements.push({ ...e, ...QUIZ_TILES[slot++]! });
    else elements.push(e);
  }
  const next: Stack = { ...stack, cards: stack.cards.map((c) => (c.id === cardId ? { ...c, elements } : c)) };
  if (!validate(next).valid) return null;
  // The removed answer's goto may have been the only way to a card: never strand one, never trap the class.
  const after = reachableIds(next);
  for (const r of reachableIds(stack)) if (!after.has(r)) return null;
  if (checkReachability(next).trapped.length > checkReachability(stack).trapped.length) return null;
  return next;
}

/** The current copy of a card's answer (ids never change during the passes). */
function answerOf(stack: Stack, cardId: string, elementId: string): { card: Card; answer: ButtonElement } | null {
  const card = stack.cards.find((c) => c.id === cardId);
  const answer = card === undefined ? undefined : quizAnswers(card).find((b) => b.id === elementId);
  return card === undefined || answer === undefined ? null : { card, answer };
}

/** What an answer pass did: answers swapped for a safe candidate, removed, or left. */
export interface AnswerPassResult {
  stack: Stack;
  swapped: number;
  removed: number;
  left: number;
}

/** TASK-42b10: a safe swap, else remove, else leave. */
function fixAnswer(stack: Stack, cardId: string, elementId: string, used: Set<string>): { stack: Stack; did: "swapped" | "removed" | "left" } {
  const swapped = swapToSafeCandidate(stack, cardId, elementId, used);
  if (swapped !== null) return { stack: swapped, did: "swapped" };
  const removed = removeWrongAnswer(stack, cardId, elementId);
  if (removed !== null) return { stack: removed, did: "removed" };
  return { stack, did: "left" };
}

/**
 * TASK-42b1/b10: every WRONG quiz answer that the joke-answer check flags gets
 * a safe swap, else is removed, else is left (its "may be a joke answer" note
 * still names it). The marker list catches only a few joke answers (recall
 * 0.05 / 0.01 / 0.03 out of sample, bench/DIAGNOSIS.md), so this fixes a few,
 * not most. Deterministic; no model call. `used` is shared with
 * swapRepeatedAnswers so one deck never gets the same label twice from the passes.
 */
export function swapFlaggedJokeAnswers(stack: Stack, used: Set<string> = new Set()): AnswerPassResult {
  let current = stack;
  const n = { swapped: 0, removed: 0, left: 0 };
  for (const card of stack.cards) {
    if (card.kind !== "quiz") continue;
    for (const answer of quizAnswers(card)) {
      if (isRight(answer)) continue;
      const now = answerOf(current, card.id, answer.id);
      if (now === null || jokeAnswerReason(now.answer, now.card) === null) continue;
      const r = fixAnswer(current, card.id, answer.id, used);
      current = r.stack;
      n[r.did]++;
    }
  }
  return { stack: current, ...n };
}

/**
 * TASK-42b3/b10: two answers on one quiz card that say the same thing (same
 * answerKey: case, punctuation, plural "s" and a leading article folded). The
 * later WRONG one (or, when the later one is right, the earlier wrong one) gets
 * a safe swap, else is removed, else is left. A right answer is never changed.
 */
export function swapRepeatedAnswers(stack: Stack, used: Set<string> = new Set()): AnswerPassResult {
  let current = stack;
  const n = { swapped: 0, removed: 0, left: 0 };
  for (const card of stack.cards) {
    if (card.kind !== "quiz") continue;
    const done = new Set<string>();
    for (let guard = 0; guard < 8; guard++) {
      const now = current.cards.find((c) => c.id === card.id)!;
      const answers = quizAnswers(now);
      let target: ButtonElement | undefined;
      const first = new Map<string, ButtonElement>();
      for (const a of answers) {
        const key = answerKey(a.label);
        if (key.length === 0) continue;
        const before = first.get(key);
        if (before === undefined) first.set(key, a);
        else if (target === undefined) {
          const t = isRight(a) ? (isRight(before) ? undefined : before) : a;
          if (t !== undefined && !done.has(t.id)) target = t;
        }
      }
      if (target === undefined) break;
      done.add(target.id);
      const r = fixAnswer(current, card.id, target.id, used);
      current = r.stack;
      n[r.did]++;
    }
  }
  return { stack: current, ...n };
}

/** b3: drop extra quiz / flash cards from the END until the counts match the request. */
export function trimToRequestedCounts(stack: Stack, req: RequestedCounts): Stack {
  return trimToRequestedCountsDetailed(stack, req).stack;
}

/** TASK-42b4: trimToRequestedCounts, also counting the cards dropped for repeating a right answer. */
export function trimToRequestedCountsDetailed(stack: Stack, req: RequestedCounts): { stack: Stack; sameAnswerDropped: number } {
  let current = stack;
  let sameAnswerDropped = 0;
  for (const kind of ["quiz", "flash"] as const) {
    const wanted = req[kind];
    if (wanted === undefined) continue;
    const blocked = new Set<string>();
    for (let guard = 0; guard < stack.cards.length; guard++) {
      const ofKind = current.cards.filter((c) => c.kind === kind);
      if (ofKind.length <= wanted) break;
      // TASK-42b4: a later quiz card that asks for an earlier one's right answer
      // (in words) goes first; only then do cards go from the end.
      const repeat = kind === "quiz" ? sameAnswerRepeat(current, blocked) : undefined;
      const victim = repeat ?? [...ofKind].reverse().find((c) => !blocked.has(c.id));
      if (victim === undefined) break;
      const next = removeCardRelinked(current, victim.id);
      if (next === null) blocked.add(victim.id);
      else {
        current = next;
        if (repeat !== undefined) sameAnswerDropped++;
      }
    }
  }
  return { stack: current, sameAnswerDropped };
}

/** b4: true when the pictogram's name is a word of the card's right answer. */
export function pictureGivesAnswerAway(card: Card): boolean {
  if (card.kind !== "quiz") return false;
  const right = rightAnswer(card);
  if (right === undefined) return false;
  const words = new Set(foldedWords(right.label));
  return card.elements.some((e) => {
    if (e.type !== "image") return false;
    const name = pictogramNameOfSrc(e.src);
    if (name === null) return false;
    return foldedWords(name).some((w) => words.has(w)) || foldedWords(e.alt.replace(/^picture:\s*/i, "")).some((w) => words.has(w));
  });
}

/** b4: remove a pictogram (and any old credit line) that would give the answer away. */
export function dropGiveawayPictograms(stack: Stack): { stack: Stack; dropped: number } {
  let dropped = 0;
  const cards = stack.cards.map((c) => {
    if (!pictureGivesAnswerAway(c)) return c;
    dropped++;
    return {
      ...c,
      elements: c.elements.filter(
        (e) => !(e.type === "image" && pictogramNameOfSrc(e.src) !== null) && !(e.type === "text" && isPictogramCredit(e.content)),
      ),
    };
  });
  return { stack: dropped > 0 ? { ...stack, cards } : stack, dropped };
}
