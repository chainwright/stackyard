// scripts/check-claims.ts
// README claim checker (TASK-23 b; `--fix` and the build-command check added in
// TASK-26l): assert the numbers the README states in its "By the numbers" block
// match reality, so the docs can't quietly drift. Run by the `pre-submit` hook,
// by CI, and directly as `npm run check:claims`.
//
// Checks:
//   - Tests: the README figure vs the real Vitest total (`vitest run`).
//   - Player bundle gzipped KB: README vs gzip(dist/player/player.iife.js),
//     within a small tolerance.
//   - Stack invariants: README vs the numbered invariant comments in
//     src/shared/validator.ts.
//   - Round-trip property runs: README vs the `numRuns` in the round-trip test.
//   - Build command: every `npm ci && npm run build:…` chain in the README is
//     exactly render.yaml's buildCommand (it once described a build that no
//     longer matched what Render runs).
//   - (TASK-32g) docs/DEVPOST_WRITEUP.md: traced ids vs `check:trace`, tests,
//     mutants vs the entries in scripts/mutation-check.ts, fast-check
//     properties vs a count of fc.property / fc.asyncProperty in tests/, player
//     KB, and "about N KB" vs a living export of the water-cycle fixture (±10 %).
//   - (TASK-33b) The floppy count in both files: floor(1,457,664 / bytes of
//     that same living export), exact (scripts/lesson-size.ts measures it).
//   - (TASK-33c7) Once bench/results.json exists: the curriculum-bench line in
//     both files ("N of 55 … first try; M passed our lesson check …"), with its
//     "not a classroom study"; before then, neither file may carry it.
//     (TASK-33c14: "our automatic lesson check", plus the mechanical note.)
//   - (TASK-33c16) Once bench/key-review.json exists: the key-review line in
//     both files, against totals recomputed from its per-card verdicts.
//
// Exits 0 when every claim matches, 1 (with a report) when any has drifted.
//
//   node --import tsx/esm scripts/check-claims.ts          # check
//   node --import tsx/esm scripts/check-claims.ts --fix    # rewrite the README
//                                                          # from MEASURED values
//
// `--fix` never invents a number: it only writes what it just measured, and it
// refuses to write at all if the test run did not pass cleanly.

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readClaims,
  applyFix,
  compare,
  renderBuildCommand,
  readmeBuildCommandsMatch,
  fixBuildCommands,
  type Numbers,
  parseTestTotal,
  compareWriteup,
  applyWriteupFix,
  countProperties,
  countMutants,
  parseTraceCount,
  floppyCount,
  fixFloppyClaim,
  compareFloppy,
  compareBench,
  fixBench,
  readmeBenchLine,
  writeupBenchLine,
  README_BENCH_ANCHOR,
  WRITEUP_BENCH_ANCHOR,
  type BenchNumbers,
  compareKeyReview,
  fixKeyReview,
  keyReviewTotals,
  type KeyNumbers,
  type KeyReview,
  compareA11y,
  fixA11y,
  writeupA11yLine,
  a11yFromReport,
  type A11yNumbers,
  compareJoke,
  fixJoke,
  jokeFromReviews,
  type JokeNumbers,
  type WriteupNumbers,
} from "./claims-lib.js";
import { fixtureLivingExportBytes } from "./lesson-size.js";

const AXE_REPORT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs", "accessibility", "axe-report.json");

/** The joke-answer line's numbers from the LATEST distractor review (v4, else v3), or null while there is none (TASK-34a6, a9). */
function jokeNumbers(): JokeNumbers | null {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "bench");
  const latest = ["v4", "v3"].find((v) => existsSync(path.join(dir, `distractor-review-${v}.json`)));
  if (latest === undefined) return null;
  return jokeFromReviews(
    JSON.parse(readFileSync(path.join(dir, "distractor-review.json"), "utf8")),
    JSON.parse(readFileSync(path.join(dir, `distractor-review-${latest}.json`), "utf8")),
    latest,
  );
}

