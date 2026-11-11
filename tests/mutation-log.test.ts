// tests/mutation-log.test.ts
// TASK-37a (the mutant count is backed by a logged run in docs/mutation-runs/),
// TASK-37b (the v8 credits) and TASK-37c (the write-up's v8 video note).

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  compareMutationLog,
  formatMutationLog,
  newestMutationLog,
  parseMutationLog,
  readWriteupClaims,
  MUTATION_RERUN,
} from "../scripts/claims-lib.js";

const read = (f: string): string => readFileSync(f, "utf8");
const FLAT = (s: string): string => s.replace(/\s+/g, " ");
const OUT = (n: number): string =>
  [
    ...Array.from({ length: n }, (_, i) => `  KILLED    mutant ${i + 1}   [reverts x]`),
    `mutation-check: ${n} of ${n} mutants killed.`,
  ].join("\n");
const facts = (date: string, sha256: string) => ({ date, head: "a".repeat(40), clean: false, node: "v24.0.0", sha256 });
const LINE = "a 3-mutant script (`npm run check:mutants`, 3 of 3 killed in the newest run logged in docs/mutation-runs/) that reverts 3 of the review fixes";

let dir = "";
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = "";
});
/** Write logs into a temp docs/mutation-runs/ and read them back as check:claims does. */
function logsIn(entries: Array<[string, string]>): ReturnType<typeof newestMutationLog> {
  dir = mkdtempSync(path.join(os.tmpdir(), "mutation-runs-"));
  for (const [name, text] of entries) writeFileSync(path.join(dir, name), text, "utf8");
  return newestMutationLog(readdirSync(dir).map((f) => ({ file: f, text: readFileSync(path.join(dir, f), "utf8") })));
}

describe("TASK-37a: the mutant count is backed by the newest logged run", () => {
  it("TASK-37a: the log has the date, full HEAD, clean flag, node, sha256, every KILLED line and the final line verbatim", () => {
    const text = formatMutationLog(facts("2026-11-10T09:00:00.000Z", "f".repeat(64)), `noise\n${OUT(2)}\n`);
    expect(text.split("\n").slice(0, 5)).toEqual([
      "Date (UTC): 2026-11-10T09:00:00.000Z",
      `HEAD: ${"a".repeat(40)}`,
      "Working tree clean: no (uncommitted changes)",
      "Node: v24.0.0",
      `sha256 scripts/mutation-check.ts: ${"f".repeat(64)}`,
    ]);
    expect(text).toContain("  KILLED    mutant 2   [reverts x]");
    expect(text).toContain("\nmutation-check: 2 of 2 mutants killed.\n");
    expect(text).not.toContain("noise");
    expect(parseMutationLog("x.log", text)).toMatchObject({ n: 2, clean: false, sha256: "f".repeat(64), killed: ["  KILLED    mutant 1   [reverts x]", "  KILLED    mutant 2   [reverts x]"] });
    expect(() => formatMutationLog(facts("d", "s"), "no final line")).toThrow();
  });

  it("TASK-37a: a matching log passes; a stale hash fails; a mismatched N fails — both say re-run check:mutants:log", () => {
    const sha = "1".repeat(64);
    const good = logsIn([["2026-11-10-aaaaaaa.log", formatMutationLog(facts("2026-11-10T09:00:00.000Z", sha), OUT(3))]]);
    expect(compareMutationLog(LINE, "write-up", good, sha).every((c) => c.ok)).toBe(true);
    const stale = compareMutationLog(LINE, "write-up", good, "2".repeat(64)).filter((c) => !c.ok);
    expect(stale.map((c) => c.name)).toEqual(["write-up mutation log matches scripts/mutation-check.ts"]);
    expect(stale[0]!.note).toContain(MUTATION_RERUN);
    const wrongN = compareMutationLog(LINE.replace(/3 of 3 killed/, "4 of 4 killed"), "write-up", good, sha).filter((c) => !c.ok);
    expect(wrongN).toHaveLength(1);
    expect(wrongN[0]!.note).toContain(MUTATION_RERUN);
    const none = compareMutationLog(LINE, "write-up", null, sha);
    expect(none.map((c) => c.ok)).toEqual([false]);
    expect(none[0]!.note).toContain(MUTATION_RERUN);
    // A text that states no count is not checked (the README states none).
    expect(compareMutationLog("no count here", "README", good, sha)).toEqual([]);
  });

  it("TASK-37a: the NEWEST log (by its own date-time) is the one compared, and a malformed log is ignored", () => {
    const sha = "3".repeat(64);
    const log = logsIn([
      ["2026-11-09-old.log", formatMutationLog(facts("2026-11-09T09:00:00.000Z", sha), OUT(2))],
      ["2026-11-10-new.log", formatMutationLog(facts("2026-11-10T09:00:00.000Z", sha), OUT(3))],
      ["junk.log", "not a log"],
    ]);
    expect(log!.file).toBe("2026-11-10-new.log");
    expect(compareMutationLog(LINE, "write-up", log, sha).every((c) => c.ok)).toBe(true);
  });
});

describe("TASK-37b: the credits count the v8 footage", () => {
  it("TASK-37b: TASK-38c: about 23 s (v8b) in seven on-screen windows, eight shots, in the write-up and the README; the old count is gone", () => {
    const w = FLAT(read("docs/DEVPOST_WRITEUP.md"));
    const r = FLAT(read("README.md"));
    expect(w).toContain("(about 23 s in seven on-screen windows, eight shots in all)");
    expect(r).toContain("(about 23 s in seven on-screen windows, eight shots)");
    for (const t of [w, r]) expect(t).not.toMatch(/about 28 s|about 24 s|ten shots|six sequences/);
  });
});

describe("TASK-37c: the write-up's video note describes v8", () => {
  it("TASK-37c: TASK-38d: TASK-40a: two or three sentences naming what v8 shows; check:claims still reads its numbers; the link line is untouched (now line 7, under the category line and the R1 lead)", () => {
    const lines = read("docs/DEVPOST_WRITEUP.md").split("\n");
    expect(lines[6]).toBe("Video (public, AI disclosure set on YouTube, v8b uploaded 10.11): https://youtu.be/x6W2BzhpAyU");
    const p = lines[8]!;
    for (const s of [
      "recorded on the live app at commit 4703964",
      "a real generation in real time (Build Cards to the editor in 13.7 s in that take; usually 10–20 s)",
      '"Swap this wrong answer" with Undo',
      "one-switch Scan",
      "a pupil's results code on the end card and the teacher's Class Results table (two of the three pupil codes were played by script off camera, as the video says)",
      "Save a Copy with the Wi-Fi off (files of about 212 KB in the take)",
      "check:trace and check:claims at commit 8e24ecd",
    ]) expect(p).toContain(s);
    expect(p).not.toMatch(/v7|1,003|11\.7 KB|170 KB|20–45/);
    expect(p.split(/(?<=[.])\s+(?=[A-Z])/).length).toBeLessThanOrEqual(3);
    const names = new Set(readWriteupClaims(p).map((c) => c.name));
    for (const n of ["traced", "tests", "kb", "fileKb"] as const) expect(names.has(n), n).toBe(true);
  });
});
