// tests/maker/sticky-notice.test.ts
// Built-app review round 3, P1 #1: the "This card is full" notice must clear on
// the next action, on a card change, and on a mode switch (entering/leaving Try
// It), and must never cover the "Back to Editing" pill. Driven through the real
// App so the notice state, card list, Try It toggle and pill are all wired as
// shipped.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, h } from "preact";
import { App } from "../../src/editor/app.js";
import { STORAGE_KEY } from "../../src/editor/persistence.js";
import { _resetAnnouncer } from "../../src/editor/a11y.js";
import type { Stack } from "../../src/shared/types.js";

class FakeResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as unknown as Record<string, unknown>)["ResizeObserver"] =
  FakeResizeObserver;

let mounted: HTMLElement | null = null;

function mountApp(): HTMLElement {
  const root = document.createElement("div");
  document.body.appendChild(root);
  render(h(App, {}), root);
  mounted = root;
  return root;
}

async function flush(times = 4): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

/** A stack whose FIRST card is already full (an element reaches the canvas
 *  floor), so Add Text/Add Button is rejected with the card-full notice. The
 *  second card has room. */
function fullFirstCardStack(): Stack {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    title: "Full Card Stack",
    theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" },
    cards: [
      {
        id: "20000000-0000-4000-8000-000000000002",
        kind: "story",
        elements: [
          // A single text element that fills from y=40 to y=560, leaving no
          // 32px band below it for a new 64px element (freeY → null).
          { type: "text", id: "40000000-0000-4000-8000-000000000004", x: 48, y: 40, w: 704, h: 520, content: "A very full card." },
        ],
        actions: [],
      },
      {
        id: "21000000-0000-4000-8000-000000000021",
        kind: "story",
        elements: [
          { type: "text", id: "41000000-0000-4000-8000-000000000041", x: 48, y: 40, w: 704, h: 80, content: "A roomy card." },
        ],
        actions: [],
      },
      {
        id: "30000000-0000-4000-8000-000000000003",
        kind: "end",
        elements: [
          { type: "field", id: "70000000-0000-4000-8000-000000000007", x: 48, y: 420, w: 704, h: 60, variable: "score" },
        ],
        actions: [],
      },
    ],
  };
}

function addTextCard(root: HTMLElement): HTMLButtonElement {
  return Array.from(root.querySelectorAll<HTMLButtonElement>(".tool-card")).find(
    (b) => b.textContent?.includes("Add Text"),
  )!;
}

describe("sticky 'card full' notice (round 3, P1 #1)", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    _resetAnnouncer();
  });
  afterEach(() => {
    if (mounted) render(null, mounted);
    mounted = null;
  });

  it("shows the card-full notice when Add Text is refused on a full card", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fullFirstCardStack()));
    const root = mountApp();
    await flush();

    addTextCard(root).click();
    await flush();

    const notice = root.querySelector(".notice");
    expect(notice).not.toBeNull();
    expect(notice!.textContent).toContain("This card is full");
  });

  it("clears the notice when the teacher moves to another card", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fullFirstCardStack()));
    const root = mountApp();
    await flush();

    addTextCard(root).click();
    await flush();
    expect(root.querySelector(".notice")).not.toBeNull();

    // Select the second (roomy) card from the list.
    const entries = root.querySelectorAll<HTMLButtonElement>(".card-entry");
    entries[1]!.click();
    await flush();

    expect(root.querySelector(".notice")).toBeNull();
  });

  it("clears the notice when entering Try It, and the Back to Editing pill works", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fullFirstCardStack()));
    const root = mountApp();
    await flush();

    addTextCard(root).click();
    await flush();
    expect(root.querySelector(".notice")).not.toBeNull();

    // Enter Try It.
    root.querySelector<HTMLButtonElement>(".tryit")!.click();
    await flush();

    // The notice is gone in the play view, so it can't push the canvas down or
    // sit over the pill.
    expect(root.querySelector(".notice")).toBeNull();
    const pill = root.querySelector<HTMLButtonElement>(".try-pill");
    expect(pill).not.toBeNull();

    // The pill actually returns to the editor.
    pill!.click();
    await flush(10);
    expect(root.querySelector(".tryit-area")).toBeNull();
    expect(root.querySelector(".workspace")).not.toBeNull();
  });

  it("the Back to Editing pill is stacked above any notice (z-index)", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fullFirstCardStack()));
    const root = mountApp();
    await flush();
    root.querySelector<HTMLButtonElement>(".tryit")!.click();
    await flush();

    // The shipped stylesheet gives .try-pill a positive z-index so it can never
    // sit under a banner.
    const css = Array.from(document.querySelectorAll("style"))
      .map((s) => s.textContent ?? "")
      .join("\n");
    const rule = css.match(/\.try-pill\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(rule).toMatch(/z-index\s*:\s*\d+/);
    expect(rule).toMatch(/position\s*:\s*relative/);
  });
});
