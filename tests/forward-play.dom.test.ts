// tests/forward-play.dom.test.ts
// TASK-26b: a pupil can never be stranded on a card. These play the real player
// (mountPlayer — the code the exported file runs) through the exact dead ends
// round 2 found on the LIVE app.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mountPlayer } from "../src/player/mount.js";
import { renderCard } from "../src/player/renderer.js";
import { createRuntime } from "../src/player/runtime.js";
import { fitQuestion, fitTileLabel } from "../src/shared/fitText.js";
import { applyScaling } from "../src/player/scaler.js";
import type { Card, Stack } from "../src/shared/types.js";

class FakeResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as unknown as Record<string, unknown>)["ResizeObserver"] = FakeResizeObserver;

const A = "aaaaaaaa-0000-4000-8000-0000000000";
const id = (n: number): string => `${A}${n.toString(16).padStart(2, "0")}`;

function deckOf(...content: Card[]): Stack {
  return {
    id: id(1),
    title: "Forward",
    theme: { background: "#fff", foreground: "#000", font: "sans-serif" },
    cards: [
      ...content,
      { id: id(0xee), kind: "end", elements: [{ type: "field", id: id(0xef), x: 48, y: 420, w: 704, h: 60, variable: "score" }], actions: [] },
    ],
  };
}

const text = (n: number, content: string, y = 264, h = 72): Card["elements"][number] => ({
  type: "text", id: id(n), x: 48, y, w: 704, h, content,
});

let root: HTMLElement;
let teardown: (() => void) | null = null;

beforeEach(() => {
  document.body.innerHTML = "";
  root = document.createElement("div");
  document.body.appendChild(root);
});
afterEach(() => {
  teardown?.();
  teardown = null;
  vi.useRealTimers();
});

function play(stack: Stack): void {
  // flip:false → no 240 ms animation timer; navigation is immediate.
  teardown = mountPlayer(stack, root, { flip: false });
}

describe("TASK-26b: the exact malformed flash card from the live model", () => {
  // ONE text (the whole explanation as the "term") plus a Next button. The old
  // player drew the button on the BACK only, and a card with no back never
  // flips — so card 1 of both AI decks was a permanent dead end.
  const malformed = (): Stack =>
    deckOf({
      id: id(10),
      kind: "flash",
      elements: [
        text(11, "Evaporation is when the sun heats water and it rises as vapour."),
        { type: "button", id: id(12), x: 408, y: 496, w: 344, h: 72, label: "Next Card", actions: [{ type: "goto", cardId: id(0xee) }] },
      ],
      actions: [],
    });

  it("draws Next Card on the FRONT, because there is no back to flip to", () => {
    play(malformed());
    const next = root.querySelector<HTMLButtonElement>(".sy-flash-next button");
    expect(next, "Next Card must be on the front of a back-less flash card").not.toBeNull();
    expect(next!.textContent).toBe("Next Card");
  });

  it("pressing it moves the class on to the next card", () => {
    play(malformed());
    root.querySelector<HTMLButtonElement>(".sy-flash-next button")!.click();
    expect(root.querySelector(".sy-end-card")).not.toBeNull();
  });

  it("a flash card WITH a back still keeps Next on the back only (design unchanged)", () => {
    const withBack = deckOf({
      id: id(10),
      kind: "flash",
      elements: [
        text(11, "Term"),
        text(13, "Explanation", 360, 120),
        { type: "button", id: id(12), x: 408, y: 496, w: 344, h: 72, label: "Next Card", actions: [{ type: "goto", cardId: id(0xee) }] },
      ],
      actions: [],
    });
    play(withBack);
    expect(root.querySelector(".sy-flash-next button")).toBeNull(); // front: no Next
    root.querySelector<HTMLElement>(".sy-flash")!.click(); // flip
    expect(root.querySelector(".sy-flash-next button")).not.toBeNull(); // back: Next
  });
});

