// src/shared/lessonCheck.ts
// The cheap, mechanical half of the lesson-checker persona
// (.kiro/agents/lesson-checker.md), run on EVERY deck (TASK-32b). Pure: it reads
// a stack and returns warnings; it never changes a card. The Maker's and the
// Teacher tab's "Before you share" show them as non-blocking lines — "Export
// anyway" still exports — and scripts/check-generation-quality.ts asserts them
// on the live-shaped fixtures.
//
// What it catches (each was measured on live generated decks, 9 Nov):
//   two-answers          a quiz with only two answers that is not an "A or B?"
//                        comparison — a 50 % guess (6 of 7 quizzes in one deck);
//   duplicate-answers    two answers on one card with the same words;
//   answer-inside-answer the right answer is part of a wrong one, or the reverse
//                        ("Rivers and lakes that lead to the sea" vs "The sea"):
//                        a bright pupil can defend the wrong one;
//   restates-flash       a quiz within 3 cards after a flash card that just asks
//                        for that card's term or its definition again;
//   repeated-card        a card whose kind and front repeat an earlier card's
//                        (the generator removes these; one it could not remove
//                        without stranding a card is flagged instead).
// The factual, reading-level and distractor-quality judgements stay with the
// persona: they need a reader, not a rule.

import type { ButtonElement, Card, Stack } from "./types.js";
import { primaryText } from "./cardTitle.js";

export type LessonWarningCode =
  | "two-answers"
  | "duplicate-answers"
  | "answer-inside-answer"
  | "restates-flash"
  | "repeated-card";

export interface LessonWarning {
  code: LessonWarningCode;
  /** The card the warning is about. */
  cardId: string;
  /** The other card involved (the flash card restated, the earlier twin). */
  otherCardId?: string;
  /** The two answer labels involved (answer-inside-answer, duplicate-answers). */
  labels?: [string, string];
}

