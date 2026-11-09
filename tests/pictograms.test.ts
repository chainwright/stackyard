// tests/pictograms.test.ts
// TASK-31h: pictures on generated decks, by NAME from a set we own. No model
// bytes ever reach an image `src`; nothing in the set can run or fetch.

import { describe, it, expect, vi, afterEach } from "vitest";
import fc from "fast-check";
import {
  PICTOGRAM_NAMES,
  PICTOGRAM_CREDIT,
  PICTOGRAM_MAX_CHARS,
  pictogramSvg,
  pictogramDataUri,
  pictogramNameOfSrc,
  pictogramName,
  pictogramProblems,
} from "../src/shared/pictograms.js";
import { PICTURE_SLOT, PICTURE_CREDIT } from "../src/shared/layout.js";
import {
  sanitizeRawCard,
  sanitizeRawStack,
  normalizeGeneratedCard,
  finaliseGeneratedStack,
} from "../server/normalizeGenerated.js";
import { build, buildStream, buildRetry } from "../server/promptBuilder.js";
import { streamGenerate } from "../server/stream-generate.js";
import type { LineSink, StreamGenerateDeps } from "../server/stream-generate.js";
import { exportStack, exportLivingStack } from "../server/exporter.js";
import { validate, validateCard } from "../src/shared/validator.js";
import type { Card, GenerateStreamMessage, Stack, Element } from "../src/shared/types.js";

afterEach(() => vi.restoreAllMocks());

const KNOWN_URIS = new Set(PICTOGRAM_NAMES.map((n) => pictogramDataUri(n)));

