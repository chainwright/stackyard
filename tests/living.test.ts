// tests/living.test.ts
// The living file edits itself, offline (TASK-24, fixed in TASK-26a/e). Drives
// the REAL living app in jsdom through the REAL boot and the REAL default Save a
// Copy path — no injected "current HTML" — then reopens the saved copy in a
// fresh document.
//
// Why this file looks the way it does: round 2 found every saved copy opened on
// a frozen editor, because Save a Copy serialised the live DOM. The old unit
// test never saw it: it handed saveCopy a pristine HTML string of its own and
// re-created the edit by hand. These tests load an exported file into the
// document, boot it exactly as the browser does, click the real buttons, and
// open what comes out.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bootLivingFile } from "../src/living/boot.js";
import { mountLivingApp } from "../src/living/livingApp.js";
import { saveCopy } from "../src/living/saveCopy.js";
import { snapshotPristine } from "../src/living/pristine.js";
import { buildLivingHtml } from "../server/html-template.js";
import { toEscapedStackJson, replaceStackData, readCopyCount, withCopyCount } from "../src/shared/escapeStackJson.js";
import { copyFileName } from "../src/shared/messages.js";
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

let teardown: (() => void) | null = null;

afterEach(() => {
  if (teardown) teardown();
  teardown = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Fixtures

const END = "aaaaaaaa-0000-4000-8000-0000000000ee";

/** A tiny valid two-card quiz stack. */
function twoCardStack(q = "Original question?"): Stack {
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
          { type: "button", id: "dddddddd-0000-4000-8000-000000000001", x: 48, y: 296, w: 344, h: 96, label: "Right", actions: [{ type: "score", delta: 1 }, { type: "goto", cardId: END }] },
          { type: "button", id: "eeeeeeee-0000-4000-8000-000000000001", x: 408, y: 296, w: 344, h: 96, label: "Wrong", actions: [{ type: "score", delta: 0 }, { type: "goto", cardId: END }] },
        ],
        actions: [],
      },
      { id: END, kind: "end", elements: [{ type: "field", id: "ffffffff-0000-4000-8000-000000000001", x: 48, y: 420, w: 704, h: 60, variable: "score" }], actions: [] },
    ],
  };
}

/**
 * The exported file for a stack, as the real exporter builds it — with a small
 * stand-in for the runtime bundle (jsdom does not run inline scripts, so only
 * its presence and size matter here; the bundle itself is covered by the
 * exporter tests and the headless-Chromium gate).
 */
function exportedFile(stack: Stack): string {
  return buildLivingHtml({
    title: stack.title,
    stackJson: toEscapedStackJson(stack),
    livingIife: "/* living runtime stand-in */ void 0;",
    fontFaces: "",
  });
}

/** Replace the jsdom document with `html`, the way opening a file does. */
function openFile(html: string): void {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;
  document.documentElement.setAttribute("lang", parsed.documentElement.getAttribute("lang") ?? "en");
}

/** Read a Blob as text (jsdom's Blob has no reliable .text()). */
function blobText(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(b);
  });
}

/** Capture what the REAL download path hands the browser (Blob + file name). */
function captureDownloads(): { blobs: Blob[]; names: string[] } {
  const cap = { blobs: [] as Blob[], names: [] as string[] };
  (URL as unknown as Record<string, unknown>)["createObjectURL"] = (b: Blob) => {
    cap.blobs.push(b);
    return "blob:test";
  };
  (URL as unknown as Record<string, unknown>)["revokeObjectURL"] = () => {};
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    cap.names.push(this.download);
  });
  return cap;
}

function tab(): HTMLButtonElement {
  return document.querySelector(".sy-teacher-tab") as HTMLButtonElement;
}

function barButton(text: string): HTMLButtonElement {
  const b = Array.from(document.querySelectorAll<HTMLButtonElement>(".sy-living-bar button")).find(
    (x) => (x.textContent ?? "").includes(text),
  );
  if (!b) throw new Error(`no "${text}" button in the editor bar`);
  return b;
}

