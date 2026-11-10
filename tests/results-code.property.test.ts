// tests/results-code.property.test.ts
// TASK-34b1: the class-results code format (.kiro/specs/class-results/design.md §1).

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import {
  CODE_ALPHABET,
  checkChar,
  checkOk,
  codeLength,
  decodeCode,
  encodeCode,
  foldInitials,
  formatCode,
  lessonFingerprint,
  lessonKey,
  normalizeCode,
  quizCards,
  resultsDigits,
  resultsOf,
  spellCode,
  type Result,
} from "../src/shared/resultsCode.js";
import { vikingsStack, timesTablesStack } from "../src/shared/readyMadeStacks.js";
import type { Card, Stack } from "../src/shared/types.js";

const uuid = (n: number): string => `${n.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;

/** A lesson with `kinds` cards (q = quiz with `answers` answers, s = story, f = flash) and an end card. */
function lesson(kinds: string, salt = 0, answers = 3): Stack {
  const cards: Card[] = [];
  let id = 1000 + salt * 100000;
  for (const k of kinds) {
    const cid = uuid(++id);
    if (k === "q") {
      const right = id % answers;
      cards.push({
        id: cid,
        kind: "quiz",
        elements: [
          { type: "text", id: uuid(++id), x: 0, y: 0, w: 10, h: 10, content: `Question ${id}?` },
          ...Array.from({ length: answers }, (_, i) => ({
            type: "button" as const,
            id: uuid(++id),
            x: 0, y: 100, w: 10, h: 10,
            label: `Answer ${i} of ${cid.slice(0, 8)}`,
            actions: [{ type: "score" as const, delta: i === right ? 1 : 0 }],
          })),
        ],
        actions: [],
      });
    } else {
      cards.push({ id: cid, kind: k === "s" ? "story" : "flash", elements: [{ type: "text", id: uuid(++id), x: 0, y: 0, w: 10, h: 10, content: `Card ${id}` }], actions: [] });
    }
  }
  cards.push({ id: uuid(++id), kind: "end", elements: [], actions: [] });
  return { id: uuid(salt + 1), title: "T", theme: { background: "#fff", foreground: "#000", font: "sans-serif" }, cards };
}

const shapeArb = fc.array(fc.constantFrom("q", "q", "s", "f"), { minLength: 1, maxLength: 60 }).filter((k) => k.includes("q"));
const resultArb = fc.constantFrom<Result>("right", "wrong", "none");
const initialsArb = fc.option(fc.stringMatching(/^[A-Z]{1,3}$/), { nil: undefined });
const tagArb = fc.integer({ min: 0, max: 31 ** 3 - 1 });

/** A random lesson plus a code for it. */
const caseArb = shapeArb.chain((kinds) => {
  const n = kinds.filter((k) => k === "q").length;
  return fc.record({
    kinds: fc.constant(kinds),
    results: fc.array(resultArb, { minLength: n, maxLength: n }),
    tag: tagArb,
    initials: initialsArb,
  });
});

describe("TASK-34b1: the results code", () => {
  it("TASK-34b1: the alphabet has 31 characters and none of the look-alikes 0 O 1 I L", () => {
    expect(CODE_ALPHABET).toHaveLength(31);
    expect(new Set(CODE_ALPHABET).size).toBe(31);
    for (const c of "0O1IL") expect(CODE_ALPHABET).not.toContain(c);
  });

  it("TASK-34b1: round trip — any lesson shape, any results, any tag and initials: encode → decode is identical", () => {
    fc.assert(
      fc.property(caseArb, ({ kinds, results, tag, initials }) => {
        const s = lesson(kinds.join(""));
        const key = lessonKey(s);
        const code = encodeCode({ fingerprint: key.fingerprint, results, tag, initials });
        expect(code).toHaveLength(codeLength(key.n, initials !== undefined));
        for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
        const d = decodeCode(formatCode(code), key);
        expect(d).toEqual({ ok: true, code, results, initials: initials ?? "", tag, fingerprint: key.fingerprint });
      }),
      { numRuns: 300 },
    );
  });

  it("TASK-34b1: the lengths for 5, 10 and 20 quiz cards are the design's (9 / 11 / 14, or 12 / 14 / 17 with initials)", () => {
    expect([5, 10, 20].map(resultsDigits)).toEqual([2, 4, 7]);
    expect([5, 10, 20].map((n) => codeLength(n, false))).toEqual([9, 11, 14]);
    expect([5, 10, 20].map((n) => codeLength(n, true))).toEqual([12, 14, 17]);
    for (let n = 1; n <= 120; n++) {
      expect(31 ** resultsDigits(n)).toBeGreaterThanOrEqual(3 ** n);
      expect(31 ** (resultsDigits(n) - 1)).toBeLessThan(3 ** n);
    }
    const design = readFileSync(".kiro/specs/class-results/design.md", "utf8");
    expect(design).toContain("| 5 | 2 | 9 | 12 | `ABCD-EFGH-J` |");
    expect(design).toContain("| 10 | 4 | 11 | 14 | `ABCD-EFGH-JKM` |");
    expect(design).toContain("| 20 | 7 | 14 | 17 | `ABCD-EFGH-JKMN-PQ` |");
  });

  it("TASK-34b1: every single-character substitution is caught, exhaustively, on random codes ('one letter looks wrong')", () => {
    fc.assert(
      fc.property(caseArb, ({ kinds, results, tag, initials }) => {
        const key = lessonKey(lesson(kinds.join("")));
        const code = encodeCode({ fingerprint: key.fingerprint, results, tag, initials });
        for (let i = 0; i < code.length; i++) {
          for (const ch of CODE_ALPHABET) {
            if (ch === code[i]) continue;
            const bad = code.slice(0, i) + ch + code.slice(i + 1);
            const d = decodeCode(bad, key);
            expect(d.ok === false && d.error).toBe("check");
          }
        }
      }),
      { numRuns: 60 },
    );
  });

  it("TASK-34b1: every adjacent transposition of two different characters is caught, exhaustively, on random codes", () => {
    fc.assert(
      fc.property(caseArb, ({ kinds, results, tag, initials }) => {
        const key = lessonKey(lesson(kinds.join("")));
        const code = encodeCode({ fingerprint: key.fingerprint, results, tag, initials });
        for (let i = 0; i + 1 < code.length; i++) {
          if (code[i] === code[i + 1]) continue;
          const bad = code.slice(0, i) + code[i + 1] + code[i] + code.slice(i + 2);
          const d = decodeCode(bad, key);
          expect(d.ok === false && d.error).toBe("check");
        }
      }),
      { numRuns: 200 },
    );
  });

  it("TASK-34b1: the check still holds across the weight wrap (positions 30 → 31): long raw strings, every substitution and swap", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 30 }), { minLength: 61, maxLength: 95 }), (payload) => {
        const values = [...payload, checkChar(payload)];
        expect(checkOk(values)).toBe(true);
        for (let i = 0; i < values.length; i++) {
          for (let v = 0; v < 31; v++) {
            if (v === values[i]) continue;
            const bad = values.slice();
            bad[i] = v;
            expect(checkOk(bad)).toBe(false);
          }
          if (i + 1 < values.length && values[i] !== values[i + 1]) {
            const sw = values.slice();
            sw[i] = values[i + 1]!;
            sw[i + 1] = values[i]!;
            expect(checkOk(sw)).toBe(false);
          }
        }
      }),
      { numRuns: 25 },
    );
  });

  it("TASK-34b1: a code from a different lesson with the same number of questions is rejected as 'from a different lesson'", () => {
    const v = vikingsStack();
    const edited: Stack = JSON.parse(JSON.stringify(v));
    const q = quizCards(edited)[2]!.elements.find((e) => e.type === "text")!;
    if (q.type === "text") q.content += " (changed)";
    expect(lessonKey(edited).n).toBe(lessonKey(v).n);
    const code = encodeCode({ fingerprint: lessonFingerprint(v), results: resultsOf(v, {}), tag: 7 });
    expect(decodeCode(code, lessonKey(v)).ok).toBe(true);
    const d = decodeCode(code, lessonKey(edited));
    expect(d.ok === false && d.error).toBe("lesson");
    // Another lesson with a different quiz count is caught by the length.
    const t = decodeCode(code, lessonKey(timesTablesStack()));
    expect(t.ok === false && t.error).toBe("length");
  });

  it("TASK-34b1: any change to a quiz card's id, question, label, answer order or right answer changes the fingerprint", () => {
    const base = vikingsStack();
    const fp = lessonFingerprint(base);
    const edits: Array<(s: Stack) => void> = [
      (s) => { quizCards(s)[0]!.id = uuid(99); },
      (s) => { const t = quizCards(s)[1]!.elements[0]!; if (t.type === "text") t.content = "Another question?"; },
      (s) => { const b = quizCards(s)[3]!.elements.find((e) => e.type === "button")!; if (b.type === "button") b.label += "!"; },
      (s) => { const els = quizCards(s)[4]!.elements; const i = els.findIndex((e) => e.type === "button"); const tmp = els[i]!; els[i] = els[i + 1]!; els[i + 1] = tmp; },
      (s) => {
        const btns = quizCards(s)[5]!.elements.filter((e) => e.type === "button");
        for (const b of btns) if (b.type === "button") b.actions = b.actions.map((a) => (a.type === "score" ? { ...a, delta: a.delta > 0 ? 0 : 1 } : a));
      },
    ];
    for (const edit of edits) {
      const s: Stack = JSON.parse(JSON.stringify(base));
      edit(s);
      expect(lessonFingerprint(s)).not.toBe(fp);
    }
  });

  it("TASK-34b1: non-quiz changes (positions, story and flash cards, title, theme) keep the fingerprint", () => {
    fc.assert(
      fc.property(shapeArb, fc.integer({ min: -50, max: 50 }), (kinds, dx) => {
        const s = lesson(kinds.join(""));
        const fp = lessonFingerprint(s);
        const t: Stack = JSON.parse(JSON.stringify(s));
        t.title = "Renamed";
        t.theme.background = "#000";
        for (const c of t.cards) {
          for (const e of c.elements) e.x += dx;
          if (c.kind !== "quiz") for (const e of c.elements) if (e.type === "text") e.content = "edited";
        }
        expect(lessonFingerprint(t)).toBe(fp);
      }),
      { numRuns: 100 },
    );
  });

  it("TASK-34b1: input is case-insensitive and ignores dashes and spaces; unknown characters are named; grouping is in fours", () => {
    const v = vikingsStack();
    const key = lessonKey(v);
    const code = encodeCode({ fingerprint: key.fingerprint, results: resultsOf(v, {}), tag: 123, initials: "AB" });
    const shown = formatCode(code);
    expect(shown).toMatch(/^([2-9A-HJKMNP-Z]{4}-)*[2-9A-HJKMNP-Z]{1,4}$/);
    expect(decodeCode(` ${shown.toLowerCase().replace(/-/g, " - ")} `, key).ok).toBe(true);
    expect(normalizeCode("ab-cd ef.g_h")).toBe("ABCDEFGH");
    const bad = decodeCode(code.slice(0, 2) + "O" + code.slice(3), key);
    expect(bad.ok === false && bad.error).toBe("bad-char");
    expect(spellCode("ABCDEFGHJ")).toBe("A B C D, E F G H, J");
    expect(decodeCode("", key).ok).toBe(false);
  });

  it("TASK-34b1: initials fold to at most three letters A–Z (accents removed, anything else dropped)", () => {
    expect(foldInitials("ó'b")).toBe("OB");
    expect(foldInitials("Seán Ó Brien")).toBe("SEA");
    expect(foldInitials("a.b")).toBe("AB");
    expect(foldInitials("12 !")).toBe("");
  });

  it("TASK-34b1: not reached is its own result, never 'wrong' (resultsOf)", () => {
    const s = lesson("qsqq");
    const [a, b, c] = quizCards(s);
    expect(resultsOf(s, { [a!.id]: true, [c!.id]: false })).toEqual(["right", "none", "wrong"]);
    void b;
  });

  it("TASK-34b1: no BigInt in the format (the player must run in 2018 browsers)", () => {
    const src = readFileSync("src/shared/resultsCode.ts", "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(src).not.toMatch(/BigInt/);
    expect(src).not.toMatch(/\b\d+n\b/);
  });
});
