// tests/maker/round8-ui.dom.test.ts
// TASK-32b: the Maker's "Before you share" lists the lesson warnings (a two-answer
// quiz, an ambiguous key) and still lets the teacher export anyway. TASK-32d: the
// Teacher tab says plainly that flash and end cards keep their own layout.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, h } from "preact";
import { EditorScreen } from "../../src/editor/EditorScreen.js";
import { EditorStore } from "../../src/editor/store.js";
import { LivingEditor } from "../../src/living/editor.js";
import { vikingsStack, irishWordsStack } from "../../src/shared/readyMadeStacks.js";
import type { Stack } from "../../src/shared/types.js";
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
});
afterEach(() => {
  if (mounted) render(null, mounted);
  mounted = null;
  vi.unstubAllGlobals();
});

function mountEditor(stack: Stack): { root: HTMLElement; fetchSpy: ReturnType<typeof vi.fn> } {
  const ref = { draw: (): void => {} };
  const store = new EditorStore({ stack, screen: "editor" }, { storage: makeStorage(), onChange: () => ref.draw() });
  const root = document.createElement("div");
  document.body.appendChild(root);
  ref.draw = () => render(h(EditorScreen, { store }), root);
  ref.draw();
  mounted = root;
  const fetchSpy = vi.fn(async () =>
    new Response("<!doctype html><html></html>", { status: 200, headers: { "Content-Type": "text/html", "Content-Disposition": 'attachment; filename="x.html"' } }),
  );
  vi.stubGlobal("fetch", fetchSpy);
  URL.createObjectURL = vi.fn(() => "blob:x") as never;
  URL.revokeObjectURL = vi.fn() as never;
  return { root, fetchSpy };
}
const byText = (root: HTMLElement, t: string): HTMLButtonElement | undefined =>
  Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((b) => (b.textContent ?? "").includes(t));

describe("TASK-32b: lesson warnings in the Maker's Before you share", () => {
  it("TASK-32b: a two-answer quiz and an ambiguous key are listed, nothing is downloaded yet, and Export anyway exports", async () => {
    const stack = quizStack();
    const quiz = stack.cards[0]!;
    // Two answers, and the right one ("Dublin") inside the wrong one ("Dublin city").
    quiz.elements = quiz.elements.filter((e) => e.type !== "button" || e.label !== "Galway");
    const cork = quiz.elements.find((e) => e.type === "button" && e.label === "Cork")!;
    if (cork.type === "button") cork.label = "Dublin city";
    const { root, fetchSpy } = mountEditor(stack);
    root.querySelector<HTMLButtonElement>(".export-btn")!.click();
    await flush();
    expect(root.querySelector(".share-dialog")).not.toBeNull();
    const text = root.querySelector(".share-check")!.textContent ?? "";
    expect(text).toContain("has only two answers: add one.");
    expect(text).toContain("“Dublin” and the wrong answer “Dublin city” overlap");
    expect(fetchSpy).not.toHaveBeenCalled();
    // A warning, not a block: no "Link these in" (nothing to link), and Export anyway works.
    expect(byText(root, "Link these in for me")).toBeUndefined();
    byText(root, "Export anyway")!.click();
    await flush();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("TASK-32b: a healthy three-answer deck still exports in one click", async () => {
    const { root, fetchSpy } = mountEditor(quizStack());
    root.querySelector<HTMLButtonElement>(".export-btn")!.click();
    await flush();
    expect(root.querySelector(".share-dialog")).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("TASK-32d: the Teacher tab says which cards can't be dragged", () => {
  function inspectorFor(stack: Stack, cardIndex: number): string {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const editor = new LivingEditor(stack, host, () => {});
    editor.render();
    editor.selectCard(stack.cards[cardIndex]!.id);
    const text = host.querySelector(".sy-living-inspector")?.textContent ?? "";
    host.remove();
    return text;
  }
  const HINT = "This card keeps its own layout, so its words can't be dragged.";

  it("TASK-32d: on a flash card and on the last card — and not on a quiz card", () => {
    const viking = vikingsStack();
    const flashIx = viking.cards.findIndex((c) => c.kind === "flash");
    const endIx = viking.cards.findIndex((c) => c.kind === "end");
    const quizIx = viking.cards.findIndex((c) => c.kind === "quiz");
    expect(inspectorFor(viking, flashIx)).toContain(HINT);
    expect(inspectorFor(viking, endIx)).toContain(HINT);
    expect(inspectorFor(viking, quizIx)).not.toContain(HINT);
    expect(inspectorFor(irishWordsStack(), 0)).toContain(HINT);
  });
});
