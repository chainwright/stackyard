// scripts/bench.ts
// The curriculum bench CLI (TASK-33c, .kiro/specs/curriculum-bench/).
//
//   npm run bench                 replay bench/cache/*.json offline (no network,
//                                 deterministic) → bench/files/<id>.html,
//                                 bench/results.json, bench/RESULTS.md
//   npm run bench:record          record each objective once through the REAL
//                                 streaming generator (needs STACKYARD_LLM_*; run
//                                 by us). Skips cached objectives unless --force;
//                                 --only id,id records just those; --only-file
//                                 bench/rerecord.txt records the ids listed there
//                                 (TASK-34a4). At most 3 at once.
//   node … scripts/bench.ts --check
//                                 replay in memory and fail if bench/files or
//                                 bench/results.json differ (stale)
//
// --cache DIR and --out DIR point the replay elsewhere (tests and timing runs).
// The bench measures the generator against curriculum objectives; it is not a
// classroom study and no teacher or pupil was involved.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildResults,
  parseCache,
  recordOne,
  replayOne,
  resultsMarkdown,
  runPool,
  serialiseCache,
  type BenchCache,
  type BenchSummary,
  type DeckResult,
  type Objective,
  type V2Context,
} from "./bench-lib.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BENCH_DIR = path.join(ROOT, "bench");
export const RECORD_PARALLEL = 3;

export function loadObjectives(file = path.join(BENCH_DIR, "objectives.json")): Objective[] {
  return JSON.parse(readFileSync(file, "utf8")) as Objective[];
}

/** Every cache in `dir`, by objective id. A cache for no objective is an error. */
export function loadCaches(dir: string, objectives: Objective[]): Map<string, BenchCache> {
  const out = new Map<string, BenchCache>();
  if (!existsSync(dir)) return out;
  const ids = new Set(objectives.map((o) => o.id));
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
    const c = parseCache(readFileSync(path.join(dir, f), "utf8"), f);
    if (!ids.has(c.id)) throw new Error(`bench: ${f} is not the cache of any objective (its id is ${c.id})`);
    if (out.has(c.id)) throw new Error(`bench: two caches for ${c.id}`);
    out.set(c.id, c);
  }
  return out;
}

export interface Replay {
  recorded: number;
  /** results.json text (null when nothing is recorded). */
  resultsJson: string | null;
  resultsMd: string | null;
  /** file name → living HTML. */
  files: Map<string, string>;
  decks: DeckResult[];
}

/** Replay every cache, in objective order, one at a time. `v1` / `v2` are the kept runs (TASK-33c12, TASK-34a4), shown at the top of RESULTS.md. */
export async function replayAll(objectives: Objective[], caches: Map<string, BenchCache>, v1: BenchSummary | null = null, v2: V2Context | null = null): Promise<Replay> {
  const decks: DeckResult[] = [];
  const files = new Map<string, string>();
  for (const obj of objectives) {
    const cache = caches.get(obj.id);
    if (cache === undefined) continue;
    const { result, html } = await replayOne(obj, cache);
    decks.push(result);
    if (html !== null) files.set(`${obj.id}.html`, html);
  }
  if (decks.length === 0) return { recorded: 0, resultsJson: null, resultsMd: null, files, decks };
  const results = buildResults(objectives.length, decks);
  return { recorded: decks.length, resultsJson: JSON.stringify(results, null, 2) + "\n", resultsMd: resultsMarkdown(results, v1, v2), files, decks };
}

/**
 * bench/rerecord.txt (TASK-34a4): one objective id per line; `#` starts a
 * comment. A line "# v2-recorded-until: <ISO time>" marks when v2's recordings
 * ended, so a cache newer than that counts as re-recorded.
 */
export function parseRerecordFile(text: string): { ids: string[]; v2Until: string | null } {
  const ids: string[] = [];
  let v2Until: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const until = /^#\s*v2-recorded-until:\s*(\S+)/.exec(raw);
    if (until) v2Until = until[1]!;
    const line = raw.replace(/#.*$/, "").trim();
    if (line.length > 0) ids.push(line);
  }
  return { ids, v2Until };
}

/** The v2 context for RESULTS.md, or null when there is no bench/results-v2.json. */
export function loadV2Context(out: string, caches: Map<string, BenchCache>): V2Context | null {
  const p = path.join(out, "results-v2.json");
  if (!existsSync(p)) return null;
  const summary = (JSON.parse(readFileSync(p, "utf8")) as { summary: BenchSummary }).summary;
  const rr = path.join(out, "rerecord.txt");
  const { ids, v2Until } = existsSync(rr) ? parseRerecordFile(readFileSync(rr, "utf8")) : { ids: [], v2Until: null };
  const rerecorded = v2Until === null ? [] : ids.filter((id) => (caches.get(id)?.recordedAt ?? "") > v2Until);
  return { summary, rerecord: ids, rerecorded };
}

/** The v1 summary kept in `<out>/results-v1.json`, or null when there is none (TASK-33c12). */
export function loadV1Summary(out: string): BenchSummary | null {
  const p = path.join(out, "results-v1.json");
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as { summary: BenchSummary }).summary : null;
}

/** Write the replay to `out` (files/, results.json, RESULTS.md), removing what it no longer produces. */
export function writeReplay(out: string, r: Replay): void {
  const filesDir = path.join(out, "files");
  if (existsSync(filesDir)) {
    for (const f of readdirSync(filesDir)) if (f.endsWith(".html") && !r.files.has(f)) rmSync(path.join(filesDir, f));
  }
  if (r.recorded === 0) {
    for (const f of ["results.json", "RESULTS.md"]) rmSync(path.join(out, f), { force: true });
    return;
  }
  mkdirSync(filesDir, { recursive: true });
  for (const [name, html] of r.files) writeFileSync(path.join(filesDir, name), html, "utf8");
  writeFileSync(path.join(out, "results.json"), r.resultsJson!, "utf8");
  writeFileSync(path.join(out, "RESULTS.md"), r.resultsMd!, "utf8");
}