function editFirstQuestion(text: string): void {
  const textEl = document.querySelector<HTMLElement>(".sy-living-canvas .sy-element");
  textEl!.click();
  const textarea = document.querySelector<HTMLTextAreaElement>(".sy-living-inspector textarea");
  expect(textarea, "the text inspector should be shown").not.toBeNull();
  textarea!.value = text;
  textarea!.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Boot the file in the document, open Teacher, optionally edit, Save a Copy. */
async function bootAndSave(
  html: string,
  cap: { blobs: Blob[]; names: string[] },
  edit?: string,
): Promise<string> {
  openFile(html);
  teardown = bootLivingFile();
  tab().click();
  if (edit !== undefined) editFirstQuestion(edit);
  const before = cap.blobs.length;
  barButton("Save a Copy").click();
  expect(cap.blobs.length, "Save a Copy should download one file").toBe(before + 1);
  const saved = await blobText(cap.blobs[cap.blobs.length - 1]!);
  teardown?.();
  teardown = null;
  return saved;
}

const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length;

/** A saved file with its copy counter blanked, to compare two copies' CONTENT. */
const withoutCounter = (s: string): string => withCopyCount(s, 0);

// ---------------------------------------------------------------------------

describe("living file: Play by default + Teacher guard", () => {
  beforeEach(() => openFile(exportedFile(twoCardStack())));

  it("plays by default (no editor overlay) and shows exactly one Teacher tab", () => {
    teardown = bootLivingFile();
    expect(document.querySelectorAll(".sy-teacher-tab").length).toBe(1);
    expect(document.querySelector(".sy-living-overlay")).toBeNull();
    expect(document.querySelector("#player-root .sy-card")).not.toBeNull();
    expect(document.body.textContent).toContain("Original question?");
  });

  it("the Teacher tab asks to confirm; declining keeps Play", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    teardown = bootLivingFile();
    tab().click();
    expect(confirmSpy).toHaveBeenCalled();
    expect(document.querySelector(".sy-living-overlay")).toBeNull();
  });

  it("confirming opens the editor overlay", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    teardown = bootLivingFile();
    tab().click();
    expect(document.querySelector(".sy-living-overlay")).not.toBeNull();
    expect(document.querySelector(".sy-living-list")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TASK-26a — the REAL save path

describe("TASK-26a: Save a Copy writes the pristine file, not the live DOM", () => {
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("a copy saved from inside the open editor has no overlay, no Teacher tab and no rendered card", async () => {
    const cap = captureDownloads();
    const original = exportedFile(twoCardStack());
    const copy = await bootAndSave(original, cap, "Edited question!");

    // Parse the copy as a browser would and look for the live-DOM litter the
    // old implementation carried.
    const doc = new DOMParser().parseFromString(copy, "text/html");
    expect(doc.querySelectorAll(".sy-living-overlay").length).toBe(0);
    expect(doc.querySelectorAll(".sy-teacher-tab").length).toBe(0);
    expect(doc.querySelectorAll(".sy-card").length).toBe(0);
    expect(doc.querySelectorAll("#player-root > *").length).toBe(0);
    // Same number of <style> blocks as the file we opened (none injected).
    expect(count(copy, /<style/g)).toBe(count(original, /<style/g));
    // And it carries the edit.
    const m = copy.match(/<script id="stack-data"[^>]*>([\s\S]*?)<\/script>/)!;
    const reopened = JSON.parse(m[1]!) as Stack;
    const t = reopened.cards[0]!.elements.find((e) => e.type === "text");
    expect(t && t.type === "text" ? t.content : "").toBe("Edited question!");
    expect(validate(reopened).valid).toBe(true);
  });

  it("the reopened copy boots into Play: one Teacher tab, no overlay, and an answer advances", async () => {
    const cap = captureDownloads();
    const copy = await bootAndSave(exportedFile(twoCardStack()), cap, "Edited question!");

    openFile(copy);
    teardown = bootLivingFile();
    expect(document.querySelectorAll(".sy-teacher-tab").length).toBe(1);
    expect(document.querySelectorAll(".sy-living-overlay").length).toBe(0);
    expect(document.body.textContent).toContain("Edited question!");

    // Click the right answer: the card must advance to the end card.
    vi.useFakeTimers();
    const tile = Array.from(document.querySelectorAll<HTMLButtonElement>("#player-root .sy-tile")).find(
      (b) => b.getAttribute("data-correct") === "true",
    );
    expect(tile, "an answer tile should be playable in the copy").toBeTruthy();
    tile!.click();
    vi.advanceTimersByTime(2000);
    expect(document.querySelector("#player-root .sy-end-card")).not.toBeNull();
    vi.useRealTimers();
  });

  it("three saves in a row give identical sizes, and the first is within a few hundred bytes of the original", async () => {
    const cap = captureDownloads();
    const original = exportedFile(twoCardStack());
    const copy1 = await bootAndSave(original, cap, "Edited question!");
    const copy2 = await bootAndSave(copy1, cap);
    const copy3 = await bootAndSave(copy2, cap);

    expect(copy2.length).toBe(copy1.length);
    expect(copy3.length).toBe(copy1.length);
    // The old implementation grew ~17% per save. The copy differs from the
    // original only by the stack JSON (and the edit's few characters).
    expect(Math.abs(copy1.length - original.length)).toBeLessThan(400);
    // And it is byte-identical apart from the copy counter (1, 2, 3…), not
    // merely the same length.
    expect(withoutCounter(copy3)).toBe(withoutCounter(copy1));
    expect(withoutCounter(copy2)).toBe(withoutCounter(copy1));
  });

  it("a copy of a copy is still a living file and keeps the edit", async () => {
    const cap = captureDownloads();
    const copy1 = await bootAndSave(exportedFile(twoCardStack()), cap, "First edit");
    const copy2 = await bootAndSave(copy1, cap, "Second edit");

    openFile(copy2);
    teardown = bootLivingFile();
    expect(document.querySelectorAll(".sy-teacher-tab").length).toBe(1);
    expect(document.body.textContent).toContain("Second edit");
    expect(document.body.textContent).not.toContain("First edit");
  });

  it("Save a Copy saves under a new name, never the original's", async () => {
    const cap = captureDownloads();
    await bootAndSave(exportedFile(twoCardStack()), cap, "Edited question!");
    expect(cap.names).toEqual(["Living-Test (copy).html"]);
    expect(copyFileName("Vikings in Ireland")).toBe("Vikings-in-Ireland (copy).html");
    expect(copyFileName("")).toBe("lesson (copy).html");
  });

  it("TASK-27g: a copy of a copy is '(copy 2)', then '(copy 3)' — never '(copy)' again", async () => {
    const cap = captureDownloads();
    const copy1 = await bootAndSave(exportedFile(twoCardStack()), cap, "First edit");
    const copy2 = await bootAndSave(copy1, cap, "Second edit");
    await bootAndSave(copy2, cap, "Third edit");
    expect(cap.names).toEqual(["Living-Test (copy).html", "Living-Test (copy 2).html", "Living-Test (copy 3).html"]);
    expect(readCopyCount(copy1)).toBe(1);
    expect(readCopyCount(copy2)).toBe(2);
  });

  it("TASK-27g: copyFileName numbers copies and withCopyCount/readCopyCount round-trip", () => {
    expect(copyFileName("Water cycle", 1)).toBe("Water-cycle (copy).html");
    expect(copyFileName("Water cycle", 2)).toBe("Water-cycle (copy 2).html");
    expect(copyFileName("Water cycle", 12)).toBe("Water-cycle (copy 12).html");
    expect(copyFileName("Water cycle", 0)).toBe("Water-cycle (copy).html");
    expect(readCopyCount("<html><head></head></html>")).toBe(0); // a legacy file
    const legacy = "<html><head><title>x</title></head><body></body></html>";
    expect(readCopyCount(withCopyCount(legacy, 3))).toBe(3);
    expect(withCopyCount(withCopyCount(legacy, 3), 4)).toBe(withCopyCount(legacy, 4)); // replace, not append
  });

  it("saveCopy has no default that reads the live document", () => {
    // Without a pristine snapshot there is nothing safe to copy from.
    const result = saveCopy(twoCardStack(), {
      pristineHtml: "",
      download: () => { throw new Error("must not download"); },
    });
    expect(result.ok).toBe(false);
  });

  it("mountLivingApp snapshots the pristine file itself if the caller does not", async () => {
    openFile(exportedFile(twoCardStack()));
    const before = snapshotPristine(document);
    const root = document.getElementById("player-root")!;
    teardown = mountLivingApp(twoCardStack(), root);
    const cap = captureDownloads();
    tab().click();
    barButton("Save a Copy").click();
    const saved = await blobText(cap.blobs[0]!);
    // Replace the stack in the same pristine snapshot: nothing else differs
    // (apart from the copy counter, which this save bumps from 0 to 1).
    expect(saved).toBe(withCopyCount(replaceStackData(before, twoCardStack())!, 1));
  });
});

// ---------------------------------------------------------------------------

describe("living file: Save a Copy guards", () => {
  const PRISTINE = '<body><div id="player-root"></div><script id="stack-data" type="application/json">\n{}\n  </script><script>/*living*/</script></body>';

  it("refuses to write an invalid stack", () => {
    const bad = twoCardStack();
    (bad.cards as unknown[]).splice(1, 1); // no end card
    const result = saveCopy(bad as Stack, { pristineHtml: PRISTINE, download: () => {} });
    expect(result.ok).toBe(false);
  });

  it("hostile text can't break out of the #stack-data block or inject a handler", () => {
    const hostile = twoCardStack('</script><script>window.__pwned=1</script><img src=x onerror=alert(1)>');
    let savedHtml = "";
    const result = saveCopy(hostile, {
      pristineHtml: PRISTINE,
      download: (html) => { savedHtml = html; },
    });
    expect(result.ok).toBe(true);
    // Only the TWO legitimate script tags remain (the data block + the runtime).
    expect(count(savedHtml, /<script/g)).toBe(2);
    expect(count(savedHtml, /<\/script>/g)).toBe(2);
    expect(savedHtml).not.toContain("window.__pwned=1</script>");
    expect(savedHtml).not.toContain("<img src=x onerror=");
    const m = savedHtml.match(/<script id="stack-data"[^>]*>([\s\S]*?)<\/script>/)!;
    const parsed = JSON.parse(m[1]!) as Stack;
    const t = parsed.cards[0]!.elements.find((e) => e.type === "text");
    expect(t && t.type === "text" ? t.content : "").toContain("window.__pwned");
  });

  it("hostile text survives the REAL boot → save → reopen path without executing", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const cap = captureDownloads();
    const hostileTitle = "</title><script>window.__pwned2=1</script>";
    const stack = twoCardStack("</script><img src=x onerror=window.__pwned3=1>");
    stack.title = hostileTitle;
    const copy = await bootAndSave(exportedFile(stack), cap);
    expect(count(copy, /<script/g)).toBe(2);
    openFile(copy);
    teardown = bootLivingFile();
    expect((window as unknown as Record<string, unknown>)["__pwned2"]).toBeUndefined();
    expect((window as unknown as Record<string, unknown>)["__pwned3"]).toBeUndefined();
    expect(document.querySelectorAll("img[onerror]").length).toBe(0);
  });
});

describe("living file: Save a Copy keeps the file a living file", () => {
  it("regenerating from a living document preserves the runtime and markers", () => {
    const base =
      `<body><div id="player-root"></div>` +
      `<script id="stack-data" type="application/json">\n{}\n  </script>` +
      `<script>/*StackyardLiving runtime*/</script></body>`;
    const out = replaceStackData(base, vikingsStack())!;
    expect(out).toContain("StackyardLiving");
    expect(out).toContain('id="player-root"');
    const m = out.match(/<script id="stack-data"[^>]*>([\s\S]*?)<\/script>/)!;
    expect((JSON.parse(m[1]!) as Stack).title).toBe("Vikings in Ireland");
  });
});

// ---------------------------------------------------------------------------
// TASK-26e — the editor keeps selecting after an edit, and can change the right answer

describe("TASK-26e: living editor selection and right answer", () => {
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    openFile(exportedFile(twoCardStack()));
    teardown = bootLivingFile();
    tab().click();
  });

  function answerElements(): HTMLElement[] {
    // The preview wraps each element in .sy-element: text, Right, Wrong.
    return Array.from(document.querySelectorAll<HTMLElement>(".sy-living-canvas .sy-element"));
  }

  it("after a text edit, clicking an answer SELECTS it instead of playing it", () => {
    editFirstQuestion("A longer, edited question?");
    // Click the "Wrong" tile in the (re-rendered) preview.
    const wrongWrapper = answerElements()[2]!;
    wrongWrapper.querySelector<HTMLElement>(".sy-tile")!.click();
    // It was selected: the inspector now shows the answer fields…
    const labels = Array.from(document.querySelectorAll(".sy-living-inspector label")).map((l) => l.textContent);
    expect(labels.some((t) => (t ?? "").includes("Answer"))).toBe(true);
    // …and it was NOT played: no stamp, no wrong-answer shake, still on card 1.
    expect(document.querySelector(".sy-living-canvas .sy-wrong-stamp")).toBeNull();
    expect(document.querySelector(".sy-living-canvas .sy-tile-shake")).toBeNull();
    expect(document.querySelector(".sy-living-canvas .sy-end-card")).toBeNull();
  });

  it("'This one is right' makes the selected answer the only right one", () => {
    answerElements()[2]!.querySelector<HTMLElement>(".sy-tile")!.click(); // select "Wrong"
    const radio = document.querySelector<HTMLInputElement>('.sy-living-inspector input[type="radio"]');
    expect(radio, "a 'This one is right' radio should be offered").not.toBeNull();
    expect(radio!.checked).toBe(false);
    radio!.checked = true;
    radio!.dispatchEvent(new Event("change", { bubbles: true }));

    // Save and check the stack that would be written.
    const cap = captureDownloads();
    barButton("Save a Copy").click();
    return blobText(cap.blobs[0]!).then((saved) => {
      const m = saved.match(/<script id="stack-data"[^>]*>([\s\S]*?)<\/script>/)!;
      const stack = JSON.parse(m[1]!) as Stack;
      expect(validate(stack).valid).toBe(true);
      const buttons = stack.cards[0]!.elements.filter((e) => e.type === "button");
      const right = buttons.filter(
        (b) => b.type === "button" && b.actions.some((a) => a.type === "score" && a.delta === 1),
      );
      expect(right.length).toBe(1);
      expect(right[0]!.type === "button" ? right[0]!.label : "").toBe("Wrong");
    });
  });

  it("editing a question updates that card's label in the left list immediately", () => {
    editFirstQuestion("Brand new wording");
    const first = document.querySelector(".sy-living-list button");
    expect(first!.textContent).toContain("Brand new wording");
  });
});

// ---------------------------------------------------------------------------
// TASK-27x/j — flash preview refresh, wording, add-an-answer, list labels

describe("TASK-27: living editor round-3 fixes", () => {
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("x: editing a flash card's front refreshes the card preview", async () => {
    const { irishWordsStack } = await import("../src/shared/readyMadeStacks.js");
    openFile(exportedFile(irishWordsStack()));
    teardown = bootLivingFile();
    tab().click();
    const ta = document.querySelector<HTMLTextAreaElement>(".sy-living-inspector textarea")!;
    expect(ta).not.toBeNull();
    ta.value = "Zebra crossing";
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.querySelector(".sy-living-canvas")!.textContent).toContain("Zebra crossing");
    expect(document.querySelector(".sy-living-list")!.textContent).toContain("Zebra");
  });

  it("TASK-27j: wording matches the website; list labels are 'Card N — …' on one ellipsis line", async () => {
    openFile(exportedFile(vikingsStack()));
    teardown = bootLivingFile();
    tab().click();
    const first = document.querySelector<HTMLElement>(".sy-living-list button")!;
    expect(first.querySelector(".num")!.textContent).toBe("Card 1");
    expect(first.querySelector(".txt")!.textContent!.startsWith("— ")).toBe(true);
    // Flash wording.
    const { irishWordsStack } = await import("../src/shared/readyMadeStacks.js");
    teardown?.();
    openFile(exportedFile(irishWordsStack()));
    teardown = bootLivingFile();
    tab().click();
    const labels = Array.from(document.querySelectorAll(".sy-living-inspector label")).map((l) => l.textContent);
    expect(labels).toContain("Front (the term)");
  });

  it("j: '+ Add an answer' on a quiz card adds a tile and stays valid", () => {
    openFile(exportedFile(twoCardStack()));
    teardown = bootLivingFile();
    tab().click();
    const btn = Array.from(document.querySelectorAll<HTMLButtonElement>(".sy-living-inspector button")).find((b) =>
      (b.textContent ?? "").includes("Add an answer"),
    );
    expect(btn).toBeDefined();
    const before = document.querySelectorAll(".sy-living-canvas .sy-tile").length;
    btn!.click();
    const after = document.querySelectorAll(".sy-living-canvas .sy-tile").length;
    expect(after).toBe(before + 1);
  });
});

