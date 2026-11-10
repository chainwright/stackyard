// scripts/bench-lib.ts
// The curriculum bench (TASK-33c, .kiro/specs/curriculum-bench/): the pure and
// in-process parts, kept apart from scripts/bench.ts (the CLI) so they are
// unit-tested on hand-made caches (tests/bench.test.ts, tests/fixtures/bench/).
//
// What the bench is: every statutory Years 3–5 requirement of the National
// curriculum in England science programmes of study (55, none left out) becomes
// one fixed teacher sentence; the sentence goes through the REAL streaming
// generator once (`bench:record`, run by us with our model key), and the
// recorded model text is replayed offline, deterministically, through the same
// server pipeline. It measures the generator against curriculum objectives; it
// is NOT a classroom study and no teacher or pupil was involved.

import type { Card, GenerateRequest, GenerateStreamMessage, Stack } from "../src/shared/types.js";
import { streamGenerate } from "../server/stream-generate.js";
import { LlmUnavailableError, type LlmFailureKind, type CallOptions } from "../server/llmGateway.js";
import { exportLivingStack } from "../server/exporter.js";
import { lessonWarnings, quizAnswers } from "../src/shared/lessonCheck.js";
import { checkReachability } from "../src/shared/reachability.js";

// ---------------------------------------------------------------------------
// The objectives and the one sentence template (TASK-33c1, TASK-33c2)

export interface Objective {
  id: string;
  year: number;
  topic: string;
  /** Verbatim from the programme of study. */
  outcome: string;
  source: string;
  url: string;
  licence: string;
}

export const SOURCE_TITLE = "National curriculum in England: science programmes of study";
export const SOURCE_URL =
  "https://www.gov.uk/government/publications/national-curriculum-in-england-science-programmes-of-study/national-curriculum-in-england-science-programmes-of-study";
export const SOURCE_LICENCE = "Open Government Licence v3.0, © Crown copyright 2015";

/** The fixed template, before the outcome. Stated word for word in bench/README.md. */
export const TEMPLATE_HEAD =
  "A 5-question quiz, two flash cards and a short choose-your-path story for pupils aged 8 to 10 on this objective: ";

/** What the template asks for (count fidelity). */
export const REQUESTED = { quiz: 5, flash: 2 } as const;

/** The teacher sentence for one objective: the template + the verbatim outcome + ".". */
export function sentenceFor(outcome: string): string {
  return `${TEMPLATE_HEAD}${outcome}.`;
}

// ---------------------------------------------------------------------------
// The cache (what `bench:record` writes, one file per objective)

export interface Timings {
  /** ms from the call to the first streamed text. */
  firstContentMs: number | null;
  /** ms to the first card dealt to the client. */
  firstCardMs: number | null;
  /** ms to the last card dealt. */
  lastCardMs: number | null;
  /** ms to the terminator (`done` or `error`). */
  totalMs: number;
}

export interface BenchCache {
  id: string;
  sentence: string;
  /** The model's text exactly as streamed (every delta, concatenated). */
  raw: string;
  /** Set when the stream itself failed (the gateway's failure kind). */
  streamError?: LlmFailureKind;
  timings: Timings;
  model: string;
  thinking: "on" | "off";
  recordedAt: string;
}

/** Parse a cache file's JSON, or throw a plain message naming what is wrong. */
export function parseCache(text: string, file: string): BenchCache {
  const c = JSON.parse(text) as Partial<BenchCache>;
  const bad = (what: string): never => {
    throw new Error(`bench: ${file} is not a bench cache (${what})`);
  };
  if (typeof c.id !== "string") bad("no id");
  if (typeof c.sentence !== "string") bad("no sentence");
  if (typeof c.raw !== "string") bad("no raw text");
  if (typeof c.timings !== "object" || c.timings === null || typeof c.timings.totalMs !== "number") bad("no timings");
  if (typeof c.model !== "string") bad("no model");
  if (c.thinking !== "on" && c.thinking !== "off") bad("no thinking setting");
  return c as BenchCache;
}

/**
 * Serialise a cache for disk, refusing one that contains the API key. The key
 * is never put in a cache by construction; this is the belt to that braces.
 */
export function serialiseCache(cache: BenchCache, key: string | undefined): string {
  const text = JSON.stringify(cache, null, 2) + "\n";
  if (key !== undefined && key.trim().length >= 8 && text.includes(key.trim())) {
    throw new Error("bench: refusing to write a cache that contains the API key");
  }
  return text;
}

