// tests/results-endcard.dom.test.ts
// TASK-34b2: the player records each quiz card's FIRST answer and the end card
// shows the class results code (.kiro/specs/class-results/design.md §2).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { mountPlayer } from "../src/player/mount.js";
import { decodeCode, lessonKey, quizCards, type Result } from "../src/shared/resultsCode.js";
import { exportStack } from "../server/exporter.js";
import { vikingsStack } from "../src/shared/readyMadeStacks.js";
import type { Card, Stack } from "../src/shared/types.js";

class FakeResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as unknown as Record<string, unknown>)["ResizeObserver"] = FakeResizeObserver;

const id = (n: number): string => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
const [Q1, S1, Q2, Q3, S2, END] = [1, 2, 3, 4, 5, 6].map(id) as [string, string, string, string, string, string];

function quiz(cardId: string, next: string, q: string): Card {
  return {
    id: cardId,
    kind: "quiz",
    elements: [
      { type: "text", id: `${cardId.slice(0, 8)}-0000-4000-8000-0000000000a0`, x: 40, y: 60, w: 720, h: 80, content: q },
      { type: "button", id: `${cardId.slice(0, 8)}-0000-4000-8000-0000000000a1`, x: 20, y: 300, w: 350, h: 80, label: "Right", actions: [{ type: "score", delta: 1 }, { type: "goto", cardId: next }] },
      { type: "button", id: `${cardId.slice(0, 8)}-0000-4000-8000-0000000000a2`, x: 420, y: 300, w: 350, h: 80, label: "Wrong", actions: [{ type: "score", delta: 0 }, { type: "goto", cardId: next }] },
    ],
    actions: [],
  };
}

function story(cardId: string, choices: Array<[string, string]>): Card {
  return {
    id: cardId,
    kind: "story",
    elements: [
      { type: "text", id: `${cardId.slice(0, 8)}-0000-4000-8000-0000000000b0`, x: 40, y: 60, w: 720, h: 80, content: "Choose" },
      ...choices.map(([label, to], i) => ({
        type: "button" as const,
        id: `${cardId.slice(0, 8)}-0000-4000-8000-0000000000b${i + 1}`,
        x: 20 + i * 400, y: 300, w: 350, h: 80, label,
        actions: [{ type: "goto" as const, cardId: to }],
      })),
    ],
    actions: [],
  };
}

/** Q1 → S1 (skip Q2, or not) → Q2 → Q3 → S2 (back to Q1, or finish) → end. */
function branching(): Stack {
  return {
    id: id(99),
    title: "Branches",
    theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" },
    cards: [
      quiz(Q1, S1, "First?"),
      story(S1, [["Skip ahead", Q3], ["Go on", Q2]]),
      quiz(Q2, Q3, "Second?"),
      quiz(Q3, S2, "Third?"),
      story(S2, [["Back to the start", Q1], ["Finish", END]]),
      { id: END, kind: "end", elements: [], actions: [] },
    ],
  };
}