describe("TASK-26b: a card with nothing to press still has a way on", () => {
  it("a flash card with one text and NO button gets a Next Card", () => {
    play(deckOf({ id: id(10), kind: "flash", elements: [text(11, "Just a term")], actions: [] }));
    const next = root.querySelector<HTMLButtonElement>("button");
    expect(next?.textContent).toBe("Next Card");
    next!.click();
    expect(root.querySelector(".sy-end-card")).not.toBeNull();
  });

  it("a flash card with two texts and NO button gets Next Card on the back", () => {
    play(deckOf({ id: id(10), kind: "flash", elements: [text(11, "Term"), text(13, "Explanation", 360, 120)], actions: [] }));
    root.querySelector<HTMLElement>(".sy-flash")!.click();
    const next = root.querySelector<HTMLButtonElement>(".sy-flash-next button");
    expect(next).not.toBeNull();
    next!.click();
    expect(root.querySelector(".sy-end-card")).not.toBeNull();
  });

  it("a story card with no choices gets a Next Card", () => {
    play(deckOf({ id: id(10), kind: "story", elements: [text(11, "Once upon a time…", 104, 300)], actions: [] }));
    const next = root.querySelector<HTMLButtonElement>("button");
    expect(next?.textContent).toBe("Next Card");
    next!.click();
    expect(root.querySelector(".sy-end-card")).not.toBeNull();
  });

  it("a flash button that has no goto still goes on", () => {
    play(
      deckOf({
        id: id(10),
        kind: "flash",
        elements: [
          text(11, "Term"),
          text(13, "Explanation", 360, 120),
          { type: "button", id: id(12), x: 408, y: 496, w: 344, h: 72, label: "Next Card", actions: [] },
        ],
        actions: [],
      }),
    );
    root.querySelector<HTMLElement>(".sy-flash")!.click();
    root.querySelector<HTMLButtonElement>(".sy-flash-next button")!.click();
    expect(root.querySelector(".sy-end-card")).not.toBeNull();
  });
});

describe("TASK-26o: a plain button with no action never greys out the card and stops", () => {
  // J2 step 12: "Clouds" was added with Add Button (no actions). Tapping it
  // greyed out every button on the card and did nothing.
  const quizWithDeadButton = (): Stack =>
    deckOf({
      id: id(20),
      kind: "quiz",
      elements: [
        text(21, "Where does evaporated water come from?", 104, 160),
        { type: "button", id: id(22), x: 48, y: 296, w: 344, h: 96, label: "The sea", actions: [{ type: "score", delta: 1 }, { type: "goto", cardId: id(0xee) }] },
        { type: "button", id: id(23), x: 408, y: 296, w: 344, h: 96, label: "Puddles", actions: [{ type: "score", delta: 0 }, { type: "goto", cardId: id(0xee) }] },
        { type: "button", id: id(24), x: 48, y: 424, w: 344, h: 80, label: "Clouds", actions: [] },
      ],
      actions: [],
    });

  it("tapping it moves on to the next card", () => {
    play(quizWithDeadButton());
    const clouds = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === "Clouds")!;
    clouds.click();
    expect(root.querySelector(".sy-end-card")).not.toBeNull();
  });

  it("in the EDITOR (no fallback target) a click on it does not disable the other buttons", () => {
    const stack = quizWithDeadButton();
    renderCard(stack.cards[0]!, root, createRuntime(stack), () => {}, () => {}, {});
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button"));
    buttons.find((b) => b.textContent === "Clouds")!.click();
    expect(buttons.every((b) => !b.disabled)).toBe(true);
  });

  it("the editor still shows exactly what is stored — no synthesised Next Card without a fallback target", () => {
    const stack = deckOf({ id: id(10), kind: "flash", elements: [text(11, "Just a term")], actions: [] });
    renderCard(stack.cards[0]!, root, createRuntime(stack), () => {}, () => {}, { position: 1, total: 2 });
    expect(root.querySelector("button")).toBeNull();
  });
});

