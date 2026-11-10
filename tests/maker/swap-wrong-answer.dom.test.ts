// tests/maker/swap-wrong-answer.dom.test.ts
// TASK-35a3 (the Swap control in the Maker inspector) and TASK-35a4 (the
// "may be a joke answer" marker on the canvas and in the inspector).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { render, h } from "preact";
import { Inspector, JOKE_NOTE } from "../../src/editor/Inspector.js";
import { Canvas } from "../../src/editor/Canvas.js";
import { EditorStore } from "../../src/editor/store.js";
import { swapCandidates } from "../../src/editor/swapCandidates.js";
import type { ButtonElement, Card, Stack } from "../../src/shared/types.js";

class FakeResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as unknown as Record<string, unknown>)["ResizeObserver"] = FakeResizeObserver;

const id = (n: number): string => `${n.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
const END = id(9999);
function quiz(n: number, question: string, answers: string[], next: string): Card {
  return {
    id: id(n),
    kind: "quiz",
    elements: [
      { type: "text", id: id(n * 100 + 1), x: 48, y: 104, w: 704, h: 128, content: question },
      ...answers.map((label, i): ButtonElement => ({
        type: "button", id: id(n * 100 + 10 + i),
        x: i % 2 === 0 ? 48 : 408, y: i < 2 ? 296 : 432, w: 344, h: 88, label,
        actions: [{ type: "score", delta: i === 0 ? 1 : 0 }, { type: "sound", sound: i === 0 ? "cheer" : "buzz" }, { type: "goto", cardId: next }],
      })),
    ],
    actions: [],
  };
}
/** Card 1: "It glows" is a suspected joke (the "glowing" marker); the right answer "Magic lamp" carries a marker word too. */
function deck(): Stack {
  return {
    id: id(1),
    title: "Light",
    theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" },
    cards: [
      quiz(3, "Which of these is a light source?", ["Magic lamp", "It glows", "A chair"], id(4)),
      quiz(4, "Which of these reflects light?", ["A mirror", "A torch", "A book"], END),
      { id: END, kind: "end", elements: [], actions: [] },
    ],
  };
}
const GLOWS = id(311);
const CHAIR = id(312);
const RIGHT = id(310);

function storage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

let roots: HTMLElement[] = [];
const redraws: Array<() => void> = [];
let lastNotice: string | null = null;
function setup(select?: string): { store: EditorStore; inspector: HTMLElement; canvas: HTMLElement } {
  const s = deck();
  const store = new EditorStore({ stack: s, screen: "editor" }, { storage: storage(), onChange: () => redraws.forEach((r) => r()) });
  store.setSelectedCard(id(3));
  if (select) store.setSelectedElement(select);
  const canvas = document.createElement("div");
  const inspector = document.createElement("div");
  document.body.append(canvas, inspector);
  roots = [canvas, inspector];
  const draw = () => {
    render(h(Canvas, { store }), canvas);
    render(h(Inspector, { store, onNotice: (m: string | null) => { lastNotice = m; } }), inspector);
  };
  redraws.push(draw);
  draw();
  return { store, inspector, canvas };
}
const flush = async (): Promise<void> => { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };
const labelOf = (store: EditorStore, elId: string): string =>
  (store.getStack()!.cards.flatMap((c) => c.elements).find((e) => e.id === elId) as ButtonElement).label;

beforeEach(() => {
  document.body.innerHTML = "";
  lastNotice = null;
});
afterEach(() => {
  for (const r of roots) render(null, r);
  roots = [];
  redraws.length = 0;
});

describe("TASK-35a3: Swap this wrong answer, in the Maker inspector", () => {
  it("TASK-35a3: Swap opens a labelled list of this deck's candidates; picking one changes only that label, in one undo step", async () => {
    const { store, inspector } = setup(CHAIR);
    const open = inspector.querySelector<HTMLButtonElement>("[data-testid='swap-open']")!;
    expect(open.textContent).toBe("Swap");
    expect(open.getAttribute("aria-expanded")).toBe("false");
    open.click();
    await flush();
    expect(open.getAttribute("aria-expanded")).toBe("true");
    const list = inspector.querySelector("#swap-list")!;
    expect(list.getAttribute("aria-labelledby")).toBe("swap-title");
    expect(inspector.querySelector("#swap-title")!.textContent).toBe("Swap this wrong answer");
    const options = Array.from(list.querySelectorAll<HTMLButtonElement>("[data-testid='swap-option']")).map((b) => b.textContent);
    expect(options).toEqual(swapCandidates(store.getStack()!, id(3), CHAIR));
    expect(options).toContain("A torch");
    const before = structuredClone(store.getStack());
    const actions = (before!.cards[0]!.elements.find((e) => e.id === CHAIR) as ButtonElement).actions;
    Array.from(list.querySelectorAll<HTMLButtonElement>("[data-testid='swap-option']")).find((b) => b.textContent === "A torch")!.click();
    await flush();
    expect(labelOf(store, CHAIR)).toBe("A torch");
    expect((store.getStack()!.cards[0]!.elements.find((e) => e.id === CHAIR) as ButtonElement).actions).toEqual(actions);
    expect(inspector.querySelector("#swap-list")).toBeNull(); // closed after the pick
    store.undo();
    expect(store.getStack()).toEqual(before);
  });

  it("TASK-35a3: Type My Own… takes a labelled answer, rejects a duplicate with a plain message, and accepts a new one", async () => {
    const { store, inspector } = setup(CHAIR);
    inspector.querySelector<HTMLButtonElement>("[data-testid='swap-open']")!.click();
    await flush();
    inspector.querySelector<HTMLButtonElement>("[data-testid='swap-own']")!.click();
    await flush();
    const input = inspector.querySelector<HTMLInputElement>("#swap-own-input")!;
    expect(inspector.querySelector(`label[for="swap-own-input"]`)!.textContent).toBe("Your wrong answer");
    expect(input.maxLength).toBe(80);
    input.value = "magic LAMP";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    inspector.querySelector<HTMLButtonElement>("[data-testid='swap-own-use']")!.click();
    await flush();
    expect(lastNotice).toBe("That answer is already on this card. Pick a different one.");
    expect(labelOf(store, CHAIR)).toBe("A chair");
    const again = inspector.querySelector<HTMLInputElement>("#swap-own-input")!;
    again.value = "A candle";
    again.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    again.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await flush();
    expect(labelOf(store, CHAIR)).toBe("A candle");
  });

  it("TASK-35a3: the right answer has no Swap control", () => {
    const { inspector } = setup(RIGHT);
    expect(inspector.querySelector("h2")!.textContent).toBe("Edit this answer");
    expect(inspector.querySelector("[data-testid='swap-open']")).toBeNull();
  });

  it("TASK-35a3: with no candidates the list says so and still offers Type My Own…", async () => {
    const lone: Stack = { ...deck(), cards: [deck().cards[0]!, deck().cards[2]!] };
    lone.cards[0] = { ...lone.cards[0]!, elements: lone.cards[0]!.elements.map((e) => (e.type === "button" ? { ...e, actions: e.actions.map((a) => (a.type === "goto" ? { ...a, cardId: END } : a)) } : e)) };
    const store = new EditorStore({ stack: lone, screen: "editor" }, { storage: storage() });
    store.setSelectedCard(id(3));
    store.setSelectedElement(CHAIR);
    const root = document.createElement("div");
    document.body.appendChild(root);
    roots = [root];
    render(h(Inspector, { store, onNotice: () => {} }), root);
    root.querySelector<HTMLButtonElement>("[data-testid='swap-open']")!.click();
    await flush();
    expect(root.querySelector("#swap-list")!.textContent).toContain("No other answers in this deck fit here. Type your own.");
    expect(root.querySelector("[data-testid='swap-own']")).not.toBeNull();
  });
});

describe("TASK-35a4: suspected joke answers are marked where the teacher sees them", () => {
  it("TASK-35a4: a flagged wrong answer gets an accessible tag on the canvas; a plain one and the right answer (even with a marker word) never do", async () => {
    const { canvas } = setup();
    await flush();
    const tags = Array.from(canvas.querySelectorAll<HTMLButtonElement>("[data-testid='joke-tag']"));
    expect(tags.map((t) => t.getAttribute("data-element-id"))).toEqual([GLOWS]);
    expect(tags[0]!.tagName).toBe("BUTTON");
    expect(tags[0]!.textContent).toBe("May be a joke answer");
    expect(tags[0]!.getAttribute("aria-label")).toBe("“It glows” may be a joke answer — swap it");
  });

  it("TASK-35a4: the tag selects its tile, the inspector shows the same note beside Swap, and the tag hides while that tile is selected", async () => {
    const { canvas, inspector, store } = setup();
    await flush();
    canvas.querySelector<HTMLButtonElement>("[data-testid='joke-tag']")!.click();
    await flush();
    expect(store.getState().selectedElementId).toBe(GLOWS);
    expect(inspector.querySelector("[data-testid='joke-note']")!.textContent).toBe(JOKE_NOTE);
    expect(JOKE_NOTE).toBe("May be a joke answer — swap it");
    expect(document.activeElement).toBe(inspector.querySelector("[data-testid='swap-open']"));
    expect(canvas.querySelector("[data-testid='joke-tag']")).toBeNull();
    // Swapping it away removes the note.
    inspector.querySelector<HTMLButtonElement>("[data-testid='swap-open']")!.click();
    await flush();
    inspector.querySelector<HTMLButtonElement>("[data-testid='swap-option']")!.click();
    await flush();
    expect(inspector.querySelector("[data-testid='joke-note']")).toBeNull();
  });

  it("TASK-35a4: the new CSS is ink on paper — no stamp red, nothing under 18px, the ink focus ring", () => {
    const css = readFileSync("src/editor/styles.css", "utf8");
    const block = css.slice(css.indexOf("/* TASK-35a:"), css.indexOf("/* End card */")).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(block).toContain(".joke-tag");
    expect(block).not.toMatch(/--color-stamp|#CE3926/i);
    for (const m of block.matchAll(/font-size:\s*(\d+)px/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(18);
    expect(block).toContain("outline: 3px solid var(--color-ink)");
  });
});
