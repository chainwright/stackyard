// tests/round7-generation.test.ts
// TASK-31c (the wait: prompt and coordinate-free model output) and TASK-31e (the
// flash-definition rule), from the v2 panel on ee37ab7.

import { describe, it, expect, vi, afterEach } from "vitest";
import fc from "fast-check";
import { build, buildStream, buildRetry } from "../server/promptBuilder.js";
import {
  sanitizeRawStack,
  sanitizeRawCard,
  finaliseGeneratedStack,
  normalizeGeneratedCard,
} from "../server/normalizeGenerated.js";
import { validate, validateCard } from "../src/shared/validator.js";
import { streamGenerate } from "../server/stream-generate.js";
import type { LineSink, StreamGenerateDeps } from "../server/stream-generate.js";
import type { Card, GenerateStreamMessage, Stack } from "../src/shared/types.js";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env["STACKYARD_LLM_THINKING"];
  delete process.env["STACKYARD_LLM_BASE_URL"];
});

const REQ = { prompt: "water cycle quiz" };
const prompts = (): Array<[string, string]> => [
  ["one-shot", build(REQ).system],
  ["streaming", buildStream(REQ).system],
  ["retry", buildRetry(REQ, ["Some error"]).system],
];

describe("TASK-31e: the flash-definition rule replaces 'word for word'", () => {
  const RULE = "Don't ask for the definition just given on a flash card within the previous 3 cards; ask about it differently, or about something else.";
  it("TASK-31e: the one-shot, streaming and retry prompts carry the rule and no 'word for word'", () => {
    for (const [name, sys] of prompts()) {
      expect(sys, name).toContain(RULE);
      expect(sys, name).not.toMatch(/word for word/i);
    }
  });
});

describe("TASK-31c: the prompt no longer makes the model plan", () => {
  it("TASK-31c: no 'decide all card ids up front'; the model numbers cards c1, c2, … in order", () => {
    for (const [name, sys] of prompts()) {
      expect(sys, name).not.toMatch(/decide all card ids up front/i);
      expect(sys, name).toMatch(/Number the cards c1, c2, c3/);
    }
  });

  it("TASK-31c: x / y / w / h are gone from the element schema in every prompt", () => {
    for (const [name, sys] of prompts()) {
      expect(sys, name).not.toMatch(/"x": n/);
      expect(sys, name).not.toMatch(/"w": n/);
      expect(sys, name).toMatch(/do NOT write x, y, w or h/);
      expect(sys, name).toContain("Canvas bounds"); // the invariant is still named
    }
  });
});

// ---------------------------------------------------------------------------
// Model output with NO coordinates always finalises to a valid stack (all paths).

type Raw = Record<string, unknown>;
const text = (content: string): Raw => ({ type: "text", id: "t", content });
const button = (label: string, actions: Raw[]): Raw => ({ type: "button", id: "b", label, actions });
const goto = (cardId: string): Raw => ({ type: "goto", cardId });

const wordArb = fc.stringMatching(/^[A-Za-z]{2,9}( [A-Za-z]{2,9}){0,4}$/);

/** A model-shaped stack with no x / y / w / h on any element; cards linked c1 → c2 → … → end. */
const rawStackArb: fc.Arbitrary<Raw> = fc
  .record({
    kinds: fc.array(fc.constantFrom("quiz", "flash", "story"), { minLength: 1, maxLength: 6 }),
    words: fc.array(wordArb, { minLength: 20, maxLength: 20 }),
    answers: fc.integer({ min: 2, max: 5 }),
    right: fc.nat(4),
    // how the model damages coordinates: none at all, strings, NaN-ish, partial
    damage: fc.constantFrom("none", "string", "partial", "huge"),
    endBody: fc.boolean(),
  })
  .map(({ kinds, words, answers, right, damage, endBody }) => {
    let w = 0;
    const next = (): string => words[w++ % words.length]!;
    const hurt = (el: Raw): Raw => {
      if (damage === "string") return { ...el, x: "left", y: "top" };
      if (damage === "partial") return { ...el, x: 10 };
      if (damage === "huge") return { ...el, x: 5000, y: -300, w: 99999, h: 99999 };
      return el;
    };
    const cards: Raw[] = kinds.map((kind, i) => {
      const to = `c${i + 2}`;
      const elements: Raw[] = [];
      if (kind === "quiz") {
        elements.push(text(next() + "?"));
        const n = Math.max(2, Math.min(4, answers));
        for (let a = 0; a < n; a++) {
          elements.push(button(next(), [{ type: "score", delta: a === right % n ? 1 : 0 }, goto(to)]));
        }
      } else if (kind === "flash") {
        elements.push(text(next()), text(next() + ". " + next() + "."), button("Next Card", [goto(to)]));
      } else {
        elements.push(text(next() + " " + next()), button("Continue", [goto(to)]));
      }
      return { id: `c${i + 1}`, kind, elements: elements.map(hurt), actions: [] };
    });
    const endEls: Raw[] = [text("Finished " + next()), ...(endBody ? [text(next() + ". " + next() + ".")] : []), { type: "field", id: "f", variable: "score" }];
    cards.push({ id: `c${kinds.length + 1}`, kind: "end", elements: endEls.map(hurt), actions: [] });
    return { id: "s", title: "Water " + next(), theme: { background: "#fff", foreground: "#000", font: "sans-serif" }, cards };
  });

