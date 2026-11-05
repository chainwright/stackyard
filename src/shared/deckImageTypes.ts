// src/shared/deckImageTypes.ts
// The shape of a per-deck public-domain image + credit (TASK-23 d).

export interface DeckImage {
  /** The image as a self-contained data: URI (inlined, offline-safe). */
  dataUri: string;
  /** Licence for the credit line, e.g. "CC0 (public domain)". */
  creditLicense: string;
  /** Creator for the credit line. */
  creditCreator: string;
  /** Source page URL for the credit line. */
  creditSource: string;
}

/** A one-line credit string from a DeckImage, for display on the card. */
export function creditLine(img: DeckImage): string {
  return `Image: ${img.creditCreator} — ${img.creditLicense} — ${img.creditSource}`;
}
