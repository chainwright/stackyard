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
//
// Exits 0 when every claim matches, 1 (with a report) when any has drifted.
//
//   node --import tsx/esm scripts/check-claims.ts          # check
//   node --import tsx/esm scripts/check-claims.ts --fix    # rewrite the README
//                                                          # from MEASURED values
//
// `--fix` never invents a number: it only writes what it just measured, and it
// refuses to write at all if the test run did not pass cleanly.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
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
} from "./claims-lib.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const README = path.join(ROOT, "README.md");
const PLAYER = path.join(ROOT, "dist", "player", "player.iife.js");
const VALIDATOR = path.join(ROOT, "src", "shared", "validator.ts");
const ROUNDTRIP = path.join(ROOT, "tests", "roundtrip.property.test.ts");
const RENDER_YAML = path.join(ROOT, "render.yaml");

/** Real test total from a single `vitest run`. */
function actualTestTotal(): number {
  // Parse the summary line "Tests  N passed (N)".
  let out: string;
  try {
    out = execFileSync("npx", ["vitest", "run", "--reporter=basic"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    // vitest exits non-zero on test failure; still parse its output.
    out = String((err as { stdout?: string }).stdout ?? "");
  }
  const m = /Tests\s+(\d+)\s+passed/.exec(out);
  return m ? Number(m[1]) : -1;
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

function main(): void {
  const fix = process.argv.includes("--fix");
  const readme = readFileSync(README, "utf8");
  const claimed = readClaims(readme);
  if (claimed === null) {
    console.error("check-claims: could not find the README 'By the numbers' block.");
    process.exit(1);
  }

  const actual: Numbers = {
    tests: actualTestTotal(),
    kb: actualPlayerKb(),
    invariants: actualInvariants(),
    runs: actualRoundtripRuns(),
  };

  const renderCmd = existsSync(RENDER_YAML) ? renderBuildCommand(readFileSync(RENDER_YAML, "utf8")) : null;

  if (fix) {
    if (actual.tests < 0 || actual.kb <= 0 || actual.invariants <= 0 || actual.runs <= 0) {
      console.error(
        "check-claims --fix: could not measure every number (are the tests failing, or is the player not built?). " +
          "Not touching the README.",
      );
      process.exit(1);
    }
    let fixed = applyFix(readme, actual);
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
  if (renderCmd !== null) {
    const ok = readmeBuildCommandsMatch(text, renderCmd);
    checks.push({
      name: "build command",
      claimed: ok ? renderCmd : "(README differs from render.yaml)",
      actual: renderCmd,
      ok,
    });
  }

  let failed = false;
  for (const c of checks) {
    const mark = c.ok ? "OK " : "DRIFT";
    const note = c.note ? ` (${c.note})` : "";
    console.log(`  [${mark}] ${c.name}: README ${c.claimed} vs actual ${c.actual}${note}`);
    if (!c.ok) failed = true;
  }

  if (failed) {
    console.error(
      "check-claims: a README number has drifted from reality." +
        (fix ? "" : " Run `npm run check:claims -- --fix` to rewrite them from measured values."),
    );
    process.exit(1);
  }
  console.log("check-claims: OK — every README number matches the code.");
}

main();