/** The accessibility line's numbers, or null while the axe report does not exist (TASK-33d6). */
function a11yNumbers(): A11yNumbers | null {
  if (!existsSync(AXE_REPORT)) return null;
  return a11yFromReport(JSON.parse(readFileSync(AXE_REPORT, "utf8")) as Parameters<typeof a11yFromReport>[0]);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const README = path.join(ROOT, "README.md");
const WRITEUP = path.join(ROOT, "docs", "DEVPOST_WRITEUP.md");
const BENCH_RESULTS = path.join(ROOT, "bench", "results.json");
const KEY_REVIEW = path.join(ROOT, "bench", "key-review.json");

/** The key-review totals, recomputed from the verdicts, or null while bench/key-review.json does not exist (TASK-33c16). */
function keyNumbers(): KeyNumbers | null {
  if (!existsSync(KEY_REVIEW)) return null;
  return keyReviewTotals(JSON.parse(readFileSync(KEY_REVIEW, "utf8")) as KeyReview);
}

/** The bench line's numbers from bench/results.json, or null while it does not exist (TASK-33c7). */
function benchNumbers(): BenchNumbers | null {
  if (!existsSync(BENCH_RESULTS)) return null;
  const s = (JSON.parse(readFileSync(BENCH_RESULTS, "utf8")) as { summary: BenchNumbers }).summary;
  return { objectives: s.objectives, firstTry: s.firstTry, lessonClean: s.lessonClean };
}
const PLAYER = path.join(ROOT, "dist", "player", "player.iife.js");
const VALIDATOR = path.join(ROOT, "src", "shared", "validator.ts");
const ROUNDTRIP = path.join(ROOT, "tests", "roundtrip.property.test.ts");
const RENDER_YAML = path.join(ROOT, "render.yaml");

/** Real test total from a single `vitest run` (null = could not parse). */
function actualTestTotal(): number | null {
  let out: string;
  const env = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };
  try {
    out = execFileSync("npx", ["vitest", "run", "--reporter=basic", "--no-color"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });
  } catch (err) {
    // vitest exits non-zero on test failure; still parse its output.
    out = String((err as { stdout?: string }).stdout ?? "");
  }
  return parseTestTotal(out);
}

/** Real player gzipped size in KB (2 dp). */
function actualPlayerKb(): number {
  if (!existsSync(PLAYER)) return -1;
  const gz = gzipSync(readFileSync(PLAYER));
  return Math.round((gz.byteLength / 1024) * 100) / 100;
}

/** Count numbered invariant comments ("// 1.", "// 2.", …) in the validator. */
function actualInvariants(): number {
  const text = readFileSync(VALIDATOR, "utf8");
  const nums = new Set<number>();
  for (const m of text.matchAll(/^\s*\/\/\s*(\d+)\.\s/gm)) nums.add(Number(m[1]));
  return nums.size;
}

/** The numRuns of the round-trip property test. */
function actualRoundtripRuns(): number {
  const text = readFileSync(ROUNDTRIP, "utf8");
  const m = /numRuns:\s*(\d+)/.exec(text);
  return m ? Number(m[1]) : -1;
}

function main(): Promise<void> {
  return run();
}

