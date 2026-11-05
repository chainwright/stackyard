// src/editor/store.ts
// EditorStore — the single mutation chokepoint for the Maker editor.
//
// REQ-MKR-09 ("never a dead export") is only trustworthy because EVERY stack
// mutation flows through store.apply, which validates before committing. One
// chokepoint also gives one place for history, persistence, and aria-live
// announcements.

import { validate } from "../shared/validator.js";
import { plainMessageFrom, safeFileName } from "../shared/messages.js";
import type { Stack, ValidationResult } from "../shared/types.js";
import {
  createHistory,
  commit as historyCommit,
  undo as historyUndo,
  redo as historyRedo,
  canUndo as historyCanUndo,
  canRedo as historyCanRedo,
} from "./history.js";
import * as persistence from "./persistence.js";
import { isRejected } from "./types.js";
import type {
  ApplyResult,
  EditOperation,
  EditorState,
  HistoryState,
} from "./types.js";

/** Window within which same-key edits coalesce into one undo step. */
export const COALESCE_WINDOW_MS = 600;

/** Optional hooks a host (tests, UI) can supply to the store. */
export interface StoreHooks {
  /** Called after any state change so a UI can re-render. */
  onChange?: () => void;
  /** Called with a plain-language message to announce (aria-live). */
  announce?: (message: string) => void;
  /** Monotonic clock in ms; injectable for deterministic coalescing tests. */
  now?: () => number;
  /** Persistence storage override (tests); defaults to window.localStorage. */
  storage?: persistence.StorageLike;
}

interface CommitMarker {
  coalesceKey: string | undefined;
  at: number;
  sealed: boolean;
}

export class EditorStore {
  private state: EditorState;
  private readonly hooks: StoreHooks;
  private lastCommit: CommitMarker | null = null;

  constructor(initial?: Partial<EditorState>, hooks: StoreHooks = {}) {
    this.hooks = hooks;
    const stack = initial?.stack ?? null;
    const history: HistoryState = initial?.history ?? createHistory();
    const lastValidation: ValidationResult =
      stack !== null ? validate(stack) : { valid: false, errors: [] };
    this.state = {
      screen: initial?.screen ?? (stack !== null ? "editor" : "start"),
      stack,
      selectedCardId:
        initial?.selectedCardId ?? stack?.cards[0]?.id ?? null,
      selectedElementId: initial?.selectedElementId ?? null,
      history,
      lastValidation,
      isFallback: initial?.isFallback ?? false,
      isReadyMadeExample: initial?.isReadyMadeExample ?? false,
      status: initial?.status ?? "idle",
    };
  }

  // -------------------------------------------------------------------------
  // Read access

  getState(): Readonly<EditorState> {
    return this.state;
  }

  getStack(): Stack | null {
    return this.state.stack;
  }

  canUndo(): boolean {
    return historyCanUndo(this.state.history);
  }

  canRedo(): boolean {
    return historyCanRedo(this.state.history);
  }

  /** Export is enabled iff the current stack is valid. */
  canExport(): boolean {
    return this.state.lastValidation.valid;
  }

  // -------------------------------------------------------------------------
  // Mutation chokepoint

  /**
   * Apply a pure operation. Validates the result; commits to history and
   * persists only on success. Coalesces a burst of same-`coalesceKey` edits
   * (gaps < COALESCE_WINDOW_MS) into a single undo step.
   */
  apply(op: EditOperation, opts?: { coalesceKey?: string }): ApplyResult {
    const current = this.state.stack;
    if (current === null) {
      return this.fail("There's nothing to edit yet.");
    }

    const next = op(current);

    if (isRejected(next)) {
      return this.fail(next.message);
    }

    const result = validate(next);
    if (!result.valid) {
      // The op had a bug or produced an un-repairable combination.
      return this.fail(plainMessageFrom(result.errors));
    }

    const now = this.clock();
    const coalesceKey = opts?.coalesceKey;
    const shouldCoalesce =
      coalesceKey !== undefined &&
      this.lastCommit !== null &&
      !this.lastCommit.sealed &&
      this.lastCommit.coalesceKey === coalesceKey &&
      now - this.lastCommit.at < COALESCE_WINDOW_MS;

    if (shouldCoalesce) {
      // Replace the live stack in place; keep the pre-burst snapshot in `past`.
      // (No new history.commit — the pre-burst entry already there is the one
      // a single undo should restore.)
    } else {
      historyCommit(this.state.history, current);
    }

    this.lastCommit = { coalesceKey, at: now, sealed: false };
    this.state.stack = next;
    this.state.lastValidation = result;
    persistence.save(next, this.hooks.storage);
    this.changed();
    this.announce(successMessage(op, coalesceKey));
    return { ok: true };
  }

