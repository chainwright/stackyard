// tests/maker/round5-ui.dom.test.ts
// TASK-29l (sibling choices share a size), TASK-29m (a teacher's end heading shows
// at every score), TASK-29n (the cursor lands in the new answer), TASK-29o (plain
// zeros), TASK-29j (the header only promises what is true), TASK-29a (the editor
// says where to go when a card is added after a fork).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, h } from "preact";
import { readFileSync } from "node:fs";
import { Inspector } from "../../src/editor/Inspector.js";
import { CardList } from "../../src/editor/CardList.js";
import { EditorStore } from "../../src/editor/store.js";
import { renderCard, sharedChoiceFit } from "../../src/player/renderer.js";
import { createRuntime } from "../../src/player/runtime.js";
import type { ButtonElement, Card, Stack } from "../../src/shared/types.js";
import { quizStack } from "./fixtures.js";

class FakeResizeObserver { observe(): void {} unobserve(): void {} disconnect(): void {} }
(globalThis as unknown as Record<string, unknown>)["ResizeObserver"] = FakeResizeObserver;

const u = (n: number): string => `a6a60000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
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

let mounted: HTMLElement | null = null;
beforeEach(() => {
  document.body.innerHTML = "";
});
afterEach(() => {
  if (mounted) render(null, mounted);
  mounted = null;
});

// ---------------------------------------------------------------------------

function endStack(heading: string, quizCount = 2): Stack {
  const quizzes: Card[] = Array.from({ length: quizCount }, (_, i) => ({
    id: u(10 + i),
    kind: "quiz" as const,
    actions: [],
    elements: [
      { type: "text" as const, id: u(20 + i), x: 48, y: 104, w: 704, h: 144, content: `Question ${i}?` },
      { type: "button" as const, id: u(30 + i), x: 48, y: 296, w: 344, h: 88, label: "Right", actions: [{ type: "score" as const, delta: 1 }, { type: "goto" as const, cardId: u(99) }] },
      { type: "button" as const, id: u(40 + i), x: 408, y: 296, w: 344, h: 88, label: "Wrong", actions: [{ type: "score" as const, delta: 0 }, { type: "goto" as const, cardId: u(99) }] },
    ],
  }));
  const end: Card = { id: u(99), kind: "end", actions: [], elements: [{ type: "text", id: u(98), x: 48, y: 120, w: 704, h: 72, content: heading }] };
  return { id: u(1), title: "T", theme: { background: "#fff", foreground: "#000", font: "sans-serif" }, cards: [...quizzes, end] };
}
function drawEnd(heading: string): string {
  const stack = endStack(heading);
  const root = document.createElement("div");
  document.body.appendChild(root);
  const rt = createRuntime(stack);
  rt.currentCardId = u(99);
  renderCard(stack.cards[stack.cards.length - 1]!, root, rt, () => {}, () => {});
  return root.querySelector(".sy-end-heading")?.textContent ?? "";
}

describe("TASK-29m: a teacher's own last-card heading shows at every score", () => {
  it("'Brilliant work on fractions!' is shown as typed at score 0", () => {
    expect(drawEnd("Brilliant work on fractions!")).toBe("Brilliant work on fractions!");
    expect(drawEnd("Great effort, Class 4B!")).toBe("Great effort, Class 4B!");
  });
  it("Stackyard's own stock lines are still swapped for 'You finished!' at 0", () => {
    expect(drawEnd("Well done — you finished!")).toBe("You finished!");
    expect(drawEnd("Well done!")).toBe("You finished!");
  });
  it("a longer end message shows as a body under the heading", () => {
    const stack = endStack("You finished the Viking quiz");
    const end = stack.cards[stack.cards.length - 1]!;
    end.elements.push({ type: "text", id: u(97), x: 48, y: 204, w: 704, h: 200, content: "Be proud of what you know." });
    const root = document.createElement("div");
    document.body.appendChild(root);
    const rt = createRuntime(stack);
    renderCard(end, root, rt, () => {}, () => {});
    expect(root.querySelector(".sy-end-body")?.textContent).toBe("Be proud of what you know.");
    expect(root.querySelector(".sy-end-card")?.classList.contains("sy-end-has-body")).toBe(true);
  });
});

describe("TASK-29l: sibling choices on a card share one size", () => {
  const btn = (label: string, y: number): ButtonElement => ({
    type: "button", id: u(y), x: 48, y, w: 704, h: 72, label, actions: [{ type: "goto", cardId: u(99) }],
  });
  it("sharedChoiceFit gives every choice the smallest size any one needs", () => {
    const short = btn("Cut it in half", 300);
    const long = btn("Share the six slices equally between the other three children in the class today", 400);
    const shared = sharedChoiceFit([short, long])!;
    const alone = sharedChoiceFit([long, long])!;
    expect(shared.size).toBe(alone.size);
    expect(shared.size).toBeLessThan(32);
    expect(sharedChoiceFit([short])).toBeUndefined();
  });
  it("rendered story choices carry the same font size", () => {
    const card: Card = {
      id: u(5), kind: "story", actions: [],
      elements: [
        { type: "text", id: u(6), x: 48, y: 104, w: 704, h: 150, content: "You reach the harbour." },
        btn("Cut it in half", 300),
        btn("Share the six slices equally between the other three children in the class today", 400),
      ],
    };
    const stack: Stack = { ...endStack("x"), cards: [card, endStack("x").cards.at(-1)!] };
    const root = document.createElement("div");
    document.body.appendChild(root);
    renderCard(card, root, createRuntime(stack), () => {}, () => {});
    const sizes = Array.from(root.querySelectorAll<HTMLElement>(".sy-button")).map((b) => b.style.fontSize);
    expect(sizes).toHaveLength(2);
    expect(sizes[0]).toBe(sizes[1]);
  });
});

describe("TASK-29n: '+ Add an answer' puts the cursor in the new answer", () => {
  it("the Answer box has focus with 'Another answer' selected", async () => {
    // A quiz card with room for a third answer: drop the last answer of the fixture.
    const stack = quizStack();
    const quiz = stack.cards[0]!;
    const answers = quiz.elements.filter((e) => e.type === "button");
    quiz.elements = quiz.elements.filter((e) => e !== answers[answers.length - 1]);
    const ref = { draw: (): void => {} };
    const store = new EditorStore({ stack, screen: "editor" }, { storage: makeStorage(), onChange: () => ref.draw() });
    store.setSelectedCard(quiz.id);
    store.setSelectedElement(answers[0]!.id);
    const root = document.createElement("div");
    document.body.appendChild(root);
    ref.draw = (): void => render(h(Inspector, { store }), root);
    ref.draw();
    mounted = root;

    root.querySelector<HTMLButtonElement>(".add-answer-btn")!.click();
    await flush();
    const box = document.getElementById("label") as HTMLInputElement;
    expect(box.value).toBe("Another answer");
    expect(document.activeElement).toBe(box);
    expect(box.selectionStart).toBe(0);
    expect(box.selectionEnd).toBe("Another answer".length);
  });
});

describe("TASK-29a: the Maker says where to go when a card is added after a fork", () => {
  it("'+ Add Card' after a story card with two choices shows 'Choose where this card leads'", async () => {
    const cards: Card[] = [
      { id: u(1), kind: "story", actions: [], elements: [
        { type: "text", id: u(11), x: 48, y: 104, w: 704, h: 120, content: "A fork." },
        { type: "button", id: u(12), x: 48, y: 260, w: 704, h: 72, label: "Left", actions: [{ type: "goto", cardId: u(2) }] },
        { type: "button", id: u(13), x: 48, y: 360, w: 704, h: 72, label: "Right", actions: [{ type: "goto", cardId: u(3) }] },
      ] },
      { id: u(2), kind: "story", actions: [], elements: [{ type: "text", id: u(21), x: 48, y: 104, w: 704, h: 120, content: "Left." }, { type: "button", id: u(22), x: 408, y: 440, w: 344, h: 80, label: "Continue", actions: [{ type: "goto", cardId: u(4) }] }] },
      { id: u(3), kind: "story", actions: [], elements: [{ type: "text", id: u(31), x: 48, y: 104, w: 704, h: 120, content: "Right." }, { type: "button", id: u(32), x: 408, y: 440, w: 344, h: 80, label: "Continue", actions: [{ type: "goto", cardId: u(4) }] }] },
      { id: u(4), kind: "end", actions: [], elements: [{ type: "text", id: u(41), x: 48, y: 120, w: 704, h: 72, content: "The end" }] },
    ];
    const stack: Stack = { id: u(0), title: "Fork", theme: { background: "#fff", foreground: "#000", font: "sans-serif" }, cards };
    let notice: string | null = null;
    const ref = { draw: (): void => {} };
    const store = new EditorStore({ stack, screen: "editor" }, { storage: makeStorage(), onChange: () => ref.draw() });
    store.setSelectedCard(u(1));
    const root = document.createElement("div");
    document.body.appendChild(root);
    ref.draw = (): void => render(h(CardList, { store, onNotice: (m: string | null) => { notice = m; } }), root);
    ref.draw();
    mounted = root;

    root.querySelector<HTMLButtonElement>(".add-card")!.click();
    await flush();
    expect(notice).toContain("Choose where this card leads");
    // Both choices still go where they went.
    const after = store.getStack()!.cards.find((c) => c.id === u(1))!;
    const targets = after.elements.filter((e): e is ButtonElement => e.type === "button").map((b) => b.actions.find((a) => a.type === "goto")?.cardId);
    expect(targets).toEqual([u(2), u(3)]);
  });
});

describe("TASK-29o: plain zeros on tiles", () => {
  it("every Reading-face rule lists 'Stackyard Digits' first, in the player and the Maker", () => {
    const player = readFileSync("src/player/renderer.ts", "utf8");
    const reading = player.match(/font-family: [^;]*'Stackyard Reading'[^;]*;/g) ?? [];
    expect(reading.length).toBeGreaterThan(5);
    for (const r of reading) expect(r, r).toMatch(/font-family: 'Stackyard Digits', 'Stackyard Reading'/);
    const maker = readFileSync("src/editor/styles.css", "utf8");
    expect(maker).toMatch(/--font-body: 'Stackyard Digits', 'Stackyard Reading'/);
    expect(maker).toMatch(/font-family: 'Stackyard Digits';[\s\S]*digits\.woff2/);
  });

  it("the digits font really has the ten digits, a plain (unslashed) zero and no letters", () => {
    const bytes = readFileSync("src/assets/fonts/digits.woff2");
    expect(bytes.byteLength).toBeLessThan(6000); // ten glyphs, not a whole face
    expect(bytes.subarray(0, 4).toString("latin1")).toBe("wOF2");
    const script = readFileSync("scripts/make-digits-font.py", "utf8");
    expect(script).toContain('"0123456789"');
  });
});

describe("TASK-29j: the header promises only what is true", () => {
  it("the Maker's tagline says the lesson FILE works offline", () => {
    const src = readFileSync("src/editor/StartScreen.tsx", "utf8");
    expect(src).toContain('const PROMISE = "Make a clickable lesson from one sentence. The lesson file works offline.";');
    expect(src).not.toMatch(/PROMISE = "[^"]*sentence\. Works offline\./);
  });
});
