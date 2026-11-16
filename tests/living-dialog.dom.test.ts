// tests/living-dialog.dom.test.ts
// TASK-42a1 / a3 / a5: the living file's in-file "are you sure?" box
// (src/living/dialog.ts) replaces window.confirm(). These tests check the box
// on its own (focus, Tab, Escape, Enter, backdrop, names, sizes) and through the
// real Teacher tab, and that no native confirm is left under src/living.

import { describe, it, expect, vi, afterEach } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ask, closeDialog, dialogIsOpen } from "../src/living/dialog.js";
import { LIVING_STYLES, ensureLivingStyles } from "../src/living/styles.js";
import { mountLivingApp, TEACHER_GATE } from "../src/living/livingApp.js";
import { vikingsStack } from "../src/shared/readyMadeStacks.js";
import { openDialog } from "./helpers/living-dialog.js";

const ROOT = path.resolve(__dirname, "..");
const teardowns: Array<() => void> = [];

// jsdom has no ResizeObserver; the player and editor use one.
class FakeResizeObserver { observe(): void {} unobserve(): void {} disconnect(): void {} }
(globalThis as unknown as Record<string, unknown>)["ResizeObserver"] = FakeResizeObserver;

afterEach(() => {
  closeDialog();
  while (teardowns.length) teardowns.pop()!();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function opener(label = "Open"): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = label;
  document.body.appendChild(b);
  b.focus();
  return b;
}

function askOnce(): { answers: boolean[]; from: HTMLButtonElement } {
  const from = opener();
  const answers: boolean[] = [];
  ask({ heading: "Clear all three codes?", body: "This can't be undone.", confirmLabel: "Clear the Codes", cancelLabel: "Keep the Codes" }, (yes) => answers.push(yes));
  return { answers, from };
}

const key = (k: string, shift = false): void => {
  (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: k, shiftKey: shift, bubbles: true, cancelable: true }));
};

