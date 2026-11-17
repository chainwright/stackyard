// tests/round17-marks-panel.dom.test.ts
// TASK-43a (judge round r8, P1-9): the Class Results panel puts what to revisit
// first and stacks on a phone. TASK-43b: the end card's marks follow the
// questions, with right, wrong and not reached told apart by glyph and words.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import { mountPlayer } from "../src/player/mount.js";
import { renderCard } from "../src/player/renderer.js";
import { createRuntime } from "../src/player/runtime.js";
import { quizCards, resultsOf, encodeCode, lessonKey } from "../src/shared/resultsCode.js";
import { renderClassResults } from "../src/living/classResults.js";
import { LIVING_STYLES } from "../src/living/styles.js";
import type { Card, Stack } from "../src/shared/types.js";

class FakeResizeObserver { observe(): void {} unobserve(): void {} disconnect(): void {} }
(globalThis as unknown as Record<string, unknown>)["ResizeObserver"] = FakeResizeObserver;

const id = (n: number): string => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
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
const THEME = { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" };

/** Six quiz cards in a chain, then the end card. */
function six(): Stack {
  const ids = [1, 2, 3, 4, 5, 6, 7].map(id);
  return {
    id: id(90),
    title: "Six",
    theme: THEME,
    cards: [...[0, 1, 2, 3, 4, 5].map((i) => quiz(ids[i]!, ids[i + 1]!, `Question ${i + 1}?`)), { id: ids[6]!, kind: "end", elements: [], actions: [] }],
  };
}

/** Q1 → S (skip Q2, or not) → Q2 → Q3 → end. */
function branching(): Stack {
  const [Q1, S, Q2, Q3, END] = [11, 12, 13, 14, 15].map(id) as [string, string, string, string, string];
  return {
    id: id(91),
    title: "Branches",
    theme: THEME,
    cards: [
      quiz(Q1, S, "First?"),
      {
        id: S, kind: "story", actions: [],
        elements: [
          { type: "text", id: `${S.slice(0, 8)}-0000-4000-8000-0000000000b0`, x: 40, y: 60, w: 720, h: 80, content: "Choose" },
          { type: "button", id: `${S.slice(0, 8)}-0000-4000-8000-0000000000b1`, x: 20, y: 300, w: 350, h: 80, label: "Skip ahead", actions: [{ type: "goto", cardId: Q3 }] },
          { type: "button", id: `${S.slice(0, 8)}-0000-4000-8000-0000000000b2`, x: 420, y: 300, w: 350, h: 80, label: "Go on", actions: [{ type: "goto", cardId: Q2 }] },
        ],
      },
      quiz(Q2, Q3, "Second?"),
      quiz(Q3, END, "Third?"),
      { id: END, kind: "end", elements: [], actions: [] },
    ],
  };
}

let root: HTMLElement;
let teardown: (() => void) | null = null;
beforeEach(() => {
  root = document.createElement("div");
  document.body.appendChild(root);
});
afterEach(() => {
  teardown?.();
  teardown = null;
  root.remove();
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function tile(right: boolean): void {
  root.querySelector<HTMLButtonElement>(right ? ".sy-tile[data-correct='true']" : ".sy-tile:not([data-correct])")!.click();
  vi.advanceTimersByTime(1000);
}
function choose(label: string): void {
  Array.from(root.querySelectorAll<HTMLButtonElement>(".sy-button")).find((x) => x.textContent === label)!.click();
  vi.advanceTimersByTime(50);
}
const marks = (): Array<{ cls: string; glyph: string; text: string }> =>
  Array.from(root.querySelectorAll<HTMLElement>("[data-testid='end-marks'] > .sy-end-slot")).map((s) => ({
    cls: s.className,
    glyph: s.querySelector('[aria-hidden="true"]')!.textContent ?? "",
    text: s.querySelector(".sy-sr-only")!.textContent ?? "",
  }));

describe("TASK-43b: the end card's marks follow the questions", () => {
  it("TASK-43b1: TASK-43b5: an alternating play R W R W R W gives ✓ ✗ ✓ ✗ ✓ ✗ in that order, each with its own words", () => {
    vi.useFakeTimers();
    teardown = mountPlayer(six(), root, { flip: false });
    for (const r of [true, false, true, false, true, false]) tile(r);
    const m = marks();
    expect(m.map((x) => x.glyph)).toEqual(["✓", "✗", "✓", "✗", "✓", "✗"]);
    expect(m.map((x) => x.text)).toEqual([1, 2, 3, 4, 5, 6].map((n) => `Question ${n}: ${n % 2 === 1 ? "right" : "wrong"}`));
    expect(root.querySelector("[data-testid='end-score']")!.textContent).toBe("Score 3 of 6");
  });

  it("TASK-43b2: TASK-43b4: TASK-43b5: a skipped question shows not reached, unlike wrong in glyph, class and words", () => {
    vi.useFakeTimers();
    teardown = mountPlayer(branching(), root, { flip: false });
    tile(false); // Q1 wrong
    choose("Skip ahead"); // Q2 never reached
    tile(true); // Q3 right
    const [q1, q2, q3] = marks();
    expect(q1).toMatchObject({ glyph: "✗", text: "Question 1: wrong" });
    expect(q1!.cls).toContain("sy-end-slot-wrong");
    expect(q2).toMatchObject({ glyph: "", text: "Question 2: not reached" });
    expect(q2!.cls).toContain("sy-end-slot-empty");
    expect(q3).toMatchObject({ glyph: "✓", text: "Question 3: right" });
    expect(q3!.cls).toContain("sy-end-slot-earned");
    expect(q1!.cls).not.toBe(q2!.cls);
  });

  it("TASK-43b4: Play Again starts with clean marks", () => {
    vi.useFakeTimers();
    teardown = mountPlayer(six(), root, { flip: false });
    for (let i = 0; i < 6; i++) tile(true);
    expect(marks().every((m) => m.glyph === "✓")).toBe(true);
    Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === "Play Again")!.click();
    vi.advanceTimersByTime(1000);
    for (let i = 0; i < 6; i++) tile(false);
    expect(marks().map((m) => m.glyph)).toEqual(["✗", "✗", "✗", "✗", "✗", "✗"]);
  });

  it("TASK-43b2: the wrong mark is ink in a solid box; not reached is a dashed outline; right keeps the red ✓ stamp (no colour-only coding)", () => {
    // The rules are in the player's stylesheet, injected on render.
    const s = six();
    renderCard(s.cards[6]!, root, createRuntime(s), () => {}, () => {});
    const sheet = Array.from(document.querySelectorAll("style")).map((x) => x.textContent ?? "").join("\n");
    const block = (sel: string): string => {
      const at = sheet.indexOf(`${sel} {`);
      expect(at, sel).toBeGreaterThanOrEqual(0);
      return sheet.slice(at, sheet.indexOf("}", at));
    };
    expect(block(".sy-end-slot-wrong")).toMatch(/border: 3px solid var\(--color-ink\)/);
    expect(block(".sy-end-slot-wrong")).toMatch(/color: var\(--color-ink\)/);
    expect(block(".sy-end-slot-empty")).toMatch(/dashed/);
    expect(block(".sy-end-slot-earned")).toMatch(/var\(--color-stamp\)/);
    expect(sheet).toContain(".sy-portrait .sy-end-stamps { gap: 6px; }");
  });

  it("TASK-43b1: TASK-43b5: for any first answers, the row of marks is the results the code encodes (fast-check)", () => {
    const s = six();
    const quiz = quizCards(s);
    fc.assert(
      fc.property(fc.array(fc.constantFrom<"right" | "wrong" | "none">("right", "wrong", "none"), { minLength: 6, maxLength: 6 }), (want) => {
        root.innerHTML = "";
        const state = createRuntime(s);
        want.forEach((r, i) => {
          if (r !== "none") state.answers[quiz[i]!.id] = r === "right";
        });
        renderCard(s.cards[6]!, root, state, () => {}, () => {});
        const got = Array.from(root.querySelectorAll<HTMLElement>("[data-testid='end-marks'] > .sy-end-slot")).map((x) => x.getAttribute("data-result"));
        expect(got).toEqual(resultsOf(s, state.answers));
        expect(got).toEqual(want);
      }),
      { numRuns: 100 },
    );
  });
});

describe("TASK-43a: the Class Results panel", () => {
  function open(results: Array<Array<"right" | "wrong" | "none">>): HTMLElement {
    const s = six();
    const key = lessonKey(s);
    const codes = results.map((r, i) => encodeCode({ fingerprint: key.fingerprint, results: r, tag: i + 1 }));
    const host = document.createElement("div");
    document.body.appendChild(host);
    renderClassResults(host, { lesson: s, edited: () => s, getCodes: () => codes, setCodes: () => {}, toast: () => {} });
    return host;
  }

  it("TASK-43a1: TASK-43a5: Questions to revisit comes right after the summary and before the question table, with no skipped heading level", () => {
    const host = open([
      ["right", "wrong", "right", "wrong", "right", "right"],
      ["right", "wrong", "right", "right", "right", "right"],
    ]);
    const summary = host.querySelector("[data-testid='results-summary']")!;
    const h3 = Array.from(host.querySelectorAll("h3")).find((h) => h.textContent === "Questions to revisit")!;
    const revisit = host.querySelector("[data-testid='results-revisit']")!;
    const table = host.querySelector("[data-testid='results-questions']")!;
    const before = (a: Element, b: Element): boolean => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(before(summary, h3)).toBe(true);
    expect(before(h3, revisit)).toBe(true);
    expect(before(revisit, table)).toBe(true);
    expect(h3.previousElementSibling).toBe(summary);
    // h2 (panel) → h3 (revisit): no skipped level.
    const levels = Array.from(host.querySelectorAll("h1, h2, h3, h4")).map((h) => Number(h.tagName[1]));
    for (let i = 1; i < levels.length; i++) expect(levels[i]! - levels[i - 1]!).toBeLessThanOrEqual(1);
    // Each revisit entry carries a stamp-like word, not a colour.
    expect(revisit.querySelector("li .sy-revisit-stamp")!.textContent).toBe("Revisit");
  });

  it("TASK-43a1: the empty state is kept, and still comes before the table", () => {
    const host = open([["right", "right", "right", "right", "right", "right"]]);
    const p = Array.from(host.querySelectorAll("p")).find((x) => x.textContent === "No question was missed by a third or more of the pupils who answered it.")!;
    const table = host.querySelector("[data-testid='results-questions']")!;
    expect(p).toBeDefined();
    expect(p.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("TASK-43a2: TASK-43a5: under 480 px the question table stacks and every number carries its label; it stays a real table", () => {
    expect(LIVING_STYLES).toContain("@media (max-width: 480px) {");
    const media = LIVING_STYLES.slice(LIVING_STYLES.indexOf("@media (max-width: 480px) {"));
    expect(media).toContain(".sy-results-questions td::before { content: attr(data-label)");
    expect(media).toMatch(/\.sy-results-questions tr[^{]*\{[^}]*display: block/);
    const host = open([["right", "wrong", "none", "right", "right", "right"]]);
    const table = host.querySelector("[data-testid='results-questions']")!;
    expect(table.tagName).toBe("TABLE");
    expect(table.querySelector("caption")!.textContent).toBe("Each question");
    expect(Array.from(table.querySelectorAll("thead th")).map((t) => t.textContent)).toEqual(["Question", "Right", "Wrong", "Did not reach"]);
    for (const tr of Array.from(table.querySelectorAll("tbody tr"))) {
      expect(tr.querySelector("th[scope='row']")).not.toBeNull();
      expect(Array.from(tr.querySelectorAll("td")).map((td) => td.getAttribute("data-label"))).toEqual(["Right", "Wrong", "Did not reach"]);
    }
    // The pupil table keeps its keyboard-scrollable region.
    const region = host.querySelector(".sy-results-scroll")!;
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.getAttribute("role")).toBe("region");
  });

  it("TASK-43a3: TASK-43a6: the panel is a plain paper index card in ink with one ruled line under the heading, no stamp red, no blur and no new font", () => {
    const at = LIVING_STYLES.indexOf("TASK-43a3");
    const css = LIVING_STYLES.slice(at, LIVING_STYLES.indexOf("TASK-43a2: on a narrow screen"));
    // TASK-43a6: no 32 px rule pattern behind the text (it crossed the glyphs); one rule under the h2.
    expect(css).not.toContain("repeating-linear-gradient");
    expect(css).toContain("background-image: none;");
    expect(css).toContain(".sy-results h2 { padding-bottom: 8px; border-bottom: 1px solid #C9D3E3;");
    expect(css).not.toMatch(/#CE3926/i);
    expect(css).not.toMatch(/blur\(|backdrop-filter/);
    const fonts = new Set((css.match(/font-family: '([^']+)'/g) ?? []).map((f) => f.replace(/font-family: '|'/g, "")));
    for (const f of fonts) expect(["Bricolage Grotesque", "Stackyard Reading", "Stackyard Digits"]).toContain(f);
  });

  it("TASK-43a6: under 480 px the caption has the rows' inset and each label keeps its space (\"Right: 5\")", () => {
    const media = LIVING_STYLES.slice(LIVING_STYLES.indexOf("@media (max-width: 480px) {"));
    expect(media).toContain(".sy-results-questions caption { display: block; padding: 8px 10px 4px; }");
    expect(media).toContain('.sy-results-questions td::before { content: attr(data-label) ":\\00a0";');
    expect(LIVING_STYLES).not.toContain('content: attr(data-label) ": "');
  });
});