/** What differs between `out` and a fresh replay (empty when fresh). */
export function staleOutputs(out: string, r: Replay): string[] {
  const problems: string[] = [];
  const read = (p: string): string | null => (existsSync(p) ? readFileSync(p, "utf8") : null);
  const filesDir = path.join(out, "files");
  const onDisk = existsSync(filesDir) ? readdirSync(filesDir).filter((f) => f.endsWith(".html")) : [];
  for (const f of onDisk) if (!r.files.has(f)) problems.push(`files/${f} has no recording behind it`);
  for (const [name, html] of r.files) if (read(path.join(filesDir, name)) !== html) problems.push(`files/${name} differs from a fresh replay`);
  if (read(path.join(out, "results.json")) !== r.resultsJson) problems.push(r.resultsJson === null ? "results.json exists but nothing is recorded" : "results.json differs from a fresh replay");
  if (read(path.join(out, "RESULTS.md")) !== r.resultsMd) problems.push(r.resultsMd === null ? "RESULTS.md exists but nothing is recorded" : "RESULTS.md differs from a fresh replay");
  return problems;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function replayMain(check: boolean): Promise<void> {
  const out = path.resolve(arg("--out") ?? BENCH_DIR);
  const cacheDir = path.resolve(arg("--cache") ?? path.join(BENCH_DIR, "cache"));
  const objectives = loadObjectives();
  const t0 = Date.now();
  const caches = loadCaches(cacheDir, objectives);
  const r = await replayAll(objectives, caches, loadV1Summary(out), loadV2Context(out, caches));
  if (check) {
    const problems = staleOutputs(out, r);
    if (problems.length > 0) {
      for (const p of problems) console.error(`bench --check: STALE — ${p}`);
      console.error("bench --check: run `npm run bench` and commit bench/.");
      process.exit(1);
    }
    console.log(
      r.recorded === 0
        ? "bench: 0 recorded — nothing to check (TASK-33c6)."
        : `bench --check: OK — TASK-33c6: ${r.recorded} recorded, bench/files and results match a fresh replay (${Date.now() - t0} ms).`,
    );
    return;
  }
  writeReplay(out, r);
  if (r.recorded === 0) {
    console.log("bench: 0 recorded — bench/cache has no recordings yet, so there is nothing to replay. Run `npm run bench:record` with a model key.");
    return;
  }
  const s = JSON.parse(r.resultsJson!) as { summary: { firstTry: number; lessonClean: number; objectives: number } };
  console.log(
    `bench: ${r.recorded} recorded; ${s.summary.firstTry} of ${s.summary.objectives} valid on the first try; ` +
      `${s.summary.lessonClean} with no lesson warnings; ${r.files.size} files in ${path.relative(ROOT, path.join(out, "files"))}/ (${Date.now() - t0} ms).`,
  );
}

/** The objectives `bench:record` will call the model for: not yet cached (all with `force`), within `only`. */
export function toRecord(objectives: Objective[], cacheDir: string, force: boolean, only?: string[]): Objective[] {
  return objectives
    .filter((o) => only === undefined || only.includes(o.id))
    .filter((o) => force || !existsSync(path.join(cacheDir, `${o.id}.json`)));
}

async function recordMain(): Promise<void> {
  const key = process.env["STACKYARD_LLM_API_KEY"];
  if (key === undefined || key.trim() === "") {
    console.error("bench:record needs STACKYARD_LLM_API_KEY (and the other STACKYARD_LLM_* settings) in the environment. Nothing was recorded.");
    process.exit(1);
  }
  const { callStream, configuredModel, llmThinking } = await import("../server/llmGateway.js");
  const cacheDir = path.resolve(arg("--cache") ?? path.join(BENCH_DIR, "cache"));
  mkdirSync(cacheDir, { recursive: true });
  const force = process.argv.includes("--force");
  const onlyFile = arg("--only-file");
  const only = onlyFile !== undefined
    ? parseRerecordFile(readFileSync(path.resolve(onlyFile), "utf8")).ids
    : arg("--only")?.split(",").map((s) => s.trim()).filter(Boolean);
  const objectives = loadObjectives().filter((o) => only === undefined || only.includes(o.id));
  const queue = toRecord(objectives, cacheDir, force);
  console.log(`bench:record: ${queue.length} to record (${objectives.length - queue.length} already cached), ${RECORD_PARALLEL} at a time, model ${configuredModel()}, thinking ${llmThinking()}.`);
  await runPool(queue, RECORD_PARALLEL, async (obj) => {
    const cache = await recordOne(obj, {
      callStream,
      now: () => performance.now(),
      model: configuredModel(),
      thinking: llmThinking(),
      recordedAt: new Date().toISOString(),
    });
    writeFileSync(path.join(cacheDir, `${obj.id}.json`), serialiseCache(cache, key), "utf8");
    const t = cache.timings;
    console.log(`bench:record: ${obj.id} — ${cache.streamError ? `stream failed (${cache.streamError})` : "recorded"}; first card ${t.firstCardMs ?? "—"} ms, done ${t.totalMs} ms`);
  });
  console.log("bench:record: done. Now run `npm run bench` (offline replay) and commit bench/.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const run = process.argv.includes("record") ? recordMain() : replayMain(process.argv.includes("--check"));
  run.catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
