// tests/round6-docs.test.ts
// TASK-30b (the demo never stamps a wrong fact), TASK-30e (README truth),
// TASK-30f (the cross-browser record), TASK-30j (docs leftovers).

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (f: string): string => readFileSync(path.join(ROOT, f), "utf8");
const FLAT = (s: string): string => s.replace(/\s+/g, " ");

describe("TASK-30b: the README media script never makes a wrong option right", () => {
  const script = read("scripts/make-readme-media.ts");
  const step7 = script.slice(script.indexOf("// 7. Teacher"), script.indexOf("// 8. Try It"));

  it("step 7 edits the label of the tile already marked right", () => {
    expect(step7).toContain("data-correct='true'");
    expect(step7).toContain("input[type=text]");
    expect(step7).toContain(" from Norway");
  });
  it("step 7 never ticks a radio / 'Right answer' box on another tile", () => {
    expect(step7).not.toMatch(/radio/i);
    expect(step7).not.toMatch(/\.click\(\)[\s\S]*\.click\(\)[\s\S]*\.checked/);
    expect(script).not.toMatch(/radio\.click\(\)/);
  });
  it("the README no longer says a different answer is ticked", () => {
    expect(FLAT(read("README.md"))).not.toContain("a different answer ticked as right");
  });
});

describe("TASK-30e: README truth (video hound R1–R4)", () => {
  const readme = FLAT(read("README.md"));

  it("R1: TASK-37b: TASK-37c: the AI footage is described as dramatised shots (v8b: about 23 s, eight shots), each tagged", () => {
    expect(readme).toContain(
      "The classroom shots are dramatised: the teacher, the pupils, the laptops and the room are AI-generated (about 23 s in six sequences, eight shots), each tagged on screen; app screens in them are real recordings composited in.",
    );
    expect(readme).not.toContain("two short shots are AI-generated footage");
  });
  it("R2: the hooks bullet counts the hook files, and names the after-shell hook", () => {
    const files = readdirSync(path.join(ROOT, ".kiro", "hooks")).filter((f) => f.endsWith(".json")).length;
    const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
    expect(readme).toMatch(new RegExp(`\\*\\*Hooks\\*\\* — ${words[files]} hooks`));
    expect(readme).toContain("invariants-after-shell-edit");
    expect(read("README.md")).not.toMatch(/five hooks/i);
  });
  it("R3: HyperCard successors are named, and 'nothing really replaced it' is gone", () => {
    // TASK-36b1: R17 adds NecroCard and narrows the claim.
    expect(readme).toContain("Successors like HyperStudio and Decker exist, and another Kiroween 2026 entry (NecroCard) builds a stack from a plain-English description;");
  });
  it("R4: AI quiz makers are described without the refuted claim", () => {
    expect(readme).toContain("usually live on a platform that needs accounts, or export to forms, LMS formats or PDF.");
    expect(readme).not.toContain("give one-shot output you can't edit card by card");
  });
  it("the demo video link sits at the very top next to the live app, and the screens' deck is named", () => {
    const top = readme.slice(0, readme.indexOf("## "));
    expect(top).toContain("https://youtu.be/x6W2BzhpAyU");
    expect(top).not.toContain("G5aNDWg8UGY");
    expect(top).not.toContain("xQvUPdifiVE");
    expect(top).toContain("https://stackyard-sdqt.onrender.com");
    expect(readme).toMatch(/README screens and (the )?GIF use the ready-made Vikings deck \(no live generation\)/);
  });
});

describe("TASK-30f: the cross-browser record is committed", () => {
  it("README.md, result.json and cross_browser.py exist; the script is self-contained", () => {
    for (const f of ["README.md", "result.json", "cross_browser.py"]) {
      expect(existsSync(path.join(ROOT, "docs", "cross-browser", f)), f).toBe(true);
    }
    const py = read("docs/cross-browser/cross_browser.py");
    expect(py).not.toMatch(/from ui import/);
    expect(py).toContain("def go_offline");
    expect(() => JSON.parse(read("docs/cross-browser/result.json"))).not.toThrow();
    expect(read("docs/cross-browser/README.md")).toMatch(/6 Nov/);
    expect(read("docs/cross-browser/README.md")).toMatch(/before TASK-29\/30/);
  });
  it("the README links the folder where the offline claim is made", () => {
    expect(read("README.md")).toContain("docs/cross-browser/");
  });
});

describe("TASK-30j: docs leftovers", () => {
  const log = read("docs/KIRO_LOG.md");
  it("KIRO_LOG says /pre-submit, never #pre-submit", () => {
    expect(log).not.toContain("#pre-submit");
    expect(log).toContain("`/pre-submit`");
  });
  it("the kiro-cli /pre-submit claim cites its session id", () => {
    const id = "2028064e-7d31-4c17-a0db-e0d22ecc728e";
    expect(read("docs/kiro-sessions/README.md")).toContain(id);
    expect(log).toContain(id);
  });
});
