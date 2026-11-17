// tests/round14-docs.test.ts
// TASK-42b7 / b8 / b9 (16 Nov 2026): the bench replay after the TASK-42b answer
// passes, the public sentences that follow it, and the mutation log that must
// stay valid. The passes themselves are tested in tests/deck-answer-quality.test.ts.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { countWords } from "../src/shared/classResults.js";
import { parseClaimRows, newestMutationLog } from "../scripts/claims-lib.js";
import { stackOfFile } from "../scripts/build-distractor-review.js";

const ROOT = path.resolve(__dirname, "..");
const read = (f: string): string => readFileSync(path.join(ROOT, f), "utf8");

type Count = "swappedJokes" | "removedJokes" | "leftJokes" | "swappedRepeats" | "removedDuplicates" | "leftDuplicates" | "droppedSameAnswer";
interface Results {
  summary: { lessonClean: number; firstTry: number } & Partial<Record<Count, number>>;
  decks: Array<{ id: string } & Partial<Record<Count, number | null>>>;
}
const results = (): Results => JSON.parse(read("bench/results.json")) as Results;

/** The sentence each public file states after the AI-review numbers (TASK-42b10/b11: swapped, removed and left counted apart). */
function swapSentence(r: Results): string {
  const word = (n: number): string => (n === 0 ? "none" : countWords(n));
  const swapped = r.summary.swappedJokes ?? 0;
  const removed = r.summary.removedJokes ?? 0;
  const left = r.summary.leftJokes ?? 0;
  const decks = r.decks.filter((d) => (d.swappedJokes ?? 0) + (d.removedJokes ?? 0) + (d.leftJokes ?? 0) > 0).length;
  const what = swapped === 1 ? "one such answer" : `${word(swapped)} such answers`;
  const leftPart = left > 0 ? `left ${word(left)}, which still ${left === 1 ? "carries" : "carry"} the joke-answer note,` : "left none";
  return `That review read the bench decks before 16 Nov, when generation began swapping or removing the joke answers our check flags; in today's bench files it swapped ${what}, removed ${word(removed)} and ${leftPart} in ${countWords(decks)} deck${decks === 1 ? "" : "s"}.`;
}

describe("TASK-42b7: the bench after the answer passes", () => {
  it("TASK-42b7: bench/reviewed/ keeps exactly the decks the replay changed since the v5 review, and only those differ", () => {
    const r = results();
    const changed = r.decks.filter((d) => (d.swappedJokes ?? 0) + (d.removedJokes ?? 0) + (d.swappedRepeats ?? 0) + (d.removedDuplicates ?? 0) + (d.droppedSameAnswer ?? 0) > 0).map((d) => d.id).sort();
    const v5 = JSON.parse(read("bench/distractor-review-v5.json")) as { decks: Array<{ id: string }> };
    const reviewedIds = new Set(v5.decks.map((d) => d.id));
    const snaps = readdirSync(path.join(ROOT, "bench", "reviewed")).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort();
    expect(snaps).toEqual(changed.filter((id) => reviewedIds.has(id)));
    // Each snapshot differs from today's file; every other reviewed deck's file is the one the review read (the build test checks it card by card).
    for (const id of snaps) {
      const snap = JSON.parse(read(`bench/reviewed/${id}.json`)) as unknown;
      expect(stackOfFile(read(`bench/files/${id}.html`)), id).not.toEqual(snap);
    }
  });

  it("TASK-42b7: TASK-42b10: results.json records what the passes did (swapped / removed / left) and the same-answer drops, per deck and in total", () => {
    const r = results();
    const keys = ["swappedJokes", "removedJokes", "leftJokes", "swappedRepeats", "removedDuplicates", "leftDuplicates", "droppedSameAnswer"] as const;
    for (const k of keys) expect(r.summary[k], k).toBe(r.decks.reduce((t, d) => t + (d[k] ?? 0), 0));
    const s = r.summary;
    const md = read("bench/RESULTS.md");
    expect(md).toContain(`| Answers flagged as a joke at generation: swapped / removed / left | ${s.swappedJokes} / ${s.removedJokes} / ${s.leftJokes} |`);
    expect(md).toContain(`| Answers that said the same as another on their card: swapped / removed / left | ${s.swappedRepeats} / ${s.removedDuplicates} / ${s.leftDuplicates} |`);
    expect(md).toContain(`| Extra quiz cards dropped for repeating a right answer | ${s.droppedSameAnswer} |`);
  });

  it("TASK-42b7: the README, the write-up and EVIDENCE.md say the AI review read the decks before the swap, and how many answers it changed", () => {
    const s = swapSentence(results());
    for (const f of ["README.md", "docs/DEVPOST_WRITEUP.md", "EVIDENCE.md"]) {
      const line = read(f).split("\n").find((l) => l.includes("71 of 320 (v5) wrong answers"))!;
      expect(line, f).toContain("It is an AI review, not a teacher's. " + s);
    }
  });
});

