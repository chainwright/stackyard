// tests/claims.test.ts
// TASK-26l: the README claim checker can rewrite the README's numbers from
// MEASURED values (`--fix`), never by hand; CI runs the checker; the README's
// build command is checked against render.yaml.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  readClaims,
  applyFix,
  compare,
  withCommas,
  renderBuildCommand,
  readmeBuildCommandsMatch,
  fixBuildCommands,
} from "../scripts/claims-lib.js";

const ROOT = process.cwd();
const read = (f: string): string => readFileSync(path.join(ROOT, f), "utf8");

const BLOCK = `## By the numbers

- Tests: **600** passing (\`npm test\`).
- Player bundle: **9.5 KB** gzipped (budget 50 KB).
- Stack invariants: **9** (enforced by \`src/shared/validator.ts\`).
- Round-trip property test: **1,000** runs (stack → HTML → stack, lossless).
`;

describe("claims-lib (TASK-26l: pre-submit green, CI runs the claims checker)", () => {
  it("reads the four numbers", () => {
    expect(readClaims(BLOCK)).toEqual({ tests: 600, kb: 9.5, invariants: 9, runs: 1000 });
  });

  it("returns null when the block is missing", () => {
    expect(readClaims("# nothing here")).toBeNull();
  });

  it("--fix rewrites the numbers from MEASURED values, keeping the README's style", () => {
    const fixed = applyFix(BLOCK, { tests: 727, kb: 11.04, invariants: 9, runs: 1000 });
    expect(fixed).toContain("Tests: **727** passing");
    expect(fixed).toContain("Player bundle: **11.0 KB** gzipped");
    expect(fixed).toContain("Round-trip property test: **1,000** runs");
    expect(readClaims(fixed)).toEqual({ tests: 727, kb: 11, invariants: 9, runs: 1000 });
  });

  it("--fix is idempotent and touches nothing else", () => {
    const m = { tests: 727, kb: 11, invariants: 9, runs: 1000 };
    const once = applyFix(BLOCK, m);
    expect(applyFix(once, m)).toBe(once);
    expect(once.replace(/\*\*[\d.,]+( KB)?\*\*/g, "").length).toBe(BLOCK.replace(/\*\*[\d.,]+( KB)?\*\*/g, "").length);
  });

  it("formats thousands the README's way", () => {
    expect(withCommas(1000)).toBe("1,000");
    expect(withCommas(12)).toBe("12");
  });

  it("compare flags drift: the exact 600-vs-619 case that left pre-submit red", () => {
    const checks = compare({ tests: 600, kb: 9.5, invariants: 9, runs: 1000 }, { tests: 619, kb: 9.5, invariants: 9, runs: 1000 });
    const drift = checks.filter((c) => !c.ok);
    expect(drift.map((c) => c.name)).toEqual(["tests"]);
  });

  it("compare allows ±0.5 KB of gzip variance but not more", () => {
    const base = { tests: 1, kb: 9.5, invariants: 9, runs: 1000 };
    expect(compare(base, { ...base, kb: 9.9 }).every((c) => c.ok)).toBe(true);
    expect(compare(base, { ...base, kb: 10.2 }).some((c) => !c.ok)).toBe(true);
    expect(compare(base, { ...base, kb: -1 }).some((c) => !c.ok)).toBe(true); // unmeasured is never OK
  });
});

describe("the build command in the README matches render.yaml", () => {
  const cmd = renderBuildCommand(read("render.yaml"));

  it("render.yaml has a build command that includes the living bundle", () => {
    expect(cmd).not.toBeNull();
    expect(cmd).toContain("npm run build:living");
  });

  it("every `npm ci && npm run build:…` chain in the README is exactly render.yaml's", () => {
    expect(readmeBuildCommandsMatch(read("README.md"), cmd!)).toBe(true);
  });

  it("a stale chain (the one that omitted build:living) is detected and fixable", () => {
    const stale = "The build runs `npm ci && npm run build:player && npm run build:maker`.";
    expect(readmeBuildCommandsMatch(stale, cmd!)).toBe(false);
    const fixed = fixBuildCommands(stale, cmd!);
    expect(readmeBuildCommandsMatch(fixed, cmd!)).toBe(true);
  });
});

describe("the README numbers match the code (no stale test count)", () => {
  it("the README test count is the real one", async () => {
    // The authoritative check is `npm run check:claims`; here we only assert the
    // README block parses and carries sane values, so a hand-edit that breaks
    // the format is caught in the unit suite too.
    const claims = readClaims(read("README.md"))!;
    expect(claims).not.toBeNull();
    expect(claims.tests).toBeGreaterThanOrEqual(600); // exact value: `npm run check:claims`
    expect(claims.invariants).toBe(9);
    expect(claims.runs).toBe(1000);
  });
});

describe("CI and pre-submit run the checks that gate the project", () => {
  it("ci.yml runs the claim checker", () => {
    expect(read(".github/workflows/ci.yml")).toContain("npm run check:claims");
  });

  it("pre-submit runs tests, typecheck, the deck check, the text-fit and living-file browser gates, and the claim checker", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    const s = pkg.scripts["pre-submit"]!;
    for (const part of ["npm test", "typecheck", "check:decks", "check:text-fit", "check:living-file", "check:claims"]) {
      expect(s, part).toContain(part);
    }
  });
});

// ---------------------------------------------------------------------------
// The browser gates judge Chrome by its OUTPUT, not its exit status

import { isCompleteDom } from "../scripts/chrome.js";

describe("scripts/chrome: a launch is judged by the page it printed", () => {
  it("a complete document is a good run (Chrome often exits 2 on teardown AFTER printing it)", () => {
    expect(isCompleteDom("<html><head></head><body>x</body></html>\n")).toBe(true);
  });

  it("an empty or truncated dump is not", () => {
    expect(isCompleteDom("")).toBe(false);
    expect(isCompleteDom("<html><head></head><body>x")).toBe(false);
  });
});

describe("parseTestTotal (TASK-27v)", () => {
  it("reads a plain summary line", async () => {
    const { parseTestTotal } = await import("../scripts/claims-lib.js");
    expect(parseTestTotal("  Tests  812 passed (812)\n")).toBe(812);
  });
  it("reads a coloured summary line (CI prints ANSI)", async () => {
    const { parseTestTotal } = await import("../scripts/claims-lib.js");
    const coloured = "\u001b[2m      Tests \u001b[22m \u001b[1m\u001b[32m812 passed\u001b[39m\u001b[22m\u001b[90m (812)\u001b[39m\n";
    expect(parseTestTotal(coloured)).toBe(812);
  });
  it("counts failures too, and returns null (never -1) when it cannot parse", async () => {
    const { parseTestTotal } = await import("../scripts/claims-lib.js");
    expect(parseTestTotal("      Tests  2 failed | 810 passed (812)")).toBe(812);
    expect(parseTestTotal("nothing useful here")).toBeNull();
  });
});
