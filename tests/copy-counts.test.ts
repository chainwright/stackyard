// tests/copy-counts.test.ts
// TASK-44e2/e3: check:claims counts the conditional skips from the test
// sources and checks each doc's pass / skip pair per kind of copy (fresh
// clone, shallow clone, ZIP download). Pure functions, sample text only.
// The sample sources below are quoted strings, one per line, so the real
// scan of tests/ never reads them as guards.

import { describe, it, expect } from "vitest";
import { countConditionalSkips, skipsByCopy, readCopyCounts, compareCopyCounts, fixCopyCounts } from "../scripts/claims-lib.js";

const src = (...lines: string[]): { file: string; text: string } => ({ file: "tests/sample.test.ts", text: lines.join("\n") });

const SAMPLE = [
  src(
    'describe("drafts", () => {',
    '  it("reads the blog draft", (ctx) => {',
    "    if (blog === null || social === null) return ctx.skip();",
    "    expect(1).toBe(1);",
    "  });",
    '  it("reads the write-up draft", (ctx) => {',
    "    if (draft === null) return ctx.skip();",
    "  });",
    '  it("a plain test", () => {',
    '    expect("if (x) return ctx.skip();").toContain("skip");',
    "  });",
    "});",
  ),
  src(
    'it("first commit", (ctx) => {',
    '  if (shallow === null || shallow.trim() === "true") return ctx.skip();',
    '  if (roots === null) return ctx.skip();',
    "});",
    'it("git grep", (ctx) => {',
    "  if (!gitCheckoutAt(ROOT)) return ctx.skip();",
    "});",
  ),
];
const KINDS = countConditionalSkips(SAMPLE);
const T = 1000;
const GOOD_README =
  "- Tests: **1000** in the suite (`npm test`). In a fresh git clone 998 pass and 2 skip: they check our draft posts. In a shallow clone (`git clone --depth 1`, the kind CI makes) 997 pass and 3 skip: one more needs the full git history. In a ZIP download, with no `.git`, 996 pass and 4 skip: one more runs `git grep`.";
const GOOD_JUDGES = "npm test  # 1,000 tests; a fresh git clone: 998 pass, 2 skip (draft posts kept beside the repo); a shallow clone: 997 pass, 3 skip; a ZIP download: 996 pass, 4 skip";
const GOOD_EVIDENCE = "| 1,000 tests in the suite (a fresh git clone: 998 pass, 2 skip; a shallow clone like CI's: 997 pass, 3 skip; a ZIP download with no `.git`: 996 pass, 4 skip) |";
const bad = (text: string, kinds = KINDS, total = T): string[] => compareCopyCounts(text, "X", total, kinds).filter((c) => !c.ok).map((c) => c.name);

describe("TASK-44e2: the conditional skips, counted from the test sources", () => {
  it("TASK-44e2: classifies each test by its guards: git checkout, then history, then draft post; a guard inside a string is not a skip", () => {
    expect(KINDS).toEqual({ draft: 2, history: 1, git: 1, chrome: 0, unknown: [] });
    expect(skipsByCopy(KINDS)).toEqual({ fresh: 2, shallow: 3, zip: 4 });
  });

  it("TASK-44e2: a suite that needs Chrome is counted apart (the machine decides it, not the copy) and does not change the pairs", () => {
    const k = countConditionalSkips([...SAMPLE, src('describe.skipIf(CHROME === undefined)("plays in Chrome", () => {', '  it("a", () => {});', "});")]);
    expect(k.chrome).toBe(1);
    expect(k.unknown).toEqual([]);
    expect(skipsByCopy(k)).toEqual(skipsByCopy(KINDS));
    // Any other skipIf condition is unknown.
    expect(countConditionalSkips([src('describe.skipIf(!process.env.SLOW)("slow", () => {', "});")]).unknown).toHaveLength(1);
  });

  it("TASK-44e2: any other skip is unknown: it.skip, skipIf, a bare ctx.skip, a guard outside a test, a guard of no known kind", () => {
    const k = countConditionalSkips([
      src('it.skip("x", () => {', "});"),
      src('it.skipIf(process.env.CI)("y", () => {', "});"),
      src('it("z", (ctx) => {', "  return ctx.skip();", "});"),
      src("if (blog === null) return ctx.skip();"),
      src('it("w", (ctx) => {', '  if (process.env.SLOW !== "1") return ctx.skip();', "});"),
    ]);
    expect(k.unknown).toEqual(["tests/sample.test.ts:1", "tests/sample.test.ts:1", "tests/sample.test.ts:2", "tests/sample.test.ts:1", "tests/sample.test.ts:1"]);
    expect(bad(GOOD_JUDGES, k)).toContain("X conditional skips classified");
  });
});

