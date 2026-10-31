// tests/runtime.test.ts
// Unit tests for src/player/runtime.ts (TASK-05).
// Covers: createRuntime(), dispatch() for all four action types,
// goto-terminates-early behaviour, and score accumulation.

import { describe, it, expect, vi } from "vitest";
import { createRuntime, dispatch } from "../src/player/runtime.js";
import type { RuntimeState } from "../src/player/runtime.js";
import type { Stack, Action, Card } from "../src/shared/types.js";

// ---------------------------------------------------------------------------
// Test helpers

/** Minimal valid UUIDs for deterministic tests. */
const IDS = {
  stack:  "10000000-0000-4000-8000-000000000001",
  card1:  "20000000-0000-4000-8000-000000000002",
  card2:  "30000000-0000-4000-8000-000000000003",
  card3:  "40000000-0000-4000-8000-000000000004",
  end:    "50000000-0000-4000-8000-000000000005",
  field:  "60000000-0000-4000-8000-000000000006",
} as const;

function makeCard(id: string, kind: Card["kind"] = "story"): Card {
  return {
    id,
    kind,
    elements: [],
    actions: [],
  };
}

function makeStack(cards: Card[]): Stack {
  return {
    id: IDS.stack,
    title: "Test stack",
    theme: { background: "#fff", foreground: "#000", font: "sans-serif" },
    cards,
  };
}

/** Returns a fresh RuntimeState with two story cards and one end card. */
function freshState(): RuntimeState {
  const stack = makeStack([
    makeCard(IDS.card1, "story"),
    makeCard(IDS.card2, "story"),
    makeCard(IDS.end, "end"),
  ]);
  return createRuntime(stack);
}

// ---------------------------------------------------------------------------
// createRuntime()

describe("createRuntime()", () => {
  it("sets currentCardId to the first card's id", () => {
    const state = freshState();
    expect(state.currentCardId).toBe(IDS.card1);
  });

  it("initialises variables with score: 0", () => {
    const state = freshState();
    expect(state.variables["score"]).toBe(0);
  });

  it("stores a reference to the stack", () => {
    const stack = makeStack([makeCard(IDS.card1, "story"), makeCard(IDS.end, "end")]);
    const state = createRuntime(stack);
    expect(state.stack).toBe(stack);
  });

  it("variables object starts with only the score key", () => {
    const state = freshState();
    expect(Object.keys(state.variables)).toEqual(["score"]);
  });
});

// ---------------------------------------------------------------------------
// dispatch() — goto action

