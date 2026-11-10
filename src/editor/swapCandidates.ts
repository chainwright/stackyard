// src/editor/swapCandidates.ts
// TASK-35a1: replacement candidates for one wrong answer, built from THIS deck
// only (no model call, no randomness). See .kiro/specs/maker/tasks.md, Phase 20.
//
// Sources, in deck order: every answer label on the deck's OTHER quiz cards
// (right and wrong), then every flash card's term (its first text element).
// A candidate is never ANY quiz card's right answer (TASK-36c1: a pupil may have
// just learned it as true), never already an answer on this card (case and
// punctuation ignored), never a suspected joke (the existing lesson-check
// markers, tried as this wrong answer on this card), never empty and never
// longer than MAX_ANSWER_LABEL.
//
// Ranking (TASK-36c1): candidates of the same answer FORM as this card's right
// answer first (a number, a verb phrase or a noun phrase; see answerForm), then
// the number of words shared with this card's question and answers, then deck
// order. At most 6.

import type { ButtonElement, Card, Stack } from "../shared/types.js";
import { foldedWords, jokeAnswerReason, normaliseText, quizAnswers, rightAnswer } from "../shared/lessonCheck.js";
import { primaryText } from "../shared/cardTitle.js";
import { MAX_ANSWER_LABEL } from "./operations.js";

export const MAX_SWAP_CANDIDATES = 6;

export type AnswerForm = "number" | "verb" | "noun";

const SUBJECTS = new Set(["it", "they", "he", "she", "we", "you", "i"]);
/** Words that follow a verb in -s/-es: "Turns into vapour", "Heats it up", "Moves the water". */
const AFTER_VERB = new Set(["it", "them", "the", "a", "an", "into", "up", "down", "away", "out", "off", "to", "through", "in", "on", "over", "back", "more", "less", "faster", "slower"]);

/**
 * TASK-36c1: a small, documented answer-form classifier (a heuristic, not a
 * parser):
 *   - "number": digits only ("42", "7 3");
 *   - "verb":   a verb phrase. It starts with a subject pronoun ("It melts"),
 *               or with a word in -ing ("Melting slowly"), or with a word in
 *               -s/-es followed by a particle or object word ("Turns into
 *               vapour", "Heats it up");
 *   - "noun":   anything else ("Tiny water droplets", "The Sun").
 */
export function answerForm(label: string): AnswerForm {
  const w = normaliseText(label).split(" ").filter((x) => x.length > 0);
  if (w.length === 0) return "noun";
  if (w.every((x) => /^\d+$/.test(x))) return "number";
  const first = w[0]!;
  if (SUBJECTS.has(first)) return "verb";
  if (w.length >= 2 && first.length >= 5 && first.endsWith("ing")) return "verb";
  if (w.length >= 2 && first.length >= 4 && /[^s]s$/.test(first) && AFTER_VERB.has(w[1]!)) return "verb";
  return "noun";
}

/** Words of three letters or more, normalised and plural-folded. */
function words(s: string): Set<string> {
  return new Set(foldedWords(s).filter((w) => w.length >= 3));
}

/** The raw candidate labels of a deck, in deck order (before filtering). */
function sources(stack: Stack, cardId: string): string[] {
  const out: string[] = [];
  for (const c of stack.cards) {
    if (c.kind === "quiz" && c.id !== cardId) for (const a of quizAnswers(c)) out.push(a.label);
  }
  for (const c of stack.cards) {
    if (c.kind !== "flash") continue;
    const t = c.elements.find((e) => e.type === "text");
    if (t && t.type === "text") out.push(t.content);
  }
  return out;
}

/** True when `label`, put in place of `target` on `card`, would be a suspected joke. */
export function wouldBeJoke(label: string, target: ButtonElement, card: Card): boolean {
  const trial: ButtonElement = { ...target, label };
  const trialCard: Card = { ...card, elements: card.elements.map((e) => (e.id === target.id ? trial : e)) };
  return jokeAnswerReason(trial, trialCard) !== null;
}

/**
 * Up to six replacement labels for the wrong answer `elementId` on quiz card
 * `cardId`. [] when that is not a wrong answer on a quiz card.
 */
export function swapCandidates(stack: Stack, cardId: string, elementId: string): string[] {
  const card = stack.cards.find((c) => c.id === cardId);
  if (card === undefined || card.kind !== "quiz") return [];
  const answers = quizAnswers(card);
  const target = answers.find((b) => b.id === elementId);
  if (target === undefined || target.actions.some((a) => a.type === "score" && a.delta > 0)) return [];

  const onCard = new Set(answers.map((a) => normaliseText(a.label)));
  // TASK-36c1: no quiz card's right answer, on any card.
  const rights = new Set(
    stack.cards
      .filter((c) => c.kind === "quiz")
      .flatMap((c) => quizAnswers(c).filter((b) => b.actions.some((a) => a.type === "score" && a.delta > 0)))
      .map((b) => normaliseText(b.label)),
  );
  const right = rightAnswer(card);
  const form = right === undefined ? null : answerForm(right.label);
  const context = words([primaryText(card), ...answers.map((a) => a.label)].join(" "));
  const seen = new Set<string>();
  const kept: Array<{ label: string; same: number; score: number; order: number }> = [];
  for (const raw of sources(stack, cardId)) {
    const label = raw.trim();
    const key = normaliseText(label);
    if (key.length === 0 || label.length > MAX_ANSWER_LABEL) continue;
    if (onCard.has(key) || rights.has(key) || seen.has(key)) continue;
    seen.add(key);
    if (wouldBeJoke(label, target, card)) continue;
    let score = 0;
    for (const w of words(label)) if (context.has(w)) score++;
    kept.push({ label, same: form !== null && answerForm(label) === form ? 1 : 0, score, order: kept.length });
  }
  kept.sort((a, b) => b.same - a.same || b.score - a.score || a.order - b.order);
  return kept.slice(0, MAX_SWAP_CANDIDATES).map((k) => k.label);
}
