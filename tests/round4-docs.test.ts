// tests/round4-docs.test.ts
// The documents tell the truth (J5, J1): TASK-28a/b/t, TASK-27o/p/q/u/y, and the
// explicit timeouts on the 1000-run property tests (TASK-27 z6).

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { taskTrace, declaredIds } from "../scripts/check-task-trace.js";

const ROOT = process.cwd();
const read = (f: string): string => readFileSync(path.join(ROOT, f), "utf8");
const FLAT = (s: string): string => s.replace(/\s+/g, " ");

describe("TASK-28a: REQ-EXP-01 says what the export really does", () => {
  const req = FLAT(read(".kiro/specs/exporter/requirements.md"));
  it("is amended: nothing from the network at runtime; inert licence URLs in comments are allowed", () => {
    expect(req).toContain("shall load nothing from the network at runtime; inert licence source URLs inside comments are allowed");
    expect(req).not.toContain("no `http://` or `https://` URLs");
  });
});

describe("TASK-28b: every lettered spec task id is traced into a test, a gate or a hook", () => {
  it("none is missing, and the count is the one the docs quote", () => {
    const { total, traced, missing } = taskTrace();
    expect(missing, `untraced: ${missing.join(", ")}`).toEqual([]);
    expect(traced).toBe(total);
    expect(total).toBeGreaterThan(60);
  });

  it("the parser reads slash lists, spaced ids and ranges from the headings", () => {
    const ids = declaredIds();
    for (const id of ["27c", "27j", "27o", "27p", "27q", "27s", "27u", "27t", "27w", "27y", "27z3", "28a", "28b", "28t", "28u"]) {
      expect(ids, id).toContain(id);
    }
  });

  it("no document claims 'every task id' is traced", () => {
    for (const f of ["README.md", "docs/KIRO_LOG.md", "docs/kiro-sessions/README.md"]) {
      expect(FLAT(read(f)), f).not.toMatch(/every task id/i);
    }
  });
});

describe("TASK-28t: the README shows the current build and says where the live URL belongs", () => {
  const readme = read("README.md");
  it("embeds real screenshots and a GIF that exist in docs/media", () => {
    const refs = [...readme.matchAll(/\]\((docs\/media\/[^)]+)\)/g)].map((m) => m[1]!);
    expect(refs.length).toBeGreaterThanOrEqual(7);
    for (const r of refs) expect(existsSync(path.join(ROOT, r)), r).toBe(true);
    expect(refs).toContain("docs/media/demo.gif");
    expect(readme).not.toMatch(/TODO before submission/);
  });
  it("notes that the GitHub About website is the live demo URL, set by hand", () => {
    expect(FLAT(readme)).toMatch(/GitHub About "Website" field points at this URL; it is set by hand/);
  });
});

describe("TASK-28c: KIRO_LOG corrections", () => {
  const log = read("docs/KIRO_LOG.md");
  it("credits Chiara Coetzee and does not claim the samples were regenerated at the swap", () => {
    expect(log).not.toContain("D Coetzee");
    expect(log).toContain("a wooden abacus by Chiara Coetzee");
    expect(log).toContain("We forgot to regenerate the three samples");
    expect(log).not.toContain("and we regenerated the three samples");
  });
  it("says plainly that TASK-27 was mostly shell edits, which do not trigger save hooks", () => {
    expect(FLAT(log)).toContain("In TASK-27 Kiro edited mostly through shell scripts, which don't trigger file-save hooks, so the gates ran as `npm run pre-submit` instead.");
  });
  it("TASK-39e: the README no longer says the lesson checker read 'generated' cards", () => {
    // TASK-39e: the Custom agent row says where it was run: "Run on the ready-made decks".
    expect(FLAT(read("README.md"))).toContain("Run on the ready-made decks, it caught an ambiguous Vikings question.");
    expect(FLAT(read("README.md"))).not.toContain("reads a generated set of cards");
  });
});

describe("TASK-27o: pre-submit is a documented trigger, described the same way everywhere", () => {
  it("PostTaskExec in the hook file, and the docs say so", () => {
    const hook = JSON.parse(read(".kiro/hooks/pre-submit.json")) as { hooks: Array<{ trigger: string }> };
    expect(hook.hooks[0]!.trigger).toBe("PostTaskExec");
    for (const f of ["docs/KIRO_LOG.md", "docs/kiro-sessions/README.md"]) {
      expect(read(f), f).toMatch(/PostTaskExec/);
    }
  });
});

describe("TASK-27p / 27q / 27u / 27y: docs honesty from round 3 stays true", () => {
  it("27p: the picture credit uses the creator's current name in the code and the README", () => {
    expect(read("src/shared/readyMadeImages.ts")).toContain("Chiara Coetzee");
    expect(read("README.md")).toContain("Chiara Coetzee");
    expect(read("README.md")).not.toContain("D Coetzee");
  });
  it("27q: the log has no 'Nothing committed.' and the maker spec has no duplicate phase numbers", () => {
    expect(read("docs/KIRO_LOG.md")).not.toContain("Nothing committed.");
    const phases = [...read(".kiro/specs/maker/tasks.md").matchAll(/^## (Phase [0-9]+b?) /gm)].map((m) => m[1]);
    expect(new Set(phases).size).toBe(phases.length);
  });
  it("27u: docs/kiro-sessions has the TASK-26 prompt, five hook firings and the lesson-checker run", () => {
    const t = read("docs/kiro-sessions/README.md");
    expect(t).toContain("TASK-26: fixes from the round-2 review panel");
    expect((t.match(/PostFileSave|\.json {2}completed|completed$/gm) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(t).toMatch(/lesson-checker/);
  });
  it("27y: the README has a 'Built with Kiro' section linking steering, specs, hooks, agent, MCP", () => {
    const r = read("README.md");
    expect(r).toMatch(/^## Built with Kiro$/m);
    for (const link of [".kiro/steering/", ".kiro/specs/", ".kiro/hooks/", ".kiro/agents/", "docs/kiro-sessions/"]) {
      expect(r, link).toContain(link);
    }
  });
});

describe("TASK-27 z6: the 1000-run property tests carry an explicit timeout", () => {
  for (const file of [
    "tests/roundtrip.property.test.ts",
    "tests/maker/export.property.test.ts",
    "tests/maker/history.property.test.ts",
    "tests/maker/operations.property.test.ts",
  ]) {
    it(`${file}: every numRuns: 1000 is followed by a 30_000 ms timeout`, () => {
      const lines = read(file).split("\n");
      const runs = lines.map((l, i) => (l.includes("numRuns: 1000") ? i : -1)).filter((i) => i >= 0);
      expect(runs.length).toBeGreaterThan(0);
      for (const i of runs) {
        expect(lines.slice(i, i + 4).join("\n"), `${file}:${i + 1}`).toContain("30_000");
      }
    });
  }
  it("the global test timeout is also raised", () => {
    expect(read("vitest.config.ts")).toMatch(/testTimeout:\s*60_000/);
  });
});
