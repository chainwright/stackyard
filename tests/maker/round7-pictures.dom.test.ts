// tests/maker/round7-pictures.dom.test.ts
// TASK-31h: a pictogram shows on the player's cards (flash included), in the
// Maker's flash preview, and the teacher can add, swap and remove it.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, h } from "preact";
import { renderCard } from "../../src/player/renderer.js";
import { createRuntime } from "../../src/player/runtime.js";
import { Canvas } from "../../src/editor/Canvas.js";
import { Inspector } from "../../src/editor/Inspector.js";
import { EditorStore } from "../../src/editor/store.js";
import { setPictogram, pictogramOf } from "../../src/editor/operations.js";
import { isRejected } from "../../src/editor/types.js";
import { PICTOGRAM_CREDIT, PICTOGRAM_NAMES, pictogramDataUri } from "../../src/shared/pictograms.js";
import { PICTURE_SLOT, PICTURE_CREDIT } from "../../src/shared/layout.js";
import { PICTURES_NOTE, PICTURES_ADDED_NOTE, hasPictograms } from "../../src/editor/StartScreen.js";
import { validate } from "../../src/shared/validator.js";
import type { Card, Stack } from "../../src/shared/types.js";
import { quizStack } from "./fixtures.js";

class FakeResizeObserver { observe(): void {} unobserve(): void {} disconnect(): void {} }
(globalThis as unknown as Record<string, unknown>)["ResizeObserver"] = FakeResizeObserver;