// ---------------------------------------------------------------------------
// TASK-28 n / o / j / q — the Teacher tab (J2, J4)

/** A generated-looking deck: four questions that all open "What is the capital of …". */
function sharedPrefixStack(): Stack {
  const mk = (n: number, q: string): Stack["cards"][number] => ({
    id: `bbbbbbbb-0000-4000-8000-0000000001${n}0`,
    kind: "quiz",
    elements: [
      { type: "text", id: `cccccccc-0000-4000-8000-0000000001${n}0`, x: 48, y: 104, w: 704, h: 128, content: q },
      { type: "button", id: `dddddddd-0000-4000-8000-0000000001${n}0`, x: 48, y: 296, w: 344, h: 96, label: "Right", actions: [{ type: "score", delta: 1 }, { type: "goto", cardId: n === 4 ? END : `bbbbbbbb-0000-4000-8000-0000000001${n + 1}0` }] },
      { type: "button", id: `eeeeeeee-0000-4000-8000-0000000001${n}0`, x: 408, y: 296, w: 344, h: 96, label: "Wrong", actions: [{ type: "score", delta: 0 }, { type: "goto", cardId: n === 4 ? END : `bbbbbbbb-0000-4000-8000-0000000001${n + 1}0` }] },
    ],
    actions: [],
  });
  return {
    id: "11111111-0000-4000-8000-000000000002",
    title: "Capitals",
    theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" },
    cards: [
      mk(1, "What is the capital of France?"),
      mk(2, "What is the capital of Spain?"),
      mk(3, "What is the capital of Italy?"),
      mk(4, "What is the capital of Ireland?"),
      { id: END, kind: "end", elements: [{ type: "field", id: "ffffffff-0000-4000-8000-000000000002", x: 48, y: 420, w: 704, h: 60, variable: "score" }], actions: [] },
    ],
  };
}