  /** Undo one edit (or one coalesced burst). */
  undo(): ApplyResult {
    const current = this.state.stack;
    if (current === null) return this.fail("There's nothing to undo.");
    const restored = historyUndo(this.state.history, current);
    if (restored === null) return this.fail("There's nothing to undo.");
    this.lastCommit = null; // break any live coalescing burst
    this.state.stack = restored;
    this.state.lastValidation = validate(restored);
    this.ensureSelection();
    persistence.save(restored, this.hooks.storage);
    this.changed();
    this.announce("Undone.");
    return { ok: true };
  }

  /** Redo the most recently undone edit. */
  redo(): ApplyResult {
    const current = this.state.stack;
    if (current === null) return this.fail("There's nothing to redo.");
    const restored = historyRedo(this.state.history, current);
    if (restored === null) return this.fail("There's nothing to redo.");
    this.lastCommit = null;
    this.state.stack = restored;
    this.state.lastValidation = validate(restored);
    this.ensureSelection();
    persistence.save(restored, this.hooks.storage);
    this.changed();
    this.announce("Redone.");
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Stack / screen setters used by generate + play

  /** Load a freshly generated (or restored) stack. Resets history. */
  setStack(stack: Stack, opts?: { isFallback?: boolean; isReadyMadeExample?: boolean }): void {
    this.state.stack = stack;
    this.state.history = createHistory();
    this.lastCommit = null;
    this.state.selectedCardId = stack.cards[0]?.id ?? null;
    this.state.selectedElementId = null;
    this.state.lastValidation = validate(stack);
    this.state.isFallback = opts?.isFallback ?? false;
    this.state.isReadyMadeExample = opts?.isReadyMadeExample ?? false;
    this.state.screen = "editor";
    persistence.save(stack, this.hooks.storage);
    this.changed();
  }

  setScreen(screen: EditorState["screen"]): void {
    this.state.screen = screen;
    this.changed();
  }

  setSelectedCard(cardId: string | null): void {
    this.state.selectedCardId = cardId;
    this.state.selectedElementId = null;
    // A selection change ends any active coalescing burst.
    if (this.lastCommit) this.lastCommit.sealed = true;
    this.changed();
  }

  setSelectedElement(elementId: string | null): void {
    this.state.selectedElementId = elementId;
    if (this.lastCommit) this.lastCommit.sealed = true;
    this.changed();
  }

  setStatus(status: EditorState["status"]): void {
    this.state.status = status;
    this.changed();
  }

  // -------------------------------------------------------------------------
  // Shared helpers (also exported standalone for the export route / download)

  plainMessageFrom = plainMessageFrom;
  safeFileName = safeFileName;

  // -------------------------------------------------------------------------
  // Internals

  private clock(): number {
    return this.hooks.now ? this.hooks.now() : Date.now();
  }

  private fail(message: string): ApplyResult {
    this.announce(message);
    return { ok: false, message };
  }

  private announce(message: string): void {
    this.hooks.announce?.(message);
  }

  private changed(): void {
    this.hooks.onChange?.();
  }

  /** Keep a valid selection after undo/redo changes the card set. */
  private ensureSelection(): void {
    const stack = this.state.stack;
    if (stack === null) return;
    const stillThere = stack.cards.some(
      (c) => c.id === this.state.selectedCardId
    );
    if (!stillThere) {
      this.state.selectedCardId = stack.cards[0]?.id ?? null;
      this.state.selectedElementId = null;
    }
  }
}

/** A plain-language success line for an applied operation. */
function successMessage(_op: EditOperation, coalesceKey: string | undefined): string {
  if (coalesceKey?.startsWith("move:")) return "Moved.";
  return "Saved.";
}

// Re-export the shared helpers so callers that only need the helpers can import
// them from the store module too.
export { plainMessageFrom, safeFileName };
