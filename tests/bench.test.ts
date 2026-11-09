// tests/bench.test.ts
// TASK-33c (.kiro/specs/curriculum-bench/): the curriculum bench, tested on the
// three hand-made caches in tests/fixtures/bench/ (TASK-33c8) with no network
// and no model key.

import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import {
  TEMPLATE_HEAD,
  SOURCE_URL,
  sentenceFor,
  syllables,
  fkGrade,
  wordsOf,
  percentile,
  runPool,
  seededUuids,
  parseCache,
  serialiseCache,
  replayOne,
  recordOne,
  type BenchCache,
  type Objective,
} from "../scripts/bench-lib.js";
import { loadObjectives, loadCaches, replayAll, writeReplay, staleOutputs, toRecord, RECORD_PARALLEL } from "../scripts/bench.js";
import { CHROME, checkFilesOffline } from "../scripts/check-bench-offline.js";
import { parseRequestedCounts } from "../src/shared/requestedCounts.js";
import { LlmUnavailableError } from "../server/llmGateway.js";
import {
  benchSentence,
  compareBench,
  fixBench,
  readBenchClaim,
  readmeBenchLine,
  writeupBenchLine,
  README_BENCH_ANCHOR,
  WRITEUP_BENCH_ANCHOR,
  type BenchNumbers,
} from "../scripts/claims-lib.js";

const ROOT = process.cwd();
const FIXTURES = path.join(ROOT, "tests", "fixtures", "bench");
const objectives = loadObjectives();
const byId = new Map(objectives.map((o) => [o.id, o]));
const fixture = (name: string): BenchCache => parseCache(readFileSync(path.join(FIXTURES, name), "utf8"), name);
const objOf = (c: BenchCache): Objective => byId.get(c.id)!;
const tmp = (): string => mkdtempSync(path.join(os.tmpdir(), "stackyard-bench-test-"));

describe("TASK-33c1: the objectives are the 55 statutory Years 3–5 bullets, verbatim and attributed", () => {
  it("TASK-33c1: 55 rows, unique ids of the form y<year>-<topic>-<n>, years 3–5 (20 / 19 / 16)", () => {
    expect(objectives.length).toBe(55);
    expect(new Set(objectives.map((o) => o.id)).size).toBe(55);
    for (const o of objectives) expect(o.id).toMatch(new RegExp(`^y${o.year}-[a-z-]+-\\d$`));
    const per = (y: number): number => objectives.filter((o) => o.year === y).length;
    expect([per(3), per(4), per(5)]).toEqual([20, 19, 16]);
    expect(byId.get("y4-sound-2")!.outcome).toBe("recognise that vibrations from sounds travel through a medium to the ear");
  });

  it("TASK-33c1: the outcomes are exactly the extracted source text (SHA-256 pinned on 9 Nov)", () => {
    const hash = createHash("sha256").update(objectives.map((o) => o.outcome).join("\n")).digest("hex");
    expect(hash).toBe("1068eef32eed2bea22c44f272727e3436370dd26c76cdf8d968c69e4cbb3bc16");
  });

  it("TASK-33c1: every row names the gov.uk source and the Open Government Licence v3.0", () => {
    for (const o of objectives) {
      expect(o.url).toBe(SOURCE_URL);
      expect(o.source).toBe("National curriculum in England: science programmes of study");
      expect(o.licence).toBe("Open Government Licence v3.0, © Crown copyright 2015");
    }
  });

  it("TASK-33c1: bench/README.md attributes the source as OGL v3.0 requires and says it is not a classroom study", () => {
    const readme = readFileSync(path.join(ROOT, "bench", "README.md"), "utf8");
    expect(readme).toContain("Contains public sector information licensed under the [Open Government Licence v3.0]");
    expect(readme).toContain("© Crown copyright 2015");
    expect(readme).toContain(SOURCE_URL);
    expect(readme).toContain("it is not a classroom study and no teacher or pupil was involved");
  });
});

describe("TASK-33c2: one fixed sentence template", () => {
  it("TASK-33c2: sentenceFor is the template with the verbatim outcome, and asks for 5 quiz and 2 flash cards", () => {
    const s = sentenceFor("notice that light is reflected from surfaces");
    expect(s).toBe("A 5-question quiz, two flash cards and a short choose-your-path story for pupils aged 8 to 10 on this objective: notice that light is reflected from surfaces.");
    for (const o of objectives) expect(parseRequestedCounts(sentenceFor(o.outcome))).toEqual({ quiz: 5, flash: 2 });
  });

  it("TASK-33c2: bench/README.md states the same template word for word", () => {
    const readme = readFileSync(path.join(ROOT, "bench", "README.md"), "utf8");
    expect(readme).toContain(`> ${TEMPLATE_HEAD}&lt;outcome&gt;.`);
  });
});

