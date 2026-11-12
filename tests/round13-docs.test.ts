// tests/round13-docs.test.ts
// TASK-41a–i (judge round r7, the hound seat, 12 Nov 2026): fact fixes in the
// README and the write-up, the play-only class file's size (measured), and the
// CLAIMS.md rows that follow. TASK-41j edits drafts outside the repo.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { parseClaimRows } from "../scripts/claims-lib.js";
import { LESSON_FIXTURE } from "../scripts/lesson-size.js";

const ROOT = path.resolve(__dirname, "..");
const read = (f: string): string => readFileSync(path.join(ROOT, f), "utf8");
const FLAT = (s: string): string => s.replace(/\s+/g, " ");
const W = FLAT(read("docs/DEVPOST_WRITEUP.md"));
const R = FLAT(read("README.md"));
const E = FLAT(read("EVIDENCE.md"));
const row = (id: string) => parseClaimRows(read("CLAIMS.md")).find((r) => r.id === id)!;

/** The old wording must be gone from both public files. */
const gone = (...old: string[]): void => {
  for (const s of old) {
    expect(W, s).not.toContain(s);
    expect(R, s).not.toContain(s);
  }
};

/** Git, or null when it is not available (the test then skips the git part). */
function git(args: string[]): string | null {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

describe("TASK-41a: steering: four files before any code, not six", () => {
  it("TASK-41a the Steering row dates each file, and the old claim is gone", () => {
    expect(W).toContain(
      "| Steering | Six steering files (five always on, one on demand). The first four (product, tech, stack format, audience) were written before any code; the design system came the next day, before the player was styled, and the pre-submit file on 6 Nov.",
    );
    expect(W).toContain("commits `c68ffc7` (the first four, the first commit), `90fa2d8` (design system), `cd20abf` (pre-submit)");
    gone("written before any code. The stack format");
  });

  it("TASK-41a git: the first commit added exactly four steering files", (ctx) => {
    const roots = git(["rev-list", "--max-parents=0", "HEAD"]);
    if (roots === null || roots.trim() === "") return ctx.skip();
    const first = roots.trim().split("\n").pop()!;
    expect(first.startsWith("c68ffc7")).toBe(true);
    const added = git(["show", "--diff-filter=A", "--name-only", "--format=", first])!;
    const steering = added.split("\n").filter((f) => f.startsWith(".kiro/steering/")).sort();
    expect(steering).toEqual([".kiro/steering/audience.md", ".kiro/steering/product.md", ".kiro/steering/stack-format.md", ".kiro/steering/tech.md"]);
    for (const [sha, file] of [["90fa2d8", "design-system.md"], ["cd20abf", "pre-submit.md"]] as const) {
      const files = git(["show", "--diff-filter=A", "--name-only", "--format=", sha]);
      if (files === null) return ctx.skip();
      expect(files, sha).toContain(`.kiro/steering/${file}`);
    }
  });
});

describe("TASK-41b: hooks: four on save, one after shell writes, one never fired", () => {
  it("TASK-41b the six hook files: four PostFileSave, one PostToolUse, one PostTaskExec", () => {
    const dir = path.join(ROOT, ".kiro", "hooks");
    const triggers = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .flatMap((f) => (JSON.parse(readFileSync(path.join(dir, f), "utf8")) as { hooks: Array<{ trigger: string }> }).hooks.map((h) => h.trigger));
    expect(triggers).toHaveLength(6);
    const count = (t: string) => triggers.filter((x) => x === t).length;
    expect([count("PostFileSave"), count("PostToolUse"), count("PostTaskExec")]).toEqual([4, 1, 1]);
  });

  it("TASK-41b the Hooks row says so, keeps the 493 count, and the old sentence is gone", () => {
    expect(W).toContain(
      "| Hooks | Six hooks. Four run the real checks when Kiro saves the files they watch (`PostFileSave`): the stack invariants, a living-file replay in headless Chrome with the network blocked, the ready-made deck check and an export-opens check. A fifth (`PostToolUse`) re-runs the invariants after Kiro writes files through the shell. The sixth, the pre-submit gate (`PostTaskExec`), is not yet recorded firing. Kiro's session store recorded 493 hook firings (5 to 9 Nov; our count from the store, with excerpts in `docs/kiro-sessions/`).",
    );
    gone("Six hooks run the real checks");
  });
});

describe("TASK-41c: class results: how many per question, a row per pupil", () => {
  it("TASK-41c the What it does line says how many, and a row of marks per pupil", () => {
    expect(W).toContain(
      "to see, per question, how many got it right, got it wrong or never reached it, a row of marks for each pupil (by initials if the pupil typed them, otherwise Pupil 1, Pupil 2…), the middle score and what to revisit, with nothing leaving the laptop.",
    );
    gone("who got it right");
  });
});

describe("TASK-41d: joke-answer marker: say it misses most", () => {
  it("TASK-41d both files carry the new parenthesis, and the old one is gone", () => {
    const now = "(our check marks a few likely joke answers but misses most, so read every answer)";
    expect(W).toContain(now);
    expect(R).toContain(now);
    gone("(a suspected joke answer is marked)");
  });
});

describe("TASK-41e: spec reviews: which specs went back", () => {
  it("TASK-41e the Spec vs vibe row names the three that went back and the one that did not", () => {
    expect(W).toContain(
      "and we reviewed them: the exporter, Maker and class-results specs went back to Kiro with changes before their code; the first spec, the stack generator, went straight to code.",
    );
    expect(W).toContain("`docs/KIRO_LOG.md` (30 Oct, 4 Nov, 10 Nov entries); `.kiro/specs/class-results/design.md` (the review's two P0 findings)");
    gone("like pull requests and sent them back");
  });
});

describe("TASK-41f: the CLI row and the coordinator's work outside Kiro", () => {
  it("TASK-41f the CLI row says most of the code and names the coordinator; EVIDENCE has the bullet", () => {
    expect(W).toContain(
      "| CLI | Kiro CLI wrote the steering and specs and most of the code, over many resumed sessions. Our coordinator, an AI agent working outside Kiro, wrote the task briefs, recorded the bench runs, set up CI, keep-warm and hosting, and edited parts of this write-up; that work is logged. | `docs/KIRO_LOG.md` (from 30 Oct); commits marked \"(built in Kiro)\" from TASK-30 (9 Nov) on |",
    );
    expect(E).toContain("**Our coordinator worked outside Kiro.** The coordinator, an AI agent working outside Kiro, wrote the task briefs, recorded the bench runs, installed CI and keep-warm, changed the Render plan and edited parts of the write-up.");
    expect(E).toContain('Commits carry "(built in Kiro)" from TASK-30 (9 Nov) on');
    gone("built almost all of the code", "The few fixes made outside Kiro are logged");
  });
});

describe("TASK-41g: file size: the living file and the play-only class file, both measured", () => {
  it("TASK-41g the play-only class export of the water-cycle fixture is the 149 KB the docs state (±3 %, decimal KB)", async () => {
    const { exportStack } = await import("../server/exporter.js");
    const { sanitizeRawStack, finaliseGeneratedStack } = await import("../server/normalizeGenerated.js");
    const { validate } = await import("../src/shared/validator.js");
    const fx = JSON.parse(readFileSync(LESSON_FIXTURE, "utf8")) as { prompt: string; stack: unknown };
    const v = validate(sanitizeRawStack(fx.stack));
    expect(v.valid).toBe(true);
    if (!v.valid) return;
    const html = await exportStack(finaliseGeneratedStack(v.stack, { prompt: fx.prompt }));
    const kb = Buffer.byteLength(html) / 1000;
    const stated = /the play-only class file of the same lesson is (\d+) KB\./.exec(W);
    expect(stated).not.toBeNull();
    const ev = /\| (\d+) KB \| the play-only class export of the same water-cycle test deck/.exec(E);
    expect(ev).not.toBeNull();
    for (const n of [Number(stated![1]), Number(ev![1])]) expect(Math.abs(n - kb), `${n} vs ${kb}`).toBeLessThanOrEqual(kb * 0.03);
  });

  it("TASK-41g the write-up names the living file's size as the one with the Teacher tab, and check:claims still reads it", () => {
    expect(W).toContain("a generated lesson file is now about 211 KB with its Teacher tab inside; the play-only class file of the same lesson is 149 KB.");
    expect(W).toMatch(/lesson file is now about \d+ KB/);
    expect(E).not.toContain("about 149 KB");
  });
});

describe("TASK-41h: no negative claim about other tools", () => {
  it("TASK-41h the chat-tools clause says what arrives, and the old claim is gone", () => {
    expect(W).toContain("which arrives without an editor inside, or a check that every card leads somewhere, unless you ask for them.");
    gone("nothing in them checks that the class can't get stuck");
  });
});

describe("TASK-41i: CLAIMS.md re-statuses and new rows", () => {
  it("TASK-41i C15, C24, C44, C45, C60 and C61 follow the facts", () => {
    expect(row("C15").status).toBe("TRUE");
    expect(row("C15").proof).toContain("OpenMAIC's README Export table (checked 12 Nov 2026)");
    expect(row("C24").quote).toBe("Kiro CLI wrote the steering and specs and most of the code");
    expect(row("C24").status).toBe("PARTIAL");
    expect(row("C24").proof).toContain("the '(built in Kiro)' mark starts at TASK-30");
    expect(row("C44").quote).toBe("The review of the class-results spec found two serious problems, and its design doc records both.");
    expect(row("C44").status).toBe("TRUE");
    expect(row("C45").quote).toMatch(/^On 10 Nov all 176 did; on 12 Nov, after more tasks, all \d+ do\.$/);
    expect(row("C45").status).toBe("TRUE");
    expect(row("C60").proof).toBe("Egatari, OpenMAIC and LessonRemix export offline lesson files (C54, C15, C55 and their sources)");
    expect(row("C61").proof).toBe("`npm run check:class-results` (three pupils' codes typed into the Teacher tab rebuild the table)");
  });

  it("TASK-41i C45's number is the check:trace count the specs declare", async () => {
    const { declaredIds } = await import("../scripts/check-task-trace.js");
    const n = Number(/all (\d+) do\./.exec(row("C45").quote!)![1]);
    expect(n).toBe(declaredIds().length);
  });

  it("TASK-41i new rows C62–C68, all TRUE", () => {
    const want: Array<[string, string]> = [
      ["C62", "the play-only class file of the same lesson is 149 KB"],
      ["C63", "The first four (product, tech, stack format, audience) were written before any code"],
      ["C64", "how many got it right, got it wrong or never reached it"],
      ["C65", "Four run the real checks when Kiro saves the files they watch"],
      ["C66", "our check marks a few likely joke answers but misses most, so read every answer"],
      ["C67", "the exporter, Maker and class-results specs went back to Kiro with changes before their code"],
      ["C68", "sees how many missed each question"],
    ];
    for (const [id, quote] of want) {
      expect(row(id).quote, id).toBe(quote);
      expect(row(id).status, id).toBe("TRUE");
    }
    expect(row("C68").refs).toEqual([{ file: "blog" }]);
  });
});

describe("TASK-41j: blog and social drafts (outside the repo)", () => {
  const blogPath = path.join(ROOT, "..", "BLOG_DRAFT.md");
  const socialPath = path.join(ROOT, "..", "SOCIAL_DRAFT.md");
  const readOrNull = (p: string): string | null => {
    try {
      return readFileSync(p, "utf8");
    } catch {
      return null;
    }
  };

  it("TASK-41j when the drafts sit beside the repo, they carry the fixed sentences and the current trace count (skips in CI)", async (ctx) => {
    const blog = readOrNull(blogPath);
    const social = readOrNull(socialPath);
    if (blog === null || social === null) return ctx.skip();
    const { declaredIds } = await import("../scripts/check-task-trace.js");
    const n = declaredIds().length;
    for (const s of [
      "A chatbot will write you an HTML quiz, but it arrives without an editor inside, or a check that every card leads somewhere, unless you ask for them.",
      "sees how many missed each question",
      "and we reviewed them; most went back to Kiro with changes. The review of the class-results spec found two serious problems, and its design doc records both.",
      "Across 5–9 November the session store recorded 493 hook firings (our count; excerpts are in the repo's docs/kiro-sessions),",
      `On 10 Nov all 176 did; on 12 Nov, after more tasks, all ${n} do.`,
      "Status 12.11: TASK-41 (judge round r7) fact fixes are in this draft; the coordinator applies them to the live post.",
    ]) {
      expect(blog, s).toContain(s);
    }
    for (const s of [
      "The biggest decisions happened while we argued with Kiro's specs, before the code. The review of our class-results spec found two serious problems while they were still prose.",
      `(${n} of ${n} on 12 Nov)`,
      "Status 12.11: TASK-41 (judge round r7) fact fixes are in this draft; the coordinator applies them to the live post.",
    ]) {
      expect(social, s).toContain(s);
    }
    for (const old of ["nothing checks that the class can't get stuck", "sees who missed which question", "like pull requests and sent them back", "When the hackathon build was done, all 176 did."]) {
      expect(blog, old).not.toContain(old);
    }
    expect(social).not.toContain("(176 of 176)");
    // CLAIMS.md C45 quotes the blog's sentence word for word.
    expect(blog).toContain(row("C45").quote!);
  });
});
