// tests/class-results-panel.dom.test.ts
// TASK-34b5 (the "Class results" panel in the Teacher tab) and TASK-34b6 (codes
// kept only in a copy the teacher saves), .kiro/specs/class-results/design.md §4–5.

import { describe, it, expect, vi, afterEach } from "vitest";
import { bootLivingFile } from "../src/living/boot.js";
import { buildLivingHtml } from "../server/html-template.js";
import { readClassResults, toEscapedStackJson, withClassResults, withCopyCount } from "../src/shared/escapeStackJson.js";
import { encodeCode, lessonKey, quizCards, type Result } from "../src/shared/resultsCode.js";
import { resultsText, tally } from "../src/shared/classResults.js";
import { vikingsStack } from "../src/shared/readyMadeStacks.js";
import type { Stack } from "../src/shared/types.js";

class FakeResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as unknown as Record<string, unknown>)["ResizeObserver"] = FakeResizeObserver;

let teardown: (() => void) | null = null;
afterEach(() => {
  teardown?.();
  teardown = null;
  document.querySelectorAll(".sy-living-toast").forEach((t) => t.remove());
  vi.restoreAllMocks();
});

const lesson = vikingsStack();
const key = lessonKey(lesson);
const R = (s: string): Result[] => s.split("").map((c) => (c === "R" ? "right" : c === "W" ? "wrong" : "none"));
const codeFor = (pattern: string, tag: number, initials?: string, stack: Stack = lesson): string =>
  encodeCode({ fingerprint: lessonKey(stack).fingerprint, results: R(pattern), tag, initials });

const PUPILS = [codeFor("RRRRRR", 1, "AB"), codeFor("WWWWWW", 2), codeFor("RWRWRW", 3)];

function exportedFile(stack: Stack): string {
  return buildLivingHtml({ title: stack.title, stackJson: toEscapedStackJson(stack), livingIife: "/* stand-in */ void 0;", fontFaces: "" });
}
function openFile(html: string): void {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;
}
function blobText(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(b);
  });
}
function captureDownloads(): Blob[] {
  const blobs: Blob[] = [];
  (URL as unknown as Record<string, unknown>)["createObjectURL"] = (b: Blob) => {
    blobs.push(b);
    return "blob:test";
  };
  (URL as unknown as Record<string, unknown>)["revokeObjectURL"] = () => {};
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  return blobs;
}
const $ = <T extends HTMLElement = HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
const tid = <T extends HTMLElement = HTMLElement>(id: string): T => $<T>(`[data-testid="${id}"]`)!;
function barButton(text: string): HTMLButtonElement {
  return Array.from(document.querySelectorAll<HTMLButtonElement>(".sy-living-bar button")).find((b) => b.textContent === text)!;
}

/** Open the file, Teacher → Class Results. */
function openPanel(html = exportedFile(lesson)): void {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  openFile(html);
  teardown = bootLivingFile();
  $<HTMLButtonElement>(".sy-teacher-tab")!.click();
  tid("class-results-toggle").click();
}
function paste(text: string): void {
  tid<HTMLTextAreaElement>("results-codes-input").value = text;
  tid("results-add").click();
}
const cells = (q: number): number[] =>
  Array.from(document.querySelectorAll(`[data-testid="results-questions"] tr[data-q="${q}"] td`)).map((td) => Number(td.textContent));