/** Lower-case, letters and digits only, single spaces. "The Sea!" → "the sea". */
export function normaliseText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The words of a text, normalised, with a plural "s" folded ("clouds" → "cloud"). */
export function foldedWords(s: string): string[] {
  return normaliseText(s)
    .split(" ")
    .filter((w) => w.length > 0)
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

/** Words that carry meaning (4+ letters), for the "restates a flash card" overlap. */
function contentWords(s: string): Set<string> {
  return new Set(foldedWords(s).filter((w) => w.length >= 4));
}

/** The share of `a`'s content words that also appear in `b` (0 when `a` has none). */
function overlap(a: string, b: string): number {
  const wa = contentWords(a);
  if (wa.size === 0) return 0;
  const wb = contentWords(b);
  let n = 0;
  for (const w of wa) if (wb.has(w)) n++;
  return n / wa.size;
}

/** True when `inner` occurs in `outer` as whole words (normalised). */
function containsWords(outer: string, inner: string): boolean {
  const o = ` ${normaliseText(outer)} `;
  const i = normaliseText(inner);
  return i.length > 0 && o.includes(` ${i} `);
}

/** A two-way comparison: the question offers two options with "or" ("Is 7 × 8 bigger or smaller than 50?", "True or false?"). */
export function isTwoWayComparison(question: string): boolean {
  return /\bor\b/.test(normaliseText(question));
}

/** The answer buttons of a quiz card (buttons carrying a score action). */
export function quizAnswers(card: Card): ButtonElement[] {
  return card.elements.filter(
    (e): e is ButtonElement => e.type === "button" && e.actions.some((a) => a.type === "score"),
  );
}

/** The right answer of a quiz card, if exactly one is marked. */
export function rightAnswer(card: Card): ButtonElement | undefined {
  const right = quizAnswers(card).filter((b) => b.actions.some((a) => a.type === "score" && a.delta === 1));
  return right.length === 1 ? right[0] : undefined;
}

/** The card's front, normalised: what makes two cards "the same card" (kind + this). */
export function frontKey(card: Card): string {
  return `${card.kind}:${normaliseText(primaryText(card))}`;
}

/** The term and the explanation of a flash card (its first two texts). */
function flashSides(card: Card): { term: string; back: string } {
  const texts = card.elements.filter((e) => e.type === "text").map((e) => (e.type === "text" ? e.content : ""));
  return { term: texts[0] ?? "", back: texts[1] ?? "" };
}

/**
 * True when a quiz just asks for a flash card's term or definition again:
 *   - the right answer IS the term and the question carries most (≥ 50 %) of the
 *     definition's words ("What do we call water turning into vapour?" → "Evaporation");
 *   - or the question names the term and the right answer is mostly (≥ 60 %) the
 *     definition's words ("What is evaporation?" → "Water turning into vapour").
 */
export function restatesFlash(quiz: Card, flash: Card): boolean {
  const { term, back } = flashSides(flash);
  const right = rightAnswer(quiz);
  if (right === undefined || normaliseText(term).length === 0) return false;
  const question = primaryText(quiz);
  const asksTerm = normaliseText(right.label) === normaliseText(term) && overlap(back, question) >= 0.5;
  const asksDefinition =
    containsWords(question, term) && back.trim().length > 0 && overlap(right.label, back) >= 0.6;
  return asksTerm || asksDefinition;
}

/** Every mechanical lesson warning for a stack, in deck order. */
export function lessonWarnings(stack: Stack): LessonWarning[] {
  const out: LessonWarning[] = [];
  const firstByFront = new Map<string, string>();
  stack.cards.forEach((card, i) => {
    if (card.kind === "end") return;
    const key = frontKey(card);
    const twin = firstByFront.get(key);
    if (twin !== undefined && normaliseText(primaryText(card)).length > 0) {
      out.push({ code: "repeated-card", cardId: card.id, otherCardId: twin });
    } else if (twin === undefined) firstByFront.set(key, card.id);

    if (card.kind !== "quiz") return;
    const answers = quizAnswers(card);
    if (answers.length === 2 && !isTwoWayComparison(primaryText(card))) {
      out.push({ code: "two-answers", cardId: card.id });
    }
    // Duplicate labels.
    const seen = new Map<string, string>();
    for (const a of answers) {
      const k = normaliseText(a.label);
      if (k.length === 0) continue;
      const before = seen.get(k);
      if (before !== undefined) {
        out.push({ code: "duplicate-answers", cardId: card.id, labels: [before, a.label] });
        break;
      }
      seen.set(k, a.label);
    }
    // The right answer inside a wrong one, or the reverse.
    const right = rightAnswer(card);
    if (right !== undefined) {
      for (const wrong of answers) {
        if (wrong === right || normaliseText(wrong.label) === normaliseText(right.label)) continue;
        if (containsWords(wrong.label, right.label) || containsWords(right.label, wrong.label)) {
          out.push({ code: "answer-inside-answer", cardId: card.id, labels: [right.label, wrong.label] });
          break;
        }
      }
    }
    // A quiz within 3 cards after a flash card that just restates it.
    for (let j = Math.max(0, i - 3); j < i; j++) {
      const prev = stack.cards[j]!;
      if (prev.kind === "flash" && restatesFlash(card, prev)) {
        out.push({ code: "restates-flash", cardId: card.id, otherCardId: prev.id });
        break;
      }
    }
  });
  return out;
}

/** One plain sentence per warning, for "Before you share". `label` names a card ("Card 3 — …"). */
export function describeLessonWarnings(
  stack: Stack,
  warnings: LessonWarning[],
  label: (card: Card) => string,
): string[] {
  const byId = new Map(stack.cards.map((c) => [c.id, c]));
  const name = (id: string | undefined): string => {
    const c = id === undefined ? undefined : byId.get(id);
    return c === undefined ? "a card" : label(c).replace(/[.…]+$/, "");
  };
  const num = (id: string | undefined): string => {
    const i = stack.cards.findIndex((c) => c.id === id);
    return i >= 0 ? `card ${i + 1}` : "another card";
  };
  return warnings.map((w) => {
    const card = name(w.cardId);
    switch (w.code) {
      case "two-answers":
        return `${card} has only two answers: add one.`;
      case "duplicate-answers":
        return `${card} has two answers with the same words: change one.`;
      case "answer-inside-answer":
        return `${card}: the right answer “${w.labels![0]}” and the wrong answer “${w.labels![1]}” overlap, so a pupil could argue for both. Reword one.`;
      case "restates-flash":
        return `${card} just asks again what ${num(w.otherCardId)} showed: ask about it differently.`;
      case "repeated-card":
        return `${card} repeats ${num(w.otherCardId)}: change it or remove it.`;
    }
  });
}
