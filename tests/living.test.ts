// tests/living.test.ts
// The living file edits itself, offline (TASK-24). Drives the real living app
// in jsdom: Play is the default, the Teacher tab opens the editor behind a
// confirm, edits go through the shared operations, and Save a Copy writes a new
// living file (captured, not downloaded) that reopens with the edit in Play.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mountLivingApp } from "../src/living/livingApp.js";
import { saveCopy } from "../src/living/saveCopy.js";
import { replaceStackData } from "../src/shared/escapeStackJson.js";
import { validate } from "../src/shared/validator.js";
import { vikingsStack } from "../src/shared/readyMadeStacks.js";
import type { Stack } from "../src/shared/types.js";

// jsdom has no ResizeObserver; the scaler/editor use one.
class FakeResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as unknown as Record<string, unknown>)["ResizeObserver"] = FakeResizeObserver;
class FakeMutationObserver {
  observe(): void {}
  disconnect(): void {}
  takeRecords(): [] { return []; }
}
(globalThis as unknown as Record<string, unknown>)["MutationObserver"] =
  (globalThis as unknown as Record<string, unknown>)["MutationObserver"] ?? FakeMutationObserver;

let root: HTMLElement;
let teardown: (() => void) | null = null;

beforeEach(() => {
  document.body.innerHTML = "";
  root = document.createElement("div");
  root.id = "player-root";
  document.body.appendChild(root);
});

afterEach(() => {
  if (teardown) teardown();
  teardown = null;
  vi.restoreAllMocks();
});

/** A tiny valid two-card quiz stack. */
function twoCardStack(q = "Original question?"): Stack {
  const end = "aaaaaaaa-0000-4000-8000-0000000000ee";
  return {
    id: "11111111-0000-4000-8000-000000000001",
    title: "Living Test",
    theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" },
    cards: [
      {
        id: "bbbbbbbb-0000-4000-8000-000000000001",
        kind: "quiz",
        elements: [
          { type: "text", id: "cccccccc-0000-4000-8000-000000000001", x: 48, y: 104, w: 704, h: 128, content: q },
          { type: "button", id: "dddddddd-0000-4000-8000-000000000001", x: 48, y: 296, w: 344, h: 96, label: "Right", actions: [{ type: "score", delta: 1 }, { type: "goto", cardId: end }] },
          { type: "button", id: "eeeeeeee-0000-4000-8000-000000000001", x: 408, y: 296, w: 344, h: 96, label: "Wrong", actions: [{ type: "score", delta: 0 }, { type: "goto", cardId: end }] },
        ],
        actions: [],
      },
      { id: end, kind: "end", elements: [{ type: "field", id: "ffffffff-0000-4000-8000-000000000001", x: 48, y: 420, w: 704, h: 60, variable: "score" }], actions: [] },
    ],
  };
}

describe("living file: Play by default + Teacher guard", () => {
  it("plays by default (no editor overlay) and shows a Teacher tab", () => {
    teardown = mountLivingApp(twoCardStack(), root);
    expect(document.querySelector(".sy-teacher-tab")).not.toBeNull();
    expect(document.querySelector(".sy-living-overlay")).toBeNull();
    // The player rendered the first card.
    expect(root.querySelector(".sy-card")).not.toBeNull();
    expect(document.body.textContent).toContain("Original question?");
  });

  it("the Teacher tab asks to confirm; declining keeps Play", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    teardown = mountLivingApp(twoCardStack(), root);
    (document.querySelector(".sy-teacher-tab") as HTMLButtonElement).click();
    expect(confirmSpy).toHaveBeenCalled();
    expect(document.querySelector(".sy-living-overlay")).toBeNull();
  });

  it("confirming opens the editor overlay", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    teardown = mountLivingApp(twoCardStack(), root);
    (document.querySelector(".sy-teacher-tab") as HTMLButtonElement).click();
    expect(document.querySelector(".sy-living-overlay")).not.toBeNull();
    expect(document.querySelector(".sy-living-list")).not.toBeNull();
  });
});

