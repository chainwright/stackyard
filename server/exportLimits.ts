// server/exportLimits.ts
// Export-path resource caps.
//
// stack-format.md's nine invariants (enforced by src/shared/validator.ts) do
// NOT bound the number of cards or the length of text fields: a stack that
// passes validate() can still carry thousands of cards or megabytes of text in
// a single element. On the export path that becomes a denial-of-service lever,
// so we cap both here before handing the stack to exportStack().
//
// These caps complement (not replace) the 8 MB request-body limit on
// /api/export: the body limit stops a giant HTTP payload; these caps stop a
// body that is small as JSON but expensive to render (many cards, huge strings)
// or that slips in via a path other than a single oversized request.

import type { Stack } from "../src/shared/types.js";

/** Maximum number of cards a stack may contain to be exported. */
export const MAX_CARDS = 200;

/**
 * Maximum length (in characters) of any single user-authored text field:
 * a text element's `content`, a button's `label`, an image's `alt`, or a
 * field's `variable`. Generous for lesson content, far below anything that
 * would stall the renderer.
 */
export const MAX_TEXT_LENGTH = 10_000;

/**
 * Check a stack against the export resource caps.
 *
 * Returns an array of machine-readable error codes (empty when the stack is
 * within every cap). Codes map to plain-language messages via
 * src/shared/messages.ts.
 */
export function checkExportLimits(stack: Stack): string[] {
  const errors: string[] = [];

  if (!Array.isArray(stack.cards)) {
    // Not a well-formed cards array — nothing to cap here; the exporter's
    // validate() reports the real shape error as a clean 422 (J4 L1).
    return errors;
  }

  if (stack.cards.length > MAX_CARDS) {
    errors.push("too-many-cards");
  }

  let textTooLong = false;
  for (const rawCard of stack.cards as unknown[]) {
    // The input may be malformed (e.g. a null card or a card without an
    // `elements` array). The caps run BEFORE the exporter's validate(), so be
    // defensive: skip anything that isn't a well-formed card+elements, and let
    // exportStack()'s validate() report the real shape error instead of this
    // loop throwing a 500 (J4 L1).
    if (rawCard === null || typeof rawCard !== "object") continue;
    const elements = (rawCard as { elements?: unknown }).elements;
    if (!Array.isArray(elements)) continue;
    for (const rawEl of elements as unknown[]) {
      if (rawEl === null || typeof rawEl !== "object") continue;
      const el = rawEl as Record<string, unknown>;
      if (el["type"] === "text" && typeof el["content"] === "string" && el["content"].length > MAX_TEXT_LENGTH) {
        textTooLong = true;
      } else if (el["type"] === "button" && typeof el["label"] === "string" && el["label"].length > MAX_TEXT_LENGTH) {
        textTooLong = true;
      } else if (el["type"] === "image" && typeof el["alt"] === "string" && el["alt"].length > MAX_TEXT_LENGTH) {
        textTooLong = true;
      } else if (el["type"] === "field" && typeof el["variable"] === "string" && el["variable"].length > MAX_TEXT_LENGTH) {
        textTooLong = true;
      }
      if (textTooLong) break;
    }
    if (textTooLong) break;
  }
  if (textTooLong) errors.push("text-too-long");

  return errors;
}