async function run(): Promise<void> {
  const fix = process.argv.includes("--fix");
  const readme = readFileSync(README, "utf8");
  const claimed = readClaims(readme);
  if (claimed === null) {
    console.error("check-claims: could not find the README 'By the numbers' block.");
    process.exit(1);
  }

  const measuredTests = actualTestTotal();
  if (measuredTests === null) {
    console.error(
      "check-claims: could not parse the test total from Vitest's output. " +
        "That is a tooling problem, not README drift — run `npx vitest run` and look at the summary line.",
    );
    process.exit(1);
  }
  const actual: Numbers = {
    tests: measuredTests,
    kb: actualPlayerKb(),
    invariants: actualInvariants(),
    runs: actualRoundtripRuns(),
  };

  const renderCmd = existsSync(RENDER_YAML) ? renderBuildCommand(readFileSync(RENDER_YAML, "utf8")) : null;
  // TASK-33b: one living export of the water-cycle fixture backs "about N KB"
  // and the floppy count in both files.
  const file = await lessonFileNumbers();
  // TASK-33c7: the bench line is required only once bench/results.json exists.
  const bench = benchNumbers();
  // TASK-33c16: the key-review line is required only once bench/key-review.json exists.
  const keys = keyNumbers();
  // TASK-33d6: the accessibility line, once docs/accessibility/axe-report.json exists.
  const a11y = a11yNumbers();
  const jokes = jokeNumbers();

  if (fix) {
    if (actual.tests < 0 || actual.kb <= 0 || actual.invariants <= 0 || actual.runs <= 0 || file.floppy <= 0) {
      console.error(
        "check-claims --fix: could not measure every number (are the tests failing, or is the player not built?). " +
          "Not touching the README.",
      );
      process.exit(1);
    }
    let fixed = applyFix(readme, actual);
    fixed = fixFloppyClaim(fixed, file.floppy);
    if (bench !== null) fixed = fixBench(fixed, bench, README_BENCH_ANCHOR, readmeBenchLine);
    if (keys !== null) fixed = fixKeyReview(fixed, keys);
    if (jokes !== null) fixed = fixJoke(fixed, jokes);
    if (a11y !== null) fixed = fixA11y(fixed, a11y);
    if (renderCmd !== null) fixed = fixBuildCommands(fixed, renderCmd);
    if (fixed !== readme) {
      writeFileSync(README, fixed, "utf8");
      console.log("check-claims --fix: README rewritten from measured values.");
    } else {
      console.log("check-claims --fix: README already matches; nothing to change.");
    }
  }

  const text = fix ? readFileSync(README, "utf8") : readme;
  const nowClaimed = readClaims(text)!;
  const checks = compare(nowClaimed, actual);
  checks.push(compareFloppy(text, file.floppy));
  checks.push(...compareBench(text, "README", bench));
  checks.push(...compareKeyReview(text, "README", keys));
  checks.push(...compareJoke(text, "README", jokes));
  checks.push(...compareA11y(text, "README", a11y));
  if (renderCmd !== null) {
    const ok = readmeBuildCommandsMatch(text, renderCmd);
    checks.push({
      name: "build command",
      claimed: ok ? renderCmd : "(README differs from render.yaml)",
      actual: renderCmd,
      ok,
    });
  }

  // TASK-32g: the Devpost write-up is checked (and fixed) like the README.
  const writeupActual = await measureWriteupNumbers(actual, file);
  if (fix) {
    const before = readFileSync(WRITEUP, "utf8");
    if (writeupActual.traced <= 0 || writeupActual.fileKb <= 0) {
      console.error("check-claims --fix: could not measure the write-up's numbers; not touching docs/DEVPOST_WRITEUP.md.");
      process.exit(1);
    }
    let after = applyWriteupFix(before, writeupActual);
    if (bench !== null) after = fixBench(after, bench, WRITEUP_BENCH_ANCHOR, writeupBenchLine);
    if (keys !== null) after = fixKeyReview(after, keys);
    if (jokes !== null) after = fixJoke(after, jokes);
    if (a11y !== null) after = fixA11y(after, a11y, writeupA11yLine);
    if (after !== before) {
      writeFileSync(WRITEUP, after, "utf8");
      console.log("check-claims --fix: docs/DEVPOST_WRITEUP.md rewritten from measured values.");
    }
  }
  checks.push(...compareWriteup(readFileSync(WRITEUP, "utf8"), writeupActual));
  checks.push(...compareBench(readFileSync(WRITEUP, "utf8"), "write-up", bench));
  checks.push(...compareKeyReview(readFileSync(WRITEUP, "utf8"), "write-up", keys));
  checks.push(...compareJoke(readFileSync(WRITEUP, "utf8"), "write-up", jokes));
  checks.push(...compareA11y(readFileSync(WRITEUP, "utf8"), "write-up", a11y));

  let failed = false;
  for (const c of checks) {
    const mark = c.ok ? "OK " : "DRIFT";
    const note = c.note ? ` (${c.note})` : "";
    const where = c.name.startsWith("write-up ") ? "DEVPOST_WRITEUP" : "README";
    console.log(`  [${mark}] ${c.name}: ${where} ${c.claimed} vs actual ${c.actual}${note}`);
    if (!c.ok) failed = true;
  }

  if (failed) {
    console.error(
      "check-claims: a README or write-up number has drifted from reality." +
        (fix ? "" : " Run `npm run check:claims -- --fix` to rewrite them from measured values."),
    );
    process.exit(1);
  }
  console.log("check-claims: OK — every README and write-up number matches the code.");
}

/** The numbers docs/DEVPOST_WRITEUP.md is checked against (TASK-32g). */
async function measureWriteupNumbers(readme: Numbers, file: { fileKb: number; floppy: number }): Promise<WriteupNumbers> {
  let traceOut = "";
  try {
    traceOut = execFileSync("node", ["--import", "tsx/esm", path.join(ROOT, "scripts", "check-task-trace.ts")], {
      cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    traceOut = String((err as { stdout?: string }).stdout ?? "");
  }
  const trace = parseTraceCount(traceOut);
  const testSources: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.ts$/.test(e.name)) testSources.push(readFileSync(p, "utf8"));
    }
  };
  walk(path.join(ROOT, "tests"));
  return {
    traced: trace !== null && trace.traced === trace.total ? trace.traced : -1,
    tests: readme.tests,
    mutants: countMutants(readFileSync(path.join(ROOT, "scripts", "mutation-check.ts"), "utf8")),
    properties: countProperties(testSources),
    kb: readme.kb,
    ...file,
  };
}

/** A living export of a fixed generated-shape deck (the water-cycle fixture): KB and the floppy count. */
async function lessonFileNumbers(): Promise<{ fileKb: number; floppy: number }> {
  const bytes = await fixtureLivingExportBytes();
  if (bytes <= 0) return { fileKb: -1, floppy: -1 };
  return { fileKb: Math.round(bytes / 1024), floppy: floppyCount(bytes) };
}

main().catch((err) => {
  console.error("check-claims:", err instanceof Error ? err.message : err);
  process.exit(1);
});
