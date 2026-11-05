// tests/maker/inspector.test.ts
// TASK-15: Inspector dispatches the right operations.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, h } from "preact";
import { Inspector } from "../../src/editor/Inspector.js";
import { EditorStore } from "../../src/editor/store.js";
import type { ButtonElement } from "../../src/shared/types.js";
import { quizStack, storyStack } from "./fixtures.js";

let mounted: HTMLElement | null = null;
const rerenderRef: { current: () => void } = { current: () => {} };
let lastNotice: string | null = null;

function mount(store: EditorStore): HTMLElement {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const draw = () => render(h(Inspector, { store, onNotice: (m: string | null) => { lastNotice = m; } }), root);
  rerenderRef.current = draw;
  draw();
  mounted = root;
  return root;
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

function makeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

function store(stack = quizStack()): EditorStore {
  const s = new EditorStore(
    { stack, screen: "editor" },
    { storage: makeStorage(), onChange: () => rerenderRef.current() },
  );
  s.setSelectedCard(stack.cards[0]!.id);
  return s;
}

describe("TASK-15: Inspector", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    lastNotice = null;
  });
  afterEach(() => {
    if (mounted) render(null, mounted);
    mounted = null;
  });

  it("editing a quiz answer label dispatches editLabel", async () => {
    const s = store();
    const quiz = s.getStack()!.cards[0]!;
    // Select the 'Cork' (wrong) button.
    const cork = quiz.elements.find(
      (e): e is ButtonElement => e.type === "button" && e.label === "Cork",
    )!;
    s.setSelectedElement(cork.id);
    const root = mount(s);
    const input = root.querySelector<HTMLInputElement>("#label")!;
    input.value = "Waterford";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    const after = s.getStack()!.cards[0]!.elements.find((e) => e.id === cork.id)!;
    expect(after.type === "button" && after.label).toBe("Waterford");
  });

  it("marking a tile correct dispatches markCorrect (exactly one correct)", async () => {
    const s = store();
    const quiz = s.getStack()!.cards[0]!;
    const cork = quiz.elements.find(
      (e): e is ButtonElement => e.type === "button" && e.label === "Cork",
    )!;
    s.setSelectedElement(cork.id);
    mount(s);
    const toggle = document.querySelector<HTMLButtonElement>(".toggle-row")!;
    toggle.click();
    await flush();
    const after = s.getStack()!.cards[0]!;
    const correct = after.elements.filter(
      (e) => e.type === "button" && e.actions.some((a) => a.type === "score" && a.delta === 1),
    );
    expect(correct.length).toBe(1);
    expect(correct[0]!.id).toBe(cork.id);
  });

  it("the goto picker lists existing cards by plain name, never raw ids", async () => {
    const s = store(storyStack());
    const story = s.getStack()!.cards[0]!;
    const nextBtn = story.elements.find(
      (e): e is ButtonElement => e.type === "button",
    )!;
    s.setSelectedElement(nextBtn.id);
    const root = mount(s);
    const options = Array.from(root.querySelectorAll<HTMLOptionElement>("#goto option"));
    expect(options.length).toBeGreaterThan(0);
    for (const opt of options) {
      // No option TEXT is a raw UUID.
      expect(/^[0-9a-f-]{36}$/i.test(opt.textContent ?? "")).toBe(false);
    }
    // The end card appears as "Last card".
    expect(options.some((o) => (o.textContent ?? "").includes("Last card"))).toBe(true);
  });

  it("changing the card kind dispatches changeKind", async () => {
    const s = store(storyStack());
    mount(s);
    const select = document.querySelector<HTMLSelectElement>("#kind")!;
    select.value = "quiz";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();
    expect(s.getStack()!.cards[0]!.kind).toBe("quiz");
  });

  it("a rejected edit (empty label) surfaces a plain message and leaves the stack unchanged", async () => {
    const s = store();
    const quiz = s.getStack()!.cards[0]!;
    const dublin = quiz.elements.find(
      (e): e is ButtonElement => e.type === "button" && e.label === "Dublin",
    )!;
    s.setSelectedElement(dublin.id);
    const before = JSON.stringify(s.getStack());
    const root = mount(s);
    const input = root.querySelector<HTMLInputElement>("#label")!;
    input.value = "   ";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    expect(JSON.stringify(s.getStack())).toBe(before);
    expect(lastNotice).not.toBeNull();
    expect(String(lastNotice).toLowerCase()).not.toContain("stack");
  });
});
