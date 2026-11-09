// server/deckQuality.ts
// Stack-level quality passes on a generated deck (TASK-32b), run by
// finaliseGeneratedStackDetailed after the per-card layout and BEFORE the quiz
// answers are linked forward:
//   removeRepeatedCards     (b2) a card whose kind and front repeat an earlier one
//   trimToRequestedCounts   (b3) more quiz / flash cards than the sentence asked for
//   dropGiveawayPictograms  (b4) a picture that names the right answer
// Each pass removes, never rewrites wording. A removed card's incoming gotos are
// pointed where it led (or at its earlier twin), and a removal that would strand
// a card the class could reach before is not made. So every pass keeps the stack
// valid and keeps every other reachable card reachable.

import type { Action, Card, Element, Stack } from "../src/shared/types.js";
import { validate } from "../src/shared/validator.js";
import { outTargets, reachableIds, nextCardAfter } from "../src/shared/flow.js";
import { checkReachability } from "../src/shared/reachability.js";
import { frontKey, foldedWords, rightAnswer } from "../src/shared/lessonCheck.js";
import { primaryText } from "../src/shared/cardTitle.js";
import { pictogramNameOfSrc, isPictogramCredit } from "../src/shared/pictograms.js";
import type { RequestedCounts } from "../src/shared/requestedCounts.js";

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

/** b3: drop extra quiz / flash cards from the END until the counts match the request. */
export function trimToRequestedCounts(stack: Stack, req: RequestedCounts): Stack {
  let current = stack;
  for (const kind of ["quiz", "flash"] as const) {
    const wanted = req[kind];
    if (wanted === undefined) continue;
    const blocked = new Set<string>();
    for (let guard = 0; guard < stack.cards.length; guard++) {
      const ofKind = current.cards.filter((c) => c.kind === kind);
      if (ofKind.length <= wanted) break;
      const victim = [...ofKind].reverse().find((c) => !blocked.has(c.id));
      if (victim === undefined) break;
      const next = removeCardRelinked(current, victim.id);
      if (next === null) blocked.add(victim.id);
      else current = next;
    }
  }
  return current;
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
