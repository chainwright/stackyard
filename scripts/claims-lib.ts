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
  { name: "mutants", label: "mutants (N-mutant script)", re: /\b([Aa]n? )(\d+)(-mutant script)/g, format: int, lead: (n) => `${articleFor(n)} ` },
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
      // TASK-39d: "A 118-mutant script" at a sentence start keeps its capital.
      if (m[1]!.toLowerCase() !== want.toLowerCase()) {
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
      const lead = p.lead ? p.lead(actual[p.name]) : (s[0] ?? "");
      // TASK-39d: keep a capitalised article capitalised ("A 118-mutant script").
      const cased = p.lead && /^[A-Z]/.test(s[0]!) ? lead.charAt(0).toUpperCase() + lead.slice(1) : lead;
      return `${cased}${v}${s[2]}`;
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

// ---------------------------------------------------------------------------
// TASK-37a: the mutant count is backed by a logged run (docs/mutation-runs/).
// `npm run check:mutants:log` writes a log only when every mutant was killed.
// The write-up's "N of N killed" must match the NEWEST log, and that log must
// have been made with the CURRENT scripts/mutation-check.ts (same sha256).

export const MUTATION_RERUN = "re-run npm run check:mutants:log";

export interface MutationLog {
  file: string;
  /** ISO UTC date-time of the run. */
  date: string;
  head: string;
  clean: boolean;
  node: string;
  sha256: string;
  killed: string[];
  /** N from the final "mutation-check: N of N mutants killed." line. */
  n: number;
}

/** The log's text, from the run's facts and its raw output. */
export function formatMutationLog(f: Omit<MutationLog, "file" | "killed" | "n">, output: string): string {
  const lines = output.split(/\r?\n/);
  const killed = lines.filter((l) => /^\s*KILLED\s/.test(l)).map((l) => l.trimEnd());
  const final = [...lines].reverse().find((l) => /^mutation-check: \d+ of \d+ mutants killed\.$/.test(l.trim()));
  if (final === undefined) throw new Error("the mutation check printed no final line");
  return [
    `Date (UTC): ${f.date}`,
    `HEAD: ${f.head}`,
    `Working tree clean: ${f.clean ? "yes" : "no (uncommitted changes)"}`,
    `Node: ${f.node}`,
    `sha256 scripts/mutation-check.ts: ${f.sha256}`,
    "",
    ...killed,
    "",
    final.trim(),
    "",
  ].join("\n");
}

export function parseMutationLog(file: string, text: string): MutationLog | null {
  const get = (k: string): string | undefined => new RegExp(`^${k}: (.+)$`, "m").exec(text)?.[1]?.trim();
  const date = get("Date \\(UTC\\)");
  const sha256 = get("sha256 scripts/mutation-check\\.ts");
  const final = /^mutation-check: (\d+) of (\d+) mutants killed\.$/m.exec(text);
  if (date === undefined || sha256 === undefined || final === null || final[1] !== final[2]) return null;
  return {
    file,
    date,
    head: get("HEAD") ?? "",
    clean: (get("Working tree clean") ?? "").startsWith("yes"),
    node: get("Node") ?? "",
    sha256,
    killed: text.split("\n").filter((l) => /^\s*KILLED\s/.test(l)),
    n: Number(final[1]),
  };
}

/** The newest log in `logs` (by the date-time inside each), or null. */
export function newestMutationLog(logs: Array<{ file: string; text: string }>): MutationLog | null {
  const parsed = logs.map((l) => parseMutationLog(l.file, l.text)).filter((l): l is MutationLog => l !== null);
  parsed.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return parsed[0] ?? null;
}

/** The write-up's "N of N killed" against the newest log and the current mutation-check.ts hash. */
export function compareMutationLog(text: string, where: string, log: MutationLog | null, currentSha256: string): Check[] {
  const m = /, (\d+) of (\d+) killed/.exec(text);
  const name = `${where} mutants killed vs docs/mutation-runs`;
  if (m === null) return [];
  const claimed = Number(m[1]);
  if (log === null) return [{ name, claimed, actual: "(no log)", ok: false, note: `no run is logged in docs/mutation-runs/; ${MUTATION_RERUN}` }];
  const checks: Check[] = [
    { name, claimed, actual: log.n, ok: claimed === log.n && Number(m[2]) === log.n, note: `${log.file}; ${MUTATION_RERUN} if it is out of date` },
  ];
  if (log.sha256 !== currentSha256) {
    checks.push({ name: `${where} mutation log matches scripts/mutation-check.ts`, claimed: log.sha256.slice(0, 12), actual: currentSha256.slice(0, 12), ok: false, note: `the mutant set changed since ${log.file}; ${MUTATION_RERUN}` });
  }
  return checks;
}

// ---------------------------------------------------------------------------
// TASK-39f: the judge docs (JUDGES.md, EVIDENCE.md) repeat the headline
// numbers, so every phrase below is checked wherever it appears. EVIDENCE.md
// must carry each one at least once; JUDGES.md may omit any. "N hook firings"
// is also checked in the README and the write-up (presence not required).

/** The judge files at the repo root. */
export const JUDGE_FILES = ["JUDGES.md", "EVIDENCE.md", "CLAIMS.md"] as const;

/** What the judge-doc phrases are measured against. */
export interface JudgeNumbers {
  /** Vitest total. */
  tests: number;
  /** check:trace traced ids (only when traced = total; else -1). */
  traced: number;
  /** Numbered invariants in the validator. */
  invariants: number;
  /** fc.property / fc.asyncProperty calls in tests/. */
  properties: number;
  /** numRuns of the round-trip property test. */
  runs: number;
  /** Mutants defined in scripts/mutation-check.ts. */
  mutants: number;
  /** N of the newest mutation log (-1 when there is none). */
  mutantsLogged: number;
  /** Player bundle, gzipped KB (KiB). */
  kb: number;
  /** The living export of the water-cycle fixture, decimal KB. */
  fileKb: number;
  /** The floppy claim. */
  floppy: number;
  /** bench/files/*.html. */
  benchFiles: number;
  /** The bold "Whole session" total in docs/kiro-sessions/README.md. */
  hookFirings: number;
}

export type JudgeKey = "tests" | "traced" | "invariants" | "properties" | "runs" | "mutants" | "kb" | "fileKb" | "floppy" | "benchFiles" | "hookFirings";

interface JudgePattern {
  key: JudgeKey;
  label: string;
  /** Group 1 is the (first) number; "N of M" patterns carry M in group 3. */
  re: RegExp;
  pair?: boolean;
  format: (n: number) => string;
}

const num = (s: string): number => Number(s.replace(/,/g, ""));

const JUDGE_PATTERNS: JudgePattern[] = [
  { key: "tests", label: "N tests pass", re: /\b(\d[\d,]*)( tests pass)\b/g, format: withCommas },
  { key: "traced", label: "N of M lettered task ids", re: /\b(\d+)( of )(\d+)( lettered task ids)/g, pair: true, format: int },
  { key: "invariants", label: "N stack invariants", re: /\b(\d+)( stack invariants)\b/g, format: int },
  { key: "properties", label: "N fast-check properties", re: /\b(\d+)( fast-check properties)/g, format: int },
  { key: "runs", label: "N-run round trip", re: /\b(\d[\d,]*)(-run round trip)/g, format: withCommas },
  { key: "mutants", label: "N of M mutants killed", re: /\b(\d+)( of )(\d+)( mutants killed)/g, pair: true, format: int },
  { key: "kb", label: "N KB gzipped", re: /\b(\d+(?:\.\d+)?)( KB gzipped)/g, format: (n) => n.toFixed(1) },
  { key: "fileKb", label: "about N KB", re: /\babout (\d+)( KB)\b/g, format: int },
  { key: "floppy", label: "N lesson files … fit on a 1.44 MB floppy", re: /\b(\d+)( lesson files like the water-cycle test deck fit on a 1\.44 MB floppy)/g, format: int },
  { key: "benchFiles", label: "N bench lesson files", re: /\b(\d+)( bench lesson files)/g, format: int },
  { key: "hookFirings", label: "N hook firings", re: /\b(\d[\d,]*)( hook firings)/g, format: withCommas },
];

/** Every judge-doc phrase in `text`, in pattern order, with the numbers it states. */
export function readJudgeClaims(text: string): Array<{ key: JudgeKey; label: string; values: number[] }> {
  const out: Array<{ key: JudgeKey; label: string; values: number[] }> = [];
  for (const p of JUDGE_PATTERNS) {
    for (const m of text.matchAll(p.re)) {
      const values = [num(m[1]!)];
      if (p.pair) values.push(num(m[3]!));
      out.push({ key: p.key, label: p.label, values });
    }
  }
  return out;
}

/** The value a phrase must state (mutants: the script AND the newest log must agree). */
function judgeTarget(key: JudgeKey, a: JudgeNumbers): number {
  if (key === "mutants") return a.mutants === a.mutantsLogged ? a.mutants : -1;
  return a[key];
}

function judgeClose(key: JudgeKey, claimed: number, actual: number): boolean {
  if (actual <= 0) return false;
  if (key === "kb") return Math.abs(actual - claimed) <= 0.5;
  if (key === "fileKb") return Math.abs(actual - claimed) <= actual * FILE_KB_TOLERANCE;
  return claimed === actual;
}

/**
 * One Check per phrase found in `text` (`where` names the file). `required`
 * lists the phrases the file must carry at least once (all of them for
 * EVIDENCE.md, none for JUDGES.md, the README and the write-up).
 */
export function compareJudgeDoc(text: string, where: string, a: JudgeNumbers, required: readonly JudgeKey[] = [], only?: readonly JudgeKey[]): Check[] {
  const claims = readJudgeClaims(text).filter((c) => only === undefined || only.includes(c.key));
  const checks: Check[] = claims.map((c) => {
    const target = judgeTarget(c.key, a);
    return {
      name: `${where} ${c.label}`,
      claimed: c.values.map((v) => (c.key === "kb" ? String(v) : withCommas(v))).join(" of "),
      actual: c.key === "mutants" ? `${a.mutants} in the script, ${a.mutantsLogged} in the newest log` : target,
      ok: c.values.every((v) => judgeClose(c.key, v, target)),
      ...(c.key === "kb" ? { note: "±0.5 KB" } : c.key === "fileKb" ? { note: "±3 %, decimal KB (bytes / 1000)" } : {}),
    };
  });
  for (const key of required) {
    if (!claims.some((c) => c.key === key)) {
      const label = JUDGE_PATTERNS.find((p) => p.key === key)!.label;
      checks.push({ name: `${where} ${label}`, claimed: "(missing)", actual: judgeTarget(key, a), ok: false, note: `${where} must state it` });
    }
  }
  return checks;
}

/** Every phrase EVIDENCE.md must carry. */
export const EVIDENCE_REQUIRED: readonly JudgeKey[] = JUDGE_PATTERNS.map((p) => p.key).filter((k, i, xs) => xs.indexOf(k) === i);

/**
 * Rewrite the judge-doc numbers in `text` from MEASURED values. A phrase whose
 * measured value is unknown (≤ 0, or the mutant script and log disagree) is
 * left alone: `--fix` never invents a number. "about N KB" within tolerance is
 * left as written.
 */
export function applyJudgeFix(text: string, a: JudgeNumbers, only?: readonly JudgeKey[]): string {
  let out = text;
  for (const p of JUDGE_PATTERNS) {
    if (only !== undefined && !only.includes(p.key)) continue;
    const target = judgeTarget(p.key, a);
    if (target <= 0) continue;
    const v = p.format(target);
    out = out.replace(p.re, (whole: string, ...g: unknown[]) => {
      const s = g.map((x) => (typeof x === "string" ? x : ""));
      if (judgeClose(p.key, num(s[0]!), target) && (!p.pair || judgeClose(p.key, num(s[2]!), target))) return whole;
      if (p.key === "fileKb") return `about ${v}${s[1]}`;
      return p.pair ? `${v}${s[1]}${v}${s[3]}` : `${v}${s[1]}`;
    });
  }
  return out;
}

/** The bold total in the "| Whole session …" row of docs/kiro-sessions/README.md's recount table (null if absent). */
export function hookFiringsTotal(sessionsReadme: string): number | null {
  const row = sessionsReadme.split("\n").find((l) => l.startsWith("| Whole session"));
  if (row === undefined) return null;
  const m = /\*\*(\d[\d,]*)\*\*/.exec(row);
  return m ? num(m[1]!) : null;
}

/** One failed Check per missing judge file. */
export function compareJudgeFilesExist(exists: (file: string) => boolean): Check[] {
  return JUDGE_FILES.filter((f) => !exists(f)).map((f) => ({ name: `${f} exists`, claimed: "(missing)", actual: f, ok: false, note: "the judge files must be at the repo root" }));
}

// ---------------------------------------------------------------------------
// TASK-39g: CLAIMS.md. Each row `| C<n> | "<quote>" … | <where> | <status> | <proof> |`.
// The quote must be on the cited line of README.md / docs/DEVPOST_WRITEUP.md;
// `blog` refs are checked by hand.

export const CLAIM_FILES = ["README.md", "docs/DEVPOST_WRITEUP.md"] as const;
export const MIN_CLAIM_ROWS = 40;

export interface ClaimRow {
  /** 1-based line of the row in CLAIMS.md. */
  line: number;
  id: string;
  quote: string | null;
  refs: Array<{ file: string; line: number } | { file: "blog" } | { file: string; line: null }>;
  where: string;
  status: string;
  proof: string;
}

/** Split a markdown table row into its cells (no escaped pipes in CLAIMS.md). */
function cells(row: string): string[] {
  return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

export function parseClaimRows(claims: string): ClaimRow[] {
  const rows: ClaimRow[] = [];
  claims.split("\n").forEach((l, i) => {
    if (!/^\|\s*C\d+\s*\|/.test(l)) return;
    const c = cells(l);
    const [id = "", claim = "", where = "", status = ""] = c;
    const proof = c.slice(4).join("|");
    const q = /"([^"]+)"/.exec(claim);
    const refs = where.split(",").map((r) => r.trim()).filter((r) => r !== "").map((r) => {
      if (r === "blog") return { file: "blog" as const };
      const m = /^(.+):(\d+)$/.exec(r);
      return m ? { file: m[1]!, line: Number(m[2]) } : { file: r, line: null };
    });
    rows.push({ line: i + 1, id, quote: q ? q[1]! : null, refs, where, status, proof });
  });
  return rows;
}

