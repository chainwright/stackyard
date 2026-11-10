// tests/class-results.test.ts
// TASK-34b3 (reading pasted codes) and TASK-34b4 (the class tally),
// .kiro/specs/class-results/design.md §3.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  MESSAGES,
  addCodes,
  countWords,
  median,
  missedLine,
  readCodes,
  resultsText,
  statusLine,
  tally,
} from "../src/shared/classResults.js";
import { encodeCode, formatCode, lessonKey, quizCards, type Result } from "../src/shared/resultsCode.js";
import { vikingsStack } from "../src/shared/readyMadeStacks.js";
import type { Stack } from "../src/shared/types.js";

const lesson = vikingsStack();
const key = lessonKey(lesson);
const n = key.n;

const resultArb = fc.constantFrom<Result>("right", "wrong", "none");
const pupilArb = fc.record({
  results: fc.array(resultArb, { minLength: n, maxLength: n }),
  tag: fc.integer({ min: 0, max: 31 ** 3 - 1 }),
  initials: fc.option(fc.stringMatching(/^[A-Z]{1,3}$/), { nil: undefined }),
});
type Pupil = { results: Result[]; tag: number; initials: string | undefined };
const codeOf = (p: Pupil): string => encodeCode({ fingerprint: key.fingerprint, ...p });

/** How a teacher might type one code. */
function typed(code: string, style: number): string {
  if (style === 0) return code;
  if (style === 1) return formatCode(code);
  if (style === 2) return formatCode(code).replace(/-/g, " ");
  return formatCode(code).toLowerCase();
}

describe("TASK-34b3: reading pasted codes", () => {
  it("TASK-34b3: property — random codes joined by random separators (lines, spaces, commas, codes typed with spaces) all come back", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(pupilArb, fc.integer({ min: 0, max: 3 }), fc.constantFrom("\n", " ", ", ", "; ", "\r\n", "   ")), { minLength: 1, maxLength: 12 }),
        (items) => {
          const text = items.map(([p, style, sep]) => typed(codeOf(p), style) + sep).join("");
          const got = readCodes(text, key);
          expect(got.map((g) => g.decoded.ok)).toEqual(items.map(() => true));
          expect(got.map((g) => g.decoded.code)).toEqual(items.map(([p]) => codeOf(p)));
        },
      ),
      { numRuns: 300 },
    );
  });

  it("TASK-34b3: the same code twice counts as one pupil, within a paste and across pastes", () => {
    const a = codeOf({ results: Array(n).fill("right"), tag: 1, initials: undefined });
    const b = codeOf({ results: Array(n).fill("right"), tag: 2, initials: undefined });
    expect(a).not.toBe(b); // the play tag keeps two all-right pupils apart
    const first = addCodes([], `${a}\n${formatCode(a)}\n${b}`, key);
    expect(first.codes).toEqual([a, b]);
    expect(first.added).toBe(2);
    expect(first.problems).toEqual([{ typed: a, message: MESSAGES.repeat, kind: "repeat" }]);
    expect(MESSAGES.repeat).toBe("Same code as one above — counted once.");
    expect(first.keep).toBe("");
    const again = addCodes(first.codes, b, key);
    expect(again.codes).toEqual([a, b]);
    expect(again.added).toBe(0);
    expect(again.problems.map((p) => p.message)).toEqual(["Already added — counted once."]);
  });

  it("TASK-34b3: bad codes are listed with the reason, the good ones counted, and only the bad ones stay in the box", () => {
    const good = codeOf({ results: ["right", "wrong", "none", "right", "right", "wrong"], tag: 9, initials: "AB" });
    const typo = good.slice(0, 4) + (good[4] === "A" ? "B" : "A") + good.slice(5);
    const other = vikingsStack();
    const q = quizCards(other)[0]!.elements[0]!;
    if (q.type === "text") q.content = "A different question?";
    const foreign = encodeCode({ fingerprint: lessonKey(other).fingerprint, results: Array(n).fill("right"), tag: 3 });
    const r = addCodes([], [good, typo, "OOPS-1234", "ABCD", foreign].join("\n"), key);
    expect(r.codes).toEqual([good]);
    const bad = r.problems.filter((p) => p.kind === "bad");
    expect(bad.map((p) => p.message)).toEqual([
      "Check the code; one letter looks wrong.",
      MESSAGES["bad-char"],
      MESSAGES.length,
      MESSAGES.lesson,
    ]);
    expect(MESSAGES.lesson.startsWith("This code is from a different lesson")).toBe(true);
    expect(r.keep.split("\n")).toEqual([typo, "OOPS-1234", "ABCD", foreign]);
    expect(statusLine(1, 4)).toBe("One pupil counted. Four codes need checking.");
  });

  it("TASK-34b3: a code that matches the lesson as edited in this session gets its own message (spec review P0-2)", () => {
    const edited: Stack = JSON.parse(JSON.stringify(lesson));
    const q = quizCards(edited)[1]!.elements[0]!;
    if (q.type === "text") q.content = "Edited here?";
    const code = encodeCode({ fingerprint: lessonKey(edited).fingerprint, results: Array(n).fill("wrong"), tag: 5 });
    const r = addCodes([], code, key, lessonKey(edited));
    expect(r.codes).toEqual([]);
    expect(r.problems[0]!.message).toBe(MESSAGES.edited);
    // Without the edited lesson it is simply another lesson.
    expect(addCodes([], code, key).problems[0]!.message).toBe(MESSAGES.lesson);
  });

  it("TASK-34b3: messages follow audience.md — one to ten in words in sentences, digits from 11", () => {
    expect([0, 1, 7, 10, 11, 24].map(countWords)).toEqual(["no", "one", "seven", "ten", "11", "24"]);
    expect(statusLine(24, 0)).toBe("24 pupils counted.");
    expect(statusLine(3, 1)).toBe("Three pupils counted. One code needs checking.");
    for (const m of Object.values(MESSAGES)) expect(m).not.toMatch(/\bstack\b|error|invalid/i);
  });
});