describe("TASK-34b5: the Class results panel in the Teacher tab", () => {
  it("TASK-34b5: Class Results swaps the card editor for the panel, focus moves to its heading, and Edit Cards goes back", () => {
    openPanel();
    expect($(".sy-results h2")!.textContent).toBe("Class results");
    expect(document.activeElement).toBe($("#sy-results-title"));
    expect($<HTMLElement>(".sy-results-host")!.hidden).toBe(false);
    expect(tid("class-results-toggle").textContent).toBe("Edit Cards");
    const editorHost = $(".sy-living-overlay")!.children[1] as HTMLElement;
    expect(editorHost.style.display).toBe("none");
    tid("class-results-toggle").click();
    expect(editorHost.style.display).toBe("flex");
    expect($(".sy-results")).toBeNull();
    expect(document.activeElement).toBe(tid("class-results-toggle"));
  });

  it("TASK-34b5: pasted codes give the table: right / wrong / did not reach per question, 'missed by', the middle score and what to revisit", () => {
    openPanel();
    paste(`${PUPILS[0]}\n${PUPILS[1]} ${PUPILS[2]}`);
    expect(tid("results-status").textContent).toBe("Three pupils counted.");
    expect(tid("results-summary").textContent).toBe("3 pupils · Middle score (median): 3 of 6");
    expect(cells(1)).toEqual([2, 1, 0]);
    expect(cells(2)).toEqual([1, 2, 0]);
    expect(tid("results-missed").textContent).toContain("Q2 missed by 2 of 3");
    expect(Array.from(document.querySelectorAll('[data-testid="results-revisit"] li')).map((l) => l.getAttribute("data-q"))).toEqual(["2", "4", "6", "1", "3", "5"]);
    // Initials only where the code carries them.
    const names = Array.from(document.querySelectorAll('[data-testid="results-pupils"] tbody th'));
    expect(names.map((n) => n.textContent)).toEqual(["AB", "Pupil 2", "Pupil 3"]);
    expect(names.map((n) => n.getAttribute("data-initials"))).toEqual(["true", null, null]);
    // The marks are words for a screen reader.
    expect($('[data-testid="results-pupils"] td[data-result="wrong"] .sy-sr-only')!.textContent).toBe("wrong");
    // The scroll region is focusable and named (axe scrollable-region-focusable).
    const region = $(".sy-results-scroll")!;
    expect([region.tabIndex, region.getAttribute("role"), region.getAttribute("aria-label")]).toEqual([0, "region", "Each pupil"]);
  });

  it("TASK-34b5: a repeat counts once and a bad code is listed with its reason; only the bad one stays in the box", () => {
    openPanel();
    const typo = PUPILS[1]!.slice(0, 3) + (PUPILS[1]![3] === "A" ? "B" : "A") + PUPILS[1]!.slice(4);
    paste([PUPILS[0], PUPILS[0], typo].join("\n"));
    expect(tid("results-status").textContent).toBe("One pupil counted. One code needs checking.");
    const items = Array.from(document.querySelectorAll('[data-testid="results-problems"] li')).map((l) => l.textContent);
    expect(items).toEqual([`${PUPILS[0]} — Same code as one above — counted once.`, `${typo} — Check the code; one letter looks wrong.`]);
    expect(tid<HTMLTextAreaElement>("results-codes-input").value).toBe(typo);
    paste(PUPILS[0]!);
    expect(document.querySelector('[data-testid="results-problems"] li')!.textContent).toContain("Already added — counted once.");
    expect(tid("results-summary").textContent).toContain("1 pupil ·");
  });

  it("TASK-34b5: Copy as Text copies the plain-text table; Clear Codes asks first, then empties it", async () => {
    const writes: string[] = [];
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: (t: string) => (writes.push(t), Promise.resolve()) } });
    openPanel();
    paste(PUPILS.join("\n"));
    tid("results-copy").click();
    await Promise.resolve();
    expect(writes).toEqual([resultsText(tally(lesson, PUPILS), lesson.title)]);
    await new Promise((r) => setTimeout(r, 0));
    expect($(".sy-living-toast")!.textContent).toBe("Copied the results as text.");
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    tid("results-clear").click();
    expect(confirm).toHaveBeenLastCalledWith("Clear all three codes?");
    expect(tid("results-summary")).not.toBeNull();
    confirm.mockReturnValueOnce(true);
    tid("results-clear").click();
    expect(tid("results-status").textContent).toBe("All codes cleared.");
    expect($(".sy-results-body")!.textContent).toBe("No codes yet.");
    delete (navigator as unknown as Record<string, unknown>)["clipboard"];
  });

  it("TASK-34b5: Print Results prints only the panel", () => {
    const print = vi.fn(() => expect(document.documentElement.classList.contains("sy-printing")).toBe(true));
    vi.stubGlobal("print", print);
    openPanel();
    tid("results-print").click();
    expect(print).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("afterprint"));
    expect(document.documentElement.classList.contains("sy-printing")).toBe(false);
    vi.unstubAllGlobals();
  });

  it("TASK-34b5: edits made in the card editor survive a trip to the panel, which reads codes against the lesson as the file opened", () => {
    openPanel();
    tid("class-results-toggle").click(); // back to Edit Cards
    $<HTMLElement>(".sy-living-canvas .sy-element")!.click();
    const ta = $<HTMLTextAreaElement>(".sy-living-inspector textarea")!;
    ta.value = "An edited first question?";
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    tid("class-results-toggle").click();
    expect($(".sy-living-hint.warn")!.textContent).toContain("You've changed the questions since this file opened");
    paste(PUPILS[2]!); // a code from the file as it opened still counts
    expect(tid("results-status").textContent).toBe("One pupil counted.");
    tid("class-results-toggle").click();
    expect($(".sy-living-canvas")!.textContent).toContain("An edited first question?");
  });

  it("TASK-34b5: Escape still leaves the Teacher tab for Play", () => {
    openPanel();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect($(".sy-living-overlay")).toBeNull();
    expect($("#player-root .sy-card")).not.toBeNull();
  });
});

