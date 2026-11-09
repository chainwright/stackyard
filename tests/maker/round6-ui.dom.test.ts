// tests/maker/round6-ui.dom.test.ts
// TASK-30d (Start-screen lesson-file link), plus later round-6 Maker DOM tests.

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, h } from "preact";
import { readFileSync } from "node:fs";
import { StartScreen } from "../../src/editor/StartScreen.js";
import { Inspector } from "../../src/editor/Inspector.js";
import { EditorScreen } from "../../src/editor/EditorScreen.js";
import type { Card, Stack } from "../../src/shared/types.js";
import { EditorStore } from "../../src/editor/store.js";
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
/** The fixture's end card has no heading; give it one like a real deck. */
function withHeading<T extends { cards: Array<{ kind: string; elements: unknown[] }> }>(stack: T): T {
  const end = stack.cards.find((c) => c.kind === "end")!;
  end.elements.unshift({ type: "text", id: "70000000-0000-4000-8000-0000000000aa", x: 48, y: 120, w: 704, h: 72, content: "Well done!" });
  return stack;
}
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 5));

let mounted: HTMLElement | null = null;
afterEach(() => {
  if (mounted) render(null, mounted);
  mounted = null;
  document.body.innerHTML = "";
});

describe("TASK-30d: the Start screen links to a lesson file that works offline", () => {
  it("TASK-30d: one new-tab link to the Vikings sample, with a one-line hint", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    mounted = root;
    render(h(StartScreen, { store: new EditorStore({ status: "idle" }), __demoDealt: [], __demoTotal: 0 }), root);
    await new Promise((r) => setTimeout(r, 5));
    const links = Array.from(root.querySelectorAll("a")).filter((a) => a.textContent?.includes("Open a lesson file"));
    expect(links).toHaveLength(1);
    const a = links[0] as HTMLAnchorElement;
    expect(a.textContent?.trim()).toBe("Open a lesson file (works with Wi-Fi off)");
    expect(a.getAttribute("href")).toBe("/samples/vikings-in-ireland.html");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toContain("noopener");
    expect(root.textContent).toContain("Try the Teacher tab in its corner.");
  });

  it("TASK-30d: the line is quiet — no stamp red in its CSS", () => {
    const css = readFileSync("src/editor/styles.css", "utf8");
    const rules = css.split("\n").filter((l) => l.includes(".lesson-file-"));
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) expect(r).not.toMatch(/stamp|#CE3926/i);
  });
});

describe("TASK-30g: the last card's message is editable in the Maker inspector", () => {
  function mountEnd() {
    const stack = withHeading(quizStack());
    const end = stack.cards.find((c) => c.kind === "end")!;
    const ref = { draw: (): void => {} };
    const store = new EditorStore({ stack, screen: "editor" }, { storage: makeStorage(), onChange: () => ref.draw() });
    store.setSelectedCard(end.id);
    const root = document.createElement("div");
    document.body.appendChild(root);
    ref.draw = (): void => render(h(Inspector, { store }), root);
    ref.draw();
    mounted = root;
    return { store, root, endId: end.id };
  }
  const endTexts = (store: EditorStore, id: string) =>
    store.getState().stack!.cards.find((c) => c.id === id)!.elements.filter((e) => e.type === "text");

  it("TASK-30g: 'Message (optional)' creates the body text, edits it, and removes it when cleared", async () => {
    const { store, root, endId } = mountEnd();
    const box = root.querySelector<HTMLTextAreaElement>("#end-message")!;
    expect(box).not.toBeNull();
    expect(root.querySelector('label[for="end-message"]')?.textContent).toBe("Message (optional)");
    expect(box.getAttribute("maxlength")).toBe("300");
    expect(endTexts(store, endId)).toHaveLength(1);

    box.value = "Well done, 4th class!";
    box.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    const after = endTexts(store, endId);
    expect(after).toHaveLength(2);
    expect((after[1] as { content: string }).content).toBe("Well done, 4th class!");

    const box2 = root.querySelector<HTMLTextAreaElement>("#end-message")!;
    box2.value = "";
    box2.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(endTexts(store, endId)).toHaveLength(1);
  });

  it("TASK-30g: setEndMessage caps the message at 300 characters", async () => {
    const { setEndMessage } = await import("../../src/editor/operations.js");
    const stack = withHeading(quizStack());
    const end = stack.cards.find((c) => c.kind === "end")!;
    const out = setEndMessage(stack, end.id, "x".repeat(500));
    expect("cards" in out).toBe(true);
    const body = (out as typeof stack).cards.find((c) => c.id === end.id)!.elements.filter((e) => e.type === "text")[1] as { content: string };
    expect(body.content).toHaveLength(300);
  });
});

