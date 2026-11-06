// src/living/pristine.ts
// The pristine snapshot (TASK-26a): the living file's HTML exactly as it was
// before anything mounted. Every Save a Copy is built from this string, never
// from the live DOM. Guarded by scripts/check-living-file.ts (the
// living-file-gate hook).

/** The file's HTML as it is right now. Call this BEFORE anything mounts. */
export function snapshotPristine(doc: Document = document): string {
  return "<!doctype html>\n" + doc.documentElement.outerHTML;
}