describe("TASK-34b6: codes are kept only in a copy the teacher saves", () => {
  it("TASK-34b6: Save a Copy keeps the codes in its own block; reopening the copy shows the same table", async () => {
    const blobs = captureDownloads();
    openPanel();
    paste(PUPILS.join("\n"));
    barButton("Save a Copy").click();
    expect($(".sy-living-toast")!.textContent).toMatch(/^Saved a copy with three results codes: /);
    const copy = await blobText(blobs[0]!);
    expect(readClassResults(copy)).toEqual(PUPILS);
    expect(copy).toMatch(/<script id="class-results" type="application\/json">\[[^<]*\]<\/script>\n<\/head>/);
    teardown?.();
    openPanel(copy);
    expect(tid("results-status").textContent).toBe("Three pupils counted.");
    expect(cells(2)).toEqual([1, 2, 0]);
  });

  it("TASK-34b6: no codes, no block — copies stay byte-identical; Clear Codes removes an old block", async () => {
    const blobs = captureDownloads();
    openPanel();
    barButton("Save a Copy").click();
    const a = await blobText(blobs[0]!);
    expect(a).not.toContain("class-results");
    expect($(".sy-living-toast")!.textContent).toMatch(/^Saved a copy: /);
    teardown?.();
    openPanel(withClassResults(a, PUPILS));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    tid("results-clear").click();
    barButton("Save a Copy").click();
    const b = await blobText(blobs[1]!);
    expect(b).not.toContain("class-results");
    expect(withCopyCount(b, 0)).toBe(withCopyCount(a, 0));
  });

  it("TASK-34b6: when the questions changed, the copy does not keep the codes, and the message says so", async () => {
    const blobs = captureDownloads();
    openPanel();
    paste(PUPILS.join("\n"));
    tid("class-results-toggle").click();
    $<HTMLElement>(".sy-living-canvas .sy-element")!.click();
    const ta = $<HTMLTextAreaElement>(".sy-living-inspector textarea")!;
    ta.value = "A changed question?";
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    barButton("Save a Copy").click();
    const copy = await blobText(blobs[0]!);
    expect(readClassResults(copy)).toEqual([]);
    expect($(".sy-living-toast")!.textContent).toMatch(/The questions changed, so the three results codes were not kept in it\.$/);
  });

  it("TASK-34b6: stored codes that do not match the lesson are dropped on opening, never tallied", () => {
    const other: Stack = JSON.parse(JSON.stringify(lesson));
    const t = quizCards(other)[0]!.elements[0]!;
    if (t.type === "text") t.content = "Other?";
    openPanel(withClassResults(exportedFile(lesson), [PUPILS[0]!, codeFor("RRRRRR", 4, undefined, other), "junk"]));
    expect(tid("results-status").textContent).toBe("One pupil counted.");
    expect(key.n).toBe(6);
  });
});

describe("TASK-34b6: the results block never touches the real runtime", () => {
  it("TASK-34b6: with the REAL living bundle (which contains the block's tag as text), writing and removing codes leaves the file byte-identical", async () => {
    const { readFileSync } = await import("node:fs");
    const livingIife = readFileSync("dist/living/living.iife.js", "utf8");
    expect(livingIife).toContain('<script id="class-results" type="application/json">');
    const html = buildLivingHtml({ title: lesson.title, stackJson: toEscapedStackJson(lesson), livingIife, fontFaces: "" });
    expect(withClassResults(html, [])).toBe(html);
    expect(readClassResults(html)).toEqual([]);
    const withCodes = withClassResults(html, PUPILS);
    expect(readClassResults(withCodes)).toEqual(PUPILS);
    expect(withCodes).toContain(livingIife);
    expect(withClassResults(withCodes, [])).toBe(html);
    expect(withClassResults(withClassResults(withCodes, PUPILS.slice(0, 1)), PUPILS)).toBe(withCodes);
  });
});
