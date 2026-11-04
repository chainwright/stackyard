// tests/exporter.test.ts
// Unit tests for server/exporter.ts — the export pipeline.
//
// Covers (per TASK-13 "Done when"):
//   - Throws ExportValidationError for at least three invariant failures, each
//     carrying the expected error code.
//   - Returns a non-empty string for a valid stack.
//   - The returned string contains `<!doctype html>`.

import { describe, it, expect } from "vitest";

import { exportStack, ExportValidationError } from "../server/exporter.js";
import type { Stack } from "../src/shared/types.js";

// ---------------------------------------------------------------------------
// Fixtures — all IDs are valid RFC 4122 v4 UUIDs.

const ID = {
  stack: "10000000-0000-4000-8000-000000000001",
  quiz: "20000000-0000-4000-8000-000000000002",
  end: "30000000-0000-4000-8000-000000000003",
  qText: "40000000-0000-4000-8000-000000000004",
  btnRight: "50000000-0000-4000-8000-000000000005",
  btnWrong: "60000000-0000-4000-8000-000000000006",
  endText: "70000000-0000-4000-8000-000000000007",
} as const;

/** A minimal valid stack: one quiz card + one end card. */
function validStack(): Stack {
  return {
    id: ID.stack,
    title: "Vikings Quiz",
    theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" },
    cards: [
      {
        id: ID.quiz,
        kind: "quiz",
        elements: [
          {
            type: "text",
            id: ID.qText,
            x: 40,
            y: 40,
            w: 720,
            h: 120,
            content: "Where did the Vikings build a town in 841?",
          },
          {
            type: "button",
            id: ID.btnRight,
            x: 40,
            y: 200,
            w: 340,
            h: 80,
            label: "Dublin",
            actions: [
              { type: "score", delta: 1 },
              { type: "sound", sound: "cheer" },
              { type: "goto", cardId: ID.end },
            ],
          },
          {
            type: "button",
            id: ID.btnWrong,
            x: 420,
            y: 200,
            w: 340,
            h: 80,
            label: "Cork",
            actions: [
              { type: "score", delta: 0 },
              { type: "sound", sound: "buzz" },
              { type: "goto", cardId: ID.end },
            ],
          },
        ],
        actions: [],
      },
      {
        id: ID.end,
        kind: "end",
        elements: [
          {
            type: "field",
            id: ID.endText,
            x: 40,
            y: 40,
            w: 720,
            h: 80,
            variable: "score",
          },
        ],
        actions: [],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Validation failures

describe("exportStack — validation failures", () => {
  it('throws ExportValidationError with "end-card-count" when there is no end card', async () => {
    const stack = validStack();
    // Turn the end card into a story card → zero end cards.
    stack.cards[1]!.kind = "story";

    await expect(exportStack(stack)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ExportValidationError &&
        err.errors.includes("end-card-count"),
    );
  });

  it('throws ExportValidationError with "invalid-goto" for a card-level goto to a missing card', async () => {
    const stack = validStack();
    stack.cards[0]!.actions = [
      { type: "goto", cardId: "99999999-0000-4000-8000-000000000099" },
    ];

    await expect(exportStack(stack)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ExportValidationError &&
        err.errors.includes("invalid-goto"),
    );
  });

  it('throws ExportValidationError with "duplicate-id" when two cards share an id', async () => {
    const stack = validStack();
    stack.cards[1]!.id = stack.cards[0]!.id;

    await expect(exportStack(stack)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ExportValidationError &&
        err.errors.includes("duplicate-id"),
    );
  });

  it("throws ExportValidationError (not a plain Error) for validation failures", async () => {
    const stack = validStack();
    stack.title = "   "; // blank title

    await expect(exportStack(stack)).rejects.toBeInstanceOf(
      ExportValidationError,
    );
  });
});

// ---------------------------------------------------------------------------
// Successful export

describe("exportStack — valid stack", () => {
  it("returns a non-empty string", async () => {
    const html = await exportStack(validStack());
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(0);
  });

  it("returns a document starting with the HTML5 doctype", async () => {
    const html = await exportStack(validStack());
    expect(html).toContain("<!doctype html>");
  });

  it("embeds the stack title and an inert #stack-data block", async () => {
    const html = await exportStack(validStack());
    expect(html).toContain("<title>Vikings Quiz</title>");
    expect(html).toContain('id="stack-data"');
    expect(html).toContain('type="application/json"');
  });

  it("escapes <, > and / in the embedded JSON (no raw </script> or bare slash)", async () => {
    const html = await exportStack(validStack());
    // Extract the stack-data block content.
    const match = html.match(
      /<script id="stack-data"[^>]*>([\s\S]*?)<\/script>/,
    );
    expect(match).not.toBeNull();
    const json = match![1]!;
    // The JSON blob must not contain raw <, > or / (all escaped to \uXXXX).
    expect(json).not.toMatch(/[<>/]/);
    // And it must still parse back to the original stack.
    const parsed = JSON.parse(json) as Stack;
    expect(parsed.id).toBe(ID.stack);
    expect(parsed.title).toBe("Vikings Quiz");
  });
});
