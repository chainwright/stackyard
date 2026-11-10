// scripts/mutation-log.ts
// TASK-37a: `npm run check:mutants:log`. Runs the same mutation check
// (scripts/mutation-check.ts; its output still goes to the console) and, ONLY
// if it exits 0, writes docs/mutation-runs/<UTC date>-<short HEAD sha>.log:
// the UTC date-time, the full HEAD, whether the working tree was clean, the
// node version, the sha256 of scripts/mutation-check.ts, every KILLED line and
// the final "mutation-check: N of N mutants killed." line. check:claims
// compares the write-up's mutant count against the newest log.
//
//   npm run check:mutants:log   (takes several minutes)

import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatMutationLog } from "./claims-lib.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = path.join(ROOT, "scripts", "mutation-check.ts");
const git = (...args: string[]): string => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const sha256 = (): string => createHash("sha256").update(readFileSync(CHECK)).digest("hex");

async function main(): Promise<void> {
  const date = new Date().toISOString();
  const head = git("rev-parse", "HEAD");
  const clean = git("status", "--porcelain").length === 0;
  const before = sha256();

  let output = "";
  const status = await new Promise<number>((resolve) => {
    const child = spawn("node", ["--import", "tsx/esm", CHECK, ...process.argv.slice(2)], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (d: Buffer) => { output += d.toString(); process.stdout.write(d); });
    child.stderr.on("data", (d: Buffer) => { output += d.toString(); process.stderr.write(d); });
    child.on("close", (code) => resolve(code ?? 1));
  });
  if (status !== 0) {
    console.error(`check:mutants:log: the mutation check exited ${status}; no log written.`);
    process.exit(status);
  }
  if (process.argv.slice(2).some((a) => !a.startsWith("-"))) {
    console.error("check:mutants:log: a filtered run is not a full run; no log written.");
    process.exit(1);
  }
  if (sha256() !== before) {
    console.error("check:mutants:log: scripts/mutation-check.ts changed during the run; no log written.");
    process.exit(1);
  }
  const text = formatMutationLog({ date, head, clean, node: process.version, sha256: before }, output);
  const dir = path.join(ROOT, "docs", "mutation-runs");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${date.slice(0, 10)}-${head.slice(0, 7)}.log`);
  writeFileSync(file, text, "utf8");
  console.log(`check:mutants:log: wrote ${path.relative(ROOT, file)} (working tree ${clean ? "clean" : "NOT clean"}).`);
}

main().catch((err) => {
  console.error("check:mutants:log:", err instanceof Error ? err.message : err);
  process.exit(1);
});
