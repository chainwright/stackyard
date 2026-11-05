// tests/flash-play.test.ts
// A played flash deck: the player (and, by sharing mountPlayer, the exported
// file) shows the TERM only on the front; a tap flips to the BACK (the
// explanation in body type, not heading type); a tap flips back; "Next Card"
// shows on the back only and never overlaps the text. The Irish-words example
// must play correctly end to end (built-app review round 2, P0 #1).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mountPlayer } from "../src/player/mount.js";
import { renderCard } from "../src/player/renderer.js";
import { createRuntime } from "../src/player/runtime.js";
import { irishWordsStack } from "../src/shared/readyMadeStacks.js";
import { validate } from "../src/shared/validator.js";
import type { Card, Stack } from "../src/shared/types.js";

// jsdom has no ResizeObserver; the scaler needs one.
class FakeResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as unknown as Record<string, unknown>)["ResizeObserver"] = FakeResizeObserver;

function flashCard(term: string, back: string, nextId: string): Card {
  return {
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    kind: "flash",
    elements: [
      { type: "text", id: "aaaaaaaa-0000-4000-8000-000000000002", x: 48, y: 264, w: 704, h: 72, content: term },
      { type: "text", id: "aaaaaaaa-0000-4000-8000-000000000003", x: 48, y: 360, w: 704, h: 120, content: back },
      { type: "button", id: "aaaaaaaa-0000-4000-8000-000000000004", x: 408, y: 496, w: 344, h: 72, label: "Next Card", actions: [{ type: "goto", cardId: nextId }] },
    ],
    actions: [],
  };
}

describe("flash card play: front shows the term, tap flips to the back", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
  });
  afterEach(() => {
    root.remove();
  });

  it("front shows the term only — no explanation, no Next Card button", () => {
    const card = flashCard("Longphort", "A fortified ship harbour the Vikings built.", "bbbbbbbb-0000-4000-8000-000000000001");
    const state = createRuntime({
      id: "11111111-0000-4000-8000-000000000001",
      title: "T",
      theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" },
      cards: [card, { id: "bbbbbbbb-0000-4000-8000-000000000001", kind: "end", elements: [], actions: [] }],
    } as Stack);

    renderCard(card, root, state, () => {}, () => {}, { position: 1, total: 2 });

    // The term is shown as the big front term.
    expect(root.querySelector(".sy-flash-term")?.textContent).toBe("Longphort");
    // The back explanation is NOT visible on the front.
    expect(root.querySelector(".sy-flash-back")).toBeNull();
    // No Next Card button on the front.
    expect(root.querySelector(".sy-flash-next")).toBeNull();
    expect(root.textContent).not.toContain("A fortified ship harbour");
  });

  it("tapping the card flips to the back: small term + explanation (body type) + Next Card; tap flips back", () => {
    const card = flashCard("Longphort", "A fortified ship harbour the Vikings built.", "bbbbbbbb-0000-4000-8000-000000000001");
    const state = createRuntime({
      id: "11111111-0000-4000-8000-000000000001",
      title: "T",
      theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" },
      cards: [card, { id: "bbbbbbbb-0000-4000-8000-000000000001", kind: "end", elements: [], actions: [] }],
    } as Stack);

    renderCard(card, root, state, () => {}, () => {}, { position: 1, total: 2 });

    const surface = root.querySelector<HTMLElement>(".sy-flash")!;
    expect(surface).not.toBeNull();
    surface.click();

    // Back is now visible: the explanation in the body-type class.
    const back = root.querySelector<HTMLElement>(".sy-flash-back");
    expect(back?.textContent).toBe("A fortified ship harbour the Vikings built.");
    // The back is body type, not the 44px heading.
    const css = document.head.querySelector("style")?.textContent ?? "";
    const backRule = css.match(/\.sy-flash-back\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(backRule).toMatch(/font-size\s*:\s*26px/);
    expect(backRule).not.toMatch(/var\(--text-question\)/);
    // The small term still names the card.
    expect(root.querySelector(".sy-flash-term-small")?.textContent).toBe("Longphort");
    // Next Card appears on the back only.
    expect(root.querySelector(".sy-flash-next")).not.toBeNull();

    // Tap again flips back to the front (term only, no back, no Next Card).
    surface.click();
    expect(root.querySelector(".sy-flash-back")).toBeNull();
    expect(root.querySelector(".sy-flash-next")).toBeNull();
    expect(root.querySelector(".sy-flash-term")?.textContent).toBe("Longphort");
  });

  it("Enter/Space flips the card for keyboard users", () => {
    const card = flashCard("Scoil", "School.", "bbbbbbbb-0000-4000-8000-000000000001");
    const state = createRuntime({
      id: "11111111-0000-4000-8000-000000000001",
      title: "T",
      theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" },
      cards: [card, { id: "bbbbbbbb-0000-4000-8000-000000000001", kind: "end", elements: [], actions: [] }],
    } as Stack);
    renderCard(card, root, state, () => {}, () => {}, { position: 1, total: 2 });
    const surface = root.querySelector<HTMLElement>(".sy-flash")!;
    expect(surface.getAttribute("tabindex")).toBe("0");
    surface.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(root.querySelector(".sy-flash-back")?.textContent).toBe("School.");
  });

  it("clicking Next Card advances, and does not also flip the card", () => {
    const nextId = "bbbbbbbb-0000-4000-8000-000000000001";
    const card = flashCard("Cat", "Cat.", nextId);
    const state = createRuntime({
      id: "11111111-0000-4000-8000-000000000001",
      title: "T",
      theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" },
      cards: [card, { id: nextId, kind: "end", elements: [], actions: [] }],
    } as Stack);
    const navigate = vi.fn();
    renderCard(card, root, state, navigate, () => {}, { position: 1, total: 2 });

    const surface = root.querySelector<HTMLElement>(".sy-flash")!;
    surface.click(); // flip to back
    const next = root.querySelector<HTMLButtonElement>(".sy-flash-next .sy-button")!;
    expect(next.textContent).toBe("Next Card");
    next.click();
    expect(navigate).toHaveBeenCalledWith(nextId, false);
  });
});

