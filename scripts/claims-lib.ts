// scripts/claims-lib.ts
// The pure part of the README claim checker (TASK-23 b, extended in TASK-26l):
// reading the claimed numbers, rewriting them from measured values (`--fix`),
// and checking the README's build command against render.yaml. Kept free of
// I/O so it is unit-tested (tests/claims.test.ts).

/** The four numbers in the README's "By the numbers" block. */
export interface Numbers {
  tests: number;
  kb: number;
  invariants: number;
  runs: number;
}

const TESTS_RE = /(Tests:\s*\*\*)([\d,]+)(\*\*)/;
const KB_RE = /(Player bundle:\s*\*\*)([\d.]+)(\s*KB\*\*)/;
const INVARIANTS_RE = /(Stack invariants:\s*\*\*)(\d+)(\*\*)/;
const RUNS_RE = /(property test:\s*\*\*)([\d,]+)(\*\*)/;

function numberAt(text: string, re: RegExp): number | null {
  const m = re.exec(text);
  if (!m) return null;
  const n = Number(m[2]!.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** The numbers the README currently claims, or null when the block is missing. */
export function readClaims(readme: string): Numbers | null {
  const tests = numberAt(readme, TESTS_RE);
  const kb = numberAt(readme, KB_RE);
  const invariants = numberAt(readme, INVARIANTS_RE);
  const runs = numberAt(readme, RUNS_RE);
  if (tests === null || kb === null || invariants === null || runs === null) return null;
  return { tests, kb, invariants, runs };
}

/** 1000 → "1,000" (the README's style). */
export function withCommas(n: number): string {
  return n.toLocaleString("en-US");
}

/** Rewrite the README's numbers from MEASURED values. Never invents a number. */
export function applyFix(readme: string, m: Numbers): string {
  return readme
    .replace(TESTS_RE, (_m, a: string, _n: string, c: string) => `${a}${m.tests}${c}`)
    .replace(KB_RE, (_m, a: string, _n: string, c: string) => `${a}${m.kb.toFixed(1)}${c}`)
    .replace(INVARIANTS_RE, (_m, a: string, _n: string, c: string) => `${a}${m.invariants}${c}`)
    .replace(RUNS_RE, (_m, a: string, _n: string, c: string) => `${a}${withCommas(m.runs)}${c}`);
}

/** The buildCommand render.yaml runs on deploy, or null. */
export function renderBuildCommand(renderYaml: string): string | null {
  const m = /^\s*buildCommand:\s*(.+?)\s*$/m.exec(renderYaml);
  return m ? m[1]! : null;
}

/** Every `npm ci && npm run build:…` chain written in the README. */
const BUILD_CHAIN_RE = /npm ci(?: && npm run build:[a-z]+)+/g;

/** True when every build chain the README shows is exactly render.yaml's. */
export function readmeBuildCommandsMatch(readme: string, command: string): boolean {
  const chains = readme.match(BUILD_CHAIN_RE) ?? [];
  return chains.length > 0 && chains.every((c) => c === command);
}

/** Rewrite any stale `npm ci && npm run build:…` chain to render.yaml's command. */
export function fixBuildCommands(readme: string, command: string): string {
  return readme.replace(BUILD_CHAIN_RE, command);
}

// ---------------------------------------------------------------------------
// The floppy count (TASK-33b): "**N** lesson files like the water-cycle test
// deck fit on a 1.44 MB floppy", where N = floor(1,457,664 / bytes of a living
// export of tests/fixtures/generation/water-cycle-g2.json). Never rounded up.

/** A 1.44 MB floppy's real FAT12 capacity, in bytes (2,847 clusters of 512). */
export const FLOPPY_BYTES = 1_457_664;

/** The phrase both files use; the claim names the fixture, not the samples. */
export const FLOPPY_PHRASE = "lesson files like the water-cycle test deck fit on a 1.44 MB floppy";

const FLOPPY_README_RE = /(\*\*)(\d+)(\*\* lesson files like the water-cycle test deck fit on a 1\.44 MB floppy)/;

/** How many files of `bytes` fit on the floppy: floor, never round up (0 for a bad size). */
export function floppyCount(bytes: number): number {
  if (!(bytes > 0)) return 0;
  return Math.floor(FLOPPY_BYTES / bytes);
}

/** The largest file that still lets `n` fit on the floppy, in bytes. */
export function floppyBudget(n: number): number {
  return Math.floor(FLOPPY_BYTES / n);
}

/**
 * TASK-35b: the count the README and the write-up STATE. The coordinator
 * claims 6 (not the measured 7) so the claim has headroom; it is never more
 * than what really fits, so it drops to the true count if the file grows past
 * floppyBudget(6) = 242,944 B.
 */
export const FLOPPY_CLAIM = 6;

/** TASK-35b: the size test's budget, a margin below the 6-file limit (242,944 − 232,000 = 10,944 B). */
export const FLOPPY_MARGIN_BUDGET = 232_000;

export function floppyClaim(bytes: number): number {
  return Math.min(FLOPPY_CLAIM, floppyCount(bytes));
}

/** The README's claimed floppy count, or null when the sentence is missing. */
export function readFloppyClaim(readme: string): number | null {
  const m = FLOPPY_README_RE.exec(readme);
  return m ? Number(m[2]) : null;
}

/** Rewrite the README's floppy count from the MEASURED count. */
export function fixFloppyClaim(readme: string, count: number): string {
  return readme.replace(FLOPPY_README_RE, (_m, a: string, _n: string, c: string) => `${a}${count}${c}`);
}

/** The README floppy check: present, and exactly the measured count. */
export function compareFloppy(readme: string, measured: number): Check {
  const claimed = readFloppyClaim(readme);
  return {
    name: "floppy count",
    claimed: claimed ?? "(missing)",
    actual: measured,
    ok: claimed !== null && measured > 0 && claimed === measured,
    note: `min(${FLOPPY_CLAIM}, floor(${withCommas(FLOPPY_BYTES)} / living export bytes))`,
  };
}

/** Strip ANSI colour/cursor escapes (Vitest colours its output in CI). */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "");
}

