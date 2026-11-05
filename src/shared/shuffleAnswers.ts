// shuffleAnswers(stack): deterministically vary which tile each quiz answer
// sits on, so the correct answer is not always the first (coral ▲) tile.
//
// Why this exists
// ---------------
// Every ready-made quiz card was authored with the correct answer first, and
// the LLM tends to do the same, so a teacher-judge spots "the right answer is
// always top-left" by card 2 (J3 P0, 5 Nov panel). This permutes the answer
// payloads (label + actions) across each quiz card's fixed answer SLOTS, so the
// correct label lands on a different coloured/shaped tile.
//
// How it stays safe
// -----------------
//   - It permutes `label` + `actions` BETWEEN the answer-button slots on a card
//     and leaves each button's `id`, `x`, `y`, `w`, `h` where they are. So the
//     2×2 grid positions stay fixed and unique (no two answers overlap), element
//     ids are unchanged (export round-trip stays lossless), and the one button
//     carrying `score:1` still carries it — just on a different slot. Invariant 4
//     (exactly one correct, at least one wrong) is preserved because the set of
//     payloads is unchanged, only their slot assignment moves.
//   - Only quiz-card answer buttons (those with a `score` action) are touched.
//     Plain buttons, text, images and non-quiz cards are left exactly as they
//     are.
//   - The permutation is DETERMINISTIC, seeded from `stack.id`, so the same
//     stack always shuffles the same way. That keeps `exportStack` →
//     `parse` round-trips lossless and makes the ready-made decks reproducible.
//
// Pure: returns a new stack; never mutates the input.

import type { Stack, Card, Action, ButtonElement } from "./types.js";

/** True if a button is a quiz answer (it carries a score action). */
function isAnswerButton(btn: ButtonElement): boolean {
  return btn.actions.some((a) => a.type === "score");
}

/**
 * A tiny deterministic PRNG (mulberry32) seeded from a 32-bit integer. Good
 * enough to spread the correct answer across the four slots; not cryptographic.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string into a 32-bit integer seed (FNV-1a). */
function seedFromString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Fisher–Yates permutation of [0..n) using `rng`. */
function permutation(n: number, rng: () => number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  return order;
}

/**
 * Return a copy of `stack` in which each quiz card's answer payloads (label +
 * actions) are permuted across its answer slots, deterministically per stack.
 * The correct answer keeps its `score:1`, just on a different tile.
 */
export function shuffleQuizAnswers(stack: Stack): Stack {
  // One PRNG for the whole stack, seeded from its id, advanced per quiz card so
  // different cards get independent (but reproducible) permutations.
  const rng = mulberry32(seedFromString(stack.id));

  const cards: Card[] = stack.cards.map((card) => {
    if (card.kind !== "quiz") return card;

    // Indices of the answer-button elements, in element order.
    const answerIdx: number[] = [];
    card.elements.forEach((el, i) => {
      if (el.type === "button" && isAnswerButton(el)) answerIdx.push(i);
    });
    if (answerIdx.length < 2) return card; // nothing meaningful to shuffle

    // The payloads currently on those slots (label + actions), in slot order.
    const payloads = answerIdx.map((i) => {
      const el = card.elements[i] as ButtonElement;
      return { label: el.label, actions: el.actions };
    });

    // A permutation that is NOT the identity when possible (so the correct
    // answer actually moves off slot 0 at least sometimes). Draw up to a few
    // times; fall back to a single swap if we keep drawing identity.
    let order = permutation(payloads.length, rng);
    let tries = 0;
    while (isIdentity(order) && tries < 4) {
      order = permutation(payloads.length, rng);
      tries++;
    }
    if (isIdentity(order) && payloads.length >= 2) {
      // Guarantee movement: swap the first two slots.
      order = order.slice();
      const tmp = order[0]!;
      order[0] = order[1]!;
      order[1] = tmp;
    }

    // Rebuild the card: slot k gets payload order[k], keeping each slot's own
    // id/x/y/w/h fixed so positions stay valid and ids stay stable.
    const elements = card.elements.map((el, i) => {
      const slot = answerIdx.indexOf(i);
      if (slot < 0) return el; // not an answer button
      const src = payloads[order[slot]!]!;
      return { ...(el as ButtonElement), label: src.label, actions: cloneActions(src.actions) };
    });

    return { ...card, elements };
  });

  return { ...stack, cards };
}

function isIdentity(order: number[]): boolean {
  return order.every((v, i) => v === i);
}

function cloneActions(actions: Action[]): Action[] {
  return actions.map((a) => ({ ...a }));
}