describe("TASK-33c4: reading level — the syllable counter and the Flesch-Kincaid grade", () => {
  it("TASK-33c4: syllables on known words", () => {
    const cases: Array<[string, number]> = [
      ["the", 1], ["tree", 1], ["make", 1], ["plays", 1], ["jumped", 1], ["turns", 1],
      ["table", 2], ["little", 2], ["boxes", 2], ["places", 2], ["wanted", 2], ["water", 2], ["vapour", 2],
      ["reflected", 3], ["evaporation", 5], ["Pollination!", 4],
    ];
    for (const [w, n] of cases) expect(syllables(w), w).toBe(n);
    expect(wordsOf("Don't stop — it's 2 cards.")).toEqual(["Don't", "stop", "it's", "cards"]);
  });

  it("TASK-33c4: FK grade = 0.39 × words/sentence + 11.8 × syllables/word − 15.59, one decimal; each text is at least one sentence", () => {
    // 8 words, 11 syllables, 1 sentence: 0.39×8 + 11.8×11/8 − 15.59 = 3.755 → 3.8
    expect(fkGrade(["Water turns into vapour when it gets warm."])).toBe(3.8);
    // Two sentences in one text; a label without a full stop is one more.
    const g = fkGrade(["I run. You hop!", "Next Card"]);
    const words = 6, syl = 6, sentences = 3;
    expect(g).toBe(Math.round((0.39 * (words / sentences) + 11.8 * (syl / words) - 15.59) * 10) / 10);
    expect(fkGrade([])).toBe(0);
  });

  it("TASK-33c4: p50 / p90 by nearest rank", () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5);
    expect(percentile([], 50)).toBeNull();
  });
});

