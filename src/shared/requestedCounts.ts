// src/shared/requestedCounts.ts
// The counts a teacher's sentence asks for (TASK-32b.3): "a 6-question quiz",
// "two flash cards", "a 10-card quiz". Pure. Used by the prompt (hard numbers),
// by the generator (trim extras), and by the Maker's note ("You asked for 6
// questions; the model wrote 4.").
//
// Digits and the number words one..twelve. Nothing found → {}.

export interface RequestedCounts {
  /** Quiz cards (questions) asked for. */
  quiz?: number;
  /** Flash cards asked for. */
  flash?: number;
  /** Cards in all ("a 10-card quiz"). */
  total?: number;
}

const WORDS: Readonly<Record<string, number>> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

/** The largest count we accept (the prompt caps a deck at 20 cards). */
const MAX = 20;

const NUM = String.raw`(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)`;

function toNumber(token: string): number | null {
  const t = token.toLowerCase();
  const n = /^\d+$/.test(t) ? Number(t) : WORDS[t];
  return n !== undefined && Number.isInteger(n) && n >= 1 && n <= MAX ? n : null;
}

/** The first match of any pattern, as a count. */
function firstCount(sentence: string, patterns: RegExp[]): number | undefined {
  let best: { at: number; n: number } | undefined;
  for (const re of patterns) {
    for (const m of sentence.matchAll(re)) {
      const n = toNumber(m[1]!);
      if (n === null) continue;
      if (best === undefined || m.index! < best.at) best = { at: m.index!, n };
    }
  }
  return best?.n;
}

export function parseRequestedCounts(sentence: string): RequestedCounts {
  const s = sentence.replace(/[‐-―]/g, "-");
  const quiz = firstCount(s, [
    new RegExp(String.raw`\b${NUM}[\s-]*(?:quiz[\s-]*)?questions?\b`, "gi"),
    new RegExp(String.raw`\b${NUM}[\s-]*quiz(?:zes)?[\s-]*cards?\b`, "gi"),
    new RegExp(String.raw`\b${NUM}[\s-]*quizzes\b`, "gi"),
  ]);
  const flash = firstCount(s, [new RegExp(String.raw`\b${NUM}[\s-]*flash[\s-]*cards?\b`, "gi"), new RegExp(String.raw`\b${NUM}[\s-]*flashcards?\b`, "gi")]);
  const total = firstCount(s, [new RegExp(String.raw`\b${NUM}[\s-]*cards?\b`, "gi")]);
  const out: RequestedCounts = {};
  if (quiz !== undefined) out.quiz = quiz;
  if (flash !== undefined) out.flash = flash;
  // "two flash cards" / "4 quiz cards" never match "N cards" (a word sits between).
  if (total !== undefined) out.total = total;
  return out;
}

/** The hard-number line for the prompts, or "" when nothing was asked for. */
export function countsInstruction(c: RequestedCounts): string {
  const parts: string[] = [];
  if (c.quiz !== undefined) parts.push(`exactly ${c.quiz} quiz card${c.quiz === 1 ? "" : "s"}`);
  if (c.flash !== undefined) parts.push(`exactly ${c.flash} flash card${c.flash === 1 ? "" : "s"}`);
  if (parts.length > 0) return `Write ${parts.join(" and ")}.`;
  if (c.total !== undefined) return `Write exactly ${c.total} cards before the end card.`;
  return "";
}
