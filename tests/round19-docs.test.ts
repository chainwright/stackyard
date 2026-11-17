// tests/round19-docs.test.ts
// TASK-44 (judge round r9, 16–17 Nov 2026). TASK-44a: the git-reading test
// skips in a copy with no .git (a ZIP download, `git archive`) and runs as
// before in a checkout. The coordinator checks a fresh clone and a
// `git archive HEAD` copy outside Kiro; these tests build small throwaway
// repositories in the system temp folder and make no network call.

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gitCheckoutAt, gitGrepHits } from "./helpers/git-checkout.js";
import { countConditionalSkips, skipsByCopy, compareCopyCounts, readCopyCounts, readClaims } from "../scripts/claims-lib.js";

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

// TASK-44b: the AI footage is about 23 s (23.1 s measured by frame in both cuts).
describe("TASK-44b: the AI footage is about 23 s", () => {
  const read = (f: string): string => readFileSync(path.join(ROOT, f), "utf8");
  const flat = (t: string): string => t.replace(/\s+/g, " ");
  const NEW = "about 23 s in seven on-screen windows, eight shots in all";
  const c34 = (): string => read("CLAIMS.md").split("\n").find((l) => l.startsWith("| C34 |"))!;
  const secs = (t: string): number => Number(t.split(":")[0]) * 60 + Number(t.split(":")[1]);
  const windows = (s: string): number[] => s.split(", ").map((w) => { const [a, b] = w.split("–"); return secs(b!) - secs(a!); });

  it("TASK-44b1: the write-up Credits and the README say about 23 s, eight shots in all; the Credits keep the OFFLINE stamp", () => {
    const credits = read("docs/DEVPOST_WRITEUP.md").split("\n").find((l) => l.startsWith("**Credits.**"))!;
    expect(credits).toContain(`AI-generated footage (${NEW})`);
    expect(credits).toContain("the OFFLINE stamp");
    expect(flat(read("README.md"))).toContain(`are AI-generated (${NEW}), each tagged on screen`);
    for (const f of ["README.md", "docs/DEVPOST_WRITEUP.md"]) expect(read(f), f).not.toContain("about 21 s");
  });

  it("TASK-44b2: C34 quotes the new wording, TRUE, with both cuts' frame windows; each cut's seven windows add to 23.1 s", () => {
    const row = c34();
    expect(row).toContain(`| C34 | "${NEW}" |`);
    expect(row).toContain("| TRUE |");
    expect(row).toContain("from the edit timelines beside the repo (`video/v8b/timeline_v8b.json`, `video/v9b/timeline_v9b.json`)");
    expect(row).toContain("2.4 + 3.5 + 1.4 + 5.0 + 1.6 + 4.0 + 2.2 + 3.0 = 23.1 s");
    const v8b = /v8b \(linked\): (.*?)\. v9b: /.exec(row)![1]!;
    const v9b = /v9b: (.*?)\. Each shot/.exec(row)![1]!;
    for (const [name, s] of [["v8b", v8b], ["v9b", v9b]] as const) {
      const w = windows(s);
      expect(w, name).toHaveLength(7);
      expect(Math.round(w.reduce((a, b) => a + b, 0) * 10) / 10, name).toBe(23.1);
    }
    // The eight shot lengths add to the same total.
    expect(Math.round([2.4, 3.5, 1.4, 5.0, 1.6, 4.0, 2.2, 3.0].reduce((a, b) => a + b, 0) * 10) / 10).toBe(23.1);
  });

  it("TASK-44b3: the 21 s lines stay as history with a dated note; no test pins about 21 s as current", () => {
    const spec = read(".kiro/specs/maker/tasks.md");
    expect(spec).toContain('[x] TASK-43e1: **"about 21 s".**');
    expect(spec).toContain("*(17 Nov 2026, TASK-44b: this was wrong. The description's windows are whole seconds, each rounded down");
    expect(read("docs/KIRO_LOG.md")).toContain("add up to 21 s");
    // Built in pieces so this file does not match itself.
    const old = "(about 2" + "1 s in seven";
    for (const f of readdirSync(path.join(ROOT, "tests")).filter((x) => x.endsWith(".ts"))) {
      expect(readFileSync(path.join(ROOT, "tests", f), "utf8"), f).not.toContain(old);
    }
  });
});

