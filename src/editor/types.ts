// src/editor/types.ts
// Editor-only state types. Reuses the stack schema from src/shared/types.ts;
// defines NO new stack-schema types.

import type { Stack, ValidationResult, FallbackReason } from "../shared/types.js";

/** Which screen the Maker app is showing. */
export type Screen = "start" | "editor" | "play";

/** Transient status of an in-flight network action. */
export type Status = "idle" | "generating" | "exporting";

/**
 * Undo/redo state: whole-stack snapshots (deep copies), not diffs.
 * `past` holds snapshots taken before each committed edit (most recent last);
 * `future` holds snapshots undone and available to redo.
 */
export interface HistoryState {
  past: Stack[];
  future: Stack[];
}

/** The single source of truth for the editor. */
export interface EditorState {
  screen: Screen;
  stack: Stack | null; // current, always-valid when non-null
  selectedCardId: string | null;
  selectedElementId: string | null;
  history: HistoryState;
  lastValidation: ValidationResult;
  isFallback: boolean; // from the last generate
  /** True when the open stack is a ready-made example chosen offline for a
   *  sentence that matched no example (so the editor can say so honestly). */
  isReadyMadeExample: boolean;
  /** Why the last generate fell back to a ready-made deck (for an honest note). */
  fallbackReason?: FallbackReason;
  /** Whether the browser was online at the last generate (honest offline copy). */
  fallbackOnline: boolean;
  /**
   * A one-line plain note to show when the editor opens on a freshly built deck
   * (e.g. "No pictures were added this time. Use Add Picture." — TASK-27t, TASK-31h).
   * Cleared the next time a stack is loaded.
   */
  startNote?: string;
  status: Status;
}

/**
 * A pure edit operation: (stack, args) => Stack | Rejected.
 * Operations never mutate the input; they return a new stack or a Rejected
 * sentinel the store surfaces as a plain-language message.
 */
export type EditOperation = (stack: Stack) => Stack | Rejected;

/** Sentinel returned by an operation that refuses to apply. */
export interface Rejected {
  readonly rejected: true;
  readonly message: string;
}

/** Construct a Rejected sentinel. */
export function reject(message: string): Rejected {
  return { rejected: true, message };
}

/** Type guard for the Rejected sentinel. */
export function isRejected(value: Stack | Rejected): value is Rejected {
  return (value as Partial<Rejected>).rejected === true;
}

/** Result of store.apply / store.undo / store.redo. */
export type ApplyResult =
  | { ok: true }
  | { ok: false; message: string };
