// src/living/boot.ts
// Start-up for the living file (TASK-26a). Kept separate from index.ts so the
// REAL boot path can be driven in a test (index.ts registers a DOMContentLoaded
// listener the moment it is imported).
//
// The order matters and is the whole point of this file:
//   1. snapshot the pristine document — BEFORE the player, the Teacher tab, the
//      injected styles or the editor overlay exist;
//   2. read and validate the embedded stack;
//   3. mount the app, handing it that snapshot for Save a Copy.

import { validate } from "../shared/validator.js";
import { showFatalError } from "../player/errors.js";
import { mountLivingApp } from "./livingApp.js";
import { snapshotPristine } from "./pristine.js";

export { snapshotPristine };

/**
 * Boot the living file in `doc`. Returns the app's teardown (tests use it; the
 * real file never tears down), or null if there was nothing to boot.
 */
export function bootLivingFile(doc: Document = document): (() => void) | null {
  const root = doc.getElementById("player-root");
  if (!root) return null;

  // 1. Snapshot FIRST. Everything after this mutates the DOM.
  const pristineHtml = snapshotPristine(doc);

  try {
    const dataEl = doc.getElementById("stack-data");
    if (!dataEl) {
      showFatalError(root);
      return null;
    }
    const parsed: unknown = JSON.parse(dataEl.textContent ?? "");
    const result = validate(parsed as Parameters<typeof validate>[0]);
    if (!result.valid) {
      showFatalError(root);
      return null;
    }
    return mountLivingApp(result.stack, root, { pristineHtml });
  } catch {
    showFatalError(root);
    return null;
  }
}
