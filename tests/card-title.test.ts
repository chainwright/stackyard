// tests/card-title.test.ts
// TASK-25: the card title comes from the question/front/story — never from a
// caption or image credit — and image credits are truthful.

import { describe, it, expect } from "vitest";
import { cardTitle, primaryText, truncateLabel } from "../src/shared/cardTitle.js";
import { creditLine, creditFull, creditDomain } from "../src/shared/deckImageTypes.js";
import type { DeckImage } from "../src/shared/deckImageTypes.js";
import { READY_MADE_IMAGES, fullCreditFor } from "../src/shared/readyMadeImages.js";
import { vikingsStack } from "../src/shared/readyMadeStacks.js";
import { checkImageCredits } from "../scripts/check-decks.js";
import type { Card } from "../src/shared/types.js";

// ---------------------------------------------------------------------------
// (a) cardTitle / primaryText — never named after a caption or credit

const uuid = (() => {
  let n = 0;
  return () => {
    n += 1;
    return `aaaaaaaa-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
  };
})();

describe("TASK-25a: a card is named by its question, not a bottom caption/credit", () => {
  it("picks the TOP text (the question) even when a lower credit line is longer", () => {
    // The image credit along the bottom is longer than the question — the old
    // 'longest text wins' heuristic chose it. The title must still be the
    // question (the topmost text element).
    const question = "Which people began raiding Ireland around the year 795?";
    const credit =
      "Illustration: Stackyard, CC0 — a much much much longer caption line than the question above it";
    const card: Card = {
      id: uuid(),
      kind: "quiz",
      elements: [
        { type: "text", id: uuid(), x: 48, y: 104, w: 704, h: 128, content: question },
        { type: "text", id: uuid(), x: 48, y: 566, w: 704, h: 28, content: credit },
      ],
      actions: [],
    };
    expect(credit.length).toBeGreaterThan(question.length); // the trap
    expect(primaryText(card)).toBe(question);
    expect(cardTitle(card, Number.MAX_SAFE_INTEGER)).toBe(question);
  });

  it("is robust to element order (credit first in the array)", () => {
    const question = "What is a longship?";
    const card: Card = {
      id: uuid(),
      kind: "quiz",
      elements: [
        { type: "text", id: uuid(), x: 48, y: 566, w: 704, h: 28, content: "Image: Someone — CC0 — https://example.org" },
        { type: "text", id: uuid(), x: 48, y: 104, w: 704, h: 128, content: question },
      ],
      actions: [],
    };
    expect(primaryText(card)).toBe(question);
  });

  it("names a flash card by its FRONT (first text), not the longer back", () => {
    const card: Card = {
      id: uuid(),
      kind: "flash",
      elements: [
        { type: "text", id: uuid(), x: 48, y: 264, w: 704, h: 72, content: "Dia duit" },
        { type: "text", id: uuid(), x: 48, y: 360, w: 704, h: 120, content: "Hello (literally, God be with you)." },
      ],
      actions: [],
    };
    expect(cardTitle(card)).toBe("Dia duit");
  });

  it("falls back to a kind description when there is no content text", () => {
    const endCard: Card = {
      id: uuid(),
      kind: "end",
      elements: [{ type: "field", id: uuid(), x: 48, y: 420, w: 704, h: 60, variable: "score" }],
      actions: [],
    };
    expect(cardTitle(endCard)).toBe("Last card — the score");
  });

  it("truncates to the requested length with an ellipsis", () => {
    expect(truncateLabel("abcdefghij", 5)).toBe("abcd…");
    expect(truncateLabel("short", 40)).toBe("short");
  });

  it("names the real Vikings deck card 1 after the question, not its image credit", () => {
    // Regression for the 5 Nov live check: the Vikings deck's first card gained
    // an image credit, and the card list was named after the credit.
    const stack = vikingsStack();
    const first = stack.cards[0]!;
    // Sanity: the card really does carry an image-credit text element.
    const hasCredit = first.elements.some(
      (e) => e.type === "text" && /^(Image|Illustration):/.test(e.content),
    );
    expect(hasCredit).toBe(true);
    expect(cardTitle(first, Number.MAX_SAFE_INTEGER)).toBe(
      "Which people began raiding Ireland around the year 795?",
    );
  });
});

// ---------------------------------------------------------------------------
// (b) creditLine — truthful shapes; no source we didn't earn

describe("TASK-25b: image credits are truthful", () => {
  it('renders our own drawing as "Illustration: Creator, Licence" with no source', () => {
    const img: DeckImage = {
      dataUri: "data:image/svg+xml;base64,AA==",
      creditKind: "illustration",
      creditLicense: "CC0",
      creditCreator: "Stackyard",
    };
    expect(creditLine(img)).toBe("Illustration: Stackyard, CC0");
    expect(creditLine(img)).not.toContain("openverse");
    expect(creditLine(img)).not.toContain("http");
  });

  it('prints a found image on the card as "Image: Creator, Licence — domain" (no raw URL)', () => {
    const img: DeckImage = {
      dataUri: "data:image/jpeg;base64,AA==",
      creditKind: "image",
      creditLicense: "CC0",
      creditCreator: "A. Photographer",
      creditSource: "https://www.openverse.org/image/abc",
    };
    // TASK-26i: the raw URL used to run off the edge of the card.
    expect(creditLine(img)).toBe("Image: A. Photographer, CC0 — openverse.org");
    expect(creditLine(img)).not.toMatch(/https?:/);
    // The full credit, with the link, is what the inspector shows.
    expect(creditFull(img)).toBe(
      "Image: A. Photographer — CC0 — https://www.openverse.org/image/abc",
    );
    expect(creditDomain("https://www.flickr.com/photos/1/2")).toBe("flickr.com");
    expect(creditDomain("not a url")).toBe("");
  });

  it("every committed deck credit prints a domain, never a URL, and the full link is findable", () => {
    for (const [key, img] of Object.entries(READY_MADE_IMAGES)) {
      const line = creditLine(img);
      expect(line, key).not.toMatch(/https?:/);
      expect(line.length, key).toBeLessThan(70); // fits the 704px caption line
      expect(fullCreditFor(line), key).toBe(creditFull(img));
      expect(fullCreditFor(line)!, key).toContain("https://");
    }
    expect(fullCreditFor("some teacher's own caption")).toBeNull();
  });

  it("every ready-made image credit is truthful: our illustrations cite no source; found images cite a real one", () => {
    for (const [key, img] of Object.entries(READY_MADE_IMAGES)) {
      const line = creditLine(img);
      expect(["CC0", "PDM"], key).toContain(img.creditLicense);
      if (img.creditKind === "illustration") {
        // drawn for Stackyard: no third-party source, no Openverse claim
        expect(line, key).toMatch(/^Illustration: Stackyard, CC0$/);
        expect(img.creditSource, key).toBeUndefined();
      } else {
        // found via Openverse: a named creator and a real https source page
        expect(img.creditCreator, key).toBeTruthy();
        expect(img.creditSource ?? "", key).toMatch(/^https:\/\//);
        expect(line, key).toContain(img.creditCreator);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// (b) check-decks provenance rule: a credit naming Openverse needs a real URL

describe("TASK-25b: check-decks rejects an Openverse claim without a real URL", () => {
  it("passes the committed ready-made image credits", () => {
    expect(checkImageCredits(READY_MADE_IMAGES)).toEqual([]);
  });

  it("flags a credit that names Openverse but has no source URL", () => {
    const bad: Record<string, DeckImage> = {
      vikings: {
        dataUri: "data:image/svg+xml;base64,AA==",
        // The 5 Nov bug: our drawing, but the creator string names Openverse.
        creditKind: "image",
        creditLicense: "CC0",
        creditCreator: "openverse.org",
      },
    };
    const problems = checkImageCredits(bad);
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain("Openverse");
  });

  it("flags a credit that names Openverse with a non-Openverse URL", () => {
    const bad: Record<string, DeckImage> = {
      vikings: {
        dataUri: "data:image/jpeg;base64,AA==",
        creditKind: "image",
        creditLicense: "CC0",
        creditCreator: "A. Photographer, via Openverse",
        creditSource: "https://example.org/not-openverse",
      },
    };
    expect(checkImageCredits(bad).length).toBe(1);
  });

  it("accepts a credit that names Openverse WITH a real openverse.org URL", () => {
    const good: Record<string, DeckImage> = {
      vikings: {
        dataUri: "data:image/jpeg;base64,AA==",
        creditKind: "image",
        creditLicense: "CC0",
        creditCreator: "A. Photographer",
        creditSource: "https://openverse.org/image/abc123",
      },
    };
    expect(checkImageCredits(good)).toEqual([]);
  });
});

describe("TASK-26i: check-decks rejects a raw URL printed on the card", () => {
  it("flags an on-card credit that carries a URL (it would run off the paper)", () => {
    const bad: Record<string, DeckImage> = {
      vikings: {
        dataUri: "data:image/jpeg;base64,AA==",
        creditKind: "image",
        creditLicense: "PDM",
        creditCreator: "see https://www.flickr.com/photos/1/2",
        creditSource: "https://www.flickr.com/photos/1/2",
      },
    };
    const problems = checkImageCredits(bad);
    expect(problems.some((p) => p.includes("raw URL"))).toBe(true);
  });

  it("the committed credits pass (domain only)", () => {
    expect(checkImageCredits(READY_MADE_IMAGES)).toEqual([]);
  });
});
