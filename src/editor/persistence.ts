// src/editor/persistence.ts
// Browser-only persistence of the current stack to localStorage.
//
// REQ-MKR-14: stacks live only in the browser; nothing is sent to a server for
// storage. On load, a saved value must parse AND pass validate() before it is
// trusted; anything else is discarded silently (return null).

import { validate } from "../shared/validator.js";
import type { Stack } from "../shared/types.js";

export const STORAGE_KEY = "stackyard:maker:v1";

/** Trailing-debounce delay for save(), in milliseconds. */
export const SAVE_DEBOUNCE_MS = 300;

/**
 * A minimal localStorage-shaped interface so tests can inject a stub and the
 * module does not hard-depend on a browser global at import time.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Resolve the storage to use: an injected stub or the browser's localStorage. */
function resolveStorage(override?: StorageLike): StorageLike | null {
  if (override) return override;
  const g = globalThis as { localStorage?: StorageLike };
  return g.localStorage ?? null;
}

let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let pendingStack: Stack | null = null;
let pendingStorage: StorageLike | null = null;

function flushPending(): void {
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  if (pendingStack !== null && pendingStorage !== null) {
    pendingStorage.setItem(STORAGE_KEY, JSON.stringify(pendingStack));
  }
  pendingStack = null;
  pendingStorage = null;
}

/**
 * Save the current stack, trailing-debounced by SAVE_DEBOUNCE_MS.
 * Rapid successive calls collapse into one write of the latest stack.
 *
 * @param storage Optional storage stub (tests); defaults to window.localStorage.
 */
export function save(stack: Stack, storage?: StorageLike): void {
  const target = resolveStorage(storage);
  if (target === null) return; // no storage available (e.g. SSR) — no-op
  pendingStack = stack;
  pendingStorage = target;
  if (pendingTimer !== null) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(flushPending, SAVE_DEBOUNCE_MS);
}

/** Write any pending debounced save immediately (useful in tests / on unload). */
export function flush(): void {
  flushPending();
}

/**
 * Load the saved stack. Returns it only if it parses AND passes validate();
 * otherwise discards it (returns null) without throwing.
 */
export function load(storage?: StorageLike): Stack | null {
  const target = resolveStorage(storage);
  if (target === null) return null;

  const raw = target.getItem(STORAGE_KEY);
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null; // unparseable — discard silently
  }

  const result = validate(parsed);
  return result.valid ? result.stack : null;
}

/** Remove the saved stack (and drop any pending debounced write). */
export function clear(storage?: StorageLike): void {
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  pendingStack = null;
  pendingStorage = null;
  const target = resolveStorage(storage);
  if (target === null) return;
  target.removeItem(STORAGE_KEY);
}