describe("TASK-31h: the pictogram set is safe", () => {
  it("TASK-31h: about forty plain lower-case nouns, each one a small single-colour SVG", () => {
    expect(PICTOGRAM_NAMES.length).toBeGreaterThanOrEqual(40);
    expect(pictogramProblems()).toEqual([]);
    for (const n of ["sun", "cloud", "rain", "river", "ship", "sword", "castle", "book", "star", "heart"]) {
      expect(PICTOGRAM_NAMES).toContain(n);
    }
    for (const n of PICTOGRAM_NAMES) expect(pictogramSvg(n).length, n).toBeLessThanOrEqual(PICTOGRAM_MAX_CHARS);
  });

  it("TASK-31h: no SVG has a script, an on*= handler, an href, a foreignObject, text or an external URL", () => {
    for (const n of PICTOGRAM_NAMES) {
      const svg = pictogramSvg(n);
      const rest = svg.replace('xmlns="http://www.w3.org/2000/svg"', "");
      expect(rest, n).not.toMatch(/<script/i);
      expect(rest, n).not.toMatch(/\son[a-z]+\s*=/i);
      expect(rest, n).not.toMatch(/href/i);
      expect(rest, n).not.toMatch(/foreignObject/i);
      expect(rest, n).not.toMatch(/<text|<tspan|<style|<image|<use/i);
      expect(rest, n).not.toMatch(/https?:|\/\/|url\(|javascript:/i);
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"'), n).toBe(true);
    }
  });

  it("TASK-31h: the data URI decodes back to exactly that SVG, and only our URIs map back to a name", () => {
    for (const n of PICTOGRAM_NAMES) {
      const uri = pictogramDataUri(n);
      expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
      expect(decodeURIComponent(uri.slice("data:image/svg+xml,".length))).toBe(pictogramSvg(n));
      expect(pictogramNameOfSrc(uri)).toBe(n);
    }
    expect(pictogramNameOfSrc("data:image/svg+xml,<svg onload='x'/>")).toBeNull();
    expect(pictogramNameOfSrc("images/sun.png")).toBeNull();
    expect(pictogramNameOfSrc(42)).toBeNull();
  });

  it("TASK-31h: names are matched strictly (trimmed, lower-case), never against prototype keys", () => {
    expect(pictogramName(" Sun ")).toBe("sun");
    for (const bad of ["", "suns", "constructor", "__proto__", "toString", "hasOwnProperty", "sun;", 7, null, undefined, {}, ["sun"]]) {
      expect(pictogramName(bad), String(bad)).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------

let n = 0;
const id = (): string => `abcd0000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;
const text = (content: string): Element => ({ type: "text", id: id(), x: 40, y: 40, w: 720, h: 120, content });
const btn = (label: string, actions: Card["actions"]): Element => ({ type: "button", id: id(), x: 0, y: 200, w: 300, h: 70, label, actions });
const quizCard = (to: string, extra: unknown[] = []): Record<string, unknown> => ({
  id: "c1", kind: "quiz", actions: [],
  elements: [text("Which of these falls from a cloud?"), btn("Rain", [{ type: "score", delta: 1 }, { type: "goto", cardId: to }]), btn("Sand", [{ type: "score", delta: 0 }, { type: "goto", cardId: to }]), ...extra],
});
const picto = (name: unknown): Record<string, unknown> => ({ type: "image", picto: name });

const rect = (e: Element): { x: number; y: number; w: number; h: number } => ({ x: e.x, y: e.y, w: e.w, h: e.h });
const overlaps = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

describe("TASK-31h: no model-controlled byte reaches an image src", () => {
  it("TASK-31h: a known name becomes an image built from OUR set (the model's other fields are ignored)", () => {
    const out = sanitizeRawCard(quizCard("c2", [{ ...picto("Sun"), src: "data:image/svg+xml,<svg onload=alert(1)/>", alt: "<b>x</b>", x: 5, y: 5, w: 9999, h: 1 }])) as Card;
    const imgs = out.elements.filter((e) => e.type === "image");
    expect(imgs).toHaveLength(1);
    const img = imgs[0]!;
    expect(img.type === "image" && img.src).toBe(pictogramDataUri("sun"));
    expect(img.type === "image" && img.alt).toBe("Picture: sun");
    expect(rect(img)).toEqual(PICTURE_SLOT);
  });

  it("TASK-31h: an unknown name is dropped silently", () => {
    for (const bad of ["unicorn", "", "../../etc/passwd", "sun'><script>", 5, null, { a: 1 }, ["sun"]]) {
      const out = sanitizeRawCard(quizCard("c2", [picto(bad)])) as Card;
      expect(out.elements.some((e) => e.type === "image"), JSON.stringify(bad)).toBe(false);
    }
  });

  it("TASK-31h: every model-supplied picture is dropped — a data: URI, https, a path — unless it names a pictogram", () => {
    for (const src of ["data:image/png;base64,AAAA", "data:image/svg+xml,<svg/>", "https://example.com/a.png", "images/cheval.png"]) {
      const out = sanitizeRawCard(quizCard("c2", [{ type: "image", id: "i", x: 1, y: 1, w: 50, h: 50, src, alt: "x" }])) as Card;
      expect(out.elements.some((e) => e.type === "image"), src).toBe(false);
    }
  });

  it("TASK-31h: property — for ANY model values, an image that survives has a src from the known set", () => {
    const anything = fc.oneof(fc.string(), fc.constantFrom(...PICTOGRAM_NAMES), fc.constantFrom("constructor", "__proto__", " SUN "), fc.anything());
    fc.assert(
      fc.property(anything, anything, anything, (pictoValue, srcValue, altValue) => {
        const el = { type: "image", picto: pictoValue, src: srcValue, alt: altValue, id: "x" };
        const out = sanitizeRawCard(JSON.parse(JSON.stringify(quizCard("c2", [el])))) as Card;
        return out.elements.every((e) => e.type !== "image" || KNOWN_URIS.has(e.src));
      }),
      { numRuns: 500 },
    );
  });

  it("TASK-31h: at most one picture per card, and none on the end card", () => {
    const two = sanitizeRawCard(quizCard("c2", [picto("sun"), picto("moon"), picto("star")])) as Card;
    const imgs = two.elements.filter((e) => e.type === "image");
    expect(imgs).toHaveLength(1);
    expect(imgs[0]!.type === "image" && imgs[0]!.src).toBe(pictogramDataUri("sun"));
    const end = sanitizeRawCard({ id: "e", kind: "end", actions: [], elements: [text("Done"), picto("star")] }) as Card;
    expect(end.elements.some((e) => e.type === "image")).toBe(false);
  });

  it("TASK-31h: sanitising twice gives the same picture (idempotent)", () => {
    const once = sanitizeRawCard(quizCard("c2", [picto("sun")])) as Card;
    const twice = sanitizeRawCard(JSON.parse(JSON.stringify(once))) as Card;
    expect(twice.elements.filter((e) => e.type === "image").map((e) => (e.type === "image" ? e.src : ""))).toEqual([pictogramDataUri("sun")]);
  });
});

describe("TASK-31h: the template puts the picture and its credit where nothing else is", () => {
  const sanitised = (c: Record<string, unknown>): Card => {
    const v = validateCard(sanitizeRawCard(JSON.parse(JSON.stringify(c))));
    if (!v.valid) throw new Error("fixture invalid: " + v.errors.join(","));
    return v.card;
  };
  const kinds: Array<[string, Record<string, unknown>]> = [
    ["quiz", quizCard("c2", [picto("river")])],
    [
      "story",
      { id: "s", kind: "story", actions: [], elements: [text("You reach a fork. ".repeat(8)), btn("Left", [{ type: "goto", cardId: "c2" }]), btn("Right", [{ type: "goto", cardId: "c2" }]), btn("Straight on", [{ type: "goto", cardId: "c2" }]), btn("Wait", [{ type: "goto", cardId: "c2" }]), picto("ship")] },
    ],
    [
      "flash",
      { id: "f", kind: "flash", actions: [], elements: [text("Evaporation"), text("Water turns into vapour when the sun heats it."), btn("Next Card", [{ type: "goto", cardId: "c2" }]), picto("sun")] },
    ],
  ];

  for (const [kind, raw] of kinds) {
    it(`TASK-32c: a ${kind} card gets the picture in the picture slot, overlapping nothing, and NO credit line`, () => {
      const card = normalizeGeneratedCard(sanitised(raw));
      const img = card.elements.find((e) => e.type === "image")!;
      expect(img && rect(img)).toEqual(PICTURE_SLOT);
      expect(card.elements.some((e) => e.type === "text" && e.content === PICTOGRAM_CREDIT)).toBe(false);
      for (const e of card.elements) {
        if (e === img) continue;
        expect(overlaps(rect(img), rect(e)), `${kind}: picture vs ${e.type}`).toBe(false);
      }
      for (const e of card.elements) expect(e.x >= 0 && e.y >= 0 && e.x + e.w <= 800 && e.y + e.h <= 600).toBe(true);
    });

    it(`TASK-31h: normalising a ${kind} card twice keeps one picture, no credit, and its words — and clears an old credit line`, () => {
      const once = normalizeGeneratedCard(sanitised(raw));
      const legacy = JSON.parse(JSON.stringify(once)) as Card;
      legacy.elements.push({ type: "text", id: "abcd0000-0000-4000-8000-0000000000ff", ...PICTURE_CREDIT, content: PICTOGRAM_CREDIT });
      const twice = normalizeGeneratedCard(legacy);
      expect(twice.elements.filter((e) => e.type === "image")).toHaveLength(1);
      expect(twice.elements.filter((e) => e.type === "text" && e.content === PICTOGRAM_CREDIT)).toHaveLength(0);
      const words = (c: Card): string[] => c.elements.filter((e) => e.type === "text").map((e) => (e.type === "text" ? e.content : ""));
      expect(words(twice)).toEqual(words(once));
    });
  }

  it("TASK-31h: a card without a picture gets no credit line", () => {
    const card = normalizeGeneratedCard(sanitised(quizCard("c2")));
    expect(card.elements.some((e) => e.type === "image")).toBe(false);
    expect(card.elements.some((e) => e.type === "text" && e.content === PICTOGRAM_CREDIT)).toBe(false);
  });
});

describe("TASK-31h: the whole pipeline and the export", () => {
  const rawDeck = (): Record<string, unknown> => ({
    id: "s", title: "Water", theme: { background: "#fff", foreground: "#000", font: "sans-serif" },
    cards: [
      quizCard("c2", [picto("cloud")]),
      { id: "c2", kind: "flash", actions: [], elements: [text("Evaporation"), text("Water turns into vapour."), btn("Next Card", [{ type: "goto", cardId: "c3" }]), picto("sun")] },
      { id: "c3", kind: "story", actions: [], elements: [text("A drop falls."), btn("Continue", [{ type: "goto", cardId: "c4" }]), picto("drop"), picto("wave")] },
      { id: "c4", kind: "end", actions: [], elements: [text("Done"), picto("star"), { type: "field", id: "f", variable: "score" }] },
    ],
  });

  it("TASK-31h: sanitise → validate → finalise keeps one picture on the quiz, flash and story cards and none on the end card", () => {
    const v = validate(sanitizeRawStack(rawDeck()));
    expect(v.valid).toBe(true);
    if (!v.valid) return;
    const out = finaliseGeneratedStack(v.stack);
    expect(validate(out).valid).toBe(true);
    const pics = out.cards.map((c) => c.elements.filter((e) => e.type === "image").map((e) => (e.type === "image" ? e.src : "")));
    expect(pics[0]).toEqual([pictogramDataUri("cloud")]);
    expect(pics[1]).toEqual([pictogramDataUri("sun")]);
    expect(pics[2]).toEqual([pictogramDataUri("drop")]);
    expect(pics[3]).toEqual([]);
  });

  it("TASK-31h: the deck exports as a class file and a living file, and the picture is inside it", async () => {
    const v = validate(sanitizeRawStack(rawDeck()));
    if (!v.valid) throw new Error("invalid");
    const out = finaliseGeneratedStack(v.stack);
    for (const html of [await exportStack(out), await exportLivingStack(out)]) {
      expect(html).toContain(encodeURIComponent('viewBox="0 0 64 64"').slice(0, 20)); // the SVG is embedded as data
      // TASK-32c: no credit on the card (the bundle may carry the words as code,
      // to recognise an OLD line; the deck data must not).
      const data = html.match(/<script id="stack-data"[^>]*>([\s\S]*?)<\/script>/)![1]!;
      expect(data).not.toContain("Picture: Stackyard pictogram");
      expect(html).not.toMatch(/src="https?:/);
    }
  });

  it("TASK-31h: property — model decks with random picture names and junk always finalise to a valid, exportable deck", () => {
    const pictoArb = fc.oneof(fc.constantFrom(...PICTOGRAM_NAMES), fc.string(), fc.constant(undefined));
    fc.assert(
      fc.property(fc.array(pictoArb, { minLength: 3, maxLength: 3 }), pictoArb, (names, endName) => {
        const raw = rawDeck();
        const cards = raw["cards"] as Array<Record<string, unknown>>;
        cards.forEach((c, i) => {
          const els = (c["elements"] as unknown[]).filter((e) => !(typeof e === "object" && e !== null && (e as Record<string, unknown>)["picto"] !== undefined));
          const name = i < 3 ? names[i] : endName;
          c["elements"] = name === undefined ? els : [...els, picto(name)];
        });
        const v = validate(sanitizeRawStack(JSON.parse(JSON.stringify(raw))));
        if (!v.valid) return false;
        const out = finaliseGeneratedStack(v.stack);
        if (!validate(out).valid) return false;
        return out.cards.every((c) => {
          const imgs = c.elements.filter((e) => e.type === "image");
          if (c.kind === "end") return imgs.length === 0;
          return imgs.length <= 1 && imgs.every((e) => e.type === "image" && KNOWN_URIS.has(e.src));
        });
      }),
      { numRuns: 300 },
    );
  });
});

describe("TASK-31h: a streamed preview card shows the picture too", () => {
  it("TASK-31h: the `card` message dealt while the model is still writing carries the pictogram", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const THEME = { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" };
    const q = quizCard("c2", [picto("cloud")]);
    const end = { id: "c2", kind: "end", actions: [], elements: [{ type: "field", id: "f", variable: "score" }] };
    const text1 =
      [JSON.stringify({ kind: "stack", id: "s", title: "Water", theme: THEME }), JSON.stringify({ kind: "card", card: q }), JSON.stringify({ kind: "card", card: end })].join("\n") + "\n";
    const lines: GenerateStreamMessage[] = [];
    const sink: LineSink = { write: (o) => void lines.push(o), end: () => {} };
    const callStream: NonNullable<StreamGenerateDeps["callStream"]> = async function* () {
      yield text1;
    };
    await streamGenerate({ prompt: "water" }, sink, { callStream, generate: vi.fn() as never, sleep: async () => {} });
    const dealt = lines.find((l) => l.type === "card") as Extract<GenerateStreamMessage, { type: "card" }>;
    expect(dealt).toBeDefined();
    const imgs = dealt.card.elements.filter((e) => e.type === "image");
    expect(imgs).toHaveLength(1);
    expect(imgs[0]!.type === "image" && imgs[0]!.src).toBe(pictogramDataUri("cloud"));
    expect(dealt.card.elements.some((e) => e.type === "text" && e.content === PICTOGRAM_CREDIT)).toBe(false); // TASK-32c
    const done = lines.find((l) => l.type === "done") as Extract<GenerateStreamMessage, { type: "done" }>;
    expect(done.stack.cards[0]!.elements.filter((e) => e.type === "image")).toHaveLength(1);
  });
});

describe("TASK-31h: the prompts name the pictures and nothing else about images", () => {
  it("TASK-31h: all three prompts list every allowed name, once-per-card and never-on-the-end-card, and no src", () => {
    for (const [name, sys] of [
      ["one-shot", build({ prompt: "x" }).system],
      ["streaming", buildStream({ prompt: "x" }).system],
      ["retry", buildRetry({ prompt: "x" }, ["e"]).system],
    ] as const) {
      for (const p of PICTOGRAM_NAMES) expect(sys, `${name}: ${p}`).toContain(p);
      expect(sys, name).toContain("ONE small picture");
      expect(sys, name).toContain("Never put a picture on the end card");
      expect(sys, name).toContain("only when it really helps a 9-year-old");
      expect(sys, name).not.toContain('Do NOT output "image" elements');
      expect(sys, name).not.toMatch(/"src"/);
    }
  });
});
