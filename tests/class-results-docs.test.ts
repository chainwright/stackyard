// tests/class-results-docs.test.ts
// TASK-34b9: the README's "Class results (no server)" section with its privacy
// statement, and the write-up's "What it does" line (.kiro/specs/class-results/
// requirements.md REQ-CR-09).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { codeLength } from "../src/shared/resultsCode.js";

const read = (f: string): string => readFileSync(f, "utf8");

describe("TASK-34b9: class results are documented, privacy first", () => {
  it("TASK-34b9: the README section states the three privacy points and the code lengths the code really has", () => {
    const md = read("README.md");
    const at = md.indexOf("### Class results (no server)");
    expect(at).toBeGreaterThan(0);
    const s = md.slice(at, md.indexOf("\n## ", at));
    expect(s).toContain("No names or accounts are collected; the only personal detail is up to three optional initials a pupil may choose to type.");
    expect(s).toContain("No network is used");
    expect(s).toContain("The results exist only on the pupil's");
    expect(s).toContain("never carries results");
    expect(s).toContain("It is not analytics or tracking");
    expect([codeLength(5, false), codeLength(10, false), codeLength(20, false), codeLength(5, true) - codeLength(5, false)]).toEqual([9, 11, 14, 3]);
    expect(s).toContain("nine characters for five questions, 11 for ten and 14 for 20");
    expect(s).toContain("(three more with initials)");
  });

  it("TASK-34b9: the write-up's 'What it does' has one class-results line, and 'What's next' no longer promises it", () => {
    const w = read("docs/DEVPOST_WRITEUP.md");
    const does = w.slice(w.indexOf("## What it does"), w.indexOf("## Where it sits"));
    const lines = does.split("\n").filter((l) => l.startsWith("- Class results without a server"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toMatch(/\d/); // no number, so check:claims has nothing to check
    expect(w.slice(w.indexOf("## What's next"))).not.toContain("class results");
  });
});
