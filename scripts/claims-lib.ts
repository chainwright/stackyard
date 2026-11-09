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
    note: `floor(${withCommas(FLOPPY_BYTES)} / living export bytes)`,
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

/** Within tolerance? Player KB ±0.5, the file size ±10 %, everything else exact. */
function close(name: keyof WriteupNumbers, claimed: number, actual: number): boolean {
  if (name === "kb") return actual > 0 && Math.abs(actual - claimed) <= 0.5;
  if (name === "fileKb") return actual > 0 && Math.abs(actual - claimed) <= actual * 0.1;
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
    ...(c.name === "kb" ? { note: "±0.5 KB" } : c.name === "fileKb" ? { note: "±10 %" } : {}),
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