// ---------------------------------------------------------------------------
// Reading level: Flesch-Kincaid grade with a small documented syllable counter

/**
 * Syllables in one English word (an estimate):
 *   - lower-case letters only; a word of three letters or fewer is 1;
 *   - drop a final silent "e" (but keep "-le" after a consonant: "ta-ble"),
 *     a final "es" (but keep it after s, x, z, c, g, ch, sh: "box-es", "pla-ces"),
 *     a final "ed" (but keep it after t or d: "want-ed");
 *   - count runs of a, e, i, o, u, y; at least 1.
 */
export function syllables(word: string): number {
  let w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length === 0) return 0;
  if (w.length <= 3) return 1;
  if (/[^aeiouy]le$/.test(w)) {
    // "table", "little": the final e is sounded with the l.
  } else if (/(?:[sxzcg]|ch|sh)es$/.test(w)) {
    // "boxes", "places", "wishes": the "es" is its own syllable.
  } else if (/es$/.test(w)) w = w.slice(0, -2);
  else if (/[td]ed$/.test(w)) {
    // "wanted", "landed".
  } else if (/ed$/.test(w)) w = w.slice(0, -2);
  else if (/e$/.test(w)) w = w.slice(0, -1);
  const groups = w.match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 0);
}

/** The words of a text: runs of letters, with an apostrophe kept inside ("don't"). */
export function wordsOf(text: string): string[] {
  return text.match(/[A-Za-z]+(?:['’][A-Za-z]+)*/g) ?? [];
}

/**
 * Flesch-Kincaid grade of a set of texts (card texts and button labels):
 *   0.39 × (words / sentences) + 11.8 × (syllables / words) − 15.59,
 * rounded to one decimal. Each text with words is at least one sentence; inside
 * it, every run of . ! ? followed by a space or the end ends one. 0 for no words.
 */
export function fkGrade(texts: string[]): number {
  let words = 0;
  let syl = 0;
  let sentences = 0;
  for (const t of texts) {
    const ws = wordsOf(t);
    if (ws.length === 0) continue;
    words += ws.length;
    for (const w of ws) syl += syllables(w);
    sentences += Math.max(1, (t.match(/[.!?]+(?=\s|$)/g) ?? []).length);
  }
  if (words === 0) return 0;
  const g = 0.39 * (words / sentences) + 11.8 * (syl / words) - 15.59;
  return Math.round(g * 10) / 10;
}

/** Every piece of text a pupil reads on a deck: text elements and button labels. */
export function deckTexts(stack: Stack): string[] {
  const out: string[] = [];
  for (const c of stack.cards) {
    for (const e of c.elements) {
      if (e.type === "text") out.push(e.content);
      else if (e.type === "button") out.push(e.label);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Percentiles and the pool

/** Nearest-rank percentile (p in 0–100) of the numbers; null for none. */
export function percentile(values: number[], p: number): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const rank = Math.max(1, Math.ceil((p / 100) * v.length));
  return v[rank - 1]!;
}

/** Run `fn` over `items` with at most `limit` running at once; results in input order. */
export async function runPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

// ---------------------------------------------------------------------------
// Deterministic ids during replay

/** FNV-1a 32-bit hash of a string. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A generator of valid RFC 4122 v4 UUIDs from a seed (mulberry32). */
export function seededUuids(seed: string): () => string {
  let a = fnv1a(seed);
  const rand = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => {
    const b = Array.from({ length: 16 }, () => Math.floor(rand() * 256));
    b[6] = (b[6]! & 0x0f) | 0x40; // version 4
    b[8] = (b[8]! & 0x3f) | 0x80; // variant 8–b
    const h = b.map((x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };
}

/**
 * Run `fn` with `crypto.randomUUID` replaced by a seeded generator, and the
 * pipeline's operator log lines silenced. The pipeline mints every id with
 * `crypto.randomUUID`, and the answer shuffle is seeded from the stack id, so the
 * same cache gives byte-identical files. Not re-entrant: replay runs one deck
 * at a time.
 */
export async function withSeededIds<T>(seed: string, fn: () => Promise<T>): Promise<T> {
  const c = globalThis.crypto as unknown as Record<string, unknown>;
  const log = console.log;
  const warn = console.warn;
  Object.defineProperty(c, "randomUUID", { value: seededUuids(seed), configurable: true, writable: true });
  console.log = () => {};
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    delete c["randomUUID"];
    console.log = log;
    console.warn = warn;
  }
}

// ---------------------------------------------------------------------------
// Replay one cache through the live pipeline (TASK-33c4)

export interface DeckResult {
  id: string;
  year: number;
  topic: string;
  outcome: string;
  /** The streamed attempt reached `done` with no retry and no fallback. */
  firstTry: boolean;
  /** Why not, in plain words (absent on a first-try deck). */
  failure?: string;
  /** No lesson warnings (null when there is no deck). */
  lessonClean: boolean | null;
  warnings: string[];
  quiz: number | null;
  flash: number | null;
  /** quiz = 5 and flash = 2, as the template asks. */
  countsOk: boolean | null;
  /** No card the class can never reach. */
  allReachable: boolean | null;
  /** The end card is reachable and no reachable card is stuck, trapped or a dead end. */
  endReachable: boolean | null;
  fkGrade: number | null;
  answersPerQuiz: number[];
  pictures: number | null;
  removedRepeats: number | null;
  /** Living file size in bytes, and its path relative to bench/. */
  fileBytes: number | null;
  file: string | null;
  timings: Timings;
  model: string;
  thinking: "on" | "off";
}

/** Split text into line-sized chunks, each keeping its newline (how a stream arrives). */
function chunks(raw: string): string[] {
  return raw.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

/** Replay one recorded deck. Returns the metrics and the living file (null when there is no deck). */
export async function replayOne(obj: Objective, cache: BenchCache): Promise<{ result: DeckResult; html: string | null }> {
  if (cache.id !== obj.id) throw new Error(`bench: cache ${cache.id} replayed for objective ${obj.id}`);
  if (cache.sentence !== sentenceFor(obj.outcome)) {
    throw new Error(`bench: stale cache for ${obj.id}: its sentence is not the template applied to the objective. Re-record it (bench:record -- --force --only ${obj.id}).`);
  }
  return withSeededIds(obj.id, async () => {
    let fallbackNeeded = false;
    const messages: GenerateStreamMessage[] = [];
    // A fake gateway that yields the recorded text, then the recorded failure (if any).
    const callStream = async function* (_m: { system: string; user: string }, _o?: CallOptions): AsyncGenerator<string, void, unknown> {
      for (const c of chunks(cache.raw)) yield c;
      if (cache.streamError !== undefined) throw new LlmUnavailableError("recorded stream failure", cache.streamError);
    };
    const request: GenerateRequest = { prompt: cache.sentence };
    await streamGenerate(
      request,
      { write: (m) => void messages.push(m), end: () => {} },
      {
        callStream,
        // The live path would retry here; the bench counts that as "not first try".
        generate: async () => {
          fallbackNeeded = true;
          return { ok: false, message: "bench: no retry in replay" };
        },
        sleep: async () => {},
      },
    );
    const done = messages.find((m): m is Extract<GenerateStreamMessage, { type: "done" }> => m.type === "done");
    const base = {
      id: obj.id,
      year: obj.year,
      topic: obj.topic,
      outcome: obj.outcome,
      timings: cache.timings,
      model: cache.model,
      thinking: cache.thinking,
    };
    if (done === undefined || done.isFallback || fallbackNeeded) {
      const failure =
        cache.streamError !== undefined
          ? `the stream failed (${cache.streamError})`
          : "the streamed deck was not valid (the live app would retry or fall back)";
      return {
        result: {
          ...base, firstTry: false, failure, lessonClean: null, warnings: [], quiz: null, flash: null, countsOk: null,
          allReachable: null, endReachable: null, fkGrade: null, answersPerQuiz: [], pictures: null, removedRepeats: null,
          fileBytes: null, file: null,
        },
        html: null,
      };
    }
    const stack = done.stack;
    const html = await exportLivingStack(stack);
    return { result: { ...base, ...deckMetrics(stack), removedRepeats: done.removedRepeats ?? 0, fileBytes: Buffer.byteLength(html), file: `files/${obj.id}.html` }, html };
  });
}

/** The per-deck numbers of a finished stack. */
export function deckMetrics(stack: Stack): Pick<DeckResult, "firstTry" | "lessonClean" | "warnings" | "quiz" | "flash" | "countsOk" | "allReachable" | "endReachable" | "fkGrade" | "answersPerQuiz" | "pictures"> {
  const warnings = lessonWarnings(stack).map((w) => w.code as string);
  const quiz = stack.cards.filter((c) => c.kind === "quiz").length;
  const flash = stack.cards.filter((c) => c.kind === "flash").length;
  const r = checkReachability(stack);
  const end = stack.cards.find((c) => c.kind === "end");
  return {
    firstTry: true,
    lessonClean: warnings.length === 0,
    warnings,
    quiz,
    flash,
    countsOk: quiz === REQUESTED.quiz && flash === REQUESTED.flash,
    allReachable: r.unreachable.length === 0,
    endReachable:
      end !== undefined && r.reachable.has(end.id) && r.trapped.length === 0 && r.stuck.length === 0 &&
      r.deadEndQuiz.length === 0 && r.deadEndOther.length === 0,
    fkGrade: fkGrade(deckTexts(stack)),
    answersPerQuiz: stack.cards.filter((c: Card) => c.kind === "quiz").map((c) => quizAnswers(c).length),
    pictures: stack.cards.reduce((n, c) => n + c.elements.filter((e) => e.type === "image").length, 0),
  };
}

// ---------------------------------------------------------------------------
// Record one objective through the REAL streaming path (TASK-33c3)

export interface RecordDeps {
  /** The gateway's real `callStream` (tests pass a fake). */
  callStream: (messages: { system: string; user: string }, options?: CallOptions) => AsyncGenerator<string, void, unknown>;
  now: () => number;
  model: string;
  thinking: "on" | "off";
  recordedAt: string;
}

/**
 * One real streamed generation, in process (no HTTP, so no per-visitor
 * limiter): `streamGenerate` with a tee around the gateway that keeps every
 * delta, and a fallback stub that makes NO model call, so a failed attempt is
 * recorded as it happened and costs nothing more.
 */
export async function recordOne(obj: Objective, deps: RecordDeps): Promise<BenchCache> {
  const sentence = sentenceFor(obj.outcome);
  let raw = "";
  let streamError: LlmFailureKind | undefined;
  const t0 = deps.now();
  const since = (): number => Math.round(deps.now() - t0);
  let firstContentMs: number | null = null;
  let firstCardMs: number | null = null;
  let lastCardMs: number | null = null;
  let totalMs: number | null = null;
  const tee = async function* (m: { system: string; user: string }, o?: CallOptions): AsyncGenerator<string, void, unknown> {
    try {
      for await (const d of deps.callStream(m, o)) {
        if (firstContentMs === null && d.length > 0) firstContentMs = since();
        raw += d;
        yield d;
      }
    } catch (err) {
      streamError = err instanceof LlmUnavailableError ? err.kind : "network";
      throw err;
    }
  };
  await streamGenerate(
    { prompt: sentence },
    {
      write: (msg) => {
        if (msg.type === "card") {
          if (firstCardMs === null) firstCardMs = since();
          lastCardMs = since();
        } else if (msg.type === "done" || msg.type === "error") totalMs ??= since();
      },
      end: () => {
        totalMs ??= since();
      },
    },
    {
      callStream: tee,
      generate: async () => ({ ok: false, message: "bench: no retry while recording" }),
      sleep: async () => {},
      now: deps.now,
    },
  );
  return {
    id: obj.id,
    sentence,
    raw,
    ...(streamError !== undefined ? { streamError } : {}),
    timings: { firstContentMs, firstCardMs, lastCardMs, totalMs: totalMs ?? since() },
    model: deps.model,
    thinking: deps.thinking,
    recordedAt: deps.recordedAt,
  };
}

// ---------------------------------------------------------------------------
// The summary, results.json and RESULTS.md

export interface BenchSummary {
  objectives: number;
  recorded: number;
  firstTry: number;
  lessonClean: number;
  countsOk: number;
  allReachable: number;
  endReachable: number;
  fkGradeMedian: number | null;
  fileBytesMin: number | null;
  fileBytesMax: number | null;
  firstCardMs: { p50: number | null; p90: number | null };
  totalMs: { p50: number | null; p90: number | null };
  models: string[];
}

export interface BenchResults {
  about: string;
  source: { title: string; url: string; licence: string };
  template: string;
  summary: BenchSummary;
  decks: DeckResult[];
}

export const ABOUT =
  "This measures the generator against curriculum objectives; it is not a classroom study and no teacher or pupil was involved.";

export function summarise(objectives: number, decks: DeckResult[]): BenchSummary {
  const n = (f: (d: DeckResult) => boolean | null): number => decks.filter((d) => f(d) === true).length;
  const sizes = decks.map((d) => d.fileBytes).filter((x): x is number => x !== null);
  const fk = decks.map((d) => d.fkGrade).filter((x): x is number => x !== null);
  const fc = decks.map((d) => d.timings.firstCardMs).filter((x): x is number => x !== null);
  const tot = decks.map((d) => d.timings.totalMs);
  return {
    objectives,
    recorded: decks.length,
    firstTry: n((d) => d.firstTry),
    // "passed our lesson check with no warnings" counts first-try decks only.
    lessonClean: n((d) => d.firstTry && d.lessonClean),
    countsOk: n((d) => d.countsOk),
    allReachable: n((d) => d.allReachable),
    endReachable: n((d) => d.endReachable),
    fkGradeMedian: percentile(fk, 50),
    fileBytesMin: sizes.length > 0 ? Math.min(...sizes) : null,
    fileBytesMax: sizes.length > 0 ? Math.max(...sizes) : null,
    firstCardMs: { p50: percentile(fc, 50), p90: percentile(fc, 90) },
    totalMs: { p50: percentile(tot, 50), p90: percentile(tot, 90) },
    models: [...new Set(decks.map((d) => `${d.model} (thinking ${d.thinking})`))].sort(),
  };
}

export function buildResults(objectives: number, decks: DeckResult[]): BenchResults {
  return {
    about: ABOUT,
    source: { title: SOURCE_TITLE, url: SOURCE_URL, licence: SOURCE_LICENCE },
    template: `${TEMPLATE_HEAD}<outcome>.`,
    summary: summarise(objectives, decks),
    decks,
  };
}

const yesNo = (b: boolean | null): string => (b === null ? "—" : b ? "yes" : "no");
const secs = (ms: number | null): string => (ms === null ? "—" : (ms / 1000).toFixed(1) + " s");
const kb = (b: number | null): string => (b === null ? "—" : `${Math.round(b / 1024)} KB`);

/** The headline rows of a run (used for the current run and for v1). */
function summaryRows(s: BenchSummary): string[] {
  return [
    "| Measure | Result |",
    "|---|---|",
    `| Objectives recorded | ${s.recorded} of ${s.objectives} |`,
    `| Valid lesson file on the first try (no retry, no fallback) | ${s.firstTry} of ${s.objectives} |`,
    `| Passed our automatic lesson check with no warnings | ${s.lessonClean} of ${s.objectives} |`,
    `| Asked-for counts (5 quiz, 2 flash) | ${s.countsOk} of ${s.objectives} |`,
    `| Every card reachable | ${s.allReachable} of ${s.objectives} |`,
    `| End score reachable, nothing stuck | ${s.endReachable} of ${s.objectives} |`,
    `| Reading level (median Flesch-Kincaid grade) | ${s.fkGradeMedian ?? "—"} |`,
    `| File size | ${kb(s.fileBytesMin)} to ${kb(s.fileBytesMax)} |`,
    `| Time to the first card, p50 / p90 | ${secs(s.firstCardMs.p50)} / ${secs(s.firstCardMs.p90)} |`,
    `| Time to done, p50 / p90 | ${secs(s.totalMs.p50)} / ${secs(s.totalMs.p90)} |`,
  ];
}

/** The kept v2 run and what v3 re-records (TASK-34a4). */
export interface V2Context {
  summary: BenchSummary;
  /** The objectives v3 re-records (bench/rerecord.txt). */
  rerecord: string[];
  /** Of those, the ones whose cache is newer than the v2 recordings. */
  rerecorded: string[];
}

/**
 * bench/RESULTS.md: the v1 summary (TASK-33c12, from bench/results-v1.json) and
 * the v2 summary (TASK-34a4, from bench/results-v2.json), when given, then the
 * current summary table plus one row per objective, linking its file.
 */
export function resultsMarkdown(r: BenchResults, v1: BenchSummary | null = null, v2: V2Context | null = null): string {
  const s = r.summary;
  const v2Lines =
    v2 === null
      ? []
      : [
          "## v2 (before the TASK-34a distractor fixes)",
          "",
          `Kept in \`bench/results-v2.json\`, as v2 was recorded and checked; model: ${v2.summary.models.join(", ") || "—"}. Its distractors were reviewed one by one in [\`distractor-review.json\`](distractor-review.json).`,
          "",
          ...summaryRows(v2.summary),
          "",
        ];
  const v1Lines =
    v1 === null
      ? []
      : [
          "## v1 (before the TASK-33 prompt fixes)",
          "",
          `Kept in \`bench/results-v1.json\`; model: ${v1.models.join(", ") || "—"}. What went wrong and why: [\`DIAGNOSIS.md\`](DIAGNOSIS.md).`,
          "",
          ...summaryRows(v1),
          "",
        ];
  const currentHead =
    v1 === null && v2 === null
      ? []
      : [
          "## Current run",
          "",
          ...(v2 === null
            ? []
            : [
                `v3 re-records only the ${v2.rerecord.length} objectives listed in [\`rerecord.txt\`](rerecord.txt) (the v2 decks with at least one absurd distractor); every other objective keeps its v2 recording. Re-recorded so far: ${v2.rerecorded.length} of ${v2.rerecord.length}. The current run uses today's checks, including the joke-answer warning (TASK-34a2).`,
                "",
              ]),
        ];
  const lines = [
    "# Curriculum bench: results",
    "",
    `**${ABOUT}**`,
    "",
    `Source: [${r.source.title}](${r.source.url}), Years 3–5, every statutory "Pupils should be taught to" requirement. ${r.source.licence}. Contains public sector information licensed under the Open Government Licence v3.0.`,
    "",
    `Sentence for every objective: "${r.template}"`,
    "",
    ...v1Lines,
    ...v2Lines,
    ...currentHead,
    `Written by \`npm run bench\` from the recorded model text in \`bench/cache/\`. Model: ${s.models.join(", ") || "—"}.`,
    "",
    ...summaryRows(s),
    "",
    "Times are as recorded by `bench:record` (in process, one sentence each, up to three at once); the replay itself makes no network request.",
    "",
    "The automatic lesson check is mechanical (structure, counts, answer overlap) and does not verify facts: a wrong answer key passes it. A read-only AI review of the keys in a sample of decks is in [`LESSON_CHECKER.md`](LESSON_CHECKER.md).",
    "",
    "| Objective | Year | Outcome | First try | Lesson check | Quiz / flash | Reachable | FK grade | Answers per quiz | Pictures | Size | First card | Done | File |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const d of r.decks) {
    const check = d.lessonClean === null ? "—" : d.lessonClean ? "no warnings" : d.warnings.join(", ");
    lines.push(
      `| ${d.id} | ${d.year} | ${d.outcome.replace(/\|/g, "\\|")} | ${d.firstTry ? "yes" : `no (${d.failure ?? ""})`} | ${check} | ` +
        `${d.quiz ?? "—"} / ${d.flash ?? "—"} | ${yesNo(d.allReachable === null ? null : d.allReachable && d.endReachable === true)} | ` +
        `${d.fkGrade ?? "—"} | ${d.answersPerQuiz.join(" ") || "—"} | ${d.pictures ?? "—"} | ${kb(d.fileBytes)} | ` +
        `${secs(d.timings.firstCardMs)} | ${secs(d.timings.totalMs)} | ${d.file ? `[open](${d.file})` : "—"} |`,
    );
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// The key-accuracy sample (TASK-33c15): which decks the lesson-checker persona
// reads. Deterministic, no randomness: every 5th objective in objectives.json
// order starting at the 1st (positions 1, 6, 11, … 51); when that objective has
// no first-try file, the next objective in order that has one and is not yet
// picked; then the extras (y3-rocks-2, because v1 had a wrong key there).

export const KEY_REVIEW_EXTRA = ["y3-rocks-2"] as const;

export function keyReviewSample(objectives: Objective[], hasFile: (id: string) => boolean, extra: readonly string[] = KEY_REVIEW_EXTRA): string[] {
  const picked: string[] = [];
  for (let i = 0; i < objectives.length; i += 5) {
    for (let j = i; j < objectives.length; j++) {
      const id = objectives[j]!.id;
      if (hasFile(id) && !picked.includes(id)) {
        picked.push(id);
        break;
      }
    }
  }
  for (const id of extra) if (hasFile(id) && !picked.includes(id)) picked.push(id);
  return picked;
}
