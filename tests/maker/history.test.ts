// tests/maker/history.test.ts
// Unit tests for src/editor/history.ts (TASK-03).

import { describe, it, expect } from "vitest";
import {
  createHistory,
  commit,
  undo,
  redo,
  canUndo,
  canRedo,
  HISTORY_LIMIT,
} from "../../src/editor/history.js";
import type { Stack } from "../../src/shared/types.js";
import { quizStack } from "./fixtures.js";

/** Return a clone of quizStack with a changed title (a distinct "state"). */
function withTitle(title: string): Stack {
  const s = quizStack();
  s.title = title;
  return s;
}

describe("history: commit / undo / redo", () => {
  it("commit then undo returns the committed snapshot", () => {
    const h = createHistory();
    const v1 = withTitle("One");
    const v2 = withTitle("Two");

    commit(h, v1); // record v1 as the pre-edit state
    const restored = undo(h, v2); // current is v2, undo should give v1
    expect(restored).not.toBeNull();
    expect(restored!.title).toBe("One");
    expect(restored).toEqual(v1);
  });

  it("redo re-applies the undone state", () => {
    const h = createHistory();
    const v1 = withTitle("One");
    const v2 = withTitle("Two");

    commit(h, v1);
    const afterUndo = undo(h, v2); // -> v1 ; future now holds v2
    expect(afterUndo!.title).toBe("One");

    const afterRedo = redo(h, afterUndo!); // current v1, redo -> v2
    expect(afterRedo).not.toBeNull();
    expect(afterRedo!.title).toBe("Two");
    expect(afterRedo).toEqual(v2);
  });

  it("a new commit after undo clears future", () => {
    const h = createHistory();
    commit(h, withTitle("One"));
    undo(h, withTitle("Two")); // future = [v2]
    expect(canRedo(h)).toBe(true);

    commit(h, withTitle("Three")); // new edit clears future
    expect(canRedo(h)).toBe(false);
    expect(h.future.length).toBe(0);
  });

  it("canUndo / canRedo reflect emptiness", () => {
    const h = createHistory();
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);

    commit(h, withTitle("One"));
    expect(canUndo(h)).toBe(true);

    undo(h, withTitle("Two"));
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(true);
  });

  it("undo / redo return null when there is nothing to do", () => {
    const h = createHistory();
    expect(undo(h, withTitle("x"))).toBeNull();
    expect(redo(h, withTitle("x"))).toBeNull();
  });

  it("a stored snapshot is not mutated when the live stack is later changed", () => {
    const h = createHistory();
    const live = withTitle("Original");
    commit(h, live);

    // Mutate the live stack after committing.
    live.title = "Mutated";
    live.cards[0]!.id = "deadbeef-0000-4000-8000-000000000000";

    const restored = undo(h, withTitle("Current"));
    expect(restored!.title).toBe("Original");
    expect(restored!.cards[0]!.id).toBe("20000000-0000-4000-8000-000000000002");
  });

  it("the ring is bounded to HISTORY_LIMIT entries", () => {
    const h = createHistory();
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) {
      commit(h, withTitle(`v${i}`));
    }
    expect(h.past.length).toBe(HISTORY_LIMIT);
    // Oldest entries were trimmed; the newest commit is still present.
    expect(h.past[h.past.length - 1]!.title).toBe(`v${HISTORY_LIMIT + 9}`);
  });
});
