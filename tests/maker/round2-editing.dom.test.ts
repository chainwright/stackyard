// tests/maker/round2-editing.dom.test.ts
// TASK-26 i, o: the teacher's editing dead ends from the round-2 panel (J2) and
// the honest ready-made banner (J1). Each test is a thing a real teacher did.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, h } from "preact";
import { Inspector } from "../../src/editor/Inspector.js";
import { Toolbar } from "../../src/editor/Toolbar.js";
import { ExportDone } from "../../src/editor/ExportDone.js";
import { EditorScreen } from "../../src/editor/EditorScreen.js";
import { App } from "../../src/editor/app.js";
import { StartScreen } from "../../src/editor/StartScreen.js";
import { EditorStore } from "../../src/editor/store.js";
import { _resetAnnouncer } from "../../src/editor/a11y.js";
import { setFlashSide, addAnswer } from "../../src/editor/operations.js";
import { isRejected } from "../../src/editor/types.js";
import { fallbackMessage } from "../../src/editor/fallbackMessages.js";
import { validate } from "../../src/shared/validator.js";
import { gotoOf } from "../../src/shared/flow.js";
import { vikingsStack } from "../../src/shared/readyMadeStacks.js";
import { creditLine, creditFull } from "../../src/shared/deckImageTypes.js";
import { READY_MADE_IMAGES } from "../../src/shared/readyMadeImages.js";
import type { Stack, Card, ButtonElement } from "../../src/shared/types.js";
import { quizStack } from "./fixtures.js";

class FakeResizeObserver { observe(): void {} unobserve(): void {} disconnect(): void {} }
(globalThis as unknown as Record<string, unknown>)["ResizeObserver"] = FakeResizeObserver;