const u = (n: number): string => `c7c70000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const THEME = { background: "#fff", foreground: "#000", font: "sans-serif" };
const flush = async (): Promise<void> => {
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 5));
};
function makeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

/** A flash card (with a back) that carries the sun pictogram — and an OLD credit line
 *  from before TASK-32c, which must never be drawn. */
function flashWithPicture(): Stack {
  const flash: Card = {
    id: u(1), kind: "flash", actions: [],
    elements: [
      { type: "text", id: u(11), x: 48, y: 264, w: 704, h: 72, content: "Evaporation" },
      { type: "text", id: u(12), x: 48, y: 360, w: 704, h: 120, content: "Water turns into vapour when the sun heats it." },
      { type: "button", id: u(13), x: 408, y: 496, w: 344, h: 72, label: "Next Card", actions: [{ type: "goto", cardId: u(2) }] },
      { type: "image", id: u(14), ...PICTURE_SLOT, src: pictogramDataUri("sun"), alt: "Picture: sun" },
      { type: "text", id: u(15), ...PICTURE_CREDIT, content: PICTOGRAM_CREDIT },
    ],
  };
  const end: Card = { id: u(2), kind: "end", actions: [], elements: [{ type: "text", id: u(21), x: 48, y: 120, w: 704, h: 72, content: "Done" }] };
  return { id: u(0), title: "Water", theme: THEME, cards: [flash, end] };
}

let mounted: HTMLElement | null = null;
beforeEach(() => {
  document.body.innerHTML = "";
});
afterEach(() => {
  if (mounted) render(null, mounted);
  mounted = null;
});

describe("TASK-31h: the player draws the picture", () => {
  it("TASK-32c: a flash card shows the picture with NO credit line (even an old one), the term is still the term", () => {
    const stack = flashWithPicture();
    const root = document.createElement("div");
    document.body.appendChild(root);
    renderCard(stack.cards[0]!, root, createRuntime(stack), () => {}, () => {}, { position: 1, total: 2 });
    const img = root.querySelector<HTMLImageElement>(".sy-image")!;
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toBe(pictogramDataUri("sun"));
    expect(img.getAttribute("alt")).toBe("Picture: sun");
    expect(root.textContent).not.toContain(PICTOGRAM_CREDIT);
    expect(root.querySelector(".sy-flash-term")?.textContent).toBe("Evaporation");
    // Tapping flips to the real back, not to the credit.
    root.querySelector<HTMLElement>(".sy-flash")!.click();
    expect(root.querySelector(".sy-flash-back")?.textContent).toBe("Water turns into vapour when the sun heats it.");
    expect(root.textContent).not.toContain(PICTOGRAM_CREDIT);
    expect(root.querySelector(".sy-image")).not.toBeNull();
    // The picture takes no tap: it sits over the card with pointer-events off.
    expect((img.closest(".sy-element") as HTMLElement).style.pointerEvents).toBe("none");
  });

  it("TASK-32c: a quiz card made by setPictogram shows the picture and no credit text", () => {
    const stack = setPictogram(quizStack(), quizStack().cards[0]!.id, "book") as Stack;
    const card = stack.cards[0]!;
    const root = document.createElement("div");
    document.body.appendChild(root);
    renderCard(card, root, createRuntime(stack), () => {}, () => {}, { position: 1, total: 2 });
    expect(root.querySelector(".sy-image")?.getAttribute("src")).toBe(pictogramDataUri("book"));
    expect(root.querySelectorAll(".sy-question")).toHaveLength(1);
    expect(root.textContent).not.toContain(PICTOGRAM_CREDIT);
    expect(card.elements.some((e) => e.type === "text" && e.content === PICTOGRAM_CREDIT)).toBe(false);
  });
});

describe("TASK-31h: the Maker's flash preview draws the picture on both sides", () => {
  it("TASK-32c: front and back both show the picture, and no credit line", async () => {
    const stack = flashWithPicture();
    const ref = { draw: (): void => {} };
    const store = new EditorStore({ stack, screen: "editor" }, { storage: makeStorage(), onChange: () => ref.draw() });
    store.setSelectedCard(stack.cards[0]!.id);
    const root = document.createElement("div");
    document.body.appendChild(root);
    mounted = root;
    for (const side of ["front", "back"] as const) {
      ref.draw = (): void => render(h(Canvas, { store, flashSide: side }), root);
      ref.draw();
      await flush();
      expect(root.querySelector(".sy-image")?.getAttribute("src"), side).toBe(pictogramDataUri("sun"));
      expect(root.textContent, side).not.toContain(PICTOGRAM_CREDIT);
    }
  });
});

describe("TASK-31h: setPictogram — add, swap, remove", () => {
  it("TASK-32c: adds a picture with no credit line, swaps it without doubling, removes it — and clears an OLD credit line too", () => {
    const stack = quizStack();
    const id = stack.cards[0]!.id;
    const added = setPictogram(stack, id, "sun");
    expect(isRejected(added as never)).toBe(false);
    const a = added as Stack;
    expect(pictogramOf(a.cards[0]!)).toBe("sun");
    expect(a.cards[0]!.elements.some((e) => e.type === "text" && e.content === PICTOGRAM_CREDIT)).toBe(false);
    expect(validate(a).valid).toBe(true);
    // An older file's credit line comes off when the picture is swapped.
    a.cards[0]!.elements.push({ type: "text", id: u(51), ...PICTURE_CREDIT, content: PICTOGRAM_CREDIT });
    const swapped = setPictogram(a, id, "moon") as Stack;
    expect(pictogramOf(swapped.cards[0]!)).toBe("moon");
    expect(swapped.cards[0]!.elements.filter((e) => e.type === "image")).toHaveLength(1);
    expect(swapped.cards[0]!.elements.some((e) => e.type === "text" && e.content === PICTOGRAM_CREDIT)).toBe(false);
    const removed = setPictogram(swapped, id, null) as Stack;
    expect(removed.cards[0]!.elements.some((e) => e.type === "image")).toBe(false);
    expect(validate(removed).valid).toBe(true);
  });

  it("TASK-31h: refuses the last card, an unknown name and a flash card with no back — and leaves a teacher's own picture alone", () => {
    const stack = quizStack();
    const endId = stack.cards[1]!.id;
    expect(isRejected(setPictogram(stack, endId, "sun") as never)).toBe(true);
    expect(isRejected(setPictogram(stack, stack.cards[0]!.id, "unicorn") as never)).toBe(true);
    const noBack = flashWithPicture();
    noBack.cards[0]!.elements = noBack.cards[0]!.elements.filter((e) => e.id !== u(12) && e.id !== u(14) && e.id !== u(15));
    expect(isRejected(setPictogram(noBack, noBack.cards[0]!.id, "sun") as never)).toBe(true);
    const own = quizStack();
    own.cards[0]!.elements.push({ type: "image", id: u(41), x: 600, y: 10, w: 100, h: 80, src: "data:image/png;base64,AAAA", alt: "my photo" });
    const withSun = setPictogram(own, own.cards[0]!.id, "sun") as Stack;
    const back = setPictogram(withSun, own.cards[0]!.id, null) as Stack;
    expect(back.cards[0]!.elements.some((e) => e.type === "image" && e.alt === "my photo")).toBe(true);
  });
});

describe("TASK-31h: the Inspector's Picture select", () => {
  function mountInspector(stack: Stack, cardIndex = 0): { store: EditorStore; root: HTMLElement } {
    const ref = { draw: (): void => {} };
    const store = new EditorStore({ stack, screen: "editor" }, { storage: makeStorage(), onChange: () => ref.draw() });
    store.setSelectedCard(stack.cards[cardIndex]!.id);
    const root = document.createElement("div");
    document.body.appendChild(root);
    ref.draw = (): void => render(h(Inspector, { store }), root);
    ref.draw();
    mounted = root;
    return { store, root };
  }

  it("TASK-31h: lists None and every name; choosing one adds the picture, choosing None removes it", async () => {
    const { store, root } = mountInspector(quizStack());
    const sel = root.querySelector<HTMLSelectElement>("#picture")!;
    expect(sel).not.toBeNull();
    expect(sel.options).toHaveLength(PICTOGRAM_NAMES.length + 1);
    expect(sel.options[0]!.textContent).toBe("None");
    sel.value = "castle";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();
    expect(pictogramOf(store.getStack()!.cards[0]!)).toBe("castle");
    expect(root.querySelector<HTMLSelectElement>("#picture")!.value).toBe("castle");
    const sel2 = root.querySelector<HTMLSelectElement>("#picture")!;
    sel2.value = "";
    sel2.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();
    expect(pictogramOf(store.getStack()!.cards[0]!)).toBeNull();
    expect(store.getStack()!.cards[0]!.elements.some((e) => e.type === "image")).toBe(false);
  });

  it("TASK-31h: the last card has no Picture select", () => {
    const { root } = mountInspector(quizStack(), 1);
    expect(root.querySelector("#picture")).toBeNull();
  });
});

describe("TASK-31h: the Start-screen note tells the truth", () => {
  it("TASK-31h: one wording when some cards got a picture, another when none did", () => {
    expect(PICTURES_ADDED_NOTE).toBe("We added a simple picture to some cards. For a photo, use Add Picture.");
    expect(PICTURES_NOTE).toBe("No pictures were added this time. Use Add Picture.");
    expect(PICTURES_NOTE).not.toMatch(/automatically/);
    expect(hasPictograms(flashWithPicture())).toBe(true);
    expect(hasPictograms(quizStack())).toBe(false);
  });
});
