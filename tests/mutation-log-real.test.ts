// tests/mutation-log-real.test.ts
// TASK-37a: the REAL newest log in docs/mutation-runs/ backs the write-up's
// count. Kept out of every mutant's test list on purpose: the mutation check's
// green baseline must not depend on a log the run itself is about to write.

import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { compareMutationLog, newestMutationLog } from "../scripts/claims-lib.js";

const read = (f: string): string => readFileSync(f, "utf8");

describe("TASK-37a: the real mutation log", () => {
  it("TASK-37a: TASK-39d: the newest log in docs/mutation-runs/ matches the write-up and the current scripts/mutation-check.ts", () => {
    const d = "docs/mutation-runs";
    expect(existsSync(d), "run npm run check:mutants:log").toBe(true);
    const log = newestMutationLog(readdirSync(d).filter((f) => f.endsWith(".log")).map((f) => ({ file: f, text: read(path.join(d, f)) })));
    expect(log, "run npm run check:mutants:log").not.toBeNull();
    const sha = createHash("sha256").update(readFileSync("scripts/mutation-check.ts")).digest("hex");
    expect(compareMutationLog(read("docs/DEVPOST_WRITEUP.md"), "write-up", log, sha).filter((c) => !c.ok)).toEqual([]);
    expect(log!.killed.length).toBe(log!.n);
    expect(log!.head).toMatch(/^[0-9a-f]{40}$/);
    expect(read("package.json")).toContain('"check:mutants:log": "node --import tsx/esm scripts/mutation-log.ts"');
    // TASK-39d: the claim + proof row says "newest logged run" and cites docs/mutation-runs/ as its proof.
    const row = read("docs/DEVPOST_WRITEUP.md").split("\n").find((l) => l.startsWith("| Property-based testing |")) ?? "";
    expect(row).toContain("killed in the newest logged run)");
    expect(row).toContain("`docs/mutation-runs/`");
  });
});