/**
 * Pull the total test count out of a Vitest run, coloured or not. Counts
 * "passed" + "failed" + "skipped" from the "Tests  N failed | M passed (T)"
 * line and prefers the parenthesised total. Returns null when the line is
 * missing — "could not parse" is NOT the same thing as drift (TASK-27v).
 */
export function parseTestTotal(output: string): number | null {
  const line = stripAnsi(output)
    .split(/\r?\n/)
    .find((l) => /^\s*Tests\s+\d+/.test(l));
  if (line === undefined) return null;
  const total = /\((\d+)\)\s*$/.exec(line.trim());
  if (total) return Number(total[1]);
  let sum = 0;
  for (const m of line.matchAll(/(\d+)\s+(passed|failed|skipped|todo)/g)) sum += Number(m[1]);
  return sum > 0 ? sum : null;
}

export interface Check {
  name: string;
  claimed: number | string;
  actual: number | string;
  ok: boolean;
  note?: string;
}

/** Compare claimed vs measured numbers. Player KB gets ±0.5 for zlib variance. */
export function compare(claimed: Numbers, actual: Numbers): Check[] {
  return [
    { name: "tests", claimed: claimed.tests, actual: actual.tests, ok: actual.tests === claimed.tests },
    {
      name: "player KB (gzip)",
      claimed: claimed.kb,
      actual: actual.kb,
      ok: actual.kb > 0 && Math.abs(actual.kb - claimed.kb) <= 0.5,
      note: "±0.5 KB",
    },
    { name: "invariants", claimed: claimed.invariants, actual: actual.invariants, ok: actual.invariants === claimed.invariants },
    { name: "round-trip runs", claimed: claimed.runs, actual: actual.runs, ok: actual.runs === claimed.runs },
  ];
}

// ---------------------------------------------------------------------------
// The Devpost write-up (TASK-32g). docs/DEVPOST_WRITEUP.md is checked like the
// README, so its numbers can't drift. Only CURRENT claims are matched: the
// sentence about what the video shows ("It shows 84 of 84 traced task ids,
// 1,003 tests") is history and is not a claim about this commit.

/** What the write-up can be measured against. */
export interface WriteupNumbers {
  /** `check:trace`: traced ids (N of N). */
  traced: number;
  /** Vitest total. */
  tests: number;
  /** Mutants defined in scripts/mutation-check.ts. */
  mutants: number;
  /** fc.property / fc.asyncProperty calls in tests/. */
  properties: number;
  /** Player bundle, gzipped KB. */
  kb: number;
  /** A living export of a fixed generated-shape deck, KB. */
  fileKb: number;
  /** floor(FLOPPY_BYTES / bytes of that same export) (TASK-33b). */
  floppy: number;
}

interface WriteupPattern {
  name: keyof WriteupNumbers;
  label: string;
  re: RegExp;
  /** How a number is written back. */
  format: (n: number) => string;
  /** When set, `--fix` also rewrites group 1 (e.g. the article "a" / "an"). */
  lead?: (n: number) => string;
}

/**
 * "a" or "an" before a number written in digits, by how the number is SPOKEN
 * (TASK-32h): "an 8", "an 11", "an 18", "an 80–89", "an 800–899", "an 8,000",
 * "an 11,000"… — the leading spoken word is "eight", "eleven", "eighteen" or
 * "eighty". Everything else takes "a" ("a 72", "a 1,000", "a 100").
 */