const U = (n: number): string => `feed0000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

function makeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}
async function flush(): Promise<void> {
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

/** A flash card exactly as the live model wrote it: ONE text, no back. */
function aiFlashStack(): Stack {
  return {
    id: U(1),
    title: "Water cycle",
    theme: { background: "#fff", foreground: "#000", font: "sans-serif" },
    cards: [
      {
        id: U(10), kind: "flash", actions: [],
        elements: [
          { type: "text", id: U(11), x: 48, y: 264, w: 704, h: 72, content: "Evaporation" },
          { type: "button", id: U(12), x: 408, y: 496, w: 344, h: 72, label: "Next Card", actions: [{ type: "goto", cardId: U(99) }] },
        ],
      },
      { id: U(99), kind: "end", actions: [], elements: [{ type: "field", id: U(98), x: 48, y: 420, w: 704, h: 60, variable: "score" }] },
    ],
  };
}

// ---------------------------------------------------------------------------
// Pure operations

describe("TASK-26o: setFlashSide never drops typing", () => {
  it("creates the BACK when the card has none, after the front", () => {
    const s = aiFlashStack();
    const out = setFlashSide(s, U(10), "back", "When the sun heats water.");
    expect(isRejected(out as never)).toBe(false);
    const texts = (out as Stack).cards[0]!.elements.filter((e) => e.type === "text");
    expect(texts).toHaveLength(2);
    expect(texts[0]!.type === "text" && texts[0]!.content).toBe("Evaporation");
    expect(texts[1]!.type === "text" && texts[1]!.content).toBe("When the sun heats water.");
    expect(validate(out).valid).toBe(true);
  });

  it("creates a front first when asked for a back on a card with no text at all", () => {
    const s = aiFlashStack();
    s.cards[0]!.elements = [];
    const out = setFlashSide(s, U(10), "back", "Only a back") as Stack;
    const texts = out.cards[0]!.elements.filter((e) => e.type === "text");
    expect(texts).toHaveLength(2);
    expect(texts[1]!.type === "text" && texts[1]!.content).toBe("Only a back");
  });

  it("edits an existing front/back in place and rejects a non-flash card", () => {
    const s = setFlashSide(aiFlashStack(), U(10), "back", "b1") as Stack;
    const s2 = setFlashSide(s, U(10), "back", "b2") as Stack;
    expect(s2.cards[0]!.elements.filter((e) => e.type === "text")).toHaveLength(2);
    const s3 = setFlashSide(s2, U(10), "front", "Term 2") as Stack;
    expect(s3.cards[0]!.elements.find((e) => e.type === "text" && e.content === "Term 2")).toBeDefined();
    expect(isRejected(setFlashSide(quizStack(), quizStack().cards[0]!.id, "back", "x") as never)).toBe(true);
  });
});

describe("TASK-26o: addAnswer adds a REAL answer that links forward", () => {
  it("adds a wrong-by-default coloured answer in a free tile slot that goes where the others go", () => {
    const s = quizStack();
    const quiz = s.cards[0]!;
    const before = quiz.elements.filter((e) => e.type === "button").length;
    const out = addAnswer(s, quiz.id) as Stack;
    expect(isRejected(out as never)).toBe(false);
    const buttons = out.cards[0]!.elements.filter((e): e is ButtonElement => e.type === "button");
    expect(buttons).toHaveLength(before + 1);
    const added = buttons[buttons.length - 1]!;
    expect(added.actions.some((a) => a.type === "score" && a.delta === 0)).toBe(true);
    expect(added.actions.some((a) => a.type === "score" && a.delta === 1)).toBe(false);
    expect(gotoOf(added.actions)).toBe(gotoOf(buttons[0]!.actions)); // same destination as its siblings
    // Exactly one right answer still; stack valid.
    expect(buttons.filter((b) => b.actions.some((a) => a.type === "score" && a.delta === 1))).toHaveLength(1);
    expect(validate(out).valid).toBe(true);
    // No overlap with another answer.
    for (const b of buttons) {
      if (b === added) continue;
      const overlap = added.x < b.x + b.w && added.x + added.w > b.x && added.y < b.y + b.h && added.y + added.h > b.y;
      expect(overlap).toBe(false);
    }
  });

  it("stops at four answers with a plain message", () => {
    let s = quizStack();
    const id = s.cards[0]!.id;
    for (let i = 0; i < 6; i++) {
      const r = addAnswer(s, id);
      if (isRejected(r as never)) {
        expect((r as { message: string }).message).toBe("A question can have up to four answers.");
        break;
      }
      s = r as Stack;
    }
    expect(s.cards[0]!.elements.filter((e) => e.type === "button")).toHaveLength(4);
  });

  it("only belongs on a quiz card", () => {
    expect(isRejected(addAnswer(aiFlashStack(), U(10)) as never)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Inspector / Toolbar

describe("TASK-26o: the Inspector and Toolbar", () => {
  let mounted: HTMLElement | null = null;
  const redraw: { current: () => void } = { current: () => {} };

  beforeEach(() => {
    document.body.innerHTML = "";
    _resetAnnouncer();
  });
  afterEach(() => {
    if (mounted) render(null, mounted);
    mounted = null;
  });

  function storeFor(stack: Stack): EditorStore {
    const s = new EditorStore({ stack, screen: "editor" }, { storage: makeStorage(), onChange: () => redraw.current() });
    s.setSelectedCard(stack.cards[0]!.id);
    return s;
  }
  function mountInspector(store: EditorStore): HTMLElement {
    const root = document.createElement("div");
    document.body.appendChild(root);
    redraw.current = () => render(h(Inspector, { store }), root);
    redraw.current();
    mounted = root;
    return root;
  }
  function mountToolbar(store: EditorStore): HTMLElement {
    const root = document.createElement("div");
    document.body.appendChild(root);
    redraw.current = () => render(h(Toolbar, { store }), root);
    redraw.current();
    mounted = root;
    return root;
  }

  it("text typed into the Back box of a back-less flash card is KEPT", async () => {
    const store = storeFor(aiFlashStack());
    const root = mountInspector(store);
    const back = root.querySelector<HTMLTextAreaElement>("#back")!;
    back.value = "When the sun heats water and it rises as vapour.";
    back.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    const texts = store.getStack()!.cards[0]!.elements.filter((e) => e.type === "text");
    expect(texts).toHaveLength(2);
    expect(texts[1]!.type === "text" && texts[1]!.content).toBe("When the sun heats water and it rises as vapour.");
    // …and it is still there after the panel re-renders (moving away and back).
    expect(root.querySelector<HTMLTextAreaElement>("#back")!.value).toBe("When the sun heats water and it rises as vapour.");
  });

  it("the Front box edits the term (and creates it if the card has none)", async () => {
    const stack = aiFlashStack();
    stack.cards[0]!.elements = stack.cards[0]!.elements.filter((e) => e.type !== "text");
    const store = storeFor(stack);
    const root = mountInspector(store);
    const front = root.querySelector<HTMLInputElement>("#front")!;
    front.value = "Condensation";
    front.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    expect(store.getStack()!.cards[0]!.elements.find((e) => e.type === "text" && e.content === "Condensation")).toBeDefined();
  });

  it("'+ Add an answer' in the inspector adds a linked answer and selects it", async () => {
    const store = storeFor(quizStack());
    const root = mountInspector(store);
    const btn = root.querySelector<HTMLButtonElement>(".add-answer-btn")!;
    expect(btn).not.toBeNull();
    btn.click();
    await flush();
    const buttons = store.getStack()!.cards[0]!.elements.filter((e): e is ButtonElement => e.type === "button");
    expect(buttons).toHaveLength(3);
    const added = buttons[2]!;
    expect(gotoOf(added.actions)).not.toBeNull();
    expect(store.getState().selectedElementId).toBe(added.id);
  });

  it("the toolbar offers 'Add Answer' on a quiz card only, and it adds a real answer", async () => {
    const store = storeFor(quizStack());
    const root = mountToolbar(store);
    const tool = Array.from(root.querySelectorAll<HTMLButtonElement>(".tool-card")).find((b) => (b.textContent ?? "").includes("Add Answer"));
    expect(tool, "Add Answer on a quiz card").toBeDefined();
    tool!.click();
    await flush();
    const added = store.getStack()!.cards[0]!.elements.filter((e): e is ButtonElement => e.type === "button").pop()!;
    expect(added.actions.some((a) => a.type === "score")).toBe(true);
    expect(gotoOf(added.actions)).not.toBeNull();

    // Not offered on a flash card.
    const flashRoot = mountToolbar(storeFor(aiFlashStack()));
    expect(Array.from(flashRoot.querySelectorAll(".tool-card")).some((b) => (b.textContent ?? "").includes("Add Answer"))).toBe(false);
  });

  it("selecting a picture credit shows the FULL link in the inspector, not on the card", () => {
    const stack = vikingsStack();
    const credit = stack.cards[0]!.elements.find(
      (e) => e.type === "text" && /^Image:/.test(e.content),
    )!;
    const store = storeFor(stack);
    store.setSelectedElement(credit.id);
    const root = mountInspector(store);
    const full = root.querySelector(".credit-full")?.textContent ?? "";
    const img = READY_MADE_IMAGES["vikings"]!;
    expect(full).toContain(creditFull(img));
    expect(full).toContain("https://www.flickr.com/");
    // The text on the card itself has only the domain.
    expect(credit.type === "text" && credit.content).toBe(creditLine(img));
    expect(credit.type === "text" && credit.content).not.toContain("http");
  });
});

// ---------------------------------------------------------------------------
// The "before you share" screen

describe("TASK-26o: the export screen warns about both dead ends", () => {
  it("lists a flash card with no way forward and an answer that goes nowhere", () => {
    const stack = aiFlashStack();
    stack.cards[0]!.elements = stack.cards[0]!.elements.filter((e) => e.type !== "button"); // nothing to press
    const quizCard: Card = {
      id: U(20), kind: "quiz", actions: [],
      elements: [
        { type: "text", id: U(21), x: 48, y: 104, w: 704, h: 160, content: "Where does vapour come from?" },
        { type: "button", id: U(22), x: 48, y: 296, w: 344, h: 96, label: "The sea", actions: [{ type: "score", delta: 1 }, { type: "goto", cardId: U(99) }] },
        { type: "button", id: U(23), x: 408, y: 296, w: 344, h: 96, label: "Puddles", actions: [{ type: "score", delta: 0 }, { type: "goto", cardId: U(99) }] },
        { type: "button", id: U(24), x: 48, y: 424, w: 344, h: 80, label: "Clouds", actions: [] },
      ],
    };
    stack.cards.splice(1, 0, quizCard);
    stack.cards[0]!.actions = [{ type: "goto", cardId: U(20) }]; // make the quiz reachable but leave the flash "stuck" visually
    // The auto-advance above makes the flash card fine; remove it so it IS stuck.
    stack.cards[0]!.actions = [];

    document.body.innerHTML = "";
    const root = document.createElement("div");
    document.body.appendChild(root);
    render(
      h(ExportDone, { filename: "x.html", stack, onOpen: () => {}, onBack: () => {}, onExportAgain: () => {}, onFixFlow: () => {} }),
      root,
    );
    const items = Array.from(root.querySelectorAll(".share-check li")).map((li) => li.textContent ?? "");
    expect(items.some((t) => t.includes("has no way to move on"))).toBe(true);
    render(null, root);

    // And a quiz that IS reachable shows the dead-end answer.
    const reachable = structuredClone(stack);
    reachable.cards[0]!.elements.push({ type: "button", id: U(13), x: 408, y: 496, w: 344, h: 72, label: "Next Card", actions: [{ type: "goto", cardId: U(20) }] });
    const root2 = document.createElement("div");
    document.body.appendChild(root2);
    render(
      h(ExportDone, { filename: "x.html", stack: reachable, onOpen: () => {}, onBack: () => {}, onExportAgain: () => {}, onFixFlow: () => {} }),
      root2,
    );
    const items2 = Array.from(root2.querySelectorAll(".share-check li")).map((li) => li.textContent ?? "");
    expect(items2.some((t) => t.includes("has an answer that goes nowhere"))).toBe(true);
    render(null, root2);
  });

  it("says nothing on a healthy deck, and mentions the Teacher tab for a living file", () => {
    document.body.innerHTML = "";
    const root = document.createElement("div");
    document.body.appendChild(root);
    render(
      h(ExportDone, { filename: "x.html", stack: vikingsStack(), living: true, onOpen: () => {}, onBack: () => {}, onExportAgain: () => {}, onFixFlow: () => {} }),
      root,
    );
    expect(root.querySelector(".share-check")).toBeNull();
    expect(root.querySelector(".teacher-hint")?.textContent).toContain("Teacher");
    render(h(ExportDone, { filename: "x.html", stack: vikingsStack(), living: false, onOpen: () => {}, onBack: () => {}, onExportAgain: () => {}, onFixFlow: () => {} }), root);
    expect(root.querySelector(".teacher-hint")).toBeNull();
    render(null, root);
  });
});

// ---------------------------------------------------------------------------
// TASK-26i: the banner after picking a ready-made deck

describe("TASK-26i: choosing a ready-made deck is not a failure", () => {
  let mounted: HTMLElement | null = null;
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    _resetAnnouncer();
  });
  afterEach(() => {
    if (mounted) render(null, mounted);
    mounted = null;
    vi.restoreAllMocks();
  });

  it("the banner says 'Here's a ready-made deck you can edit.' — never 'resting'", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    render(h(App, {}), root);
    mounted = root;
    await flush();
    root.querySelector<HTMLButtonElement>(".ready-made-link")!.click();
    await flush();
    const notice = root.querySelector(".notice")?.textContent ?? "";
    expect(notice).toContain("Here's a ready-made deck you can edit.");
    expect(notice).not.toContain("resting");
    expect(notice).not.toContain("offline");
  });

  it("fallbackMessage: 'chosen' is honest online and off; real failures keep their wording", () => {
    expect(fallbackMessage("chosen", true)).toBe("Here's a ready-made deck you can edit.");
    expect(fallbackMessage("chosen", false)).toBe("Here's a ready-made deck you can edit.");
    expect(fallbackMessage("error", true)).toContain("resting");
    expect(fallbackMessage("timeout", true)).toContain("in time");
    expect(fallbackMessage("cap", true)).toContain("budget");
    expect(fallbackMessage("no-key", false)).toContain("offline");
  });

  it("EditorScreen shows no notice for a model-built deck", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const store = new EditorStore({ stack: quizStack(), screen: "editor" }, { storage: makeStorage() });
    render(h(EditorScreen, { store }), root);
    expect(root.querySelector(".notice")).toBeNull();
    render(null, root);
  });
});

// ---------------------------------------------------------------------------
// TASK-26f: the wait screen

describe("TASK-26f: an honest wait screen", () => {
  let root: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
    vi.useFakeTimers();
  });
  afterEach(() => {
    render(null, root);
    vi.useRealTimers();
  });

  const mountWait = (props: Record<string, unknown>): void => {
    const store = new EditorStore({ status: "generating" });
    render(h(StartScreen, { store, ...props }), root);
  };

  it("never promises 20 seconds flat; it says 20–45 (TASK-28f: measured live 20–30 s)", () => {
    mountWait({ __demoDealt: [], __demoTotal: 0 });
    expect(root.textContent).toContain("20–45 seconds");
    expect(root.textContent).not.toContain("20 seconds");
  });

  it("before the stream's start event, a moving seconds counter proves it is working", async () => {
    mountWait({ __demoDealt: [], __demoTotal: 0 });
    const counter = (): string => root.querySelector(".counter")?.textContent ?? "";
    const seconds = (): number => Number(/·\s*(\d+)s/.exec(counter())?.[1] ?? NaN);
    expect(counter()).toContain("Asking the AI to plan your cards…");
    // Let Preact run its effects (the interval starts there).
    await vi.advanceTimersByTimeAsync(300);
    const start = seconds();
    expect(Number.isFinite(start)).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(seconds()).toBeGreaterThanOrEqual(start + 4); // it moved
    await vi.advanceTimersByTimeAsync(20000);
    expect(seconds()).toBeGreaterThanOrEqual(start + 24); // and keeps moving through a long wait
  });

  it("after the start event it shows the set's title, long before the first card", () => {
    mountWait({ __demoDealt: [], __demoTotal: 0, __demoTitle: "The water cycle" });
    expect(root.querySelector(".counter")?.textContent).toContain("Writing “The water cycle” — card 1…");
    expect(root.querySelector(".deal-num")?.textContent).toBe("The water cycle");
  });

  it("then it counts the cards as they are written", () => {
    mountWait({
      __demoTitle: "The water cycle",
      __demoTotal: 0,
      __demoDealt: [
        { index: 0, total: 0, kind: "flash", question: "Evaporation", answers: [] },
        { index: 1, total: 0, kind: "quiz", question: "Q?", answers: ["a", "b"] },
      ],
    });
    expect(root.querySelector(".counter")?.textContent).toContain("Card 2 written");
  });

  it("the offline (ready-made) path shows no time estimate and no seconds counter", () => {
    mountWait({ __demoOffline: true, __demoDealt: [], __demoTotal: 0 });
    expect(root.textContent).not.toContain("30–45");
    expect(root.querySelector(".elapsed")).toBeNull();
  });
});
