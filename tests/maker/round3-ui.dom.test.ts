// tests/maker/round3-ui.dom.test.ts
// TASK-27 d, f, t: the Start screen fits and offers each ready-made deck once;
// the "Before you share" check runs BEFORE any download; the picture note.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, h } from "preact";
import { EditorScreen } from "../../src/editor/EditorScreen.js";
import { StartScreen, asksForPictures, PICTURES_NOTE, dealScaleFor, GeneratingScreen } from "../../src/editor/StartScreen.js";
import { EditorStore } from "../../src/editor/store.js";
import { _resetAnnouncer } from "../../src/editor/a11y.js";
import { PLACEHOLDER_WORDS } from "../../src/shared/reachability.js";
import { quizStack } from "./fixtures.js";

class FakeResizeObserver { observe(): void {} unobserve(): void {} disconnect(): void {} }
(globalThis as unknown as Record<string, unknown>)["ResizeObserver"] = FakeResizeObserver;

function makeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}
const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
};

let mounted: HTMLElement | null = null;
beforeEach(() => {
  document.body.innerHTML = "";
  _resetAnnouncer();
});
afterEach(() => {
  if (mounted) render(null, mounted);
  mounted = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("TASK-27f: the share check runs before the download", () => {
  function mountEditor(placeholder: boolean): { root: HTMLElement; fetchSpy: ReturnType<typeof vi.fn> } {
    const stack = quizStack();
    if (placeholder) {
      const q = stack.cards[0]!.elements.find((e) => e.type === "text")!;
      if (q.type === "text") q.content = PLACEHOLDER_WORDS.question;
    }
    const ref = { draw: () => {} };
    const store = new EditorStore({ stack, screen: "editor" }, { storage: makeStorage(), onChange: () => ref.draw() });
    const root = document.createElement("div");
    document.body.appendChild(root);
    ref.draw = () => render(h(EditorScreen, { store }), root);
    ref.draw();
    mounted = root;
    const fetchSpy = vi.fn(async () =>
      new Response("<!doctype html><html></html>", {
        status: 200,
        headers: { "Content-Type": "text/html", "Content-Disposition": 'attachment; filename="x.html"' },
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    URL.createObjectURL = vi.fn(() => "blob:x") as never;
    URL.revokeObjectURL = vi.fn() as never;
    return { root, fetchSpy };
  }
  const exportBtn = (root: HTMLElement): HTMLButtonElement => root.querySelector<HTMLButtonElement>(".export-btn")!;
  const byText = (root: HTMLElement, t: string): HTMLButtonElement | undefined =>
    Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((b) => (b.textContent ?? "").includes(t));

  it("an untouched placeholder card stops the export, with nothing downloaded yet", async () => {
    const { root, fetchSpy } = mountEditor(true);
    exportBtn(root).click();
    await flush();
    expect(root.querySelector(".share-dialog")).not.toBeNull();
    expect(root.textContent).toContain("Before you share");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(byText(root, "Take me to the card")).toBeDefined();
    expect(byText(root, "Export anyway")).toBeDefined();
  });

  it("'Export anyway' then downloads", async () => {
    const { root, fetchSpy } = mountEditor(true);
    exportBtn(root).click();
    await flush();
    byText(root, "Export anyway")!.click();
    await flush();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("a healthy deck exports in one click, no dialog", async () => {
    const { root, fetchSpy } = mountEditor(false);
    exportBtn(root).click();
    await flush();
    expect(root.querySelector(".share-dialog")).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("TASK-27d/t: Start screen", () => {
  function mountStart(): HTMLElement {
    const root = document.createElement("div");
    document.body.appendChild(root);
    render(h(StartScreen, { store: new EditorStore({}, { storage: makeStorage() }) }), root);
    mounted = root;
    return root;
  }

  it("offers each ready-made deck once, as links in one row", () => {
    const root = mountStart();
    expect(root.querySelectorAll(".ready-made-row").length).toBeLessThanOrEqual(1);
    const names = Array.from(root.querySelectorAll(".ready-made-link")).map((b) => b.textContent);
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBeGreaterThanOrEqual(3);
  });

  it("the page can scroll rather than clip (CSS uses overflow-y:auto and a margin:auto child)", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("src/editor/styles.css", "utf8");
    const area = css.match(/\.start-area\s*\{[^}]*\}/)![0];
    expect(area).toContain("overflow-y: auto");
    expect(area).not.toMatch(/overflow:\s*hidden/);
    expect(css).toMatch(/\.stage-start\s*\{[^}]*margin:\s*auto/);
  });

  it("notes when the teacher asked for pictures", () => {
    expect(asksForPictures("A quiz with pictures of castles")).toBe(true);
    expect(asksForPictures("A quiz about castles")).toBe(false);
    expect(PICTURES_NOTE).toBe("Pictures aren't added automatically yet. Use Add Picture.");
  });
});

describe("TASK-27k: the wait screen is about the teacher's sentence", () => {
  it("writes the sentence on the top card from the very start, and scales the pile", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    mounted = root;
    render(h(GeneratingScreen, { dealt: [], total: 0, offline: false, title: null, sentence: "Quiz about whales" }), root);
    expect(root.querySelector(".deal-card.c4 .deal-sentence")?.textContent).toBe("Quiz about whales");
    expect((root.querySelector(".deal") as HTMLElement).style.getPropertyValue("--deal-scale")).not.toBe("");
  });

  it("the card text starts at least 48px below the rings", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("src/editor/styles.css", "utf8");
    expect(css.match(/\.deal-card\s*\{[^}]*\}/)![0]).toMatch(/padding:\s*48px/);
  });

  it("dealScaleFor shrinks on a small viewport and is clamped to 0.7–1.5", () => {
    expect(dealScaleFor({ w: 700, h: 500 })).toBeLessThan(dealScaleFor({ w: 1366, h: 768 }));
    expect(dealScaleFor({ w: 100, h: 100 })).toBe(0.7);
    expect(dealScaleFor({ w: 3000, h: 2000 })).toBe(1.5);
  });
});