export function articleFor(n: number): "a" | "an" {
  let lead = Math.floor(Math.abs(n));
  // The leading three-digit group is what is said first ("eleven thousand").
  while (lead >= 1000) lead = Math.floor(lead / 1000);
  const an = lead === 8 || lead === 11 || lead === 18 || (lead >= 80 && lead <= 89) || (lead >= 800 && lead <= 899);
  return an ? "an" : "a";
}

const int = (n: number): string => String(Math.round(n));
const WRITEUP_PATTERNS: WriteupPattern[] = [
  { name: "traced", label: "traced ids (reports N of N)", re: /(reports )(\d+)( of )(\d+)( and )/g, format: int },
  { name: "traced", label: "traced ids (N of N by check:trace)", re: /(\()(\d+)( of )(\d+)( by `npm run check:trace`)/g, format: int },
  { name: "traced", label: "traced ids (N of N appear)", re: /(\()(\d+)( of )(\d+)( appear in test titles)/g, format: int },
  { name: "traced", label: "traced ids (N of N lettered)", re: /(\| )(\d+)( of )(\d+)( lettered task ids traced)/g, format: int },
  { name: "tests", label: "tests (reports … and N tests)", re: /(reports \d+ of \d+ and )([\d,]+)( tests)/g, format: withCommas },
  { name: "mutants", label: "mutants (N-mutant script)", re: /\b(an? )(\d+)(-mutant script)/g, format: int, lead: (n) => `${articleFor(n)} ` },
  { name: "mutants", label: "mutants (N of N killed)", re: /(, )(\d+)( of )(\d+)( killed)/g, format: int },
  { name: "mutants", label: "mutants (reverts N)", re: /(reverts )(\d+)( of the review fixes)/g, format: int },
  { name: "properties", label: "fast-check properties", re: /()(\d+)( fast-check properties)/g, format: int },
  { name: "kb", label: "player KB (gzip)", re: /(is )([\d.]+)( KB gzipped)/g, format: (n) => n.toFixed(1) },
  // TASK-36a1: "…reports N of N and M tests and a 12.3 KB player; …" (the video note).
  { name: "kb", label: "player KB (… tests and a N KB player)", re: /(tests and an? )([\d.]+)( KB player)/g, format: (n) => n.toFixed(1), lead: (n) => `tests and ${articleFor(n)} ` },
  { name: "fileKb", label: "lesson file size (about N KB)", re: /(lesson file is now about )(\d+)( KB)/g, format: int },
  { name: "floppy", label: "floppy count (N lesson files … fit on a 1.44 MB floppy)", re: /(\b)(\d+)( lesson files like the water-cycle test deck fit on a 1\.44 MB floppy)/g, format: int },
];

/** Every number the write-up claims, per pattern, in text order. */
export function readWriteupClaims(text: string): Array<{ name: keyof WriteupNumbers; label: string; values: number[] }> {
  const out: Array<{ name: keyof WriteupNumbers; label: string; values: number[] }> = [];
  for (const p of WRITEUP_PATTERNS) {
    for (const m of text.matchAll(p.re)) {
      // groups: 2 is the number; a "N of N" pattern carries the second N in group 4.
      const values = [Number(m[2]!.replace(/,/g, ""))];
      if (m[4] !== undefined && /^\d+$/.test(m[4])) values.push(Number(m[4]));
      out.push({ name: p.name, label: p.label, values });
    }
  }
  return out;
}

/**
 * TASK-36a2: "about N KB" is compared against the living export in DECIMAL KB
 * (bytes / 1000, what a file manager shows), within ±3 %. It was ±10 % in KiB,
 * which let a stale "185" pass against a 203 KiB file (round-3 panel, J05 E5).
 */
export const FILE_KB_TOLERANCE = 0.03;

/** Within tolerance? Player KB ±0.5, the file size ±3 %, everything else exact. */
function close(name: keyof WriteupNumbers, claimed: number, actual: number): boolean {
  if (name === "kb") return actual > 0 && Math.abs(actual - claimed) <= 0.5;
  if (name === "fileKb") return actual > 0 && Math.abs(actual - claimed) <= actual * FILE_KB_TOLERANCE;
  return claimed === actual;
}

/** One Check per claim the write-up makes; a write-up with no claims at all is itself a failure. */
export function compareWriteup(text: string, actual: WriteupNumbers): Check[] {
  const claims = readWriteupClaims(text);
  const checks: Check[] = claims.map((c) => ({
    name: `write-up ${c.label}`,
    claimed: c.values.join(" of "),
    actual: actual[c.name],
    ok: c.values.every((v) => close(c.name, v, actual[c.name])),
    ...(c.name === "kb" ? { note: "±0.5 KB" } : c.name === "fileKb" ? { note: "±3 %, decimal KB (bytes / 1000)" } : {}),
  }));
  for (const name of ["traced", "mutants", "properties", "kb", "fileKb", "floppy"] as const) {
    if (!claims.some((c) => c.name === name)) {
      checks.push({ name: `write-up ${name}`, claimed: "(missing)", actual: actual[name], ok: false, note: "the write-up no longer states it" });
    }
  }
  // The article before a number (TASK-32h): "an 86-mutant script", not "a 86".
  for (const p of WRITEUP_PATTERNS) {
    if (p.lead === undefined) continue;
    for (const m of text.matchAll(p.re)) {
      const want = p.lead(Number(m[2]!.replace(/,/g, "")));
      if (m[1] !== want) {
        checks.push({ name: `write-up ${p.label} article`, claimed: `${m[1]}${m[2]}`, actual: `${want}${m[2]}`, ok: false, note: "a / an by how the number is spoken" });
      }
    }
  }
  return checks;
}

/** Rewrite the write-up's numbers from MEASURED values (never invents one). */
export function applyWriteupFix(text: string, actual: WriteupNumbers): string {
  let out = text;
  for (const p of WRITEUP_PATTERNS) {
    const v = p.format(actual[p.name]);
    const pair = p.re.source.includes("( of )(\\d+)"); // "N of N" patterns carry the number twice
    out = out.replace(p.re, (whole: string, ...g: unknown[]) => {
      const s = g.map((x) => (typeof x === "string" ? x : ""));
      if (pair) return `${s[0]}${v}${s[2]}${v}${s[4]}`;
      // A file size within tolerance is left as written (it is an "about").
      if (p.name === "fileKb" && close("fileKb", Number(s[1]), actual.fileKb)) return whole;
      return `${p.lead ? p.lead(actual[p.name]) : s[0]}${v}${s[2]}`;
    });
  }
  return out;
}

/** Count fc.property / fc.asyncProperty calls in a set of test sources. */
export function countProperties(sources: string[]): number {
  let n = 0;
  for (const s of sources) n += (s.match(/\bfc\.(?:property|asyncProperty)\(/g) ?? []).length;
  return n;
}

/** Count the mutants defined in scripts/mutation-check.ts (one `name:` per entry). */
export function countMutants(source: string): number {
  return (source.match(/^ {4}name: "/gm) ?? []).length;
}

/** The "N of M" traced count from `check:trace`'s last line (null when it can't be read). */
export function parseTraceCount(output: string): { traced: number; total: number } | null {
  const m = /(\d+) of (\d+) spec task ids/.exec(stripAnsi(output));
  return m ? { traced: Number(m[1]), total: Number(m[2]) } : null;
}

// ---------------------------------------------------------------------------
// The curriculum bench line (TASK-33c7): README "By the numbers" and the
// write-up each carry "N of 55 England KS2 science objectives (Years 3–5)
// became a valid lesson file on the first try; M passed our lesson check with no
// warnings", checked against bench/results.json, and each says it is not a
// classroom study. Before bench/results.json exists, neither may carry it.

/** The three numbers the line states (from bench/results.json's summary). */
export interface BenchNumbers {
  objectives: number;
  firstTry: number;
  lessonClean: number;
}

// TASK-33c14: "our AUTOMATIC lesson check" — the check is mechanical.
const BENCH_RE =
  /(\d+) of (\d+) England KS2 science objectives \(Years 3–5\) became a valid lesson file on the first try; (\d+) passed our automatic lesson check with no warnings/;
/** The pre-TASK-33c14 wording, recognised only so `--fix` can replace it. */
const OLD_BENCH_RE =
  /\d+ of \d+ England KS2 science objectives \(Years 3–5\) became a valid lesson file on the first try; \d+ passed our lesson check with no warnings/;

/** Every text that reports a bench number says this. */
export const BENCH_DISCLAIMER = "not a classroom study";

/** TASK-33c14: the sentence after the bench numbers. */
export const BENCH_MECHANICAL = "The checks are mechanical (structure, counts, answer overlap) and do not verify facts.";

export function benchSentence(b: BenchNumbers): string {
  return `${b.firstTry} of ${b.objectives} England KS2 science objectives (Years 3–5) became a valid lesson file on the first try; ${b.lessonClean} passed our automatic lesson check with no warnings`;
}

/** The README's bench line. */
export function readmeBenchLine(b: BenchNumbers): string {
  return `- Curriculum bench: ${benchSentence(b)} ([\`bench/RESULTS.md\`](bench/RESULTS.md)). ${BENCH_MECHANICAL} It measures the generator against curriculum objectives; it is ${BENCH_DISCLAIMER} and no teacher or pupil was involved.`;
}

/** The write-up's bench line ("Accomplishments"). */
export function writeupBenchLine(b: BenchNumbers): string {
  return `- ${benchSentence(b)} (\`bench/RESULTS.md\` in the repo, one lesson file per objective). ${BENCH_MECHANICAL} This measures the generator against curriculum objectives; it is ${BENCH_DISCLAIMER} and no teacher or pupil was involved.`;
}

/** The numbers a text's bench line states, or null when it has none. */
export function readBenchClaim(text: string): BenchNumbers | null {
  const m = BENCH_RE.exec(text);
  return m ? { firstTry: Number(m[1]), objectives: Number(m[2]), lessonClean: Number(m[3]) } : null;
}

/** The bench check for one file. `bench` is null while bench/results.json does not exist. */
export function compareBench(text: string, where: string, bench: BenchNumbers | null): Check[] {
  const claimed = readBenchClaim(text);
  const name = `${where} bench line`;
  if (bench === null) {
    return claimed === null
      ? []
      : [{ name, claimed: benchSentence(claimed), actual: "(no bench/results.json)", ok: false, note: "nothing backs it yet: record and replay the bench first" }];
  }
  if (claimed === null) return [{ name, claimed: "(missing)", actual: benchSentence(bench), ok: false, note: "bench/results.json exists, so the line is required" }];
  const checks: Check[] = [
    {
      name,
      claimed: benchSentence(claimed),
      actual: benchSentence(bench),
      ok: claimed.objectives === bench.objectives && claimed.firstTry === bench.firstTry && claimed.lessonClean === bench.lessonClean,
    },
  ];
  const line = text.split("\n").find((l) => BENCH_RE.test(l)) ?? "";
  if (!line.includes(BENCH_DISCLAIMER)) {
    checks.push({ name: `${name} disclaimer`, claimed: "(no disclaimer)", actual: BENCH_DISCLAIMER, ok: false, note: "the line must say it is not a classroom study" });
  }
  if (!line.includes(BENCH_MECHANICAL)) {
    checks.push({ name: `${name} mechanical note`, claimed: "(missing)", actual: BENCH_MECHANICAL, ok: false, note: "the line must say the checks do not verify facts" });
  }
  return checks;
}

/**
 * Rewrite the bench line from MEASURED values, or insert `line(b)` after the
 * first line containing `anchor` when the text has none. A line in the old
 * wording, or one missing the disclaimer or the mechanical note, is replaced
 * whole by `line(b)` (TASK-33c14); a current one only has its numbers rewritten.
 */
export function fixBench(text: string, b: BenchNumbers, anchor: string, line: (b: BenchNumbers) => string): string {
  const lines = text.split("\n");
  const ix = lines.findIndex((l) => BENCH_RE.test(l) || OLD_BENCH_RE.test(l));
  if (ix >= 0) {
    const l = lines[ix]!;
    lines[ix] = BENCH_RE.test(l) && l.includes(BENCH_DISCLAIMER) && l.includes(BENCH_MECHANICAL) ? l.replace(BENCH_RE, benchSentence(b)) : line(b);
    return lines.join("\n");
  }
  const at = lines.findIndex((l) => l.includes(anchor));
  if (at < 0) return text;
  lines.splice(at + 1, 0, line(b));
  return lines.join("\n");
}

/** Where `--fix` inserts the bench line. */
export const README_BENCH_ANCHOR = "carry photos, so they are larger.";
export const WRITEUP_BENCH_ANCHOR = "- The player bundle is ";

// ---------------------------------------------------------------------------
// The key-review line (TASK-33c16): "A read-only AI review of N quiz cards from
// D generated decks found W wrong keys and A ambiguous ones
// (bench/LESSON_CHECKER.md)." in README and write-up, checked against totals
// RECOMPUTED from the per-card verdicts in bench/key-review.json. Required while
// that file exists; refused while it does not.

export type KeyVerdict = "correct" | "wrong" | "ambiguous";

export interface KeyReview {
  decks: Array<{ id: string; cards: Array<{ card: number; question: string; key: string; verdict: KeyVerdict; reason?: string }> }>;
  totals: KeyNumbers;
}

export interface KeyTotals {
  cards: number;
  decks: number;
  wrong: number;
  ambiguous: number;
}

/**
 * TASK-36b3: the line also names the CURRENT run's known wrong keys (from the
 * latest distractor review), because the 12-deck sample is from v2 and most of
 * its decks were re-recorded since (round-3 panel, J05 E49).
 */
export interface KeyNumbers extends KeyTotals {
  currentWrong: number;
}

/** The totals from the verdicts themselves (never from the stored totals). */
export function keyReviewTotals(r: KeyReview): KeyTotals {
  const all = r.decks.flatMap((d) => d.cards);
  return {
    cards: all.length,
    decks: r.decks.length,
    wrong: all.filter((c) => c.verdict === "wrong").length,
    ambiguous: all.filter((c) => c.verdict === "ambiguous").length,
  };
}

const KEY_RE =
  /An AI review of (\d+) quiz cards from (\d+) decks of an earlier bench run \(v2\) found (\d+) wrong keys? and (\d+) ambiguous ones?; the current run's re-recorded decks have (\d+) known wrong keys? \(bench\/LESSON_CHECKER\.md\)\./;
/** The pre-TASK-36b3 wording, recognised only so `--fix` can replace it. */
const OLD_KEY_RE =
  /A read-only AI review of \d+ quiz cards from \d+ generated decks found \d+ wrong keys? and \d+ ambiguous ones? \(bench\/LESSON_CHECKER\.md\)\./;

const s = (n: number): string => (n === 1 ? "" : "s");

export function keySentence(k: KeyNumbers): string {
  return `An AI review of ${k.cards} quiz cards from ${k.decks} decks of an earlier bench run (v2) found ${k.wrong} wrong key${s(k.wrong)} and ${k.ambiguous} ambiguous one${s(k.ambiguous)}; the current run's re-recorded decks have ${k.currentWrong} known wrong key${s(k.currentWrong)} (bench/LESSON_CHECKER.md).`;
}

/** The line in both files (a bullet). */
export function keyReviewLine(k: KeyNumbers): string {
  return `- ${keySentence(k)} It is an AI review, not a teacher's.`;
}

export function readKeyClaim(text: string): KeyNumbers | null {
  const m = KEY_RE.exec(text);
  return m ? { cards: Number(m[1]), decks: Number(m[2]), wrong: Number(m[3]), ambiguous: Number(m[4]), currentWrong: Number(m[5]) } : null;
}

export function compareKeyReview(text: string, where: string, review: KeyNumbers | null): Check[] {
  const claimed = readKeyClaim(text);
  const name = `${where} key-review line`;
  if (review === null) {
    return claimed === null ? [] : [{ name, claimed: keySentence(claimed), actual: "(no bench/key-review.json)", ok: false, note: "nothing backs it" }];
  }
  if (claimed === null) return [{ name, claimed: "(missing)", actual: keySentence(review), ok: false, note: "bench/key-review.json exists, so the line is required" }];
  return [
    {
      name,
      claimed: keySentence(claimed),
      actual: keySentence(review),
      ok: claimed.cards === review.cards && claimed.decks === review.decks && claimed.wrong === review.wrong && claimed.ambiguous === review.ambiguous && claimed.currentWrong === review.currentWrong,
    },
  ];
}

/** Rewrite the key-review sentence from the verdicts, or insert the line after the bench line. */
export function fixKeyReview(text: string, k: KeyNumbers): string {
  if (KEY_RE.test(text)) return text.replace(KEY_RE, keySentence(k));
  if (OLD_KEY_RE.test(text)) return text.replace(OLD_KEY_RE, keySentence(k));
  const lines = text.split("\n");
  const at = lines.findIndex((l) => BENCH_RE.test(l));
  if (at < 0) return text;
  lines.splice(at + 1, 0, keyReviewLine(k));
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// The accessibility line (TASK-33d6), in README and write-up, checked against
// docs/accessibility/axe-report.json (written by scripts/check-a11y.ts).
// Required while that file exists; refused while it does not.

export interface A11yNumbers {
  axeVersion: string;
  pages: number;
  /** Serious + critical violation nodes over every page. */
  seriousOrCritical: number;
  keyboard: boolean;
  scan: boolean;
}

interface AxeReportShape {
  axeVersion: string;
  totals: { pages: number; serious: number; critical: number };
  pages: unknown[];
  keyboard: { playThrough: boolean; teacherEditAndSave?: boolean };
  scan: { playThrough: boolean };
}

/** The line's numbers from the report (pages counted from the list, not the total). */
export function a11yFromReport(r: AxeReportShape): A11yNumbers {
  return {
    axeVersion: r.axeVersion,
    pages: r.pages.length,
    seriousOrCritical: r.totals.serious + r.totals.critical,
    keyboard: r.keyboard.playThrough === true && r.keyboard.teacherEditAndSave === true,
    scan: r.scan.playThrough === true,
  };
}

const A11Y_PAGES = "the Maker, the 3 samples in Play and in the Teacher tab, a class export, an end card with a results code, the Class results panel and 5 bench files";

const A11Y_RE =
  /axe-core (\d+\.\d+\.\d+) audited (\d+) pages \(the Maker, the 3 samples in Play and in the Teacher tab, a class export, an end card with a results code, the Class results panel and 5 bench files\) and found (\d+) serious or critical violations; the keyboard-only play-through (passes|fails) and the one-switch scan play-through (passes|fails)/;
/** The pre-TASK-34b7 page list, recognised only so `--fix` can replace it. */
const OLD_A11Y_RE =
  /axe-core \d+\.\d+\.\d+ audited \d+ pages \(the Maker, the 3 samples in Play and in the Teacher tab, a class export and 5 bench files\) and found \d+ serious or critical violations; the keyboard-only play-through (?:passes|fails) and the one-switch scan play-through (?:passes|fails)/;

export const A11Y_DISCLAIMER = "No screen-reader user or disabled pupil has tested it.";

export function a11ySentence(a: A11yNumbers): string {
  return `axe-core ${a.axeVersion} audited ${a.pages} pages (${A11Y_PAGES}) and found ${a.seriousOrCritical} serious or critical violations; the keyboard-only play-through ${a.keyboard ? "passes" : "fails"} and the one-switch scan play-through ${a.scan ? "passes" : "fails"}`;
}

export function a11yLine(a: A11yNumbers): string {
  return `- Accessibility: ${a11ySentence(a)} ([\`docs/accessibility/\`](docs/accessibility/README.md)). ${A11Y_DISCLAIMER}`;
}

/** The write-up's version (Devpost does not follow repo-relative links). */
export function writeupA11yLine(a: A11yNumbers): string {
  return `- Accessibility: ${a11ySentence(a)} (\`docs/accessibility/README.md\` in the repo). ${A11Y_DISCLAIMER}`;
}

export function readA11yClaim(text: string): A11yNumbers | null {
  const m = A11Y_RE.exec(text);
  return m ? { axeVersion: m[1]!, pages: Number(m[2]), seriousOrCritical: Number(m[3]), keyboard: m[4] === "passes", scan: m[5] === "passes" } : null;
}

export function compareA11y(text: string, where: string, a: A11yNumbers | null): Check[] {
  const claimed = readA11yClaim(text);
  const name = `${where} accessibility line`;
  if (a === null) {
    return claimed === null ? [] : [{ name, claimed: a11ySentence(claimed), actual: "(no docs/accessibility/axe-report.json)", ok: false, note: "nothing backs it" }];
  }
  if (claimed === null) return [{ name, claimed: "(missing)", actual: a11ySentence(a), ok: false, note: "axe-report.json exists, so the line is required" }];
  const checks: Check[] = [
    {
      name,
      claimed: a11ySentence(claimed),
      actual: a11ySentence(a),
      ok: claimed.axeVersion === a.axeVersion && claimed.pages === a.pages && claimed.seriousOrCritical === a.seriousOrCritical && claimed.keyboard === a.keyboard && claimed.scan === a.scan,
    },
  ];
  const line = text.split("\n").find((l) => A11Y_RE.test(l)) ?? "";
  if (!line.includes(A11Y_DISCLAIMER)) checks.push({ name: `${name} disclaimer`, claimed: "(missing)", actual: A11Y_DISCLAIMER, ok: false, note: "the line must say no disabled user has tested it" });
  return checks;
}

/** Rewrite the line's numbers, or insert it after the key-review line (else the bench line). */
export function fixA11y(text: string, a: A11yNumbers, line: (a: A11yNumbers) => string = a11yLine): string {
  if (A11Y_RE.test(text)) return text.replace(A11Y_RE, a11ySentence(a));
  if (OLD_A11Y_RE.test(text)) return text.replace(OLD_A11Y_RE, a11ySentence(a));
  const lines = text.split("\n");
  let at = lines.findIndex((l) => KEY_RE.test(l));
  if (at < 0) at = lines.findIndex((l) => BENCH_RE.test(l));
  if (at < 0) return text;
  lines.splice(at + 1, 0, line(a));
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// The joke-answer line (TASK-34a6): "In the 34 re-recorded decks, an AI review
// found joke answers fell from A of N to B of M wrong answers; C wrong keys
// (bench/LESSON_CHECKER.md). It is an AI review, not a teacher's." Checked against
// numbers RECOMPUTED from the per-card labels of bench/distractor-review.json
// (v2, restricted to the decks the latest review covers) and the latest review
// (bench/distractor-review-v4.json, else -v3; TASK-34a9).

export interface JokeNumbers {
  decks: number;
  beforeAbsurd: number;
  beforeTotal: number;
  afterAbsurd: number;
  afterTotal: number;
  /** Which review the "after" numbers come from ("v3", "v4"). */
  version: string;
  wrongKeys: number;
}

interface ReviewShape {
  decks: Array<{ id: string; cards: Array<{ distractors: Array<{ label: string }>; key?: { verdict: string } }> }>;
}

/**
 * `between` (TASK-34a12) are the reviews of the runs in between (v3, v4). Only
 * the decks that have a lesson file in the latest review AND in every one of
 * them are counted, on both sides, so the line uses the same deck set as the
 * LESSON_CHECKER.md table.
 */
export function jokeFromReviews(v2: ReviewShape, latest: ReviewShape, version = "v3", between: ReviewShape[] = []): JokeNumbers {
  const ids = new Set(latest.decks.map((d) => d.id).filter((id) => between.every((r) => r.decks.some((d) => d.id === id))));
  const decksOf = (r: ReviewShape) => r.decks.filter((d) => ids.has(d.id));
  const count = (r: ReviewShape): { absurd: number; total: number } => {
    const xs = decksOf(r).flatMap((d) => d.cards.flatMap((c) => c.distractors));
    return { absurd: xs.filter((x) => x.label === "absurd").length, total: xs.length };
  };
  const before = count(v2);
  const after = count(latest);
  return {
    decks: ids.size,
    beforeAbsurd: before.absurd,
    beforeTotal: before.total,
    afterAbsurd: after.absurd,
    afterTotal: after.total,
    version,
    wrongKeys: decksOf(latest).flatMap((d) => d.cards).filter((c) => c.key?.verdict === "wrong").length,
  };
}

// TASK-34a9: the sentence names the latest review ("v4") and counts only the
// re-recorded decks that became lesson files (both sides of the comparison).
// TASK-34a12: "in every run": only the decks with a file in v3, v4 and v5.
const JOKE_RE =
  /In the (\d+) re-recorded decks that became lesson files in every run, an AI review found joke answers fell from (\d+) of (\d+) \(v2\) to (\d+) of (\d+) \((v\d+)\) wrong answers; (\d+) wrong keys? \(bench\/LESSON_CHECKER\.md\)\./;
/** The pre-TASK-34a9 wording, recognised only so `--fix` can replace it. */
const OLD_JOKE_RE =
  /In the \d+ re-recorded decks, an AI review found joke answers fell from \d+ of \d+ to \d+ of \d+ wrong answers; \d+ wrong keys? \(bench\/LESSON_CHECKER\.md\)\./;
/** The TASK-34a9 wording (no "in every run"), recognised only so `--fix` can replace it. */
const V4_JOKE_RE =
  /In the \d+ re-recorded decks that became lesson files, an AI review found joke answers fell from \d+ of \d+ \(v2\) to \d+ of \d+ \(v\d+\) wrong answers; \d+ wrong keys? \(bench\/LESSON_CHECKER\.md\)\./;

export const JOKE_DISCLAIMER = "It is an AI review, not a teacher's.";

export function jokeSentence(j: JokeNumbers): string {
  return `In the ${j.decks} re-recorded decks that became lesson files in every run, an AI review found joke answers fell from ${j.beforeAbsurd} of ${j.beforeTotal} (v2) to ${j.afterAbsurd} of ${j.afterTotal} (${j.version}) wrong answers; ${j.wrongKeys} wrong key${j.wrongKeys === 1 ? "" : "s"} (bench/LESSON_CHECKER.md).`;
}

export function jokeLine(j: JokeNumbers): string {
  return `- ${jokeSentence(j)} ${JOKE_DISCLAIMER}`;
}

export function readJokeClaim(text: string): JokeNumbers | null {
  const m = JOKE_RE.exec(text);
  return m
    ? { decks: Number(m[1]), beforeAbsurd: Number(m[2]), beforeTotal: Number(m[3]), afterAbsurd: Number(m[4]), afterTotal: Number(m[5]), version: m[6]!, wrongKeys: Number(m[7]) }
    : null;
}

export function compareJoke(text: string, where: string, j: JokeNumbers | null): Check[] {
  const claimed = readJokeClaim(text);
  const name = `${where} joke-answer line`;
  if (j === null) {
    return claimed === null ? [] : [{ name, claimed: jokeSentence(claimed), actual: "(no bench/distractor-review-v3.json)", ok: false, note: "nothing backs it" }];
  }
  if (claimed === null) return [{ name, claimed: "(missing)", actual: jokeSentence(j), ok: false, note: "the v3 review exists, so the line is required" }];
  const checks: Check[] = [
    {
      name,
      claimed: jokeSentence(claimed),
      actual: jokeSentence(j),
      ok: (Object.keys(j) as Array<keyof JokeNumbers>).every((k) => claimed[k] === j[k]),
    },
  ];
  const line = text.split("\n").find((l) => JOKE_RE.test(l)) ?? "";
  if (!line.includes(JOKE_DISCLAIMER)) checks.push({ name: `${name} disclaimer`, claimed: "(missing)", actual: JOKE_DISCLAIMER, ok: false, note: "the line must say it is an AI review" });
  return checks;
}

/** Rewrite the line's numbers, or insert it after the key-review line. */
export function fixJoke(text: string, j: JokeNumbers): string {
  if (JOKE_RE.test(text)) return text.replace(JOKE_RE, jokeSentence(j));
  if (OLD_JOKE_RE.test(text)) return text.replace(OLD_JOKE_RE, jokeSentence(j));
  if (V4_JOKE_RE.test(text)) return text.replace(V4_JOKE_RE, jokeSentence(j));
  const lines = text.split("\n");
  const at = lines.findIndex((l) => KEY_RE.test(l));
  if (at < 0) return text;
  lines.splice(at + 1, 0, jokeLine(j));
  return lines.join("\n");
}
