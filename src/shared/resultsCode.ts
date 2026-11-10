// src/shared/resultsCode.ts
// The class-results code (TASK-34b1, .kiro/specs/class-results/design.md §1).
//
// A pupil's end card shows a short code; the teacher types it into the Teacher
// tab of her own copy of the file. This module is the ONLY definition of the
// format, shared by the player (which encodes) and the living file (which
// decodes), so the two can never disagree.
//
//   FFF TTT R…R [III] C
//   fingerprint(3) · play tag(3) · results(K) · initials(3, optional) · check(1)
//
// Alphabet: 31 characters without the look-alikes 0 O 1 I L. 31 is prime, so a
// weighted sum mod 31 catches every single substitution and every adjacent swap
// (proof in design §1.4). No BigInt: the player must run in 2018 browsers, so
// the base-31 number is a small digit array.

import type { ButtonElement, Card, Stack } from "./types.js";

export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const BASE = 31;
/** 31³: the size of a three-character field (fingerprint, tag, initials). */
export const FIELD3 = BASE * BASE * BASE;
/** Largest initials index: A…Z, AA…ZZ, AAA…ZZZ in bijective base 26. */
export const MAX_INITIALS = 26 + 26 * 26 + 26 * 26 * 26;
/** Part of the fingerprint: a new format changes it, so old codes read as another lesson. */
const FORMAT_TAG = "stackyard-results-1";

/** One quiz card's result in one play-through. "none" = not reached. */
export type Result = "right" | "wrong" | "none";
const TRIT: Record<Result, number> = { none: 0, right: 1, wrong: 2 };
const FROM_TRIT: Result[] = ["none", "right", "wrong"];

// ---------------------------------------------------------------------------
// The lesson

/** The quiz cards, in deck order: Q1 … Qn. */
export function quizCards(stack: Stack): Card[] {
  return stack.cards.filter((c) => c.kind === "quiz");
}

/**
 * The answer buttons of a quiz card: a button with at least one action (the
 * renderer's answer-tile rule). One helper for the tiles, the fingerprint and
 * the recording (spec review P1-3).
 */
export function quizAnswerButtons(card: Card): ButtonElement[] {
  if (card.kind !== "quiz") return [];
  return card.elements.filter((e): e is ButtonElement => e.type === "button" && e.actions.length > 0);
}

/** True when an answer button is the right one (a score action with delta > 0). */
export function isRightAnswer(btn: ButtonElement): boolean {
  return btn.actions.some((a) => a.type === "score" && a.delta > 0);
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The lesson's fingerprint, 0 … 31³−1: FNV-1a over every quiz card's id,
 * question and answers (with which one is right), in deck order. Positions,
 * pictures, story and flash cards are not in it (design §1.3).
 */
export function lessonFingerprint(stack: Stack): number {
  let text = FORMAT_TAG;
  for (const card of quizCards(stack)) {
    const q = card.elements.find((e) => e.type === "text");
    const question = q && q.type === "text" ? q.content : "";
    const answers = quizAnswerButtons(card).map((b) => (isRightAnswer(b) ? "+" : "-") + b.label);
    text += "\n" + JSON.stringify([card.id, question, answers]);
  }
  return fnv1a(text) % FIELD3;
}

/** What a decoder needs to know about its own lesson. */
export interface LessonKey {
  fingerprint: number;
  /** The number of quiz cards. */
  n: number;
}

export function lessonKey(stack: Stack): LessonKey {
  return { fingerprint: lessonFingerprint(stack), n: quizCards(stack).length };
}

/** Each quiz card's result, in deck order, from the first answers recorded. */
export function resultsOf(stack: Stack, answers: Record<string, boolean>): Result[] {
  return quizCards(stack).map((c) => (answers[c.id] === undefined ? "none" : answers[c.id] ? "right" : "wrong"));
}

// ---------------------------------------------------------------------------
// Base-31 arithmetic on little-endian digit arrays (no BigInt)

function mulAdd(d: number[], m: number, a: number): void {
  let carry = a;
  for (let j = 0; j < d.length; j++) {
    const v = d[j]! * m + carry;
    d[j] = v % BASE;
    carry = Math.floor(v / BASE);
  }
  while (carry > 0) {
    d.push(carry % BASE);
    carry = Math.floor(carry / BASE);
  }
}

function divMod(d: number[], m: number): number {
  let rem = 0;
  for (let j = d.length - 1; j >= 0; j--) {
    const v = rem * BASE + d[j]!;
    d[j] = Math.floor(v / m);
    rem = v % m;
  }
  return rem;
}

/** K: the number of characters for n results, the smallest K with 31^K ≥ 3^n. */
export function resultsDigits(n: number): number {
  if (n <= 0) return 0;
  const d = [1];
  for (let i = 0; i < n; i++) mulAdd(d, 3, 0);
  // 3^n is never a power of 31, so it needs exactly d.length digits and 31^len > 3^n.
  while (d.length > 1 && d[d.length - 1] === 0) d.pop();
  return d.length;
}

/** The whole code length: L₀ = K + 7, L₁ = K + 10 (design §1.2). */
export function codeLength(n: number, withInitials: boolean): number {
  return 3 + 3 + resultsDigits(n) + (withInitials ? 3 : 0) + 1;
}

function field3(v: number): number[] {
  return [Math.floor(v / (BASE * BASE)) % BASE, Math.floor(v / BASE) % BASE, v % BASE];
}

function unfield3(xs: number[]): number {
  return xs[0]! * BASE * BASE + xs[1]! * BASE + xs[2]!;
}

// ---------------------------------------------------------------------------
// The check character (design §1.4)

/** Weight of 1-based position p: 1 … 30, never 0 mod 31. */
function weight(p: number): number {
  return ((p - 1) % (BASE - 1)) + 1;
}

const INVERSE: number[] = (() => {
  const inv = [0];
  for (let w = 1; w < BASE; w++) {
    let x = 1;
    while ((w * x) % BASE !== 1) x++;
    inv.push(x);
  }
  return inv;
})();

/** The check value for a payload (values 0…30): it makes Σ w_p·v_p ≡ 0 (mod 31). */
export function checkChar(payload: number[]): number {
  let sum = 0;
  for (let i = 0; i < payload.length; i++) sum = (sum + weight(i + 1) * payload[i]!) % BASE;
  const w = weight(payload.length + 1);
  return (((BASE - sum) % BASE) * INVERSE[w]!) % BASE;
}

/** True when a whole code (payload plus check value) sums to 0 mod 31. */
export function checkOk(values: number[]): boolean {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum = (sum + weight(i + 1) * values[i]!) % BASE;
  return sum === 0;
}

// ---------------------------------------------------------------------------
// Initials

/** Fold to at most three letters A–Z: accents removed (Á → A), anything else dropped. */
export function foldInitials(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);
}