describe("TASK-26c: text is fitted to its box at the class-laptop and projector scales", () => {
  const LONG_Q =
    "Long ago, around the year 795, a people from the far north first sailed their longships to " +
    "the coast of Ireland. Which people were they, and what were they after when they came?";
  const LONG_A = "They put it in the freezer overnight until it sets hard";

  function longDeck(): Stack {
    return deckOf({
      id: id(30),
      kind: "quiz",
      elements: [
        text(31, LONG_Q, 104, 160),
        { type: "button", id: id(32), x: 48, y: 296, w: 344, h: 96, label: LONG_A, actions: [{ type: "score", delta: 1 }, { type: "goto", cardId: id(0xee) }] },
        { type: "button", id: id(33), x: 408, y: 296, w: 344, h: 96, label: "Short", actions: [{ type: "score", delta: 0 }, { type: "goto", cardId: id(0xee) }] },
      ],
      actions: [],
    });
  }

  it("the renderer shrinks a long question and a long answer; a short answer keeps the token size", () => {
    play(longDeck());
    const q = root.querySelector<HTMLElement>(".sy-question")!;
    const expected = fitQuestion(LONG_Q, 704, 160);
    expect(expected.fits).toBe(true);
    expect(q.style.fontSize).toBe(`${expected.size}px`);
    expect(parseInt(q.style.fontSize, 10)).toBeLessThan(44);

    const labels = Array.from(root.querySelectorAll<HTMLElement>(".sy-tile-label"));
    expect(parseInt(labels[0]!.style.fontSize, 10)).toBeLessThan(32);
    expect(labels[0]!.style.fontSize).toBe(`${fitTileLabel(LONG_A, 344, 96).size}px`);
    expect(labels[1]!.style.fontSize).toBe(""); // "Short" keeps the CSS default
  });

  it("a short question is untouched (the ready-made look does not change)", () => {
    play(deckOf({ id: id(40), kind: "quiz", elements: [text(41, "What is a longship?", 104, 160),
      { type: "button", id: id(42), x: 48, y: 296, w: 344, h: 96, label: "A boat", actions: [{ type: "score", delta: 1 }, { type: "goto", cardId: id(0xee) }] },
      { type: "button", id: id(43), x: 408, y: 296, w: 344, h: 96, label: "A house", actions: [{ type: "score", delta: 0 }, { type: "goto", cardId: id(0xee) }] }], actions: [] }));
    expect(root.querySelector<HTMLElement>(".sy-question")!.style.fontSize).toBe("");
  });

  for (const [w, h] of [[1366, 768], [1920, 1080]] as const) {
    it(`at ${w}×${h} the fitted question fits its box and renders ≥ 18 px on screen`, () => {
      Object.defineProperty(globalThis, "innerWidth", { value: w, configurable: true, writable: true });
      Object.defineProperty(globalThis, "innerHeight", { value: h, configurable: true, writable: true });
      const stop = applyScaling(root);
      const m = /scale\(([\d.]+)\)/.exec(root.style.transform) ?? /scale\(([\d.]+)\)/.exec(root.innerHTML);
      stop();
      // Scale per the player's rule: fit 812×612 with a 48 px margin, ≥ 0.9, no top clamp.
      const scale = m ? Number(m[1]) : Math.max(0.9, Math.min((w - 48) / 812, (h - 48) / 612));
      const fit = fitQuestion(LONG_Q, 704, 160);
      expect(fit.fits).toBe(true);
      // Height of the fitted text, in screen pixels, never exceeds the box…
      expect(fit.lines * fit.lineHeight * scale).toBeLessThanOrEqual(160 * scale + 0.001);
      // …and the smallest text a pupil sees is still ≥ 18 px (the design floor).
      expect(fit.size * scale).toBeGreaterThanOrEqual(18);
      const tile = fitTileLabel(LONG_A, 344, 96);
      expect(tile.size * scale).toBeGreaterThanOrEqual(18);
    });
  }
});
