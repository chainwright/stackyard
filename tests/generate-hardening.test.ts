// tests/generate-hardening.test.ts
// TASK-26 b, c, d, g, j through the REAL generate() and streamGenerate() with
// only the network (llmGateway) mocked. The model outputs below are the exact
// shapes the live review saw: a one-text flash card, text at y=40, invented
// picture paths, Title Case answers, "Question 3:" prefixes.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../server/llmGateway.js", () => {
  class LlmUnavailableError extends Error {
    readonly kind: string;
    constructor(message: string, kind = "network") {
      super(message);
      this.name = "LlmUnavailableError";
      this.kind = kind;
    }
  }
  class LlmMalformedError extends Error {}
  class ConfigurationError extends Error {}
  return { call: vi.fn(), callStream: vi.fn(), LlmUnavailableError, LlmMalformedError, ConfigurationError };
});

import * as gateway from "../server/llmGateway.js";
import { generate, reasonFromError } from "../server/stackGenerator.js";
import { streamGenerate, type LineSink } from "../server/stream-generate.js";
import { exportStack, exportLivingStack } from "../server/exporter.js";
import { validate } from "../src/shared/validator.js";
import { cardHasForward } from "../src/shared/flow.js";
import type { GenerateStreamMessage, Stack, Card } from "../src/shared/types.js";

const callMock = vi.mocked(gateway.call);
const callStreamMock = vi.mocked(gateway.callStream);
const Unavailable = gateway.LlmUnavailableError as unknown as new (m: string, k?: string) => Error;
const Config = gateway.ConfigurationError as unknown as new (m: string) => Error;

