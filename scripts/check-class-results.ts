// scripts/check-class-results.ts
// TASK-34b7: the class-results gate, in a real browser, offline
// (.kiro/specs/class-results/design.md §7).
//
// The story it proves: three pupils play the same lesson file on three
// laptops with no network. Each reads a results code off the last card. The
// teacher pastes the three codes into the Teacher tab of HER copy and reads
// the class table.
//
//   1-3  The committed Vikings SAMPLE (samples/vikings-in-ireland.html) is
//        opened three times, each a fresh headless Chrome with the network
//        blocked. A plain-JS driver injected into the page plays it through
//        with a different answer pattern each time: all right (and initials
//        "ab"), all wrong, alternate. It reads the code off the end card, and
//        checks that the end card still fits its 800 x 600 card.
//   4    The same sample is opened again as the teacher's file: Teacher, then
//        Class Results. The driver pastes the three codes, written in three
//        different ways, plus the first one again and a code with a typo, and
//        presses Add Codes.
//   Node then checks EVERY number in the table against the answer patterns,
//   and against its own decode of the three codes.
//
// The same mechanism as check-living-file: `--dump-dom` plus a virtual-time
// budget, with no remote-debugging port (so never 9222 or 9224). If no Chrome
// is found it skips (exit 0); where Chrome exists it fails hard.
//
//   node --import tsx/esm scripts/check-class-results.ts

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dumpDomOffline } from "./chrome.js";
import { CHROME_PATH } from "./cdp.js";
import { decodeCode, formatCode, lessonKey, quizCards, type Result } from "../src/shared/resultsCode.js";
import { tally, missedLine } from "../src/shared/classResults.js";
import type { Stack } from "../src/shared/types.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLE = path.join(ROOT, "samples", "vikings-in-ireland.html");
const DRIVER_ID = "sy-results-driver";

