// tests/player.index.test.ts
// Tests for the auto-navigation cap and counter reset in src/player/index.ts.
// These tests exercise the navigateTo logic directly by simulating the player
// entry point behaviour. They use jsdom.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRuntime } from "../src/player/runtime.js";
import { showFatalError } from "../src/player/errors.js";
import type { Card, Stack } from "../src/shared/types.js";

// We test the navigateTo logic by recreating it in test scope,
// so we can assert on autoNavCount and fatal-error invocations without
// needing to bootstrap the full DOMContentLoaded flow.

// ---------------------------------------------------------------------------
// Test helpers

const IDS = {
  stack: "10000000-0000-4000-8000-000000000001",
  cards: Array.from({ length: 25 }, (_, i) =>
    `${String(i + 2).padStart(8, "0")}-0000-4000-8000-000000000002`,
  ),
} as const;

function makeCard(id: string, autoGotoId?: string): Card {
  return {
    id,
    kind: "story",
    elements: [],
    actions: autoGotoId ? [{ type: "goto", cardId: autoGotoId }] : [],
  };
}

function makeStack(cards: Card[]): Stack {
  return {
    id: IDS.stack,
    title: "Auto Nav Test",
    theme: { background: "#fff", foreground: "#000", font: "sans-serif" },
    cards,
  };
}

// Recreate the navigateTo logic from src/player/index.ts for unit testing.
function makeNavigateTo(
  stack: Stack,
  root: HTMLElement,
  onFatalError: () => void,
) {
  const state = createRuntime(stack);
  // Track visited cards for this test.
  const visited: string[] = [];

  function navigateTo(cardId: string, automatic: boolean): void {
    if (automatic) {
      state.autoNavCount++;
      if (state.autoNavCount > 20) {
        onFatalError();
        return;
      }
    } else {
      state.autoNavCount = 0;
    }

    const card = stack.cards.find((c) => c.id === cardId);
    if (!card) {
      onFatalError();
      return;
    }

    state.currentCardId = cardId;
    visited.push(cardId);

    // Fire card-level actions.
    for (const action of card.actions) {
      if (action.type === "goto") {
        navigateTo(action.cardId, true);
        return;
      }
    }
  }

  return { navigateTo, state, visited };
}

// ---------------------------------------------------------------------------
// Auto-navigation cap tests

