// tests/stackGenerator.test.ts
// Unit tests + property test for server/stackGenerator.ts.
//
// Strategy:
//   - vi.mock replaces the llmGateway module so no real HTTP calls are made.
//   - The mock's call() is a vi.fn() we control per test via mockResolvedValue/mockRejectedValue.
//   - The validator is imported directly (no stub) — we want real validation behaviour.

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
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

// After mocking, import the mock so we can control it in tests.
import * as gateway from "../server/llmGateway.js";
const callMock = vi.mocked(gateway.call);

// ---------------------------------------------------------------------------
// Helpers

function req(prompt: string): GenerateRequest {
  return { prompt };
}

const PROMPT = "a five-card quiz about Irish rivers";

/** A minimal valid stack JSON string that will pass validate(). */
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
            content: "Welcome to Irish Rivers",
          },
          {
            type: "button",
            id: "44444444-4444-4444-8444-444444444444",
            x: 300,
            y: 460,
            w: 200,
            h: 60,
            label: "Start",
            actions: [{ type: "goto", cardId: "55555555-5555-4555-8555-555555555555" }],
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
              { type: "goto", cardId: "88888888-8888-4888-8888-888888888888" },
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
              { type: "goto", cardId: "88888888-8888-4888-8888-888888888888" },
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
 * A stack JSON that fails validation: it has NO end card (invariant 3).
 *
 * It used to be a duplicated card id. Ids are the server's business now
 * (TASK-27m: every id is re-minted before validation, so a duplicate or a
 * mistyped id can no longer sink a deck), so that is no longer a way to fail.
 */
function invalidStackJson(): string {
  const stack = JSON.parse(validStackJson()) as { cards: Array<{ kind: string }> };
  stack.cards[stack.cards.length - 1]!.kind = "story";
  return JSON.stringify(stack);
}

// ---------------------------------------------------------------------------
// Setup

beforeEach(() => {
  callMock.mockReset();
});

// ---------------------------------------------------------------------------
// Unit tests

describe("stackGenerator.generate — first attempt succeeds", () => {
  it("returns GenerateSuccess with isFallback: false", async () => {
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
      expect(validate(result.stack).valid).toBe(true);
    }
  });

  it("calls the gateway exactly once", async () => {
    callMock.mockResolvedValue(validStackJson());

    await generate(req(PROMPT));
    expect(callMock).toHaveBeenCalledTimes(1);
  });

  it("first call uses temperature 0.7", async () => {
    callMock.mockResolvedValue(validStackJson());

    await generate(req(PROMPT));
    expect(callMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ temperature: 0.7 })
    );
  });
});

describe("stackGenerator.generate — first attempt fails, retry succeeds", () => {
  it("returns GenerateSuccess with isFallback: false", async () => {
    callMock
      .mockResolvedValueOnce(invalidStackJson())
      .mockResolvedValueOnce(validStackJson());

    const result = await generate(req(PROMPT));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.isFallback).toBe(false);
    }
  });

  it("calls the gateway exactly twice", async () => {
    callMock
      .mockResolvedValueOnce(invalidStackJson())
      .mockResolvedValueOnce(validStackJson());

    await generate(req(PROMPT));
    expect(callMock).toHaveBeenCalledTimes(2);
  });

  it("retry call uses temperature 0.2", async () => {
    callMock
      .mockResolvedValueOnce(invalidStackJson())
      .mockResolvedValueOnce(validStackJson());

    await generate(req(PROMPT));
    expect(callMock).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      expect.objectContaining({ temperature: 0.2 })
    );
  });

  it("returned stack passes validate()", async () => {
    callMock
      .mockResolvedValueOnce(invalidStackJson())
      .mockResolvedValueOnce(validStackJson());

    const result = await generate(req(PROMPT));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(validate(result.stack).valid).toBe(true);
    }
  });
});

describe("stackGenerator.generate — both attempts fail", () => {
  it("returns GenerateError (ok: false)", async () => {
    callMock
      .mockResolvedValueOnce(invalidStackJson())
      .mockResolvedValueOnce(invalidStackJson());

    const result = await generate(req(PROMPT));
    expect(result.ok).toBe(false);
  });

  it("GenerateError has a plain-language message", async () => {
    callMock
      .mockResolvedValueOnce(invalidStackJson())
      .mockResolvedValueOnce(invalidStackJson());

    const result = await generate(req(PROMPT));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Must be a non-empty plain string — no stack trace, no error keys
      expect(typeof result.message).toBe("string");
      expect(result.message.trim().length).toBeGreaterThan(0);
      expect(result.message).not.toContain("Error:");
      expect(result.message).not.toContain("at ");
    }
  });

  it("first attempt uses temperature 0.7, second uses 0.2", async () => {
    callMock
      .mockResolvedValueOnce(invalidStackJson())
      .mockResolvedValueOnce(invalidStackJson());

    await generate(req(PROMPT));

    expect(callMock).toHaveBeenNthCalledWith(
      1,
      expect.any(Object),
      expect.objectContaining({ temperature: 0.7 })
    );
    expect(callMock).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      expect.objectContaining({ temperature: 0.2 })
    );
  });
});