function fail(msg: string): never {
  console.error(`check-class-results: FAIL — TASK-34b7: ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// The in-page driver: plain JS, no angle-bracket-slash sequence (it sits
// inside a <script>). It writes one verdict into #sy-verdict.

const PRELUDE = `
  var facts = {};
  function report(status, detail) {
    var node = document.createElement("div");
    node.id = "sy-verdict";
    node.setAttribute("data-status", status);
    node.setAttribute("data-detail", detail);
    node.setAttribute("data-facts", JSON.stringify(facts));
    document.body.appendChild(node);
  }
  function q(sel) { return document.querySelector(sel); }
  function all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  window.confirm = function () { return true; };
  window.fetch = function () { report("FAIL", "the file tried to fetch"); throw new Error("network blocked"); };
  function settle() {
    if (document.getAnimations) document.getAnimations().forEach(function (a) { try { a.finish(); } catch (e) {} });
  }
`;

const PUPIL = `
  function run() {
    var steps = 0, qi = 0;
    (function step() {
      try {
        settle();
        var root = document.getElementById("player-root");
        var end = root.querySelector(".sy-end-card");
        if (end) {
          var input = root.querySelector("[data-testid='results-initials']");
          if (!input) { report("FAIL", "the end card has no initials field"); return; }
          if (INITIALS) { input.value = INITIALS; input.dispatchEvent(new Event("input", { bubbles: true })); }
          var shown = root.querySelector("[data-testid='results-code']");
          if (!shown) { report("FAIL", "the end card shows no results code"); return; }
          var label = q("label[for='" + input.id + "']");
          var card = root.querySelector(".sy-card").getBoundingClientRect();
          var block = root.querySelector(".sy-end-code-block").getBoundingClientRect();
          var again = root.querySelector("[data-testid='play-again']").getBoundingClientRect();
          facts.code = shown.getAttribute("data-code");
          facts.shown = shown.textContent;
          facts.answered = qi;
          facts.labelled = !!label && label.textContent.length > 0;
          facts.fits = end.scrollHeight <= end.clientHeight + 1 && block.bottom <= card.bottom && again.bottom <= card.bottom;
          facts.codeFont = parseFloat(getComputedStyle(shown).fontSize) * (card.height / 600);
          report("PASS", "played to the end card");
          return;
        }
        if (++steps > 60) { report("FAIL", "did not reach the end card"); return; }
        var tile = root.querySelector(".sy-tile");
        if (tile) {
          var right = PATTERN.charAt(qi++) === "R";
          var pick = right ? root.querySelector(".sy-tile[data-correct='true']") : root.querySelector(".sy-tile:not([data-correct])");
          pick.click();
        } else {
          var nb = root.querySelector(".sy-flash-next button");
          var flash = root.querySelector(".sy-flash");
          var b = root.querySelector(".sy-button");
          if (nb) nb.click(); else if (flash) flash.click(); else if (b && !b.disabled) b.click();
          else { report("FAIL", "stuck with nothing to press"); return; }
        }
        setTimeout(step, 1500);
      } catch (err) { report("FAIL", "driver error: " + (err && err.message)); }
    })();
  }
`;

const TEACHER = `
  function run() {
    try {
      var tab = q(".sy-teacher-tab");
      if (!tab) { report("FAIL", "no Teacher tab"); return; }
      tab.click();
      var toggle = q("[data-testid='class-results-toggle']");
      if (!toggle) { report("FAIL", "no Class Results button in the Teacher tab"); return; }
      toggle.click();
      var box = q("[data-testid='results-codes-input']");
      if (!box) { report("FAIL", "the Class results panel did not open"); return; }
      box.value = PASTE;
      q("[data-testid='results-add']").click();
      facts.status = q("[data-testid='results-status']").textContent;
      facts.summary = (q("[data-testid='results-summary']") || {}).textContent || "";
      facts.rows = all("[data-testid='results-questions'] tbody tr").map(function (tr) {
        return Array.prototype.slice.call(tr.querySelectorAll("td")).map(function (td) { return Number(td.textContent); });
      });
      facts.missed = all("[data-testid='results-missed'] li").map(function (li) { return li.textContent; });
      facts.revisit = all("[data-testid='results-revisit'] li").map(function (li) { return Number(li.getAttribute("data-q")); });
      facts.names = all("[data-testid='results-pupils'] tbody th").map(function (th) { return th.textContent; });
      facts.problems = all("[data-testid='results-problems'] li").map(function (li) { return li.textContent; });
      facts.keep = box.value;
      // Save a Copy: capture the Blob the browser would download (nothing is fetched).
      var blob = null;
      URL.createObjectURL = function (b) { blob = b; return "blob:selfcheck"; };
      URL.revokeObjectURL = function () {};
      HTMLAnchorElement.prototype.click = function () {};
      var save = all(".sy-living-bar button").filter(function (b) { return b.textContent === "Save a Copy"; })[0];
      if (!save) { report("FAIL", "no Save a Copy button"); return; }
      save.click();
      facts.toast = (q(".sy-living-toast") || {}).textContent || "";
      if (!blob) { report("FAIL", "Save a Copy produced no file"); return; }
      blob.text().then(function (html) {
        var node = document.createElement("div");
        node.id = "sy-copy";
        node.setAttribute("data-b64", btoa(unescape(encodeURIComponent(html))));
        document.body.appendChild(node);
        report("PASS", "pasted the codes into the Class results panel and saved a copy");
      }).catch(function () { report("FAIL", "could not read the saved copy"); });
    } catch (err) { report("FAIL", "driver error: " + (err && err.message)); }
  }
`;

/** Run 5: the saved copy, reopened: its panel shows the same table without typing anything. */
const REOPEN = `
  function run() {
    try {
      q(".sy-teacher-tab").click();
      q("[data-testid='class-results-toggle']").click();
      facts.status = q("[data-testid='results-status']").textContent;
      facts.rows = all("[data-testid='results-questions'] tbody tr").map(function (tr) {
        return Array.prototype.slice.call(tr.querySelectorAll("td")).map(function (td) { return Number(td.textContent); });
      });
      facts.names = all("[data-testid='results-pupils'] tbody th").map(function (th) { return th.textContent; });
      report("PASS", "reopened the saved copy's Class results panel");
    } catch (err) { report("FAIL", "driver error: " + (err && err.message)); }
  }
`;

const TAIL = `
  if (document.readyState === "complete" || document.readyState === "interactive") { setTimeout(run, 80); }
  else { document.addEventListener("DOMContentLoaded", function () { setTimeout(run, 80); }); }
`;

function inject(html: string, body: string, vars: Record<string, string>): string {
  const decl = Object.entries(vars).map(([k, v]) => `var ${k} = ${JSON.stringify(v).replace(/</g, "\\u003c")};`).join("\n");
  const tag = `<script id="${DRIVER_ID}">(function () {\n${decl}\n${PRELUDE}\n${body}\n${TAIL}\n})();</script>`;
  const at = html.lastIndexOf("</body>");
  return html.slice(0, at) + tag + html.slice(at);
}

interface Verdict { status: string | null; detail: string; facts: Record<string, unknown>; copy: string | null }

function readVerdict(dom: string): Verdict {
  const m = dom.match(/<div id="sy-verdict"([^>]*)>/);
  const attr = (name: string): string | null => {
    const a = m ? m[1]!.match(new RegExp(name + '="([^"]*)"')) : null;
    return a ? a[1]!.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") : null;
  };
  let facts: Record<string, unknown> = {};
  try {
    facts = JSON.parse(attr("data-facts") ?? "{}") as Record<string, unknown>;
  } catch {
    facts = {};
  }
  const c = dom.match(/<div id="sy-copy" data-b64="([^"]*)"/);
  return {
    status: attr("data-status"),
    detail: attr("data-detail") ?? "(no verdict: the driver may not have run)",
    facts,
    copy: c ? Buffer.from(c[1]!, "base64").toString("utf8") : null,
  };
}

function main(): void {
  const sample = readFileSync(SAMPLE, "utf8");
  const m = sample.match(/<script id="stack-data" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) fail("the sample has no stack data");
  const stack = JSON.parse(m[1]!) as Stack;
  const key = lessonKey(stack);
  if (key.n < 2) fail("the Vikings sample needs at least two quiz cards");
  const n = key.n;
  const chrome = CHROME_PATH;
  if (chrome === undefined) {
    console.warn("check-class-results: no headless Chrome found — SKIPPING (TASK-34b7).");
    return;
  }

  const dir = mkdtempSync(path.join(os.tmpdir(), "stackyard-results-"));
  const run = (label: string, body: string, vars: Record<string, string>, budget: number, html = sample): Verdict => {
    const file = path.join(dir, `${label}.html`);
    writeFileSync(file, inject(html, body, vars), "utf8");
    const v = readVerdict(dumpDomOffline(chrome, { flags: ["--window-size=1366,768", `--virtual-time-budget=${budget}`], url: `file://${file}` }));
    if (v.status !== "PASS") fail(`${label}: ${v.detail}`);
    return v;
  };

  try {
    // ---- 1-3: three pupils, three laptops ----
    const pupils: Array<{ pattern: string; initials: string }> = [
      { pattern: "R".repeat(n), initials: "ab" },
      { pattern: "W".repeat(n), initials: "" },
      { pattern: Array.from({ length: n }, (_, i) => (i % 2 === 0 ? "R" : "W")).join(""), initials: "" },
    ];
    const codes: string[] = [];
    pupils.forEach((p, i) => {
      const v = run(`pupil-${i + 1}`, PUPIL, { PATTERN: p.pattern, INITIALS: p.initials }, 60_000);
      const code = String(v.facts["code"]);
      if (v.facts["answered"] !== n) fail(`pupil ${i + 1} answered ${String(v.facts["answered"])} of ${n} quiz cards.`);
      if (v.facts["shown"] !== formatCode(code)) fail(`pupil ${i + 1}: the end card shows "${String(v.facts["shown"])}", not the grouped code.`);
      if (v.facts["labelled"] !== true) fail(`pupil ${i + 1}: the initials field has no label.`);
      if (v.facts["fits"] !== true) fail(`pupil ${i + 1}: the end card with the code no longer fits its card.`);
      if (Number(v.facts["codeFont"]) < 18) fail(`pupil ${i + 1}: the code renders at ${String(v.facts["codeFont"])} px, under the 18 px floor.`);
      const d = decodeCode(code, key);
      if (!d.ok) fail(`pupil ${i + 1}'s code ${code} does not decode (${d.error}).`);
      const want: Result[] = p.pattern.split("").map((c) => (c === "R" ? "right" : "wrong"));
      if (JSON.stringify(d.results) !== JSON.stringify(want)) fail(`pupil ${i + 1}'s code reads ${d.results.join(",")}, but they answered ${p.pattern}.`);
      if (d.initials !== p.initials.toUpperCase()) fail(`pupil ${i + 1}'s code carries initials "${d.initials}".`);
      codes.push(code);
      console.log(`check-class-results: pupil ${i + 1} OK — played offline (${p.pattern}), the end card shows ${formatCode(code)}.`);
    });
    if (new Set(codes).size !== 3) fail("two pupils got the same code.");

    // ---- 4: the teacher pastes them (three ways of writing them, a repeat and a typo) ----
    const typo = codes[2]!.slice(0, 5) + (codes[2]![5] === "A" ? "B" : "A") + codes[2]!.slice(6);
    const paste = [formatCode(codes[0]!), `${formatCode(codes[1]!).replace(/-/g, " ")}   ${codes[2]!.toLowerCase()}`, codes[0]!, typo].join("\n");
    const teacher = run("teacher", TEACHER, { PASTE: paste }, 20_000);
    const t = teacher.facts;

    const expected = tally(stack, codes);
    const problems = (t["problems"] as string[]) ?? [];
    const rows = (t["rows"] as number[][]) ?? [];
    const checks: Array<[string, unknown, unknown]> = [
      ["status", t["status"], "Three pupils counted. One code needs checking."],
      ["summary", t["summary"], `3 pupils · Middle score (median): ${expected.median} of ${n}`],
      ["rows", rows, expected.questions.map((r) => [r.right, r.wrong, r.none])],
      ["rows from the patterns", rows, Array.from({ length: n }, (_, i) => {
        const right = pupils.filter((p) => p.pattern[i] === "R").length;
        return [right, 3 - right, 0];
      })],
      ["missed", t["missed"], expected.questions.filter((r) => r.wrong > 0).map((r) => missedLine(r, 3))],
      ["revisit", t["revisit"], expected.revisit],
      ["names", t["names"], ["AB", "Pupil 2", "Pupil 3"]],
      ["problems", problems, [`${codes[0]} — Same code as one above — counted once.`, `${typo} — Check the code; one letter looks wrong.`]],
      ["what stays in the box", t["keep"], typo],
    ];
    for (const [what, got, want] of checks) {
      if (JSON.stringify(got) !== JSON.stringify(want)) fail(`teacher: ${what} is ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}.`);
    }
    if (quizCards(stack).length !== n) fail("the quiz count moved.");
    console.log(`check-class-results: teacher OK — 3 pupils, middle score ${expected.median} of ${n}, revisit ${expected.revisit.map((x) => "Q" + x).join(" ") || "none"}; the repeat counted once and the typo was caught.`);

    // ---- 5: Save a Copy kept the codes; the reopened copy shows the same table ----
    if (!/^Saved a copy with three results codes: /.test(String(t["toast"]))) fail(`teacher: Save a Copy said "${String(t["toast"])}".`);
    const copy = teacher.copy;
    if (copy === null) fail("teacher: the saved copy could not be recovered from the page.");
    const clean = copy.replace(new RegExp(`<script id="${DRIVER_ID}">[\\s\\S]*?</script>`), "");
    const block = clean.match(/<script id="class-results" type="application\/json">(\[[^<]*\])<\/script>/);
    if (!block || JSON.stringify(JSON.parse(block[1]!)) !== JSON.stringify(codes)) fail("teacher: the copy does not keep exactly the three codes.");
    const r = run("reopened-copy", REOPEN, {}, 20_000, clean).facts;
    if (r["status"] !== "Three pupils counted.") fail(`reopened copy: status is "${String(r["status"])}".`);
    if (JSON.stringify(r["rows"]) !== JSON.stringify(rows)) fail("reopened copy: the table differs from the one it was saved with.");
    if (JSON.stringify(r["names"]) !== JSON.stringify(["AB", "Pupil 2", "Pupil 3"])) fail("reopened copy: the pupil names differ.");
    console.log("check-class-results: copy OK — Save a Copy kept the three codes, and the reopened copy shows the same table.");
    console.log("check-class-results: OK — TASK-34b7: three offline plays, three codes, one class table, nothing sent anywhere.");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main();
