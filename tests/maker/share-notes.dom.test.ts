// tests/maker/share-notes.dom.test.ts
// TASK-36c3: "Before you share" blocks only structural problems. A quiz that
// re-tests a flash card (the hero sentence's shape) and a possible joke answer
// are non-blocking notes on the export-done screen. Messages quote the question
// in full and read as one sentence.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, h } from "preact";
import { EditorScreen } from "../../src/editor/EditorScreen.js";
import { EditorStore } from "../../src/editor/store.js";
import { beforeYouShare, NOTE_CODES } from "../../src/shared/shareCheck.js";
import { lessonWarnings } from "../../src/shared/lessonCheck.js";
import type { ButtonElement, Card, Stack } from "../../src/shared/types.js";

class FakeResizeObserver { observe(): void {} unobserve(): void {} disconnect(): void {} }
(globalThis as unknown as Record<string, unknown>)["ResizeObserver"] = FakeResizeObserver;

const id = (n: number): string => `${n.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
const END = id(9999);
const QUESTION = "What is the name for water vapour turning back into tiny droplets in the air?";

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
function flash(n: number, term: string, back: string, next: string): Card {
  return {
    id: id(n),
    kind: "flash",
    elements: [
      { type: "text", id: id(n * 100 + 1), x: 48, y: 104, w: 704, h: 128, content: term },
      { type: "text", id: id(n * 100 + 2), x: 48, y: 260, w: 704, h: 128, content: back },
      { type: "button", id: id(n * 100 + 3), x: 408, y: 496, w: 344, h: 56, label: "Next Card", actions: [{ type: "goto", cardId: next }] },
    ],
    actions: [],
  };
}
/** The hero sentence's shape: flash card "Condensation", then a quiz on the same term. */
function heroDeck(): Stack {
  return {
    id: id(1),
    title: "The water cycle",
    theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" },
    cards: [
      flash(2, "Condensation", "When water vapour turns back into tiny droplets in the air.", id(3)),
      quiz(3, QUESTION, ["Condensation", "Evaporation", "Freezing"], END),
      { id: END, kind: "end", elements: [{ type: "text", id: id(99991), x: 48, y: 120, w: 704, h: 72, content: "You finished the water cycle" }], actions: [] },
    ],
  };
}

function makeStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}
const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
};
let mounted: HTMLElement | null = null;
beforeEach(() => { document.body.innerHTML = ""; });
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

describe("TASK-36c3: Before you share blocks only structural problems", () => {
  it("TASK-36c3: the hero shape (flash, then a quiz on the same term) exports without a dialog, and the note shows on the done screen", async () => {
    const s = heroDeck();
    expect(lessonWarnings(s).map((w) => w.code)).toEqual(["restates-flash"]);
    const { root, fetchSpy } = mountEditor(s);
    root.querySelector<HTMLButtonElement>(".export-btn")!.click();
    await flush();
    expect(root.querySelector(".share-dialog")).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const notes = root.querySelector("[data-testid='export-notes']")!;
    expect(notes.querySelector("h2")!.textContent).toBe("Worth a look");
    expect(notes.querySelector("li")!.textContent).toBe(
      `Card 2 (“${QUESTION}”) tests the same word as flash card 1, which is fine if you meant it as a check.`,
    );
  });

  it("TASK-36c3: a possible joke answer is a note too, never a block", () => {
    const s = heroDeck();
    s.cards[1] = quiz(3, "Which of these is a cloud made of?", ["Tiny water droplets", "It glows in the dark", "Sand"], END);
    const c = beforeYouShare(s);
    expect(c.ok).toBe(true);
    expect(c.lines).toEqual([]);
    expect(c.notes).toEqual([
      "In Card 2 (“Which of these is a cloud made of?”), “It glows in the dark” may be a joke answer: use a mistake a pupil might really make.",
    ]);
    expect([...NOTE_CODES].sort()).toEqual(["joke-answer", "restates-flash"]);
  });

  it("TASK-36c3: a two-answer quiz still opens the dialog, which says 'Not exported yet' and quotes the full question in one sentence", async () => {
    const s = heroDeck();
    const long = "Which of these happens when warm water vapour meets the cold glass of a window in winter?";
    s.cards[1] = quiz(3, long, ["Droplets form", "Nothing happens"], END);
    const { root, fetchSpy } = mountEditor(s);
    root.querySelector<HTMLButtonElement>(".export-btn")!.click();
    await flush();
    expect(root.querySelector(".share-dialog")).not.toBeNull();
    expect(root.querySelector(".share-dialog .sub")!.textContent).toBe("Not exported yet. The class would meet these:");
    const items = Array.from(root.querySelectorAll(".share-check li")).map((l) => l.textContent ?? "");
    expect(items).toEqual([`Card 2 (“${long}”) has only two answers: add one.`]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("TASK-36c3: every lesson message names the card with its question in full and ends with one full stop", () => {
    const s = heroDeck();
    s.cards[1] = quiz(3, QUESTION, ["Condensation", "Condensation in the air", "It glows"], END);
    const all = [...beforeYouShare(s).lines, ...beforeYouShare(s).notes];
    expect(all.length).toBeGreaterThan(1);
    for (const line of all) {
      expect(line).toContain(`(“${QUESTION}”)`);
      expect(line.endsWith(".")).toBe(true);
      expect(line.replace(`(“${QUESTION}”)`, "").replace(/“[^”]*”/g, "").match(/\. /g)).toBeNull();
    }
  });
});
