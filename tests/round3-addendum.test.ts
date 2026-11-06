// tests/round3-addendum.test.ts
// TASK-27 z1–z5 (J4, round 3): proper nouns, pronoun terms, trap loops and
// card-level reachability, malformed requests not costing a slot, and the
// fallback honouring a disconnect.

import { describe, it, expect, vi, afterEach } from "vitest";
import fc from "fast-check";
import type { Server } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { sentenceCaseLabel, splitTermAndExplanation } from "../server/normalizeGenerated.js";
import { checkReachability, describeProblems } from "../src/shared/reachability.js";
import { streamGenerate } from "../server/stream-generate.js";
import type { LineSink } from "../server/stream-generate.js";
import { createServer } from "../server/index.js";
import type { Action, Card, GenerateStreamMessage, Stack } from "../src/shared/types.js";

// ---------------------------------------------------------------------------
// z1 — proper nouns survive the sentence-case pass

describe("z1: sentenceCaseLabel keeps proper nouns", () => {
  it.each([
    ["The Battle Of Hastings", "The Battle of Hastings"],
    ["United States Of America", "United States of America"],
    ["Isle Of Man", "Isle of Man"],
    ["Bank Of England", "Bank of England"],
    ["Treaty Of Versailles", "Treaty of Versailles"],
    ["Brian Boru And The Dal Cais", "Brian Boru and the Dal Cais"],
    ["Saint Patrick Of Ireland", "Saint Patrick of Ireland"],
  ])("%s", (input, expected) => {
    expect(sentenceCaseLabel(input)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// z2 — a pronoun is never the front of a flash card

describe("z2: no pronoun terms", () => {
  it.each([
    "This is the process where plants make food from sunlight.",
    "There are 206 bones in the adult body.",
    "It is when water vapour cools and turns into drops.",
    "These are the rivers that run to the sea.",
    "They are small boats used by the Vikings.",
  ])("%s", (text) => {
    const split = splitTermAndExplanation(text);
    if (split !== null) {
      expect(split.term.toLowerCase()).not.toMatch(/^(this|that|it|there|these|those|they|he|she|we)$/);
      expect(split.term.length).toBeGreaterThanOrEqual(3);
    }
  });
  it("still splits a real subject", () => {
    expect(splitTermAndExplanation("Evaporation is when water becomes a gas.")?.term).toBe("Evaporation");
  });
});

// ---------------------------------------------------------------------------
// z3 — every card can still reach the end

const id = (n: number): string => `abcd0000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

function card(n: number, kind: Card["kind"], buttonTargets: number[], cardLevel: number[] = []): Card {
  return {
    id: id(n),
    kind,
    actions: cardLevel.map((t): Action => ({ type: "goto", cardId: id(t) })),
    elements: buttonTargets.map((t, i) => ({
      type: "button" as const,
      id: id(1000 + n * 10 + i),
      x: 0, y: 0, w: 100, h: 50,
      label: `Go ${i}`,
      actions: [{ type: "goto" as const, cardId: id(t) }],
    })),
  };
}
const deck = (cards: Card[]): Stack => ({
  id: id(9999), title: "T", theme: { background: "#fff", foreground: "#000", font: "x" }, cards,
});
const END = (n: number): Card => ({ id: id(n), kind: "end", actions: [], elements: [] });

describe("z3: reverse reachability from the end card", () => {
  it("a branch that loops on itself is reported, even though every card is reachable", () => {
    // 1 -> {2, 3};  2 -> end;  3 -> 3 (its only button points to itself)
    const stack = deck([card(1, "story", [2, 3]), card(2, "story", [4]), card(3, "story", [3]), END(4)]);
    const report = checkReachability(stack);
    expect(report.unreachable).toHaveLength(0);
    expect(report.trapped.map((c) => c.id)).toEqual([id(3)]);
    expect(report.ok).toBe(false);
    expect(describeProblems(report, (c) => c.id).join(" ")).toContain("never reaches the last card");
  });

  it("a two-card loop is trapped too", () => {
    const stack = deck([card(1, "story", [2, 3]), card(2, "story", [3]), card(3, "story", [2]), END(4)]);
    // 2 <-> 3, neither goes to the end; 1 has no route to the end either.
    const ids = checkReachability(stack).trapped.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining([id(2), id(3)]));
  });

  it("a card reachable ONLY by a card-level goto (auto-advance) is reachable and not trapped", () => {
    // 1 --(card-level)--> 2 --(button)--> end.  Ignoring card-level links would call 2 unreachable.
    const stack = deck([card(1, "story", [], [2]), card(2, "story", [3]), END(3)]);
    const report = checkReachability(stack);
    expect(report.unreachable).toHaveLength(0);
    expect(report.trapped).toHaveLength(0);
    expect(report.stuck).toHaveLength(0);
  });

  it("a card that reaches the end ONLY through a card-level goto is not trapped", () => {
    const stack = deck([card(1, "story", [2]), card(2, "story", [], [3]), END(3)]);
    // card 2 has no button but auto-advances to the end: fine.
    expect(checkReachability(stack).trapped).toHaveLength(0);
  });

  it("property: ok ⇒ from every reachable card, some path reaches an end card (independent oracle)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 7 }).chain((n) =>
          fc.record({
            n: fc.constant(n),
            edges: fc.array(fc.array(fc.integer({ min: 0, max: n }), { minLength: 1, maxLength: 3 }), { minLength: n, maxLength: n }),
          }),
        ),
        ({ n, edges }) => {
          // cards 0..n-1 are story cards; card n is the end.
          const cards = edges.map((targets, i) => card(i, "story", targets));
          const stack = deck([...cards, END(n)]);
          const report = checkReachability(stack);
          if (!report.ok) return true;
          // Oracle: plain DFS per reachable card.
          const next = (i: number): number[] => edges[i]!;
          const reaches = (from: number): boolean => {
            const seen = new Set<number>();
            const stackIdx = [from];
            while (stackIdx.length) {
              const x = stackIdx.pop()!;
              if (x === n) return true;
              if (seen.has(x)) continue;
              seen.add(x);
              for (const t of next(x)) stackIdx.push(t);
            }
            return false;
          };
          for (const cardId of report.reachable) {
            const idx = cards.findIndex((c) => c.id === cardId);
            if (idx >= 0 && !reaches(idx)) return false;
          }
          return true;
        },
      ),
      { numRuns: 300 },
    );
  });
});

// ---------------------------------------------------------------------------
// z4 — malformed requests do not burn a slot

describe("z4: validate the body before counting a rate slot", () => {
  let server: Server;
  afterEach(() => server?.close());

  it("six malformed requests then one valid one: the valid one is served", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "stackyard-z4-"));
    mkdirSync(path.join(dir, "m"), { recursive: true });
    writeFileSync(path.join(dir, "m", "index.html"), "<!doctype html>");
    server = createServer({ serveStatic: false, staticRoot: path.join(dir, "m"), generateRatePer10Min: 1, generateDailyCap: 1_000_000 });
    await new Promise<void>((r) => server.listen(0, r));
    const addr = server.address();
    const url = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/api/generate`;
    const post = (body: string) =>
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body });

    const bad = ['{"prompt":', "not json", "{}", '{"prompt":""}', '{"prompt":"   "}', '{"prompt":42}'];
    for (const b of bad) expect((await post(b)).status).toBe(400);

    const ok = await post(JSON.stringify({ prompt: "a quiz about rivers" }));
    expect(ok.status).toBe(200); // not 429
    await ok.text();
    // …and that valid one DID count: the next valid request is limited.
    expect((await post(JSON.stringify({ prompt: "another quiz" }))).status).toBe(429);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// z5 — the fallback path

function collector(): { sink: LineSink; lines: GenerateStreamMessage[]; ended: () => boolean } {
  const lines: GenerateStreamMessage[] = [];
  let ended = false;
  return { lines, ended: () => ended, sink: { write: (o) => void lines.push(o), end: () => void (ended = true) } };
}
// eslint-disable-next-line require-yield
const failingStream = async function* (): AsyncGenerator<string> {
  throw new Error("down");
};

describe("z5: fallback honours the client's disconnect and is never silent", () => {
  it("passes the client's signal into generate()", async () => {
    const client = new AbortController();
    let seen: AbortSignal | undefined;
    const generate = vi.fn(async (_r: unknown, opts?: { signal?: AbortSignal }) => {
      seen = opts?.signal;
      return { ok: false as const, message: "x" };
    });
    const { sink } = collector();
    await streamGenerate({ prompt: "p" }, sink, {
      callStream: failingStream, generate: generate as never, sleep: async () => {}, signal: client.signal,
    });
    expect(seen).toBe(client.signal);
  });

  it("writes an early `start` before the (slow) fallback finishes", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const generate = vi.fn(async () => {
      await gate;
      return { ok: false as const, message: "late" };
    });
    const { sink, lines } = collector();
    const run = streamGenerate({ prompt: "p" }, sink, { callStream: failingStream, generate: generate as never, sleep: async () => {} });
    await new Promise((r) => setTimeout(r, 20));
    expect(lines[0]).toEqual({ type: "start", total: 0, title: "", isFallback: false });
    expect(lines.some((l) => l.type === "error")).toBe(false); // generate() still running
    release();
    await run;
  });

  it("writes nothing more once the client disconnected during the fallback", async () => {
    const client = new AbortController();
    const generate = vi.fn(async () => {
      client.abort(); // the client leaves while the retry runs
      return { ok: false as const, message: "nobody to tell" };
    });
    const { sink, lines, ended } = collector();
    await streamGenerate({ prompt: "p" }, sink, {
      callStream: failingStream, generate: generate as never, sleep: async () => {}, signal: client.signal,
    });
    expect(lines.some((l) => l.type === "error" || l.type === "card" || l.type === "done")).toBe(false);
    expect(ended()).toBe(true);
  });
});
