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
