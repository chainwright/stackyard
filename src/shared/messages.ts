// src/shared/messages.ts
// Shared plain-language helpers used by both the server export route and the
// Maker editor store. Keeping them here means the server and the browser agree
// on the wording and on the exported file name.
//
// All wording follows audience.md: one sentence saying what happened, one
// saying what to do next; Irish/UK English; never a raw error code, stack
// trace, or the word "stack".

/**
 * Map a validator error code to a plain-language sentence for the teacher.
 * Codes come from src/shared/validator.ts. Any unrecognised or internal code
 * falls back to a gentle "undo your last change" message — never the raw code.
 */
export function plainMessageFrom(errors: string[]): string {
  // Prefer the first error we have a friendly message for.
  for (const code of errors) {
    const message = MESSAGE_BY_CODE[code];
    if (message !== undefined) return message;
  }
  return FALLBACK_MESSAGE;
}

const MESSAGE_BY_CODE: Record<string, string> = {
  "quiz-answer":
    "This question needs exactly one right answer. Pick the correct tile.",
  "invalid-goto":
    "A button points to a card that isn't here any more. Choose a card for it.",
  "end-card-count": "A set of cards needs exactly one last card.",
  "no-content-cards": "You need at least one card before the last one.",
  "canvas-bounds": "Something is off the edge of the card. Move it back on.",
  "blank-title": "Give your set of cards a name.",
  "too-many-cards":
    "This set has too many cards to export. Remove a few and try again.",
  "text-too-long":
    "Some text on a card is too long to export. Shorten it and try again.",
  "missing-asset":
    "A picture on a card couldn't be found. Add the picture again, then export.",
  "path-traversal":
    "A picture on a card couldn't be read. Add the picture again, then export.",
};

const FALLBACK_MESSAGE =
  "Something went wrong with this card. Please undo your last change.";

/**
 * Reduce a title to a safe file name: letters, digits, and hyphens only.
 * Runs of unsafe characters collapse to a single hyphen; leading/trailing
 * hyphens are trimmed; the result gets a `.html` suffix. If nothing safe
 * remains, falls back to `lesson.html`.
 *
 * The server (Content-Disposition) and the browser download use this same
 * rule, so the two always agree.
 */
export function safeFileName(title: string): string {
  const base = title
    .replace(/[^A-Za-z0-9]+/g, "-") // unsafe runs → single hyphen
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
  return base.length > 0 ? `${base}.html` : "lesson.html";
}

/**
 * The file name for a Save-a-Copy of the living file: "<title> (copy).html".
 * A copy must never take the original's name — on a real laptop the browser
 * would call it "…(1).html" and the teacher could not tell which file is new
 * (J2 step 17). Built from safeFileName so it follows the same safe-character
 * rule as every other export.
 */
export function copyFileName(title: string): string {
  const base = safeFileName(title).replace(/\.html$/, "");
  return `${base} (copy).html`;
}