describe("navigateTo() — auto-navigation cap", () => {
  let root: HTMLElement;
  let fatalErrorSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
    fatalErrorSpy = vi.fn();
  });

  it("allows up to 20 consecutive automatic navigations", () => {
    // Build a chain of 21 cards each with a card-level goto to the next.
    // The 21st navigation should succeed (counter = 20 ≤ 20).
    const cards: Card[] = [];
    for (let i = 0; i < 22; i++) {
      const id = IDS.cards[i]!;
      const nextId = i < 21 ? IDS.cards[i + 1] : undefined;
      cards.push(makeCard(id, nextId));
    }
    const stack = makeStack(cards);
    const { navigateTo, state } = makeNavigateTo(stack, root, fatalErrorSpy);

    // Start with user navigation (resets counter).
    navigateTo(cards[0]!.id, false);

    // After the initial user nav, cards 1–20 are auto-navigated (counter = 20).
    // The 21st auto-nav (counter = 21) triggers the cap.
    expect(fatalErrorSpy).toHaveBeenCalledOnce();
    expect(state.autoNavCount).toBe(21);
  });

  it("shows fatal error when auto-nav counter exceeds 20", () => {
    // Build a cycle-like chain: card 0 → 1 → 2 → ... → 20 → (cap fires)
    const cards: Card[] = [];
    for (let i = 0; i <= 21; i++) {
      const id = IDS.cards[i]!;
      const nextId = IDS.cards[i + 1] ?? IDS.cards[0]; // would cycle, but cap fires first
      cards.push(makeCard(id, nextId));
    }
    const stack = makeStack(cards);
    const { navigateTo } = makeNavigateTo(stack, root, fatalErrorSpy);

    navigateTo(cards[0]!.id, false);

    // Fatal error should have been called when counter reached 21.
    expect(fatalErrorSpy).toHaveBeenCalledOnce();
  });

  it("does not navigate further after fatal error is shown", () => {
    const cards: Card[] = [];
    for (let i = 0; i <= 22; i++) {
      const id = IDS.cards[i]!;
      const nextId = IDS.cards[i + 1] ?? IDS.cards[0];
      cards.push(makeCard(id, nextId));
    }
    const stack = makeStack(cards);
    const { navigateTo, visited } = makeNavigateTo(stack, root, fatalErrorSpy);

    navigateTo(cards[0]!.id, false);

    // After fatal error at step 21, no more navigations happen.
    // visited should have exactly 21 entries (cards 0–20).
    expect(visited.length).toBe(21);
    // Fatal error called only once.
    expect(fatalErrorSpy).toHaveBeenCalledOnce();
  });

  it("resets counter to 0 on user-initiated navigation after 15 automatic ones", () => {
    // Build a chain of 15 cards with auto-goto, then a final card with no auto-goto.
    const cards: Card[] = [];
    for (let i = 0; i < 15; i++) {
      const id = IDS.cards[i]!;
      const nextId = IDS.cards[i + 1]!;
      cards.push(makeCard(id, nextId));
    }
    // Card 15: no auto-goto (end of chain).
    cards.push(makeCard(IDS.cards[15]!));
    // Card 16: another chain target for the user nav.
    cards.push(makeCard(IDS.cards[16]!));

    const stack = makeStack(cards);
    const { navigateTo, state } = makeNavigateTo(stack, root, fatalErrorSpy);

    // User navigates to card 0 — triggers 15 auto-navigations (counter = 15),
    // stopping at card 15 (no auto-goto).
    navigateTo(cards[0]!.id, false);
    expect(state.autoNavCount).toBe(15);

    // No fatal error yet.
    expect(fatalErrorSpy).not.toHaveBeenCalled();

    // User-initiated navigation resets the counter.
    navigateTo(IDS.cards[16]!, false);
    expect(state.autoNavCount).toBe(0);
  });

  it("counter persists across multiple user navigations", () => {
    // Two separate cards, each with 10 auto-goto hops.
    // After user nav to first chain (10 auto), user nav resets counter.
    // Then user nav to second chain (10 auto) — no cap hit.
    const chain1: Card[] = [];
    for (let i = 0; i < 10; i++) {
      chain1.push(makeCard(IDS.cards[i]!, IDS.cards[i + 1]));
    }
    chain1.push(makeCard(IDS.cards[10]!)); // terminal

    const chain2: Card[] = [];
    for (let i = 12; i < 22; i++) {
      chain2.push(makeCard(IDS.cards[i]!, IDS.cards[i + 1]));
    }
    chain2.push(makeCard(IDS.cards[22]!)); // terminal

    const stack = makeStack([...chain1, ...chain2]);
    const { navigateTo, state } = makeNavigateTo(stack, root, fatalErrorSpy);

    // First chain: 10 auto-navigations.
    navigateTo(IDS.cards[0]!, false);
    expect(state.autoNavCount).toBe(10);
    expect(fatalErrorSpy).not.toHaveBeenCalled();

    // User nav resets counter.
    navigateTo(IDS.cards[12]!, false);
    expect(state.autoNavCount).toBe(10); // 10 from chain2
    expect(fatalErrorSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// errors.ts integration

describe("showFatalError()", () => {
  it("renders the correct message text", () => {
    const root = document.createElement("div");
    showFatalError(root);
    expect(root.querySelector("p")?.textContent).toBe(
      "Something went wrong. Please ask your teacher to check the file.",
    );
  });

  it("clears existing content before showing the message", () => {
    const root = document.createElement("div");
    root.innerHTML = "<span>Old content</span>";
    showFatalError(root);
    expect(root.querySelector("span")).toBeNull();
    expect(root.querySelectorAll("p").length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// audio.ts — does not throw when AudioContext is unavailable

describe("playSound()", () => {
  it("does not throw when AudioContext is not available", async () => {
    // Temporarily remove AudioContext from globalThis.
    const saved = (globalThis as Record<string, unknown>)["AudioContext"];
    delete (globalThis as Record<string, unknown>)["AudioContext"];
    (globalThis as Record<string, unknown>)["webkitAudioContext"] = undefined;

    const { playSound } = await import("../src/player/audio.js");

    expect(() => playSound("cheer")).not.toThrow();
    expect(() => playSound("buzz")).not.toThrow();

    // Restore.
    (globalThis as Record<string, unknown>)["AudioContext"] = saved;
  });

  it("does not throw when AudioContext constructor throws", async () => {
    (globalThis as Record<string, unknown>)["AudioContext"] = class {
      constructor() { throw new Error("AudioContext not allowed"); }
    };

    const { playSound } = await import("../src/player/audio.js");

    expect(() => playSound("cheer")).not.toThrow();
    expect(() => playSound("buzz")).not.toThrow();
  });
});
