// tests/round18-docs.test.ts
// TASK-43c, d, e (judge round r8, 16 Nov 2026): overstated lines made exact,
// the offline-results tools named in "Where it sits", two unbacked figures and
// a name. The tools' pages and the live dev.to post were read by the
// coordinator's side outside Kiro; these tests read local files only.

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  parseClaimRows,
  compareClaimsTable,
  compareBench,
  readBenchClaim,
  readBenchSplit,
  benchSentence,
  compareMutationLog,
  newestMutationLog,
} from "../scripts/claims-lib.js";

const ROOT = path.resolve(__dirname, "..");
const read = (f: string): string => readFileSync(path.join(ROOT, f), "utf8");
const readOrNull = (p: string): string | null => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
};
const W = (): string => read("docs/DEVPOST_WRITEUP.md");
const R = (): string => read("README.md");
const E = (): string => read("EVIDENCE.md");
const rows = (): ReturnType<typeof parseClaimRows> => parseClaimRows(read("CLAIMS.md"));
const row = (id: string): ReturnType<typeof parseClaimRows>[number] => rows().find((r) => r.id === id)!;
/** The "## heading" section of a markdown text, up to the next "## ". */
const section = (text: string, heading: string): string => {
  const at = text.indexOf(`\n${heading}\n`);
  expect(at, heading).toBeGreaterThanOrEqual(0);
  const rest = text.slice(at + heading.length + 2);
  const end = rest.indexOf("\n## ");
  return end < 0 ? rest : rest.slice(0, end);
};

const C1 =
  "Stackyard's steering, specs and most of its code were written in Kiro CLI; an AI coordinator working outside Kiro wrote the task briefs and set up CI and hosting ([what Kiro did not do](EVIDENCE.md#kiros-limits-in-this-build)). One claim per row, and where to look.";
const MUTANTS = "118 of 118 killed in the newest logged run (10 Nov, commit a215331; not re-run since, and the changes after it have no mutants)";
const BENCH =
  "In a replay through today's generator of 55 recordings, one per England KS2 science objective (Years 3–5; 34 re-recorded with the v5 prompt, 21 from the earlier v2 prompt), 54 became a valid lesson file on the first try; 37 passed our automatic lesson check with no warnings";
const C4 =
  "Kiro wrote each feature's requirements, design and tasks from a chat request. The exporter and Maker specs went back to Kiro with our changes before their code, and the class-results spec went back after a read-only AI sub-agent's review found two P0s; the first spec, the stack generator, went straight to code.";
const C5 =
  "The other HyperCard revivals we read in this contest bring back the editor, and one also exports a play-only file; Stackyard hands on a file that edits itself and brings the class's results back.";
const D1 =
  "Class results without the internet are not new on their own either. Exam Maker: Offline Tests, an Android app, shares a test by QR code or Nearby sharing and gives the teacher the results (its Google Play page now calls it Exam Maker: Online Tests). Quorum Classroom and rClassTra run the quiz from the teacher's laptop over the classroom network. Stackyard needs no app, no local network and no server: each pupil's last card shows a short code that ends in a check character, and the teacher types or pastes it.";
const URLS = [
  "https://www.producthunt.com/products/exam-maker-offline-tests",
  "https://play.google.com/store/apps/details?id=com.abhi.examzy",
  "https://quorum-classroom.github.io/",
  "https://rclasstra.github.io/",
];

