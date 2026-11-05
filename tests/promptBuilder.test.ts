// tests/promptBuilder.test.ts
// Unit tests for server/promptBuilder.ts

import { describe, it, expect } from "vitest";
import { build, buildRetry, buildStream } from "../server/promptBuilder.js";
import type { GenerateRequest } from "../src/shared/types.js";

const req: GenerateRequest = { prompt: "a five-card quiz about the Vikings in Ireland" };

describe("promptBuilder.build", () => {
  it("returns both system and user strings", () => {
    const { system, user } = build(req);
    expect(typeof system).toBe("string");
    expect(typeof user).toBe("string");
    expect(system.length).toBeGreaterThan(0);
    expect(user.length).toBeGreaterThan(0);
  });

  it("system prompt contains all seven invariant rules", () => {
    const { system } = build(req);
    expect(system).toContain("Unique IDs");
    expect(system).toContain("Valid goto targets");
    expect(system).toContain("Exactly one end card");
    expect(system).toContain("Quiz answer rule");
    expect(system).toContain("Canvas bounds");
    expect(system).toContain("Non-empty title");
    expect(system).toContain("At least one non-end card");
  });

  it("system prompt contains audience rules", () => {
    const { system } = build(req);
    expect(system).toContain("Irish/UK English");
    expect(system).toContain("pupils");
    expect(system).toContain("Active voice");
    expect(system).toContain("Short sentences");
    // age-appropriate is expressed as "year group" + "4th class" in the prompt
    expect(system).toContain("4th class");
  });

  it("system prompt tells the model to give each story choice its own card", () => {
    const { system } = build(req);
    expect(system).toContain("Story cards");
    expect(system).toContain("DIFFERENT card");
    expect(system).toMatch(/Never\s+point two choices at the same card/);
  });

  it("user message contains the prompt text", () => {
    const { user } = build(req);
    expect(user).toContain(req.prompt);
  });

  it("clamps card count over 20 and adds a note", () => {
    const big: GenerateRequest = { prompt: "a 30-card quiz about space" };
    const { user } = build(big);
    expect(user).toContain("cap the stack at 20 cards maximum");
  });

  it("does not add a clamp note when card count is within limit", () => {
    const small: GenerateRequest = { prompt: "a 10-card quiz about space" };
    const { user } = build(small);
    expect(user).not.toContain("cap the stack");
  });

  it("system prompt is identical across repeated calls (constant)", () => {
    const { system: s1 } = build(req);
    const { system: s2 } = build({ prompt: "something else entirely" });
    expect(s1).toBe(s2);
  });
});

describe("promptBuilder.buildRetry", () => {
  it("retry user message contains all supplied error strings", () => {
    const errors = ["duplicate-id", "canvas-bounds", "quiz-answer"];
    const { user } = buildRetry(req, errors);
    for (const err of errors) {
      expect(user).toContain(err);
    }
  });

  it("retry user message contains the original prompt", () => {
    const { user } = buildRetry(req, ["end-card-count"]);
    expect(user).toContain(req.prompt);
  });

  it("retry system prompt is the same constant system prompt", () => {
    const { system: base } = build(req);
    const { system: retry } = buildRetry(req, ["blank-title"]);
    expect(retry).toBe(base);
  });

  it("retry user message mentions validation errors context", () => {
    const { user } = buildRetry(req, ["no-content-cards"]);
    expect(user).toContain("validation errors");
  });

  it("handles an empty error list gracefully", () => {
    const { user } = buildRetry(req, []);
    expect(user).toContain(req.prompt);
  });
});

describe("promptBuilder.buildStream (JSON Lines path)", () => {
  it("instructs the model to output JSON Lines, one object per line", () => {
    const { system } = buildStream(req);
    expect(system).toContain("JSON Lines");
    expect(system).toContain("one JSON object per line");
  });

  it("describes the stack header line and the per-card line framing", () => {
    const { system } = buildStream(req);
    expect(system).toContain('"kind":"stack"');
    expect(system).toContain('"kind":"card"');
  });

  it("still carries all seven invariants and the audience rules", () => {
    const { system } = buildStream(req);
    expect(system).toContain("Unique IDs");
    expect(system).toContain("Exactly one end card");
    expect(system).toContain("Quiz answer rule");
    expect(system).toContain("Irish/UK English");
    expect(system).toContain("pupils");
    expect(system).toContain("4th class");
  });

  it("carries the story-branch rule (each choice its own card)", () => {
    const { system } = buildStream(req);
    expect(system).toContain("Story cards");
    expect(system).toContain("DIFFERENT card");
    expect(system).toMatch(/Never\s+point two choices at the same card/);
  });

  it("reuses the same user message (prompt + card-count clamp) as build()", () => {
    expect(buildStream(req).user).toBe(build(req).user);
    const big: GenerateRequest = { prompt: "a 30-card quiz about space" };
    expect(buildStream(big).user).toContain("cap the stack at 20 cards maximum");
  });

  it("uses a different system prompt from the single-object build()", () => {
    expect(buildStream(req).system).not.toBe(build(req).system);
  });
});
