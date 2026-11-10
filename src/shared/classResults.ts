// src/shared/classResults.ts
// Reading pasted results codes and tallying a class (TASK-34b3, TASK-34b4;
// .kiro/specs/class-results/design.md §3). Pure functions: no DOM, no network,
// no storage. Used by the living file's "Class results" panel only, so the
// class file (play only) never carries it.

import type { Stack } from "./types.js";
import {
  codeLength,
  decodeCode,
  lessonKey,
  normalizeCode,
  quizCards,
  type Decoded,
  type DecodeError,
  type LessonKey,
  type Result,
} from "./resultsCode.js";

// ---------------------------------------------------------------------------
// Plain-language messages (audience.md: what happened, then what to do next)

const TYPO = "Check the code; one letter looks wrong.";

export const MESSAGES: Record<DecodeError | "edited" | "repeat" | "already", string> = {
  empty: "",
  "bad-char": "This code has a letter or number codes never use (0, O, 1, I or L). Check it against the pupil's screen.",
  length: "This code is the wrong length for this lesson. Check it, or it may be from a different lesson.",
  check: TYPO,
  range: TYPO,
  lesson: "This code is from a different lesson, or from before its questions changed. Check the pupil played this file.",
  edited: "This code matches the questions as you've changed them. Save a Copy, open the copy and add the code there.",
  repeat: "Same code as one above — counted once.",
  already: "Already added — counted once.",
};

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** A count for a sentence: one to ten in words, 11 and above in digits (audience.md). */
export function countWords(n: number): string {
  return n >= 0 && n <= 10 ? WORDS[n]! : String(n);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Reading what the teacher typed

export interface ReadPiece {
  /** The text as it will be shown back (formatted when it was found by length). */
  typed: string;
  decoded: Decoded;
}

/**
 * Split a paste into codes and decode each (design §3, revised after the spec
 * review). Lines, commas and semicolons always separate. Within a line, the
 * separators are removed and the line is cut into pieces of the two valid
 * lengths so that the most pieces decode; a line where that cannot make every
 * piece good is read token by token as typed instead.
 */
export function readCodes(text: string, lesson: LessonKey): ReadPiece[] {
  const out: ReadPiece[] = [];
  const lengths = [codeLength(lesson.n, false), codeLength(lesson.n, true)];
  for (const raw of text.split(/[\r\n,;]+/)) {
    const line = raw.trim();
    const s = normalizeCode(line);
    if (s.length === 0) continue;
    const parts = partition(s, lengths, lesson);
    if (parts !== null) {
      for (const p of parts) out.push({ typed: p, decoded: decodeCode(p, lesson) });
      continue;
    }
    // Fallback: tokens as typed; a run of short tokens is one code typed with spaces.
    const tokens = line.split(/\s+/).filter((t) => t.length > 0);
    let run: string[] = [];
    const flush = (): void => {
      if (run.length === 0) return;
      const typed = run.join(" ");
      out.push({ typed, decoded: decodeCode(typed, lesson) });
      run = [];
    };
    for (const t of tokens) {
      if (normalizeCode(t).length < lengths[0]!) {
        run.push(t);
        if (normalizeCode(run.join("")).length >= lengths[0]!) flush();
      } else {
        flush();
        out.push({ typed: t, decoded: decodeCode(t, lesson) });
      }
    }
    flush();
  }
  return out;
}

/** The cut of `s` into valid-length pieces that ALL decode, or null. */
function partition(s: string, lengths: number[], lesson: LessonKey): string[] | null {
  // best[i]: the most good pieces covering s[0..i), with the cut that gets it.
  const best: Array<{ good: number; count: number; prev: number } | null> = new Array(s.length + 1).fill(null);
  best[0] = { good: 0, count: 0, prev: -1 };
  for (let i = 1; i <= s.length; i++) {
    for (const L of lengths) {
      if (i < L || best[i - L] === null) continue;
      const before = best[i - L]!;
      const good = before.good + (decodeCode(s.slice(i - L, i), lesson).ok ? 1 : 0);
      if (best[i] === null || good > best[i]!.good) best[i] = { good, count: before.count + 1, prev: i - L };
    }
  }
  const end = best[s.length];
  if (end === null || end === undefined || end.good !== end.count) return null;
  const pieces: string[] = [];
  for (let i = s.length; i > 0; i = best[i]!.prev) pieces.unshift(s.slice(best[i]!.prev, i));
  return pieces;
}

export interface Problem {
  typed: string;
  message: string;
  /** "bad" stays in the text box to be fixed; "repeat" is only a note. */
  kind: "bad" | "repeat";
}

export interface AddResult {
  /** All accepted codes, the old ones first (normalised, no repeats). */
  codes: string[];
  /** How many new pupils this paste added. */
  added: number;
  problems: Problem[];
  /** What goes back into the text box: the bad codes only, one per line. */
  keep: string;
}

/**
 * Add a paste to the codes already accepted. `edited`, when given, is the
 * lesson as changed in this session: a code that matches it (and not the
 * lesson the file opened with) gets its own message (spec review P0-2).
 */
export function addCodes(existing: string[], text: string, lesson: LessonKey, edited?: LessonKey): AddResult {
  const codes = [...existing];
  const before = new Set(existing);
  const thisPaste = new Set<string>();
  const problems: Problem[] = [];
  let added = 0;
  for (const piece of readCodes(text, lesson)) {
    const d = piece.decoded;
    if (d.ok) {
      if (before.has(d.code)) problems.push({ typed: piece.typed, message: MESSAGES.already, kind: "repeat" });
      else if (thisPaste.has(d.code)) problems.push({ typed: piece.typed, message: MESSAGES.repeat, kind: "repeat" });
      else {
        thisPaste.add(d.code);
        codes.push(d.code);
        added++;
      }
      continue;
    }
    const matchesEdit =
      d.error === "lesson" && edited !== undefined && edited.fingerprint !== lesson.fingerprint && decodeCode(piece.typed, edited).ok;
    problems.push({ typed: piece.typed, message: matchesEdit ? MESSAGES.edited : MESSAGES[d.error], kind: "bad" });
  }
  const keep = problems.filter((p) => p.kind === "bad").map((p) => p.typed).join("\n");
  return { codes, added, problems, keep };
}

/** The status sentence after a paste: "Five pupils counted. Two codes need checking." */
export function statusLine(pupils: number, bad: number): string {
  const counted = `${cap(countWords(pupils))} pupil${pupils === 1 ? "" : "s"} counted.`;
  if (bad === 0) return counted;
  return `${counted} ${cap(countWords(bad))} code${bad === 1 ? " needs" : "s need"} checking.`;
}

// ---------------------------------------------------------------------------
// The tally (design §3)

export interface PupilRow {
  code: string;
  /** Initials when the code carries them, else "Pupil N" in the order added. */
  name: string;
  hasInitials: boolean;
  results: Result[];
  score: number;
}

export interface QuestionRow {
  /** 1-based: Q1 … Qn in deck order. */
  q: number;
  question: string;
  right: number;
  wrong: number;
  none: number;
}

export interface Tally {
  n: number;
  pupils: PupilRow[];
  questions: QuestionRow[];
  /** The middle score, or null with no pupils. */
  median: number | null;
  /** Question numbers to revisit, most-missed first. */
  revisit: number[];
}

/** The median of a list (the mean of the middle two for an even count). */
export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Tally the class from its codes, against the lesson the file opened with.
 * A repeated code is one pupil; a code that does not decode is skipped (the
 * panel lists it when it is added).
 */
export function tally(stack: Stack, codes: string[]): Tally {
  const key = lessonKey(stack);
  const quiz = quizCards(stack);
  const pupils: PupilRow[] = [];
  const seen = new Set<string>();
  for (const raw of codes) {
    const d = decodeCode(raw, key);
    if (!d.ok) continue;
    if (seen.has(d.code)) continue;
    seen.add(d.code);
    pupils.push({
      code: d.code,
      name: d.initials.length > 0 ? d.initials : `Pupil ${pupils.length + 1}`,
      hasInitials: d.initials.length > 0,
      results: d.results,
      score: d.results.filter((r) => r === "right").length,
    });
  }
  const questions: QuestionRow[] = quiz.map((card, i) => {
    const t = card.elements.find((e) => e.type === "text");
    const row: QuestionRow = { q: i + 1, question: t && t.type === "text" ? t.content : "", right: 0, wrong: 0, none: 0 };
    for (const p of pupils) row[p.results[i]!]++;
    return row;
  });
  const revisit = questions
    .filter((r) => r.right + r.wrong > 0 && 3 * r.wrong >= r.right + r.wrong)
    .sort((a, b) => b.wrong * (a.right + a.wrong) - a.wrong * (b.right + b.wrong) || a.q - b.q)
    .map((r) => r.q);
  return { n: quiz.length, pupils, questions, median: median(pupils.map((p) => p.score)), revisit };
}

/** "Q4 missed by 9 of 24" (and how many did not reach it). Counts are data: digits. */
export function missedLine(r: QuestionRow, pupils: number): string {
  return `Q${r.q} missed by ${r.wrong} of ${pupils}` + (r.none > 0 ? ` (${r.none} did not reach it)` : "");
}

export function formatScore(x: number): string {
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
}

const MARK: Record<Result, string> = { right: "✓", wrong: "✗", none: "–" };

/** The whole table as plain text, for "Copy as Text". */
export function resultsText(t: Tally, title: string): string {
  const P = t.pupils.length;
  const lines = [`Class results — ${title}`];
  if (P === 0) return [...lines, "No codes yet."].join("\n");
  lines.push(`${P} pupil${P === 1 ? "" : "s"} · middle score (median) ${formatScore(t.median!)} of ${t.n}`, "");
  for (const r of t.questions) lines.push(`Q${r.q} ${r.question}: ${r.right} right, ${r.wrong} wrong, ${r.none} did not reach it`);
  lines.push("");
  lines.push(
    t.revisit.length === 0
      ? "Revisit: none"
      : `Revisit: ${t.revisit.map((q) => `Q${q} (missed by ${t.questions[q - 1]!.wrong} of ${P})`).join(", ")}`,
  );
  lines.push("", "Pupils:");
  for (const p of t.pupils) {
    lines.push(`${p.name}: ${p.score} of ${t.n} — ${p.results.map((r, i) => `Q${i + 1} ${MARK[r]}`).join(", ")}`);
  }
  return lines.join("\n");
}