describe("TASK-43c: five overstated lines", () => {
  it("TASK-43c1: README 'Built with Kiro' says who wrote what, links Kiro's limits once, and the anchor resolves", () => {
    const s = section(R(), "## Built with Kiro");
    expect(s).toContain(C1);
    expect(R()).not.toContain("Stackyard was planned and built in Kiro.");
    expect(R()).not.toContain("What Kiro did not do here is in");
    expect(s.match(/EVIDENCE\.md#kiros-limits-in-this-build/g)).toHaveLength(1);
    // GitHub's slug of "## Kiro's limits in this build".
    const slug = (h: string): string => h.toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-");
    const heads = E().split("\n").filter((l) => l.startsWith("## ")).map((l) => slug(l.slice(3)));
    expect(heads).toContain("kiros-limits-in-this-build");
    // What the sentence says is what EVIDENCE.md says.
    expect(E()).toContain("The coordinator, an AI agent working outside Kiro, wrote the task briefs, recorded the bench runs, installed CI and keep-warm");
  });

  it("TASK-43c2: the mutant run is dated in the write-up and EVIDENCE.md; no mutant names a task after TASK-37; C19 and C50 are PARTIAL", () => {
    expect(W()).toContain(MUTANTS);
    expect(E()).toContain("`docs/mutation-runs/2026-11-10-a215331.log` (clean tree; 10 Nov, commit a215331; not re-run since, and the changes after it have no mutants)");
    const src = read("scripts/mutation-check.ts");
    const tasks = [...src.matchAll(/TASK-(\d+)/g)].map((m) => Number(m[1]));
    expect(Math.max(...tasks)).toBeLessThanOrEqual(37);
    const logs = readdirSync(path.join(ROOT, "docs/mutation-runs")).filter((f) => f.endsWith(".log")).sort();
    expect(logs[logs.length - 1]).toBe("2026-11-10-a215331.log");
    for (const id of ["C19", "C50"]) {
      expect(row(id).status, id).toBe("PARTIAL");
      expect(row(id).proof, id).toContain("Missing: a run at the submitted commit; mutants for the changes after 10 Nov");
    }
    expect(row("C19").quote).toBe(MUTANTS);
    expect(row("C50").quote).toBe("In the last logged run, all 118 were caught.");
  });

  it("TASK-43c2: check:claims fails a dated run whose date or commit is not the newest log's (not weakened: the count and hash checks stay)", () => {
    const d = path.join(ROOT, "docs/mutation-runs");
    const log = newestMutationLog(readdirSync(d).filter((f) => f.endsWith(".log")).map((f) => ({ file: f, text: readFileSync(path.join(d, f), "utf8") })))!;
    const sha = createHash("sha256").update(read("scripts/mutation-check.ts")).digest("hex");
    expect(compareMutationLog(W(), "write-up", log, sha).filter((c) => !c.ok)).toEqual([]);
    const dated = compareMutationLog(W(), "write-up", log, sha).find((c) => c.name.includes("date and commit"));
    expect(dated?.ok).toBe(true);
    const bad = (t: string): string[] => compareMutationLog(t, "x", log, sha).filter((c) => !c.ok).map((c) => c.name);
    expect(bad(W().replace("(10 Nov, commit a215331;", "(16 Nov, commit a215331;"))).toEqual(["x mutation run date and commit"]);
    expect(bad(W().replace("(10 Nov, commit a215331;", "(10 Nov, commit 98fb45d;"))).toEqual(["x mutation run date and commit"]);
    expect(bad(W().replace("118 of 118 killed", "117 of 117 killed"))).toEqual(["x mutants killed vs docs/mutation-runs"]);
    expect(bad(W())).toEqual([]);
    expect(compareMutationLog(W(), "x", log, "0".repeat(64)).some((c) => !c.ok)).toBe(true);
  });

  it("TASK-43c3: the bench line says it is a replay (34 v5 recordings, 21 v2) in the README, the write-up and EVIDENCE.md, and C27's quote still matches", () => {
    const lower = BENCH.charAt(0).toLowerCase() + BENCH.slice(1);
    expect(R()).toContain(`- Curriculum bench: ${lower} ([\`bench/RESULTS.md\`](bench/RESULTS.md)).`);
    expect(W()).toContain(`- ${BENCH} (\`bench/RESULTS.md\` in the repo, one lesson file per objective).`);
    expect(E()).toContain(`- ${BENCH} (`);
    for (const t of [R(), W(), E()]) expect(t).not.toContain("54 of 55 England KS2 science objectives (Years 3–5) became");
    expect(W()).toContain(row("C27").quote!);
    // The split is the repo's: 34 objectives in bench/rerecord.txt, 55 in the results, and the 34 cache entries recorded after the v2 ones.
    const rerecord = read("bench/rerecord.txt").split("\n").filter((l) => l.trim() !== "" && !l.trim().startsWith("#"));
    expect(rerecord).toHaveLength(34);
    const summary = (JSON.parse(read("bench/results.json")) as { summary: { objectives: number; firstTry: number; lessonClean: number } }).summary;
    expect(summary.objectives).toBe(55);
    expect(summary.objectives - rerecord.length).toBe(21);
    const cache = path.join(ROOT, "bench/cache");
    const late = new Set(
      readdirSync(cache)
        .filter((f) => f.endsWith(".json"))        .map((f) => JSON.parse(readFileSync(path.join(cache, f), "utf8")) as { id: string; recordedAt: string })
        .filter((c) => c.recordedAt.startsWith("2026-11-10"))
        .map((c) => c.id),
    );
    expect([...late].sort()).toEqual([...rerecord].sort());
    // Not "the current prompt": the card plan changed after the v5 recordings (TASK-36c4).
    expect(BENCH).not.toContain("current prompt");
  });

  it("TASK-43c3: the checker still fails when 55, 54 or 37 drift, or when the split does not add up or is not bench/rerecord.txt's", () => {
    const real = { objectives: 55, firstTry: 54, lessonClean: 37, rerecorded: 34 };
    const fails = (text: string, b = real): string[] => compareBench(text, "x", b).filter((c) => !c.ok).map((c) => c.name);
    expect(fails(W())).toEqual([]);
    expect(readBenchClaim(W())).toEqual({ objectives: 55, firstTry: 54, lessonClean: 37 });
    expect(readBenchSplit(W())).toEqual({ recordings: 55, rerecorded: 34, v2: 21 });
    expect(fails(W(), { ...real, firstTry: 53 })).toContain("x bench line");
    expect(fails(W(), { ...real, lessonClean: 36 })).toContain("x bench line");
    expect(fails(W(), { ...real, objectives: 56 })).toContain("x bench line");
    expect(fails(W().replace("21 from the earlier v2 prompt", "20 from the earlier v2 prompt"))).toEqual(["x bench line recordings split"]);
    expect(fails(W(), { ...real, rerecorded: 33 })).toEqual(["x bench line recordings split"]);
    expect(fails("no bench line here")).toEqual(["x bench line"]);
    expect(benchSentence(real)).toBe(BENCH);
  });

  it("TASK-43c4: the write-up says who reviewed each spec, the README's Specs row says it in a few words, and C67 is PARTIAL", () => {
    expect(W()).toContain(C4);
    expect(W()).not.toContain("and we reviewed them:");
    expect(R()).toContain("each written by Kiro from a chat request (we sent the exporter and Maker specs back with changes, and a read-only AI sub-agent reviewed the class-results spec, before their code)");
    expect(R()).not.toContain("from a chat request and then reviewed");
    // The log backs each part.
    const log = read("docs/KIRO_LOG.md");
    expect(log).toContain("We reviewed it like a pull request and sent five fixes back to Kiro");
    expect(log).toContain("Our answers went back as a review round");
    expect(log).toContain("was written first and reviewed by a read-only sub-agent before any code.");
    expect(log).toContain("The review found two P0s, both fixed in the spec before coding.");
    const c67 = row("C67");
    expect(c67.quote).toBe(
      "The exporter and Maker specs went back to Kiro with our changes before their code, and the class-results spec went back after a read-only AI sub-agent's review found two P0s",
    );
    expect(c67.status).toBe("PARTIAL");
    expect(c67.proof).toContain("Missing: the class-results review was an AI sub-agent's, not a person's;");
  });

  it("TASK-43c5: the Inspiration line no longer says 'most revivals bring back the editor' and agrees with Where it sits", () => {
    expect(section(W(), "## Inspiration")).toContain(C5);
    expect(W()).not.toContain("Most HyperCard revivals bring back the editor");
    const sits = section(W(), "## Where it sits");
    expect(sits).toContain("Other Kiroween 2026 entries revive HyperCard's editor too.");
    expect(sits).toContain("another exports a stack as one play-only HTML file");
    for (const id of ["C9", "C10", "C53"]) expect(W()).toContain(row(id).quote!);
  });

  it("TASK-43c6: C45 quotes the live post's sentence, is TRUE, and keeps the 241 dated (check:trace has grown since)", async () => {
    const c45 = row("C45");
    expect(c45.quote).toBe("On 10 Nov all 176 did; on 12 Nov, after more tasks, all 207 do. On 16 Nov, all 241 do.");
    expect(c45.status).toBe("TRUE");
    expect(c45.proof).toContain("`npm run check:trace` (241 of 241 on 16 Nov, at commit 98fb45d;");
    expect(c45.proof).toContain("the live post was edited on 17 Nov, 01:21 UTC, by the coordinator outside Kiro");
    const { declaredIds } = await import("../scripts/check-task-trace.js");
    expect(declaredIds().length).toBeGreaterThan(241);
    expect(read("CLAIMS.md")).toContain("C45 again on 17 Nov 2026, against the live post's public API");
  });

  it("TASK-43c7: the drafts beside the repo carry the new wording and Status lines, keep their old Status text, and the write-up draft follows the body (skips when they are not there)", (ctx) => {
    const up = path.join(ROOT, "..");
    const blog = readOrNull(path.join(up, "BLOG_DRAFT.md"));
    const social = readOrNull(path.join(up, "SOCIAL_DRAFT.md"));
    const writeup = readOrNull(path.join(up, "WRITEUP_DRAFT.md"));
    if (blog === null || social === null || writeup === null) return ctx.skip();
    expect(blog).toContain("Fixing those in the spec took one review round, before any code existed.");
    expect(blog).toContain("In the last logged run, on 10 Nov, all 118 were caught; we have not re-run it on the final commit.");
    expect(blog).not.toContain("took minutes");
    expect(social).toContain("That took one review round.");
    expect(social).not.toContain("minutes instead of days");
    expect(blog).toContain(
      'Status 16.11 (r8): the sentence "On 16 Nov, all 241 do." is LIVE on dev.to (edited 17 Nov 01:21 UTC). The TASK-43c wording (who reviewed, one review round, the dated mutant run) is in this draft only, NOT in the live dev.to post. Status 16.11: TASK-42c lead paragraph',
    );
    expect(social).toContain('Status 16.11 (r8): TASK-43c "one review round" is in this draft only, NOT in the live LinkedIn post. Status 16.11: TASK-42c lead (results first');
    // The live quotes stay in the blog draft: C44's, and C45's dated counts.
    expect(blog).toContain(row("C45").quote!);
    expect(writeup.split("\n").slice(1).join("\n")).toBe(W().split("\n").slice(1).join("\n"));
    for (const bak of ["BLOG_DRAFT_20261116c.bak", "SOCIAL_DRAFT_20261116c.bak", "WRITEUP_DRAFT_20261116c.bak"]) expect(existsSync(path.join(up, bak)), bak).toBe(true);
  });
});

describe("TASK-43d: Where it sits names the offline-results tools", () => {
  it("TASK-43d1: the paragraph sits in Where it sits, right before 'three things together', names the three tools, and the last sentence still holds", () => {
    const sits = section(W(), "## Where it sits");
    const ps = sits.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);
    const at = ps.indexOf(D1);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(ps[at + 1]!.startsWith("Stackyard puts three things together:")).toBe(true);
    expect(ps[at + 1]).toContain("The typed codes are the part we have not seen in the tools above.");
    for (const t of ["Exam Maker: Offline Tests", "Quorum Classroom", "rClassTra", "no app, no local network and no server"]) expect(D1).toContain(t);
    // The last clause is exact: a code ends in one check character, and the panel takes typed or pasted codes.
    expect(read("src/shared/resultsCode.ts")).toContain("fingerprint(3) · play tag(3) · results(K) · initials(3, optional) · check(1)");
    expect(read("src/living/classResults.ts")).toContain("Type or paste the codes from your pupils' last card");
  });

  it("TASK-43d2: README Prior art has one shorter bullet with the same facts", () => {
    const s = section(R(), "## Prior art (and what we haven't found elsewhere)");
    const bullets = s.split("\n").filter((l) => l.startsWith("- **Class results without the internet**"));
    expect(bullets).toHaveLength(1);
    const b = bullets[0]!;
    for (const t of ["Exam Maker: Offline Tests", "Online Tests", "QR code or Nearby sharing", "Quorum Classroom and rClassTra", "no app, no local network and no server"]) expect(b).toContain(t);
    expect(b.length).toBeLessThan(D1.length);
  });

  it("TASK-43d3: C72 and C73 quote the new sentences, PARTIAL, with the four URLs; EVIDENCE.md cites the four pages with the read date; 73 rows", () => {
    for (const id of ["C72", "C73"]) {
      const r = row(id);
      expect(r.status, id).toBe("PARTIAL");
      expect(r.proof, id).toContain(
        "Missing: from the tools' public pages, read on 16 Nov 2026 by the coordinator outside Kiro; the Product Hunt page was read through a fetch summary; its Google Play page now describes online tests; we ran none of them.",
      );
      for (const u of URLS) expect(r.proof, `${id} ${u}`).toContain(u);
      expect(r.refs.map((x) => x.file).sort(), id).toEqual(["README.md", "docs/DEVPOST_WRITEUP.md"]);
    }
    expect(row("C72").quote).toBe("shares a test by QR code or Nearby sharing");
    expect(row("C73").quote).toBe("Quorum Classroom and rClassTra run the quiz from the teacher's laptop over the classroom network");
    expect(rows()).toHaveLength(73);
    const src = section(E(), "## Sources we cite");
    expect(src).toContain("Read on 16 Nov 2026 by our coordinator, outside Kiro");
    for (const u of URLS) expect(src, u).toContain(u);
    expect(src).toContain("read through a fetch tool's summary");
    expect(src).toContain("We ran none of these tools.");
  });

  it("TASK-43d4: this file reaches no network: it imports only local modules", () => {
    const imports = read("tests/round18-docs.test.ts").split("\n").filter((l) => /^import /.test(l));
    for (const l of imports) expect(l).toMatch(/from "(vitest|node:child_process|node:fs|node:crypto|node:path|\.\.\/scripts\/claims-lib\.js)";|^import \{$/);
    // Built from pieces so this line does not match itself.
    const net = new RegExp(["\\bfet" + "ch\\(", "https?\\.g" + "et\\(", "new Web" + "Socket"].join("|"));
    expect(read("tests/round18-docs.test.ts")).not.toMatch(net);
  });

  it("TASK-43d5: every CLAIMS.md line ref for the README and the write-up is right after the insertions", () => {
    const files = { "README.md": R(), "docs/DEVPOST_WRITEUP.md": W() };
    expect(compareClaimsTable(read("CLAIMS.md"), files).filter((c) => !c.ok)).toEqual([]);
    // By hand: each ref's line really carries the quote (not just "somewhere in the file").
    for (const r of rows()) {
      for (const ref of r.refs) {
        if (!("line" in ref) || ref.line === null || !(ref.file in files)) continue; // blog rows have no line in this repo
        const line = files[ref.file as keyof typeof files].split("\n")[ref.line - 1] ?? "";
        expect(line.replace(/\s+/g, " "), `${r.id} ${ref.file}:${ref.line}`).toContain(r.quote!.replace(/\s+/g, " ").slice(0, 50));
      }
    }
  });
});

describe("TASK-43e: two unbacked figures, and a name", () => {
  it("TASK-43e1: about 21 s, the sum of the seven windows the spec lists; C34 is PARTIAL", () => {
    const spec = read(".kiro/specs/maker/tasks.md");
    const listed = /lists seven AI-tagged on-screen windows \(([^)]*)\)/.exec(spec)![1]!;
    const secs = (t: string): number => Number(t.split(":")[0]) * 60 + Number(t.split(":")[1]);
    const sum = listed.split(", ").map((w) => w.split("–")).reduce((a, [s, e]) => a + secs(e!) - secs(s!), 0);
    expect(listed.split(", ")).toHaveLength(7);
    expect(sum).toBe(21);
    expect(W()).toContain("(about 21 s in seven on-screen windows, eight shots in all)");
    expect(R().replace(/\s+/g, " ")).toContain("(about 21 s in seven on-screen windows, eight shots)");
    for (const t of [W(), R()]) expect(t).not.toContain("about 23 s");
    const c34 = row("C34");
    expect(c34.quote).toBe("about 21 s in seven on-screen windows, eight shots in all");
    expect(c34.status).toBe("PARTIAL");
    expect(c34.proof).toContain("Missing: 21 s is the sum of the seven whole-second windows listed in the YouTube description, which itself still says 'about 23 s'; the cut was not re-measured.");
    expect(spec).toContain("*(16 Nov 2026, TASK-43e1: the seven windows listed in the YouTube description add up to 21 s, not 23 s");
  });

  it("TASK-43e2: no unbacked time comparison (minutes vs days) in the README, the write-up, EVIDENCE.md or JUDGES.md", () => {
    for (const f of ["README.md", "docs/DEVPOST_WRITEUP.md", "EVIDENCE.md", "JUDGES.md"]) {
      expect(read(f), f).not.toMatch(/minutes instead of days|took minutes|would have taken days|hours instead of|days instead of/i);
    }
  });

  it("TASK-43e3: no tracked file quotes a draft Status line ending in a person's name", () => {
    // The pattern, not the name: the drafts' Status lines end "post; <Name> decides.".
    let hits = "";
    try {
      hits = execFileSync("git", ["grep", "-n", "-E", "post; [A-Z][a-z]+ decides"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch (err) {
      // git grep exits 1 when nothing matches.
      expect((err as { status?: number }).status).toBe(1);
    }
    expect(hits).toBe("");
  });

  it("TASK-43e4: no hook-firings file is added; C20 and C47 stay PARTIAL", () => {
    expect(existsSync(path.join(ROOT, "docs/kiro-sessions/hook-firings.jsonl"))).toBe(false);
    expect(row("C20").status).toBe("PARTIAL");
    expect(row("C47").status).toBe("PARTIAL");
    expect(read("docs/KIRO_LOG.md")).toContain("`docs/kiro-sessions/hook-firings.jsonl` is not added");
  });
});
