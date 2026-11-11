// tests/round12-docs.test.ts
// TASK-40a–f (field scan, 11 Nov 2026): the write-up and the README lead with
// R1 (the results come back as typed codes, no server); "Where it sits" names
// the 2026 field; CLAIMS.md follows. Line numbers and quotes in CLAIMS.md are
// checked by check:claims (tests/claims-docs.test.ts); this file checks wording.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseClaimRows } from "../scripts/claims-lib.js";

const ROOT = path.resolve(__dirname, "..");
const read = (f: string): string => readFileSync(path.join(ROOT, f), "utf8");
const FLAT = (s: string): string => s.replace(/\s+/g, " ");
const writeup = read("docs/DEVPOST_WRITEUP.md");
const readme = read("README.md");
const claims = read("CLAIMS.md");

const W_LEAD =
  "**Stackyard turns one sentence into a lesson file the teacher hands to the class. It plays offline, it edits itself, and the pupils' results come back to her as short codes she types in: no internet, no accounts, no server.** HyperCard (1987) gave a teacher a stack of cards she could hand on. Stackyard brings that stack back, and this time the results come back too. (Making the lesson in the Maker needs the internet; the lesson file does not.)";

const R_LEAD =
  "**Stackyard turns one sentence into a lesson file the teacher hands to the class.** The lesson is the file: it plays offline, it edits itself, and the pupils' results come back to her as short codes she types in, with no internet, no accounts and no server. HyperCard gave a teacher a stack she could hand on; Stackyard brings that stack back, and this time the results come back too. (The Maker, where you make the lesson, needs the internet; only the file works offline.)";

describe("TASK-40a: the write-up leads with R1", () => {
  it("TASK-40a line 5 is the R1 lead; the video link is line 7 and the note line 9", () => {
    const lines = writeup.split("\n");
    expect(lines[2]).toBe("Category: Resurrection (HyperCard, 1987)");
    expect(lines[3]).toBe("");
    expect(lines[4]).toBe(W_LEAD);
    expect(lines[5]).toBe("");
    expect(lines[6]).toMatch(/^Video \(public, AI disclosure set on YouTube, v8b uploaded 10\.11\): https:\/\/youtu\.be\/x6W2BzhpAyU$/);
    expect(lines[7]).toBe("");
    expect(lines[8]).toMatch(/^The video \(v8b\) was recorded on the live app/);
  });

  it("TASK-40a Inspiration and What it does are unchanged", () => {
    expect(writeup).toContain("## Inspiration\nIn 1987 HyperCard let a teacher who couldn't code build a clickable stack of cards for tomorrow's lesson.");
    expect(writeup).toContain("- Class results without a server: each pupil's last card shows a short code with a check letter");
  });
});

