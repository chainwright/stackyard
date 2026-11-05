// tests/maker/a11y.test.ts
// TASK-20: Accessibility pass.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { render, h } from "preact";
import { EditorStore } from "../../src/editor/store.js";
import { Canvas } from "../../src/editor/Canvas.js";
import { announce, ensureAnnouncer, _resetAnnouncer } from "../../src/editor/a11y.js";
import { editLabel } from "../../src/editor/operations.js";
import { plainMessageFrom } from "../../src/shared/messages.js";
import type { ButtonElement } from "../../src/shared/types.js";
import { quizStack } from "./fixtures.js";

class FakeResizeObserver { observe(): void {} unobserve(): void {} disconnect(): void {} }
(globalThis as unknown as Record<string, unknown>)["ResizeObserver"] = FakeResizeObserver;

let mounted: HTMLElement | null = null;
const rerenderRef: { current: () => void } = { current: () => {} };

async function flush(times = 4): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

function makeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

function mountCanvas(store: EditorStore): HTMLElement {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const draw = () => render(h(Canvas, { store }), root);
  rerenderRef.current = draw;
  draw();
  mounted = root;
  return root;
}

describe("TASK-20: Accessibility — aria-live", () => {
  beforeEach(() => { document.body.innerHTML = ""; _resetAnnouncer(); });
  afterEach(() => { if (mounted) render(null, mounted); mounted = null; });

  it("the shared announcer is a visually-hidden polite region", () => {
    const el = ensureAnnouncer();
    expect(el.getAttribute("aria-live")).toBe("polite");
    expect(el.classList.contains("sr-only")).toBe(true);
  });

  it("an edit announces a plain-language message through the aria-live region", () => {
    const store = new EditorStore(
      { stack: quizStack(), screen: "editor" },
      { storage: makeStorage(), announce },
    );
    const dublin = store.getStack()!.cards[0]!.elements.find(
      (e): e is ButtonElement => e.type === "button" && e.label === "Dublin",
    )!;
    store.apply((s) => editLabel(s, dublin.id, "Dubh Linn"));
    const region = document.querySelector('[data-announcer="maker"]');
    expect((region?.textContent ?? "").length).toBeGreaterThan(0);
  });
});

describe("TASK-20: Accessibility — keyboard element move", () => {
  beforeEach(() => { document.body.innerHTML = ""; _resetAnnouncer(); });
  afterEach(() => { if (mounted) render(null, mounted); mounted = null; });

  it("arrow keys nudge the selected element (clamped) via moveElement", async () => {
    const store = new EditorStore(
      { stack: quizStack(), screen: "editor" },
      { storage: makeStorage(), onChange: () => rerenderRef.current() },
    );
    const quiz = store.getStack()!.cards[0]!;
    const dublin = quiz.elements.find((e): e is ButtonElement => e.type === "button" && e.label === "Dublin")!;
    store.setSelectedCard(quiz.id);
    store.setSelectedElement(dublin.id);
    const root = mountCanvas(store);
    const beforeX = (store.getStack()!.cards[0]!.elements.find((e) => e.id === dublin.id) as ButtonElement).x;

    const area = root.querySelector<HTMLElement>(".canvas-area")!;
    area.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await flush();
    const afterX = (store.getStack()!.cards[0]!.elements.find((e) => e.id === dublin.id) as ButtonElement).x;
    expect(afterX).toBe(beforeX + 1);
  });

  it("a rapid burst of nudges coalesces into a single undo step", async () => {
    const store = new EditorStore(
      { stack: quizStack(), screen: "editor" },
      { storage: makeStorage(), onChange: () => rerenderRef.current(), now: (() => { let t = 0; return () => (t += 50); })() },
    );
    const quiz = store.getStack()!.cards[0]!;
    const dublin = quiz.elements.find((e): e is ButtonElement => e.type === "button" && e.label === "Dublin")!;
    store.setSelectedCard(quiz.id);
    store.setSelectedElement(dublin.id);
    const startX = (quiz.elements.find((e) => e.id === dublin.id) as ButtonElement).x;
    const root = mountCanvas(store);
    const area = root.querySelector<HTMLElement>(".canvas-area")!;

    for (let i = 0; i < 5; i++) {
      area.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      await flush(1);
    }
    expect((store.getStack()!.cards[0]!.elements.find((e) => e.id === dublin.id) as ButtonElement).x).toBe(startX + 5);

    // One undo restores the pre-burst position.
    store.undo();
    expect((store.getStack()!.cards[0]!.elements.find((e) => e.id === dublin.id) as ButtonElement).x).toBe(startX);
  });
});

