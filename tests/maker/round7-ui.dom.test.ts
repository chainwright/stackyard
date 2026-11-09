// tests/maker/round7-ui.dom.test.ts
// TASK-31c (ghost cards while the model plans; a dealt preview card never shows
// empty answer tiles), from the v2 panel's "four empty answer tiles at 20 s".

import { afterEach, describe, expect, it } from "vitest";
import { render, h } from "preact";
import { readFileSync } from "node:fs";
import { GeneratingScreen } from "../../src/editor/StartScreen.js";

let mounted: HTMLElement | null = null;
afterEach(() => {
  if (mounted) render(null, mounted);
  mounted = null;
  document.body.innerHTML = "";
});

type Dealt = { index: number; total: number; kind: "quiz" | "flash" | "story" | "end"; question: string | null; answers: string[] };

function mount(dealt: Dealt[], sentence = "A quiz about the water cycle"): HTMLElement {
  const root = document.createElement("div");
  document.body.appendChild(root);
  mounted = root;
  render(h(GeneratingScreen, { dealt, total: 0, offline: false, title: null, sentence }), root);
  return root;
}
const quiz = (i: number, answers: string[]): Dealt => ({ index: i, total: 0, kind: "quiz", question: `Question ${i + 1}?`, answers });

describe("TASK-31c: the deal area while the model is still planning", () => {
  it("TASK-31c: before the first card the pile is outline cards only — no fake text, no answer tiles", () => {
    const root = mount([]);
    const ghosts = root.querySelectorAll(".deal-card.deal-ghost");
    expect(ghosts).toHaveLength(3);
    for (const g of Array.from(ghosts)) expect((g.textContent ?? "").trim()).toBe("");
    expect(root.querySelectorAll(".deal-tile")).toHaveLength(0);
    expect(root.querySelectorAll(".deal-tiles")).toHaveLength(0);
    // The only words on the pile are the teacher's own sentence.
    expect(root.querySelector(".deal-sentence")?.textContent).toBe("A quiz about the water cycle");
  });

  it("TASK-31c: the ghost outline has its own style (dashed, transparent) and no ruled-line overlay", () => {
    const css = readFileSync("src/editor/styles.css", "utf8");
    expect(css).toMatch(/\.deal-card\.deal-ghost \{[^}]*border: 2px dashed/);
    expect(css).toMatch(/\.deal-card\.deal-ghost \{[^}]*background: transparent/);
  });

  it("TASK-31c: as cards arrive the ghosts give way to real cards (none left once four are dealt)", () => {
    expect(mount([quiz(0, ["A", "B"])]).querySelectorAll(".deal-ghost")).toHaveLength(3);
    document.body.innerHTML = "";
    const four = mount([quiz(0, ["A"]), quiz(1, ["B"]), quiz(2, ["C"]), quiz(3, ["D"])]);
    expect(four.querySelectorAll(".deal-ghost")).toHaveLength(0);
  });
});

describe("TASK-31c: a dealt preview card never shows empty answer tiles", () => {
  it("TASK-31c: a quiz card shows its answers as labelled tiles, none empty", () => {
    const root = mount([quiz(0, ["Vikings", "Romans", "Greeks", "Normans"])]);
    const tiles = Array.from(root.querySelectorAll(".deal-tile"));
    expect(tiles).toHaveLength(4);
    expect(tiles.map((t) => (t.textContent ?? "").trim())).toEqual(["Vikings", "Romans", "Greeks", "Normans"]);
    for (const t of tiles) expect(t.querySelector("svg")).not.toBeNull(); // the shape rides with the colour
  });

  it("TASK-31c: a quiz card with only two answers shows two tiles, not four", () => {
    const root = mount([quiz(0, ["Yes", "No"])]);
    expect(root.querySelectorAll(".deal-tile")).toHaveLength(2);
  });

  it("TASK-31c: a quiz card whose answers have not arrived shows NO tiles at all", () => {
    const root = mount([quiz(0, [])]);
    expect(root.querySelectorAll(".deal-tile")).toHaveLength(0);
    expect(root.querySelectorAll(".deal-tiles")).toHaveLength(0);
    expect(root.querySelector(".deal-q")?.textContent).toBe("Question 1?");
  });

  it("TASK-31c: the last tile (navy) keeps white text; the others keep ink", () => {
    const root = mount([quiz(0, ["a", "b", "c", "d"])]);
    const tiles = Array.from(root.querySelectorAll<HTMLElement>(".deal-tile"));
    expect(tiles[3]!.getAttribute("style")).toContain("var(--color-white)");
    expect(tiles[0]!.getAttribute("style")).toContain("var(--color-ink)");
  });
});
