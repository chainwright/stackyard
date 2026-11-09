// tests/mutation-lib.test.ts
// TASK-31f: when check:mutants' baseline is not green it prints WHY (the tail of the
// failing output), not just that it failed (J04 P1).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { tailLines, baselineFailureMessage } from "../scripts/mutation-lib.js";

describe("TASK-31f: a baseline failure of check:mutants shows the failing output", () => {
  it("TASK-31f: tailLines keeps the last lines and drops blanks", () => {
    const text = Array.from({ length: 100 }, (_, i) => `line ${i}\n`).join("\n");
    const tail = tailLines(text, 5).split("\n");
    expect(tail).toEqual(["line 95", "line 96", "line 97", "line 98", "line 99"]);
  });

  it("TASK-31f: the baseline message names what failed and carries the tail", () => {
    const out = "FAIL tests/foo.test.ts > a thing\nAssertionError: expected 1 to be 2\n";
    const msg = baselineFailureMessage("tests", out);
    expect(msg).toContain("the guarding tests are not green");
    expect(msg).toContain("FAIL tests/foo.test.ts > a thing");
    expect(msg).toContain("AssertionError: expected 1 to be 2");
    expect(baselineFailureMessage("gate", "boom")).toContain("the browser gate is not green");
    expect(baselineFailureMessage("gate", "")).toContain("(the command printed nothing)");
  });

  it("TASK-31f: mutation-check.ts routes both baseline failures through it", () => {
    const src = readFileSync("scripts/mutation-check.ts", "utf8");
    expect(src).toContain('baselineFailureMessage("tests", base.output)');
    expect(src).toContain('baselineFailureMessage("gate", base.output)');
  });
});
