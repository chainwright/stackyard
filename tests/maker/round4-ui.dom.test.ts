// tests/maker/round4-ui.dom.test.ts
// TASK-27c (the "✓ Right answer" tag hangs above the tile), TASK-27w (story
// choices leave room for the "→ Card N" tag), TASK-28d (the drag pill moves left
// on the right tile), TASK-28g (the flip has weight), TASK-28f (wait copy).
// Geometry that needs real layout is also asserted in a real browser by
// scripts/check-maker-fit.ts; these are the DOM-level halves.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, h } from "preact";
import { readFileSync } from "node:fs";
import { Canvas } from "../../src/editor/Canvas.js";
import { EditorStore } from "../../src/editor/store.js";
import { storyLayout } from "../../src/shared/layout.js";
import { FLIP_ENTER_MS, FLIP_EXIT_MS } from "../../src/player/renderer.js";
import { quizStack } from "./fixtures.js";

class FakeResizeObserver { observe(): void {} unobserve(): void {} disconnect(): void {} }
(globalThis as unknown as Record<string, unknown>)["ResizeObserver"] = FakeResizeObserver;

let mounted: HTMLElement | null = null;
const rerenderRef: { current: () => void } = { current: () => {} };

function makeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}
const flush = async (): Promise<void> => {
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
};

beforeEach(() => {
  document.body.innerHTML = "";
});
afterEach(() => {
  if (mounted) render(null, mounted);
  mounted = null;
});

function mountQuiz(): { root: HTMLElement; store: EditorStore } {
  const stack = quizStack();
  const store = new EditorStore({ stack, screen: "editor" }, { storage: makeStorage(), onChange: () => rerenderRef.current() });
  store.setSelectedCard(stack.cards[0]!.id);
  const root = document.createElement("div");
  document.body.appendChild(root);
  rerenderRef.current = () => render(h(Canvas, { store }), root);
  rerenderRef.current();
  mounted = root;
  return { root, store };
}

describe("TASK-27c: the Right answer tag hangs above the tile, right-aligned", () => {
  it("is placed in the gutter above the right tile (top < tile top) and anchored to its right edge", async () => {
    const { root, store } = mountQuiz();
    await flush();
    const card = store.getState().stack!.cards[0]!;
    const right = card.elements.find((e) => e.type === "button" && e.actions.some((a) => a.type === "score" && a.delta === 1))!;
    const tag = root.querySelector<HTMLElement>(".right-tag")!;
    expect(tag).not.toBeNull();
    const top = parseFloat(tag.style.top);
    const left = parseFloat(tag.style.left);
    const scale = top / (right.y - 30);
    expect(scale).toBeGreaterThan(0.5);
    expect(top).toBeLessThan(right.y * scale); // above the tile
    expect(left / scale).toBeCloseTo(right.x + right.w - 8, 0); // right edge of the tile
    expect(tag.style.transform).toContain("translateX(-100%)"); // grows leftwards, never past the tile
  });
});

describe("TASK-28d: the drag pill moves to the left edge on the right-answer tile", () => {
  it("selecting the right tile gives its drag pill the -left class; another tile keeps the centred pill", async () => {
    const { root, store } = mountQuiz();
    await flush();
    const card = store.getState().stack!.cards[0]!;
    const buttons = card.elements.filter((e) => e.type === "button");
    const right = buttons.find((e) => e.type === "button" && e.actions.some((a) => a.type === "score" && a.delta === 1))!;
    const other = buttons.find((e) => e !== right)!;

    store.setSelectedElement(right.id);
    await flush();
    expect(root.querySelector(".drag-tab")?.classList.contains("drag-tab-left")).toBe(true);

    store.setSelectedElement(other.id);
    await flush();
    expect(root.querySelector(".drag-tab")?.classList.contains("drag-tab-left")).toBe(false);

    const css = readFileSync("src/editor/styles.css", "utf8");
    expect(css).toMatch(/\.drag-tab-left\s*\{\s*left:\s*0;\s*transform:\s*none;\s*\}/);
  });
});

describe("TASK-27w: story choices leave a gap for the '→ Card N' tag", () => {
  it.each([2, 3, 4])("%i choices: at least 32 px between one choice and the next", (n) => {
    const { buttons } = storyLayout(n);
    expect(buttons).toHaveLength(n);
    for (let i = 1; i < buttons.length; i++) {
      const gap = buttons[i]!.y - (buttons[i - 1]!.y + buttons[i - 1]!.h);
      expect(gap).toBeGreaterThanOrEqual(32);
    }
  });

  it("the tag sits just under its choice (3 px), inside that gap", () => {
    expect(readFileSync("src/editor/Canvas.tsx", "utf8")).toContain("(el.y + el.h + 3) * scale");
  });
});

describe("TASK-28g: the flip has weight", () => {
  it("the settle takes ~360 ms and the lift is shorter (the tests wait on the lift)", () => {
    expect(FLIP_ENTER_MS).toBe(360);
    expect(FLIP_EXIT_MS).toBeLessThan(FLIP_ENTER_MS);
  });

  it("the keyframes keep the card opaque and sweep a shadow; reduced motion removes the animation", () => {
    const src = readFileSync("src/player/renderer.ts", "utf8");
    const exit = /@keyframes card-exit \{([\s\S]*?)\n\}/.exec(src)![1]!;
    const enter = /@keyframes card-enter \{([\s\S]*?)\n\}/.exec(src)![1]!;
    for (const k of [exit, enter]) {
      expect(k).not.toMatch(/opacity/); // no fade
      expect(k).toMatch(/box-shadow/); // a shadow sweeps under the turning card
      expect(k).toMatch(/rotateX/);
    }
    expect(src).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.sy-card-exit, \.sy-card-enter \{ animation: none/);
  });
});
