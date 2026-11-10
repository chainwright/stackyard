// tests/why-fields.test.ts
// TASK-34a7: every quiz answer carries a model "why" (the misconception that
// makes a wrong answer tempting; the fact that makes the right one right). The
// prompts ask for it; the server strips it before validation and layout on every
// path (one-shot, retry, stream, the streamed preview card), so it never reaches
// the stack, the file or the Maker. TASK-34a8 records the size cost.

import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("../server/llmGateway.js", () => {
  class LlmUnavailableError extends Error {
    readonly kind: string;
    constructor(message: string, kind = "network") {
      super(message);
      this.kind = kind;
    }
  }
  class LlmMalformedError extends Error {}
  class ConfigurationError extends Error {}
  return { call: vi.fn(), callStream: vi.fn(), LlmUnavailableError, LlmMalformedError, ConfigurationError };
});

import * as gateway from "../server/llmGateway.js";
import { generate } from "../server/stackGenerator.js";
import { streamGenerate } from "../server/stream-generate.js";
import { sanitizeRawCard, sanitizeRawStack, finaliseGeneratedStack, withoutWhy } from "../server/normalizeGenerated.js";
import { build, buildStream, buildRetry } from "../server/promptBuilder.js";
import { validate } from "../src/shared/validator.js";
import { exportLivingStack } from "../server/exporter.js";
import { loadWhyFixture, streamText, whyCost, dropWhy } from "../scripts/why-cost.js";
import type { GenerateStreamMessage } from "../src/shared/types.js";

const callMock = vi.mocked(gateway.call);
const fx = loadWhyFixture();
const read = (f: string): string => readFileSync(path.join(process.cwd(), f), "utf8");

/** Every key anywhere in a value. */
function keysOf(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) for (const x of v) keysOf(x, out);
  else if (v !== null && typeof v === "object") for (const [k, x] of Object.entries(v)) { out.add(k); keysOf(x, out); }
  return out;
}
const quiet = async <T>(fn: () => Promise<T>): Promise<T> => {
  const l = console.log, w = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return await fn(); } finally { console.log = l; console.warn = w; }
};
const wholeStack = (cards: unknown[]): Record<string, unknown> => {
  const { kind: _k, ...h } = fx.header;
  void _k;
  return { ...h, cards };
};

beforeEach(() => callMock.mockReset());

describe("TASK-34a7: the prompts ask for a why on every quiz answer, and the category rule", () => {
  const prompts = (): Array<[string, string]> => [
    ["one-shot", build({ prompt: fx.prompt }).system],
    ["streaming", buildStream({ prompt: fx.prompt }).system],
    ["retry", buildRetry({ prompt: fx.prompt }, ["quiz-answer"]).system],
  ];
  it("TASK-34a7: the why field, its two meanings, the 'choose a different wrong answer' rule and the same-kind rule, in all three prompts", () => {
    for (const [name, sys] of prompts()) {
      expect(sys, name).toContain("## Every answer has a why");
      expect(sys, name).toContain('"why": "<quiz answers only: see \'Every answer has a why\'>"');
      expect(sys, name).toContain("On the right answer: the fact that makes it right. Write it first and check it. If the fact shows another answer is right, fix which answer has delta 1.");
      expect(sys, name).toContain("the real mistake a pupil of 8 to 10 makes that makes this option tempting");
      expect(sys, name).toContain("If you cannot name a real mistake a pupil makes, choose a different wrong answer.");
      expect(sys, name).toContain("Every wrong answer must be the same kind of thing the question asks for: a part of a plant for a plant-part question, a force for a force question, a number for a how-many question.");
      expect(sys, name).toContain("Stackyard reads it and removes it; the class never sees it.");
    }
  });
});

