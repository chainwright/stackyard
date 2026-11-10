// tests/a11y-player.dom.test.ts
// TASK-33d2 (screen-reader semantics in the player and the Teacher tab),
// TASK-33d3 (keyboard paths that jsdom can show) and TASK-33d4 (one-switch
// scanning, with fake timers). The real-browser halves are in
// scripts/check-a11y.ts.

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, h } from "preact";
import { renderCard, tileAccessibleName, TILE_SHAPE_NAMES } from "../src/player/renderer.js";
import { createRuntime } from "../src/player/runtime.js";
import { mountPlayer } from "../src/player/mount.js";
import { installScan, scanInterval, scanStep, SCAN_KEY, SCAN_MS_KEY } from "../src/player/scan.js";
import { mountLivingApp } from "../src/living/livingApp.js";
import { CardList } from "../src/editor/CardList.js";
import { EditorStore } from "../src/editor/store.js";
import { vikingsStack } from "../src/shared/readyMadeStacks.js";
import type { Card, Stack } from "../src/shared/types.js";

class FakeResizeObserver { observe(): void {} unobserve(): void {} disconnect(): void {} }
(globalThis as unknown as Record<string, unknown>)["ResizeObserver"] = FakeResizeObserver;

const live = (): string => document.querySelector("[aria-live='polite']")?.textContent ?? "";
const frame = (): Promise<void> => new Promise((r) => setTimeout(r, 40));

let teardowns: Array<() => void> = [];
beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
});
afterEach(() => {
  for (const t of teardowns) t();
  teardowns = [];
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.documentElement.classList.remove("sy-scanning");
});

function stack(): Stack {
  return vikingsStack();
}
const firstOf = (s: Stack, kind: Card["kind"]): Card => s.cards.find((c) => c.kind === kind)!;

function draw(card: Card, s: Stack, position?: number): HTMLElement {
  const root = document.createElement("main");
  root.id = "player-root";
  document.body.appendChild(root);
  const state = createRuntime(s);
  state.currentCardId = card.id;
  const i = s.cards.indexOf(card);
  const next = s.cards[i + 1]?.id;
  renderCard(card, root, state, () => {}, () => {}, { position: position ?? i + 1, total: s.cards.length, ...(next ? { nextCardId: next } : {}) });
  return root;
}

