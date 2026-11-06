// src/shared/fitText.ts
// Fit text into a box by stepping the font size down (TASK-26c). A pure
// estimate — no DOM, no font metrics — so it runs the same in the player, the
// editor, jsdom tests and Node, and the answer is deterministic.
//
// The player used to draw every question at a fixed 44 px and every answer at a
// fixed 32 px, so a three-line question ran into the answer tiles and a
// two-line answer overflowed its tile (round-2 review, J1/J2/J3). Now the
// renderer asks this module for the largest size that fits.
//
// The estimate is a greedy word wrap using an average glyph width (a fraction of
// the font size). Bricolage Grotesque 800 and Stackyard Reading measure about
// 0.50–0.54 em per character; 0.54 is deliberately on the wide side so the
// estimate errs toward "needs another line" (safe) rather than overflow.

export interface FitOptions {
  /** Box width and height in canvas px. */
  w: number;
  h: number;
  /** Largest and smallest font size to try, px. */
  maxSize: number;
  minSize: number;
  /** Step between candidate sizes, px (default 2). */
  step?: number;
  /** Line height for a given size, px (default size × 1.3). */
  lineHeight?: (size: number) => number;
  /** Average glyph width as a fraction of the font size (default 0.54). */
  charWidth?: number;
  /** Maximum number of lines allowed (default: no limit beyond the box). */
  maxLines?: number;
}

export interface FitResult {
  size: number;
  lineHeight: number;
  lines: number;
  /** False when even the smallest size does not fit the box. */
  fits: boolean;
}

/** Number of lines `text` wraps to in a box `boxW` wide at `size` px. */
export function estimateLines(
  text: string,
  boxW: number,
  size: number,
  charWidth = 0.54,
): number {
  const perChar = size * charWidth;
  if (boxW <= 0 || perChar <= 0) return 1;
  let lines = 0;
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      lines += 1; // a blank line still takes a line
      continue;
    }
    let lineWidth = 0;
    let paraLines = 1;
    for (const word of words) {
      const wordWidth = word.length * perChar;
      if (wordWidth > boxW) {
        // A word wider than the box breaks across lines.
        if (lineWidth > 0) paraLines += 1;
        const extra = Math.ceil(wordWidth / boxW) - 1;
        paraLines += extra;
        lineWidth = wordWidth - extra * boxW;
        continue;
      }
      const withSpace = lineWidth === 0 ? wordWidth : lineWidth + perChar + wordWidth;
      if (withSpace > boxW) {
        paraLines += 1;
        lineWidth = wordWidth;
      } else {
        lineWidth = withSpace;
      }
    }
    lines += paraLines;
  }
  return Math.max(1, lines);
}

/** The largest size in [minSize, maxSize] at which `text` fits the box. */
export function fitText(text: string, opts: FitOptions): FitResult {
  const step = opts.step ?? 2;
  const lh = opts.lineHeight ?? ((s: number) => Math.round(s * 1.3));
  const charWidth = opts.charWidth ?? 0.54;
  let last: FitResult | null = null;
  for (let size = opts.maxSize; size >= opts.minSize; size -= step) {
    const lines = estimateLines(text, opts.w, size, charWidth);
    const lineHeight = lh(size);
    const fits =
      lines * lineHeight <= opts.h &&
      (opts.maxLines === undefined || lines <= opts.maxLines);
    last = { size, lineHeight, lines, fits };
    if (fits) return last;
  }
  if (last !== null) {
    // Even the smallest size overflows; report it honestly at minSize.
    const size = opts.minSize;
    const lines = estimateLines(text, opts.w, size, charWidth);
    return { size, lineHeight: lh(size), lines, fits: false };
  }
  const size = opts.minSize;
  return { size, lineHeight: lh(size), lines: estimateLines(text, opts.w, size, charWidth), fits: false };
}

// ---------------------------------------------------------------------------
// The player's text slots (one place, so the renderer and the tests agree)

/** Hard floor on rendered type (design-system): nothing below 20 px at 0.9 scale. */
export const MIN_FONT = 20;

/** Question line-height keeps the ruled-line rhythm at 44 px (64 = two bands). */
export function questionLineHeight(size: number): number {
  return size >= 44 ? 64 : Math.round(size * 1.3);
}

/** Fit a quiz/flash question into its element box. */
export function fitQuestion(text: string, w: number, h: number): FitResult {
  return fitText(text, { w, h, maxSize: 44, minSize: 24, lineHeight: questionLineHeight });
}

/** Fit body text (story, captions) into its element box. */
export function fitBody(text: string, w: number, h: number): FitResult {
  return fitText(text, { w, h, maxSize: 22, minSize: MIN_FONT, lineHeight: (s) => Math.round(s * 1.5) });
}

/**
 * Fit an answer label into a tile. The label's width is the tile minus its
 * 20 px side padding, the 28 px shape and the 12 px gap; up to three lines.
 */
export function fitTileLabel(text: string, tileW: number, tileH: number): FitResult {
  return fitText(text, {
    w: Math.max(40, tileW - 40 - 28 - 12),
    h: Math.max(24, tileH - 12),
    maxSize: 32,
    minSize: MIN_FONT,
    lineHeight: (s) => Math.round(s * 1.15),
    maxLines: 3,
    charWidth: 0.56, // bold weight is a little wider
  });
}
