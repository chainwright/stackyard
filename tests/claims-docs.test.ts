// tests/claims-docs.test.ts
// TASK-39f: check:claims reads the judge docs (JUDGES.md, EVIDENCE.md) and every
// "N hook firings". TASK-39g: check:claims checks CLAIMS.md's quotes, lines and
// statuses. The logic lives in scripts/claims-lib.ts; check-claims.ts measures.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  readJudgeClaims,
  compareJudgeDoc,
  applyJudgeFix,
  hookFiringsTotal,
  compareJudgeFilesExist,
  EVIDENCE_REQUIRED,
  JUDGE_FILES,
  type JudgeNumbers,
  parseClaimRows,
  compareClaimsTable,
  fixClaimsTable,
  readBenchClaim,
  readKeyClaim,
  readJokeClaim,
  readA11yClaim,
  compareBench,
  compareKeyReview,
  compareJoke,
  compareA11y,
  type Check,
} from "../scripts/claims-lib.js";

const ROOT = path.resolve(__dirname, "..");
const read = (f: string): string => readFileSync(path.join(ROOT, f), "utf8");

const A: JudgeNumbers = {
  tests: 1443,
  traced: 182,
  invariants: 9,
  properties: 75,
  runs: 1000,
  mutants: 118,
  mutantsLogged: 118,
  kb: 12.8,
  fileKb: 211,
  floppy: 6,
  benchFiles: 54,
  hookFirings: 493,
};

/** One line per phrase, every one correct. */
const ALL = [
  "| 1,443 tests pass |",
  "| 182 of 182 lettered task ids |",
  "| 9 stack invariants |",
  "| 75 fast-check properties |",
  "| 1,000-run round trip |",
  "| 118 of 118 mutants killed |",
  "| 12.8 KB gzipped |",
  "| about 211 KB |",
  "| 6 lesson files like the water-cycle test deck fit on a 1.44 MB floppy |",
  "| 54 bench lesson files, 0 network requests |",
  "| 493 hook firings |",
].join("\n");

const failed = (checks: Check[]): Check[] => checks.filter((c) => !c.ok);