describe("dispatch(): goto action", () => {
  it("calls navigate with the target card id", () => {
    const state = freshState();
    const navigate = vi.fn();
    const actions: Action[] = [{ type: "goto", cardId: IDS.card2 }];
    dispatch(actions, state, navigate);
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(IDS.card2);
  });

  it("stops processing further actions after a goto", () => {
    const state = freshState();
    const navigate = vi.fn();
    const actions: Action[] = [
      { type: "goto", cardId: IDS.card2 },
      { type: "score", delta: 99 },    // must NOT run
      { type: "set", variable: "x", value: "never" }, // must NOT run
    ];
    dispatch(actions, state, navigate);
    // score must still be 0 (not 99)
    expect(state.variables["score"]).toBe(0);
    // x must not have been set
    expect(state.variables["x"]).toBeUndefined();
    // navigate was called exactly once
    expect(navigate).toHaveBeenCalledOnce();
  });

  it("does not call navigate when there is no goto action", () => {
    const state = freshState();
    const navigate = vi.fn();
    const actions: Action[] = [
      { type: "score", delta: 1 },
      { type: "set", variable: "y", value: "hello" },
    ];
    dispatch(actions, state, navigate);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("only the first goto fires (goto stops all further processing)", () => {
    const state = freshState();
    const navigate = vi.fn();
    const actions: Action[] = [
      { type: "goto", cardId: IDS.card2 },
      { type: "goto", cardId: IDS.end },  // second goto must never fire
    ];
    dispatch(actions, state, navigate);
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(IDS.card2);
  });
});

// ---------------------------------------------------------------------------
// dispatch() — score action

describe("dispatch(): score action", () => {
  it("adds delta to variables.score", () => {
    const state = freshState();
    dispatch([{ type: "score", delta: 1 }], state, vi.fn());
    expect(state.variables["score"]).toBe(1);
  });

  it("subtracts when delta is negative", () => {
    const state = freshState();
    state.variables["score"] = 5;
    dispatch([{ type: "score", delta: -2 }], state, vi.fn());
    expect(state.variables["score"]).toBe(3);
  });

  it("accumulates score across multiple dispatches", () => {
    const state = freshState();
    dispatch([{ type: "score", delta: 1 }], state, vi.fn());
    dispatch([{ type: "score", delta: 1 }], state, vi.fn());
    dispatch([{ type: "score", delta: 1 }], state, vi.fn());
    expect(state.variables["score"]).toBe(3);
  });

  it("handles zero delta", () => {
    const state = freshState();
    dispatch([{ type: "score", delta: 0 }], state, vi.fn());
    expect(state.variables["score"]).toBe(0);
  });

  it("accumulates multiple score actions within one dispatch call", () => {
    const state = freshState();
    const actions: Action[] = [
      { type: "score", delta: 2 },
      { type: "score", delta: 3 },
    ];
    dispatch(actions, state, vi.fn());
    expect(state.variables["score"]).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// dispatch() — set action

describe("dispatch(): set action", () => {
  it("assigns a string value to a variable", () => {
    const state = freshState();
    dispatch(
      [{ type: "set", variable: "name", value: "Aoife" }],
      state,
      vi.fn(),
    );
    expect(state.variables["name"]).toBe("Aoife");
  });

  it("assigns a number value to a variable", () => {
    const state = freshState();
    dispatch(
      [{ type: "set", variable: "level", value: 3 }],
      state,
      vi.fn(),
    );
    expect(state.variables["level"]).toBe(3);
  });

  it("overwrites an existing variable", () => {
    const state = freshState();
    state.variables["colour"] = "red";
    dispatch(
      [{ type: "set", variable: "colour", value: "blue" }],
      state,
      vi.fn(),
    );
    expect(state.variables["colour"]).toBe("blue");
  });

  it("can set multiple variables in sequence", () => {
    const state = freshState();
    const actions: Action[] = [
      { type: "set", variable: "a", value: 1 },
      { type: "set", variable: "b", value: "two" },
    ];
    dispatch(actions, state, vi.fn());
    expect(state.variables["a"]).toBe(1);
    expect(state.variables["b"]).toBe("two");
  });
});

// ---------------------------------------------------------------------------
// dispatch() — sound action

describe("dispatch(): sound action", () => {
  it("calls playSound with 'cheer'", () => {
    const state = freshState();
    const playSound = vi.fn();
    dispatch(
      [{ type: "sound", sound: "cheer" }],
      state,
      vi.fn(),
      playSound,
    );
    expect(playSound).toHaveBeenCalledOnce();
    expect(playSound).toHaveBeenCalledWith("cheer");
  });

  it("calls playSound with 'buzz'", () => {
    const state = freshState();
    const playSound = vi.fn();
    dispatch(
      [{ type: "sound", sound: "buzz" }],
      state,
      vi.fn(),
      playSound,
    );
    expect(playSound).toHaveBeenCalledOnce();
    expect(playSound).toHaveBeenCalledWith("buzz");
  });

  it("uses no-op when playSound is omitted", () => {
    // Should not throw when the optional playSound argument is absent.
    const state = freshState();
    expect(() =>
      dispatch([{ type: "sound", sound: "cheer" }], state, vi.fn()),
    ).not.toThrow();
  });

  it("does not call navigate for a sound action", () => {
    const state = freshState();
    const navigate = vi.fn();
    dispatch([{ type: "sound", sound: "buzz" }], state, navigate);
    expect(navigate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Mixed action sequences

describe("dispatch(): mixed action sequences", () => {
  it("processes score then set then sound before a goto", () => {
    const state = freshState();
    const navigate = vi.fn();
    const playSound = vi.fn();
    const actions: Action[] = [
      { type: "score", delta: 1 },
      { type: "set", variable: "answered", value: "yes" },
      { type: "sound", sound: "cheer" },
      { type: "goto", cardId: IDS.end },
    ];
    dispatch(actions, state, navigate, playSound);

    expect(state.variables["score"]).toBe(1);
    expect(state.variables["answered"]).toBe("yes");
    expect(playSound).toHaveBeenCalledWith("cheer");
    expect(navigate).toHaveBeenCalledWith(IDS.end);
  });

  it("actions after goto are not executed", () => {
    const state = freshState();
    const navigate = vi.fn();
    const playSound = vi.fn();
    const actions: Action[] = [
      { type: "goto", cardId: IDS.card2 },
      { type: "score", delta: 10 },    // skipped
      { type: "sound", sound: "cheer" }, // skipped
    ];
    dispatch(actions, state, navigate, playSound);

    expect(state.variables["score"]).toBe(0); // not 10
    expect(playSound).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledOnce();
  });

  it("an empty action list is a no-op", () => {
    const state = freshState();
    const navigate = vi.fn();
    dispatch([], state, navigate);
    expect(navigate).not.toHaveBeenCalled();
    expect(state.variables["score"]).toBe(0);
  });
});