describe("TASK-31c: model output with no coordinates always finalises to a valid stack", () => {
  it("TASK-31c: property — one-shot / retry / stream whole-stack path: sanitise → validate → finalise stays valid and on the canvas", () => {
    fc.assert(
      fc.property(rawStackArb, (raw) => {
        const checked = validate(sanitizeRawStack(raw));
        if (!checked.valid) return false;
        const done: Stack = finaliseGeneratedStack(checked.stack);
        if (!validate(done).valid) return false;
        return done.cards.every((c) => c.elements.every((e) => e.x >= 0 && e.y >= 0 && e.x + e.w <= 800 && e.y + e.h <= 600));
      }),
      { numRuns: 300 },
    );
  }, 60_000);

  it("TASK-31c: property — the streamed preview card path (sanitizeRawCard → validateCard → normalize) is valid and on the canvas", () => {
    fc.assert(
      fc.property(rawStackArb, (raw) => {
        const cards = raw["cards"] as unknown[];
        return cards.every((c) => {
          const checked = validateCard(sanitizeRawCard(c));
          if (!checked.valid) return false;
          const card = normalizeGeneratedCard(checked.card);
          return card.elements.every((e) => e.x >= 0 && e.y >= 0 && e.x + e.w <= 800 && e.y + e.h <= 600);
        });
      }),
      { numRuns: 300 },
    );
  }, 60_000);

  it("TASK-31c: a plain coordinate-free quiz is accepted as it stands", () => {
    const raw = {
      id: "s", title: "T", theme: { background: "#fff", foreground: "#000", font: "x" },
      cards: [
        { id: "c1", kind: "quiz", actions: [], elements: [text("Q?"), button("A", [{ type: "score", delta: 1 }, goto("c2")]), button("B", [{ type: "score", delta: 0 }, goto("c2")])] },
        { id: "c2", kind: "end", actions: [], elements: [text("Done"), { type: "field", id: "f", variable: "score" }] },
      ],
    };
    expect(validate(sanitizeRawStack(raw)).valid).toBe(true);
  });
});

describe("TASK-31c: the stream timing log line says whether thinking was on", () => {
  const u = (n: number): string => `d7d70000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
  const THEME = { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" };
  const card = (): Card => ({
    id: u(10), kind: "story", actions: [{ type: "goto", cardId: u(50) }],
    elements: [{ type: "text", id: u(110), x: 48, y: 104, w: 704, h: 144, content: "A story." }],
  });
  const endCard = (): Card => ({ id: u(50), kind: "end", actions: [], elements: [{ type: "field", id: u(250), x: 48, y: 420, w: 704, h: 60, variable: "score" }] });

  async function timingLine(): Promise<string> {
    const stack: Stack = { id: u(1), title: "T", theme: THEME, cards: [card(), endCard()] };
    const text =
      [JSON.stringify({ kind: "stack", id: stack.id, title: stack.title, theme: THEME }), ...stack.cards.map((c) => JSON.stringify({ kind: "card", card: c }))].join("\n") + "\n";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const lines: GenerateStreamMessage[] = [];
    const sink: LineSink = { write: (o) => void lines.push(o), end: () => {} };
    const callStream: NonNullable<StreamGenerateDeps["callStream"]> = async function* () {
      yield text;
    };
    await streamGenerate({ prompt: "x" }, sink, { callStream, generate: vi.fn() as never, sleep: async () => {} });
    return log.mock.calls.map((c) => String(c[0])).find((l) => l.includes("stream timing")) ?? "";
  }

  it("TASK-31c: thinking=off on the Anthropic host, thinking=on elsewhere, and no key or URL in the line", async () => {
    process.env["STACKYARD_LLM_BASE_URL"] = "https://api.anthropic.com/v1/";
    const off = await timingLine();
    expect(off).toMatch(/ thinking=off$/);
    process.env["STACKYARD_LLM_BASE_URL"] = "https://api.openai.com/v1";
    const on = await timingLine();
    expect(on).toMatch(/ thinking=on$/);
    process.env["STACKYARD_LLM_THINKING"] = "off";
    expect(await timingLine()).toMatch(/ thinking=off$/);
    for (const l of [off, on]) expect(l).not.toMatch(/key|bearer|http|anthropic|openai/i);
  });
});
