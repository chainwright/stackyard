// scripts/check-claims.ts
// README claim checker (TASK-23 b): assert the numbers the README states in its
// "By the numbers" block match reality, so the docs can't quietly drift. Run by
// the `pre-submit` hook and directly as `npm run check:claims`.
//
// Checks:
//   - Tests: the README figure vs the real Vitest total (`vitest run`).
//   - Player bundle gzipped KB: README vs gzip(dist/player/player.iife.js),
//     within a small tolerance.
//   - Stack invariants: README vs the numbered invariant comments in
//     src/shared/validator.ts.
//   - Round-trip property runs: README vs the `numRuns` in the round-trip test.
//
// Exits 0 when every claim matches, 1 (with a report) when any has drifted.
//
//   node --import tsx/esm scripts/check-claims.ts

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const README = path.join(ROOT, "README.md");
const PLAYER = path.join(ROOT, "dist", "player", "player.iife.js");
const VALIDATOR = path.join(ROOT, "src", "shared", "validator.ts");
const ROUNDTRIP = path.join(ROOT, "tests", "roundtrip.property.test.ts");

interface Check {
  name: string;
  claimed: number;
  actual: number;
  ok: boolean;
  note?: string;
}

/** Pull the first integer (commas allowed) after a label from the README. */
function readmeNumber(label: RegExp): number | null {
  const text = readFileSync(README, "utf8");
  const m = label.exec(text);
  if (!m) return null;
  const n = Number(m[1]!.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

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
  const checks: Check[] = [];

  const claimedTests = readmeNumber(/Tests:\s*\*\*([\d,]+)\*\*/);
  const claimedKb = readmeNumber(/Player bundle:\s*\*\*([\d.]+)\s*KB\*\*/);
  const claimedInvariants = readmeNumber(/Stack invariants:\s*\*\*(\d+)\*\*/);
  const claimedRuns = readmeNumber(/property test:\s*\*\*([\d,]+)\*\*/);

  if (claimedTests === null || claimedKb === null || claimedInvariants === null || claimedRuns === null) {
    console.error("check-claims: could not find the README 'By the numbers' block.");
    process.exit(1);
  }

  const testTotal = actualTestTotal();
  checks.push({ name: "tests", claimed: claimedTests, actual: testTotal, ok: testTotal === claimedTests });

  const kb = actualPlayerKb();
  // Gzip output varies a touch across zlib versions; allow ±0.5 KB.
  const kbOk = kb > 0 && Math.abs(kb - claimedKb) <= 0.5;
  checks.push({ name: "player KB (gzip)", claimed: claimedKb, actual: kb, ok: kbOk, note: "±0.5 KB" });

  const inv = actualInvariants();
  checks.push({ name: "invariants", claimed: claimedInvariants, actual: inv, ok: inv === claimedInvariants });

  const runs = actualRoundtripRuns();
  checks.push({ name: "round-trip runs", claimed: claimedRuns, actual: runs, ok: runs === claimedRuns });

  let failed = false;
  for (const c of checks) {
    const mark = c.ok ? "OK " : "DRIFT";
    const note = c.note ? ` (${c.note})` : "";
    console.log(`  [${mark}] ${c.name}: README ${c.claimed} vs actual ${c.actual}${note}`);
    if (!c.ok) failed = true;
  }

  if (failed) {
    console.error("check-claims: a README number has drifted from reality.");
    process.exit(1);
  }
  console.log("check-claims: OK — every README number matches the code.");
}

main();