let n = 0;
const uid = (): string => `beef0000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;

/** What the live model sent: text at y=40, a one-text flash, a made-up picture… */
function liveModelStack(): Stack {
  const endId = uid();
  const flash: Card = {
    id: uid(), kind: "flash", actions: [],
    elements: [
      { type: "text", id: uid(), x: 40, y: 40, w: 720, h: 120, content: "Evaporation: when the sun heats water and it rises as vapour." },
      { type: "button", id: uid(), x: 300, y: 500, w: 200, h: 60, label: "Next Card", actions: [] },
    ],
  };
  const quizId = uid();
  const quiz: Card = {
    id: quizId, kind: "quiz", actions: [],
    elements: [
      { type: "text", id: uid(), x: 40, y: 40, w: 720, h: 120, content: "Question 1: What do we call water vapour cooling into tiny droplets that make clouds?" },
      { type: "image", id: uid(), x: 600, y: 10, w: 100, h: 80, src: "images/cheval.png", alt: "cloud" },
      { type: "button", id: uid(), x: 40, y: 200, w: 340, h: 70, label: "Condensation", actions: [{ type: "score", delta: 1 }, { type: "goto", cardId: endId }] },
      { type: "button", id: uid(), x: 420, y: 200, w: 340, h: 70, label: "It Turns Into Wood", actions: [{ type: "score", delta: 0 }, { type: "goto", cardId: endId }] },
    ],
  };
  flash.elements[1] = { ...(flash.elements[1] as object), actions: [{ type: "goto", cardId: quizId }] } as never;
  return {
    id: uid(), title: "Water cycle",
    theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" },
    cards: [flash, quiz, { id: endId, kind: "end", actions: [], elements: [{ type: "field", id: uid(), x: 40, y: 250, w: 720, h: 80, variable: "score" }] }],
  };
}

function invalidStackJson(): string {
  const s = liveModelStack();
  s.cards.push({ id: uid(), kind: "end", actions: [], elements: [] }); // two end cards → invalid
  return JSON.stringify(s);
}

beforeEach(() => {
  callMock.mockReset();
  callStreamMock.mockReset();
});
afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
// g) the fallback reason

describe("TASK-26g: the fallback reason comes from the error's kind, never its text", () => {
  it("a deadline ('took too long') is a timeout", () => {
    expect(reasonFromError(new Unavailable("The AI service took too long to respond. Try again in a moment.", "timeout"))).toBe("timeout");
  });

  it("is NOT fooled by the word 'time' in a non-timeout error", () => {
    expect(reasonFromError(new Unavailable("Real-time upstream error (HTTP 503). Try again sometime.", "http"))).toBe("error");
  });

  it("a client disconnect and network failures are errors; a missing key is no-key", () => {
    expect(reasonFromError(new Unavailable("The request was cancelled before the AI service finished.", "cancelled"))).toBe("error");
    expect(reasonFromError(new Unavailable("We couldn't reach the AI service.", "network"))).toBe("error");
    expect(reasonFromError(new Config("no key"))).toBe("no-key");
    expect(reasonFromError(new Error("something else"))).toBe("error");
  });

  it("generate() reports 'timeout' when the call hits its deadline", async () => {
    callMock.mockRejectedValue(new Unavailable("The AI service took too long to respond. Try again in a moment.", "timeout"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await generate({ prompt: "a quiz about rivers" });
    expect(r.ok && r.isFallback && r.fallbackReason).toBe("timeout");
  });
});

describe("TASK-26g: a retry counts against the daily budget (mutant D)", () => {
  it("a first attempt that fails validation then a good retry = TWO counted model calls", async () => {
    const counted = vi.fn();
    callMock.mockResolvedValueOnce(invalidStackJson()).mockResolvedValueOnce(JSON.stringify(liveModelStack()));
    const r = await generate({ prompt: "a quiz about rivers" }, { onModelCall: counted });
    expect(r.ok).toBe(true);
    expect(callMock).toHaveBeenCalledTimes(2);
    expect(counted).toHaveBeenCalledTimes(2); // if the retry stops counting, this is 1
  });

  it("a clean first attempt is ONE counted call", async () => {
    const counted = vi.fn();
    callMock.mockResolvedValueOnce(JSON.stringify(liveModelStack()));
    await generate({ prompt: "a quiz about rivers" }, { onModelCall: counted });
    expect(counted).toHaveBeenCalledTimes(1);
  });

  it("each counted call happens BEFORE its upstream call (so a hung call is still counted)", async () => {
    const order: string[] = [];
    callMock.mockImplementation(async () => { order.push("call"); return invalidStackJson(); });
    await generate({ prompt: "p" }, { onModelCall: () => order.push("count") });
    expect(order).toEqual(["count", "call", "count", "call"]);
  });

  it("a forced fallback counts nothing and never calls the model", async () => {
    const counted = vi.fn();
    const r = await generate({ prompt: "p" }, { forceFallback: true, onModelCall: counted });
    expect(r.ok && r.fallbackReason).toBe("cap");
    expect(counted).not.toHaveBeenCalled();
    expect(callMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// b, c, d, j) the whole one-shot pipeline

describe("one-shot generate(): the live model's output becomes a playable, exportable deck", () => {
  async function generated(): Promise<Stack> {
    callMock.mockResolvedValueOnce(JSON.stringify(liveModelStack()));
    const r = await generate({ prompt: "water cycle" });
    if (!r.ok) throw new Error("generate failed");
    return r.stack;
  }

  it("repairs the flash card: a front, a back, and a Next that goes on", async () => {
    const stack = await generated();
    const flash = stack.cards[0]!;
    expect(flash.kind).toBe("flash");
    const texts = flash.elements.filter((e) => e.type === "text");
    expect(texts).toHaveLength(2);
    expect(texts[0]!.type === "text" && texts[0]!.content).toBe("Evaporation");
    expect(cardHasForward(flash)).toBe(true);
  });

  it("lays the quiz out from the template, below the counter band", async () => {
    const quiz = (await generated()).cards[1]!;
    const q = quiz.elements.find((e) => e.type === "text")!;
    expect(q.y).toBeGreaterThanOrEqual(104);
    for (const e of quiz.elements) expect(e.y).toBeGreaterThanOrEqual(96);
  });

  it("drops the invented picture, the 'Question 1:' prefix and the Title Case answer", async () => {
    const quiz = (await generated()).cards[1]!;
    expect(quiz.elements.some((e) => e.type === "image")).toBe(false);
    const q = quiz.elements.find((e) => e.type === "text");
    expect(q && q.type === "text" && q.content.startsWith("What do we call")).toBe(true);
    const labels = quiz.elements.filter((e) => e.type === "button").map((e) => (e.type === "button" ? e.label : ""));
    expect(labels).toContain("It turns into wood");
    expect(labels).not.toContain("It Turns Into Wood");
  });

  it("the generated deck validates and EXPORTS (class and living) — the live 422 is gone", async () => {
    const stack = await generated();
    expect(validate(stack).valid).toBe(true);
    await expect(exportStack(stack)).resolves.toContain("<!doctype html>");
    await expect(exportLivingStack(stack)).resolves.toContain("<!doctype html>");
  });

  it("a model that only mis-sizes a box does not burn a retry", async () => {
    const s = liveModelStack();
    const q = s.cards[1]!.elements[0]!;
    q.x = 700; q.w = 400; // runs off the right edge: invalid before sanitising
    callMock.mockResolvedValueOnce(JSON.stringify(s));
    const r = await generate({ prompt: "p" });
    expect(r.ok).toBe(true);
    expect(callMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// the streaming path

class Collect implements LineSink {
  messages: GenerateStreamMessage[] = [];
  write(m: GenerateStreamMessage): void { this.messages.push(m); }
  end(): void {}
}

function jsonLines(stack: Stack): string[] {
  const header = { kind: "stack", id: stack.id, title: stack.title, theme: stack.theme };
  return [
    JSON.stringify(header) + "\n",
    ...stack.cards.map((c) => JSON.stringify({ kind: "card", card: c }) + "\n"),
  ];
}

describe("streaming generate: previews are laid out and the final deck is repaired", () => {
  const noSleep = async (): Promise<void> => {};

  it("deals clean preview cards and finishes with a repaired, exportable deck", async () => {
    const chunks = jsonLines(liveModelStack());
    callStreamMock.mockImplementation(async function* () { for (const c of chunks) yield c; });
    const sink = new Collect();
    await streamGenerate({ prompt: "water cycle" }, sink, { sleep: noSleep });

    const cards = sink.messages.filter((m): m is Extract<GenerateStreamMessage, { type: "card" }> => m.type === "card");
    expect(cards).toHaveLength(3);
    // Previews are laid out: nothing in the top band, no invented picture.
    const quizPreview = cards[1]!.card;
    expect(quizPreview.elements.some((e) => e.type === "image")).toBe(false);
    for (const e of quizPreview.elements) expect(e.y).toBeGreaterThanOrEqual(96);
    // The flash preview already has a front and a back.
    expect(cards[0]!.card.elements.filter((e) => e.type === "text")).toHaveLength(2);

    const done = sink.messages.find((m) => m.type === "done") as Extract<GenerateStreamMessage, { type: "done" }>;
    expect(done.isFallback).toBe(false);
    expect(cardHasForward(done.stack.cards[0]!)).toBe(true);
    expect(validate(done.stack).valid).toBe(true);
    await expect(exportStack(done.stack)).resolves.toContain("<!doctype html>");
  });

  it("the first card is dealt before the model has finished (progressive, unchanged)", async () => {
    const chunks = jsonLines(liveModelStack());
    let dealtBeforeEnd = -1;
    const sink = new Collect();
    callStreamMock.mockImplementation(async function* () {
      yield chunks[0]!;
      yield chunks[1]!;
      dealtBeforeEnd = sink.messages.filter((m) => m.type === "card").length;
      yield chunks[2]!;
      yield chunks[3]!;
    });
    await streamGenerate({ prompt: "p" }, sink, { sleep: noSleep });
    expect(dealtBeforeEnd).toBe(1);
  });
});

describe("TASK-26g: one log line per fallback, and the stream's own cause is logged once", () => {
  it("a timed-out stream logs its cause once and the fallback once (not twice)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const timeout = new Unavailable("The AI service took too long to respond. Try again in a moment.", "timeout");
    callStreamMock.mockImplementation(async function* () { throw timeout; });
    callMock.mockRejectedValue(timeout);
    const sink = new Collect();
    await streamGenerate({ prompt: "p" }, sink, { sleep: async () => {} });

    const lines = warn.mock.calls.map((c) => String(c[0]));
    const streamCause = lines.filter((l) => l.includes("stream attempt failed"));
    const fallback = lines.filter((l) => /fallback reason=|served ready-made deck/.test(l));
    expect(streamCause).toHaveLength(1);
    expect(streamCause[0]).toContain("timeout");
    expect(fallback).toHaveLength(1);
    expect(fallback[0]).toContain("reason=timeout");
    // And the client was told the honest reason.
    const start = sink.messages.find((m) => m.type === "start") as Extract<GenerateStreamMessage, { type: "start" }>;
    expect(start.fallbackReason).toBe("timeout");
    // Never the key or a URL.
    expect(lines.join("\n")).not.toMatch(/Bearer|sk-|https?:\/\//);
  });

  it("the budget cap logs once (generate() returns early, so the stream logs it)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sink = new Collect();
    await streamGenerate({ prompt: "p" }, sink, { sleep: async () => {}, forceFallback: true });
    const lines = warn.mock.calls.map((c) => String(c[0]));
    expect(lines.filter((l) => l.includes("reason: cap"))).toHaveLength(1);
    expect(callStreamMock).not.toHaveBeenCalled();
  });

  it("a malformed line from the model is logged without echoing its content", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    callStreamMock.mockImplementation(async function* () { yield "this is not json SECRET-CONTENT\n"; });
    callMock.mockRejectedValue(new Unavailable("down", "network"));
    await streamGenerate({ prompt: "p" }, new Collect(), { sleep: async () => {} });
    const lines = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(lines).toContain("stream attempt failed");
    expect(lines).not.toContain("SECRET-CONTENT");
  });
});
