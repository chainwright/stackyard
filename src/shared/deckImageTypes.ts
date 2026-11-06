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

/** The domain of a source URL ("https://www.flickr.com/photos/…" → "flickr.com"). */
export function creditDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function creditLabel(img: DeckImage): string {
  return img.creditKind === "illustration" ? "Illustration" : "Image";
}

/**
 * The credit line printed ON the card: creator, licence and the source's
 * DOMAIN only. It used to print the full URL, which ran off the edge of the
 * paper (J1, round 2). Shapes:
 *   "Image: Gary Lee Todd, PDM — flickr.com"   (a found image with a source)
 *   "Illustration: Stackyard, CC0"             (our own drawing, no source)
 * The full URL is kept for the inspector — see {@link creditFull}.
 */
export function creditLine(img: DeckImage): string {
  const base = `${creditLabel(img)}: ${img.creditCreator}, ${img.creditLicense}`;
  const domain = img.creditSource ? creditDomain(img.creditSource) : "";
  return domain.length > 0 ? `${base} — ${domain}` : base;
}

/**
 * The complete credit including the full source URL — shown in the inspector
 * (and listed in the README), never printed on the card.
 */
export function creditFull(img: DeckImage): string {
  if (img.creditSource && img.creditSource.length > 0) {
    return `${creditLabel(img)}: ${img.creditCreator} — ${img.creditLicense} — ${img.creditSource}`;
  }
  return creditLine(img);
}