describe("TASK-28: Teacher tab (J2 n/o, J4 j, q)", () => {
  function openTeacher(stack: Stack): void {
    openFile(exportedFile(stack));
    teardown = bootLivingFile();
    tab().click();
  }

  it("TASK-28j: list labels of different cards differ, even when the questions share their first words", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    openTeacher(sharedPrefixStack());
    const labels = Array.from(document.querySelectorAll(".sy-living-list button")).map((b) => b.textContent ?? "");
    expect(labels).toHaveLength(5);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels[0]).toContain("France");
    expect(labels[3]).toContain("Ireland");
    expect(labels.every((l) => l.startsWith("Card "))).toBe(true);
  });

  it("TASK-28q: the 'show card…' dropdown uses '—' like the list and the website, never '·'", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    openTeacher(sharedPrefixStack());
    // Select an answer button so the dropdown shows.
    const tile = document.querySelector<HTMLElement>(".sy-living-canvas .sy-tile")!;
    tile.click();
    const options = Array.from(document.querySelectorAll(".sy-living-inspector select option")).map((o) => o.textContent ?? "");
    expect(options.length).toBeGreaterThan(1);
    const cardOptions = options.filter((o) => o.startsWith("Card "));
    expect(cardOptions.length).toBeGreaterThan(0);
    for (const o of cardOptions) {
      expect(o).toContain(" — ");
      expect(o).not.toContain(" · ");
    }
  });

  it("TASK-28n: Remove this card asks first; cancel keeps the card, OK removes it", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true); // the "Are you the teacher?" gate
    openTeacher(sharedPrefixStack());
    const remove = (): HTMLButtonElement =>
      Array.from(document.querySelectorAll<HTMLButtonElement>(".sy-living-inspector button")).find((b) => (b.textContent ?? "").includes("Remove this card"))!;

    confirm.mockReturnValueOnce(false);
    remove().click();
    expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining("Remove card 1"));
    expect(document.querySelectorAll(".sy-living-list button")).toHaveLength(5); // nothing removed

    confirm.mockReturnValueOnce(true);
    remove().click();
    expect(document.querySelectorAll(".sy-living-list button")).toHaveLength(4);
  });

  it("TASK-28o: after '+ Add an answer' the NEW answer is selected, so typing goes into it", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    // A card with room: only two answers.
    openTeacher(sharedPrefixStack());
    // Select the existing "Wrong" answer first (the J2 repro: it stays selected).
    const tiles = Array.from(document.querySelectorAll<HTMLElement>(".sy-living-canvas .sy-tile"));
    tiles[1]!.click();
    const field = (): HTMLInputElement => document.querySelector<HTMLInputElement>(".sy-living-inspector input[type=text]")!;
    expect(field().value).toBe("Wrong");

    Array.from(document.querySelectorAll<HTMLButtonElement>(".sy-living-inspector button"))
      .find((b) => (b.textContent ?? "").includes("Add an answer"))!
      .click();
    // The Answer box now holds the NEW tile's words…
    expect(field().value).toBe("Another answer");
    // …and typing changes only that tile.
    field().value = "Paris";
    field().dispatchEvent(new Event("input", { bubbles: true }));
    const labels = Array.from(document.querySelectorAll(".sy-living-canvas .sy-tile")).map((t) => t.textContent ?? "");
    expect(labels.some((l) => l.includes("Paris"))).toBe(true);
    expect(labels.some((l) => l.includes("Wrong"))).toBe(true);
    expect(labels.some((l) => l.includes("Right"))).toBe(true);
  });

  it("TASK-28q: the Teacher list is wider on a big screen", async () => {
    const { LIVING_STYLES } = await import("../src/living/styles.js");
    expect(LIVING_STYLES).toMatch(/@media \(min-width: 1600px\) \{ \.sy-living-list \{ flex-basis: 340px; \} \}/);
  });
});

