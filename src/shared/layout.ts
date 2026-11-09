// src/shared/layout.ts
// The card layout template (TASK-26c). The ready-made decks, the editor's seed
// cards and — since round 2 — every GENERATED card share these rectangles, so
// real model output lands in the same safe areas as the hand-laid decks.
//
// Why this exists: the model's own coordinates were trusted as-is (every
// generated text sat at y=40, inside the "Card N of M" band), so the question
// overprinted the counter, long questions ran into the answer tiles and the
// CORRECT stamp landed on both. The model decides WORDS; the template decides
// WHERE.
//
// The 800 × 600 canvas, top to bottom:
//
//   y   0 –  96  chrome band: "Card N of M" (left) and the running score
//                (right), plus the ring holes. NOTHING of ours goes here.
//   y 104 – 248  question / story text (fit-text shrinks long text to fit)
//   y 248 – 296  stamp gutter (48 px): the CORRECT ✓ / ✗ stamp sits here with its
//                bottom edge on the tile's top edge, so it never reaches the
//                answer text (TASK-27a)
//   y 296 – 384  answer tiles, row 1 (88 px tall)
//   y 384 – 432  stamp gutter for row 2 (48 px)
//   y 432 – 520  answer tiles, row 2
//   y 566 – 594  caption / picture credit line
//
// The 48 px gutters are the point. Round 3 found the CORRECT stamp struck through
// the first line of every answer that wrapped to two or three lines, because the
// old template left 32 px and the stamp was ~50 px tall: it reached ~18 px into the
// tile, and a wrapped label starts ~10 px below the tile's top.

export interface Rect { x: number; y: number; w: number; h: number }

/** Nothing the template places may start above this y. */
export const TOP_BAND = 96;

export const CANVAS_W = 800;
export const CANVAS_H = 600;

/** The question on a quiz card. Ends at y=248 so the 48 px stamp gutter stays clear. */
export const QUIZ_QUESTION: Rect = { x: 48, y: 104, w: 704, h: 144 };

/** The four answer tiles, in tile order (A B / C D). */
export const QUIZ_TILES: readonly Rect[] = [
  { x: 48, y: 296, w: 344, h: 88 },
  { x: 408, y: 296, w: 344, h: 88 },
  { x: 48, y: 432, w: 344, h: 88 },
  { x: 408, y: 432, w: 344, h: 88 },
];

/** Flash card: the term, the explanation, and the Next Card button. */
export const FLASH_TERM: Rect = { x: 48, y: 264, w: 704, h: 72 };
export const FLASH_BACK: Rect = { x: 48, y: 360, w: 704, h: 120 };
export const FLASH_NEXT: Rect = { x: 408, y: 496, w: 344, h: 72 };

/**
 * The slot for a generated card's pictogram (TASK-31h): a small square tucked in
 * the top strip, centred, where the ready-made decks' pictures sit (the "Card N
 * of M" counter is at the left and the score at the right, so the middle is
 * free), and its credit line in the caption strip. Clear of every other slot.
 */
export const PICTURE_SLOT: Rect = { x: 356, y: 8, w: 88, h: 88 };
export const PICTURE_CREDIT: Rect = { x: 48, y: 566, w: 340, h: 28 };

/** A lone story "Continue" button (a consequence card). */
export const STORY_CONTINUE: Rect = { x: 408, y: 440, w: 344, h: 80 };
export const STORY_BODY_SINGLE: Rect = { x: 48, y: 104, w: 704, h: 300 };

/** The end card's heading and score field. */
export const END_HEADING: Rect = { x: 48, y: 120, w: 704, h: 72 };
/** The end card's optional longer message (TASK-29k). */
export const END_BODY: Rect = { x: 48, y: 204, w: 704, h: 200 };
export const END_SCORE: Rect = { x: 48, y: 420, w: 704, h: 60 };

/** The most answers a quiz card keeps, and the most choices a story keeps. */
export const MAX_QUIZ_ANSWERS = 4;
export const MAX_STORY_CHOICES = 4;

/**
 * Story card with `n` choices (n ≥ 2): the body on top and the choices stacked
 * full-width at the bottom, each as tall as fits (56–72 px). Returns the body
 * rectangle and one rectangle per choice. For n ≤ 1 the ready-made single
 * "Continue" layout is used.
 */
export function storyLayout(n: number): { body: Rect; buttons: Rect[] } {
  if (n <= 1) {
    return { body: STORY_BODY_SINGLE, buttons: n === 1 ? [STORY_CONTINUE] : [] };
  }
  const count = Math.min(n, MAX_STORY_CHOICES);
  // 32 px between choices: the editor draws a ~20 px "→ Card N" label under each
  // one, and with a 12 px gap that label sat on the next choice (TASK-27w).
  const gap = 32;
  const bottom = 560;
  const minBodyBottom = 104 + 112; // keep at least 112 px for the story text
  const room = bottom - (minBodyBottom + 16);
  const h = Math.max(56, Math.min(72, Math.floor((room - (count - 1) * gap) / count)));
  const total = count * h + (count - 1) * gap;
  const top = bottom - total;
  const buttons: Rect[] = [];
  for (let i = 0; i < count; i++) {
    buttons.push({ x: 48, y: top + i * (h + gap), w: 704, h });
  }
  return { body: { x: 48, y: 104, w: 704, h: top - 16 - 104 }, buttons };
}

/** Clamp a rectangle onto the 800 × 600 canvas (invariant 5), keeping its size. */
export function clampToCanvas<T extends Rect>(r: T): T {
  const w = Math.min(Math.max(1, r.w), CANVAS_W);
  const h = Math.min(Math.max(1, r.h), CANVAS_H);
  const x = Math.min(Math.max(0, r.x), CANVAS_W - w);
  const y = Math.min(Math.max(0, r.y), CANVAS_H - h);
  return { ...r, x, y, w, h };
}
