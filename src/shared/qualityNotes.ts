// src/shared/qualityNotes.ts
// Plain notes about what the generator did to a deck (TASK-32b), shown on the
// Maker's first editor screen and asserted by scripts/check-generation-quality.ts:
// repeated cards it removed, and counts that fell short of the sentence ("You
// asked for 6 questions; the model wrote 4."). Extra cards are trimmed to the
// number asked without a note: the deck now matches the sentence.

import type { Stack } from "./types.js";
import { parseRequestedCounts } from "./requestedCounts.js";
import { countWords } from "./classResults.js";

/**
 * TASK-42b2/b10: what the answer passes did to a generated deck. Answers are
 * swapped for a safe candidate, or removed; droppedSameAnswer (TASK-42b4) and
 * the "left" counts are for the bench only.
 */
export interface AnswerCounts {
  swappedJokes?: number;
  removedJokes?: number;
  leftJokes?: number;
  swappedRepeats?: number;
  removedDuplicates?: number;
  leftDuplicates?: number;
  droppedSameAnswer?: number;
}
const COUNT_KEYS = ["swappedJokes", "removedJokes", "leftJokes", "swappedRepeats", "removedDuplicates", "leftDuplicates", "droppedSameAnswer"] as const;

/** The answer counts a generation result carries, only those > 0. */
export function swapCounts(r: AnswerCounts): AnswerCounts {
  const out: AnswerCounts = {};
  for (const k of COUNT_KEYS) {
    const v = r[k];
    if (typeof v === "number" && v > 0) out[k] = v;
  }
  return out;
}

/** "one answer that looked like a joke" / "three answers that looked like jokes" / "… said the same as another on its card". */
function answersPhrase(n: number, what: "joke" | "same"): string {
  if (what === "joke") return n === 1 ? "one answer that looked like a joke" : `${countWords(n)} answers that looked like jokes`;
  return n === 1 ? "one answer that said the same as another on its card" : `${countWords(n)} answers that said the same as others on their cards`;
}

export function qualityNotes(sentence: string, stack: Stack, removedRepeats: number, counts: AnswerCounts = {}): string[] {
  const notes: string[] = [];
  if (removedRepeats > 0) {
    notes.push(removedRepeats === 1 ? "We removed 1 repeated card." : `We removed ${removedRepeats} repeated cards.`);
  }
  // TASK-42b2/b10: what the generator swapped or removed, in the audience voice
  // (numbers one to ten in words). Only the swapped-joke note asks for a check.
  const sj = counts.swappedJokes ?? 0;
  if (sj > 0) notes.push(`We swapped ${answersPhrase(sj, "joke")}. ${sj === 1 ? "Read it to check it fits." : "Read them to check they fit."}`);
  const rj = counts.removedJokes ?? 0;
  if (rj > 0) notes.push(`We removed ${answersPhrase(rj, "joke")}.`);
  const sr = counts.swappedRepeats ?? 0;
  if (sr > 0) notes.push(`We swapped ${answersPhrase(sr, "same")}.`);
  const rr = counts.removedDuplicates ?? 0;
  if (rr > 0) notes.push(`We removed ${answersPhrase(rr, "same")}.`);
  const asked = parseRequestedCounts(sentence);
  const quiz = stack.cards.filter((c) => c.kind === "quiz").length;
  const flash = stack.cards.filter((c) => c.kind === "flash").length;
  if (asked.quiz !== undefined && quiz < asked.quiz) {
    notes.push(`You asked for ${asked.quiz} question${asked.quiz === 1 ? "" : "s"}; the model wrote ${quiz}.`);
  }
  if (asked.flash !== undefined && flash < asked.flash) {
    notes.push(`You asked for ${asked.flash} flash card${asked.flash === 1 ? "" : "s"}; the model wrote ${flash}.`);
  }
  return notes;
}