describe("TASK-42a: TASK-42a1: the in-file dialog", () => {
  it("TASK-42a1: TASK-42a5: it is a modal dialog named by its heading, and focus moves into it", () => {
    const { from } = askOnce();
    const box = openDialog()!;
    expect(box.getAttribute("role")).toBe("dialog");
    expect(box.getAttribute("aria-modal")).toBe("true");
    const heading = document.getElementById(box.getAttribute("aria-labelledby")!)!;
    expect(heading.tagName).toBe("H2");
    expect(heading.textContent).toBe("Clear all three codes?");
    expect(box.contains(document.activeElement)).toBe(true);
    // Focus starts on the quiet button, so a stray Enter declines.
    expect(document.activeElement?.textContent).toBe("Keep the Codes");
    expect(document.activeElement).not.toBe(from);
    expect(dialogIsOpen()).toBe(true);
  });

  it("TASK-42a1: TASK-42a5: Tab and Shift+Tab stay inside the box", () => {
    askOnce();
    const [quiet, primary] = Array.from(openDialog()!.querySelectorAll("button"));
    key("Tab");
    expect(document.activeElement).toBe(primary);
    key("Tab");
    expect(document.activeElement).toBe(quiet);
    key("Tab", true);
    expect(document.activeElement).toBe(primary);
    key("Tab", true);
    expect(document.activeElement).toBe(quiet);
  });

  it("TASK-42a1: TASK-42a5: Escape declines, closes the box and returns focus to the opener", () => {
    const { answers, from } = askOnce();
    key("Escape");
    expect(answers).toEqual([false]);
    expect(openDialog()).toBeNull();
    expect(document.activeElement).toBe(from);
  });

  it("TASK-42a1: Enter presses the focused button (quiet declines, primary accepts)", () => {
    const first = askOnce();
    key("Enter");
    expect(first.answers).toEqual([false]);
    const second = askOnce();
    key("Tab");
    key("Enter");
    expect(second.answers).toEqual([true]);
    expect(document.activeElement).toBe(second.from);
  });

  it("TASK-42a1: a click on the backdrop declines; a click inside the box does not", () => {
    const { answers } = askOnce();
    openDialog()!.querySelector("h2")!.click();
    expect(answers).toEqual([]);
    document.querySelector<HTMLElement>(".sy-dialog-backdrop")!.click();
    expect(answers).toEqual([false]);
    expect(openDialog()).toBeNull();
  });

  it("TASK-42a1: keys do not reach the page behind the box while it is open", () => {
    const behind = vi.fn();
    document.addEventListener("keydown", behind);
    askOnce();
    key(" ");
    key("Escape");
    expect(behind).not.toHaveBeenCalled();
    key("Escape"); // closed now: the page hears keys again
    expect(behind).toHaveBeenCalledTimes(1);
    document.removeEventListener("keydown", behind);
  });

  it("TASK-42a1: opening a second box declines the first; there is only ever one", () => {
    const a = askOnce();
    const b = askOnce();
    expect(a.answers).toEqual([false]);
    expect(document.querySelectorAll(".sy-dialog")).toHaveLength(1);
    expect(b.answers).toEqual([]);
  });

  it("TASK-42a1: the styles: 44 px buttons, 18 px text, no stamp red, no blur, fits a 390 px phone, reduced motion", () => {
    ensureLivingStyles();
    const css = LIVING_STYLES;
    const block = (sel: string): string => {
      const at = css.indexOf(`${sel} {`);
      expect(at, sel).toBeGreaterThanOrEqual(0);
      return css.slice(at, css.indexOf("}", at));
    };
    expect(block(".sy-dialog-btn")).toMatch(/min-height: 44px/);
    expect(block(".sy-dialog-btn")).toMatch(/min-width: 44px/);
    expect(block(".sy-dialog")).toMatch(/font-size: 18px/);
    // Fits 390 px: full width with a cap, padding counted inside, long words wrap.
    expect(block(".sy-dialog")).toMatch(/width: 100%; max-width: 520px/);
    expect(block(".sy-dialog")).toMatch(/box-sizing: border-box/);
    expect(block(".sy-dialog")).toMatch(/overflow-wrap: anywhere/);
    expect(block(".sy-dialog-backdrop")).toMatch(/padding: 16px/);
    expect(block(".sy-dialog-row")).toMatch(/flex-wrap: wrap/);
    const dialogCss = css.slice(css.indexOf("TASK-42a1"), css.indexOf("@media (prefers-reduced-motion: reduce) { .sy-dialog"));
    expect(dialogCss).not.toMatch(/#CE3926/i); // stamp red is for earned stamps
    expect(dialogCss).not.toMatch(/backdrop-filter|blur\(/);
    expect(css).toContain("@media (prefers-reduced-motion: reduce) { .sy-dialog { animation: none; } }");
  });
});

describe("TASK-42a2: the Teacher tab's guard", () => {
  function mount(): HTMLButtonElement {
    const root = document.createElement("main");
    root.id = "player-root";
    document.body.appendChild(root);
    teardowns.push(mountLivingApp(vikingsStack(), root, { pristineHtml: "<html><body></body></html>" }));
    return document.querySelector<HTMLButtonElement>(".sy-teacher-tab")!;
  }

  it("TASK-42a2: the words follow the audience rules: a question, one plain line, title-case buttons under five words", () => {
    expect(TEACHER_GATE).toEqual({
      heading: "Are you the teacher?",
      body: "Editing this lesson is for the teacher.",
      confirm: "Open the Editor",
      cancel: "Back to the Lesson",
    });
    for (const label of [TEACHER_GATE.confirm, TEACHER_GATE.cancel]) {
      expect(label.split(" ").length).toBeLessThan(5);
      // Title case: every word but the small ones starts with a capital.
      for (const w of label.split(" ")) if (!["the", "to", "a"].includes(w)) expect(w[0], label).toBe(w[0]!.toUpperCase());
    }
  });

  it("TASK-42a2: TASK-42a5: declining by Escape keeps Play and returns focus to the Teacher tab; no native confirm is used", () => {
    const native = vi.spyOn(window, "confirm");
    const tab = mount();
    tab.focus();
    tab.click();
    expect(openDialog()!.querySelector("h2")!.textContent).toBe("Are you the teacher?");
    key("Escape");
    expect(openDialog()).toBeNull();
    expect(document.querySelector(".sy-living-overlay")).toBeNull();
    expect(document.querySelector("#player-root .sy-card")).not.toBeNull();
    expect(document.activeElement).toBe(tab);
    expect(native).not.toHaveBeenCalled();
  });

  it("TASK-42a2: TASK-42a5: Tab to Open the Editor and Enter opens the editor, focus on its title", () => {
    const tab = mount();
    tab.focus();
    tab.click();
    key("Tab");
    expect(document.activeElement?.textContent).toBe("Open the Editor");
    key("Enter");
    expect(document.querySelector(".sy-living-overlay")).not.toBeNull();
    expect(document.activeElement?.id).toBe("sy-living-title");
  });
});

describe("TASK-42a3: no native confirm is left in the living file", () => {
  it("TASK-42a3: no file under src/living calls confirm(", () => {
    const dir = path.join(ROOT, "src", "living");
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => /\bconfirm\(/.test(readFileSync(path.join(dir, f), "utf8").replace(/\/\/.*$/gm, "")));
    expect(offenders).toEqual([]);
    // The guard itself works: it would catch the old line.
    expect(/\bconfirm\(/.test('const ok = window.confirm("Are you the teacher?");')).toBe(true);
  });
});

describe("TASK-42a4: the gates click the box like a teacher", () => {
  const read = (f: string): string => readFileSync(path.join(ROOT, f), "utf8");
  const gates = ["scripts/check-living-file.ts", "scripts/check-class-results.ts", "scripts/check-living-mobile.ts", "scripts/check-a11y.ts", "scripts/check-sample-csp.ts", "scripts/make-readme-media.ts"];

  it("TASK-42a4: no gate answers window.confirm with true any more; each clicks the box's button", () => {
    for (const f of gates) {
      const src = read(f);
      expect(src, f).not.toMatch(/window\.confirm = (\(\) => true|function \(\) \{ return true; \})/);
      expect(src, f).toContain("data-sy-dialog");
    }
    // The two in-page drivers fail loudly if the file ever calls the native confirm again.
    for (const f of ["scripts/check-living-file.ts", "scripts/check-class-results.ts"]) {
      expect(read(f), f).toContain("the living file used the browser's confirm() box, not its own dialog");
    }
    // The keyboard path answers "Are you the teacher?" with Tab and Enter, and checks the ring.
    expect(read("scripts/check-a11y.ts")).toContain('gateBtn.text !== "Open the Editor"');
  });

  it("TASK-42a4: the a11y page count is unchanged (the open box is not an audited page)", () => {
    const report = JSON.parse(read("docs/accessibility/axe-report.json")) as { pages: unknown[] };
    expect(report.pages).toHaveLength(16);
    expect(read("docs/accessibility/README.md")).toContain("The open box is not one of the audited pages, so the page count is unchanged.");
  });
});

describe("TASK-42a6 / TASK-42a7: the docs", () => {
  const read = (f: string): string => readFileSync(path.join(ROOT, f), "utf8");

  it("TASK-42a6: JUDGES.md step 8 names the box and the button to press, then Class Results", () => {
    const step = read("JUDGES.md").split("\n").find((l) => l.startsWith("8. "))!;
    expect(step).toContain('An "Are you the teacher?" box opens in the file (a gentle guard for the class, not a password): press **Open the Editor**.');
    expect(step.indexOf("**Open the Editor**")).toBeLessThan(step.indexOf("**Class Results**"));
    expect(step).toContain("**Add Codes**");
  });

  it("TASK-42a7: the specs that describe the old confirm keep their history and carry a dated note", () => {
    expect(read(".kiro/specs/class-results/design.md")).toContain("(16 Nov 2026, TASK-42a3: the question is now asked in the living file's own");
    expect(read(".kiro/specs/class-results/design.md")).toContain('It asks "Clear all N codes?" (`confirm`)');
    expect(read(".kiro/specs/exporter/tasks.md")).toContain("(16 Nov 2026, TASK-42a2: the confirm is now the living file's own in-file");
    expect(read(".kiro/specs/exporter/tasks.md")).toContain('simple confirm ("Are you the teacher?") — a guard, not security');
  });
});