describe("stackGenerator.generate — LlmUnavailableError", () => {
  it("returns GenerateSuccess with isFallback: true when first call throws", async () => {
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
      expect(validate(result.stack).valid).toBe(true);
    }
  });

  it("falls back when LlmUnavailableError occurs on the retry call", async () => {
    callMock
      .mockResolvedValueOnce(invalidStackJson())
      .mockRejectedValueOnce(new LlmUnavailableError("gone"));

    const result = await generate(req(PROMPT));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.isFallback).toBe(true);
      expect(validate(result.stack).valid).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Property test

describe("stackGenerator.generate — property tests", () => {
  /**
   * Property 1:
   *   For any string the LLM might return (arbitrary string or arbitrary JSON),
   *   generate() never throws — it always resolves to either a valid GenerateSuccess
   *   or a plain-language GenerateError.
   *
   * Property 2:
   *   The STACKYARD_LLM_API_KEY value never appears in the result.
   */

  const FAKE_KEY = "sk-prop-test-secret-key-9876";

  // Arbitraries:
  //   - any string (may not be JSON at all)
  //   - any JSON-serialisable value (may not match the Stack schema)
  const anyStringArb = fc.string();
  const anyJsonArb = fc.json();

  it("generate() never throws for any arbitrary LLM output string", async () => {
    process.env["STACKYARD_LLM_API_KEY"] = FAKE_KEY;

    await fc.assert(
      fc.asyncProperty(
        // Two arbitrary strings: first and second LLM responses
        anyStringArb,
        anyStringArb,
        async (first, second) => {
          callMock
            .mockResolvedValueOnce(first)
            .mockResolvedValueOnce(second);

          // Must not throw
          const result = await generate(req("a quiz about rivers"));

          // Must return one of the two valid shapes
          if (result.ok) {
            // GenerateSuccess: stack must be valid
            const vr = validate(result.stack);
            expect(vr.valid).toBe(true);
          } else {
            // GenerateError: must have a plain-language message
            expect(typeof result.message).toBe("string");
            expect(result.message.trim().length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 200 }
    );

    delete process.env["STACKYARD_LLM_API_KEY"];
  });

  it("generate() never throws for any arbitrary JSON value as LLM output", async () => {
    process.env["STACKYARD_LLM_API_KEY"] = FAKE_KEY;

    await fc.assert(
      fc.asyncProperty(anyJsonArb, anyJsonArb, async (first, second) => {
        callMock
          .mockResolvedValueOnce(first)
          .mockResolvedValueOnce(second);

        const result = await generate(req("a quiz about space"));

        if (result.ok) {
          expect(validate(result.stack).valid).toBe(true);
        } else {
          expect(typeof result.message).toBe("string");
        }
      }),
      { numRuns: 200 }
    );

    delete process.env["STACKYARD_LLM_API_KEY"];
  });

  it("API key never appears in the result for any LLM output", async () => {
    process.env["STACKYARD_LLM_API_KEY"] = FAKE_KEY;

    await fc.assert(
      fc.asyncProperty(anyStringArb, anyStringArb, async (first, second) => {
        callMock
          .mockResolvedValueOnce(first)
          .mockResolvedValueOnce(second);

        const result = await generate(req("a quiz about history"));

        // Serialise the whole result and check the key is absent
        const serialised = JSON.stringify(result);
        expect(serialised).not.toContain(FAKE_KEY);
      }),
      { numRuns: 200 }
    );

    delete process.env["STACKYARD_LLM_API_KEY"];
  });

  it("generate() with LlmUnavailableError always returns a valid fallback for any prompt", async () => {
    process.env["STACKYARD_LLM_API_KEY"] = FAKE_KEY;

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 500 }),
        async (prompt) => {
          callMock.mockRejectedValue(
            new LlmUnavailableError("unavailable")
          );

          const result = await generate(req(prompt));

          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.isFallback).toBe(true);
            expect(validate(result.stack).valid).toBe(true);
          }
        }
      ),
      { numRuns: 200 }
    );

    delete process.env["STACKYARD_LLM_API_KEY"];
  });
});