function initialsIndex(s: string): number {
  let v = 0;
  for (let i = 0; i < s.length; i++) v = v * 26 + (s.charCodeAt(i) - 64);
  return v;
}

function initialsFrom(v: number): string {
  let s = "";
  while (v > 0) {
    v -= 1;
    s = String.fromCharCode(65 + (v % 26)) + s;
    v = Math.floor(v / 26);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Encode / decode

/** A fresh play tag, 0 … 31³−1 (design §1.5). Random, not secret. */
export function drawTag(): number {
  try {
    const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
    if (c && typeof c.getRandomValues === "function") return c.getRandomValues(new Uint32Array(1))[0]! % FIELD3;
  } catch {
    /* fall through */
  }
  return Math.floor(Math.random() * FIELD3) % FIELD3;
}

export interface CodeInput {
  fingerprint: number;
  results: Result[];
  tag: number;
  /** Folded initials, "" or undefined for none. */
  initials?: string | undefined;
}

/** The code, normalised (no dashes). */
export function encodeCode(input: CodeInput): string {
  const n = input.results.length;
  const K = resultsDigits(n);
  const d = [0];
  for (let i = n - 1; i >= 0; i--) mulAdd(d, 3, TRIT[input.results[i]!]);
  const digits: number[] = [];
  for (let j = K - 1; j >= 0; j--) digits.push(d[j] ?? 0);
  const initials = foldInitials(input.initials ?? "");
  const payload = [
    ...field3(input.fingerprint % FIELD3),
    ...field3(input.tag % FIELD3),
    ...digits,
    ...(initials.length > 0 ? field3(initialsIndex(initials)) : []),
  ];
  payload.push(checkChar(payload));
  return payload.map((v) => CODE_ALPHABET[v]).join("");
}

/** Upper-case, without spaces, dashes, dots or underscores. */
export function normalizeCode(text: string): string {
  return text.toUpperCase().replace(/[\s\-._\u2010-\u2015]/g, "");
}

/** Groups of four joined by dashes: ABCD-EFGH-J. */
export function formatCode(code: string): string {
  const c = normalizeCode(code);
  const groups: string[] = [];
  for (let i = 0; i < c.length; i += 4) groups.push(c.slice(i, i + 4));
  return groups.join("-");
}

/** For a screen reader: "A B C D, E F G H, J". */
export function spellCode(code: string): string {
  return formatCode(code)
    .split("-")
    .map((g) => g.split("").join(" "))
    .join(", ");
}

export type DecodeError = "empty" | "bad-char" | "length" | "check" | "lesson" | "range";

export type Decoded =
  | { ok: true; code: string; results: Result[]; initials: string; tag: number; fingerprint: number }
  | { ok: false; code: string; error: DecodeError; badChars?: string };

/**
 * Read a code against this lesson. The checks run in the design §3 order, so
 * a typo is never reported as "a different lesson".
 */
export function decodeCode(text: string, lesson: LessonKey): Decoded {
  const code = normalizeCode(text);
  if (code.length === 0) return { ok: false, code, error: "empty" };
  const values: number[] = [];
  let bad = "";
  for (const ch of code) {
    const v = CODE_ALPHABET.indexOf(ch);
    if (v < 0) {
      if (!bad.includes(ch)) bad += ch;
    } else values.push(v);
  }
  if (bad.length > 0) return { ok: false, code, error: "bad-char", badChars: bad };
  const L0 = codeLength(lesson.n, false);
  const L1 = codeLength(lesson.n, true);
  if (lesson.n <= 0 || (values.length !== L0 && values.length !== L1)) return { ok: false, code, error: "length" };
  if (!checkOk(values)) return { ok: false, code, error: "check" };
  const fingerprint = unfield3(values.slice(0, 3));
  if (fingerprint !== lesson.fingerprint) return { ok: false, code, error: "lesson" };
  const tag = unfield3(values.slice(3, 6));
  const K = resultsDigits(lesson.n);
  const d = values.slice(6, 6 + K).reverse();
  const results: Result[] = [];
  for (let i = 0; i < lesson.n; i++) results.push(FROM_TRIT[divMod(d, 3)]!);
  if (d.some((x) => x !== 0)) return { ok: false, code, error: "range" };
  let initials = "";
  if (values.length === L1) {
    const j = unfield3(values.slice(6 + K, 9 + K));
    if (j < 1 || j > MAX_INITIALS) return { ok: false, code, error: "range" };
    initials = initialsFrom(j);
  }
  return { ok: true, code, results, initials, tag, fingerprint };
}