describe("Irish words example plays end to end", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    root.remove();
  });

  it("flips every flash card and advances through the whole deck to the end", () => {
    const stack = irishWordsStack();
    expect(validate(stack).valid).toBe(true);

    mountPlayer(stack, root);

    // Walk every non-end card. Flash cards: flip to the back, then press Next
    // Card. The check quiz at the end: answer the first (correct) tile.
    for (let i = 0; i < stack.cards.length - 1; i++) {
      const card = stack.cards[i]!;
      if (card.kind === "flash") {
        const surface = root.querySelector<HTMLElement>(".sy-flash");
        expect(surface, `card ${i} should render a flash surface`).not.toBeNull();
        // The term is on the front; the back is hidden until we flip.
        const termEl = stack.cards[i]!.elements.find((e) => e.type === "text");
        const term = termEl && termEl.type === "text" ? termEl.content : "";
        expect(root.querySelector(".sy-flash-term")?.textContent).toBe(term);
        surface!.click(); // flip to back
        expect(root.querySelector(".sy-flash-back")).not.toBeNull();
        const next = root.querySelector<HTMLButtonElement>(".sy-flash-next .sy-button")!;
        next.click();
        vi.advanceTimersByTime(240); // the flip to the next card
      } else if (card.kind === "quiz") {
        // The correct answer is no longer always the first tile (answers are
        // shuffled per stack), so click the tile the renderer marks correct.
        const correct = root.querySelector<HTMLButtonElement>('.sy-tile[data-correct="true"]')!;
        expect(correct, `card ${i} should render a correct tile`).not.toBeNull();
        correct.click();
        vi.advanceTimersByTime(900 + 240);
      }
    }

    // We are on the end card with a real score (one correct check-quiz answer).
    const endScore = root.querySelector('[data-testid="end-score"]');
    expect(endScore?.textContent).toBe("Score 1 of 1");
  });
});
