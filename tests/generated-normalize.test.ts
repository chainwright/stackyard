// tests/generated-normalize.test.ts
// TASK-26 b, c, d, j: what the generator does to the model's output before the
// teacher sees it. Every case here is a bug the round-2 panel hit on the LIVE app
// with real generation; the exact malformed shapes are reproduced.

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  sanitizeRawStack,
  sanitizeRawCard,
  normalizeGeneratedCard,
  finaliseGeneratedStack,
  splitTermAndExplanation,
  sentenceCaseLabel,
  stripQuestionPrefix,
} from "../server/normalizeGenerated.js";
import { exportStack, exportLivingStack } from "../server/exporter.js";
import { validate } from "../src/shared/validator.js";
import { cardHasForward, forwardStep, gotoOf } from "../src/shared/flow.js";
import { checkReachability } from "../src/shared/reachability.js";
import { TOP_BAND } from "../src/shared/layout.js";
import type { Stack, Card, Element, Action } from "../src/shared/types.js";

// ---------------------------------------------------------------------------
// Fixtures — ids are valid v4 UUIDs

let counter = 0;
function id(): string {
  counter += 1;
  return `abcdef01-0000-4000-8000-${counter.toString(16).padStart(12, "0")}`;
}

function text(content: string, over: Partial<{ x: number; y: number; w: number; h: number }> = {}): Element {
  return { type: "text", id: id(), x: 48, y: 40, w: 704, h: 120, content, ...over };
}
function button(label: string, actions: Action[]): Element {
  return { type: "button", id: id(), x: 0, y: 200, w: 300, h: 70, label, actions };
}
function stackOf(cards: Card[]): Stack {
  return {
    id: id(),
    title: "Model deck",
    theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" },
    cards,
  };
}
function endCard(): Card {
  return {
    id: id(),
    kind: "end",
    elements: [{ type: "field", id: id(), x: 48, y: 420, w: 704, h: 60, variable: "score" }],
    actions: [],
  };
}
function quiz(question: string, answers: string[], rightIdx = 0): Card {
  return {
    id: id(),
    kind: "quiz",
    elements: [
      text(question),
      ...answers.map((a, i) =>
        button(a, [{ type: "score", delta: i === rightIdx ? 1 : 0 }]),
      ),
    ],
    actions: [],
  };
}

/** Rectangles of the cards' core elements overlap? */
function overlaps(a: Element, b: Element): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ---------------------------------------------------------------------------
// (b) flash cards