describe("TASK-39f: the judge-doc phrases", () => {
  it("TASK-39f reads each phrase and its number(s)", () => {
    const got = Object.fromEntries(readJudgeClaims(ALL).map((c) => [c.key, c.values]));
    expect(got).toEqual({
      tests: [1443],
      traced: [182, 182],
      invariants: [9],
      properties: [75],
      runs: [1000],
      mutants: [118, 118],
      kb: [12.8],
      fileKb: [211],
      floppy: [6],
      benchFiles: [54],
      hookFirings: [493],
    });
    expect(new Set(EVIDENCE_REQUIRED)).toEqual(new Set(Object.keys(got)));
  });

  it("TASK-39f a document with every phrase correct passes, as EVIDENCE (all required)", () => {
    expect(failed(compareJudgeDoc(ALL, "EVIDENCE", A, EVIDENCE_REQUIRED))).toEqual([]);
  });

  it("TASK-39f a drifted number fails, for each phrase", () => {
    const drifts: Array<[string, string]> = [
      ["1,443 tests pass", "1,442 tests pass"],
      ["182 of 182 lettered", "181 of 182 lettered"],
      ["9 stack invariants", "8 stack invariants"],
      ["75 fast-check", "74 fast-check"],
      ["1,000-run round trip", "500-run round trip"],
      ["118 of 118 mutants", "117 of 117 mutants"],
      ["12.8 KB gzipped", "13.5 KB gzipped"],
      ["about 211 KB", "about 190 KB"],
      ["| 6 lesson files", "| 7 lesson files"],
      ["54 bench lesson files", "55 bench lesson files"],
      ["493 hook firings", "494 hook firings"],
    ];
    for (const [from, to] of drifts) {
      const text = ALL.replace(from, to);
      expect(text).not.toBe(ALL);
      expect(failed(compareJudgeDoc(text, "EVIDENCE", A, EVIDENCE_REQUIRED)).length, to).toBe(1);
    }
  });

  it("TASK-39f the tolerances: player KB ±0.5, the file ±3 % in decimal KB", () => {
    expect(failed(compareJudgeDoc("12.4 KB gzipped", "JUDGES", A))).toEqual([]);
    expect(failed(compareJudgeDoc("12.2 KB gzipped", "JUDGES", A)).length).toBe(1);
    expect(failed(compareJudgeDoc("about 206 KB", "JUDGES", A))).toEqual([]);
    expect(failed(compareJudgeDoc("about 204 KB", "JUDGES", A)).length).toBe(1);
  });

  it("TASK-39f the mutant phrase needs the script AND the newest log to agree", () => {
    expect(failed(compareJudgeDoc("118 of 118 mutants killed", "EVIDENCE", { ...A, mutantsLogged: 117 })).length).toBe(1);
    expect(failed(compareJudgeDoc("118 of 118 mutants killed", "EVIDENCE", { ...A, mutantsLogged: -1 })).length).toBe(1);
  });

  it("TASK-39f a missing required phrase in EVIDENCE fails", () => {
    const text = ALL.split("\n").filter((l) => !l.includes("hook firings")).join("\n");
    const bad = failed(compareJudgeDoc(text, "EVIDENCE", A, EVIDENCE_REQUIRED));
    expect(bad.length).toBe(1);
    expect(bad[0]!.claimed).toBe("(missing)");
  });

  it("TASK-39f JUDGES may omit any phrase, but a phrase it states must be right", () => {
    expect(failed(compareJudgeDoc("Nothing numeric here.", "JUDGES", A))).toEqual([]);
    expect(failed(compareJudgeDoc("npm test  # 1,443 tests pass", "JUDGES", A))).toEqual([]);
    expect(failed(compareJudgeDoc("npm test  # 1,400 tests pass", "JUDGES", A)).length).toBe(1);
  });

  it("TASK-39f the README and write-up are checked for hook firings only", () => {
    const text = "recorded 493 hook firings (5 to 9 Nov); 1,000 tests pass";
    expect(failed(compareJudgeDoc(text, "README", A, [], ["hookFirings"]))).toEqual([]);
    expect(failed(compareJudgeDoc(text.replace("493", "98"), "README", A, [], ["hookFirings"])).length).toBe(1);
    expect(failed(compareJudgeDoc("no count here", "write-up", A, [], ["hookFirings"]))).toEqual([]);
  });

  it("TASK-39f the fix logic rewrites a drifted number from measured values", () => {
    const drifted = ALL.replace("1,443 tests pass", "1,400 tests pass")
      .replace("182 of 182", "170 of 176")
      .replace("about 211 KB", "about 185 KB")
      .replace("493 hook firings", "98 hook firings");
    const fixed = applyJudgeFix(drifted, A);
    expect(fixed).toBe(ALL);
    expect(failed(compareJudgeDoc(fixed, "EVIDENCE", A, EVIDENCE_REQUIRED))).toEqual([]);
  });

  it("TASK-39f the fix logic leaves in-tolerance sizes as written and never invents a number", () => {
    expect(applyJudgeFix("about 207 KB; 12.6 KB gzipped", A)).toBe("about 207 KB; 12.6 KB gzipped");
    const unknown = { ...A, hookFirings: -1, mutantsLogged: 117 };
    expect(applyJudgeFix("98 hook firings; 100 of 100 mutants killed", unknown)).toBe("98 hook firings; 100 of 100 mutants killed");
    expect(applyJudgeFix("1,400 tests pass; 98 hook firings", A, ["hookFirings"])).toBe("1,400 tests pass; 493 hook firings");
  });

  it("TASK-39f the hook-firings total is read from the recount table's Whole session row", () => {
    const sample = [
      "| Window | All | after-shell | on-save |",
      "|---|---|---|---|",
      "| TASK-28 (6 Nov) | **98** | 79 | 12 |",
      "| Whole session (5 Nov 16:07Z to 9 Nov 19:19Z) | **1,234** | 417 | 39 |",
    ].join("\n");
    expect(hookFiringsTotal(sample)).toBe(1234);
    expect(hookFiringsTotal("| Whole session | 493 | 1 |")).toBeNull();
    expect(hookFiringsTotal("no table")).toBeNull();
    // The real recount backs the "493" every doc states.
    expect(hookFiringsTotal(read("docs/kiro-sessions/README.md"))).toBe(493);
  });

  it("TASK-39f a missing judge file fails", () => {
    expect(compareJudgeFilesExist(() => true)).toEqual([]);
    const bad = compareJudgeFilesExist((f) => f !== "CLAIMS.md");
    expect(bad.map((c) => c.name)).toEqual(["CLAIMS.md exists"]);
    for (const f of JUDGE_FILES) expect(existsSync(path.join(ROOT, f)), f).toBe(true);
  });

  it("TASK-39f the real EVIDENCE.md states every phrase and the four content sentences of the write-up", () => {
    const ev = read("EVIDENCE.md");
    const keys = new Set(readJudgeClaims(ev).map((c) => c.key));
    for (const k of EVIDENCE_REQUIRED) expect(keys.has(k), k).toBe(true);
    const w = read("docs/DEVPOST_WRITEUP.md");
    const bench = readBenchClaim(w);
    const key = readKeyClaim(w);
    const joke = readJokeClaim(w);
    const a11y = readA11yClaim(w);
    expect(bench && key && joke && a11y).toBeTruthy();
    // Checked against the write-up's own (gated) numbers, disclaimers included.
    expect(failed(compareBench(ev, "EVIDENCE", bench))).toEqual([]);
    expect(failed(compareKeyReview(ev, "EVIDENCE", key))).toEqual([]);
    expect(failed(compareJoke(ev, "EVIDENCE", joke))).toEqual([]);
    expect(failed(compareA11y(ev, "EVIDENCE", a11y))).toEqual([]);
    // Without a disclaimer the sentence fails.
    expect(failed(compareA11y(ev.replace("No screen-reader user or disabled pupil has tested it.", ""), "EVIDENCE", a11y)).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------

const README_SAMPLE = ["# Title", "", "It plays offline in Chrome.", "Nothing else."].join("\n");
const WRITEUP_SAMPLE = ["# Write-up", "The lesson is one file.", "", "No account is needed."].join("\n");
const FILES = { "README.md": README_SAMPLE, "docs/DEVPOST_WRITEUP.md": WRITEUP_SAMPLE };

function table(rows: string[], pad = 40): string {
  const filler: string[] = [];
  for (let i = rows.length + 1; i <= pad; i++) filler.push(`| C${i} | "said in the blog" | blog | TRUE | by hand |`);
  return ["# Claims", "", "| # | Claim | Where | Status | Proof, or what is missing |", "|---|---|---|---|---|", ...rows, ...filler, ""].join("\n");
}

const GOOD = [
  `| C1 | "plays offline in Chrome" | README.md:3 | TRUE | a gate |`,
  `| C2 | "No account is needed." | docs/DEVPOST_WRITEUP.md:4 | PARTIAL | Missing: a user test. |`,
  `| C3 | "We built it." | blog | TRUE | git log |`,
];

describe("TASK-39g: CLAIMS.md", () => {
  it("TASK-39g parses ids, quotes, refs, statuses and proofs", () => {
    const rows = parseClaimRows(table(GOOD));
    expect(rows.length).toBe(40);
    expect(rows[0]).toMatchObject({ id: "C1", quote: "plays offline in Chrome", refs: [{ file: "README.md", line: 3 }], status: "TRUE", proof: "a gate" });
    expect(rows[1]!.status).toBe("PARTIAL");
    expect(rows[2]!.refs).toEqual([{ file: "blog" }]);
    const both = parseClaimRows(`| C9 | "x" | docs/DEVPOST_WRITEUP.md:2, README.md:3 | TRUE | p |`)[0]!;
    expect(both.refs).toEqual([{ file: "docs/DEVPOST_WRITEUP.md", line: 2 }, { file: "README.md", line: 3 }]);
  });

  it("TASK-39g a correct table passes", () => {
    expect(failed(compareClaimsTable(table(GOOD), FILES))).toEqual([]);
  });

  it("TASK-39g fewer than 40 rows fails", () => {
    expect(failed(compareClaimsTable(table(GOOD, 39), FILES)).map((c) => c.name)).toEqual(["CLAIMS rows"]);
  });

  it("TASK-39g a repeated id fails", () => {
    const rows = [...GOOD, GOOD[0]!.replace("| C1 |", "| C2 |")];
    expect(failed(compareClaimsTable(table(rows), FILES)).map((c) => c.name)).toContain("CLAIMS C2 id");
  });

  it("TASK-39g each of README.md, the write-up and the blog must be cited", () => {
    const noBlog = table([GOOD[0]!, GOOD[1]!], 0);
    const rows = parseClaimRows(noBlog);
    expect(rows.length).toBe(2);
    expect(failed(compareClaimsTable(noBlog, FILES)).map((c) => c.name)).toContain("CLAIMS cites blog");
    const noReadme = table([GOOD[1]!, GOOD[2]!]);
    expect(failed(compareClaimsTable(noReadme, FILES)).map((c) => c.name)).toContain("CLAIMS cites README.md");
  });

  it("TASK-39g a bad status fails", () => {
    for (const s of ["true", "FALSE", "PARTLY", ""]) {
      const rows = [GOOD[0]!.replace("| TRUE |", `| ${s} |`), GOOD[1]!, GOOD[2]!];
      expect(failed(compareClaimsTable(table(rows), FILES)).map((c) => c.name), s).toContain("CLAIMS C1 status");
    }
  });

  it("TASK-39g a PARTIAL without \"Missing:\" fails", () => {
    const rows = [GOOD[0]!, GOOD[1]!.replace("Missing: a user test.", "a user test is missing"), GOOD[2]!];
    expect(failed(compareClaimsTable(table(rows), FILES)).map((c) => c.name)).toEqual(["CLAIMS C2 missing"]);
  });

  it("TASK-39g a quote moved one line fails, and the fix corrects the line number", () => {
    const moved = { ...FILES, "README.md": ["# Title", "", "", "It plays offline in Chrome.", "Nothing else."].join("\n") };
    const t = table(GOOD);
    expect(failed(compareClaimsTable(t, moved)).map((c) => c.name)).toEqual(["CLAIMS C1 quote on README.md:3"]);
    const fixed = fixClaimsTable(t, moved);
    expect(fixed).toContain(`| C1 | "plays offline in Chrome" | README.md:4 | TRUE | a gate |`);
    expect(failed(compareClaimsTable(fixed, moved))).toEqual([]);
    // Only the line number changed.
    expect(fixed.replace("README.md:4", "README.md:3")).toBe(t);
  });

  it("TASK-39g with two refs, only the moved one is rewritten", () => {
    const row = `| C1 | "plays offline in Chrome" | docs/DEVPOST_WRITEUP.md:9, README.md:1 | TRUE | a gate |`;
    const files = { "README.md": README_SAMPLE, "docs/DEVPOST_WRITEUP.md": "a\nb\nIt plays offline in Chrome too." };
    const fixed = fixClaimsTable(table([row, GOOD[1]!, GOOD[2]!]), files);
    expect(fixed).toContain("| docs/DEVPOST_WRITEUP.md:3, README.md:3 |");
  });

  it("TASK-39g a quote that is nowhere fails and is not \"fixed\"", () => {
    const rows = [GOOD[0]!.replace("plays offline in Chrome", "plays offline in every browser"), GOOD[1]!, GOOD[2]!];
    const t = table(rows);
    const bad = failed(compareClaimsTable(t, FILES));
    expect(bad.map((c) => c.name)).toEqual(["CLAIMS C1 quote on README.md:3"]);
    expect(bad[0]!.actual).toBe("(not in README.md)");
    expect(fixClaimsTable(t, FILES)).toBe(t);
  });

  it("TASK-39g a quote on several lines is reported, not guessed", () => {
    const twice = { ...FILES, "README.md": "plays offline in Chrome\nx\nNothing.\nplays offline in Chrome" };
    const t = table(GOOD);
    expect(failed(compareClaimsTable(t, twice)).length).toBe(1);
    expect(fixClaimsTable(t, twice)).toBe(t);
  });

  it("TASK-39g a row with no quote or an unknown file fails", () => {
    const rows = [`| C1 | plays offline | README.md:3 | TRUE | p |`, `| C2 | "x" | NOTES.md:1 | TRUE | p |`, GOOD[1]!, GOOD[2]!];
    const names = failed(compareClaimsTable(table(rows), FILES)).map((c) => c.name);
    expect(names).toContain("CLAIMS C1 quote");
    expect(names).toContain("CLAIMS C2 where");
  });

  it("TASK-39g: TASK-40f: the real CLAIMS.md passes against the real README and write-up", () => {
    const files = { "README.md": read("README.md"), "docs/DEVPOST_WRITEUP.md": read("docs/DEVPOST_WRITEUP.md") };
    const claims = read("CLAIMS.md");
    expect(failed(compareClaimsTable(claims, files))).toEqual([]);
    const rows = parseClaimRows(claims);
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 61 }, (_, i) => `C${i + 1}`));
  });
});
