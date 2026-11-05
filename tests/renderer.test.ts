// tests/renderer.test.ts
// Unit tests for src/player/renderer.ts (TASK-07).
// Uses jsdom (provided by vitest via globalThis.document).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderCard } from "../src/player/renderer.js";
import { createRuntime } from "../src/player/runtime.js";
import type { Card, Stack, Action } from "../src/shared/types.js";

// ---------------------------------------------------------------------------
// Test helpers

const IDS = {
  stack:   "10000000-0000-4000-8000-000000000001",
  card1:   "20000000-0000-4000-8000-000000000002",
  card2:   "30000000-0000-4000-8000-000000000003",
  end:     "40000000-0000-4000-8000-000000000004",
  textEl:  "50000000-0000-4000-8000-000000000005",
  btnEl:   "60000000-0000-4000-8000-000000000006",
  imgEl:   "70000000-0000-4000-8000-000000000007",
  fieldEl: "80000000-0000-4000-8000-000000000008",
} as const;

function makeStack(cards: Card[]): Stack {
  return {
    id: IDS.stack,
    title: "Test Stack",
    theme: { background: "#fff", foreground: "#000", font: "sans-serif" },
    cards,
  };
}

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: IDS.card1,
    kind: "story",
    elements: [],
    actions: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Renderer tests

