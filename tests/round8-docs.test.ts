// tests/round8-docs.test.ts
// TASK-32d (drag wording), TASK-32e (README truth and the recounted hook
// firings), TASK-32f (keep-warm workflow), TASK-32g (the write-up is checked
// like the README). From the v2 round-2 panel on 1ce7395.

import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync, existsSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  compareWriteup,
  applyWriteupFix,
  readWriteupClaims,
  countProperties,
  countMutants,
  parseTraceCount,
  articleFor,
  type WriteupNumbers,
} from "../scripts/claims-lib.js";

const read = (f: string): string => readFileSync(path.join(process.cwd(), f), "utf8");
const FLAT = (s: string): string => s.replace(/\s+/g, " ");

describe("TASK-32e: README truth", () => {
  const readme = FLAT(read("README.md"));
  it("TASK-32e: the H5P / Lumi line is the exact, defensible one", () => {
    expect(readme).toContain(
      "**H5P / Lumi** export an offline interactive activity for teachers, but authoring is per content type, and H5P.com's Smart Import drafts from a document, link or long pasted text, not one sentence.",
    );
    expect(readme).not.toContain("no free-form card editing");
  });
  it("TASK-32e: the invariants sentence no longer claims they guarantee an end score", () => {
    expect(readme).toContain(
      "every stack satisfies nine validity invariants, and a 'before you share' check warns if any card can't reach the end score",
    );
    expect(readme).not.toContain("so it always plays to an end score");
  });
  it("TASK-32e: the pre-submit hook is described as set to fire, not as firing", () => {
    expect(readme).toContain("set to fire when a spec task is marked done (not yet recorded firing; run on demand as `/pre-submit`)");
    expect(readme).not.toContain("gate that fires when a spec task is done");
  });
});

describe("TASK-32e: the hook firings, recounted from the session store", () => {
  const sessions = read("docs/kiro-sessions/README.md");
  const log = FLAT(read("docs/KIRO_LOG.md"));
  it("TASK-32e: the recount table is in docs/kiro-sessions with the exact numbers", () => {
    expect(sessions).toContain("## 5. Hook firings, recounted from the session store (9 Nov)");
    expect(sessions).toContain("| Whole session (5 Nov 16:07Z to 9 Nov 19:19Z) | **493** | 417 | 39 | 23 | 12 | 2 | 0 |");
    expect(sessions).toContain("| 5 Nov 16:07–16:26Z | 11 | — | — | — | 11 | — | — |");
    expect(sessions).toContain("| 6 Nov 01:37–01:38Z | 5 | — | 2 | 1 | 1 | 1 | — |");
    expect(sessions).toContain("| TASK-28 window, 6 Nov 17:30–18:44Z | **98** | 79 | 12 | 7 | — | — | — |");
    expect(sessions).toContain("| TASK-30 window, 9 Nov 16:10–17:21Z | 100 | **98** | 2 | — | — | — | — |");
    expect(sessions).toContain("| TASK-31 window, 9 Nov 18:12–19:21Z | 147 | 132 | 6 | 9 | — | — | — |");
    // the per-hook whole-session counts add up
    expect(417 + 39 + 23 + 12 + 2).toBe(493);
    expect(79 + 12 + 7).toBe(98);
  });
  it("TASK-32e: every '98' in KIRO_LOG, kiro-sessions and the README says which 98 it is", () => {
    for (const [file, text] of [["KIRO_LOG", log], ["kiro-sessions", FLAT(sessions)], ["README", FLAT(read("README.md"))], ["write-up", FLAT(read("docs/DEVPOST_WRITEUP.md"))]] as const) {
      for (const m of text.matchAll(/\b98\b/g)) {
        const around = text.slice(Math.max(0, m.index! - 200), m.index! + 200);
        expect(/TASK-28|TASK-30|after-shell/.test(around), `${file}: an unqualified 98 near "${around.slice(150, 260)}"`).toBe(true);
      }
    }
    expect(log).toContain("not the same \"98\" as the TASK-30 after-shell count");
    expect(log).toContain("the 98 is the after-shell count alone, not the TASK-28 window's three-hook total of 98");
  });
  it("TASK-32e: the README names the whole-session total and points at the table", () => {
    expect(FLAT(read("README.md"))).toContain("Kiro's session store recorded 493 hook firings in our main session (5 to 9 Nov)");
  });
});

