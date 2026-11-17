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
import { V8B_ID, videoId } from "./helpers/video-link.js";

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
  it("TASK-37b: TASK-38c: TASK-43e1: TASK-44b3: about 23 s (v8b: 23.1 s measured by frame) in seven on-screen windows, eight shots, in the write-up and the README; the old counts are gone", () => {
    const w = FLAT(read("docs/DEVPOST_WRITEUP.md"));
    const r = FLAT(read("README.md"));
    expect(w).toContain("(about 23 s in seven on-screen windows, eight shots in all)");
    expect(r).toContain("(about 23 s in seven on-screen windows, eight shots in all)");
    for (const t of [w, r]) expect(t).not.toMatch(/about 28 s|about 24 s|about 21 s|ten shots|six sequences/);
  });
});

describe("TASK-37c: the write-up's video note describes the linked video (v9b since TASK-44f)", () => {
  it("TASK-37c: TASK-38d: TASK-40a: TASK-42d3: TASK-44f1: two sentences naming what v9b shows; check:claims still reads its numbers; the link line is line 9, under the category line, the R1 lead and the relevance line", () => {
    const lines = read("docs/DEVPOST_WRITEUP.md").split("\n");
    // TASK-44f5: the id is not pinned (a placeholder until the upload); it is not v8b's.
    expect(lines[8]).toMatch(/^Video \(v9b, 2:43, AI disclosure set on YouTube\): https:\/\/youtu\.be\/[A-Za-z0-9_-]+$/);
    expect(videoId(lines[8]!)).not.toBe(V8B_ID);
    const p = lines[10]!;
    for (const s of [
      "Every app screen in the video (v9b) was recorded on 16 Nov 2026 at commit cf99a89, built with the repo's own scripts and run on our machine, in real time:",
      "a real generation (Build Cards to the editor in 11.8 s in that take; usually 10–20 s)",
      '"Swap this wrong answer" with Undo',
      'the "Before you share" warning, Export and Export for class',
      "one-switch Scan",
      "three pupils' end cards and the teacher's Class Results table (all three codes come from our own play-throughs, not a class, as the video says)",
      "the file editing itself and its copies (221,803 and 222,496 bytes on disk)",
      "check:trace and check:claims passing at cf99a89",
    ]) expect(p).toContain(s);
    expect(p).not.toMatch(/v7|v8b|4703964|8e24ecd|13\.7 s|about 212 KB|Two screens have changed|1,003|11\.7 KB|170 KB|20–45/);
    expect(p.split(/(?<=[.])\s+(?=[A-Z])/).length).toBeLessThanOrEqual(2);
    const names = new Set(readWriteupClaims(p).map((c) => c.name));
    for (const n of ["traced", "tests", "kb", "fileKb"] as const) expect(names.has(n), n).toBe(true);
  });
});
