// src/shared/endLine.ts
// Which end-card lines are Stackyard's own stock wording, and which front text
// of a card sounds like an ENDING (TASK-29k, TASK-29m). Pure; shared by the
// player (a stock line over a score of 0 becomes "You finished!"; a heading the
// teacher wrote is kept) and the generator (a model that routes its long
// sign-off into a fake flash card before the end card gets it folded back).

const normalise = (s: string): string =>
  s.toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * True for Stackyard's OWN stock end lines ("Well done!", "Well done — you
 * finished!"). Only these are swapped for "You finished!" over a score of zero;
 * anything written by the teacher or the model is left as written.
 */
export function isStockEndLine(heading: string): boolean {
  return /^(well done|well done you finished|well done you have finished|great job|you did it)$/.test(normalise(heading));
}

/** A front text that sounds like a sign-off, not a question or a term. */
export function soundsLikeEnding(front: string): boolean {
  if (front.includes("?")) return false;
  return /^(you did it|you ve done it|well done|congratulations|congrats|great (job|work)|brilliant|amazing|fantastic|excellent|all done|you finished|you have finished|hooray|bravo|the end|that s it|thanks for)\b/.test(normalise(front));
}
