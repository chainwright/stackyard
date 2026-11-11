// tests/round10-docs.test.ts
// TASK-38a–f: the text fixes from judge round 4 (the hound seat).

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { readWriteupClaims, readClaims } from "../scripts/claims-lib.js";

const read = (f: string): string => readFileSync(f, "utf8");
const FLAT = (s: string): string => s.replace(/\s+/g, " ");
const W = (): string => FLAT(read("docs/DEVPOST_WRITEUP.md"));
const R = (): string => FLAT(read("README.md"));
const gone = (...old: string[]): void => {
  for (const f of ["README.md", "docs/DEVPOST_WRITEUP.md"]) for (const o of old) expect(FLAT(read(f)), `${f}: ${o}`).not.toContain(o);
};

describe("TASK-38a: the hosting text matches render.yaml", () => {
  it("TASK-38a: a paid instance that stays awake; keep-warm is no longer needed; the old free-instance wording is gone", () => {
    expect(read("render.yaml")).toMatch(/plan: starter/);
    expect(W()).toContain("- Live app: https://stackyard-sdqt.onrender.com (a paid Render instance, so it stays awake).");
    const r = R();
    expect(r).toContain("### Deploy to Render (the blueprint uses the paid Starter plan; change `plan:` to `free` for a free instance)");
    expect(r).toContain("`/api/health` is the health check (it makes no model call).");
    expect(r).toContain(
      "**Keep-warm is no longer needed:** the live service runs on a paid instance, which does not spin down, and the `keep-warm` workflow in `.github/workflows/keep-warm.yml` is disabled in the repository's Actions settings. [`docs/ops/keep-warm.yml`](docs/ops/keep-warm.yml) (a ping to `/api/health` every 10 minutes) and [`docs/ops/keepalive.yml`](docs/ops/keepalive.yml) (a monthly re-enable, because GitHub disables scheduled workflows in public repositories after 60 days without activity) are kept for anyone who deploys on a free instance. A test checks that the two keep-warm copies stay byte-identical.",
    );
    gone("free instance; if it has been idle", "up to a minute", "second pinger", "free web service", "**The 60-day rule.**", "a cheap keep-warm ping");
  });
});

describe("TASK-38b: six specs, not five", () => {
  it("TASK-38b: .kiro/specs/ has exactly 6 folders, and both files say six specs (five product features plus kiro-evidence)", () => {
    const dirs = readdirSync(".kiro/specs").filter((d) => statSync(path.join(".kiro/specs", d)).isDirectory());
    expect(dirs.sort()).toEqual(["class-results", "curriculum-bench", "exporter", "kiro-evidence", "maker", "stack-generator"]);
    const w = W();
    expect(w).toContain("| Specs | Six specs: five product features (generator, exporter + player, Maker, curriculum bench, class results) in EARS form and a small `kiro-evidence` spec for the MCP call record;");
    expect(w).toContain("| 6 specs;");
    expect(w).toContain("requirements → design → tasks for five product features, each written by Kiro from a chat request, reviewed and sent back (plus the small kiro-evidence spec, written by Kiro's quick spec workflow),");
    expect(R()).toContain(
      "- **Specs** — six specs: requirements, design and tasks for five product features (the Maker, the stack generator, the exporter, the curriculum bench and class results), each written by Kiro from a chat request and then reviewed, plus a small `kiro-evidence` spec for the MCP call record: [`.kiro/specs/`](.kiro/specs/).",
    );
    gone("Five specs", "5 specs", "for five features");
  });
});

describe("TASK-38c: seven on-screen AI windows, not six sequences", () => {
  it("TASK-38c: about 23 s in seven on-screen windows, eight shots, in both files", () => {
    expect(W()).toContain("(about 23 s in seven on-screen windows, eight shots in all)");
    expect(R()).toContain("(about 23 s in seven on-screen windows, eight shots)");
    gone("six sequences");
  });
});

describe("TASK-38d: the category line", () => {
  it("TASK-38d: line 3 of each file is the category, under the title and before a blank line", () => {
    for (const [f, title] of [["README.md", "# Stackyard"], ["docs/DEVPOST_WRITEUP.md", "# Stackyard: Devpost write-up"]] as const) {
      const lines = read(f).split("\n");
      expect(lines[0], f).toBe(title);
      expect(lines[1], f).toBe("");
      expect(lines[2], f).toBe("Category: Resurrection (HyperCard, 1987)");
      expect(lines[3], f).toBe("");
    }
  });
});

describe("TASK-38e: prior art: OpenMAIC added; AfterStack and NecroCard softened", () => {
  it("TASK-38e: the new sentences are in place and the stronger claims are gone", () => {
    const w = W();
    expect(w).toContain("the closest, AfterStack, is itself one offline page with a form editor; we found no AI generation or self-saving copy in it.");
    expect(w).toContain(
      "and nothing in them checks that the class can't get stuck. Some AI lesson tools, such as the open-source OpenMAIC, also export a lesson with quizzes as an offline HTML player, but the file has no editor inside and no class results.",
    );
    const r = R();
    expect(r).toContain("and another project built for Kiroween 2026 (NecroCard, per its own README) builds a stack from a plain-English description;");
    expect(r).toContain(
      "- **AI quiz makers** turn a topic into a quiz — but they usually live on a platform that needs accounts, or export to forms, LMS formats or PDF. - **OpenMAIC** (open source) turns a topic or a document into an AI-generated lesson with quizzes and can export it as an offline HTML player, but the file has no editor inside and no class results.",
    );
    gone("has no AI and no self-saving copy", "another Kiroween 2026 entry (NecroCard)");
  });
});

describe("TASK-38f: the player KB unit is stated", () => {
  it("TASK-38f: both files say 1 KB = 1,024 bytes for the player, and check:claims still reads each number", () => {
    const w = read("docs/DEVPOST_WRITEUP.md");
    expect(w).toContain("and a 12.8 KB player (gzipped, 1 KB = 1,024 bytes);");
    expect(w).toContain("The player bundle is 12.8 KB gzipped against a 50 KB budget (1 KB = 1,024 bytes here; lesson-file sizes are decimal KB).");
    const labels = readWriteupClaims(w).filter((c) => c.name === "kb").map((c) => c.label);
    expect(labels).toContain("player KB (gzip)");
    expect(labels).toContain("player KB (… tests and a N KB player)");
    const r = read("README.md");
    expect(r).toContain("- Player bundle: **12.8 KB** gzipped (budget 50 KB; 1 KB = 1,024 bytes here).");
    expect(readClaims(r)?.kb).toBe(12.8);
  });
});
