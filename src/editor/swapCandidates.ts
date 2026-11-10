// src/editor/swapCandidates.ts
// TASK-35a1: replacement candidates for one wrong answer, built from THIS deck
// only (no model call, no randomness). See .kiro/specs/maker/tasks.md, Phase 20.
//
// Sources, in deck order: every answer label on the deck's OTHER quiz cards
// (right and wrong), then every flash card's term (its first text element).
// A candidate is never this card's right answer, never already an answer on
// this card (case and punctuation ignored), never a suspected joke (the
// existing lesson-check markers, tried as this wrong answer on this card),
// never empty and never longer than MAX_ANSWER_LABEL. Most related first: the
// number of words it shares with this card's question and answers; ties keep
// deck order. At most 6.

import type { ButtonElement, Card, Stack } from "../shared/types.js";
import { foldedWords, jokeAnswerReason, normaliseText, quizAnswers } from "../shared/lessonCheck.js";
import { primaryText } from "../shared/cardTitle.js";
import { MAX_ANSWER_LABEL } from "./operations.js";

export const MAX_SWAP_CANDIDATES = 6;

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
  const context = words([primaryText(card), ...answers.map((a) => a.label)].join(" "));
  const seen = new Set<string>();
  const kept: Array<{ label: string; score: number; order: number }> = [];
  for (const raw of sources(stack, cardId)) {
    const label = raw.trim();
    const key = normaliseText(label);
    if (key.length === 0 || label.length > MAX_ANSWER_LABEL) continue;
    if (onCard.has(key) || seen.has(key)) continue;
    seen.add(key);
    if (wouldBeJoke(label, target, card)) continue;
    let score = 0;
    for (const w of words(label)) if (context.has(w)) score++;
    kept.push({ label, score, order: kept.length });
  }
  kept.sort((a, b) => b.score - a.score || a.order - b.order);
  return kept.slice(0, MAX_SWAP_CANDIDATES).map((k) => k.label);
}