describe("TASK-42b8: the public joke-answer text stays true", () => {
  it("TASK-42b8: the Maker sentence still says the check misses most; EVIDENCE says flagged answers are swapped and most are not flagged", () => {
    for (const f of ["README.md", "docs/DEVPOST_WRITEUP.md"]) {
      expect(read(f).replace(/\s+/g, " "), f).toContain("(our check marks a few likely joke answers but misses most, so read every answer)");
    }
    expect(read("EVIDENCE.md")).toContain(
      "Since 16 Nov, generation swaps each of the few joke answers the marker flags for a short, matching answer from the same deck, or removes it when the card still keeps three answers, before the teacher sees the deck; otherwise it leaves the answer with its note. Most joke answers are still not flagged, so the teacher still reads every answer.",
    );
  });

  it("TASK-42b8: CLAIMS.md has a row for each new public sentence, and C18 follows the property count", () => {
    const rows = parseClaimRows(read("CLAIMS.md"));
    const quotes = rows.map((r) => r.quote);
    expect(quotes).toContain("That review read the bench decks before 16 Nov, when generation began swapping or removing the joke answers our check flags");
    expect(quotes.some((q) => q !== null && q.startsWith("in today's bench files it swapped "))).toBe(true);
    const c18 = rows.find((r) => r.id === "C18")!;
    expect(read("docs/DEVPOST_WRITEUP.md")).toContain(c18.quote!);
  });
});

describe("TASK-42b9: the mutation log stays valid", () => {
  it("TASK-42b9: every mutant's target text is still in its file, and the newest log was made with this mutation-check.ts", () => {
    const src = read("scripts/mutation-check.ts");
    // Evaluate the MUTANTS array literal (plain objects of strings and arrays), skipping strings and comments.
    const start = src.indexOf("= [", src.indexOf("const MUTANTS")) + 2;
    let depth = 0;
    let end = start;
    let quote: string | null = null;
    for (let i = start; i < src.length; i++) {
      const ch = src[i]!;
      if (quote !== null) {
        if (ch === "\\") i++;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      else if (ch === "/" && src[i + 1] === "/") i = src.indexOf("\n", i);
      else if (ch === "[") depth++;
      else if (ch === "]" && --depth === 0) {
        end = i;
        break;
      }
    }
    // eslint-disable-next-line no-new-func
    const mutants = new Function(`return ${src.slice(start, end + 1)}`)() as Array<{ name: string; file: string; find: string }>;
    expect(mutants).toHaveLength(118);
    for (const m of mutants) expect(read(m.file), `${m.name} (${m.file})`).toContain(m.find);
    const dir = path.join(ROOT, "docs", "mutation-runs");
    const log = newestMutationLog(readdirSync(dir).filter((f) => f.endsWith(".log")).map((f) => ({ file: f, text: readFileSync(path.join(dir, f), "utf8") })));
    expect(log!.sha256).toBe(createHash("sha256").update(src).digest("hex"));
    expect(log!.n).toBe(118);
  });
});
