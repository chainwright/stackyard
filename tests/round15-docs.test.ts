// tests/round15-docs.test.ts
// TASK-42c (judge round r7, P0-2 text part and P1-6): the first lines lead with
// the results loop and name HyperCard; the Devpost tagline is kept here as a
// checked constant (it is not in the write-up body, which is pasted as "About").

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseClaimRows } from "../scripts/claims-lib.js";

const ROOT = path.resolve(__dirname, "..");
const read = (f: string): string => readFileSync(path.join(ROOT, f), "utf8");
const readOrNull = (p: string): string | null => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
};

/** TASK-42c3: the Devpost tagline (Devpost limits it to 170 characters). */
export const DEVPOST_TAGLINE =
  "Pupils' results come back with no internet: the teacher types their short codes and sees the class table. HyperCard's stack, back as one lesson file from one sentence.";

const LEAD = "**Pupils' results come back with no internet: each pupil's last card shows a short code, the teacher types the codes into her own copy of the lesson and sees the class table.**";

describe("TASK-42c: the first lines lead with the results loop", () => {
  it("TASK-42c1: README line 5 is the new lead, word for word", () => {
    expect(read("README.md").split("\n")[4]).toBe(
      `${LEAD} Stackyard brings back HyperCard's stack as one lesson file made from one sentence: it plays offline and edits itself, with no accounts and no server. (The Maker, where you make the lesson, needs the internet; only the file works offline.)`,
    );
  });

  it("TASK-42c2: the write-up's line 5 is the new lead, word for word, and the old opening is gone", () => {
    const w = read("docs/DEVPOST_WRITEUP.md");
    expect(w.split("\n")[4]).toBe(
      `${LEAD} Stackyard brings back HyperCard's stack (1987) as one lesson file made from one sentence: it plays offline and edits itself, with no accounts and no server. (Making the lesson in the Maker needs the internet; the lesson file does not.)`,
    );
    for (const f of ["README.md", "docs/DEVPOST_WRITEUP.md"]) expect(read(f), f).not.toContain("Stackyard turns one sentence into a lesson file the teacher hands to the class");
  });

  it("TASK-42c3: the Devpost tagline is at most 170 characters, starts with the results loop and names HyperCard", () => {
    expect(DEVPOST_TAGLINE.length).toBeLessThanOrEqual(170);
    expect(DEVPOST_TAGLINE.startsWith("Pupils' results come back with no internet")).toBe(true);
    expect(DEVPOST_TAGLINE).toContain("HyperCard");
    // Not in the write-up body (that is pasted as Devpost "About"); recorded in the spec.
    expect(read("docs/DEVPOST_WRITEUP.md")).not.toContain(DEVPOST_TAGLINE);
    expect(read(".kiro/specs/maker/tasks.md")).toContain(DEVPOST_TAGLINE);
  });

  it("TASK-42c4: what the lead says is what the code does: the code on the end card of both exports, Class Results in the living file, no network", () => {
    const renderer = read("src/player/renderer.ts");
    expect(renderer).toContain("container.appendChild(buildResultsCode(state, ariaLive));");
    expect(renderer).toContain('shown.setAttribute("data-testid", "results-code");');
    // The class file and the living file both play through the same player renderer.
    expect(read("server/exporter.ts")).toMatch(/playerIife/);
    const panel = read("src/living/classResults.ts");
    expect(panel).toContain("results-questions");
    expect(panel).toContain("results-pupils");
    for (const dir of ["src/living", "src/player"]) {
      for (const f of readdirSync(path.join(ROOT, dir)).filter((x) => x.endsWith(".ts"))) {
        const src = read(`${dir}/${f}`).replace(/\/\/.*$/gm, "");
        expect(src, `${dir}/${f}`).not.toMatch(/\bfetch\(|XMLHttpRequest|new WebSocket|sendBeacon|new EventSource/);
      }
    }
  });

  it("TASK-42c5: CLAIMS.md C59 quotes the new lead on line 5 of both files", () => {
    const c59 = parseClaimRows(read("CLAIMS.md")).find((r) => r.id === "C59")!;
    expect(c59.quote).toBe("the teacher types the codes into her own copy of the lesson and sees the class table");
    expect(c59.refs).toEqual([{ file: "docs/DEVPOST_WRITEUP.md", line: 5 }, { file: "README.md", line: 5 }]);
    expect(c59.status).toBe("TRUE");
  });

  it("TASK-42c7: plain words in the new lines (no 'not only … but', no AI tool name)", () => {
    for (const f of ["README.md", "docs/DEVPOST_WRITEUP.md"]) {
      const line = read(f).split("\n")[4]!;
      expect(line, f).not.toMatch(/not only/i);
      expect(line, f).not.toMatch(/Claude|ChatGPT|GPT|Gemini|Kiro/);
    }
    expect(DEVPOST_TAGLINE).not.toMatch(/not only|Claude|ChatGPT|GPT|Gemini/i);
  });
});

describe("TASK-42c6: the drafts beside the repo (skips when they are not there)", () => {
  const up = path.join(ROOT, "..");
  it("TASK-42c6: TASK-43e3: the social and blog drafts carry the new lead, say it is draft only, and have their 16 Nov backups", (ctx) => {
    const social = readOrNull(path.join(up, "SOCIAL_DRAFT.md"));
    const blog = readOrNull(path.join(up, "BLOG_DRAFT.md"));
    const writeup = readOrNull(path.join(up, "WRITEUP_DRAFT.md"));
    if (social === null || blog === null || writeup === null) return ctx.skip();
    const body = social.split("---").slice(1).join("---").trim();
    expect(body.startsWith("#KiroweenHackathon26 ")).toBe(true);
    expect(social).toContain(
      "We built Stackyard: a class plays a lesson with no internet and the results still come back, as short codes the teacher types into her own copy. It's HyperCard's stack, brought back as one HTML file made from a teacher's sentence.",
    );
    // TASK-43e3: the Status text is checked up to "post;": the name after it stays in the drafts, not in the repo.
    expect(social).toContain("Status 16.11: TASK-42c lead (results first, HyperCard named) is in this draft only, NOT in the live LinkedIn post;");
    expect(blog).toContain(
      "The short version: a class plays a lesson with no internet, each pupil's last card shows a short code, and the teacher types the codes into her own copy to see the class table. The rest of this post is how we got there.",
    );
    expect(blog).toContain("Status 16.11: TASK-42c lead paragraph (results first) is in this draft only, NOT applied to the live dev.to post;");
    // The blog's new paragraph is not live, so CLAIMS.md has no row for it.
    expect(read("CLAIMS.md")).not.toContain("The short version: a class plays a lesson");
    // The write-up draft is a copy of the write-up body under its own heading.
    const lines = writeup.split("\n");
    expect(lines[0]).toMatch(/^# Stackyard: Devpost write-up draft \(16 Nov: now a copy of stackyard\/docs\/DEVPOST_WRITEUP\.md at the TASK-42 commit, TASK-42/);
    expect(lines.slice(1).join("\n")).toBe(read("docs/DEVPOST_WRITEUP.md").split("\n").slice(1).join("\n"));
    for (const bak of ["BLOG_DRAFT_20261116.bak", "SOCIAL_DRAFT_20261116.bak", "WRITEUP_DRAFT_20261116.bak"]) {
      expect(readOrNull(path.join(up, bak)), bak).not.toBeNull();
    }
  });
});
