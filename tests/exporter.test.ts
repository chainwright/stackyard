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

// ---------------------------------------------------------------------------
// Helpers for the security / correctness tests below.

/** A tiny 1×1 transparent PNG as a data URI — a legitimate inlined image. */
const PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

/** Extract and JSON.parse the #stack-data block from an exported HTML string. */
function extractStackData(html: string): Stack {
  const match = html.match(
    /<script id="stack-data"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!match) throw new Error("no #stack-data block found in HTML");
  return JSON.parse(match[1]!) as Stack;
}

/** A valid stack whose quiz card also carries one image element (data URI). */
function validStackWithImage(): Stack {
  const stack = validStack();
  stack.cards[0]!.elements.push({
    type: "image",
    id: "80000000-0000-4000-8000-000000000008",
    x: 40,
    y: 300,
    w: 200,
    h: 200,
    src: PNG_DATA_URI,
    alt: "A longship",
  });
  return stack;
}

// ---------------------------------------------------------------------------
// TASK-14 — No external URLs in the exported file.

describe("exportStack — no external URLs (TASK-14)", () => {
  it("produces HTML containing no http:// or https:// URLs", async () => {
    const html = await exportStack(validStackWithImage());
    expect(html).not.toMatch(/https?:\/\//);
  });
});

// ---------------------------------------------------------------------------
// TASK-15 — No API key leaks into the exported file.

describe("exportStack — no API key in output (TASK-15)", () => {
  it("never embeds the LLM API key, even when STACKYARD_LLM_API_KEY is set", async () => {
    const SENTINEL = "sk-test-sentinel-value-do-not-use";
    const previous = process.env.STACKYARD_LLM_API_KEY;
    process.env.STACKYARD_LLM_API_KEY = SENTINEL;
    try {
      const html = await exportStack(validStack());
      expect(html).not.toContain(SENTINEL);
    } finally {
      // Restore the environment so the test leaves no side effect.
      if (previous === undefined) {
        delete process.env.STACKYARD_LLM_API_KEY;
      } else {
        process.env.STACKYARD_LLM_API_KEY = previous;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// TASK-15b — URL escaping round-trip.
//
// A card text value containing a URL must not appear as a raw `https://`
// (or `http://`) in the HTML, because the serialiser escapes `/` to `\u002f`.
// After JSON.parse, the value must be restored byte-for-byte.

describe("exportStack — URL escaping round-trip (TASK-15b)", () => {
  for (const scheme of ["https://", "http://"] as const) {
    it(`escapes "${scheme}" in card text but round-trips it exactly`, async () => {
      const original = `Visit ${scheme}example.com for more.`;
      const stack = validStack();
      // Replace the quiz question text with a URL-bearing string.
      const text = stack.cards[0]!.elements[0]!;
      if (text.type !== "text") throw new Error("expected a text element");
      text.content = original;

      const html = await exportStack(stack);

      // 1. No raw URL scheme survives in the HTML.
      expect(html).not.toContain(scheme);

      // 2. The JSON round-trip restores the exact original value.
      const parsed = extractStackData(html);
      const parsedText = parsed.cards[0]!.elements[0]!;
      if (parsedText.type !== "text") throw new Error("expected a text element");
      expect(parsedText.content).toBe(original);
    });
  }
});