describe("TASK-33d2: screen-reader semantics in the player", () => {
  it("TASK-33d2: each answer tile's name starts with its shape ('Triangle: Vikings'), and still contains its words", () => {
    const s = stack();
    const quiz = firstOf(s, "quiz");
    const root = draw(quiz, s);
    const tiles = Array.from(root.querySelectorAll<HTMLButtonElement>(".sy-tile"));
    expect(tiles.length).toBeGreaterThanOrEqual(3);
    tiles.forEach((t, i) => {
      const words = t.querySelector(".sy-tile-label")!.textContent!;
      expect(t.getAttribute("aria-label")).toBe(`${TILE_SHAPE_NAMES[i]}: ${words}`);
    });
    expect(tileAccessibleName(0, "Vikings")).toBe("Triangle: Vikings");
    expect(tileAccessibleName(5, "x")).toBe("Diamond: x");
  });

  it("TASK-33d2: the card is a named group, 'Card N of M: <question>', focusable from script only; one h1 names the deck", () => {
    const s = stack();
    const quiz = firstOf(s, "quiz");
    const root = draw(quiz, s);
    const card = root.querySelector(".sy-card")!;
    const q = root.querySelector(".sy-question")!.textContent!;
    expect(card.getAttribute("role")).toBe("group");
    expect(card.getAttribute("tabindex")).toBe("-1");
    expect(card.getAttribute("aria-label")).toBe(`Card ${s.cards.indexOf(quiz) + 1} of ${s.cards.length}: ${q}`);
    const h1s = root.querySelectorAll("h1");
    expect(h1s.length).toBe(1);
    expect(h1s[0]!.textContent).toBe(s.title);
  });

  it("TASK-33d2: after an answer the live region says 'Correct', or 'Not quite — the right answer was …'", async () => {
    const s = stack();
    const quiz = firstOf(s, "quiz");
    let root = draw(quiz, s);
    root.querySelector<HTMLButtonElement>(".sy-tile[data-correct='true']")!.click();
    await frame();
    expect(live()).toBe("Correct");
    // The stamp is visual only.
    expect(root.querySelector(".sy-stamp")!.getAttribute("aria-hidden")).toBe("true");

    document.body.innerHTML = "";
    root = draw(quiz, s);
    const right = root.querySelector(".sy-tile[data-correct='true'] .sy-tile-label")!.textContent!;
    root.querySelector<HTMLButtonElement>(".sy-tile:not([data-correct='true'])")!.click();
    await frame();
    expect(live()).toBe(`Not quite — the right answer was ${right}.`);
    await new Promise((r) => setTimeout(r, 260));
    expect(root.querySelector(".sy-wrong-stamp")!.getAttribute("aria-hidden")).toBe("true");
    expect(root.querySelector(".sy-reveal-mark")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("TASK-33d2: the flash card is a button named by its words, with aria-expanded for its side; Next Card is beside it, not inside", () => {
    const s = stack();
    const flash = firstOf(s, "flash");
    const root = draw(flash, s);
    const surface = root.querySelector<HTMLElement>(".sy-flash")!;
    expect(surface.getAttribute("role")).toBe("button");
    expect(surface.getAttribute("tabindex")).toBe("0");
    expect(surface.hasAttribute("aria-label")).toBe(false);
    expect(surface.getAttribute("aria-expanded")).toBe("false");
    const term = (flash.elements.find((e) => e.type === "text") as { content: string }).content;
    expect(surface.textContent).toContain(term);
    surface.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(surface.getAttribute("aria-expanded")).toBe("true");
    const next = root.querySelector(".sy-flash-next button")!;
    expect(surface.contains(next)).toBe(false);
    expect(surface.querySelector("button, [role='button']")).toBeNull();
    surface.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(surface.getAttribute("aria-expanded")).toBe("false");
  });

  it("TASK-33d2: the end card reads its heading and the score; the stamp slots are hidden, the row is one image", () => {
    const s = stack();
    const end = firstOf(s, "end");
    const root = document.createElement("main");
    document.body.appendChild(root);
    const state = createRuntime(s);
    state.variables["score"] = 2;
    renderCard(end, root, state, () => {}, () => {});
    const total = s.cards.filter((c) => c.kind === "quiz").length;
    const card = root.querySelector(".sy-card")!;
    expect(card.getAttribute("aria-label")).toMatch(new RegExp(`\\. Score 2 of ${total}$`));
    expect(root.querySelector(".sy-end-score")!.textContent).toBe(`Score 2 of ${total}`);
    expect(live()).toContain(`Score 2 of ${total}.`);
    const row = root.querySelector(".sy-end-stamps")!;
    expect(row.getAttribute("role")).toBe("img");
    expect(row.getAttribute("aria-label")).toBe(`2 of ${total} stamps earned`);
    for (const slot of Array.from(row.children)) expect(slot.getAttribute("aria-hidden")).toBe("true");
  });

  it("TASK-33d2: after a card change, focus moves to the new card (so it is read); the first card does not take focus", () => {
    vi.useFakeTimers();
    const s = stack();
    const root = document.createElement("main");
    document.body.appendChild(root);
    teardowns.push(mountPlayer(s, root, { flip: false }));
    expect(document.activeElement).toBe(document.body);
    const tile = root.querySelector<HTMLButtonElement>(".sy-tile[data-correct='true']")!;
    tile.focus();
    tile.click();
    vi.advanceTimersByTime(2000);
    const card = root.querySelector(".sy-card")!;
    expect(document.activeElement).toBe(card);
    expect(card.getAttribute("aria-label")).toMatch(/^Card 2 of \d+/);
  });

  it("TASK-33d2: focus somewhere else on the page (e.g. the Teacher tab) is never taken by a card change", () => {
    vi.useFakeTimers();
    const s = stack();
    const root = document.createElement("main");
    const other = document.createElement("button");
    document.body.append(root, other);
    teardowns.push(mountPlayer(s, root, { flip: false }));
    root.querySelector<HTMLButtonElement>(".sy-tile[data-correct='true']")!.click();
    other.focus();
    vi.advanceTimersByTime(2000);
    expect(document.activeElement).toBe(other);
  });
});

describe("TASK-33d4: one-switch scanning", () => {
  function setup(): HTMLElement {
    const s = stack();
    const root = document.createElement("main");
    document.body.appendChild(root);
    teardowns.push(mountPlayer(s, root, { flip: false, scan: true }));
    return root;
  }
  const toggle = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>(".sy-scan-toggle")!;

  it("TASK-33d4: off by default; the Scan control is a named toggle in a named region", () => {
    setup();
    expect(toggle().getAttribute("aria-pressed")).toBe("false");
    expect(document.documentElement.classList.contains("sy-scanning")).toBe(false);
    expect(document.querySelector(".sy-scan-bar")!.getAttribute("role")).toBe("region");
    expect(document.querySelector(".sy-scan-bar")!.getAttribute("aria-label")).toBe("Switch scanning");
    expect(document.querySelector(".sy-scan-speed")!.getAttribute("aria-label")).toBe("Scan speed");
  });

  it("TASK-33d4: with scanning on, the highlight (= focus) steps across the choices every 1.5 s and wraps", () => {
    vi.useFakeTimers();
    const root = setup();
    toggle().click();
    const tiles = Array.from(root.querySelectorAll<HTMLElement>(".sy-tile"));
    expect(document.activeElement).toBe(tiles[0]);
    expect(tiles[0]!.classList.contains("sy-scan-focus")).toBe(true);
    vi.advanceTimersByTime(1499);
    expect(document.activeElement).toBe(tiles[0]);
    vi.advanceTimersByTime(1);
    expect(document.activeElement).toBe(tiles[1]);
    expect(tiles[0]!.classList.contains("sy-scan-focus")).toBe(false);
    vi.advanceTimersByTime(1500 * (tiles.length - 1));
    expect(document.activeElement).toBe(tiles[0]); // wrapped
  });

  it("TASK-33d4: picking the highlighted tile (its own click) answers, and the scan carries on on the next card", () => {
    vi.useFakeTimers();
    const root = setup();
    toggle().click();
    while (!(document.activeElement as HTMLElement).matches(".sy-tile[data-correct='true']")) vi.advanceTimersByTime(1500);
    (document.activeElement as HTMLButtonElement).click(); // what Space / Enter do on a focused button
    vi.advanceTimersByTime(2000);
    expect(root.querySelector(".sy-meta")!.textContent).toMatch(/^Card 2 of/);
    vi.advanceTimersByTime(1500);
    expect((document.activeElement as HTMLElement).closest("#player-root, main")).toBe(root);
    expect((document.activeElement as HTMLElement).classList.contains("sy-scan-focus")).toBe(true);
  });

  it("TASK-33d4: the S key turns it on and off (but not while typing); the speed is 1–4 s; the setting lasts the session only", () => {
    vi.useFakeTimers();
    setup();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "s", bubbles: true }));
    expect(toggle().getAttribute("aria-pressed")).toBe("true");
    expect(sessionStorage.getItem(SCAN_KEY)).toBe("on");
    expect(localStorage.getItem(SCAN_KEY)).toBeNull();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "s", bubbles: true }));
    expect(toggle().getAttribute("aria-pressed")).toBe("true");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "S", bubbles: true }));
    expect(toggle().getAttribute("aria-pressed")).toBe("false");
    expect(sessionStorage.getItem(SCAN_KEY)).toBeNull();

    for (const [raw, want] of [["", 1500], ["500", 1000], ["2500", 2500], ["9000", 4000], ["nope", 1500]] as const) {
      sessionStorage.setItem(SCAN_MS_KEY, raw);
      expect(scanInterval(), raw).toBe(want);
    }
  });

  it("TASK-33d4: a chosen speed is used, and a remembered 'on' comes back on the next mount in the same session", () => {
    vi.useFakeTimers();
    sessionStorage.setItem(SCAN_KEY, "on");
    sessionStorage.setItem(SCAN_MS_KEY, "3000");
    const root = setup();
    expect(toggle().getAttribute("aria-pressed")).toBe("true");
    const tiles = Array.from(root.querySelectorAll<HTMLElement>(".sy-tile"));
    expect(document.activeElement).toBe(tiles[0]);
    vi.advanceTimersByTime(2999);
    expect(document.activeElement).toBe(tiles[0]);
    vi.advanceTimersByTime(1);
    expect(document.activeElement).toBe(tiles[1]);
  });

  it("TASK-33d4: scanStep skips disabled controls, and does nothing on a card with no choices", () => {
    const host = document.createElement("div");
    host.innerHTML = `<div class="sy-card"><button class="sy-tile" disabled>a</button><button class="sy-tile">b</button></div>`;
    document.body.appendChild(host);
    expect(scanStep(host)!.textContent).toBe("b");
    expect(scanStep(host)!.textContent).toBe("b");
    const empty = document.createElement("div");
    expect(scanStep(empty)).toBeNull();
    const stop = installScan(empty, document.body);
    stop();
    expect(document.querySelector(".sy-scan-bar")).toBeNull();
  });
});

