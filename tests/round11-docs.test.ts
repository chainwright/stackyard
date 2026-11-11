// tests/round11-docs.test.ts
// TASK-39a–e (judge round 4, P1): the judge files JUDGES.md / EVIDENCE.md /
// CLAIMS.md, and the write-up's and README's Kiro tables as "claim + proof".
// The numbers in these files are checked by check:claims (TASK-39f/g,
// tests/claims-docs.test.ts); this file checks the wording and the structure.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const read = (f: string): string => readFileSync(path.join(ROOT, f), "utf8");
const judges = read("JUDGES.md");
const evidence = read("EVIDENCE.md");
const claims = read("CLAIMS.md");
const writeup = read("docs/DEVPOST_WRITEUP.md");
const readme = read("README.md");

/** The rows of the first markdown table after `heading` (header and separator excluded). */
function tableAfter(text: string, heading: string): { header: string; rows: string[] } {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l === heading);
  expect(start, heading).toBeGreaterThanOrEqual(0);
  const first = lines.findIndex((l, i) => i > start && l.startsWith("|"));
  const header = lines[first]!;
  const rows: string[] = [];
  for (let i = first + 2; i < lines.length && lines[i]!.startsWith("|"); i++) rows.push(lines[i]!);
  return { header, rows };
}

const GH = "https://github.com/chainwright/stackyard/blob/main/";

