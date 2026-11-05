// src/shared/deckImageTypes.ts
// The shape of a per-deck public-domain image + credit (TASK-23 d).

export interface DeckImage {
  /** The image as a self-contained data: URI (inlined, offline-safe). */
  dataUri: string;
  /** Licence for the credit line, e.g. "CC0 (public domain)". */
  creditLicense: string;
  /** Creator for the credit line. */
  creditCreator: string;
  /**
   * How to label the image (TASK-25 b): a found photo/image reads "Image:",
   * our own drawing reads "Illustration:". Defaults to "image".
   */
  creditKind?: "image" | "illustration";
  /**
   * Source page URL for the credit line — ONLY for an image that really came
   * from a source (e.g. an Openverse pick set by scripts/pick-deck-images.ts).
   * Omit it for an image we drew ourselves; the credit then names no source we
   * can't stand behind (TASK-25 b). A credit that names Openverse MUST carry a
   * real Openverse source URL (enforced by scripts/check-decks.ts).
   */
  creditSource?: string;
}

/**
 * A one-line credit string from a DeckImage, for display on the card.
 * Shapes: "Image: Creator — Licence — Source" (a found image with a source) or
 * "Illustration: Creator, Licence" (our own drawing, no source URL).
 */
export function creditLine(img: DeckImage): string {
  const label = img.creditKind === "illustration" ? "Illustration" : "Image";
  if (img.creditSource && img.creditSource.length > 0) {
    return `${label}: ${img.creditCreator} — ${img.creditLicense} — ${img.creditSource}`;
  }
  return `${label}: ${img.creditCreator}, ${img.creditLicense}`;
}