let root: HTMLElement;
let teardown: (() => void) | null = null;
beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement("div");
  document.body.appendChild(root);
});
afterEach(() => {
  teardown?.();
  teardown = null;
  root.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function tile(right: boolean): void {
  const t = root.querySelector<HTMLButtonElement>(right ? ".sy-tile[data-correct='true']" : ".sy-tile:not([data-correct])")!;
  t.click();
  vi.advanceTimersByTime(1000);
}
function choose(label: string): void {
  const b = Array.from(root.querySelectorAll<HTMLButtonElement>(".sy-button")).find((x) => x.textContent === label)!;
  b.click();
  vi.advanceTimersByTime(50);
}
const code = (): string => root.querySelector<HTMLElement>("[data-testid='results-code']")!.getAttribute("data-code")!;
const decode = (s: Stack): Result[] => {
  const d = decodeCode(code(), lessonKey(s));
  if (!d.ok) throw new Error(`the end card's code did not decode: ${d.error}`);
  return d.results;
};

describe("TASK-34b2: the end card shows the class results code", () => {
  it("TASK-34b2: a skipped quiz card reads 'not reached', never 'wrong'", () => {
    const s = branching();
    teardown = mountPlayer(s, root, { flip: false });
    tile(true); // Q1 right
    choose("Skip ahead"); // Q2 skipped
    tile(false); // Q3 wrong
    choose("Finish");
    expect(root.querySelector(".sy-end-card")).not.toBeNull();
    expect(decode(s)).toEqual(["right", "none", "wrong"]);
  });

  it("TASK-34b2: the FIRST answer on a card wins; coming back to it does not change it", () => {
    const s = branching();
    teardown = mountPlayer(s, root, { flip: false });
    tile(false); // Q1 wrong
    choose("Go on");
    tile(true); // Q2 right
    tile(true); // Q3 right
    choose("Back to the start");
    tile(true); // Q1 again, now right — must not count
    choose("Go on");
    tile(false); // Q2 again, now wrong — must not count
    tile(true);
    choose("Finish");
    expect(decode(s)).toEqual(["wrong", "right", "right"]);
  });

  it("TASK-34b2: the code is grouped in fours, ink not stamp red, spelled out for screen readers, with a labelled initials field", () => {
    const s = branching();
    teardown = mountPlayer(s, root, { flip: false });
    tile(true);
    choose("Go on");
    tile(true);
    tile(true);
    choose("Finish");
    const shown = root.querySelector<HTMLElement>("[data-testid='results-code']")!;
    expect(shown.textContent).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/); // 3 quiz cards: 8 characters
    expect(shown.getAttribute("aria-hidden")).toBe("true");
    const twin = shown.parentElement!.querySelector(".sy-sr-only")!;
    expect(twin.textContent).toBe(`Your results code: ${shown.textContent!.split("-").map((g) => g.split("").join(" ")).join(", ")}.`);
    const input = root.querySelector<HTMLInputElement>("[data-testid='results-initials']")!;
    const label = root.querySelector<HTMLLabelElement>(`label[for="${input.id}"]`)!;
    expect(label.textContent).toBe("Your initials (only if your teacher asks)");
    expect(input.maxLength).toBe(3);
    expect(input.getAttribute("autocomplete")).toBe("off");
    // The new block's CSS: ink, nothing under the 18px floor, no stamp red.
    const src = readFileSync("src/player/renderer.ts", "utf8");
    const block = src.slice(src.indexOf("/* TASK-34b2: the class results code"), src.indexOf("/* ---- Animations ---- */"));
    expect(block).not.toContain("--color-stamp");
    for (const m of block.matchAll(/font-size:\s*(\d+)px/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(18);
  });

  it("TASK-34b2: initials change the code but keep its tag; typing in the field never moves the card", () => {
    const s = branching();
    teardown = mountPlayer(s, root, { flip: false });
    tile(true);
    choose("Skip ahead");
    tile(true);
    choose("Finish");
    const before = decodeCode(code(), lessonKey(s));
    const input = root.querySelector<HTMLInputElement>("[data-testid='results-initials']")!;
    input.focus();
    for (const key of ["Enter", " ", "s"]) input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    input.value = "ó'b.";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    vi.advanceTimersByTime(1000);
    expect(input.value).toBe("OB");
    expect(root.querySelector(".sy-end-card")).not.toBeNull();
    const after = decodeCode(code(), lessonKey(s));
    expect(before.ok && after.ok).toBe(true);
    if (before.ok && after.ok) {
      expect(after.tag).toBe(before.tag);
      expect(after.results).toEqual(before.results);
      expect([before.initials, after.initials]).toEqual(["", "OB"]);
      expect(after.code).not.toBe(before.code);
    }
  });

  it("TASK-34b2: Play Again clears the results and draws a new tag", () => {
    let draw = 100;
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(<T extends ArrayBufferView | null>(a: T): T => {
      (a as unknown as Uint32Array)[0] = draw++;
      return a;
    });
    const s = branching();
    teardown = mountPlayer(s, root, { flip: false });
    tile(true);
    choose("Go on");
    tile(true);
    tile(true);
    choose("Finish");
    const first = decodeCode(code(), lessonKey(s));
    root.querySelector<HTMLButtonElement>("[data-testid='play-again']")!.click();
    vi.advanceTimersByTime(50);
    tile(false);
    choose("Skip ahead");
    tile(false);
    choose("Finish");
    const second = decodeCode(code(), lessonKey(s));
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.results).toEqual(["right", "right", "right"]);
      expect(second.results).toEqual(["wrong", "none", "wrong"]);
      expect(second.tag).not.toBe(first.tag);
    }
  });

  it("TASK-34b2: a lesson with no quiz card shows no code", () => {
    const s = branching();
    s.cards = s.cards.filter((c) => c.kind !== "quiz");
    s.cards[0] = story(S1, [["Go on", END]]);
    s.cards = [s.cards[0]!, s.cards.find((c) => c.kind === "end")!];
    teardown = mountPlayer(s, root, { flip: false });
    choose("Go on");
    expect(root.querySelector(".sy-end-card")).not.toBeNull();
    expect(root.querySelector("[data-testid='results-code']")).toBeNull();
    expect(root.querySelector("[data-testid='results-initials']")).toBeNull();
  });

  it("TASK-34b2: the Vikings sample's end card decodes to exactly the answers given", () => {
    const s = vikingsStack();
    teardown = mountPlayer(s, root, { flip: false });
    const pattern = [true, false, true, false, true, false];
    let qi = 0;
    for (let step = 0; step < 40 && !root.querySelector(".sy-end-card"); step++) {
      if (root.querySelector(".sy-tile")) tile(pattern[qi++]!);
      else {
        const next = root.querySelector<HTMLButtonElement>(".sy-flash-next button") ?? root.querySelector<HTMLButtonElement>(".sy-button");
        if (next) next.click();
        else root.querySelector<HTMLElement>(".sy-flash")!.click();
        vi.advanceTimersByTime(1000);
      }
    }
    expect(qi).toBe(quizCards(s).length);
    expect(decode(s)).toEqual(pattern.map((r) => (r ? "right" : "wrong")));
  });

  it("TASK-34b2: the class export ('Export for class') shows the code too, and carries no results panel or results", async () => {
    const html = await exportStack(vikingsStack());
    expect(html).toContain("Your results code");
    expect(html).not.toContain("Class Results");
    expect(html).not.toContain('id="class-results"');
  });
});