describe("TASK-34a7: the server strips every why, on every path", () => {
  it("TASK-34a7: sanitizeRawCard and sanitizeRawStack return no 'why' key (element, action or card)", () => {
    const card: Record<string, unknown> = { ...fx.cards[2]!, why: "card-level" };
    (card["elements"] as Array<Record<string, unknown>>)[1]!["actions"] = [{ type: "score", delta: 1, why: "on an action" }];
    expect(keysOf(sanitizeRawCard(card)).has("why")).toBe(false);
    expect(keysOf(sanitizeRawStack(wholeStack(fx.cards))).has("why")).toBe(false);
    expect(withoutWhy({ a: 1, why: "x" })).toEqual({ a: 1 });
  });

  it("TASK-34a7: property — for any model output, with or without why fields anywhere, the finalised stack has none and validates", () => {
    const why = fc.option(fc.string({ maxLength: 60 }), { nil: undefined });
    fc.assert(
      fc.property(fc.array(fc.tuple(why, why, why), { minLength: 60, maxLength: 60 }), (whys) => {
        let i = 0;
        const next = (): [string | undefined, string | undefined, string | undefined] => whys[i++ % whys.length]!;
        const cards = dropWhy(fx.cards).map((c) => {
          const [cw] = next();
          const elements = (c["elements"] as Array<Record<string, unknown>>).map((e) => {
            const [ew, , aw] = next();
            const actions = Array.isArray(e["actions"]) ? (e["actions"] as Array<Record<string, unknown>>).map((a) => (aw === undefined ? a : { ...a, why: aw })) : undefined;
            return { ...e, ...(actions ? { actions } : {}), ...(ew === undefined ? {} : { why: ew }) };
          });
          return { ...c, elements, ...(cw === undefined ? {} : { why: cw }) };
        });
        const raw = sanitizeRawStack(wholeStack(cards));
        if (keysOf(raw).has("why")) return false;
        const v = validate(raw);
        if (!v.valid) return false;
        const fin = finaliseGeneratedStack(v.stack, { prompt: fx.prompt });
        return validate(fin).valid && !keysOf(fin).has("why");
      }),
      { numRuns: 200 },
    );
  });

  it("TASK-34a7: property — the stream, split anywhere (inside a why too), deals no why in any preview card or the done stack", async () => {
    const text = streamText(fx, true);
    const inWhy = text.indexOf('"why":"') + 3;
    await fc.assert(
      fc.asyncProperty(fc.uniqueArray(fc.integer({ min: 1, max: text.length - 1 }), { maxLength: 40 }), async (cuts) => {
        const at = [...new Set([inWhy, ...cuts])].sort((a, b) => a - b);
        const chunks = at.map((c, j) => text.slice(j === 0 ? 0 : at[j - 1], c)).concat(text.slice(at[at.length - 1]));
        const out: GenerateStreamMessage[] = [];
        let fellBack = false;
        await quiet(() =>
          streamGenerate({ prompt: fx.prompt }, { write: (m) => void out.push(m), end: () => {} }, {
            callStream: async function* () { for (const c of chunks) yield c; },
            generate: async () => { fellBack = true; return { ok: false, message: "x" }; },
            sleep: async () => {},
          }),
        );
        const done = out.find((m) => m.type === "done");
        return !fellBack && done !== undefined && out.filter((m) => m.type === "card").length === fx.cards.length && !keysOf(out).has("why");
      }),
      { numRuns: 60 },
    );
  });

  it("TASK-34a7: one-shot and retry — generate() strips the why from the first answer and from the retry's", async () => {
    // First reply: valid, with why. No retry needed.
    callMock.mockResolvedValueOnce(JSON.stringify(wholeStack(fx.cards)));
    const a = await quiet(() => generate({ prompt: fx.prompt }));
    expect(a.ok && !a.isFallback).toBe(true);
    if (a.ok) expect(keysOf(a.stack).has("why")).toBe(false);

    // First reply: no right answer on a quiz (forces the retry); the retry is valid. Both carry why.
    const broken = JSON.parse(JSON.stringify(fx.cards)) as Array<Record<string, unknown>>;
    const q = broken.find((c) => c["kind"] === "quiz")!;
    for (const e of q["elements"] as Array<Record<string, unknown>>) {
      if (Array.isArray(e["actions"])) e["actions"] = (e["actions"] as Array<Record<string, unknown>>).map((x) => (x["type"] === "score" ? { ...x, delta: 0 } : x));
    }
    callMock.mockResolvedValueOnce(JSON.stringify(wholeStack(broken))).mockResolvedValueOnce(JSON.stringify(wholeStack(fx.cards)));
    const b = await quiet(() => generate({ prompt: fx.prompt }));
    expect(callMock).toHaveBeenCalledTimes(3);
    expect(b.ok && !b.isFallback).toBe(true);
    if (b.ok) {
      expect(keysOf(b.stack).has("why")).toBe(false);
      // …and none of it reaches the exported file.
      const html = await exportLivingStack(b.stack);
      expect(html).not.toContain("Pupils mix up");
      expect(html).not.toContain('\\"why\\"');
    }
  });
});

describe("TASK-34a8: the size cost of the why field, measured", () => {
  it("TASK-34a8: the numbers in the spec and KIRO_LOG are the measured ones", () => {
    const c = whyCost();
    expect(c.withChars).toBeGreaterThan(c.withoutChars);
    const line = `${c.perCardWithout} → ${c.perCardWith} characters per card (${c.withoutChars} → ${c.withChars} for the ${c.cards}-card deck, +${c.percentAdded} %; +${c.perQuizAdded} per quiz card)`;
    expect(read(".kiro/specs/stack-generator/tasks.md")).toContain(line);
    expect(read("docs/KIRO_LOG.md")).toContain(line);
  });
});
