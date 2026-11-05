// tests/player/mount.test.ts
// TASK-17a: mountPlayer extraction. A minimal valid stack mounts (first card
// rendered) and the auto-advance guard still stops at 20. TASK-17 sameness: the
// exported player entry and Play mode both go through this one function.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { mountPlayer } from "../../src/player/mount.js";
import type { Card, Stack } from "../../src/shared/types.js";

// jsdom does not ship ResizeObserver; the player scaler needs it. Stub it.
class FakeResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as unknown as Record<string, unknown>)["ResizeObserver"] =
  FakeResizeObserver;

let root: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = "";
  root = document.createElement("div");
  root.id = "player-root";
  document.body.appendChild(root);
});

afterEach(() => {
  document.body.innerHTML = "";
});

function id(n: number): string {
  return `${String(n).padStart(8, "0")}-0000-4000-8000-000000000001`;
}

function minimalStack(): Stack {
  return {
    id: id(1),
    title: "Mount Test",
    theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" },
    cards: [
      {
        id: id(2),
        kind: "story",
        elements: [
          { type: "text", id: id(3), x: 40, y: 40, w: 720, h: 120, content: "Hello class" },
        ],
        actions: [],
      },
      {
        id: id(4),
        kind: "end",
        elements: [
          { type: "field", id: id(5), x: 40, y: 40, w: 720, h: 80, variable: "score" },
        ],
        actions: [],
      },
    ],
  };
}

describe("TASK-17a: mountPlayer", () => {
  it("mounts a minimal valid stack and renders the first card", () => {
    const teardown = mountPlayer(minimalStack(), root);
    expect(root.querySelector(".sy-card")).not.toBeNull();
    expect(root.textContent).toContain("Hello class");
    teardown();
  });

  it("teardown clears the root", () => {
    const teardown = mountPlayer(minimalStack(), root);
    expect(root.innerHTML.length).toBeGreaterThan(0);
    teardown();
    expect(root.innerHTML).toBe("");
  });

  it("the auto-advance guard stops at 20 consecutive automatic navigations", () => {
    // A long chain of story cards, each auto-advancing to the next via a
    // card-level goto, ending in an end card. After the 20th auto-nav the
    // guard fires and the fatal-error message replaces the card.
    const cards: Card[] = [];
    const total = 24;
    for (let i = 0; i < total; i++) {
      const thisId = id(100 + i);
      const nextId = id(100 + i + 1);
      cards.push({
        id: thisId,
        kind: "story",
        elements: [
          { type: "text", id: id(200 + i), x: 40, y: 40, w: 720, h: 80, content: `Card ${i}` },
        ],
        actions: [{ type: "goto", cardId: nextId }],
      });
    }
    // Terminal end card (its id is the last goto target).
    cards.push({
      id: id(100 + total),
      kind: "end",
      elements: [{ type: "field", id: id(300), x: 40, y: 40, w: 720, h: 80, variable: "score" }],
      actions: [],
    });

    const stack: Stack = {
      id: id(99),
      title: "Guard Test",
      theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" },
      cards,
    };

    const teardown = mountPlayer(stack, root);
    // The guard shows the fatal-error paragraph after exceeding 20 auto-navs.
    const text = root.textContent ?? "";
    expect(text).toContain("Something went wrong");
    teardown();
  });
});

