// src/shared/qualityNotes.ts
// Plain notes about what the generator did to a deck (TASK-32b), shown on the
// Maker's first editor screen and asserted by scripts/check-generation-quality.ts:
// repeated cards it removed, and counts that fell short of the sentence ("You
// asked for 6 questions; the model wrote 4."). Extra cards are trimmed to the
// number asked without a note: the deck now matches the sentence.

import type { Stack } from "./types.js";
import { parseRequestedCounts } from "./requestedCounts.js";

export function qualityNotes(sentence: string, stack: Stack, removedRepeats: number): string[] {
  const notes: string[] = [];
  if (removedRepeats > 0) {
    notes.push(removedRepeats === 1 ? "We removed 1 repeated card." : `We removed ${removedRepeats} repeated cards.`);
  }
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