// TASK-44c: "Where it sits" names the twin and the trade-off. The sources were
// read by the coordinator outside Kiro; this file reads local files only.
describe("TASK-44c: Where it sits names the twin and the trade-off", () => {
  const read = (f: string): string => readFileSync(path.join(ROOT, f), "utf8");
  const TWIN =
    "Exam Maker: Offline Tests reaches the same outcome with an app on every pupil's phone; ZipGrade and Plickers do it on paper scanned by the teacher's phone. Stackyard trades their automatic collection for no app, no device pairing and no network at all: the cost is that she types one short code per pupil.";
  const URLS = ["https://www.zipgrade.com/", "https://apps.apple.com/sg/app/plickers/id701184049", "https://elearningtoolkit.uwo.ca/tools/Plickers.html"];
  const c74 = (): string => read("CLAIMS.md").split("\n").find((l) => l.startsWith("| C74 |")) ?? "";

  it("TASK-44c1: the twin sentences end the offline-results paragraph in Where it sits, before 'three things together'", () => {
    const w = read("docs/DEVPOST_WRITEUP.md");
    const sits = w.slice(w.indexOf("## Where it sits"), w.indexOf("## How we built it"));
    const ps = sits.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0 && !p.startsWith("##"));
    const at = ps.findIndex((p) => p.startsWith("Class results without the internet are not new on their own either."));
    expect(at).toBeGreaterThanOrEqual(0);
    expect(ps[at]!.endsWith(` and the teacher types or pastes it. ${TWIN}`)).toBe(true);
    expect(ps[at + 1]!.startsWith("Stackyard puts three things together:")).toBe(true);
    expect(w.split(TWIN)).toHaveLength(2);
  });

  it("TASK-44c2: C74 quotes the ZipGrade / Plickers part, PARTIAL, with the three sources; EVIDENCE.md lists them with the date", () => {
    const row = c74();
    expect(row).toContain('| C74 | "ZipGrade and Plickers do it on paper scanned by the teacher\'s phone" | docs/DEVPOST_WRITEUP.md:');
    expect(row).toContain("| PARTIAL | Missing: read on 16 Nov 2026 by the coordinator outside Kiro; we ran neither tool; the Plickers offline line is from a university guide.");
    for (const u of URLS) expect(row, u).toContain(u);
    for (const q of ["Internet connection not required when scanning/grading papers.", "When offline, an instructor is still able to scan students' Plickers cards."]) expect(row, q).toContain(q);
    const ev = read("EVIDENCE.md");
    const src = ev.slice(ev.indexOf("## Sources we cite"), ev.indexOf("## Kiro's limits in this build"));
    for (const u of URLS) expect(src, u).toContain(u);
    expect(src).toContain("ZipGrade, https://www.zipgrade.com/ (read 16 Nov 2026)");
    expect(src).toContain("a university's guide, not Plickers' own page");
  });

  it("TASK-44c3: 74 rows, every line ref still right, and this file reaches no network", () => {
    const claims = read("CLAIMS.md");
    expect(claims.match(/^\| C\d+ \|/gm)).toHaveLength(74);
    // C74's ref names the line that really carries its quote.
    const ref = /docs\/DEVPOST_WRITEUP\.md:(\d+)/.exec(c74())!;
    expect(read("docs/DEVPOST_WRITEUP.md").split("\n")[Number(ref[1]) - 1]).toContain("ZipGrade and Plickers do it on paper scanned by the teacher's phone");
    const src = read("tests/round19-docs.test.ts");
    const net = new RegExp(["\\bfet" + "ch\\(", "https?\\.g" + "et\\(", "new Web" + "Socket"].join("|"));
    expect(src).not.toMatch(net);
    for (const l of src.split("\n").filter((x) => /^import /.test(x))) expect(l).toMatch(/from "(vitest|node:child_process|node:fs|node:os|node:path|\.\/helpers\/git-checkout\.js|\.\.\/scripts\/claims-lib\.js)";$/);
  });
});

// TASK-44d: Caramel's inputs, the commit days behind "about ten days", and C73.
describe("TASK-44d: Caramel, the commit days and C73", () => {
  const read = (f: string): string => readFileSync(path.join(ROOT, f), "utf8");
  const claimRow = (id: string): string => read("CLAIMS.md").split("\n").find((l) => l.startsWith(`| ${id} |`)) ?? "";

  it("TASK-44d1: the write-up gives Caramel's inputs as its page does (activity type, optional course extract), not 'objective'; C11 still matches", () => {
    const w = read("docs/DEVPOST_WRITEUP.md");
    expect(w).toContain("Caramel, made by two teachers, turns a subject, level and activity type (and an optional course extract) into H5P activities that need a host or Lumi.");
    expect(w).not.toContain("level and objective");
    expect(claimRow("C11")).toContain('| C11 | "Caramel, made by two teachers" |');
    const line = Number(/docs\/DEVPOST_WRITEUP\.md:(\d+)/.exec(claimRow("C11"))![1]);
    expect(w.split("\n")[line - 1]).toContain("Caramel, made by two teachers");
  });

  it("TASK-44d2: C43 names the 10 commit days between 30 Oct and 16 Nov and the first commit, and stays TRUE", () => {
    const row = claimRow("C43");
    expect(row).toBe(
      '| C43 | "We built it with Kiro over about ten days." | blog | TRUE | commits on 10 days between 30 Oct and 16 Nov (git log: 30, 31 Oct; 4, 5, 6, 8, 9, 10, 11, 16 Nov), first commit `c68ffc7` |',
    );
    // The listed days are ten, inside the window the proof names. (The days themselves were checked against
    // git log when this was built; a git-reading test here would add one more conditional skip in shallow
    // clones and ZIP copies, which TASK-44e counts.)
    const listed = ["30 Oct", "31 Oct", "4 Nov", "5 Nov", "6 Nov", "8 Nov", "9 Nov", "10 Nov", "11 Nov", "16 Nov"];
    expect(new Set(listed).size).toBe(10);
  });

  it("TASK-44d3: C73 rests only on its own two quotes and URLs, TRUE; C72 is unchanged (PARTIAL)", () => {
    const row = claimRow("C73");
    expect(row).toContain("| TRUE |");
    expect(row).toContain('https://quorum-classroom.github.io/: "The quiz runs on the instructor\'s laptop and classroom network."');
    expect(row).toContain('https://rclasstra.github.io/: "rClassTra turns one laptop into the classroom server"');
    expect(row).toContain("Read on 16 Nov 2026 by the coordinator outside Kiro and re-read by judge round r9; we ran neither.");
    for (const other of ["producthunt.com", "play.google.com", "Missing:"]) expect(row, other).not.toContain(other);
    expect(claimRow("C72")).toContain("| PARTIAL | Missing: from the tools' public pages, read on 16 Nov 2026 by the coordinator outside Kiro;");
  });
});