describe("TASK-33d3: the Teacher tab by keyboard, and Escape", () => {
  function open(): void {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const root = document.createElement("main");
    root.id = "player-root";
    document.body.appendChild(root);
    teardowns.push(mountLivingApp(stack(), root, { pristineHtml: "<html><body></body></html>" }));
    document.querySelector<HTMLButtonElement>(".sy-teacher-tab")!.click();
  }

  it("TASK-33d1: the editor is a named modal dialog, and every inspector box has a label tied to it", () => {
    open();
    const overlay = document.querySelector(".sy-living-overlay")!;
    expect(overlay.getAttribute("role")).toBe("dialog");
    expect(overlay.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(overlay.getAttribute("aria-labelledby")!)!.textContent).toBe("Editing — no internet needed");
    expect(document.activeElement).toBe(document.getElementById("sy-living-title"));
    // Walk every card: each box in the inspector has its <label for>.
    const listButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".sy-living-list button"));
    let boxes = 0;
    for (let i = 0; i < listButtons.length; i++) {
      document.querySelectorAll<HTMLButtonElement>(".sy-living-list button")[i]!.click();
      for (const box of Array.from(document.querySelectorAll<HTMLElement>(".sy-living-inspector textarea, .sy-living-inspector input[type=text], .sy-living-inspector select"))) {
        boxes++;
        expect(box.id, box.outerHTML.slice(0, 60)).not.toBe("");
        expect(document.querySelector(`label[for="${box.id}"]`), box.outerHTML.slice(0, 60)).not.toBeNull();
      }
    }
    expect(boxes).toBeGreaterThan(0);
  });

  it("TASK-33d3: the preview's question is a keyboard button; Enter selects it and the cursor goes into its box", () => {
    open();
    const q = document.querySelector<HTMLElement>(".sy-living-canvas .sy-element[role='button']")!;
    expect(q.tabIndex).toBe(0);
    expect(q.getAttribute("aria-label")).toBe(`Edit: ${q.textContent!.trim()}`);
    q.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    const ta = document.activeElement as HTMLTextAreaElement;
    expect(ta.matches(".sy-living-inspector textarea")).toBe(true);
    expect(ta.value).toBe(q.textContent!.trim());
  });

  it("TASK-33d3: Escape leaves Try It first, then leaves the editor back to Play with focus on the Teacher tab", () => {
    open();
    document.querySelector<HTMLButtonElement>(".sy-try")!.click();
    expect(document.querySelector(".sy-living-tryit")).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector(".sy-living-tryit")).toBeNull();
    expect(document.querySelector(".sy-living-overlay")).not.toBeNull();
    expect(document.activeElement).toBe(document.querySelector(".sy-try"));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector(".sy-living-overlay")).toBeNull();
    expect(document.querySelector("#player-root .sy-card")).not.toBeNull();
    expect(document.activeElement).toBe(document.querySelector(".sy-teacher-tab"));
  });
});

describe("TASK-33d1: the Maker's card list has no button inside a button", () => {
  it("TASK-33d1: the move buttons sit beside the selected card's button", () => {
    const s = vikingsStack();
    const store = new EditorStore({ stack: s, screen: "editor" }, { storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });
    store.setSelectedCard(s.cards[0]!.id);
    const root = document.createElement("div");
    document.body.appendChild(root);
    render(h(CardList, { store }), root);
    teardowns.push(() => render(null, root));
    expect(root.querySelector("button button")).toBeNull();
    const row = root.querySelector(".card-entry[aria-current='true']")!.parentElement!;
    expect(row.classList.contains("card-entry-row")).toBe(true);
    expect(row.querySelector(":scope > .reorder [aria-label='Move card 1 down']")).not.toBeNull();
  });
});
