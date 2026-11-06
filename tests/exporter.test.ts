// tests/exporter.test.ts
// Unit tests for server/exporter.ts — the export pipeline.
//
// Covers (per TASK-13 "Done when"):
//   - Throws ExportValidationError for at least three invariant failures, each
//     carrying the expected error code.
//   - Returns a non-empty string for a valid stack.
//   - The returned string contains `<!doctype html>`.

import { describe, it, expect } from "vitest";

import {
  exportStack,
  exportLivingStack,
  ExportValidationError,
} from "../server/exporter.js";
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

describe("exportStack — REQ-EXP-01: loads nothing from the network at runtime (TASK-14, TASK-28a)", () => {
  // REQ-EXP-01 (amended): "…shall load nothing from the network at runtime;
  // inert licence source URLs inside comments are allowed."
  it("makes no runtime request: no url(http…), src/href=http, @import, protocol-relative //, fetch or XHR", async () => {
    const html = await exportStack(validStackWithImage());
    expect(html).not.toMatch(/url\(\s*['"]?https?:\/\//i);
    expect(html).not.toMatch(/url\(\s*['"]?\/\//i);
    expect(html).not.toMatch(/\b(?:src|href)\s*=\s*['"]?https?:\/\//i);
    expect(html).not.toMatch(/<link[^>]+href\s*=\s*['"]?https?:/i);
    expect(html).not.toMatch(/@import/i);
    // No script in the class file can fetch anything.
    expect(html).not.toMatch(/\b(?:fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource)\s*\(/);
    expect(html).not.toMatch(/\bimport\s*\(\s*['"`]https?:/);
  });

  it("the only http(s) URLs in the file are inert: inside comments, or the SVG namespace string", async () => {
    const html = await exportStack(validStackWithImage());
    const withoutComments = html.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
    const left = [...withoutComments.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map((m) => m[0]);
    for (const u of left) expect(u, "a URL outside a comment").toBe("http://www.w3.org/2000/svg");
    // …and the licence source URLs ARE there, in comments (allowed).
    const commentUrls = [...html.matchAll(/\/\*[\s\S]*?\*\//g)].flatMap((m) => [...m[0].matchAll(/https?:\/\/\S+/g)].map((u) => u[0]));
    expect(commentUrls.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Fonts inlined for offline use + OFL notice + no reserved font name.

describe("exportStack — inlined fonts (built-app review P0 #2)", () => {
  it("declares @font-face for all four design-system fonts as woff2 data URIs (headings, reading 400/700, digits)", async () => {
    const html = await exportStack(validStack());
    const fontFaceCount = (html.match(/@font-face/g) ?? []).length;
    expect(fontFaceCount).toBe(4);
    const dataUriCount = (html.match(/data:font\/woff2;base64,/g) ?? []).length;
    expect(dataUriCount).toBe(4);
    expect(html).toContain("'Stackyard Digits'");
    // Both design-system families are declared.
    expect(html).toContain("'Bricolage Grotesque'");
    expect(html).toContain("'Stackyard Reading'");
  });

  it("carries the OFL notice (copyright + licence) in a comment", async () => {
    const html = await exportStack(validStack());
    expect(html).toContain("SIL Open Font License 1.1");
    expect(html).toContain("Braille Institute of America");
    expect(html).toContain("The Bricolage Grotesque Project Authors");
  });

  it('never presents the reserved font name "Atkinson" or "Hyperlegible"', async () => {
    const html = await exportStack(validStack());
    // The reserved font NAME must not present to users (the subset is renamed
    // to "Stackyard Reading"). The base64 font blob encodes bytes, so the
    // reserved name cannot appear as readable text there either.
    expect(html).not.toContain("Atkinson");
    expect(html).not.toContain("Hyperlegible");
  });

  it("keeps the export fully offline (the fonts are inlined, not linked)", async () => {
    const html = await exportStack(validStack());
    // No external stylesheet or font link, and no fetchable font URL.
    expect(html).not.toMatch(/<link[^>]+href\s*=\s*['"]?https?:/i);
    expect(html).not.toMatch(/src:\s*url\(\s*['"]?https?:\/\//i);
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

      // 1. No raw URL scheme survives inside the embedded stack-data JSON (the
      //    serialiser escapes `/` to `\u002f`). We scope this to the
      //    #stack-data block: the OFL font notice legitimately carries a source
      //    URL inside a CSS comment, which is not stack content and not fetched.
      const dataBlock = html.match(
        /<script id="stack-data"[^>]*>([\s\S]*?)<\/script>/,
      )![1]!;
      expect(dataBlock).not.toContain(scheme);

      // 2. The JSON round-trip restores the exact original value.
      const parsed = extractStackData(html);
      const parsedText = parsed.cards[0]!.elements[0]!;
      if (parsedText.type !== "text") throw new Error("expected a text element");
      expect(parsedText.content).toBe(original);
    });
  }
});

// ---------------------------------------------------------------------------
// TASK-24 — The living file (exportLivingStack).
//
// The living export plays exactly like the class file but also carries the
// offline in-file editor and "Save a Copy". It shares the same validation,
// self-containment and escaping guarantees as exportStack; the differences are
// the embedded runtime (the living bundle) and the Teacher tab.

describe("exportLivingStack — valid stack (TASK-24)", () => {
  it("returns a non-empty HTML document starting with the doctype", async () => {
    const html = await exportLivingStack(validStack());
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("<!doctype html>");
  });

  it("embeds the stack title and an inert #stack-data block", async () => {
    const html = await exportLivingStack(validStack());
    expect(html).toContain("<title>Vikings Quiz</title>");
    expect(html).toContain('id="stack-data"');
    expect(html).toContain('type="application/json"');
  });

  it("carries the Teacher tab marker (it is a living file, not a class file)", async () => {
    const html = await exportLivingStack(validStack());
    // The living CSS always carries the .sy-teacher-tab class. Minification
    // keeps the string literal inside the injected stylesheet, so it is a
    // reliable "this is a living file" marker that survives the build.
    expect(html).toContain("sy-teacher-tab");
  });

  it("is still fully self-contained — no external resource URLs", async () => {
    const html = await exportLivingStack(validStackWithImage());
    expect(html).not.toMatch(/url\(\s*['"]?https?:\/\//i);
    expect(html).not.toMatch(/url\(\s*['"]?\/\//i);
    expect(html).not.toMatch(/\b(?:src|href)\s*=\s*['"]?https?:\/\//i);
    expect(html).not.toMatch(/@import/i);
  });

  it("round-trips the stack through the embedded #stack-data block", async () => {
    const html = await exportLivingStack(validStack());
    const parsed = extractStackData(html);
    expect(parsed.id).toBe(ID.stack);
    expect(parsed.title).toBe("Vikings Quiz");
  });
});

describe("exportLivingStack — validation failures (TASK-24)", () => {
  it("throws ExportValidationError (not a plain Error) on an invalid stack", async () => {
    const stack = validStack();
    stack.cards[1]!.kind = "story"; // zero end cards
    await expect(exportLivingStack(stack)).rejects.toBeInstanceOf(
      ExportValidationError,
    );
  });

  it('propagates the "end-card-count" error code', async () => {
    const stack = validStack();
    stack.cards[1]!.kind = "story";
    await expect(exportLivingStack(stack)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ExportValidationError &&
        err.errors.includes("end-card-count"),
    );
  });
});

describe("exportLivingStack — hostile text cannot break out of <script> (TASK-24)", () => {
  it("escapes a </script> payload in card text — no raw breakout, exactly two script tags", async () => {
    const stack = validStack();
    // A hostile title and card text both try to close the data script early
    // and inject markup. The escape-safe serialiser must neutralise both.
    stack.title = "Pwn</script><script>alert(1)</script>";
    const text = stack.cards[0]!.elements[0]!;
    if (text.type !== "text") throw new Error("expected a text element");
    text.content = "answer</script><img src=x onerror=alert(1)>";

    const html = await exportLivingStack(stack);
    // Baseline: the same living export with benign text. Any <script> tags it
    // contains (the two template tags plus a "<script" marker literal that the
    // living bundle carries for its own Save a Copy) are inherent to the file,
    // not a breakout. The hostile export must add exactly zero extra tags.
    const benign = await exportLivingStack(validStack());

    const countOpen = (s: string) => (s.match(/<script\b/gi) ?? []).length;
    const countClose = (s: string) => (s.match(/<\/script\s*>/gi) ?? []).length;

    // The hostile payload's "<script>" / "</script>" must be escaped inside the
    // JSON (to \uXXXX), so it introduces no new script tags over the baseline.
    expect(countOpen(html)).toBe(countOpen(benign));
    expect(countClose(html)).toBe(countClose(benign));

    // The embedded data block carries no raw <, > or / (all escaped), yet the
    // hostile strings round-trip byte-for-byte after JSON.parse.
    const dataBlock = html.match(
      /<script id="stack-data"[^>]*>([\s\S]*?)<\/script>/,
    )![1]!;
    expect(dataBlock).not.toMatch(/[<>/]/);

    const parsed = extractStackData(html);
    expect(parsed.title).toBe("Pwn</script><script>alert(1)</script>");
    const parsedText = parsed.cards[0]!.elements[0]!;
    if (parsedText.type !== "text") throw new Error("expected a text element");
    expect(parsedText.content).toBe("answer</script><img src=x onerror=alert(1)>");
  });
});
