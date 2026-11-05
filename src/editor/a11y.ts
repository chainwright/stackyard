// src/editor/a11y.ts
// Shared accessibility helpers for the Maker app:
//   - one visually-hidden aria-live="polite" region that store.apply and the
//     screens announce through (REQ-MKR-15, design §Accessibility)
//   - the shared focus-ring rule lives in styles.css (:focus-visible)
//
// The announcer is a module singleton so every part of the app speaks through
// the same region; tests can read its text to assert a plain-language message.

let liveRegion: HTMLElement | null = null;

/** Create (once) and return the shared visually-hidden aria-live region. */
export function ensureAnnouncer(doc: Document = document): HTMLElement {
  if (liveRegion && liveRegion.isConnected) return liveRegion;
  const el = doc.createElement("div");
  el.setAttribute("aria-live", "polite");
  el.setAttribute("aria-atomic", "true");
  el.className = "sr-only";
  el.dataset["announcer"] = "maker";
  doc.body.appendChild(el);
  liveRegion = el;
  return el;
}

/** Announce a plain-language message in the shared aria-live region. */
export function announce(message: string): void {
  const el = ensureAnnouncer();
  // Clear first so repeated identical messages are still spoken.
  el.textContent = "";
  el.textContent = message;
}

/** Test-only reset of the singleton. */
export function _resetAnnouncer(): void {
  liveRegion = null;
}
