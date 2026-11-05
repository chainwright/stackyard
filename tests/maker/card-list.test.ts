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