// ---------------------------------------------------------------------------
// TASK-29n (Teacher tab) / TASK-29a (living half)

describe("TASK-29n and TASK-29a: the Teacher tab follows the same rules", () => {
  function openTeacher(stack: Stack): void {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    openFile(exportedFile(stack));
    teardown = bootLivingFile();
    tab().click();
  }

  it("29n: '+ Add an answer' leaves the cursor in the new Answer box with its text selected", () => {
    openTeacher(sharedPrefixStack());
    const tiles = Array.from(document.querySelectorAll<HTMLElement>(".sy-living-canvas .sy-tile"));
    tiles[1]!.click();
    Array.from(document.querySelectorAll<HTMLButtonElement>(".sy-living-inspector button"))
      .find((b) => (b.textContent ?? "").includes("Add an answer"))!
      .click();
    const box = document.querySelector<HTMLInputElement>(".sy-living-inspector input[type=text]")!;
    expect(box.value).toBe("Another answer");
    expect(document.activeElement).toBe(box);
    expect(box.selectionStart).toBe(0);
    expect(box.selectionEnd).toBe("Another answer".length);
  });

  it("29a: 'Add a card after this' on a fork keeps every choice and says to choose where the card leads", () => {
    const id = (n: number): string => `f7f70000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
    const textEl = (n: number, c: string) => ({ type: "text" as const, id: id(100 + n), x: 48, y: 104, w: 704, h: 120, content: c });
    const btn = (n: number, label: string, to: number, y: number) => ({ type: "button" as const, id: id(200 + n), x: 48, y, w: 704, h: 72, label, actions: [{ type: "goto" as const, cardId: id(to) }] });
    const fork: Stack = {
      id: id(0), title: "Fork", theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" },
      cards: [
        { id: id(1), kind: "story", actions: [], elements: [textEl(1, "A fork in the road."), btn(1, "Left", 2, 260), btn(2, "Right", 3, 360)] },
        { id: id(2), kind: "story", actions: [], elements: [textEl(2, "Left."), btn(3, "Continue", 4, 440)] },
        { id: id(3), kind: "story", actions: [], elements: [textEl(3, "Right."), btn(4, "Continue", 4, 440)] },
        { id: id(4), kind: "end", actions: [], elements: [textEl(4, "The end")] },
      ],
    };
    openTeacher(fork);
    Array.from(document.querySelectorAll<HTMLButtonElement>(".sy-living-inspector button"))
      .find((b) => (b.textContent ?? "").includes("Add a card after this"))!
      .click();
    expect(document.querySelector(".sy-living-toast")?.textContent ?? document.body.textContent).toContain("Choose where this card leads");
    // Left and Right still go where they went.
    const labels = Array.from(document.querySelectorAll(".sy-living-list button")).map((b) => b.textContent ?? "");
    expect(labels).toHaveLength(5);
  });
});

describe("TASK-30g: the Teacher tab edits the last card's heading and message", () => {
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("TASK-30g: heading and message edits survive Save a Copy", async () => {
    const stack = twoCardStack();
    const end = stack.cards[1]!;
    end.elements.unshift({ type: "text", id: "cccccccc-0000-4000-8000-0000000000e1", x: 48, y: 120, w: 704, h: 72, content: "Well done!" });
    const cap = captureDownloads();
    openFile(exportedFile(stack));
    teardown = bootLivingFile();
    tab().click();
    const items = document.querySelectorAll<HTMLButtonElement>(".sy-living-list button");
    items[items.length - 1]!.click();

    const insp = (): HTMLElement => document.querySelector<HTMLElement>(".sy-living-inspector")!;
    const heading = insp().querySelector<HTMLInputElement>("input[type=text]")!;
    expect(heading.value).toBe("Well done!");
    heading.value = "Brilliant work!";
    heading.dispatchEvent(new Event("input", { bubbles: true }));
    const msg = insp().querySelector<HTMLTextAreaElement>("textarea")!;
    expect(insp().textContent).toContain("Message (optional)");
    msg.value = "See you on Monday.";
    msg.dispatchEvent(new Event("input", { bubbles: true }));
    // The preview shows both.
    expect(document.querySelector(".sy-living-canvas .sy-end-heading")?.textContent).toBe("Brilliant work!");
    expect(document.querySelector(".sy-living-canvas .sy-end-body")?.textContent).toBe("See you on Monday.");

    barButton("Save a Copy").click();
    const saved = await blobText(cap.blobs[cap.blobs.length - 1]!);
    const m = saved.match(/<script id="stack-data"[^>]*>([\s\S]*?)<\/script>/)!;
    const reopened = JSON.parse(m[1]!) as Stack;
    expect(validate(reopened).valid).toBe(true);
    const texts = reopened.cards[1]!.elements.filter((e) => e.type === "text").map((e) => (e.type === "text" ? e.content : ""));
    expect(texts).toEqual(["Brilliant work!", "See you on Monday."]);
  });
});
