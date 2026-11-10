// tests/a11y-claims.test.ts
// TASK-33d5 (contrast, computed from the source) and TASK-33d6 (the docs say
// exactly what was and was not checked, and the claim line is checked against
// docs/accessibility/axe-report.json). TASK-33d1: the report's shape.

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { contrast, hexToRgb, over, pairs, table, MIN, START, END } from "../scripts/check-contrast.js";
import {
  a11yFromReport,
  a11yLine,
  a11ySentence,
  compareA11y,
  fixA11y,
  readA11yClaim,
  keyReviewLine,
  A11Y_DISCLAIMER,
  type A11yNumbers,
} from "../scripts/claims-lib.js";

const ROOT = process.cwd();
const read = (f: string): string => readFileSync(path.join(ROOT, f), "utf8");

describe("TASK-33d5: contrast is computed from the source, never typed", () => {
  it("TASK-33d5: the WCAG ratio matches the design system's measured pairs", () => {
    const r = (a: string, b: string): number => Math.round(contrast(hexToRgb(a), hexToRgb(b)) * 100) / 100;
    expect(r("#1E2A47", "#FBF8F1")).toBe(13.4);
    expect(r("#1E2A47", "#F2735F")).toBe(5);
    expect(r("#1E2A47", "#26A69A")).toBe(4.74);
    expect(r("#FFFFFF", "#1E2A47")).toBe(14.21);
    expect(r("#CE3926", "#FBF8F1")).toBe(4.67);
    expect(r("#000", "#fff")).toBe(21);
    expect(over([0, 0, 0], 0.5, [255, 255, 255])).toEqual([128, 128, 128]);
  });

  it("TASK-33d5: the thresholds are 4.5:1 body, 3:1 large and UI; a pair under its line fails", () => {
    expect(MIN).toEqual({ body: 4.5, large: 3, ui: 3 });
    const bad = table([{ where: "x", fg: "#777777", bg: "#FFFFFF", size: "body" }]);
    expect(bad.failures.length).toBe(1);
    expect(table([{ where: "x", fg: "#777777", bg: "#FFFFFF", size: "large" }]).failures).toEqual([]);
  });

  it("TASK-33d5: every pair passes, and the README's table is exactly a fresh one", () => {
    const fresh = table(pairs());
    expect(fresh.failures).toEqual([]);
    const md = read("docs/accessibility/README.md");
    expect(md.slice(md.indexOf(START), md.indexOf(END) + END.length)).toBe(fresh.md);
    expect(pairs().length).toBeGreaterThanOrEqual(20);
  });
});

describe("TASK-33d6: what was checked, what was not, and the checked line", () => {
  const a: A11yNumbers = { axeVersion: "4.14.0", pages: 14, seriousOrCritical: 0, keyboard: true, scan: true };

  it("TASK-33d6: the README says what was NOT checked: no screen-reader user, no VoiceOver/NVDA, no disabled pupils", () => {
    const md = read("docs/accessibility/README.md");
    expect(md).toContain("No screen-reader user test.");
    expect(md).toContain("No VoiceOver, NVDA, JAWS or TalkBack recording.");
    expect(md).toContain("No testing with disabled pupils");
    expect(md).toContain("**Excluded rules: none.**");
    expect(md).toContain("axe-core](https://github.com/dequelabs/axe-core) **4.14.0**");
  });

  it("TASK-33d1: axe-core is pinned exactly, and the report has per-page violations by impact, passes, the version and the date", () => {
    const pkg = JSON.parse(read("package.json")) as { devDependencies: Record<string, string> };
    expect(pkg.devDependencies["axe-core"]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(read("package-lock.json")).toContain(`"node_modules/axe-core"`);
    expect(existsSync(path.join(ROOT, "docs", "accessibility", "axe-report.json"))).toBe(true);
    const r = JSON.parse(read("docs/accessibility/axe-report.json")) as {
      axeVersion: string; date: string; pages: Array<{ page: string; passes: number; violations: Record<string, unknown[]> }>;
      totals: { pages: number; serious: number; critical: number };
    };
    expect(r.axeVersion).toBe(pkg.devDependencies["axe-core"]);
    expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.pages.length).toBe(14);
    expect(r.totals.pages).toBe(14);
    for (const p of r.pages) {
      expect(Object.keys(p.violations).sort()).toEqual(["critical", "minor", "moderate", "serious"]);
      expect(p.passes).toBeGreaterThan(0);
    }
    expect(r.totals.serious + r.totals.critical).toBe(0);
  });

  it("TASK-33d6: the sentence, read back; a right line passes, every wrong number fails, the disclaimer is required", () => {
    const line = a11yLine(a);
    expect(a11ySentence(a)).toBe(
      "axe-core 4.14.0 audited 14 pages (the Maker, the 3 samples in Play and in the Teacher tab, a class export and 5 bench files) and found 0 serious or critical violations; the keyboard-only play-through passes and the one-switch scan play-through passes",
    );
    expect(readA11yClaim(line)).toEqual(a);
    expect(compareA11y(line, "README", a).every((c) => c.ok)).toBe(true);
    for (const bad of [{ pages: 13 }, { seriousOrCritical: 1 }, { keyboard: false }, { scan: false }, { axeVersion: "4.13.0" }]) {
      expect(compareA11y(line, "README", { ...a, ...bad }).every((c) => c.ok), JSON.stringify(bad)).toBe(false);
    }
    expect(compareA11y(line.replace(A11Y_DISCLAIMER, ""), "README", a).map((c) => c.ok)).toContain(false);
    expect(compareA11y("nothing", "README", a).map((c) => c.ok)).toEqual([false]);
    expect(compareA11y(line, "README", null).map((c) => c.ok)).toEqual([false]);
    expect(compareA11y("nothing", "README", null)).toEqual([]);
  });

  it("TASK-33d6: --fix inserts the line after the key-review line, then rewrites its numbers in place", () => {
    const key = keyReviewLine({ cards: 60, decks: 12, wrong: 0, ambiguous: 2 });
    const inserted = fixA11y(`a\n${key}\nb\n`, a);
    expect(inserted.split("\n")[2]).toBe(a11yLine(a));
    const moved = fixA11y(inserted, { ...a, pages: 15 });
    expect(readA11yClaim(moved)!.pages).toBe(15);
    expect(moved.split("axe-core 4.14.0 audited").length).toBe(2);
  });

  it("TASK-33d6: the README and the write-up carry the line, matching the report", () => {
    const want = a11yFromReport(JSON.parse(read("docs/accessibility/axe-report.json")));
    for (const f of ["README.md", "docs/DEVPOST_WRITEUP.md"]) {
      expect(readA11yClaim(read(f)), f).toEqual(want);
      expect(read(f).split("\n").find((l) => l.includes("axe-core 4.14.0 audited")), f).toContain(A11Y_DISCLAIMER);
    }
  });
});