describe("TASK-39a: JUDGES.md, a 3-minute path", () => {
  it("TASK-39a links the live app, the ready-made file and the video", () => {
    expect(judges).toContain("https://stackyard-sdqt.onrender.com (a paid Render instance, so it stays awake)");
    expect(judges).toContain("https://stackyard-sdqt.onrender.com/samples/vikings-in-ireland.html");
    expect(judges).toContain("https://youtu.be/x6W2BzhpAyU");
    expect(judges.split("\n")[2]).toMatch(/^Category: Resurrection \(HyperCard, 1987\)\./);
  });

  it("TASK-39a walks the path: Build Cards, Export for class, Wi-Fi off and the Network tab, Class Results, Save a Copy", () => {
    expect(judges).toContain("**Build Cards**");
    expect(judges).toContain("**Swap this wrong answer**");
    expect(judges).toContain("**Export for class**");
    expect(judges).toContain("Turn the Wi-Fi off.");
    expect(judges).toContain("**Network**");
    expect(judges).toContain("the Network tab lists no http or https request");
    expect(judges).toContain("**Class Results**");
    expect(judges).toContain("**Add Codes**");
    expect(judges).toContain("**Save a Copy**");
    // Four timed steps, then the optional terminal and the limits.
    expect(judges.match(/^## \d:\d\d–\d:\d\d · /gm)?.length).toBe(4);
  });

  it("TASK-39a links EVIDENCE.md, CLAIMS.md and EVIDENCE.md#not-proven", () => {
    expect(judges).toContain("[EVIDENCE.md](EVIDENCE.md)");
    expect(judges).toContain("[CLAIMS.md](CLAIMS.md)");
    expect(judges).toContain("[EVIDENCE.md](EVIDENCE.md#not-proven)");
    expect(judges).toContain("No teacher or class has used Stackyard yet");
  });
});

describe("TASK-39b: EVIDENCE.md", () => {
  it("TASK-39b has the four sections, and the anchors the other files link to", () => {
    for (const h of ["## Numbers you can reproduce", "## Content and accessibility numbers", "## Measured once (not re-runnable from the repo)", "## Kiro's limits in this build", "## Not proven"]) {
      expect(evidence.split("\n"), h).toContain(h);
    }
    // GitHub's anchors for the two headings linked from JUDGES, README and the write-up.
    expect(writeup).toContain(`${GH}EVIDENCE.md#kiros-limits-in-this-build`);
    expect(readme).toContain("(EVIDENCE.md#kiros-limits-in-this-build)");
  });

  it("TASK-39b says what is not proven: no teacher or pupil, AI-reviewed keys, Kiro CLI only", () => {
    expect(evidence).toContain("**No real classroom.** No teacher or pupil has used Stackyard.");
    expect(evidence).toContain("**Answer keys are AI-reviewed, not teacher-checked.**");
    expect(evidence).toContain("does not verify facts");
    expect(evidence).toContain("**Kiro CLI only**");
    expect(evidence).toContain("No screen-reader user or disabled pupil has tested it.");
  });

  it("TASK-39b carries the long Kiro caveats that left the write-up's table", () => {
    expect(evidence).toContain("The pre-submit hook (`PostTaskExec`) is not yet recorded firing.");
    expect(evidence).toContain("kiro-cli sessions have no task-status tool, so a task ticked there is a file edit");
    expect(evidence).toContain("kiro.dev lists Manual hooks as not invocable in the CLI");
    expect(evidence).toContain("**MCP was mostly run as a script.**");
    expect(evidence).toContain("(Kiro's sandbox had no network)");
    expect(evidence).toContain("No Kiro IDE, no Powers, no Kiro Web.");
    expect(evidence).toContain("**The AI review panel.**");
  });

  it("TASK-39b names the clean-tree mutation log that exists", () => {
    expect(evidence).toContain("`docs/mutation-runs/2026-11-10-a215331.log` (clean tree)");
    expect(read("docs/mutation-runs/2026-11-10-a215331.log")).toMatch(/^Working tree clean: yes/m);
  });
});

describe("TASK-39c: CLAIMS.md", () => {
  it("TASK-39c: TASK-40f: has the header, the dev.to link and rows C1–C61", () => {
    expect(claims).toContain("| # | Claim | Where | Status | Proof, or what is missing |");
    expect(claims).toContain("https://dev.to/automate_ai/we-brought-back-hypercards-stack-not-its-editor-3g3g");
    expect(claims.match(/^\| C\d+ \|/gm)?.length).toBe(61);
  });
});

describe("TASK-39d: the write-up's Kiro table is claim + proof", () => {
  const t = tableAfter(writeup, "## How we built it: Kiro, feature by feature");

  it("TASK-39d has the header and nine short rows", () => {
    expect(t.header).toBe("| Kiro feature | Claim | Proof |");
    expect(t.rows.length).toBe(9);
    for (const r of t.rows) expect(r.length, r.slice(0, 40)).toBeLessThanOrEqual(700);
    expect(t.rows.map((r) => r.split("|")[1]!.trim())).toEqual(["Steering", "Specs", "Spec vs vibe", "Property-based testing", "Hooks", "Custom agent", "MCP", "CLI", "IDE and Powers"]);
  });

  it("TASK-39d keeps the short honesty labels in the table", () => {
    const body = t.rows.join("\n");
    expect(body).toContain("not yet recorded firing");
    expect(body).toContain("mostly run as a script outside Kiro");
    expect(body).toContain("we used no Powers");
  });

  it("TASK-39d keeps the architecture line and every other honesty label in the write-up", () => {
    expect(writeup).toContain("**The line that set the architecture**");
    for (const label of [
      "not a classroom study and no teacher or pupil was involved",
      "do not verify facts",
      "It is an AI review, not a teacher's.",
      "No screen-reader user or disabled pupil has tested it.",
      "https://stackyard-sdqt.onrender.com/samples/vikings-in-ireland.html",
      "Development used our own AI review panel (AI agents)",
      "AI-generated footage (about 23 s in seven on-screen windows, eight shots in all)",
    ]) {
      expect(writeup, label).toContain(label);
    }
  });

  it("TASK-39d the Try-it list ends with the three judge files by full GitHub URL", () => {
    const lines = writeup.split("\n");
    const at = lines.indexOf("## Try it in 10 seconds");
    let last = at + 1;
    while (lines[last + 1]?.startsWith("- ")) last++;
    expect(lines[last]).toBe(
      `- Judging in 3 minutes: ${GH}JUDGES.md. Every number and the command that reproduces it: ${GH}EVIDENCE.md. Every claim in this write-up, the README and the blog, with its status: ${GH}CLAIMS.md`,
    );
  });

  it("TASK-39d the Built-with line points at the table", () => {
    expect(writeup).toContain("Kiro (CLI, specs, steering, hooks, one custom agent and an MCP server; see the Kiro table)");
    expect(writeup).not.toContain("an MCP server registered in .kiro, run as a script");
  });
});

describe("TASK-39e: the README's Built with Kiro is the same kind of table", () => {
  it("TASK-39e README line 11 links the three judge files", () => {
    const lines = readme.split("\n");
    expect(lines[10]).toBe(
      "**For judges:** [a 3-minute path](JUDGES.md) · [every number and how to reproduce it](EVIDENCE.md) · [every claim and its status](CLAIMS.md)",
    );
    expect(lines[9]).toBe("");
    expect(lines[11]).toBe("");
    expect(lines[8]).toMatch(/^\*\*Demo video \(2:55\):\*\*/);
  });

  it("TASK-39e has the claim + proof table and keeps the pre-submit label", () => {
    const t = tableAfter(readme, "## Built with Kiro");
    expect(t.header).toBe("| Kiro feature | Claim | Proof |");
    expect(t.rows.map((r) => r.split("|")[1]!.trim())).toEqual(["Steering", "Specs", "Hooks", "Custom agent", "MCP server", "Property-based tests", "Session excerpts"]);
    const body = t.rows.join("\n");
    expect(body).toContain("(not yet recorded firing; run on demand as `/pre-submit`)");
    expect(body).toContain("Its code was run as a script outside Kiro to pick them (Kiro's sandbox had no network)");
  });
});
