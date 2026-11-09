// src/shared/pictogramCredit.ts
// The credit line a pictogram carries (TASK-31h), in its own tiny module so the
// player and the editor can recognise it without bundling the pictogram drawings
// (src/shared/pictograms.ts holds those and re-exports this).

/** The credit line printed on a card that carries a pictogram. */
export const PICTOGRAM_CREDIT = "Picture: Stackyard pictogram";

/** True when a text element's content is the pictogram credit line. */
export function isPictogramCredit(content: string): boolean {
  return content.trim() === PICTOGRAM_CREDIT;
}
