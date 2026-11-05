// tests/maker/canvas.test.ts
// TASK-14: Canvas reuses the player renderer.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, h } from "preact";
import { Canvas } from "../../src/editor/Canvas.js";
import { EditorStore } from "../../src/editor/store.js";
import { quizStack } from "./fixtures.js";

let mounted: HTMLElement | null = null;
const rerenderRef: { current: () => void } = { current: () => {} };

function mount(store: EditorStore): HTMLElement {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const draw = () => render(h(Canvas, { store }), root);
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

describe("TASK-14: Canvas", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  afterEach(() => {
    if (mounted) render(null, mounted);
    mounted = null;
  });

  function freshStore(): EditorStore {
    const stack = quizStack();
    const store = new EditorStore(
      { stack, screen: "editor" },
      { storage: makeStorage(), onChange: () => rerenderRef.current() },
    );
    store.setSelectedCard(stack.cards[0]!.id);
    return store;
  }

  it("draws the selected card's text and labels via the reused renderer", async () => {
    const store = freshStore();
    const root = mount(store);
    await flush();
    const text = root.textContent ?? "";
    expect(text).toContain("Where did the Vikings build a town in 841?");
    expect(text).toContain("Dublin");
    expect(text).toContain("Cork");
    // The reused renderer's own card class is present.
    expect(root.querySelector(".sy-card")).not.toBeNull();
    expect(root.querySelectorAll(".sy-tile").length).toBe(2);
  });

  it("clicking a rendered element selects it (selectedElementId set)", async () => {
    const store = freshStore();
    const root = mount(store);
    await flush();
    const firstWrapper = root.querySelector<HTMLElement>(".sy-card .sy-element");
    expect(firstWrapper).not.toBeNull();
    const firstElementId = store.getStack()!.cards[0]!.elements[0]!.id;
    firstWrapper!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    expect(store.getState().selectedElementId).toBe(firstElementId);
  });

  it("switching the selected card re-renders the canvas", async () => {
    const store = freshStore();
    const root = mount(store);
    await flush();
    expect(root.textContent).toContain("Dublin");
    // Select the end card; its content differs (no Dublin tile).
    const endId = store.getStack()!.cards.find((c) => c.kind === "end")!.id;
    store.setSelectedCard(endId);
    await flush();
    expect(root.querySelector(".sy-end-card")).not.toBeNull();
    expect(root.textContent).not.toContain("Dublin");
  });
});