/** The 1-based lines of `file` that contain `quote`. */
function linesWith(file: string, quote: string): number[] {
  const out: number[] = [];
  file.split("\n").forEach((l, i) => {
    if (l.includes(quote)) out.push(i + 1);
  });
  return out;
}

/** Every CLAIMS.md rule; `files` maps "README.md" / "docs/DEVPOST_WRITEUP.md" to their text. */
export function compareClaimsTable(claims: string, files: Record<string, string>): Check[] {
  const rows = parseClaimRows(claims);
  const checks: Check[] = [];
  const bad = (name: string, claimed: string | number, actual: string | number, note: string): void => {
    checks.push({ name: `CLAIMS ${name}`, claimed, actual, ok: false, note });
  };
  checks.push({ name: "CLAIMS rows", claimed: rows.length, actual: `at least ${MIN_CLAIM_ROWS}`, ok: rows.length >= MIN_CLAIM_ROWS });
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.id)) bad(`${r.id} id`, r.id, "a unique id", "the id is used twice");
    seen.add(r.id);
    if (r.quote === null) bad(`${r.id} quote`, "(no quote)", "a claim in straight double quotes", "the claim cell must quote the claim");
    if (r.status !== "TRUE" && r.status !== "PARTIAL") bad(`${r.id} status`, r.status, "TRUE or PARTIAL", "the status must be exactly TRUE or PARTIAL");
    if (r.status === "PARTIAL" && !r.proof.startsWith("Missing:")) bad(`${r.id} missing`, r.proof.slice(0, 40), "Missing: …", "a PARTIAL row must say what is missing");
    if (r.refs.length === 0) bad(`${r.id} where`, "(empty)", "README.md:<n>, docs/DEVPOST_WRITEUP.md:<n> or blog", "the row must say where the claim is");
    for (const ref of r.refs) {
      if (ref.file === "blog") continue;
      const text = files[ref.file];
      if (text === undefined || !("line" in ref) || ref.line === null) {
        bad(`${r.id} where`, r.where, "README.md:<n>, docs/DEVPOST_WRITEUP.md:<n> or blog", "unknown file or no line number");
        continue;
      }
      if (r.quote === null) continue;
      const line = text.split("\n")[ref.line - 1] ?? "";
      if (line.includes(r.quote)) continue;
      const found = linesWith(text, r.quote);
      bad(
        `${r.id} quote on ${ref.file}:${ref.line}`,
        `"${r.quote.slice(0, 50)}"`,
        found.length === 0 ? `(not in ${ref.file})` : `${ref.file}:${found.join(", ")}`,
        found.length === 1 ? "the line moved; npm run check:claims -- --fix corrects it" : found.length === 0 ? "the quote is not in the file: shorten the quote or mark the claim" : "the quote is on several lines: cite one",
      );
    }
  }
  for (const want of [...CLAIM_FILES, "blog"]) {
    if (!rows.some((r) => r.refs.some((ref) => ref.file === want))) bad(`cites ${want}`, "(none)", want, `at least one row must cite ${want}`);
  }
  return checks;
}

/**
 * `--fix` for CLAIMS.md: when a quote is not on its cited line but is on
 * exactly one line of that file, rewrite the line number. Anything else (no
 * line, several lines, a blog ref) is left for the report.
 */
export function fixClaimsTable(claims: string, files: Record<string, string>): string {
  const lines = claims.split("\n");
  for (const r of parseClaimRows(claims)) {
    if (r.quote === null) continue;
    const quote = r.quote;
    let where = r.where;
    for (const ref of r.refs) {
      if (ref.file === "blog" || !("line" in ref) || ref.line === null) continue;
      const text = files[ref.file];
      if (text === undefined) continue;
      if ((text.split("\n")[ref.line - 1] ?? "").includes(quote)) continue;
      const found = linesWith(text, quote);
      if (found.length !== 1) continue;
      where = where.replace(`${ref.file}:${ref.line}`, `${ref.file}:${found[0]}`);
    }
    if (where !== r.where) {
      const row = lines[r.line - 1]!;
      const c = row.split("|");
      // cells: ["", id, claim, where, status, proof…, ""]
      c[3] = c[3]!.replace(r.where, where);
      lines[r.line - 1] = c.join("|");
    }
  }
  return lines.join("\n");
}