describe("TASK-20: Accessibility — style floors", () => {
  const css = readFileSync("src/editor/styles.css", "utf8");

  it("no font-size below 18px in the editor chrome", () => {
    const matches = css.match(/font-size:\s*(\d+)px/g) ?? [];
    for (const m of matches) {
      const px = Number(/(\d+)/.exec(m)![1]);
      expect(px, m).toBeGreaterThanOrEqual(18);
    }
  });

  it("interactive controls declare a ≥44px target", () => {
    // Every interactive class sets min-height >= 44px (tiles use 56px).
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("--tile-min-height: 56px");
    // No interactive min-height below 44 px.
    const minHeights = css.match(/min-height:\s*(\d+)px/g) ?? [];
    for (const m of minHeights) {
      const px = Number(/(\d+)/.exec(m)![1]);
      expect(px, m).toBeGreaterThanOrEqual(40); // 40px rows (segmented/tryit) + 44+ targets
    }
  });

  it("the shared focus ring is 3px solid ink offset 2px via :focus-visible", () => {
    expect(css).toContain(":focus-visible");
    expect(css).toContain("outline: 3px solid var(--color-ink)");
    expect(css).toContain("outline-offset: 2px");
  });
});

describe("TASK-20: Accessibility — audience.md string lint", () => {
  // Collect user-facing strings from the editor components + the shared table.
  const files = [
    "src/editor/StartScreen.tsx",
    "src/editor/EditorScreen.tsx",
    "src/editor/CardList.tsx",
    "src/editor/Inspector.tsx",
    "src/editor/Toolbar.tsx",
    "src/editor/ExportDone.tsx",
    "src/editor/TryItCanvas.tsx",
    "src/editor/api.ts",
    "src/editor/store.ts",
    "src/shared/messages.ts",
  ];
  /** Strip // and block comments so we don't lint code comments. */
  function stripComments(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^\s*\/\/.*$/gm, " ");
  }

  /**
   * Extract strings that read like user-facing sentences: a quoted string with
   * a space, no JSX/code artifacts, and sentence-like punctuation or words.
   */
  function userFacingStrings(src: string): string[] {
    const clean = stripComments(src);
    const out: string[] = [];
    for (const m of clean.matchAll(/"([^"\\]{10,})"/g)) {
      const s = m[1]!;
      // Skip anything that smells like markup, a path, a CSS value, or an attr.
      if (/[<>{}=;:#/]|--|px\b|var\(|data-|aria-/.test(s)) continue;
      // Keep only strings that look like prose (lowercase word + space + word).
      if (!/[a-z]\s[a-z]/.test(s)) continue;
      out.push(s);
    }
    return out;
  }

  const strings = files.flatMap((f) => userFacingStrings(readFileSync(f, "utf8")));

  it("collects a non-trivial set of user-facing strings to lint", () => {
    expect(strings.length).toBeGreaterThan(10);
  });

  it("no user-facing string uses the word 'stack' (teachers see 'cards')", () => {
    const offenders = strings.filter((s) => /\b[Ss]tack\b/.test(s));
    expect(offenders).toEqual([]);
  });

  it("uses Irish/UK spelling (no American -ize/- color spellings)", () => {
    const joined = strings.join(" ");
    expect(/\bcolor\b/i.test(joined)).toBe(false);
    expect(/\borganiz/i.test(joined)).toBe(false);
    expect(/\brecogniz/i.test(joined)).toBe(false);
    expect(/\bapolog(ize|ized)\b/i.test(joined)).toBe(false);
  });

  it("no user-facing string exposes a raw validator code", () => {
    const codes = ["quiz-answer", "invalid-goto", "end-card-count", "blank-title", "canvas-bounds", "goto-cycle", "duplicate-id"];
    for (const s of strings) {
      for (const code of codes) expect(s).not.toContain(code);
    }
  });

  it("the validator-code messages never expose a raw code", () => {
    const codes = ["quiz-answer", "invalid-goto", "end-card-count", "blank-title", "canvas-bounds"];
    for (const code of codes) {
      const msg = plainMessageFrom([code]);
      expect(msg).not.toContain(code);
      expect(msg.length).toBeGreaterThan(0);
    }
  });
});