describe("renderCard() — element types", () => {
  let root: HTMLElement;
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
    navigate = vi.fn();
  });

  it("renders a text element as <p>", () => {
    const card = makeCard({
      elements: [
        {
          type: "text",
          id: IDS.textEl,
          x: 10, y: 20, w: 300, h: 50,
          content: "Hello World",
        },
      ],
    });
    const stack = makeStack([card, makeCard({ id: IDS.end, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate);

    const p = root.querySelector("p.sy-text");
    expect(p).not.toBeNull();
    expect(p?.textContent).toBe("Hello World");
  });

  it("positions a text element using x, y, w, h", () => {
    const card = makeCard({
      elements: [
        {
          type: "text",
          id: IDS.textEl,
          x: 50, y: 100, w: 200, h: 40,
          content: "Positioned",
        },
      ],
    });
    const stack = makeStack([card, makeCard({ id: IDS.end, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate);

    const wrapper = root.querySelector(".sy-element") as HTMLElement | null;
    expect(wrapper).not.toBeNull();
    expect(wrapper?.style.left).toBe("50px");
    expect(wrapper?.style.top).toBe("100px");
    expect(wrapper?.style.width).toBe("200px");
    expect(wrapper?.style.height).toBe("40px");
  });

  it("renders a button element as <button>", () => {
    const card = makeCard({
      elements: [
        {
          type: "button",
          id: IDS.btnEl,
          x: 10, y: 10, w: 100, h: 44,
          label: "Click me",
          actions: [],
        },
      ],
    });
    const stack = makeStack([card, makeCard({ id: IDS.end, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate);

    const btn = root.querySelector("button") as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toContain("Click me");
  });

  it("button dispatches actions on click", () => {
    const actions: Action[] = [{ type: "goto", cardId: IDS.card2 }];
    const card = makeCard({
      elements: [
        {
          type: "button",
          id: IDS.btnEl,
          x: 10, y: 10, w: 100, h: 44,
          label: "Go",
          actions,
        },
      ],
    });
    const stack = makeStack([card, makeCard({ id: IDS.end, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate);

    const btn = root.querySelector("button") as HTMLButtonElement;
    btn.click();

    // navigate should have been called with the target card id and automatic=false
    expect(navigate).toHaveBeenCalledWith(IDS.card2, false);
  });

  it("renders an image element as <img>", () => {
    const card = makeCard({
      elements: [
        {
          type: "image",
          id: IDS.imgEl,
          x: 0, y: 0, w: 100, h: 80,
          src: "data:image/png;base64,abc123",
          alt: "A test image",
        },
      ],
    });
    const stack = makeStack([card, makeCard({ id: IDS.end, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate);

    const img = root.querySelector("img") as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("data:image/png;base64,abc123");
    expect(img?.getAttribute("alt")).toBe("A test image");
  });

  it("renders a field element as <span> with variable value", () => {
    const card = makeCard({
      elements: [
        {
          type: "field",
          id: IDS.fieldEl,
          x: 0, y: 0, w: 100, h: 30,
          variable: "score",
        },
      ],
    });
    const stack = makeStack([card, makeCard({ id: IDS.end, kind: "end" })]);
    const state = createRuntime(stack);
    state.variables["score"] = 7;

    renderCard(card, root, state, navigate);

    const span = root.querySelector("span.sy-field") as HTMLSpanElement | null;
    expect(span).not.toBeNull();
    expect(span?.textContent).toBe("7");
  });

  it("field shows empty string for unset variable", () => {
    const card = makeCard({
      elements: [
        {
          type: "field",
          id: IDS.fieldEl,
          x: 0, y: 0, w: 100, h: 30,
          variable: "not_set",
        },
      ],
    });
    const stack = makeStack([card, makeCard({ id: IDS.end, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate);

    const span = root.querySelector("span.sy-field") as HTMLSpanElement | null;
    expect(span?.textContent).toBe("");
  });

  it("clears the root before rendering", () => {
    root.innerHTML = "<p>Old content</p>";
    const card = makeCard();
    const stack = makeStack([card, makeCard({ id: IDS.end, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate);

    expect(root.querySelector("p")?.textContent).not.toBe("Old content");
  });

  it("renders ring holes inside the card", () => {
    const card = makeCard();
    const stack = makeStack([card, makeCard({ id: IDS.end, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate);

    const holes = root.querySelectorAll(".sy-ring-hole");
    expect(holes.length).toBe(2);
  });

  it("renders three offset card-edge layers", () => {
    const card = makeCard();
    const stack = makeStack([card, makeCard({ id: IDS.end, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate);

    expect(root.querySelector(".sy-card-edge-1")).not.toBeNull();
    expect(root.querySelector(".sy-card-edge-2")).not.toBeNull();
    expect(root.querySelector(".sy-card-edge-3")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Derived card chrome — "Card N of M" meta, standing rings, score pill.
// These are derived from the deck position / runtime state and passed by the
// caller; they are NOT stored in the stack (so the stack format and round-trip
// are unchanged).

describe("renderCard() — derived chrome (meta / rings / score)", () => {
  let root: HTMLElement;
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
    navigate = vi.fn();
  });

  it("renders the derived 'Card N of M' meta line when chrome is passed", () => {
    const card = makeCard({ kind: "quiz" });
    const stack = makeStack([card, makeCard({ id: IDS.end, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate, undefined, { position: 3, total: 10 });

    const meta = root.querySelector(".sy-meta-chrome .sy-meta");
    expect(meta).not.toBeNull();
    expect(meta?.textContent).toBe("Card 3 of 10");
  });

  it("does NOT render a meta line when no chrome is passed", () => {
    const card = makeCard({ kind: "quiz" });
    const stack = makeStack([card, makeCard({ id: IDS.end, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate);

    expect(root.querySelector(".sy-meta-chrome")).toBeNull();
  });

  it("the meta line is derived chrome, not an element stored in the card", () => {
    // A quiz card with only a question text element — no meta element at all.
    const card = makeCard({
      kind: "quiz",
      elements: [
        { type: "text", id: IDS.textEl, x: 48, y: 104, w: 704, h: 128, content: "Q?" },
      ],
    });
    const stack = makeStack([card, makeCard({ id: IDS.end, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate, undefined, { position: 1, total: 5 });

    // The card still has exactly one stored element wrapper (the question);
    // the meta line lives outside .sy-element so click-mapping stays aligned.
    expect(root.querySelectorAll(".sy-element").length).toBe(1);
    expect(root.querySelector(".sy-meta-chrome")?.textContent).toBe("Card 1 of 5");
  });

  it("renders two standing binder rings as a sibling of the card", () => {
    const card = makeCard({ kind: "quiz" });
    const stack = makeStack([card, makeCard({ id: IDS.end, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate, undefined, { position: 1, total: 3 });

    const ringsLayer = root.querySelector(".sy-card-stack > .sy-rings");
    expect(ringsLayer).not.toBeNull();
    expect(ringsLayer?.querySelectorAll(".sy-ring").length).toBe(2);
  });

  it("the end card shows no 'Card N of M' meta line even if chrome is passed", () => {
    const endCard = makeCard({ id: IDS.end, kind: "end" });
    const stack = makeStack([makeCard({ kind: "quiz" }), endCard]);
    const state = createRuntime(stack);

    renderCard(endCard, root, state, navigate, undefined, { position: 1, total: 1 });

    expect(root.querySelector(".sy-meta-chrome")).toBeNull();
    // but the standing rings are still drawn on the end card
    expect(root.querySelector(".sy-card-stack > .sy-rings")).not.toBeNull();
  });

  it("renders the live running score as derived chrome on a content card", () => {
    const card = makeCard({ kind: "quiz" });
    const stack = makeStack([card, makeCard({ id: IDS.end, kind: "end" })]);
    const state = createRuntime(stack);
    state.variables["score"] = 3;

    renderCard(card, root, state, navigate, undefined, { position: 2, total: 4 });

    const score = root.querySelector(".sy-score-chrome");
    expect(score).not.toBeNull();
    expect(score?.textContent).toBe("Score 3");
  });

  it("--text-meta is 20px so meta stays ≥ 18px at the 0.9 minimum scale", () => {
    const card = makeCard({ kind: "quiz" });
    const stack = makeStack([card, makeCard({ id: IDS.end, kind: "end" })]);
    const state = createRuntime(stack);
    renderCard(card, root, state, navigate, undefined, { position: 1, total: 2 });

    const css = document.head.querySelector("style")?.textContent ?? "";
    expect(css).toMatch(/--text-meta:\s*20px/);
  });
});

// ---------------------------------------------------------------------------
// Quiz-card answer tiles

describe("renderCard() — quiz answer tiles", () => {
  let root: HTMLElement;
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
    navigate = vi.fn();
  });

  function makeQuizCard(): Card {
    const tileActions = (correct: boolean): Action[] =>
      correct
        ? [{ type: "score", delta: 1 }, { type: "goto", cardId: IDS.card2 }]
        : [{ type: "goto", cardId: IDS.card2 }];

    return {
      id: IDS.card1,
      kind: "quiz",
      elements: [
        { type: "button", id: "b1", x: 20, y: 200, w: 350, h: 80, label: "Dublin", actions: tileActions(true) },
        { type: "button", id: "b2", x: 420, y: 200, w: 350, h: 80, label: "Cork", actions: tileActions(false) },
        { type: "button", id: "b3", x: 20, y: 300, w: 350, h: 80, label: "Galway", actions: tileActions(false) },
        { type: "button", id: "b4", x: 420, y: 300, w: 350, h: 80, label: "Sligo", actions: tileActions(false) },
      ],
      actions: [],
    };
  }

  it("renders quiz buttons as .sy-tile elements", () => {
    const card = makeQuizCard();
    const stack = makeStack([card, makeCard({ id: IDS.card2, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate);

    const tiles = root.querySelectorAll(".sy-tile");
    expect(tiles.length).toBe(4);
  });

  it("each tile has a shape icon (.sy-tile-shape)", () => {
    const card = makeQuizCard();
    const stack = makeStack([card, makeCard({ id: IDS.card2, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate);

    const shapes = root.querySelectorAll(".sy-tile-shape");
    expect(shapes.length).toBe(4);
  });

  it("each tile displays its label text", () => {
    const card = makeQuizCard();
    const stack = makeStack([card, makeCard({ id: IDS.card2, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate);

    const tiles = root.querySelectorAll(".sy-tile");
    const labels = Array.from(tiles).map((t) => t.textContent ?? "");
    expect(labels.some((l) => l.includes("Dublin"))).toBe(true);
    expect(labels.some((l) => l.includes("Cork"))).toBe(true);
  });

  it("tile A has coral background (#F2735F)", () => {
    const card = makeQuizCard();
    const stack = makeStack([card, makeCard({ id: IDS.card2, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate);

    const firstTile = root.querySelector(".sy-tile") as HTMLElement | null;
    expect(firstTile?.style.backgroundColor).toBeTruthy();
    // jsdom normalises hex to rgb
    // #F2735F = rgb(242, 115, 95)
    expect(firstTile?.style.backgroundColor).toMatch(/rgb\(242,\s*115,\s*95\)|#[Ff]2735[Ff]|#f2735f/i);
  });

  it("a wrong pick reveals the correct tile with an ink outline during the hold", () => {
    vi.useFakeTimers();
    const card = makeQuizCard();
    const stack = makeStack([card, makeCard({ id: IDS.card2, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate);

    const tiles = Array.from(root.querySelectorAll<HTMLButtonElement>(".sy-tile"));
    const correct = tiles.find((t) => t.getAttribute("data-correct") === "true")!;
    const wrong = tiles.find((t) => t.getAttribute("data-correct") !== "true")!;
    expect(correct.textContent).toContain("Dublin");

    // Pick a wrong tile: the correct tile gets the reveal outline class.
    wrong.click();
    expect(correct.classList.contains("sy-tile-reveal")).toBe(true);

    // The reveal uses an ink outline (not stamp red).
    const css = document.head.querySelector("style")?.textContent ?? "";
    const revealRule = css.match(/\.sy-tile-reveal\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(revealRule).toMatch(/outline\s*:\s*3px solid var\(--color-ink\)/);

    vi.advanceTimersByTime(600);
    vi.useRealTimers();
  });

  it("clicking correct tile calls navigate with automatic=false after 900ms hold", () => {
    vi.useFakeTimers();
    const card = makeQuizCard();
    const stack = makeStack([card, makeCard({ id: IDS.card2, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate);

    // First tile is Dublin (correct)
    const firstTile = root.querySelector(".sy-tile") as HTMLButtonElement;
    firstTile.click();

    // Navigate not called immediately — stamp hold in progress.
    expect(navigate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(900);
    expect(navigate).toHaveBeenCalledWith(IDS.card2, false);
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// Stamp layout — position relative to tile label

describe("renderCard() — stamp layout (does not overlap tile label)", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  /**
   * Design spec (Round 3): the earned ink stamp straddles the tile's TOP edge
   * on the label side, mostly over the paper above the tile:
   *   - top:-34px; left:64px (never right-aligned, never over the answer word;
   *     lifted from -24px so the stamp's lower border clears the label at
   *     1920×1080 — J3 D4, 5 Nov panel)
   *   - transparent + mix-blend-mode:multiply (an ink stamp, not a paper sticker)
   *   - rotate(-8deg), boxed in stamp red.
   * Measuring stamp red over a tile colour fails AA; the top-edge placement puts
   * it on the 4.67:1 paper pairing. jsdom does no layout, so we assert the CSS
   * rule values; pixel overlap is confirmed by the built-player screenshot.
   */
  it("stamp CSS rule straddles the tile top edge (top:-34px; left:64px; transparent + multiply)", () => {
    // Force styles to be injected by rendering a card.
    const card: Card = {
      id: IDS.card1,
      kind: "quiz",
      elements: [
        { type: "button", id: "b1", x: 20, y: 200, w: 350, h: 80, label: "Dublin",
          actions: [{ type: "score", delta: 1 }, { type: "goto", cardId: IDS.end }] },
        { type: "button", id: "b2", x: 420, y: 200, w: 350, h: 80, label: "Cork",
          actions: [{ type: "goto", cardId: IDS.end }] },
      ],
      actions: [],
    };
    const stack: Stack = {
      id: IDS.stack,
      title: "Layout test",
      theme: { background: "#fff", foreground: "#000", font: "sans-serif" },
      cards: [card, { id: IDS.end, kind: "end", elements: [], actions: [] }],
    };
    const state = createRuntime(stack);
    const navigate = vi.fn();

    renderCard(card, root, state, navigate);

    // The PLAYER_STYLES string is injected into document.head as a <style> element.
    const styleEl = document.head.querySelector("style");
    expect(styleEl, "PLAYER_STYLES <style> element must exist").not.toBeNull();

    const css = styleEl!.textContent ?? "";

    // Extract the .sy-stamp rule block.
    const stampRuleMatch = css.match(/\.sy-stamp\s*\{([^}]+)\}/);
    expect(stampRuleMatch, ".sy-stamp rule must be present in injected styles").not.toBeNull();

    const stampRule = stampRuleMatch![1]!;

    // Straddles the tile's top edge on the label side (over the paper above),
    // lifted clear of the answer word.
    expect(stampRule).toMatch(/top\s*:\s*-34px/);
    expect(stampRule).toMatch(/left\s*:\s*64px/);
    // An ink stamp, not a paper sticker: transparent + multiply.
    expect(stampRule).toMatch(/background\s*:\s*transparent/);
    expect(stampRule).toMatch(/mix-blend-mode\s*:\s*multiply/);
    // Rotated and boxed in stamp red.
    expect(stampRule).toMatch(/transform\s*:\s*rotate\(-8deg\)/);
    expect(stampRule).toMatch(/border\s*:\s*3px solid var\(--color-stamp\)/);

    // NOTE: jsdom does no layout; real pixel overlap (stamp over the paper, not
    // the tile colour) is confirmed by the built-player screenshot.
  });

  it("stamp element appears after correct click and tile label remains present", () => {
    vi.useFakeTimers();
    const card: Card = {
      id: IDS.card1,
      kind: "quiz",
      elements: [
        { type: "button", id: "b1", x: 20, y: 200, w: 350, h: 80, label: "Dublin",
          actions: [{ type: "score", delta: 1 }, { type: "goto", cardId: IDS.end }] },
        { type: "button", id: "b2", x: 420, y: 200, w: 350, h: 80, label: "Cork",
          actions: [{ type: "goto", cardId: IDS.end }] },
      ],
      actions: [],
    };
    const stack: Stack = {
      id: IDS.stack,
      title: "Layout test",
      theme: { background: "#fff", foreground: "#000", font: "sans-serif" },
      cards: [card, { id: IDS.end, kind: "end", elements: [], actions: [] }],
    };
    const state = createRuntime(stack);
    const navigate = vi.fn();

    renderCard(card, root, state, navigate);

    // Click the correct tile (Dublin = first tile).
    const firstTile = root.querySelector(".sy-tile") as HTMLButtonElement;
    firstTile.click();

    // The stamp should now be in the DOM.
    const stamp = firstTile.querySelector(".sy-stamp") as HTMLElement | null;
    expect(stamp, ".sy-stamp element must appear after correct click").not.toBeNull();
    expect(stamp!.textContent).toBe("CORRECT ✓");

    // Verify opacity from the CSS class rule.
    const css = document.head.querySelector("style")?.textContent ?? "";
    const stampRule = css.match(/\.sy-stamp\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(stampRule).toMatch(/opacity\s*:\s*0\.92/);

    // Tile label span is still present — stamp did not replace it.
    const labelSpan = Array.from(firstTile.querySelectorAll("span"))
      .find((s) => s.textContent === "Dublin");
    expect(labelSpan, "tile label span must still exist after stamp appears").not.toBeNull();

    vi.advanceTimersByTime(900);
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// Aria-live stamp announcement

describe("renderCard() — accessibility", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  it("aria-live region exists on the document after first render", () => {
    const card = makeCard();
    const stack = makeStack([card, makeCard({ id: IDS.end, kind: "end" })]);
    const state = createRuntime(stack);
    const navigate = vi.fn();

    renderCard(card, root, state, navigate);

    const liveRegion = document.querySelector("[aria-live='polite']");
    expect(liveRegion).not.toBeNull();
  });
});
