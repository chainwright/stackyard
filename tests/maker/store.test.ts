// tests/maker/store.test.ts
// Unit tests for src/editor/store.ts (TASK-05): the apply chokepoint,
// validation gating, undo, persistence, and nudge coalescing.

import { describe, it, expect, beforeEach } from "vitest";
import { EditorStore, COALESCE_WINDOW_MS } from "../../src/editor/store.js";
import { flush, type StorageLike } from "../../src/editor/persistence.js";
import type { Stack } from "../../src/shared/types.js";
import type { EditOperation } from "../../src/editor/types.js";
import { reject } from "../../src/editor/types.js";
import { quizStack } from "./fixtures.js";

/** Counting in-memory storage so we can assert how often save() wrote. */
class CountingStorage implements StorageLike {
  public writes = 0;
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.writes++;
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

/** A controllable clock. */
function fakeClock() {
  let t = 1000;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

// Operation: rename the stack title (always valid).
const setTitle =
  (title: string): EditOperation =>
  (stack): Stack => ({ ...stack, title });

// Operation: move the correct button so it drops its score (produces an
// INVALID stack — a quiz card with no correct answer).
const breakQuiz: EditOperation = (stack): Stack => ({
  ...stack,
  cards: stack.cards.map((c) =>
    c.kind !== "quiz"
      ? c
      : {
          ...c,
          elements: c.elements.map((el) =>
            el.type === "button"
              ? {
                  ...el,
                  actions: el.actions.filter(
                    (a) => !(a.type === "score" && a.delta === 1)
                  ),
                }
              : el
          ),
        }
  ),
});

// Operation that refuses via a Rejected sentinel.
const alwaysReject: EditOperation = () => reject("Nope.");

let storage: CountingStorage;

beforeEach(() => {
  storage = new CountingStorage();
  flush(); // clear any pending debounced write
});

function makeStore(clockNow?: () => number) {
  const hooks = clockNow ? { storage, now: clockNow } : { storage };
  return new EditorStore({ stack: quizStack(), screen: "editor" }, hooks);
}

describe("store.apply — validation gating", () => {
  it("commits a valid op and keeps canExport() true", () => {
    const store = makeStore();
    const res = store.apply(setTitle("New Title"));
    expect(res.ok).toBe(true);
    expect(store.getStack()!.title).toBe("New Title");
    expect(store.canExport()).toBe(true);
  });

  it("does NOT commit an op whose result is invalid; stack stays intact", () => {
    const store = makeStore();
    const before = structuredClone(store.getStack());
    const res = store.apply(breakQuiz);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message.length).toBeGreaterThan(0);
    expect(store.getStack()).toEqual(before);
    expect(store.canExport()).toBe(true); // unchanged — still valid
  });

  it("surfaces a Rejected sentinel's message without committing", () => {
    const store = makeStore();
    const before = structuredClone(store.getStack());
    const res = store.apply(alwaysReject);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toBe("Nope.");
    expect(store.getStack()).toEqual(before);
  });
});

describe("store.undo", () => {
  it("restores the previous stack after a valid op", () => {
    const store = makeStore();
    const original = structuredClone(store.getStack());
    store.apply(setTitle("Changed"));
    expect(store.getStack()!.title).toBe("Changed");
    const res = store.undo();
    expect(res.ok).toBe(true);
    expect(store.getStack()).toEqual(original);
  });
});

describe("store.apply — persistence", () => {
  it("saves exactly once per committed edit", () => {
    const store = makeStore();
    storage.writes = 0; // ignore any write from construction
    store.apply(setTitle("A"));
    flush();
    expect(storage.writes).toBe(1);
    store.apply(setTitle("B"));
    flush();
    expect(storage.writes).toBe(2);
  });

  it("does not save when an edit is rejected", () => {
    const store = makeStore();
    storage.writes = 0;
    store.apply(breakQuiz);
    flush();
    expect(storage.writes).toBe(0);
  });
});

describe("store.apply — nudge coalescing", () => {
  // Two applies with the same coalesceKey and a small gap => one undo step.
  it("coalesces two same-key edits <600ms apart into a single undo step", () => {
    const clock = fakeClock();
    const store = makeStore(clock.now);
    const original = structuredClone(store.getStack());

    store.apply(setTitle("Step 1"), { coalesceKey: "move:x" });
    clock.advance(100); // < 600ms
    store.apply(setTitle("Step 2"), { coalesceKey: "move:x" });
    expect(store.getStack()!.title).toBe("Step 2");

    // One undo returns to the pre-burst state.
    store.undo();
    expect(store.getStack()).toEqual(original);
    expect(store.canUndo()).toBe(false);
  });

  it("a >=600ms gap between same-key edits produces two undo steps", () => {
    const clock = fakeClock();
    const store = makeStore(clock.now);
    const original = structuredClone(store.getStack());

    store.apply(setTitle("Step 1"), { coalesceKey: "move:x" });
    clock.advance(COALESCE_WINDOW_MS); // >= 600ms seals the burst
    store.apply(setTitle("Step 2"), { coalesceKey: "move:x" });

    store.undo(); // -> "Step 1"
    expect(store.getStack()!.title).toBe("Step 1");
    store.undo(); // -> original
    expect(store.getStack()).toEqual(original);
  });

  it("an intervening different-key edit produces two undo steps", () => {
    const clock = fakeClock();
    const store = makeStore(clock.now);
    const original = structuredClone(store.getStack());

    store.apply(setTitle("Step 1"), { coalesceKey: "move:x" });
    clock.advance(50);
    store.apply(setTitle("Step 2"), { coalesceKey: "move:y" }); // different key
    clock.advance(50);

    store.undo(); // -> "Step 1"
    expect(store.getStack()!.title).toBe("Step 1");
    store.undo(); // -> original
    expect(store.getStack()).toEqual(original);
  });
});
