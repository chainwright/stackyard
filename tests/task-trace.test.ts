// tests/task-trace.test.ts
// TASK-29c: check:trace counts an id only when a test TITLE, a gate or a hook
// names it — a comment or a prose mention does not trace it (J4 R5 P2-2).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { declaredIds, taskTrace, tracedIds } from "../scripts/check-task-trace.js";

let root = "";
const put = (rel: string, text: string): void => {
  const p = path.join(root, rel);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, text);
};

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "stackyard-trace-"));
  put(".kiro/specs/demo/tasks.md", "### TASK-90a: first thing\n### TASK-90b/c: two more\n### TASK-90 z1–z2: a range\n");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("TASK-29c: the trace counts titles, not mentions", () => {
  it("reads the declared ids from the headings", () => {
    expect(declaredIds(root)).toEqual(["90a", "90b", "90c", "90z1", "90z2"]);
  });

  it("a test title traces an id; a comment and a plain statement do not", () => {
    put(
      "tests/a.test.ts",
      [
        "// TASK-90a is mentioned only in this comment",
        "const note = 'TASK-90b appears in a plain statement';",
        "it('TASK-90c: a real test title', () => {});",
        "describe('TASK-90 z1: a suite title', () => {});",
      ].join("\n"),
    );
    const seen = tracedIds(root);
    expect(seen.has("90c")).toBe(true);
    expect(seen.has("90z1")).toBe(true);
    expect(seen.has("90a")).toBe(false);
    expect(seen.has("90b")).toBe(false);
    const { total, traced, missing } = taskTrace(root);
    expect(total).toBe(5);
    expect(traced).toBe(2);
    expect(missing).toEqual(["90a", "90b", "90z2"]);
  });

  it("a gate script's message string traces an id, its comment does not; a hook name traces too", () => {
    put("scripts/gate.ts", "// TASK-90a only in a comment\nconsole.log('gate ok (TASK-90b)');\n");
    put(".kiro/hooks/h.json", '{"name":"TASK-90a guard"}');
    const seen = tracedIds(root);
    expect(seen.has("90b")).toBe(true);
    expect(seen.has("90a")).toBe(true); // via the hook, not the comment
    put("scripts/gate.ts", "// TASK-90b only in a comment\n");
    expect(tracedIds(root).has("90b")).toBe(false);
  });
});
