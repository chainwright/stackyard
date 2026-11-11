// tests/round7-docs.test.ts
// TASK-31a (README and docs say only what is true), TASK-31e (the flash rule in
// the prompts), TASK-31f (log honesty). From the v2 panel on ee37ab7.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (f: string): string => readFileSync(path.join(ROOT, f), "utf8");
const FLAT = (s: string): string => s.replace(/\s+/g, " ");

describe("TASK-31f: the log's two hook-firing counts say what they count", () => {
  const log = FLAT(read("docs/KIRO_LOG.md"));
  it("TASK-31f: the TASK-28 count (79, 6 Nov) and the TASK-30 count (98, 9 Nov) are each scoped and point at each other", () => {
    // TASK-32e reworded both to the recount from the session store.
    expect(log).toContain("79 `ContextualHookInvoked` records for `invariants-after-shell-edit` by the end of the TASK-28 work (6 Nov, 17:30–18:44Z");
    expect(log).toContain("not the same \"98\" as the TASK-30 after-shell count");
    expect(log).toContain("98 `invariants-after-shell-edit` and 2 `invariants-on-save` `ContextualHookInvoked` firings in the TASK-30 window (9 Nov, 16:10–17:21Z; 100 in all");
    // "98 after-shell" appears once, with its date and scope beside it.
    expect(log.match(/\b98 `invariants-after-shell-edit`/g)).toHaveLength(1);
  });

  it("TASK-31f: a TASK-31 entry lists a to f, the shell edits and what was not done", () => {
    const entry = log.slice(log.indexOf("v2 panel fixes (TASK-31)"));
    expect(entry.length).toBeGreaterThan(500);
    for (const letter of ["**a —", "**b —", "**c —", "**d —", "**e —", "**f —"]) expect(entry).toContain(letter);
    expect(entry).toMatch(/through the shell/);
    expect(entry).toMatch(/Not done:/);
  });
});

describe("TASK-31a: README and docs say only what is true", () => {
  const readmeLines = read("README.md").split("\n");
  const readme = FLAT(read("README.md"));

  it("TASK-31a: TASK-38d: README line 9 (after the category line) links the submitted video and the live app", () => {
    expect(readmeLines[8]).toBe("**Demo video (2:55):** https://youtu.be/x6W2BzhpAyU · **Live app:** https://stackyard-sdqt.onrender.com");
    expect(read("README.md")).not.toContain("G5aNDWg8UGY");
    expect(read("README.md")).not.toContain("xQvUPdifiVE");
  });

  it("TASK-31a: docs/MUSIC_LICENCE.md exists, is linked from the README, and states only the facts given", () => {
    expect(existsSync(path.join(ROOT, "docs/MUSIC_LICENCE.md"))).toBe(true);
    expect(readme).toContain("docs/MUSIC_LICENCE.md");
    const m = read("docs/MUSIC_LICENCE.md");
    expect(m.startsWith("# Music in the demo video")).toBe(true);
    expect(m).toContain("ElevenLabs Music on 27 Oct 2026");
    expect(m).toContain("Starter, billed for 30 Sep to 30 Oct 2026");
    expect(m).toContain("The music is only in the video; the app and the exported lesson files contain no music.");
    expect(m).toContain("No third-party recording or sample was used.");
  });

  it("TASK-31a: the ES2018 sentence names what was actually tested", () => {
    expect(readme).toContain(
      "That file is built for ES2018 and plays offline in Chrome (checked by our gates) and, in a one-off run, in Playwright's Firefox and WebKit builds, with no internet, no account and no install.",
    );
    expect(readme).not.toContain("any current browser on a school laptop");
  });

  it("TASK-31a: the cross-browser claim says when it was run", () => {
    expect(readme).toContain("Playwright's Chromium, Firefox and WebKit builds (run on 6 Nov on files exported before TASK-29/30)");
  });

  it("TASK-31a: TASK-36d: the MCP bullet keeps the script history and adds the one call made through Kiro", () => {
    expect(readme).toContain(
      "`mcp/openverse` finds public-domain pictures for the ready-made decks; its search and allowlisted-fetch code was run as a script outside Kiro (Kiro's sandbox had no network) to pick them; its search was also called once through Kiro as an MCP tool (10 Nov, docs/kiro-sessions).",
    );
  });

  it("TASK-31a: the HyperStudio and Decker sentence claims only what was checked", () => {
    // TASK-36b1: R17 (the round-3 hound) names NecroCard and claims only the checked part.
    expect(readme).toContain("we have not found one that turns a teacher's sentence into a checked lesson file that plays and edits itself offline.");
  });

  it("TASK-31a: the cross-browser README has no internal line and names the script beside it", () => {
    const x = read("docs/cross-browser/README.md");
    expect(x).not.toContain("Under the rule the coordinator set");
    expect(x).not.toContain("tools/cross_browser.py");
    expect(existsSync(path.join(ROOT, "docs/cross-browser/cross_browser.py"))).toBe(true);
  });

  it("TASK-31a: the pre-submit steering file names the whole gate, not a stale list", () => {
    const s = read(".kiro/steering/pre-submit.md");
    expect(s).toContain("`npm run pre-submit` (the whole gate in `package.json`)");
    expect(s).not.toContain("adds the Maker build");
  });
});