describe("TASK-26b: a generated flash card is never a dead end", () => {
  it("splits 'Term: explanation' into a front and a back and keeps one Next that goes on", () => {
    // The exact shape the live model returned: ONE text, plus a Next button.
    const flash: Card = {
      id: id(),
      kind: "flash",
      elements: [
        text("Evaporation: when the sun heats water and it rises as invisible vapour."),
        button("Next Card", []),
      ],
      actions: [],
    };
    const stack = stackOf([flash, quiz("Q?", ["a", "b"]), endCard()]);
    const out = finaliseGeneratedStack(stack);
    const f = out.cards[0]!;
    expect(f.kind).toBe("flash");
    const texts = f.elements.filter((e) => e.type === "text");
    expect(texts).toHaveLength(2);
    expect(texts[0]!.type === "text" && texts[0]!.content).toBe("Evaporation");
    expect(texts[1]!.type === "text" && texts[1]!.content).toContain("heats water");
    const next = f.elements.filter((e) => e.type === "button");
    expect(next).toHaveLength(1);
    expect(next[0]!.type === "button" && gotoOf(next[0]!.actions)).toBe(out.cards[1]!.id);
    expect(validate(out).valid).toBe(true);
  });

  it("reads 'X is when …' as a term X with the sentence as its explanation", () => {
    expect(splitTermAndExplanation("Condensation is when water vapour cools into droplets.")).toEqual({
      term: "Condensation",
      back: "Condensation is when water vapour cools into droplets.",
    });
  });

  it("splits on a newline or a dash separator", () => {
    expect(splitTermAndExplanation("Dia duit\nHello")).toEqual({ term: "Dia duit", back: "Hello" });
    expect(splitTermAndExplanation("an chistin – the kitchen")).toEqual({ term: "an chistin", back: "the kitchen" });
  });

  it("converts a bare paragraph with no clean term into a story card with Continue", () => {
    const para = "Water rises as vapour, cools into clouds, then falls again as rain over the hills";
    expect(splitTermAndExplanation(para)).toBeNull();
    const flash: Card = { id: id(), kind: "flash", elements: [text(para), button("Next Card", [])], actions: [] };
    const out = finaliseGeneratedStack(stackOf([flash, endCard()]));
    expect(out.cards[0]!.kind).toBe("story");
    expect(cardHasForward(out.cards[0]!)).toBe(true);
    expect(out.cards[0]!.elements.some((e) => e.type === "text" && e.content === para)).toBe(true);
    expect(validate(out).valid).toBe(true);
  });

  it("gives a flash card with NO button a Next Card that goes on", () => {
    const flash: Card = { id: id(), kind: "flash", elements: [text("Term"), text("Explanation")], actions: [] };
    const out = finaliseGeneratedStack(stackOf([flash, quiz("Q?", ["a", "b"]), endCard()]));
    expect(cardHasForward(out.cards[0]!)).toBe(true);
    expect(forwardStep(out, 0)).toBe(out.cards[1]!.id);
  });

  it("a flash card with no text at all still becomes playable", () => {
    const flash: Card = { id: id(), kind: "flash", elements: [], actions: [] };
    const out = finaliseGeneratedStack(stackOf([flash, endCard()]));
    expect(cardHasForward(out.cards[0]!)).toBe(true);
    expect(validate(out).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (c) layout

describe("TASK-26c: the template decides where things go, not the model", () => {
  it("moves a question the model put at y=40 below the reserved top band", () => {
    const out = finaliseGeneratedStack(stackOf([quiz("Where?", ["A", "B", "C", "D"]), endCard()]));
    const q = out.cards[0]!.elements.find((e) => e.type === "text")!;
    expect(q.y).toBeGreaterThanOrEqual(104);
    for (const e of out.cards[0]!.elements) expect(e.y).toBeGreaterThanOrEqual(TOP_BAND);
  });

  it("long questions and long answers never overlap each other or the top band", () => {
    const longQ = "Long ago, around the year 795, a people from the far north first sailed to Ireland. ".repeat(3);
    const longA = "They put it in the freezer overnight until it sets hard";
    const out = finaliseGeneratedStack(
      stackOf([quiz(longQ, [longA, longA + " 2", longA + " 3", longA + " 4"]), endCard()]),
    );
    const els = out.cards[0]!.elements;
    for (let i = 0; i < els.length; i++) {
      for (let j = i + 1; j < els.length; j++) {
        expect(overlaps(els[i]!, els[j]!), `${els[i]!.type}#${i} vs ${els[j]!.type}#${j}`).toBe(false);
      }
    }
    const q = els.find((e) => e.type === "text")!;
    expect(q.type === "text" && q.content.length).toBeLessThanOrEqual(240);
  });

  it("keeps the 2×2 tile grid for up to four answers and the right one among them", () => {
    const six = quiz("Q?", ["a", "b", "c", "d", "e", "f"], 5); // right answer is the 6th
    const out = finaliseGeneratedStack(stackOf([six, endCard()]));
    const tiles = out.cards[0]!.elements.filter((e) => e.type === "button");
    expect(tiles).toHaveLength(4);
    expect(
      tiles.filter((t) => t.type === "button" && t.actions.some((a) => a.type === "score" && a.delta === 1)),
    ).toHaveLength(1);
    expect(validate(out).valid).toBe(true);
  });

  it("stacks story choices below the story text without overlap", () => {
    const story: Card = {
      id: id(),
      kind: "story",
      elements: [
        text("You reach the harbour. What do you do? ".repeat(4)),
        button("Go to the harbour", []),
        button("Go to the house", []),
        button("Stay on the ship", []),
      ],
      actions: [],
    };
    const out = finaliseGeneratedStack(stackOf([story, endCard()]));
    const els = out.cards[0]!.elements;
    for (let i = 0; i < els.length; i++) {
      for (let j = i + 1; j < els.length; j++) expect(overlaps(els[i]!, els[j]!)).toBe(false);
    }
    for (const e of els) expect(e.y + e.h).toBeLessThanOrEqual(600);
  });

  it("drops a model-written 'Question 3 of 6' header text instead of printing it twice", () => {
    const c = quiz("Real question?", ["a", "b"]);
    c.elements.unshift(text("Question 3 of 6"));
    const out = normalizeGeneratedCard(c);
    const texts = out.elements.filter((e) => e.type === "text");
    expect(texts).toHaveLength(1);
    expect(texts[0]!.type === "text" && texts[0]!.content).toBe("Real question?");
  });
});

// ---------------------------------------------------------------------------
// (d) pictures

describe("TASK-26d: invented pictures never reach the editor or the export", () => {
  const withImage = (src: string): Card => {
    const c = quiz("Q?", ["a", "b"]);
    c.elements.push({ type: "image", id: id(), x: 10, y: 10, w: 100, h: 100, src, alt: "x" });
    return c;
  };

  it("sanitizeRawCard strips a relative-path picture and keeps an embedded one", () => {
    const raw = JSON.parse(JSON.stringify(withImage("images/cheval.png")));
    const cleaned = sanitizeRawCard(raw) as Card;
    expect(cleaned.elements.some((e) => e.type === "image")).toBe(false);

    const kept = sanitizeRawCard(JSON.parse(JSON.stringify(withImage("data:image/png;base64,AAAA")))) as Card;
    expect(kept.elements.some((e) => e.type === "image")).toBe(true);
  });

  it("strips https pictures too — only data: URIs can be exported", () => {
    const cleaned = sanitizeRawCard(JSON.parse(JSON.stringify(withImage("https://example.com/a.png")))) as Card;
    expect(cleaned.elements.some((e) => e.type === "image")).toBe(false);
  });

  it("a deck full of invented pictures exports (class and living) after sanitising", async () => {
    const raw = JSON.parse(
      JSON.stringify(stackOf([withImage("images/cheval.png"), withImage("images/canard.png"), endCard()])),
    );
    const v = validate(sanitizeRawStack(raw));
    expect(v.valid).toBe(true);
    if (!v.valid) return;
    const out = finaliseGeneratedStack(v.stack);
    await expect(exportStack(out)).resolves.toContain("<!doctype html>");
    await expect(exportLivingStack(out)).resolves.toContain("<!doctype html>");
  });

  it("without the sanitiser those same decks DO fail to export (the live 422)", async () => {
    const raw = JSON.parse(JSON.stringify(stackOf([withImage("images/cheval.png"), endCard()])));
    const v = validate(raw);
    expect(v.valid).toBe(true); // the validator passes it…
    if (!v.valid) return;
    await expect(exportStack(v.stack)).rejects.toThrow(); // …and export refuses it
  });

  it("clamps out-of-bounds coordinates BEFORE validation so no retry is burned", () => {
    const c = quiz("Q?", ["a", "b"]);
    const q = c.elements[0]!;
    q.x = 900; q.y = 590; q.w = 700; q.h = 400;
    const raw = JSON.parse(JSON.stringify(stackOf([c, endCard()])));
    expect(validate(raw).valid).toBe(false); // the model's own numbers are invalid
    expect(validate(sanitizeRawStack(raw)).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (j) text style

describe("TASK-26j: sentence-case answers, no 'Question N:' prefixes", () => {
  it("converts unmistakable Title Case to sentence case", () => {
    expect(sentenceCaseLabel("Along Edges Of Tectonic Plates")).toBe("Along edges of tectonic plates");
    expect(sentenceCaseLabel("It Turns Into Wood")).toBe("It turns into wood");
    expect(sentenceCaseLabel("They Fan It With Their Wings")).toBe("They fan it with their wings");
    expect(sentenceCaseLabel("Rainbows In The Sky")).toBe("Rainbows in the sky");
  });

  it("leaves names, short labels, acronyms and already-sentence-case labels alone", () => {
    expect(sentenceCaseLabel("Mount Vesuvius")).toBe("Mount Vesuvius");
    expect(sentenceCaseLabel("Brian Boru")).toBe("Brian Boru");
    expect(sentenceCaseLabel("Dublin")).toBe("Dublin");
    expect(sentenceCaseLabel("Along the edges of plates")).toBe("Along the edges of plates");
    expect(sentenceCaseLabel("King Brian Boru")).toBe("King Brian Boru"); // no small word capitalised
  });

  it("keeps acronyms and 'I' when converting", () => {
    expect(sentenceCaseLabel("How DNA Is Copied")).toBe("How DNA is copied");
  });

  it("strips 'Question 3:', 'Q3.' and 'Card 4 of 8 –' but never empties the text", () => {
    expect(stripQuestionPrefix("Question 3: What is a delta?")).toBe("What is a delta?");
    expect(stripQuestionPrefix("Q3. What is a delta?")).toBe("What is a delta?");
    expect(stripQuestionPrefix("Card 4 of 8 – What is a delta?")).toBe("What is a delta?");
    expect(stripQuestionPrefix("What is question 3?")).toBe("What is question 3?");
    expect(stripQuestionPrefix("Question 3:")).toBe("Question 3:");
  });

  it("applies both rules to a whole generated quiz card", () => {
    const out = finaliseGeneratedStack(
      stackOf([quiz("Question 1: Why do volcanoes erupt?", ["Along Edges Of Tectonic Plates", "Because Of The Moon"]), endCard()]),
    );
    const c = out.cards[0]!;
    const q = c.elements.find((e) => e.type === "text");
    expect(q && q.type === "text" && q.content).toBe("Why do volcanoes erupt?");
    const labels = c.elements.filter((e) => e.type === "button").map((e) => (e.type === "button" ? e.label : ""));
    expect(labels.sort()).toEqual(["Along edges of tectonic plates", "Because of the moon"].sort());
  });
});

// ---------------------------------------------------------------------------
// Property: whatever the model returns, the finished deck is valid, playable and exports

const KINDS = ["quiz", "flash", "story"] as const;

interface CardSpec {
  kind: (typeof KINDS)[number];
  texts: string[];
  buttons: number;
  forwardGoto: boolean;
  x: number; y: number; w: number; h: number;
  relImage: boolean;
  right: number;
}

const cardSpecArb: fc.Arbitrary<CardSpec> = fc.record({
  kind: fc.constantFrom(...KINDS),
  texts: fc.array(
    fc.oneof(
      fc.string({ minLength: 0, maxLength: 120 }),
      fc.constant("Question 2: Why do things fall?"),
      fc.constant("Evaporation: water turning to vapour"),
      fc.constant("</script><script>alert(1)</script>"),
    ),
    { minLength: 0, maxLength: 3 },
  ),
  buttons: fc.integer({ min: 0, max: 6 }),
  forwardGoto: fc.boolean(),
  x: fc.integer({ min: -50, max: 900 }),
  y: fc.integer({ min: -50, max: 700 }),
  w: fc.integer({ min: 1, max: 900 }),
  h: fc.integer({ min: 1, max: 700 }),
  relImage: fc.boolean(),
  right: fc.nat(),
});

/** Build a raw, model-like deck (possibly out of bounds, with invented pictures). */
function rawDeck(specs: CardSpec[]): unknown {
  const end = endCard();
  const cards: Card[] = specs.map((s) => ({
    id: id(),
    kind: s.kind,
    elements: [],
    actions: [],
  }));
  const all = [...cards, end];
  specs.forEach((s, i) => {
    const card = cards[i]!;
    const nButtons = s.kind === "quiz" ? Math.max(2, s.buttons) : s.buttons;
    const els: Element[] = s.texts.map((t) => ({
      type: "text", id: id(), x: s.x, y: s.y, w: s.w, h: s.h, content: t,
    }));
    for (let b = 0; b < nButtons; b++) {
      const actions: Action[] = [];
      if (s.kind === "quiz") actions.push({ type: "score", delta: b === s.right % nButtons ? 1 : 0 });
      // Forward-only gotos (a model's backward goto is a different bug).
      if (s.forwardGoto && s.kind !== "quiz") actions.push({ type: "goto", cardId: all[i + 1]!.id });
      els.push({ type: "button", id: id(), x: s.x, y: s.y, w: s.w, h: s.h, label: `Answer ${b} ${s.texts[0] ?? ""}`, actions });
    }
    if (s.relImage) {
      els.push({ type: "image", id: id(), x: s.x, y: s.y, w: s.w, h: s.h, src: "images/invented.png", alt: "x" });
    }
    card.elements = els;
  });
  return JSON.parse(JSON.stringify(stackOf(all)));
}

describe("property: any model output becomes a valid, playable, exportable deck", () => {
  it("validates, has a way forward on every card, walks to the end, and exports", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(cardSpecArb, { minLength: 1, maxLength: 6 }), async (specs) => {
        const v = validate(sanitizeRawStack(rawDeck(specs)));
        // Out-of-bounds boxes and invented pictures are fixed by sanitising, so
        // the sanitised model deck must be valid.
        expect(v.valid).toBe(true);
        if (!v.valid) return;

        const out = finaliseGeneratedStack(v.stack);
        expect(validate(out).valid).toBe(true);

        const ids = new Set(out.cards.map((c) => c.id));
        out.cards.forEach((card, i) => {
          if (card.kind === "end") return;
          // (b) every card can move forward, to a card that exists.
          expect(cardHasForward(card), `card ${i} (${card.kind})`).toBe(true);
          const step = forwardStep(out, i);
          expect(step !== null && ids.has(step), `card ${i} forward target`).toBe(true);
          // (c) nothing in the reserved top band.
          for (const e of card.elements) expect(e.y).toBeGreaterThanOrEqual(TOP_BAND);
          // (d) no un-exportable picture survives.
          for (const e of card.elements) {
            if (e.type === "image") expect(e.src.startsWith("data:")).toBe(true);
          }
        });

        // Walking forward from card 1 always reaches the end card.
        let at = 0;
        for (let steps = 0; steps <= out.cards.length; steps++) {
          if (out.cards[at]!.kind === "end") break;
          const next = forwardStep(out, at);
          expect(next).not.toBeNull();
          at = out.cards.findIndex((c) => c.id === next);
          expect(at).toBeGreaterThanOrEqual(0);
        }
        expect(out.cards[at]!.kind).toBe("end");

        // The "before you share" check finds nothing stuck.
        const report = checkReachability(out);
        expect(report.stuck).toHaveLength(0);
        expect(report.deadEndQuiz).toHaveLength(0);
        expect(report.deadEndOther).toHaveLength(0);

        // Every generated deck exports (the live 422 on invented pictures).
        const html = await exportStack(out);
        expect(html).toContain("<!doctype html>");
      }),
      { numRuns: 60 },
    );
  });
});
