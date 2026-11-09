// tests/maker/round9-ui.dom.test.ts
// TASK-33b: the Start screen carries the "lesson is the file" promise under the
// h1, in the ink-on-paper styles (no stamp red, no new colour). The top-bar
// tagline still says only the FILE works offline (TASK-29j).

import { afterEach, describe, expect, it } from "vitest";
import { render, h } from "preact";
import { readFileSync } from "node:fs";
import { StartScreen, FILE_PROMISE } from "../../src/editor/StartScreen.js";
import { EditorStore } from "../../src/editor/store.js";

function makeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

let mounted: HTMLElement | null = null;
afterEach(() => {
  if (mounted) render(null, mounted);
  mounted = null;
  document.body.innerHTML = "";
});

describe("TASK-33b: the Start screen says the lesson is the file", () => {
  it("TASK-33b: one promise line in the lede, right under the h1, with the exact words", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    render(h(StartScreen, { store: new EditorStore({}, { storage: makeStorage() }) }), root);
    mounted = root;
    expect(FILE_PROMISE).toBe("The lesson is the file: it plays, scores and edits itself, with the Wi-Fi off.");
    const lines = root.querySelectorAll(".lede-promise");
    expect(lines.length).toBe(1);
    expect(lines[0]!.textContent).toBe(FILE_PROMISE);
    expect(lines[0]!.closest("p.lede")).not.toBeNull();
    // The h1 is followed by the lede (the promise sits under the heading).
    const h1 = root.querySelector(".start-inner h1")!;
    expect(h1.textContent).toBe("What would you like to teach?");
    let next = h1.nextElementSibling;
    while (next && !next.matches("p.lede")) next = next.nextElementSibling;
    expect(next).not.toBeNull();
    // The Maker is not offline: the top bar still promises only the file.
    expect(root.querySelector(".promise")!.textContent).toBe("Make a clickable lesson from one sentence. The lesson file works offline.");
  });

  it("TASK-33b: styled in ink on paper — no stamp red, no new colour, no smaller than the 20px meta size", () => {
    const css = readFileSync("src/editor/styles.css", "utf8");
    const rule = css.match(/\.start-card p\.lede \.lede-promise\s*\{([^}]*)\}/)![1]!;
    expect(rule).toContain("display: block");
    expect(rule).toContain("font-weight: 700");
    expect(rule).toContain("font-size: var(--text-meta)");
    expect(rule).not.toMatch(/color|background|#[0-9a-f]{3,6}|--color-stamp/i);
  });
});
