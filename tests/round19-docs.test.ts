// tests/round19-docs.test.ts
// TASK-44 (judge round r9, 16–17 Nov 2026). TASK-44a: the git-reading test
// skips in a copy with no .git (a ZIP download, `git archive`) and runs as
// before in a checkout. The coordinator checks a fresh clone and a
// `git archive HEAD` copy outside Kiro; these tests build small throwaway
// repositories in the system temp folder and make no network call.

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gitCheckoutAt, gitGrepHits } from "./helpers/git-checkout.js";

const ROOT = path.resolve(__dirname, "..");
const PATTERN = "post; [A-Z][a-z]+ decides";
const git = (cwd: string, args: string[]): void => {
  execFileSync("git", args, { cwd, stdio: "ignore" });
};

/** Run `body` in a fresh temp folder, then remove the folder. */
function inTemp(body: (dir: string) => void): void {
  const dir = mkdtempSync(path.join(os.tmpdir(), "stackyard-t44a-"));
  try {
    body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("TASK-44a: the git grep test skips in a copy with no .git", () => {
  it("TASK-44a1: TASK-44a3: a folder with no .git is not a checkout (a ZIP download or git archive copy)", () => {
    inTemp((dir) => {
      writeFileSync(path.join(dir, "README.md"), "a copy with no .git\n");
      expect(gitCheckoutAt(dir)).toBe(false);
    });
  });

  it("TASK-44a1: TASK-44a3: a copy unpacked inside another repository is not a checkout of its own", () => {
    inTemp((dir) => {
      git(dir, ["init", "-q"]);
      const copy = path.join(dir, "stackyard");
      mkdirSync(copy);
      writeFileSync(path.join(copy, "README.md"), "unpacked here\n");
      expect(gitCheckoutAt(dir)).toBe(true);
      expect(gitCheckoutAt(copy)).toBe(false);
    });
  });

  it("TASK-44a2: TASK-44a3: the root of a git checkout is a checkout, so the TASK-43e3 test runs there", () => {
    // A temp repo, not this one: this file must not fail in a ZIP copy itself.
    inTemp((dir) => {
      git(dir, ["init", "-q"]);
      expect(gitCheckoutAt(dir)).toBe(true);
      const sub = path.join(dir, "docs");
      mkdirSync(sub);
      expect(gitCheckoutAt(sub)).toBe(false); // a subfolder is not the repo root
    });
  });

  it("TASK-44a2: TASK-44a3: in a checkout, a tracked match is found (the test still fails on it) and no match gives ''", () => {
    inTemp((dir) => {
      git(dir, ["init", "-q"]);
      writeFileSync(path.join(dir, "clean.md"), "Status: in this draft only, NOT in the live post.\n");
      git(dir, ["add", "clean.md"]);
      expect(gitCheckoutAt(dir)).toBe(true);
      expect(gitGrepHits(dir, PATTERN)).toBe("");
      // A made-up word, built in pieces so this source line never matches the pattern once it is tracked.
      writeFileSync(path.join(dir, "draft.md"), "NOT in the live LinkedIn post" + "; Some" + "one decides.\n");
      git(dir, ["add", "draft.md"]);
      expect(gitGrepHits(dir, PATTERN)).toContain("draft.md:1:");
    });
  });

  it("TASK-44a2: TASK-44a3: a git grep that fails for another reason throws, so it cannot pass silently", () => {
    inTemp((dir) => {
      // No repository at all: git grep exits 128, not 1.
      expect(() => gitGrepHits(dir, PATTERN)).toThrow();
    });
  });

  it("TASK-44a1: TASK-44a2: the TASK-43e3 test guards itself with ctx.skip() and the shared helpers", () => {
    const src = readFileSync(path.join(ROOT, "tests/round18-docs.test.ts"), "utf8");
    const at = src.indexOf('it("TASK-43e3: TASK-44a2:');
    expect(at).toBeGreaterThan(0);
    const body = src.slice(at, src.indexOf("\n  });", at));
    expect(body).toContain("(ctx) => {");
    expect(body).toContain("if (!gitCheckoutAt(ROOT)) return ctx.skip();");
    expect(body).toContain(`expect(gitGrepHits(ROOT, "${PATTERN}")).toBe("");`);
  });
});

// TASK-44b–e are written in the spec (Phase 29) and not built yet. Each test
// below passes only while its sub-ids are still unticked in the spec, so an id
// is traced here only while the spec plainly says it is pending; ticking one
// makes its test fail until real tests replace it.
describe("TASK-44b–e: pending, spec only", () => {
  const spec = readFileSync(path.join(ROOT, ".kiro/specs/maker/tasks.md"), "utf8");
  const phase = spec.slice(spec.indexOf("## Phase 29 - TASK-44:"));
  const pending = (ids: string[]): void => {
    for (const id of ids) {
      expect(phase, id).toContain(`- [ ] TASK-${id}:`);
      expect(phase, id).not.toContain(`- [x] TASK-${id}:`);
    }
  };
  it("TASK-44b: TASK-44b1/b2/b3: pending (the footage figure); the spec lists them unticked", () => pending(["44b1", "44b2", "44b3"]));
  it("TASK-44c: TASK-44c1/c2/c3: pending (the twin in Where it sits); the spec lists them unticked", () => pending(["44c1", "44c2", "44c3"]));
  it("TASK-44d: TASK-44d1/d2/d3: pending (Caramel, commit days, C73); the spec lists them unticked", () => pending(["44d1", "44d2", "44d3"]));
  it("TASK-44e: TASK-44e1/e2/e3: pending (the test counts per kind of copy); the spec lists them unticked", () => pending(["44e1", "44e2", "44e3"]));
});
