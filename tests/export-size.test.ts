// tests/export-size.test.ts
// TASK-33b: "the lesson is the file", with a number you can check.
//
// The README and the write-up claim that N lesson files like the water-cycle
// test deck fit on a 1.44 MB floppy, where bytes is a LIVING export of
// tests/fixtures/generation/water-cycle-g2.json (measured by
// scripts/lesson-size.ts, the same code check:claims uses).
//   - TASK-35b: N = min(6, floor(1,457,664 / bytes)). The coordinator claims 6
//     so the claim has headroom (the export was 208,188 B on 10 Nov, 49 B under
//     the next count up).
//   - Limit for 6: floor(1,457,664 / 6) = 242,944 bytes. The size test budgets
//     232,000 bytes, a 10,944-byte margin below it.
// The ready-made samples carry photos, so they are larger (9 Nov):
//   irish-words.html 252,776 B, times-tables.html 248,187 B,
//   vikings-in-ireland.html 238,930 B. That is why the claim names the fixture.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fixtureLivingExportBytes, LESSON_FIXTURE } from "../scripts/lesson-size.js";
import {
  FLOPPY_BYTES,
  FLOPPY_PHRASE,
  floppyCount,
  floppyBudget,
  floppyClaim,
  FLOPPY_CLAIM,
  FLOPPY_MARGIN_BUDGET,
  readFloppyClaim,
  fixFloppyClaim,
  compareFloppy,
  compareWriteup,
  applyWriteupFix,
  type WriteupNumbers,
} from "../scripts/claims-lib.js";

const ROOT = process.cwd();
const read = (f: string): string => readFileSync(path.join(ROOT, f), "utf8");
const FLAT = (s: string): string => s.replace(/\s+/g, " ");

/** Each sample's ceiling: it carries photos, but must stay a file you can email. */
const SAMPLE_BUDGET_BYTES = 300 * 1024;

describe("TASK-33b: the floppy count is floor(1,457,664 / bytes), never rounded up", () => {
  it("TASK-33b: FAT12 capacity, and floor at the boundaries", () => {
    expect(FLOPPY_BYTES).toBe(1_457_664);
    expect(floppyCount(189_754)).toBe(7); // 7.68 — not 8
    expect(floppyCount(208_237)).toBe(7); // the budget for 7 itself
    expect(floppyCount(208_238)).toBe(6); // one byte over
    expect(floppyCount(182_208)).toBe(8);
    expect(floppyCount(182_209)).toBe(7);
    expect(floppyCount(0)).toBe(0);
    expect(floppyCount(-1)).toBe(0);
    expect(floppyBudget(7)).toBe(208_237);
    for (const n of [1, 5, 6, 7, 8, 12]) {
      expect(floppyCount(floppyBudget(n))).toBeGreaterThanOrEqual(n);
      expect(floppyCount(floppyBudget(n) + 1)).toBeLessThan(n + 1);
    }
  });

  const readme = "- Floppy test: **6** lesson files like the water-cycle test deck fit on a 1.44 MB floppy\n  (1,457,664 bytes).";

  it("TASK-33b: the README check reads the count, goes red on a wrong or missing one, and --fix rewrites it", () => {
    expect(readFloppyClaim(readme)).toBe(6);
    expect(compareFloppy(readme, 6).ok).toBe(true);
    expect(compareFloppy(readme, 5).ok).toBe(false);
    expect(compareFloppy(readme, 7).ok).toBe(false);
    expect(compareFloppy(readme.replace("water-cycle test deck", "samples"), 6).ok).toBe(false);
    expect(compareFloppy("no floppy here", 6).claimed).toBe("(missing)");
    expect(compareFloppy("no floppy here", 6).ok).toBe(false);
    const fixed = fixFloppyClaim(readme, 5);
    expect(readFloppyClaim(fixed)).toBe(5);
    expect(fixed).toContain("**5** lesson files like the water-cycle test deck");
  });

  const truth: WriteupNumbers = { traced: 110, tests: 1200, mutants: 88, properties: 63, kb: 11.9, fileKb: 185, floppy: 6 };
  const writeup = (n: number): string =>
    [
      "The commit we submit reports 110 of 110 and 1,200 tests; a generated lesson file is now about 185 KB.",
      "an 88-mutant script (`npm run check:mutants`, 88 of 88 killed) that reverts 88 of the review fixes",
      "63 fast-check properties. The player bundle is 11.9 KB gzipped.",
      `It is small: ${n} lesson files like the water-cycle test deck fit on a 1.44 MB floppy (the photo samples are larger).`,
    ].join("\n");

  it("TASK-33b: the write-up check goes red on a wrong floppy count (or none), and --fix writes the measured one", () => {
    expect(compareWriteup(writeup(6), truth).filter((c) => !c.ok)).toEqual([]);
    const bad = compareWriteup(writeup(7), truth).filter((c) => !c.ok);
    expect(bad.map((c) => c.name)).toEqual(["write-up floppy count (N lesson files … fit on a 1.44 MB floppy)"]);
    const missing = compareWriteup(writeup(6).replace(/It is small:[^\n]*/, ""), truth).filter((c) => !c.ok);
    expect(missing.map((c) => c.name)).toEqual(["write-up floppy"]);
    expect(applyWriteupFix(writeup(7), truth)).toContain(`6 ${FLOPPY_PHRASE}`);
  });

  it("TASK-35b: the stated count is min(6, the measured count) — capped at 6, never more than really fits", () => {
    expect(FLOPPY_CLAIM).toBe(6);
    expect(floppyClaim(189_754)).toBe(6); // 7 fit, 6 stated
    expect(floppyClaim(208_188)).toBe(6);
    expect(floppyClaim(100_000)).toBe(6); // 14 fit, still 6
    expect(floppyClaim(floppyBudget(6))).toBe(6);
    expect(floppyClaim(floppyBudget(6) + 1)).toBe(5); // past 242,944 B the claim drops
    expect(floppyClaim(0)).toBe(0);
    expect(floppyBudget(6)).toBe(242_944);
    expect(FLOPPY_MARGIN_BUDGET).toBe(232_000);
    expect(floppyBudget(6) - FLOPPY_MARGIN_BUDGET).toBe(10_944);
  });
});

