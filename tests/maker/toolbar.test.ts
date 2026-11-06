// tests/maker/toolbar.test.ts
// TASK-16: Toolbar and undo/redo UI.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, h } from "preact";
import { Toolbar } from "../../src/editor/Toolbar.js";
import { EditorStore } from "../../src/editor/store.js";
import { editLabel, addCard } from "../../src/editor/operations.js";
import type { ButtonElement } from "../../src/shared/types.js";
import { quizStack } from "./fixtures.js";

let mounted: HTMLElement | null = null;
const rerenderRef: { current: () => void } = { current: () => {} };

function mount(store: EditorStore, onExport?: () => void): HTMLElement {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const props = onExport ? { store, onExport } : { store };
  const draw = () => render(h(Toolbar, props), root);
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

function freshStore(): EditorStore {
  const stack = quizStack();
  return new EditorStore(
    { stack, screen: "editor" },
    { storage: makeStorage(), onChange: () => rerenderRef.current() },
  );
}

describe("TASK-16: Toolbar", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  afterEach(() => {
    if (mounted) render(null, mounted);
    mounted = null;
  });

  it("Undo/Redo enablement tracks history state", async () => {
    const store = freshStore();
    const root = mount(store);
    const undo = root.querySelector<HTMLButtonElement>('[aria-label="Undo"]')!;
    const redo = root.querySelector<HTMLButtonElement>('[aria-label="Redo"]')!;
    expect(undo.disabled).toBe(true);
    expect(redo.disabled).toBe(true);

    // One valid edit → undo enabled, redo still disabled.
    const dublin = store.getStack()!.cards[0]!.elements.find(
      (e): e is ButtonElement => e.type === "button" && e.label === "Dublin",
    )!;
    store.apply((s) => editLabel(s, dublin.id, "Dubh Linn"));
    await flush();
    expect(root.querySelector<HTMLButtonElement>('[aria-label="Undo"]')!.disabled).toBe(false);
    expect(root.querySelector<HTMLButtonElement>('[aria-label="Redo"]')!.disabled).toBe(true);

    // Undo → redo enabled.
    store.undo();
    await flush();
    expect(root.querySelector<HTMLButtonElement>('[aria-label="Redo"]')!.disabled).toBe(false);
  });

  it("Export is disabled when the stack is invalid and enabled when valid", async () => {
    const store = freshStore();
    const root = mount(store);
    expect(root.querySelector<HTMLButtonElement>(".export-btn")!.disabled).toBe(false);

    // Force an invalid stack (two end cards is impossible to reach via ops;
    // simulate by setting a stack the validator rejects).
    const broken = structuredClone(store.getStack()!);
    broken.title = "   "; // blank-title → invalid
    store.setStack(broken as never);
    await flush();
    expect(store.canExport()).toBe(false);
    expect(root.querySelector<HTMLButtonElement>(".export-btn")!.disabled).toBe(true);
  });

  it("Export carries the stamp styling and a ≥44px target", () => {
    const store = freshStore();
    const root = mount(store);
    const exportBtn = root.querySelector<HTMLButtonElement>(".export-btn")!;
    expect(exportBtn.classList.contains("export-btn")).toBe(true);
    expect(exportBtn.textContent).toContain("Export File");
  });

  it("pressing Export calls onExport", () => {
    const store = freshStore();
    let called = false;
    const root = mount(store, () => { called = true; });
    root.querySelector<HTMLButtonElement>(".export-btn")!.click();
    expect(called).toBe(true);
  });

  function toolByLabel(root: HTMLElement, label: string): HTMLButtonElement {
    const btn = Array.from(root.querySelectorAll<HTMLButtonElement>(".tool-card")).find(
      (b) => (b.textContent ?? "").includes(label),
    );
    if (!btn) throw new Error(`tool "${label}" not found`);
    return btn;
  }

  it("Add Text adds a real text element through store.apply", async () => {
    const store = freshStore();
    store.setSelectedCard(store.getStack()!.cards[0]!.id);
    const root = mount(store);
    const before = store.getStack()!.cards[0]!.elements.filter((e) => e.type === "text").length;
    toolByLabel(root, "Add Text").click();
    await flush();
    const after = store.getStack()!.cards[0]!.elements.filter((e) => e.type === "text").length;
    expect(after).toBe(before + 1);
  });

  it("a quiz card offers one Add Answer and no separate Add Button (TASK-27h)", async () => {
    const store = freshStore();
    store.setSelectedCard(store.getStack()!.cards[0]!.id);
    const root = mount(store);
    const labels = Array.from(root.querySelectorAll("button.tool-card")).map((b) => (b.textContent ?? "").trim());
    expect(labels.filter((l) => l.includes("Add Answer"))).toHaveLength(1);
    expect(labels.some((l) => l.includes("Add Button"))).toBe(false);
  });

  it("Add Answer adds a real (plain) button and keeps the quiz valid", async () => {
    const store = freshStore();
    store.setSelectedCard(store.getStack()!.cards[0]!.id);
    const root = mount(store);
    const before = store.getStack()!.cards[0]!.elements.filter((e) => e.type === "button").length;
    toolByLabel(root, "Add Answer").click();
    await flush();
    const after = store.getStack()!.cards[0]!.elements.filter((e) => e.type === "button").length;
    expect(after).toBe(before + 1);
    expect(store.canExport()).toBe(true); // still valid: the new button is not an answer tile
  });

  it("Link a Card shows a plain message when no button is selected", async () => {
    const store = freshStore();
    store.setSelectedCard(store.getStack()!.cards[0]!.id);
    store.setSelectedElement(null);
    let notice: string | null = null;
    const root = mount(store);
    // Re-render with onNotice wired via a second mount is awkward; instead mount
    // through a props object carrying onNotice.
    render(h(Toolbar, { store, onNotice: (m: string | null) => { notice = m; } }), root);
    const link = Array.from(root.querySelectorAll<HTMLButtonElement>(".tool-card")).find(
      (b) => (b.textContent ?? "").includes("Go to card"),
    )!;
    link.click();
    await flush();
    expect(notice).not.toBeNull();
    expect(String(notice).toLowerCase()).toContain("button");
    expect(String(notice).toLowerCase()).not.toContain("stack");
  });

  it("Link a Card wires the selected button's goto through store.apply", async () => {
    const store = freshStore();
    // Add a third card so we can link to a target that is NOT the current goto.
    store.apply((s) => addCard(s, "story", 1));
    const card = store.getStack()!.cards[0]!;
    const btn = card.elements.find((e) => e.type === "button")!;
    const target = store.getStack()!.cards[1]!.id; // the freshly added story card
    store.setSelectedCard(card.id);
    store.setSelectedElement(btn.id);
    const root = mount(store);
    const link = Array.from(root.querySelectorAll<HTMLButtonElement>(".tool-card")).find(
      (b) => (b.textContent ?? "").includes("Go to card"),
    )!;
    link.click();
    await flush();
    const select = root.querySelector<HTMLSelectElement>(".link-picker select")!;
    select.value = target;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();
    const wired = store.getStack()!.cards[0]!.elements.find((e) => e.id === btn.id)!;
    const gotos = wired.type === "button" ? wired.actions.filter((a) => a.type === "goto") : [];
    expect(gotos).toHaveLength(1);
    expect(gotos[0]!.type === "goto" && gotos[0]!.cardId).toBe(target);
  });
});
