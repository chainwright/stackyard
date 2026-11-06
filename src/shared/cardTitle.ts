// src/shared/cardTitle.ts
// One shared place to name a card for a list, a picker, or the "before you
// share" check (TASK-25 a). The name must come from the card's QUESTION /
// FRONT / STORY text — never from a caption or image-credit line.
//
// The old call sites each picked "the longest text element", which broke once a
// deck's first card gained an image credit along the bottom: the credit line
// ("Image: … — https://openverse.org") is longer than the question, so the card
// list named card 1 after the credit instead of the question (live check, 5 Nov).
//
// The content text always sits at the TOP of the card (y:104 in the ready-made
// decks and the mockups); a caption/credit sits near the bottom (y:566). So the
// robust rule is: the primary text is the TOPMOST text element (smallest y, then
// smallest x as a tie-break) — regardless of how long it is or where it sits in
// the elements array. A bottom caption is never chosen.

import type { Card, TextElement } from "./types.js";

/** The card's primary content text: its question / front / story line. */
export function primaryText(card: Card): string {
  const texts = card.elements.filter(
    (e): e is TextElement => e.type === "text",
  );
  if (texts.length === 0) return "";

  // A flash card is named by its FRONT — the term the class guesses — which is
  // authored as the first text element, above the back explanation.
  if (card.kind === "flash") {
    return texts[0]!.content.trim();
  }

  // Otherwise take the topmost text (smallest y; tie-break on x). This is the
  // question/story body; a caption or image credit sits lower and is skipped.
  let best = texts[0]!;
  for (const t of texts) {
    if (t.y < best.y || (t.y === best.y && t.x < best.x)) best = t;
  }
  return best.content.trim();
}

/** Truncate a label to `max` characters with a trailing ellipsis. */
export function truncateLabel(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1) + "…";
}

/**
 * A plain card name for a list/picker entry: the primary content text, or a
 * kind-based fallback when the card has no content text. Never a caption or an
 * image credit.
 *
 * @param card      The card to name.
 * @param maxLength Truncate the content text to this many characters (default 40).
 */
export function cardTitle(card: Card, maxLength = 40): string {
  const text = primaryText(card);
  if (text.length > 0) return truncateLabel(text, maxLength);
  if (card.kind === "end") return "Last card — the score";
  if (card.kind === "flash") return "Flash card";
  return card.kind.charAt(0).toUpperCase() + card.kind.slice(1) + " card";
}

/**
 * A short plain reference to a card for a sentence ("Card 5 — Which people began
 * raiding Ire…", or "the last card"), used by every "before you share" message in
 * the Maker AND the living file so they read the same.
 */
export function cardRefLabel(
  stack: { cards: Card[] },
  card: Card,
  maxLength = 24,
): string {
  if (card.kind === "end") return "the last card";
  const index = stack.cards.findIndex((c) => c.id === card.id);
  const words = truncateLabel(primaryText(card), maxLength);
  const n = index >= 0 ? index + 1 : 0;
  if (n === 0) return words.length > 0 ? words : "a card";
  return words.length > 0 ? `Card ${n} — ${words}` : `Card ${n}`;
}
