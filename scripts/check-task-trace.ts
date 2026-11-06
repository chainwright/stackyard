// scripts/check-task-trace.ts
// TASK-28b: every lettered TASK id declared in a spec (.kiro/specs/*/tasks.md,
// e.g. 26b, 27c, 28h, 27z3) must be mentioned by a test, a gate script or a hook.
// The write-up used to say "every task id traced" while 7 were not (J5); now a
// check fails instead, and the docs quote the true count from here.
//
//   node --import tsx/esm scripts/check-task-trace.ts        # exit 1 if any id is untraced
//
// How ids are read
//   Declared: headings `### TASK-27p/q/s/u: …`, `### TASK-27 z3: …`,
//             `### TASK-28t / 28b / 28a: …`, `### TASK-27 z1–z6 …` → 27p 27q 27s 27u,
//             27z3, 28t 28b 28a, 27z1…27z6. Plain numbered tasks (TASK-04, TASK-R3)
//             belong to one spec file each and are not counted.
//   Traced:   a `TASK-<n>` followed on the same line (within 60 characters) by the
//             letter as a word or glued on (`TASK-27c`, `TASK-27 c, j`, `TASK-27b/e/m`).

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".git")) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

/** Expand "z1–z6" → z1..z6; keep "c", "z3". Anything else is not an id. */
function expandToken(tok: string): string[] {
  const range = /^([a-z])(\d)[–-]([a-z])?(\d)$/.exec(tok);
  if (range) {
    const out: string[] = [];
    for (let i = Number(range[2]); i <= Number(range[4]); i++) out.push(`${range[1]}${i}`);
    return out;
  }
  return /^[a-z]\d?$/.test(tok) ? [tok] : [];
}

/** All lettered ids declared in the specs, as "27c", "28h", "27z3". */
export function declaredIds(root: string = ROOT): string[] {
  const ids = new Set<string>();
  for (const spec of readdirSync(path.join(root, ".kiro", "specs"))) {
    const file = path.join(root, ".kiro", "specs", spec, "tasks.md");
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = /^#{3,4}\s+TASK-(\d+)(.*)$/.exec(line);
      if (!m) continue;
      const rest = m[2]!.split(/[:(*—]/)[0]!.trim();
      if (rest.length === 0) continue;
      for (const raw of rest.split(/[\s/,]+/)) {
        const tok = raw.replace(/^\d+/, "");
        for (const letter of expandToken(tok)) ids.add(`${m[1]}${letter}`);
      }
    }
  }
  return [...ids].sort();
}

/** A line that declares a test or suite title (it / describe / test, with .each/.skip/.only). */
const TITLE_LINE = /\b(?:it|describe|test)(?:\.(?:each|skip|only|todo|concurrent))*\s*(?:\(|\[)/;
/** A comment-only line (so a comment never counts as coverage). */
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*|#)/;

/**
 * All ids NAMED by a test title, a gate script's message/name string, or a hook.
 * Counting any mention (a comment, a prose line) let an id look "traced" without
 * a test (J4 P2-2), so: in tests/ only title lines count; in scripts/ and mcp/
 * comment lines do not; hook JSON counts as is.
 */
export function tracedIds(root: string = ROOT): Set<string> {
  const tests = walk(path.join(root, "tests"), [".ts", ".tsx"]);
  const gates = [...walk(path.join(root, "scripts"), [".ts", ".sh"]), ...walk(path.join(root, "mcp"), [".ts"])];
  const hooks = walk(path.join(root, ".kiro", "hooks"), [".json"]);
  const skip = /check-task-trace\.ts$/;

  const seen = new Set<string>();
  const scan = (line: string): void => {
    for (const m of line.matchAll(/TASK-(\d+)/g)) {
      const after = line.slice(m.index! + m[0].length, m.index! + m[0].length + 80);
      // A letter list straight after the number: "TASK-27c", "TASK-27 c, j",
      // "TASK-27b/e/m". A lone spaced letter ("TASK-27 a quiz…") only counts
      // when a ":" ")" or dash follows, so ordinary prose is not read as an id.
      const lead = /^(\s?)([a-z]\d?)((?:\s*[\/,]\s*(?:\d+)?[a-z]\d?)*)(?![A-Za-z0-9])/.exec(after);
      if (lead) {
        const glued = lead[1] === "";
        const listed = lead[3]!.length > 0;
        const closed = /^\s*[:)\]—–-]/.test(after.slice(lead[0].length));
        if (glued || listed || closed) {
          seen.add(`${m[1]}${lead[2]}`);
          for (const t of lead[3]!.matchAll(/(?:\d+)?([a-z]\d?)/g)) seen.add(`${m[1]}${t[1]}`);
        }
      }
      // Ranges such as "z1–z6" → every number between.
      const range = /^\s?([a-z])(\d)[–-]\1?(\d)(?!\d)/.exec(after);
      if (range) {
        for (let i = Number(range[2]); i <= Number(range[3]); i++) seen.add(`${m[1]}${range[1]}${i}`);
      }
    }
  };
  for (const f of tests) {
    if (skip.test(f)) continue;
    for (const line of readFileSync(f, "utf8").split("\n")) if (TITLE_LINE.test(line) && !COMMENT_LINE.test(line)) scan(line);
  }
  for (const f of gates) {
    if (skip.test(f)) continue;
    for (const line of readFileSync(f, "utf8").split("\n")) if (!COMMENT_LINE.test(line)) scan(line);
  }
  for (const f of hooks) for (const line of readFileSync(f, "utf8").split("\n")) scan(line);
  return seen;
}

export function taskTrace(root: string = ROOT): { total: number; traced: number; missing: string[] } {
  const declared = declaredIds(root);
  const seen = tracedIds(root);
  const missing = declared.filter((id) => !seen.has(id));
  return { total: declared.length, traced: declared.length - missing.length, missing };
}

function main(): void {
  const { total, traced, missing } = taskTrace();
  console.log(`check-task-trace: ${traced} of ${total} spec task ids are named in a test title, a gate or a hook.`);
  if (missing.length > 0) {
    console.error(`check-task-trace: untraced — ${missing.map((id) => "TASK-" + id).join(", ")}. Put the id in a test title or a gate.`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
