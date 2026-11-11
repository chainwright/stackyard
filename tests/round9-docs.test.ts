// tests/round9-docs.test.ts
// TASK-36a1/a2 (the write-up's video note and the ±3 % decimal-KB size rule),
// TASK-36b1/b2 (the round-3 hound's exact replacements; Swap described) and
// TASK-36c6 (keep-warm vs GitHub's 60-day rule).

import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { compareWriteup, applyWriteupFix, readWriteupClaims, FILE_KB_TOLERANCE, type WriteupNumbers } from "../scripts/claims-lib.js";
import { fixtureLivingExportBytes } from "../scripts/lesson-size.js";

const read = (f: string): string => readFileSync(f, "utf8");
const FLAT = (s: string): string => s.replace(/\s+/g, " ");
const W = (): string => read("docs/DEVPOST_WRITEUP.md");
const R = (): string => FLAT(read("README.md"));

describe("TASK-36a1: the write-up's video note is true", () => {
  it("TASK-36a1: TASK-37c: the video note (now v8b) carries the measured file size, and the v7 caveats are gone", async () => {
    const w = W();
    expect(w).toContain("The video (v8b) was recorded on the live app at commit 4703964:");
    expect(w).not.toContain("It shows 84 of 84 traced task ids");
    expect(w).not.toContain("were added after the video and are not shown in it");
    expect(w).not.toContain("about 185 KB");
    const kb = Math.round((await fixtureLivingExportBytes()) / 1000);
    const claimed = Number(/lesson file is now about (\d+) KB/.exec(w)![1]);
    expect(Math.abs(claimed - kb)).toBeLessThanOrEqual(kb * FILE_KB_TOLERANCE);
    // The player size in that sentence is checked too.
    expect(readWriteupClaims(w).some((c) => c.label === "player KB (… tests and a N KB player)")).toBe(true);
  });
});