// TASK-44e: the test counts say what each kind of copy sees.
describe("TASK-44e: test counts by kind of copy", () => {
  const read = (f: string): string => readFileSync(path.join(ROOT, f), "utf8");
  const testSources = (): Array<{ file: string; text: string }> => {
    const out: Array<{ file: string; text: string }> = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".test.ts")) out.push({ file: path.relative(ROOT, p), text: readFileSync(p, "utf8") });
      }
    };
    walk(path.join(ROOT, "tests"));
    return out;
  };

  it("TASK-44e2: the suite's conditional skips, counted from the sources: 4 draft-post, 1 history, 1 git checkout, none unknown (and 1 Chrome suite, apart)", () => {
    const k = countConditionalSkips(testSources());
    expect(k.unknown).toEqual([]);
    expect({ draft: k.draft, history: k.history, git: k.git, chrome: k.chrome }).toEqual({ draft: 4, history: 1, git: 1, chrome: 1 });
    expect(skipsByCopy(k)).toEqual({ fresh: 4, shallow: 5, zip: 6 });
  });

  it("TASK-44e1: the README, JUDGES.md and EVIDENCE.md state T and T−4/4, T−5/5, T−6/6, and no working-copy claim", () => {
    const k = countConditionalSkips(testSources());
    const t = readClaims(read("README.md"))!.tests;
    for (const [f, where] of [["README.md", "README"], ["JUDGES.md", "JUDGES"], ["EVIDENCE.md", "EVIDENCE"]] as const) {
      const text = read(f);
      expect(compareCopyCounts(text, where, t, k).filter((c) => !c.ok), f).toEqual([]);
      expect(readCopyCounts(text).map((c) => c.kind).sort(), f).toEqual(["fresh", "shallow", "zip"]);
      expect(text, f).not.toMatch(/in our working copy/);
    }
    const n = t.toLocaleString("en-US");
    expect(read("README.md")).toContain(`- Tests: **${t}** in the suite (\`npm test\`). In a fresh git clone ${(t - 4).toLocaleString("en-US")} pass and 4 skip: they check our draft posts, which sit beside the repo, not in it.`);
    expect(read("JUDGES.md")).toContain(`# ${n} tests; a fresh git clone: ${(t - 4).toLocaleString("en-US")} pass, 4 skip (draft posts kept beside the repo);`);
    expect(read("EVIDENCE.md")).toContain(`| ${n} tests in the suite (a fresh git clone: ${(t - 4).toLocaleString("en-US")} pass, 4 skip;`);
    // The write-up states only the total.
    expect(read("docs/DEVPOST_WRITEUP.md")).not.toMatch(/ pass, \d+ skip| pass and \d+ skip/);
  });

  it("TASK-44e3: every Phase 29 sub-id is ticked, and no pending placeholder test is left in this file", () => {
    const spec = read(".kiro/specs/maker/tasks.md");
    const phase = spec.slice(spec.indexOf("## Phase 29 - TASK-44:"));
    expect(phase).not.toMatch(/- \[ \] TASK-44/);
    for (const id of ["a1", "a2", "a3", "b1", "b2", "b3", "c1", "c2", "c3", "d1", "d2", "d3", "e1", "e2", "e3"]) expect(phase, id).toContain(`- [x] TASK-44${id}:`);
    // Built in pieces so this line does not match itself.
    const src = read("tests/round19-docs.test.ts");
    expect(src).not.toContain(": pend" + "ing, spec only");
    expect(src).not.toContain("=> pend" + "ing([");
  });
});