describe("mountPlayer — card flip (TASK-R3)", () => {
  it("starts play at the requested card (startCardId)", () => {
    const stack: Stack = {
      id: id(1),
      title: "Start test",
      theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" },
      cards: [
        { id: id(2), kind: "story", elements: [{ type: "text", id: id(3), x: 48, y: 104, w: 704, h: 80, content: "First card" }], actions: [] },
        { id: id(4), kind: "story", elements: [{ type: "text", id: id(5), x: 48, y: 104, w: 704, h: 80, content: "Second card" }], actions: [] },
        { id: id(6), kind: "end", elements: [{ type: "field", id: id(7), x: 48, y: 40, w: 704, h: 80, variable: "score" }], actions: [] },
      ],
    };
    const teardown = mountPlayer(stack, root, { startCardId: id(4) });
    expect(root.textContent).toContain("Second card");
    expect(root.textContent).not.toContain("First card");
    teardown();
  });

  it("applies the card-enter flip animation on the first render (motion on)", () => {
    const teardown = mountPlayer(minimalStack(), root, { flip: true });
    const cardEl = root.querySelector<HTMLElement>(".sy-card");
    expect(cardEl?.style.animation).toContain("card-enter");
    expect(cardEl?.style.transformOrigin).toBe("top center");
    teardown();
  });

  it("applies no flip animation when flip is disabled", () => {
    const teardown = mountPlayer(minimalStack(), root, { flip: false });
    const cardEl = root.querySelector<HTMLElement>(".sy-card");
    expect(cardEl?.style.animation ?? "").toBe("");
    teardown();
  });

  it("skips the flip under prefers-reduced-motion", () => {
    const original = window.matchMedia;
    (window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = ((q: string) =>
      ({ matches: /reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList);
    try {
      const teardown = mountPlayer(minimalStack(), root, { flip: true });
      const cardEl = root.querySelector<HTMLElement>(".sy-card");
      expect(cardEl?.style.animation ?? "").toBe("");
      teardown();
    } finally {
      (window as unknown as { matchMedia?: typeof original }).matchMedia = original;
    }
  });
});

describe("mountPlayer derives 'Card N of M' from the deck position", () => {
  it("shows 'Card 1 of 3' on the first card of a three-card deck (counts every card)", () => {
    // Two quizzes + an end card = three cards; the meta counts all three.
    const stack: Stack = {
      id: id(1),
      title: "Meta Test",
      theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" },
      cards: [
        {
          id: id(2),
          kind: "quiz",
          elements: [
            { type: "text", id: id(3), x: 48, y: 104, w: 704, h: 128, content: "Q one?" },
            { type: "button", id: id(4), x: 48, y: 296, w: 344, h: 96, label: "Right",
              actions: [{ type: "score", delta: 1 }, { type: "goto", cardId: id(6) }] },
            { type: "button", id: id(5), x: 408, y: 296, w: 344, h: 96, label: "Wrong",
              actions: [{ type: "goto", cardId: id(6) }] },
          ],
          actions: [],
        },
        {
          id: id(6),
          kind: "quiz",
          elements: [
            { type: "text", id: id(7), x: 48, y: 104, w: 704, h: 128, content: "Q two?" },
            { type: "button", id: id(8), x: 48, y: 296, w: 344, h: 96, label: "Right",
              actions: [{ type: "score", delta: 1 }, { type: "goto", cardId: id(9) }] },
            { type: "button", id: id(10), x: 408, y: 296, w: 344, h: 96, label: "Wrong",
              actions: [{ type: "goto", cardId: id(9) }] },
          ],
          actions: [],
        },
        {
          id: id(9),
          kind: "end",
          elements: [{ type: "field", id: id(11), x: 48, y: 40, w: 704, h: 80, variable: "score" }],
          actions: [],
        },
      ],
    };

    const teardown = mountPlayer(stack, root);
    const meta = root.querySelector(".sy-meta-chrome .sy-meta");
    // The meta counts every card in the deck (two quizzes + the end = 3).
    expect(meta?.textContent).toBe("Card 1 of 3");
    teardown();
  });
});

describe("TASK-17: Play mode and the exported player share one mountPlayer", () => {
  it("src/player/index.ts imports the same mountPlayer symbol the Maker uses", async () => {
    const mountMod = await import("../../src/player/mount.js");
    const indexSource = readFileSync("src/player/index.ts", "utf8");
    // The exported player entry imports mountPlayer from ./mount.js and calls it.
    expect(indexSource).toContain('from "./mount.js"');
    expect(indexSource).toContain("mountPlayer(");
    // And the Maker's Try It canvas imports the same symbol.
    const trySource = readFileSync("src/editor/TryItCanvas.tsx", "utf8");
    expect(trySource).toContain("mountPlayer");
    expect(typeof mountMod.mountPlayer).toBe("function");
  });
});
