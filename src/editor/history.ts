// src/editor/history.ts
// Undo/redo over whole-stack snapshots (deep copies), bounded by a ring.
//
// Snapshots are deep copies (structuredClone) so a later edit to the live
// stack can never mutate a stored snapshot. This makes REQ-MKR-10's
// "undo restores the exact previous stack" a simple deepEqual guarantee.

import type { Stack } from "../shared/types.js";
import type { HistoryState } from "./types.js";

/** Maximum number of undo snapshots retained. */
export const HISTORY_LIMIT = 100;

/** Create an empty history. */
export function createHistory(): HistoryState {
  return { past: [], future: [] };
}

/** Deep-copy a stack so stored snapshots are isolated from later mutation. */
function snapshot(stack: Stack): Stack {
  return structuredClone(stack);
}

/**
 * Record `prev` (the stack before an edit) onto `past` and clear `future`.
 * Trims the oldest entry when the ring exceeds HISTORY_LIMIT.
 */
export function commit(history: HistoryState, prev: Stack): void {
  history.past.push(snapshot(prev));
  if (history.past.length > HISTORY_LIMIT) {
    history.past.shift();
  }
  history.future = [];
}

/**
 * Undo one step: move `current` onto `future`, pop the newest `past` snapshot
 * and return it as the restored stack. Returns null if there is nothing to undo
 * (and leaves history unchanged).
 */
export function undo(history: HistoryState, current: Stack): Stack | null {
  const prev = history.past.pop();
  if (prev === undefined) return null;
  history.future.push(snapshot(current));
  return prev;
}

/**
 * Redo one step: move `current` onto `past`, pop the newest `future` snapshot
 * and return it as the restored stack. Returns null if there is nothing to redo.
 */
export function redo(history: HistoryState, current: Stack): Stack | null {
  const next = history.future.pop();
  if (next === undefined) return null;
  history.past.push(snapshot(current));
  return next;
}

/** True if there is at least one snapshot to undo. */
export function canUndo(history: HistoryState): boolean {
  return history.past.length > 0;
}

/** True if there is at least one snapshot to redo. */
export function canRedo(history: HistoryState): boolean {
  return history.future.length > 0;
}