describe("TASK-32d: drag is described as quiz and story cards only, everywhere", () => {
  it("TASK-32d: README, write-up and exporter spec say it; nothing promises drag on flash or end cards", () => {
    const want = "drag on quiz and story cards (not flash or end cards";
    expect(FLAT(read("README.md"))).toContain(want);
    expect(FLAT(read("docs/DEVPOST_WRITEUP.md"))).toContain(want);
    expect(FLAT(read(".kiro/specs/exporter/tasks.md"))).toContain("Drag works on quiz and story cards, not on flash or end cards");
    expect(FLAT(read(".kiro/specs/maker/tasks.md"))).toContain("TASK-32d: drag on flash and end cards — not feasible; the docs say so");
  });
});

describe("TASK-32f: keep-warm is in the repo, ready to install", () => {
  const wf = read("docs/ops/keep-warm.yml");
  it("TASK-32f: docs/ops/keep-warm.yml — every 10 minutes and on demand, one job pinging /api/health with a retry, no secrets, no permissions", () => {
    expect(wf).toContain('cron: "*/10 * * * *"');
    expect(wf).toMatch(/^\s*workflow_dispatch:/m);
    expect(wf).toMatch(/^permissions: \{\}$/m);
    expect(wf).toContain("curl -fsS --max-time 90 https://stackyard-sdqt.onrender.com/api/health");
    expect((wf.match(/curl -fsS --max-time 90 https:\/\/stackyard-sdqt\.onrender\.com\/api\/health/g) ?? []).length).toBe(2); // one retry
    expect(wf).not.toMatch(/secrets\./);
    expect(wf).not.toMatch(/\$\{\{\s*secrets/);
  });
  it("TASK-32f: if the workflow is installed in .github/workflows, it is byte-identical to the docs copy", () => {
    const installed = path.join(process.cwd(), ".github", "workflows", "keep-warm.yml");
    if (existsSync(installed)) expect(readFileSync(installed, "utf8")).toBe(wf);
  });
  it("TASK-33a: the README says the workflow is installed and runs every 10 minutes, names the reviewed copy, and says runs can be late", () => {
    const readme = FLAT(read("README.md"));
    expect(readme).toContain(
      "The GitHub Actions workflow is installed as `.github/workflows/keep-warm.yml` on GitHub and runs every 10 minutes",
    );
    expect(readme).toContain("[`docs/ops/keep-warm.yml`](docs/ops/keep-warm.yml) is the reviewed copy");
    expect(readme).toContain("GitHub may delay scheduled runs, so a free instance can still be cold after a quiet spell");
    // The TASK-32f "not yet installed" wording is gone.
    expect(readme).not.toContain("becomes active only once");
    expect(readme).not.toContain("Until then an external pinger keeps the demo warm.");
    expect(readme).not.toContain("ready-to-install");
  });
});

// ---------------------------------------------------------------------------

describe("TASK-32g: the write-up is checked like the README", () => {
  const writeup = read("docs/DEVPOST_WRITEUP.md");

  it("TASK-32g: docs/DEVPOST_WRITEUP.md exists, titled, with no draft heading, status paragraph or judge-loop notes", () => {
    expect(writeup.startsWith("# Stackyard: Devpost write-up\n")).toBe(true);
    expect(writeup).not.toMatch(/numbers to refresh/);
    expect(writeup).not.toMatch(/^Status: draft for the judge loop/m);
    expect(writeup).not.toContain("## Notes for the judge loop");
    expect(writeup).toContain("the deck-content hook also fired 11 times on 5 Nov (16:07–16:25 UTC)");
    expect(writeup).not.toContain("during the picture work");
    expect(FLAT(read("README.md"))).toContain("docs/DEVPOST_WRITEUP.md");
  });

  const truth: WriteupNumbers = { traced: 109, tests: 1180, mutants: 84, properties: 63, kb: 12.0, fileKb: 190, floppy: 7 };
  const good = [
    "The commit we submit reports 109 of 109 and 1,180 tests; a generated lesson file is now about 185 KB.",
    "(109 of 109 by `npm run check:trace`) and (109 of 109 appear in test titles) | 109 of 109 lettered task ids traced",
    "an 84-mutant script (`npm run check:mutants`, 84 of 84 killed on 9 Nov) that reverts 84 of the review fixes",
    "63 fast-check properties. The player bundle is 12.0 KB gzipped.",
    "It is small: 7 lesson files like the water-cycle test deck fit on a 1.44 MB floppy.",
    "It shows 84 of 84 traced task ids, 1,003 tests (the video: history, not a claim).",
  ].join("\n");

  it("TASK-32g: a correct write-up passes every check, and the video's old numbers are not claims", () => {
    const checks = compareWriteup(good, truth);
    expect(checks.filter((c) => !c.ok)).toEqual([]);
    const names = new Set(readWriteupClaims(good).map((c) => c.name));
    for (const n of ["traced", "tests", "mutants", "properties", "kb", "fileKb"] as const) expect(names.has(n), n).toBe(true);
  });

  const drifts: Array<[string, string, string]> = [
    ["traced ids", "reports 109 of 109", "reports 102 of 102"],
    ["check:trace ids", "(109 of 109 by", "(102 of 102 by"],
    ["tests", "and 1,180 tests", "and 1,145 tests"],
    ["mutant script", "an 84-mutant script", "a 72-mutant script"],
    ["mutants killed", "84 of 84 killed", "72 of 72 killed"],
    ["mutants reverted", "reverts 84 of the review fixes", "reverts 72 of the review fixes"],
    ["properties", "63 fast-check properties", "59 fast-check properties"],
    ["player KB", "is 12.0 KB gzipped", "is 11.0 KB gzipped"],
    ["lesson file", "about 185 KB", "about 150 KB"],
  ];
  for (const [what, from, to] of drifts) {
    it(`TASK-32g: a temp copy with a wrong ${what} goes red with a clear line, and --fix puts it right`, () => {
      const dir = mkdtempSync(path.join(os.tmpdir(), "writeup-"));
      try {
        const file = path.join(dir, "DEVPOST_WRITEUP.md");
        writeFileSync(file, good.replace(from, to), "utf8");
        const copy = readFileSync(file, "utf8");
        expect(copy).toContain(to);
        const bad = compareWriteup(copy, truth).filter((c) => !c.ok);
        expect(bad.length, what).toBeGreaterThan(0);
        for (const c of bad) expect(c.name.startsWith("write-up "), c.name).toBe(true);
        const fixed = applyWriteupFix(copy, truth);
        expect(compareWriteup(fixed, truth).filter((c) => !c.ok)).toEqual([]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }

  it("TASK-32g: a write-up that stops stating a number is flagged too", () => {
    const missing = good.replace("63 fast-check properties", "many fast-check properties");
    expect(compareWriteup(missing, truth).some((c) => !c.ok && c.name === "write-up properties")).toBe(true);
  });

  it("TASK-32g: the counters read what they claim to read", () => {
    // (built from pieces so this file's own source doesn't count as properties)
    const p = "fc." + "property(";
    const ap = "fc." + "asyncProperty(";
    expect(countProperties([`fc.assert(${p}a, b))`, `${ap}x) ${p}y)`])).toBe(3);
    expect(countMutants('const MUTANTS = [\n  {\n    name: "a",\n  },\n  {\n    name: "b",\n  },\n];')).toBe(2);
    expect(parseTraceCount("check-task-trace: 109 of 109 spec task ids are named in a test title")).toEqual({ traced: 109, total: 109 });
    expect(parseTraceCount("nothing")).toBeNull();
    // the real files
    expect(countMutants(read("scripts/mutation-check.ts"))).toBeGreaterThan(80);
  });

  it("TASK-32g: check:claims reads docs/DEVPOST_WRITEUP.md (the write-up is no longer ../WRITEUP_DRAFT.md)", () => {
    const src = read("scripts/check-claims.ts");
    expect(src).toContain('path.join(ROOT, "docs", "DEVPOST_WRITEUP.md")');
    expect(src).toContain("compareWriteup(readFileSync(WRITEUP");
    expect(existsSync(path.join(process.cwd(), "docs/DEVPOST_WRITEUP.md"))).toBe(true);
  });
});

describe("TASK-32h: the write-up's Where it sits is the coordinator's current text", () => {
  const writeup = read("docs/DEVPOST_WRITEUP.md");
  const section = writeup.slice(writeup.indexOf("## Where it sits"), writeup.indexOf("## How we built it"));
  it("TASK-32h: the two current paragraphs, verbatim; the old Decker paragraph and the closing sentence are gone", () => {
    const paras = section.split("\n").filter((l) => l.trim().length > 0 && !l.startsWith("##"));
    expect(paras).toHaveLength(2);
    expect(paras[0]!.startsWith("Other Kiroween 2026 entries revive HyperCard's editor too, and at least one also builds a stack from a description.")).toBe(true);
    expect(paras[0]).toContain("Caramel, made by two teachers, turns a subject, level and objective into H5P activities that need a host or Lumi.");
    expect(paras[1]!.startsWith("Decker revives HyperCard's decks")).toBe(true);
    expect(paras[1]!.endsWith("and nothing in them checks that the class can't get stuck.")).toBe(true);
    expect(writeup).not.toContain("Decker already keeps its editor inside an exported HTML deck.");
    expect(writeup).not.toContain("Stackyard joins these:");
  });
});

describe("TASK-32h: a / an before a number", () => {
  it("TASK-32h: articleFor follows how the number is spoken", () => {
    for (const n of [8, 11, 18, 80, 86, 89, 800, 899, 8000, 8999, 11000, 18000, 80000, 86000]) expect(articleFor(n), String(n)).toBe("an");
    for (const n of [1, 7, 9, 10, 12, 17, 19, 72, 79, 90, 100, 108, 111, 180, 1000, 1100, 1800, 9000, 12000]) expect(articleFor(n), String(n)).toBe("a");
  });

  const truth: WriteupNumbers = { traced: 109, tests: 1180, mutants: 86, properties: 63, kb: 12.0, fileKb: 190, floppy: 7 };
  const text = (article: string, n: number): string =>
    [
      "The commit we submit reports 109 of 109 and 1,180 tests; a generated lesson file is now about 185 KB.",
      "(109 of 109 by `npm run check:trace`) (109 of 109 appear in test titles) | 109 of 109 lettered task ids traced",
      `${article} ${n}-mutant script (\`npm run check:mutants\`, ${n} of ${n} killed) that reverts ${n} of the review fixes`,
      "63 fast-check properties. The bundle is 12.0 KB gzipped.",
      "7 lesson files like the water-cycle test deck fit on a 1.44 MB floppy.",
    ].join("\n");

  it("TASK-32h: the pattern accepts 'a' and 'an'; the wrong one for the number is a drift with a clear line", () => {
    expect(compareWriteup(text("an", 86), truth).filter((c) => !c.ok)).toEqual([]);
    const bad = compareWriteup(text("a", 86), truth).filter((c) => !c.ok);
    expect(bad.map((c) => c.name)).toEqual(["write-up mutants (N-mutant script) article"]);
    expect(bad[0]!.claimed).toBe("a 86");
    expect(bad[0]!.actual).toBe("an 86");
  });

  it("TASK-32h: --fix writes the right article for the number ('a 86' → 'an 86', 'an 72' → 'a 72')", () => {
    expect(applyWriteupFix(text("a", 86), truth)).toContain("an 86-mutant script");
    expect(applyWriteupFix(text("a", 72), truth)).toContain("an 86-mutant script");
    const seventyTwo = { ...truth, mutants: 72 };
    const fixed = applyWriteupFix(text("an", 86), seventyTwo);
    expect(fixed).toContain("a 72-mutant script");
    expect(fixed).not.toContain("an 72");
    expect(compareWriteup(fixed, seventyTwo).filter((c) => !c.ok)).toEqual([]);
  });

  it("TASK-32h: the write-up says 'an 86-mutant script'", () => {
    expect(read("docs/DEVPOST_WRITEUP.md")).toMatch(/\ban \d+-mutant script/);
    expect(read("docs/DEVPOST_WRITEUP.md")).not.toMatch(/\ba 8\d-mutant script/);
  });
});