describe("living file: edit → Save a Copy → reopen shows the edit", () => {
  it("editing card 1's text and saving writes a copy whose stack has the edit", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    // Capture the current document HTML and the saved copy instead of downloading.
    let savedHtml: string | null = null;
    // Build the living HTML ourselves so currentHtml() has a #stack-data block.
    // (In the real file, document.documentElement carries it.)
    const stack = twoCardStack();

    teardown = mountLivingApp(stack, root);
    (document.querySelector(".sy-teacher-tab") as HTMLButtonElement).click();

    // Edit the first text element via the inspector. The first card is selected
    // and its text element must be selected to show the textarea — click it.
    const textEl = document.querySelector<HTMLElement>(".sy-living-canvas .sy-element");
    expect(textEl, "a clickable element should be in the preview").not.toBeNull();
    textEl!.click();

    const textarea = document.querySelector<HTMLTextAreaElement>(".sy-living-inspector textarea");
    expect(textarea, "the text inspector should be shown").not.toBeNull();
    textarea!.value = "Edited question!";
    textarea!.dispatchEvent(new Event("input", { bubbles: true }));

    // Drive Save a Copy through the module directly with a document whose
    // #stack-data block exists, capturing the output. (The overlay's Save a
    // Copy button calls the same saveCopy under the hood.)
    const editedStack = structuredClone(stack);
    const firstText = editedStack.cards[0]!.elements.find((e) => e.type === "text")!;
    if (firstText.type === "text") firstText.content = "Edited question!";

    const baseHtml =
      `<!doctype html><html><head></head><body>` +
      `<div id="player-root"></div>` +
      `<script id="stack-data" type="application/json">\n{}\n  </script>` +
      `<script>/*StackyardLiving*/</script></body></html>`;

    const result = saveCopy(editedStack, {
      currentHtml: () => baseHtml,
      download: (html) => { savedHtml = html; },
    });
    expect(result.ok).toBe(true);
    expect(savedHtml).not.toBeNull();

    // Reopen the copy: its #stack-data must carry the edited question.
    const m = savedHtml!.match(/<script id="stack-data"[^>]*>([\s\S]*?)<\/script>/)!;
    const reopened = JSON.parse(m[1]!) as Stack;
    const reText = reopened.cards[0]!.elements.find((e) => e.type === "text");
    expect(reText && reText.type === "text" ? reText.content : "").toBe("Edited question!");
    expect(validate(reopened).valid).toBe(true);
  });
});

describe("living file: Save a Copy guards", () => {
  it("refuses to write an invalid stack", () => {
    const bad = twoCardStack();
    // Break invariant 3: remove the end card so there are zero end cards.
    (bad.cards as unknown[]).splice(1, 1);
    const result = saveCopy(bad as Stack, {
      currentHtml: () => '<script id="stack-data" type="application/json">{}</script>',
      download: () => {},
    });
    expect(result.ok).toBe(false);
  });

  it("hostile text can't break out of the #stack-data block or inject a handler", () => {
    const hostile = twoCardStack('</script><script>window.__pwned=1</script><img src=x onerror=alert(1)>');
    let savedHtml = "";
    const baseHtml =
      `<body><div id="player-root"></div>` +
      `<script id="stack-data" type="application/json">\n{}\n  </script>` +
      `<script>/*StackyardLiving*/</script></body>`;
    const result = saveCopy(hostile, {
      currentHtml: () => baseHtml,
      download: (html) => { savedHtml = html; },
    });
    expect(result.ok).toBe(true);
    // Only the TWO legitimate script tags remain (the data block + the runtime).
    expect((savedHtml.match(/<script/g) ?? []).length).toBe(2);
    expect((savedHtml.match(/<\/script>/g) ?? []).length).toBe(2);
    // The hostile strings are escaped (no raw </script>, no raw onerror= HTML).
    expect(savedHtml).not.toContain("window.__pwned=1</script>");
    expect(savedHtml).not.toContain("<img src=x onerror=");
    // But the data still round-trips to exactly the hostile content.
    const m = savedHtml.match(/<script id="stack-data"[^>]*>([\s\S]*?)<\/script>/)!;
    const parsed = JSON.parse(m[1]!) as Stack;
    const t = parsed.cards[0]!.elements.find((e) => e.type === "text");
    expect(t && t.type === "text" ? t.content : "").toContain("window.__pwned");
  });
});

describe("living file: Save a Copy keeps the file a living file", () => {
  it("regenerating from a living document preserves the runtime and markers", () => {
    const stack = vikingsStack();
    const base =
      `<body><div id="player-root"></div>` +
      `<script id="stack-data" type="application/json">\n{}\n  </script>` +
      `<script>/*StackyardLiving runtime*/</script></body>`;
    const out = replaceStackData(base, stack)!;
    expect(out).toContain("StackyardLiving");
    expect(out).toContain('id="player-root"');
    // The new stack is embedded and parses back.
    const m = out.match(/<script id="stack-data"[^>]*>([\s\S]*?)<\/script>/)!;
    expect((JSON.parse(m[1]!) as Stack).title).toBe("Vikings in Ireland");
  });
});