describe("TASK-36a2: 'about N KB' is decimal KB at ±3 %", () => {
  it("TASK-36a2: a temp copy of the real write-up with the old 185 fails; the measured value passes; --fix writes it", async () => {
    expect(FILE_KB_TOLERANCE).toBe(0.03);
    const bytes = await fixtureLivingExportBytes();
    const kb = Math.round(bytes / 1000);
    const real = W();
    const traced = Number(/reports (\d+) of \d+ and/.exec(real)![1]);
    const truth: WriteupNumbers = {
      traced,
      tests: Number(/and ([\d,]+) tests/.exec(real)![1]!.replace(/,/g, "")),
      mutants: Number(/(\d+)-mutant script/.exec(real)![1]),
      properties: Number(/(\d+) fast-check properties/.exec(real)![1]),
      kb: Number(/is ([\d.]+) KB gzipped/.exec(real)![1]),
      fileKb: kb,
      floppy: Number(/(\d+) lesson files like the water-cycle/.exec(real)![1]),
    };
    const dir = mkdtempSync(path.join(os.tmpdir(), "writeup-kb-"));
    try {
      const file = path.join(dir, "DEVPOST_WRITEUP.md");
      writeFileSync(file, real.replace(/lesson file is now about \d+ KB/, "lesson file is now about 185 KB"), "utf8");
      const stale = readFileSync(file, "utf8");
      const bad = compareWriteup(stale, truth).filter((c) => !c.ok);
      expect(bad.map((c) => c.name)).toEqual(["write-up lesson file size (about N KB)"]);
      expect(bad[0]!.note).toBe("±3 %, decimal KB (bytes / 1000)");
      const fixed = applyWriteupFix(stale, truth);
      expect(fixed).toContain(`lesson file is now about ${kb} KB`);
      expect(compareWriteup(fixed, truth).filter((c) => !c.ok)).toEqual([]);
      // ±3 % exactly: 3 % off passes, 4 % off fails.
      const at = (n: number): boolean => compareWriteup(real.replace(/lesson file is now about \d+ KB/, `lesson file is now about ${n} KB`), truth).every((c) => c.ok);
      expect(at(Math.ceil(kb * 0.975))).toBe(true);
      expect(at(Math.floor(kb * 0.96))).toBe(false);
      expect(at(Math.ceil(kb * 1.04))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    // The README states no file size, so only the write-up carries the rule.
    expect(R()).not.toMatch(/lesson file is now about \d+ KB/);
    expect(read("scripts/check-claims.ts")).toContain("Math.round(bytes / 1000)");
  });
});

describe("TASK-36b1: the round-3 hound's exact replacements", () => {
  it("TASK-36b1: TASK-38a: TASK-38e: the write-up carries E13, E31, E46, E53 and E62 word for word, E9 and E25 as revised in round 4, and the old wording is gone", () => {
    const w = FLAT(W());
    const want = [
      "(a paid Render instance, so it stays awake)",
      "or ask a chatbot for a one-off HTML quiz with no editor inside it.",
      "Their stacks travel as JSON files or as links back to their tool; the closest, AfterStack, is itself one offline page with a form editor; we found no AI generation or self-saving copy in it.",
      "AI quiz makers start from a topic, a document or a link, and either keep the playable quiz on their own platform (Kahoot, Wayground; Wayground also exports printable PDF or DOC worksheets) or hand it to Google Forms or an LMS through an export or a third-party converter;",
      "The numbers in the README's \"By the numbers\" block are checked by a script, and the pre-submit gate fails if they drift beyond its tolerances (±0.5 KB for the bundle, ±3 % for the file size).",
      "Kiro (CLI, specs, steering, hooks, one custom agent; an MCP server registered in .kiro, run as a script, and its search also called once through Kiro as an MCP tool (10 Nov, docs/kiro-sessions))",
      "the cursor, sounds, labels, the OFFLINE stamp and the network-request badge were added in editing; the badge shows the count from the real recording.",
    ];
    for (const s of want) expect(w, s).toContain(s);
    for (const old of ["the first load can take a few seconds", "she can't easily edit", "Their stacks travel as JSON or as a link back", "(Kahoot, Wayground) or hand", "fails if they drift.", "hooks, agents, MCP)", "the cursor, sounds and the network-request badge"]) {
      expect(w, old).not.toContain(old);
    }
    // E49 is the check:claims key-review line (TASK-36b3).
    expect(w).toContain("An AI review of 60 quiz cards from 12 decks of an earlier bench run (v2) found 0 wrong keys and 2 ambiguous ones; the current run's re-recorded decks have 1 known wrong key (bench/LESSON_CHECKER.md). It is an AI review, not a teacher's.");
  });

  it("TASK-36b1: TASK-38e: the README carries R8, R17 (NecroCard softened in round 4), R20, R25 and R26b", () => {
    const r = R();
    for (const s of [
      "No names or accounts are collected; the only personal detail is up to three optional initials a pupil may choose to type.",
      "Successors like HyperStudio and Decker exist, and another project built for Kiroween 2026 (NecroCard, per its own README) builds a stack from a plain-English description; we have not found one that turns a teacher's sentence into a checked lesson file that plays and edits itself offline.",
      "Lumi's desktop app exports H5P activities as an offline HTML file, but authoring is per content type, and H5P.com's Smart Import drafts from a document, link or long pasted text, not one sentence.",
      "These figures are checked against the code by `scripts/check-claims`, which `npm run pre-submit` and CI run; it fails if a number drifts beyond its tolerance.",
      "An AI review of 60 quiz cards from 12 decks of an earlier bench run (v2) found 0 wrong keys and 2 ambiguous ones; the current run's re-recorded decks have 1 known wrong key (bench/LESSON_CHECKER.md).",
    ]) expect(r, s).toContain(s);
    for (const old of ["No personal data is collected", "(run by the `pre-submit` hook), so the docs can't drift", "we have not found one that starts from a teacher's sentence", "**H5P / Lumi** export", "A read-only AI review of 60"]) {
      expect(r, old).not.toContain(old);
    }
  });
});

describe("TASK-36b2: Swap is described where a reader looks", () => {
  it("TASK-36b2: the write-up's Maker bullet and the README say what Swap does, that it makes no model call and that it is undoable", () => {
    const maker = W().split("\n").find((l) => l.startsWith("- In the Maker she edits any card"))!;
    expect(maker).toContain("Swap replaces a wrong answer she doesn't like (a suspected joke answer is marked) with another answer from the same deck, or one she types: no model call, and one Undo puts it back.");
    expect(R()).toContain("**Swap** replaces a wrong answer the teacher doesn't like (a suspected joke answer is marked) with another answer from the same deck, or one she types. It makes no model call, and it is one undo step.");
  });
});

describe("TASK-36c6: keep-warm survives GitHub's 60-day rule, or says it may not", () => {
  const wf = read("docs/ops/keepalive.yml");
  it("TASK-36c6: docs/ops/keepalive.yml runs monthly and on demand, re-enables keep-warm.yml through the REST API with the job's token, no action, no secrets", () => {
    expect(wf).toMatch(/schedule:\n\s+- cron: "\d+ \d+ 1 \* \*"/);
    expect(wf).toContain("workflow_dispatch:");
    expect(wf).toMatch(/permissions:\n\s+actions: write\n/);
    expect(wf).toContain("-X PUT");
    expect(wf).toContain('"https://api.github.com/repos/${{ github.repository }}/actions/workflows/keep-warm.yml/enable"');
    expect(wf).toContain("GH_TOKEN: ${{ github.token }}");
    expect(wf).not.toMatch(/^\s*-?\s*uses:/m);
    expect(wf).not.toContain("${{ secrets.");
  });

  it("TASK-36c6: TASK-38a: the README's Deploy section keeps keepalive.yml for a free deploy and names the 60-day rule (no second pinger: the instance is paid)", () => {
    const r = R();
    const deploy = r.slice(r.indexOf("### Deploy to Render"));
    expect(deploy).toContain("because GitHub disables scheduled workflows in public repositories after 60 days without activity");
    expect(deploy).toContain("[`docs/ops/keepalive.yml`](docs/ops/keepalive.yml)");
    expect(deploy).not.toContain("second pinger");
  });
});
