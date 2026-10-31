// tests/stackGenerator.e2e.test.ts
// End-to-end smoke test for the full stack generation pipeline.
//
// Strategy:
//   - Stub llmGateway.call so no real HTTP calls are made.
//   - Call generate() directly (no HTTP layer) to exercise the full
//     prompt-build → LLM → parse → validate → retry → fallback path.
//   - The validator runs for real — no stubs.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { generate } from "../server/stackGenerator.js";
import { validate } from "../src/shared/validator.js";
import { LlmUnavailableError } from "../server/llmGateway.js";
import type { GenerateRequest } from "../src/shared/types.js";

// ---------------------------------------------------------------------------
// Module mock — replace llmGateway with a controllable stub

vi.mock("../server/llmGateway.js", () => {
  const LlmUnavailableError = class LlmUnavailableError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "LlmUnavailableError";
    }
  };
  const LlmMalformedError = class LlmMalformedError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "LlmMalformedError";
    }
  };
  const ConfigurationError = class ConfigurationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "ConfigurationError";
    }
  };
  return {
    call: vi.fn(),
    LlmUnavailableError,
    LlmMalformedError,
    ConfigurationError,
  };
});

import * as gateway from "../server/llmGateway.js";
const callMock = vi.mocked(gateway.call);

// ---------------------------------------------------------------------------
// Helpers

function req(prompt: string): GenerateRequest {
  return { prompt };
}

const PROMPT = "a five-card quiz about Irish rivers";

/**
 * A minimal valid stack JSON string.
 * All IDs are unique. All invariants satisfied.
 */
function validStackJson(): string {
  return JSON.stringify({
    id: "11111111-1111-4111-8111-111111111111",
    title: "Irish Rivers Quiz",
    theme: {
      background: "#ffffff",
      foreground: "#000000",
      font: "sans-serif",
    },
    cards: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        kind: "story",
        elements: [
          {
            type: "text",
            id: "33333333-3333-4333-8333-333333333333",
            x: 0,
            y: 0,
            w: 800,
            h: 100,
            content: "Welcome to Irish Rivers Quiz",
          },
          {
            type: "button",
            id: "44444444-4444-4444-8444-444444444444",
            x: 300,
            y: 460,
            w: 200,
            h: 60,
            label: "Start",
            actions: [
              {
                type: "goto",
                cardId: "55555555-5555-4555-8555-555555555555",
              },
            ],
          },
        ],
        actions: [],
      },
      {
        id: "55555555-5555-4555-8555-555555555555",
        kind: "quiz",
        elements: [
          {
            type: "text",
            id: "66666666-6666-4666-8666-666666666666",
            x: 0,
            y: 0,
            w: 800,
            h: 100,
            content: "Which is the longest river in Ireland?",
          },
          {
            type: "button",
            id: "77777777-7777-4777-8777-777777777777",
            x: 40,
            y: 200,
            w: 320,
            h: 60,
            label: "The Shannon",
            actions: [
              { type: "score", delta: 1 },
              { type: "sound", sound: "cheer" },
              {
                type: "goto",
                cardId: "88888888-8888-4888-8888-888888888888",
              },
            ],
          },
          {
            type: "button",
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            x: 440,
            y: 200,
            w: 320,
            h: 60,
            label: "The Liffey",
            actions: [
              { type: "score", delta: 0 },
              { type: "sound", sound: "buzz" },
              {
                type: "goto",
                cardId: "88888888-8888-4888-8888-888888888888",
              },
            ],
          },
        ],
        actions: [],
      },
      {
        id: "88888888-8888-4888-8888-888888888888",
        kind: "end",
        elements: [
          {
            type: "field",
            id: "99999999-9999-4999-8999-999999999999",
            x: 300,
            y: 250,
            w: 200,
            h: 60,
            variable: "score",
          },
        ],
        actions: [],
      },
    ],
  });
}

/**
 * A stack JSON that fails validation — duplicate card ID.
 */
function invalidStackJson(): string {
  const stack = JSON.parse(validStackJson()) as {
    cards: Array<{ id: string }>;
  };
  // Force a duplicate: card[1] gets card[0]'s id.
  if (stack.cards[1] !== undefined && stack.cards[0] !== undefined) {
    stack.cards[1].id = stack.cards[0].id;
  }
  return JSON.stringify(stack);
}

// ---------------------------------------------------------------------------
// Setup

beforeEach(() => {
  callMock.mockReset();
});

// ---------------------------------------------------------------------------
// Scenario 1: LLM returns a valid stack on the first attempt.

describe("e2e: LLM returns valid stack on first attempt", () => {
  it("returns GenerateSuccess", async () => {
    callMock.mockResolvedValue(validStackJson());

    const result = await generate(req(PROMPT));

    expect(result.ok).toBe(true);
  });

  it("isFallback is false", async () => {
    callMock.mockResolvedValue(validStackJson());

    const result = await generate(req(PROMPT));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.isFallback).toBe(false);
    }
  });

  it("returned stack passes validate()", async () => {
    callMock.mockResolvedValue(validStackJson());

    const result = await generate(req(PROMPT));

    expect(result.ok).toBe(true);
    if (result.ok) {
      const vr = validate(result.stack);
      expect(vr.valid).toBe(true);
    }
  });

  it("LLM is called exactly once", async () => {
    callMock.mockResolvedValue(validStackJson());

    await generate(req(PROMPT));

    expect(callMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: LLM returns invalid stack on attempt 1, valid stack on attempt 2.

describe("e2e: invalid on attempt 1, valid on attempt 2 (retry)", () => {
  it("returns GenerateSuccess", async () => {
    callMock
      .mockResolvedValueOnce(invalidStackJson())
      .mockResolvedValueOnce(validStackJson());

    const result = await generate(req(PROMPT));

    expect(result.ok).toBe(true);
  });

  it("isFallback is false", async () => {
    callMock
      .mockResolvedValueOnce(invalidStackJson())
      .mockResolvedValueOnce(validStackJson());

    const result = await generate(req(PROMPT));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.isFallback).toBe(false);
    }
  });

  it("returned stack passes validate()", async () => {
    callMock
      .mockResolvedValueOnce(invalidStackJson())
      .mockResolvedValueOnce(validStackJson());

    const result = await generate(req(PROMPT));

    expect(result.ok).toBe(true);
    if (result.ok) {
      const vr = validate(result.stack);
      expect(vr.valid).toBe(true);
    }
  });

  it("LLM is called exactly twice", async () => {
    callMock
      .mockResolvedValueOnce(invalidStackJson())
      .mockResolvedValueOnce(validStackJson());

    await generate(req(PROMPT));

    expect(callMock).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: LLM always throws LlmUnavailableError — fallback stack returned.

describe("e2e: LLM always throws LlmUnavailableError", () => {
  it("returns GenerateSuccess", async () => {
    callMock.mockRejectedValue(
      new LlmUnavailableError("connection refused")
    );

    const result = await generate(req(PROMPT));

    expect(result.ok).toBe(true);
  });

  it("isFallback is true", async () => {
    callMock.mockRejectedValue(
      new LlmUnavailableError("connection refused")
    );

    const result = await generate(req(PROMPT));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.isFallback).toBe(true);
    }
  });

  it("returned fallback stack passes validate()", async () => {
    callMock.mockRejectedValue(
      new LlmUnavailableError("connection refused")
    );

    const result = await generate(req(PROMPT));

    expect(result.ok).toBe(true);
    if (result.ok) {
      const vr = validate(result.stack);
      expect(vr.valid).toBe(true);
    }
  });
});