describe("TASK-44e3: the parser and the fixer, one negative case per kind of copy", () => {
  it("TASK-44e3: reads the three forms (README, JUDGES.md, EVIDENCE.md) and passes them when right", () => {
    for (const t of [GOOD_README, GOOD_JUDGES, GOOD_EVIDENCE]) {
      expect(readCopyCounts(t).map((c) => [c.kind, c.pass, c.skip])).toEqual([["fresh", 998, 2], ["shallow", 997, 3], ["zip", 996, 4]]);
      expect(bad(t)).toEqual([]);
    }
  });

  it("TASK-44e3: fails a fresh-clone pair that is off (pass or skip)", () => {
    expect(bad(GOOD_JUDGES.replace("998 pass, 2 skip", "997 pass, 2 skip"))).toEqual(["X fresh clone pass / skip"]);
    expect(bad(GOOD_JUDGES.replace("998 pass, 2 skip", "998 pass, 3 skip"))).toEqual(["X fresh clone pass / skip"]);
  });

  it("TASK-44e3: fails a shallow-clone pair that is off", () => {
    expect(bad(GOOD_EVIDENCE.replace("997 pass, 3 skip", "998 pass, 2 skip"))).toEqual(["X shallow clone pass / skip"]);
  });

  it("TASK-44e3: fails a ZIP-download pair that is off", () => {
    expect(bad(GOOD_README.replace("996 pass and 4 skip", "995 pass and 4 skip"))).toEqual(["X ZIP download pass / skip"]);
  });

  it("TASK-44e3: fails when the total moved, a kind is missing, or a working-copy claim is made", () => {
    expect(bad(GOOD_JUDGES, KINDS, 1001)).toHaveLength(3);
    expect(bad(GOOD_JUDGES.replace(/; a ZIP download: 996 pass, 4 skip/, ""))).toEqual(["X ZIP download pass / skip"]);
    expect(bad(GOOD_JUDGES + " (all pass in our working copy)")).toEqual(["X no working-copy claim"]);
  });

  it("TASK-44e3: --fix rewrites every pair from the total and the counted skips, and leaves the text alone when it cannot measure", () => {
    const stale = GOOD_README.replace("998 pass and 2 skip", "990 pass and 9 skip").replace("997 pass and 3 skip", "1 pass and 1 skip").replace("996 pass and 4 skip", "5 pass and 5 skip");
    expect(fixCopyCounts(stale, T, KINDS)).toBe(GOOD_README);
    expect(fixCopyCounts(GOOD_JUDGES.replace("998", "1"), T, KINDS)).toBe(GOOD_JUDGES);
    const more = fixCopyCounts(GOOD_EVIDENCE, 2000, KINDS);
    expect(readCopyCounts(more).map((c) => c.pass)).toEqual([1998, 1997, 1996]);
    expect(more).toContain("1,998 pass, 2 skip");
    expect(fixCopyCounts(stale, 0, KINDS)).toBe(stale);
    expect(fixCopyCounts(stale, T, { ...KINDS, unknown: ["a:1"] })).toBe(stale);
  });
});
