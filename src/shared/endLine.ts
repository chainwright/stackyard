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

/**
 * Long prose, not a term/translation/definition (TASK-30a): MORE than 120
 * characters AND at least two sentences. A vocabulary back ("Maith thú", "Hello")
 * or a one-line definition never qualifies.
 */
export function isLongProse(text: string): boolean {
  const t = text.trim();
  if (t.length <= 120) return false;
  const sentences = t.split(/(?<=[.!?…])\s+/).filter((s) => /[A-Za-z]/.test(s));
  return sentences.length >= 2;
}

/**
 * True when the teacher's own sentence asks for a message or an ending on the
 * last card ("a long encouraging message on the last card", "end with a
 * congratulations"). Only then may a sign-off card be folded into the end card
 * while the end card already has its own body.
 */
export function asksForClosingMessage(prompt: string | undefined): boolean {
  if (prompt === undefined) return false;
  return ASKS_FOR_MESSAGE.some((re) => re.test(prompt));
}

// "then the last card" only names the end card; a message word has to be tied to
// it (TASK-30a review fix). Each pattern needs BOTH the message and the card.
const MSG = String.raw`(?:message|note|words|encouragement|sign[- ]?off|farewell|good-?bye|congratulations|ending)`;
const CARD = String.raw`(?:last|final|closing|end|ending)\s+(?:card|slide|page|screen)`;
const ASKS_FOR_MESSAGE: RegExp[] = [
  // "a long encouraging message on the last card"
  new RegExp(String.raw`\b${MSG}\s+(?:on|in|at|for|to|from|with)\s+(?:the|a|an|your)?\s*${CARD}\b`, "i"),
  // "the last card should say a few kind words"
  new RegExp(String.raw`\b${CARD}\s+(?:should\s+|must\s+|can\s+)?(?:has|have|says?|shows?|gives?|with|is)\s+(?:a|an|the|some)?\s*(?:[a-z-]+\s+){0,3}${MSG}\b`, "i"),
  // "end with a goodbye", "end with some kind words"
  new RegExp(String.raw`\bend(?:s|ing)?\s+with\s+(?:a|an|some|the)\s+(?:[a-z-]+\s+){0,3}${MSG}\b`, "i"),
  // names the message itself
  /\b(?:closing|ending|end|final|goodbye)\s+message\b|\bsign[- ]?off\b|\bfarewell\b/i,
];

/**
 * A front text that is a short TERM, not a sentence: at most four words and no
 * sentence punctuation ("Well done", "Thank you"; not "You did it!"). Vocabulary
 * decks are made of these (TASK-30a review fix).
 */
export function isShortTerm(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && !/[.!?;:…]/.test(t) && t.split(/\s+/).length <= 4;
}

/** True when a flash card's pair is short enough to be vocabulary: a term and its translation/meaning. */
export function isShortPair(front: string, back: string): boolean {
  return front.trim().length <= 40 && back.trim().length <= 60;
}