describe("TASK-30h: the Maker never inlines a font as a data: URI", () => {
  it("TASK-30h: vite.config.ts keeps .woff2 files out of assetsInlineLimit", () => {
    const cfg = readFileSync("vite.config.ts", "utf8");
    expect(cfg).toMatch(/assetsInlineLimit:\s*\(file: string\)\s*=>\s*\(file\.endsWith\("\.woff2"\)\s*\?\s*false/);
  });
});

describe("TASK-30i: the insert notice clears once 'Link these in for me' has run (rendered)", () => {
  const uid = (n: number): string => `c6c60000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
  const story = (n: number, text: string, targets: Array<[string, number]>): Card => ({
    id: uid(n), kind: "story", actions: [],
    elements: [
      { type: "text", id: uid(1000 + n), x: 48, y: 104, w: 704, h: 120, content: text },
      ...targets.map(([label, to], i) => ({
        type: "button" as const, id: uid(2000 + n * 10 + i), x: 48, y: 240 + i * 100, w: 704, h: 80,
        label, actions: [{ type: "goto" as const, cardId: uid(to) }],
      })),
    ],
  });
  const forkDeck = (): Stack => ({
    id: uid(9000), title: "Forest", theme: { background: "#fff", foreground: "#000", font: "sans-serif" },
    cards: [
      story(0, "A fork in the path.", [["Go to the cave", 2], ["Go to the forest", 3]]),
      story(1, "A quiet glade.", [["Continue", 4]]),
      story(2, "The cave is dark.", [["Continue", 4]]),
      story(3, "The forest.", [["Look around", 1], ["Leave", 4]]),
      { id: uid(4), kind: "end", actions: [], elements: [{ type: "text", id: uid(1004), x: 48, y: 120, w: 704, h: 72, content: "The end" }] },
    ],
  });
  const byText = (root: HTMLElement, t: string): HTMLButtonElement | undefined =>
    Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((b) => (b.textContent ?? "").includes(t));

  it("TASK-30i: insert after a fork → the notice shows; run the repair → the notice is gone", async () => {
    document.body.innerHTML = "";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<!doctype html><html></html>", { status: 200, headers: { "Content-Type": "text/html", "Content-Disposition": 'attachment; filename="x.html"' } })));
    URL.createObjectURL = vi.fn(() => "blob:x") as never;
    URL.revokeObjectURL = vi.fn() as never;
    const stack = forkDeck();
    const ref = { draw: (): void => {} };
    const store = new EditorStore({ stack, screen: "editor" }, { storage: makeStorage(), onChange: () => ref.draw() });
    store.setSelectedCard(uid(0));
    const root = document.createElement("div");
    document.body.appendChild(root);
    ref.draw = (): void => render(h(EditorScreen, { store }), root);
    ref.draw();
    mounted = root;

    root.querySelector<HTMLButtonElement>(".add-card")!.click();
    await tick();
    const notice = (): string => root.querySelector(".notice")?.textContent ?? "";
    expect(notice()).toContain("Choose where this card leads");

    root.querySelector<HTMLButtonElement>(".export-btn")!.click();
    await tick();
    expect(root.querySelector(".share-dialog")).not.toBeNull();
    expect(root.textContent).toContain("Choose which story choice should lead here");
    byText(root, "Link these in for me")!.click();
    await tick();
    expect(notice()).not.toContain("Choose where this card leads");
    expect(notice()).toBe("");
    // The fork card kept both of its choices.
    expect(store.getStack()!.cards[0]!.elements.filter((e) => e.type === "button")).toHaveLength(2);
    vi.unstubAllGlobals();
  });
});