describe("TASK-33b: the living export of the water-cycle fixture stays inside the claimed floppy count", () => {
  it("TASK-33b: README and write-up name the fixture (not the samples) and claim the same count", () => {
    const readme = FLAT(read("README.md"));
    const n = readFloppyClaim(readme);
    expect(n).not.toBeNull();
    expect(readme).toContain(`**${n}** ${FLOPPY_PHRASE} (1,457,664 bytes). That is a living export of \`tests/fixtures/generation/water-cycle-g2.json\`, sized by \`tests/export-size.test.ts\`.`);
    expect(path.relative(ROOT, LESSON_FIXTURE)).toBe(path.join("tests", "fixtures", "generation", "water-cycle-g2.json"));
    expect(FLAT(read("docs/DEVPOST_WRITEUP.md"))).toContain(`${n} ${FLOPPY_PHRASE}`);
  });

  it("TASK-35b: size budget — the export is at most 232,000 bytes, a 10,944-byte margin below the 6-file limit (242,944 B)", async () => {
    const n = readFloppyClaim(read("README.md"))!;
    const bytes = await fixtureLivingExportBytes();
    console.log(`TASK-35b: water-cycle living export ${bytes} bytes; margin budget ${FLOPPY_MARGIN_BUDGET} bytes (${FLOPPY_MARGIN_BUDGET - bytes} left); the 6-file limit ${floppyBudget(6)} bytes; ${floppyCount(bytes)} fit`);
    expect(n).toBe(FLOPPY_CLAIM);
    expect(bytes).toBeGreaterThan(0);
    expect(bytes, `the export grew past the ${FLOPPY_MARGIN_BUDGET}-byte margin budget under the 6-file limit`).toBeLessThanOrEqual(FLOPPY_MARGIN_BUDGET);
    expect(floppyCount(bytes)).toBeGreaterThanOrEqual(n);
  });

  const samples = readdirSync(path.join(ROOT, "samples")).filter((f) => f.endsWith(".html")).sort();

  it("TASK-33b: the samples folder has the three ready-made lessons", () => {
    expect(samples).toEqual(["irish-words.html", "times-tables.html", "vikings-in-ireland.html"]);
  });

  for (const f of samples) {
    it(`TASK-33b: samples/${f} — size stated, under ${SAMPLE_BUDGET_BYTES} bytes, and larger than the fixture (it carries photos)`, async () => {
      const bytes = statSync(path.join(ROOT, "samples", f)).size;
      const fixture = await fixtureLivingExportBytes();
      console.log(`TASK-33b: samples/${f} ${bytes} bytes (${Math.round(bytes / 1024)} KB; ${floppyCount(bytes)} fit on a floppy)`);
      expect(bytes).toBeLessThanOrEqual(SAMPLE_BUDGET_BYTES);
      // Why the claim names the fixture: a sample would give a smaller count.
      expect(bytes).toBeGreaterThan(fixture);
    });
  }
});
