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

  it("adding a plain button to a quiz keeps the answer tiles rendered as tiles (built-app P1)", async () => {
    const store = freshStore();
    const root = mount(store);
    await flush();
    // The quiz starts with two answer tiles.
    expect(root.querySelectorAll(".sy-tile").length).toBe(2);

    // Add a plain button (no actions) to the quiz card.
    const { addButtonElement } = await import("../../src/editor/operations.js");
    const cardId = store.getStack()!.cards[0]!.id;
    store.apply((s) => addButtonElement(s, cardId, "New button"));
    await flush();

    // The two answer tiles are STILL tiles (not restyled to generic buttons),
    // and the new plain button renders as a generic button, not a tile.
    expect(root.querySelectorAll(".sy-tile").length).toBe(2);
    const generic = Array.from(root.querySelectorAll<HTMLElement>(".sy-button"));
    expect(generic.some((b) => (b.textContent ?? "").includes("New button"))).toBe(true);
  });

  it("Add Text lands below the lowest element, not on the question", async () => {
    const store = freshStore();
    const cardId = store.getStack()!.cards[0]!.id;
    const { addTextElement } = await import("../../src/editor/operations.js");
    store.apply((s) => addTextElement(s, cardId, "New text"));
    const card = store.getStack()!.cards[0]!;
    const question = card.elements.find((e) => e.type === "text")!;
    const added = card.elements.find((e) => e.type === "text" && e.content === "New text")!;
    // The new text sits below the lowest pre-existing element (the answer tiles
    // at y=200+80=280), so it never overprints the question at the top.
    expect(added.y).toBeGreaterThan(question.y + question.h);
    // And it fits on the canvas.
    expect(added.y + added.h).toBeLessThanOrEqual(600);
  });

  it("dragging an element moves it through moveElement (one coalesced undo step)", async () => {
    const store = freshStore();
    const root = mount(store);
    await flush();

    const cardId = store.getStack()!.cards[0]!.id;
    const question = store.getStack()!.cards[0]!.elements[0]!;
    const startX = question.x;
    const startY = question.y;

    const wrapper = root.querySelector<HTMLElement>(".sy-card .sy-element")!;
    // jsdom lacks setPointerCapture; stub it so the handler doesn't throw.
    (wrapper as unknown as { setPointerCapture?: () => void }).setPointerCapture = () => {};

    // jsdom has no PointerEvent; a MouseEvent with the pointer* type name and
    // clientX/Y drives the same Preact onPointer* handlers.
    const pointer = (type: string, x: number, y: number): MouseEvent =>
      new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });

    wrapper.dispatchEvent(pointer("pointerdown", 100, 100));
    await flush();
    const stackDiv = root.querySelector<HTMLElement>(".sy-card-stack")!;
    stackDiv.dispatchEvent(pointer("pointermove", 160, 140));
    await flush();
    stackDiv.dispatchEvent(pointer("pointerup", 160, 140));
    await flush();

    const moved = store.getStack()!.cards[0]!.elements[0]!;
    // It moved right/down (exact px depends on scale, but it changed).
    expect(moved.x !== startX || moved.y !== startY).toBe(true);

    // The whole drag is ONE undo step: a single undo restores the start.
    store.undo();
    const restored = store.getStack()!.cards[0]!.elements[0]!;
    expect(restored.x).toBe(startX);
    expect(restored.y).toBe(startY);
    void cardId;
  });
});
