// tests/maker/card-list.test.ts
// TASK-13: Card list.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, h } from "preact";
import { CardList } from "../../src/editor/CardList.js";
import { EditorStore } from "../../src/editor/store.js";
import { quizStack } from "./fixtures.js";

let mounted: HTMLElement | null = null;

function mount(store: EditorStore, onNotice?: (m: string | null) => void): HTMLElement {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const props = onNotice ? { store, onNotice } : { store };
  const draw = () => render(h(CardList, props), root);
  rerenderRef.current = draw;
  draw();
  mounted = root;
  return root;
}

const rerenderRef: { current: () => void } = { current: () => {} };

async function flush(): Promise<void> {
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

describe("TASK-13: Card list", () => {
  beforeEach(() => {
    localStorage.clear();
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

  function makeStorage() {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  }

  it("shows one entry per card with the right position label", () => {
    const store = freshStore();
    const root = mount(store);
    const entries = root.querySelectorAll(".card-entry");
    expect(entries.length).toBe(store.getStack()!.cards.length);
    expect(entries[0]!.querySelector(".num")?.textContent).toBe("1");
  });

  it("selecting an entry updates selectedCardId", () => {
    const store = freshStore();
    const second = store.getStack()!.cards[1]!.id;
    const root = mount(store);
    const entries = root.querySelectorAll<HTMLButtonElement>(".card-entry");
    entries[1]!.click();
    expect(store.getState().selectedCardId).toBe(second);
  });

  it("add goes through store.apply and the list re-renders longer", async () => {
    const store = freshStore();
    const root = mount(store, () => {});
    const before = root.querySelectorAll(".card-entry").length;
    root.querySelector<HTMLButtonElement>(".add-card")!.click();
    await flush();
    const after = root.querySelectorAll(".card-entry").length;
    expect(after).toBe(before + 1);
  });

  it("reorder changes order but not ids", async () => {
    const store = freshStore();
    const ids = store.getStack()!.cards.map((c) => c.id);
    // Select the first card so its move controls show.
    store.setSelectedCard(ids[0]!);
    const root = mount(store, () => {});
    // The quiz stack has 2 cards; move card 1 down.
    root.querySelector<HTMLButtonElement>('[aria-label="Move card 1 down"]')!.click();
    await flush();
    const after = store.getStack()!.cards.map((c) => c.id);
    expect(after).toEqual([ids[1], ids[0]]);
    expect([...after].sort()).toEqual([...ids].sort());
  });

  it("a flash card row shows the front term, not the back explanation", () => {
    // A flash card whose back is longer than the front — the row must still
    // show the FRONT (built-app review round 2, P1 #4).
    const stack = {
      id: "1a000000-0000-4000-8000-000000000001",
      title: "Irish words",
      theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" },
      cards: [
        {
          id: "2a000000-0000-4000-8000-000000000002",
          kind: "flash" as const,
          elements: [
            { type: "text" as const, id: "4a000000-0000-4000-8000-000000000004", x: 48, y: 264, w: 704, h: 72, content: "Dia duit" },
            { type: "text" as const, id: "5a000000-0000-4000-8000-000000000005", x: 48, y: 360, w: 704, h: 120, content: "Hello (literally, God be with you)." },
            { type: "button" as const, id: "6a000000-0000-4000-8000-000000000006", x: 408, y: 496, w: 344, h: 72, label: "Next Card", actions: [{ type: "goto" as const, cardId: "3a000000-0000-4000-8000-000000000003" }] },
          ],
          actions: [],
        },
        { id: "3a000000-0000-4000-8000-000000000003", kind: "end" as const, elements: [{ type: "field" as const, id: "7a000000-0000-4000-8000-000000000007", x: 48, y: 420, w: 704, h: 60, variable: "score" }], actions: [] },
      ],
    };
    const store = new EditorStore(
      { stack, screen: "editor" },
      { storage: makeStorage(), onChange: () => rerenderRef.current() },
    );
    const root = mount(store);
    const firstRow = root.querySelectorAll(".card-entry")[0]!;
    expect(firstRow.querySelector(".label")?.textContent).toBe("Dia duit");
    expect(firstRow.textContent).not.toContain("God be with you");
  });

  it("names a card with an image credit after the question, not the credit (TASK-25a)", () => {
    // Regression for the 5 Nov live check: a first card carrying a longer image
    // credit along the bottom was named after the credit. The row must show the
    // question (the topmost text), never the "Image:/Illustration:" caption.
    const question = "Which people began raiding Ireland around the year 795?";
    const credit = "Illustration: Stackyard, CC0 — a longer caption than the question line above";
    const stack = {
      id: "1b000000-0000-4000-8000-000000000001",
      title: "Vikings",
      theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" },
      cards: [
        {
          id: "2b000000-0000-4000-8000-000000000002",
          kind: "quiz" as const,
          elements: [
            { type: "text" as const, id: "4b000000-0000-4000-8000-000000000004", x: 48, y: 104, w: 704, h: 128, content: question },
            { type: "button" as const, id: "5b000000-0000-4000-8000-000000000005", x: 48, y: 296, w: 344, h: 96, label: "Vikings", actions: [{ type: "score" as const, delta: 1 }, { type: "goto" as const, cardId: "3b000000-0000-4000-8000-000000000003" }] },
            { type: "button" as const, id: "6b000000-0000-4000-8000-000000000006", x: 408, y: 296, w: 344, h: 96, label: "Romans", actions: [{ type: "score" as const, delta: 0 }, { type: "goto" as const, cardId: "3b000000-0000-4000-8000-000000000003" }] },
            { type: "image" as const, id: "8b000000-0000-4000-8000-000000000008", x: 504, y: 8, w: 150, h: 90, src: "data:image/svg+xml;base64,AA==", alt: "longship" },
            { type: "text" as const, id: "9b000000-0000-4000-8000-000000000009", x: 48, y: 566, w: 704, h: 28, content: credit },
          ],
          actions: [],
        },
        { id: "3b000000-0000-4000-8000-000000000003", kind: "end" as const, elements: [{ type: "field" as const, id: "7b000000-0000-4000-8000-000000000007", x: 48, y: 420, w: 704, h: 60, variable: "score" }], actions: [] },
      ],
    };
    expect(credit.length).toBeGreaterThan(question.length); // the trap
    const store = new EditorStore(
      { stack, screen: "editor" },
      { storage: makeStorage(), onChange: () => rerenderRef.current() },
    );
    const root = mount(store);
    const firstRow = root.querySelectorAll(".card-entry")[0]!;
    expect(firstRow.querySelector(".label")?.textContent).toBe(question);
    expect(firstRow.textContent).not.toContain("Illustration:");
  });

  it("a rejected removal (sole end card) shows a plain message and does not change the list", async () => {
    const store = freshStore();
    const endId = store.getStack()!.cards.find((c) => c.kind === "end")!.id;
    store.setSelectedCard(endId);
    let notice: string | null = null;
    const root = mount(store, (m) => { notice = m; });
    const before = store.getStack()!.cards.length;
    root.querySelector<HTMLButtonElement>(".remove-card")!.click();
    await flush();
    expect(store.getStack()!.cards.length).toBe(before);
    expect(notice).not.toBeNull();
    expect(String(notice).toLowerCase()).not.toContain("stack");
  });
});