describe("TASK-34b4: the class tally", () => {
  it("TASK-34b4: aggregation property — the table equals the counts recomputed from each pupil's results, with repeats and junk mixed in", () => {
    fc.assert(
      fc.property(
        fc.array(pupilArb, { minLength: 0, maxLength: 30 }),
        fc.array(fc.nat(), { maxLength: 8 }),
        (pupils, repeats) => {
          const codes = pupils.map(codeOf);
          const pasted = [...codes, ...repeats.filter(() => codes.length > 0).map((i) => codes[i % codes.length]!), "NOT-A-CODE"];
          const t = tally(lesson, pasted);
          const unique = [...new Map(pupils.map((p) => [codeOf(p), p])).values()];
          expect(t.pupils).toHaveLength(unique.length);
          for (let i = 0; i < n; i++) {
            const row = t.questions[i]!;
            expect(row.q).toBe(i + 1);
            for (const k of ["right", "wrong", "none"] as const) {
              expect(row[k]).toBe(unique.filter((p) => p.results[i] === k).length);
            }
            expect(row.right + row.wrong + row.none).toBe(unique.length);
          }
          const scores = unique.map((p) => p.results.filter((r) => r === "right").length);
          expect(t.median).toBe(median(scores));
          expect(t.pupils.map((p) => p.score)).toEqual(scores);
          // Initials only when the code carries them.
          t.pupils.forEach((p, i) => {
            expect(p.hasInitials).toBe(unique[i]!.initials !== undefined);
            expect(p.name).toBe(unique[i]!.initials ?? `Pupil ${i + 1}`);
          });
          // Revisit: answered > 0 and at least a third of those who answered got it wrong, most-missed first.
          const want = t.questions.filter((r) => r.right + r.wrong > 0 && 3 * r.wrong >= r.right + r.wrong);
          expect([...t.revisit].sort((a, b) => a - b)).toEqual(want.map((r) => r.q));
          for (let i = 1; i < t.revisit.length; i++) {
            const a = t.questions[t.revisit[i - 1]! - 1]!;
            const b = t.questions[t.revisit[i]! - 1]!;
            expect(a.wrong * (b.right + b.wrong)).toBeGreaterThanOrEqual(b.wrong * (a.right + a.wrong));
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("TASK-34b4: the median is the middle score, or the mean of the middle two", () => {
    expect(median([])).toBeNull();
    expect(median([3])).toBe(3);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 4, 5])).toBe(3);
    expect(median([2, 3, 4, 5])).toBe(3.5);
  });

  it("TASK-34b4: 'Q4 missed by 9 of 24' and the plain-text table", () => {
    expect(missedLine({ q: 4, question: "x", right: 15, wrong: 9, none: 0 }, 24)).toBe("Q4 missed by 9 of 24");
    expect(missedLine({ q: 2, question: "x", right: 1, wrong: 1, none: 2 }, 4)).toBe("Q2 missed by 1 of 4 (2 did not reach it)");
    const pupils: Pupil[] = [
      { results: ["right", "right", "right", "right", "right", "right"], tag: 1, initials: "AB" },
      { results: ["wrong", "right", "none", "right", "wrong", "right"], tag: 2, initials: undefined },
    ];
    const t = tally(lesson, pupils.map(codeOf));
    const text = resultsText(t, lesson.title);
    expect(text.split("\n")[0]).toBe("Class results — Vikings in Ireland");
    expect(text).toContain("2 pupils · middle score (median) 4.5 of 6");
    expect(text).toContain("Q1 ");
    expect(text).toContain(": 1 right, 1 wrong, 0 did not reach it");
    expect(text).toContain(": 1 right, 0 wrong, 1 did not reach it");
    expect(text).toContain("Revisit: Q1 (missed by 1 of 2), Q5 (missed by 1 of 2)");
    expect(text).toContain("AB: 6 of 6 —");
    expect(text).toContain("Pupil 2: 3 of 6 — Q1 ✗, Q2 ✓, Q3 –");
    expect(text).not.toContain(codeOf(pupils[0]!));
    expect(resultsText(tally(lesson, []), "X")).toBe("Class results — X\nNo codes yet.");
  });
});
