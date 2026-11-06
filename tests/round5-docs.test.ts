// tests/round5-docs.test.ts
// TASK-29i (Manual described the way kiro.dev describes it, /pre-submit),
// TASK-29f (the README media ends with the living file), TASK-29d (KIRO_LOG).

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (f: string): string => readFileSync(path.join(ROOT, f), "utf8");
const FLAT = (s: string): string => s.replace(/\s+/g, " ");

describe("TASK-29i: Manual is described the way kiro.dev describes it", () => {
  const files = ["docs/KIRO_LOG.md", "docs/kiro-sessions/README.md", ".kiro/hooks/pre-submit.json", ".kiro/steering/pre-submit.md", "README.md"];

  it("no file claims this build's trigger enum has no Manual", () => {
    for (const f of files) {
      const t = FLAT(read(f));
      expect(t, f).not.toMatch(/(trigger enum has no `?Manual`?)(?![^.]*was false)/);
    }
    // The one place that mentions the old claim says it was false.
    expect(FLAT(read("docs/KIRO_LOG.md"))).toContain("was false; the kiro.dev reason is the true one");
  });

  it("the reason given is kiro.dev's: not invocable in the CLI, no longer created by the IDE", () => {
    const hook = FLAT(read(".kiro/hooks/pre-submit.json"));
    expect(hook).toContain("not invocable in CLI v3");
    expect(hook).toContain("the IDE no longer creates them");
    expect(FLAT(read("docs/kiro-sessions/README.md"))).toContain("the IDE no longer creates them");
  });

  it("the on-demand gate is run as the /pre-submit slash command", () => {
    expect(read(".kiro/steering/pre-submit.md")).toContain("`/pre-submit`");
    expect(read(".kiro/hooks/pre-submit.json")).toContain("/pre-submit");
    expect(read("docs/KIRO_LOG.md")).toContain("(`/pre-submit`)");
  });

  it("KIRO_LOG calls pre-submit a PostTaskExec hook everywhere, never a Manual hook", () => {
    expect(read("docs/KIRO_LOG.md")).not.toMatch(/pre-submit` is a Manual hook/i);
  });
});

describe("TASK-29f: the README media ends with the living file", () => {
  const readme = read("README.md");
  it("shows the Teacher edit, the stamp and the saved copy, and the files exist", () => {
    for (const f of ["7-teacher-edit.png", "8-teacher-stamp.png", "9-copy-plays.png", "demo.gif"]) {
      expect(readme, f).toContain(`docs/media/${f}`);
      expect(existsSync(path.join(ROOT, "docs", "media", f)), f).toBe(true);
    }
  });
  it("the media script opens the file it just exported (not a sample), with the network off", () => {
    const s = read("scripts/make-readme-media.ts");
    expect(s).toContain("setDownloadBehavior");
    expect(s).toContain("waitForFile(downloads");
    expect(s).not.toContain('samples", "vikings-in-ireland.html');
    expect(s).toContain("emulateNetworkConditions");
    expect(s).toContain("Save a Copy");
  });
  it("the alt text of screen 6 no longer says a sample", () => {
    expect(FLAT(readme)).not.toContain("same deck as a sample file");
  });
});

describe("TASK-29d: KIRO_LOG no longer calls pre-submit a Manual hook", () => {
  it("line 236's honest-limits sentence says PostTaskExec", () => {
    expect(read("docs/KIRO_LOG.md")).toContain("(4) `pre-submit` is a `PostTaskExec` hook");
  });
  it("the CLI run of /pre-submit is recorded as a slash-command run, not as a hook firing", () => {
    const t = FLAT(read("docs/kiro-sessions/README.md"));
    expect(t).toContain("That is a slash-command run, not a `PostTaskExec` firing.");
    expect(FLAT(read("docs/KIRO_LOG.md"))).toContain("it is not recorded as one");
  });
});