describe("TASK-40b: the write-up's Where it sits names the 2026 field", () => {
  const section = writeup.slice(writeup.indexOf("## Where it sits"), writeup.indexOf("## How we built it"));
  const paras = section.split("\n").filter((l) => l.trim().length > 0 && !l.startsWith("##"));

  it("TASK-40b has four paragraphs, separated by blank lines", () => {
    expect(paras).toHaveLength(4);
    expect(section.replace(/^## Where it sits\n/, "").trim().split("\n\n")).toHaveLength(4);
  });

  it("TASK-40b paragraph 1 names the play-only HTML export entry", () => {
    expect(paras[0]).toBe(
      "Other Kiroween 2026 entries revive HyperCard's editor too. At least one builds a stack from a description, and another exports a stack as one play-only HTML file. AfterStack is itself one offline page with a form editor; we found no AI generation or self-saving copy in it. Caramel, made by two teachers, turns a subject, level and objective into H5P activities that need a host or Lumi.",
    );
  });

  it("TASK-40b paragraph 2 names the offline single-file lesson tools", () => {
    for (const s of [
      "Handing on one offline lesson file is not new on its own.",
      "Egatari's lesson file plays offline and carries its own source, so it can be reopened in the Egatari Studio editor, edited and saved again.",
      "OpenMAIC (open source) turns a topic or a document into an AI-generated lesson with quizzes and can export it as an offline HTML player.",
      "LessonRemix, a browser studio, exports a lesson with multiple-choice checks as one HTML file that works offline.",
      "Doppel turns product screenshots into a practice lesson with AI-suggested steps and exports it as one self-contained HTML file.",
      "Syllabind, a Claude Code skill, turns a topic into a course and builds it as offline HTML and a PDF.",
      "Decker revives HyperCard's decks and saves one self-contained HTML file that keeps its editor, but it has no AI generation.",
    ]) {
      expect(paras[1], s).toContain(s);
    }
  });

  it("TASK-40b paragraph 3 keeps the old Lumi / H5P / quiz-maker wording exactly", () => {
    expect(paras[2]).toBe(
      "Lumi's desktop app exports most H5P activities as an all-in-one HTML file for teachers, and H5P.com's Smart Import drafts activities from a document, web page, video or at least 500 characters of pasted text, rather than a one-line request. AI quiz makers start from a topic, a document or a link, and either keep the playable quiz on their own platform (Kahoot, Wayground; Wayground also exports printable PDF or DOC worksheets) or hand it to Google Forms or an LMS through an export or a third-party converter; general AI chat tools such as Claude can write a single offline HTML quiz, which arrives without an editor inside unless you ask for one, and nothing in them checks that the class can't get stuck.",
    );
  });

  it("TASK-40b paragraph 4 says what Stackyard puts together, and the old false sentences are gone", () => {
    expect(paras[3]).toBe(
      "Stackyard puts three things together: a lesson built and checked from one teacher's sentence; an editor inside the lesson file itself, whose Save a Copy writes a new file that edits itself too; and the pupils' results coming back to the teacher as short typed codes, with no server. The typed codes are the part we have not seen in the tools above.",
    );
    for (const old of ["Their stacks travel as JSON files or as links back to their tool", "Some AI lesson tools, such as the open-source OpenMAIC", "the closest, AfterStack", "Stackyard brings back the stack you could hand on:"]) {
      expect(writeup, old).not.toContain(old);
    }
  });
});

describe("TASK-40c: the README top leads with R1", () => {
  it("TASK-40c line 5 is the R1 lead; lines 3, 7, 9 and 11 stay", () => {
    const lines = readme.split("\n");
    expect(lines[2]).toBe("Category: Resurrection (HyperCard, 1987)");
    expect(lines[4]).toBe(R_LEAD);
    expect(lines[6]).toBe("Inspired by HyperCard. Built for Kiroween 2026 with Kiro.");
    expect(lines[8]).toMatch(/^\*\*Demo video \(2:55\):\*\*/);
    expect(lines[10]).toMatch(/^\*\*For judges:\*\*/);
    expect(readme).not.toContain("one HTML file you can hand to a class");
  });
});

describe("TASK-40d: the README's Why HyperCard and Prior art", () => {
  const r = FLAT(readme);
  it("TASK-40d Why HyperCard names the play-only export and the results' return trip", () => {
    expect(r).toContain(
      "builds a stack from a plain-English description; another exports a stack as one play-only HTML file; we have not found one that turns a teacher's sentence into a checked lesson file that plays and edits itself offline and brings the class's results back without a server.",
    );
  });

  it("TASK-40d Prior art adds Egatari, then LessonRemix, Doppel and Syllabind, after OpenMAIC", () => {
    const egatari =
      "- **Egatari** turns a lesson into one HTML file that plays offline and carries its own source, so it can be reopened in the Egatari Studio editor, edited and saved again; a chat AI can draft the lesson.";
    const others =
      "- **LessonRemix**, **Doppel** and **Syllabind** also export offline single-file lessons: LessonRemix from a browser studio with multiple-choice checks, Doppel from product screenshots with AI-suggested steps, Syllabind from a topic through a Claude Code skill (offline HTML and a PDF).";
    const lines = readme.split("\n");
    const at = lines.findIndex((l) => l.startsWith("- **OpenMAIC**"));
    expect(lines[at + 1]).toBe(egatari);
    expect(lines[at + 2]).toBe(others);
  });

  it("TASK-40d What we haven't found elsewhere ends with the typed codes", () => {
    expect(r).toContain(
      "What we haven't found elsewhere: **a teacher's sentence → a validated, branching, always-playable stack → direct card editing → one self-contained offline file that can edit itself and save a copy of itself, offline → the class's results back to the teacher as short typed codes, with no server.**",
    );
  });
});

describe("TASK-40e / TASK-40f: CLAIMS.md follows the new text", () => {
  const rows = parseClaimRows(claims);
  const row = (id: string) => rows.find((x) => x.id === id)!;

  it("TASK-40f C9 and C10 quote the new paragraph 1; C15 cites the README only", () => {
    expect(row("C9").quote).toBe("At least one builds a stack from a description");
    expect(row("C10").quote).toBe("we found no AI generation or self-saving copy in it");
    expect(row("C15").refs).toEqual([{ file: "README.md", line: expect.any(Number) }]);
  });

  it("TASK-40f rows C53–C59 carry the new claims with their statuses and files", () => {
    const want: Array<[string, string, "TRUE" | "PARTIAL", string[]]> = [
      ["C53", "another exports a stack as one play-only HTML file", "PARTIAL", ["docs/DEVPOST_WRITEUP.md", "README.md"]],
      ["C54", "Egatari's lesson file plays offline and carries its own source", "TRUE", ["docs/DEVPOST_WRITEUP.md"]],
      ["C55", "LessonRemix, a browser studio, exports a lesson with multiple-choice checks as one HTML file that works offline", "TRUE", ["docs/DEVPOST_WRITEUP.md"]],
      ["C56", "Doppel turns product screenshots into a practice lesson with AI-suggested steps", "TRUE", ["docs/DEVPOST_WRITEUP.md"]],
      ["C57", "Syllabind, a Claude Code skill, turns a topic into a course", "TRUE", ["docs/DEVPOST_WRITEUP.md"]],
      ["C58", "The typed codes are the part we have not seen in the tools above.", "PARTIAL", ["docs/DEVPOST_WRITEUP.md"]],
      ["C59", "plays offline, it edits itself, and the pupils' results come back to her as short codes she types in", "TRUE", ["docs/DEVPOST_WRITEUP.md", "README.md"]],
    ];
    for (const [id, quote, status, files] of want) {
      const x = row(id);
      expect(x.quote, id).toBe(quote);
      expect(x.status, id).toBe(status);
      expect(x.refs.map((f) => f.file), id).toEqual(files);
    }
    // The R1 lead sits on line 5 of both files.
    expect(row("C59").refs).toEqual([{ file: "docs/DEVPOST_WRITEUP.md", line: 5 }, { file: "README.md", line: 5 }]);
  });

  it("TASK-40e: TASK-40g: the two new blog sentences are TRUE: on the live dev.to post since 11 Nov 2026, 14:41 UTC", () => {
    for (const [id, quote] of [["C60", "a few tools now hand you an offline lesson file"], ["C61", "the teacher types the codes into her own copy"]] as const) {
      const x = row(id);
      expect(x.quote).toBe(quote);
      expect(x.refs).toEqual([{ file: "blog" }]);
      expect(x.status).toBe("TRUE");
      expect(x.proof).toBe("on the live dev.to post since 11 Nov 2026, 14:41 UTC (dev.to API edit, checked by hand)");
    }
    expect(claims).not.toContain("not yet on the live post");
  });
});