describe("TASK-33c4: replay runs the recorded text through the live streaming pipeline, offline and deterministically", () => {
  it("TASK-33c8: the three hand-made caches are in the recorded format, one per real objective", () => {
    expect(readdirSync(FIXTURES).sort()).toEqual(["clean.json", "repeated-card.json", "two-answers.json"]);
    for (const f of readdirSync(FIXTURES)) {
      const c = fixture(f);
      expect(byId.has(c.id), f).toBe(true);
      expect(c.sentence).toBe(sentenceFor(objOf(c).outcome));
    }
  });

  it("TASK-33c4: the clean deck is valid on the first try, has no warnings, the asked-for counts and every card reachable", async () => {
    const c = fixture("clean.json");
    const { result, html } = await replayOne(objOf(c), c);
    expect(result.firstTry).toBe(true);
    expect(result.lessonClean).toBe(true);
    expect(result.warnings).toEqual([]);
    expect([result.quiz, result.flash, result.countsOk]).toEqual([5, 2, true]);
    expect(result.allReachable).toBe(true);
    expect(result.endReachable).toBe(true);
    expect(result.answersPerQuiz).toEqual([4, 4, 4, 4, 4]);
    expect(result.removedRepeats).toBe(0);
    expect(result.fkGrade).toBeTypeOf("number");
    expect(html).not.toBeNull();
    expect(result.fileBytes).toBe(Buffer.byteLength(html!));
    expect(result.file).toBe("files/y4-states-of-matter-3.html");
    expect(html).toContain("sy-teacher-tab"); // a LIVING file
  });

  it("TASK-33c4: the two-answer deck is flagged by the lesson check", async () => {
    const c = fixture("two-answers.json");
    const { result } = await replayOne(objOf(c), c);
    expect(result.firstTry).toBe(true);
    expect(result.lessonClean).toBe(false);
    expect(result.warnings).toEqual(["two-answers"]);
    expect(result.answersPerQuiz).toContain(2);
  });

  it("TASK-33c4: the repeated card is removed by the deck-quality pass, leaving the asked-for 5 quizzes", async () => {
    const c = fixture("repeated-card.json");
    const { result } = await replayOne(objOf(c), c);
    expect(result.removedRepeats).toBe(1);
    expect([result.quiz, result.flash, result.countsOk]).toEqual([5, 2, true]);
    expect(result.lessonClean).toBe(true);
  });

  it("TASK-33c4: a malformed line or a recorded stream failure is NOT a first try, and makes no file", async () => {
    const c = fixture("clean.json");
    const broken = { ...c, raw: c.raw.replace('{"kind":"card","card":{"id":"c4"', '{"kind":"card","card":{"id":"c4"BROKEN') };
    const a = await replayOne(objOf(c), broken);
    expect(a.result.firstTry).toBe(false);
    expect(a.html).toBeNull();
    const failed: BenchCache = { ...c, raw: c.raw.split("\n").slice(0, 4).join("\n") + "\n", streamError: "timeout" };
    const b = await replayOne(objOf(c), failed);
    expect(b.result.firstTry).toBe(false);
    expect(b.result.failure).toBe("the stream failed (timeout)");
  });

  it("TASK-33c4: a cache whose sentence is not the template applied to its objective is stale", async () => {
    const c = fixture("clean.json");
    await expect(replayOne(objOf(c), { ...c, sentence: c.sentence.replace("5-question", "6-question") })).rejects.toThrow(/stale cache/);
  });

  it("TASK-33c4: two replays give byte-identical files and results, and crypto.randomUUID is restored", async () => {
    const caches = loadCaches(FIXTURES, objectives);
    const a = await replayAll(objectives, caches);
    const b = await replayAll(objectives, caches);
    expect(a.recorded).toBe(3);
    expect(a.resultsJson).toBe(b.resultsJson);
    expect([...a.files.keys()]).toEqual([...b.files.keys()]);
    for (const [k, v] of a.files) expect(b.files.get(k)).toBe(v);
    expect(Object.prototype.hasOwnProperty.call(globalThis.crypto, "randomUUID")).toBe(false);
    expect(crypto.randomUUID()).not.toBe(crypto.randomUUID());
    const ids = seededUuids("x");
    for (let i = 0; i < 50; i++) expect(ids()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("TASK-33c4: results.json and RESULTS.md carry the summary, the disclaimer and one row per objective linking its file", async () => {
    const r = await replayAll(objectives, loadCaches(FIXTURES, objectives));
    const res = JSON.parse(r.resultsJson!) as { about: string; summary: Record<string, unknown> };
    expect(res.about).toContain("it is not a classroom study and no teacher or pupil was involved");
    expect(res.summary).toMatchObject({ objectives: 55, recorded: 3, firstTry: 3, lessonClean: 2, countsOk: 3, allReachable: 3, endReachable: 3 });
    expect(res.summary["firstCardMs"]).toEqual({ p50: 1480, p90: 1650 });
    expect(res.summary["totalMs"]).toEqual({ p50: 9650, p90: 11200 });
    expect(r.resultsMd).toContain("it is not a classroom study and no teacher or pupil was involved");
    expect(r.resultsMd).toContain("| Valid lesson file on the first try (no retry, no fallback) | 3 of 55 |");
    expect(r.resultsMd).toContain("[open](files/y4-sound-2.html)");
  });

  it("TASK-33c6: an empty cache is '0 recorded' and writes nothing; results with no cache, or a changed file, are stale", async () => {
    const out = tmp();
    const empty = await replayAll(objectives, loadCaches(path.join(out, "no-cache"), objectives));
    expect(empty.recorded).toBe(0);
    writeReplay(out, empty);
    expect(readdirSync(out)).toEqual([]);
    expect(staleOutputs(out, empty)).toEqual([]);
    writeFileSync(path.join(out, "results.json"), "{}\n");
    expect(staleOutputs(out, empty)).toContain("results.json exists but nothing is recorded");

    rmSync(out, { recursive: true, force: true });
    mkdirSync(out);
    const r = await replayAll(objectives, loadCaches(FIXTURES, objectives));
    writeReplay(out, r);
    expect(readdirSync(path.join(out, "files")).sort()).toEqual(["y3-light-2.html", "y4-sound-2.html", "y4-states-of-matter-3.html"]);
    expect(staleOutputs(out, r)).toEqual([]);
    writeFileSync(path.join(out, "files", "y4-sound-2.html"), "changed");
    expect(staleOutputs(out, r)).toEqual(["files/y4-sound-2.html differs from a fresh replay"]);
    rmSync(out, { recursive: true, force: true });
  });

  it("TASK-33c4: a cache for no objective is refused", () => {
    const dir = tmp();
    writeFileSync(path.join(dir, "x.json"), JSON.stringify({ ...fixture("clean.json"), id: "y9-nothing-1" }));
    expect(() => loadCaches(dir, objectives)).toThrow(/not the cache of any objective/);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("TASK-33c3: recording through the real streaming path (with a fake gateway here)", () => {
  /** A fake clock and a fake gateway that streams `raw` in odd-sized pieces. */
  function fakes(raw: string, fail?: LlmUnavailableError) {
    let t = 1000;
    const now = (): number => t;
    const callStream = async function* (): AsyncGenerator<string, void, unknown> {
      for (let i = 0; i < raw.length; i += 37) {
        t += 25;
        yield raw.slice(i, i + 37);
      }
      if (fail) throw fail;
    };
    return { now, callStream };
  }

  it("TASK-33c3: the cache holds the raw text exactly as streamed, the timings in order, the model and thinking setting", async () => {
    const c = fixture("clean.json");
    const { now, callStream } = fakes(c.raw);
    const rec = await recordOne(objOf(c), { callStream, now, model: "test-model", thinking: "off", recordedAt: "2026-11-09T12:00:00.000Z" });
    expect(rec.raw).toBe(c.raw);
    expect(rec.sentence).toBe(c.sentence);
    expect(rec.streamError).toBeUndefined();
    const t = rec.timings;
    expect(t.firstContentMs).toBe(25);
    expect(t.firstCardMs).not.toBeNull();
    expect(t.firstContentMs!).toBeLessThanOrEqual(t.firstCardMs!);
    expect(t.firstCardMs!).toBeLessThanOrEqual(t.lastCardMs!);
    expect(t.lastCardMs!).toBeLessThanOrEqual(t.totalMs);
    expect([rec.model, rec.thinking]).toEqual(["test-model", "off"]);
    // And it replays to the same deck as the fixture.
    expect((await replayOne(objOf(c), rec)).result.firstTry).toBe(true);
  });

  it("TASK-33c3: a failed stream is recorded as it happened, with no retry", async () => {
    const c = fixture("clean.json");
    const { now, callStream } = fakes(c.raw.slice(0, 400), new LlmUnavailableError("slow", "timeout"));
    let calls = 0;
    const counting = async function* (...a: Parameters<typeof callStream>): AsyncGenerator<string, void, unknown> {
      calls++;
      yield* callStream(...a);
    };
    const rec = await recordOne(objOf(c), { callStream: counting, now, model: "m", thinking: "on", recordedAt: "x" });
    expect(calls).toBe(1);
    expect(rec.streamError).toBe("timeout");
    expect(rec.raw).toBe(c.raw.slice(0, 400));
  });

  it("TASK-33c3: the writer refuses a cache that contains the API key", () => {
    const c = fixture("clean.json");
    expect(() => serialiseCache({ ...c, raw: c.raw + "sk-test-SECRET-123456" }, "sk-test-SECRET-123456")).toThrow(/API key/);
    expect(serialiseCache(c, "sk-test-SECRET-123456")).toContain('"raw"');
  });

  it("TASK-33c3: cached objectives are skipped unless --force; --only narrows", () => {
    const dir = tmp();
    writeFileSync(path.join(dir, "y3-plants-1.json"), "{}");
    expect(toRecord(objectives, dir, false).length).toBe(54);
    expect(toRecord(objectives, dir, true).length).toBe(55);
    expect(toRecord(objectives, dir, false, ["y3-plants-1", "y3-plants-2"]).map((o) => o.id)).toEqual(["y3-plants-2"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("TASK-33c3: at most 3 objectives are recorded at once", async () => {
    expect(RECORD_PARALLEL).toBe(3);
    let running = 0;
    let peak = 0;
    const out = await runPool([...Array(10).keys()], RECORD_PARALLEL, async (i) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5 + (i % 3)));
      running--;
      return i * 2;
    });
    expect(peak).toBe(3);
    expect(out).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
  });

  it("TASK-33c3: without a key, bench:record stops before any call and writes nothing", () => {
    const dir = tmp();
    const env = { ...process.env };
    delete env["STACKYARD_LLM_API_KEY"];
    const r = spawnSync("node", ["--import", "tsx/esm", "scripts/bench.ts", "record", "--cache", dir], { cwd: ROOT, env, encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("bench:record needs STACKYARD_LLM_API_KEY");
    expect(readdirSync(dir)).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe.skipIf(CHROME === undefined)("TASK-33c5: the bench files play offline in headless Chrome", () => {
  it("TASK-33c5: the three fixture decks render, play their first card and make 0 requests", async () => {
    const out = tmp();
    writeReplay(out, await replayAll(objectives, loadCaches(FIXTURES, objectives)));
    const files = readdirSync(path.join(out, "files")).map((f) => path.join(out, "files", f));
    expect(await checkFilesOffline(files, CHROME!)).toEqual([]);
    // And a file that reaches for the network is caught.
    const leak = path.join(out, "leak.html");
    writeFileSync(leak, readFileSync(files[0]!, "utf8").replace("</body>", '<img src="https://example.com/x.png"></body>'));
    const problems = await checkFilesOffline([leak], CHROME!);
    expect(problems.join("\n")).toContain("1 network request(s): https://example.com/x.png");
    rmSync(out, { recursive: true, force: true });
  }, 90_000);
});

describe("TASK-33c7: the bench line is checked by check:claims, in the README and the write-up", () => {
  const b: BenchNumbers = { objectives: 55, firstTry: 47, lessonClean: 41 };
  const readme = `- Floppy test …\n  The ready-made samples in \`samples/\` carry photos, so they are larger.\n\n## Development\n`;
  const writeup = "## Accomplishments\n- A file.\n- The player bundle is 11.9 KB gzipped against a 50 KB budget.\n\n## What we learned\n";

  it("TASK-33c7: the sentence is the one the brief gives", () => {
    expect(benchSentence(b)).toBe(
      "47 of 55 England KS2 science objectives (Years 3–5) became a valid lesson file on the first try; 41 passed our lesson check with no warnings",
    );
    expect(readBenchClaim(readmeBenchLine(b))).toEqual(b);
  });

  it("TASK-33c7: before bench/results.json exists, no line is fine and a line is a failure", () => {
    expect(compareBench(readme, "README", null)).toEqual([]);
    const bad = compareBench(readme + readmeBenchLine(b), "README", null);
    expect(bad.map((c) => c.ok)).toEqual([false]);
  });

  it("TASK-33c7: with results, a missing line, a wrong N or M, or a write-up line without the disclaimer fails", () => {
    expect(compareBench(readme, "README", b).map((c) => c.ok)).toEqual([false]);
    const good = fixBench(readme, b, README_BENCH_ANCHOR, readmeBenchLine);
    expect(compareBench(good, "README", b).every((c) => c.ok)).toBe(true);
    expect(compareBench(good, "README", { ...b, firstTry: 46 }).every((c) => c.ok)).toBe(false);
    expect(compareBench(good, "README", { ...b, lessonClean: 40 }).every((c) => c.ok)).toBe(false);
    expect(compareBench(good, "README", { ...b, objectives: 50 }).every((c) => c.ok)).toBe(false);
    const w = fixBench(writeup, b, WRITEUP_BENCH_ANCHOR, writeupBenchLine);
    expect(compareBench(w, "write-up", b).every((c) => c.ok)).toBe(true);
    const noDisclaimer = w.replace("it is not a classroom study and no teacher or pupil was involved", "it is great");
    expect(compareBench(noDisclaimer, "write-up", b).map((c) => c.name)).toContain("write-up bench line disclaimer");
  });

  it("TASK-33c7: --fix inserts the line after its anchor, then rewrites the numbers in place", () => {
    const inserted = fixBench(readme, b, README_BENCH_ANCHOR, readmeBenchLine);
    const lines = inserted.split("\n");
    expect(lines[lines.findIndex((l) => l.includes(README_BENCH_ANCHOR)) + 1]).toBe(readmeBenchLine(b));
    const w = fixBench(writeup, b, WRITEUP_BENCH_ANCHOR, writeupBenchLine);
    expect(w).toContain("- The player bundle is 11.9 KB gzipped against a 50 KB budget.\n" + writeupBenchLine(b) + "\n");
    const moved = fixBench(inserted, { objectives: 55, firstTry: 50, lessonClean: 44 }, README_BENCH_ANCHOR, readmeBenchLine);
    expect(readBenchClaim(moved)).toEqual({ objectives: 55, firstTry: 50, lessonClean: 44 });
    expect(moved.split(README_BENCH_ANCHOR).length).toBe(2); // not inserted twice
  });

  it("TASK-33c7: the real README and write-up have their anchors, and carry no bench line until bench/results.json exists", () => {
    const realReadme = readFileSync(path.join(ROOT, "README.md"), "utf8");
    const realWriteup = readFileSync(path.join(ROOT, "docs", "DEVPOST_WRITEUP.md"), "utf8");
    expect(realReadme).toContain(README_BENCH_ANCHOR);
    expect(realWriteup).toContain(WRITEUP_BENCH_ANCHOR);
    if (!existsSync(path.join(ROOT, "bench", "results.json"))) {
      expect(readBenchClaim(realReadme)).toBeNull();
      expect(readBenchClaim(realWriteup)).toBeNull();
    }
  });
});
