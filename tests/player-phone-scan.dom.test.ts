// tests/player-phone-scan.dom.test.ts
// TASK-36c2 (the scan ring is drawn INSIDE a flash card, so the card's clip
// can't hide it) and TASK-36c5 (the portrait phone card is opt-in per mount).
// The real-browser halves are check-a11y's scan run and check:living-mobile.

import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { mountPlayer } from "../src/player/mount.js";
import { vikingsStack } from "../src/shared/readyMadeStacks.js";

class FakeResizeObserver { observe(): void {} unobserve(): void {} disconnect(): void {} }
(globalThis as unknown as Record<string, unknown>)["ResizeObserver"] = FakeResizeObserver;

const src = readFileSync("src/player/renderer.ts", "utf8");
const css = src.slice(src.indexOf("const PLAYER_STYLES = `"), src.indexOf("`;", src.indexOf("const PLAYER_STYLES = `")));

let root: HTMLElement | null = null;
let stop: (() => void) | null = null;
afterEach(() => {
  stop?.();
  stop = null;
  root?.remove();
  root = null;
});

describe("TASK-36c2: the scan ring on a flash card is drawn inside it", () => {
  it("TASK-36c2: a highlighted flash card gets an inset ink ring with a paper gap (no outline the card would clip)", () => {
    const rule = /\.sy-scanning \.sy-flash\.sy-scan-focus \{([^}]*)\}/.exec(css);
    expect(rule, "the flash scan rule").not.toBeNull();
    expect(rule![1]).toContain("outline: none !important");
    expect(rule![1]).toMatch(/box-shadow: inset 0 0 0 4px var\(--color-paper\), inset 0 0 0 9px var\(--color-ink\)/);
    // Next Card on the back keeps the outline, with a paper gap.
    expect(css).toContain(".sy-scanning .sy-flash-next .sy-scan-focus { box-shadow: 0 0 0 3px var(--color-paper); }");
    // The real-browser assertion lives in the scan run.
    expect(readFileSync("scripts/check-a11y.ts", "utf8")).toContain("TASK-36c2: scan: no flash card was seen highlighted with a visible ring");
  });
});

describe("TASK-36c5: the portrait phone card", () => {
  const mount = (portrait?: boolean): HTMLElement => {
    root = document.createElement("main");
    root.id = "player-root";
    document.body.appendChild(root);
    stop = mountPlayer(vikingsStack(), root, { flip: false, ...(portrait === undefined ? {} : { portrait }) });
    return root;
  };

  it("TASK-36c5: only a player mounted with portrait: true gets the portrait class, and teardown removes it", () => {
    expect(mount(true).classList.contains("sy-portrait")).toBe(true);
    stop!();
    stop = null;
    expect(root!.classList.contains("sy-portrait")).toBe(false);
    root!.remove();
    expect(mount().classList.contains("sy-portrait")).toBe(false);
  });

  it("TASK-36c5: the exported file, the living file's Play and the Teacher tab's Try It ask for it; the Maker does not", () => {
    expect(readFileSync("src/player/index.ts", "utf8")).toContain("mountPlayer(result.stack, root, { scan: true, portrait: true })");
    expect(readFileSync("src/living/livingApp.ts", "utf8")).toContain("mountPlayer(current, root, { scan: true, portrait: true })");
    expect(readFileSync("src/living/editor.ts", "utf8")).toMatch(/flip: true,\s*portrait: true,/);
    for (const f of ["src/editor/TryItCanvas.tsx", "src/editor/PlayerPreview.tsx"]) expect(readFileSync(f, "utf8"), f).not.toContain("portrait");
  });

  it("TASK-36c5: every element carries its y as the flow order, so a portrait card reads top to bottom", () => {
    const r = mount(true);
    const card = vikingsStack().cards[0]!;
    const wrappers = Array.from(r.querySelectorAll<HTMLElement>(".sy-card .sy-element[data-element-id]"));
    expect(wrappers.length).toBe(card.elements.length);
    for (const w of wrappers) {
      const el = card.elements.find((e) => e.id === w.getAttribute("data-element-id"))!;
      expect(w.style.order).toBe(String(Math.round(el.y)));
    }
  });

  it("TASK-36c5: the rules sit behind a ≤ 600 px media query and keep the brief's sizes; desktop CSS is untouched", () => {
    const m = css.indexOf("@media (max-width: 600px) {");
    expect(m).toBeGreaterThan(0);
    const block = css.slice(m);
    expect(block).toContain(".sy-portrait { width: 94vw !important; max-width: 100%; height: calc(100vh - 88px) !important;");
    expect(block).toContain(".sy-portrait .sy-question { font-size: 28px !important;");
    expect(block).toContain(".sy-portrait .sy-tile { min-height: 64px;");
    expect(block).toContain(".sy-portrait .sy-tile-label { font-size: 24px !important;");
    expect(block).toContain(".sy-portrait .sy-meta-chrome .sy-meta { font-size: 18px; }");
    for (const f of block.matchAll(/font-size:\s*(\d+)px/g)) expect(Number(f[1])).toBeGreaterThanOrEqual(14);
    // Every portrait rule is scoped to .sy-portrait.
    for (const line of block.split("\n").slice(1)) if (line.trim().startsWith(".")) expect(line.trim().startsWith(".sy-portrait"), line).toBe(true);
  });
});
