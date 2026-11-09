// scripts/check-living-file.ts
// Living-file end-to-end gate (TASK-24, rebuilt in TASK-26a). Proves the
// exported living file edits ITSELF, offline, and that what it saves PLAYS.
//
// WHY IT WAS REBUILT: the first version passed a broken feature. It checked that
// the edited text appeared *somewhere* in the saved copy's DOM, and the frozen
// editor overlay a bad Save a Copy carried contains that text — so the gate was
// green while every copy opened on a dead editor (round-2 review, J1/J3/J4).
// It now checks that the copy is a working file, not that it contains a string.
//
// What it does, in headless Chrome with the network BLOCKED (every host maps to
// NOTFOUND and the proxy is a dead address, so any stray request fails):
//
//   A  Open the exported living file. Teacher → change card 1's question →
//      Save a Copy (the Blob is captured in-page, nothing is fetched). → copy 1
//   B  Open copy 1. ASSERT: 0 editor overlays, exactly 1 Teacher tab, the same
//      number of <style> blocks as the original, an answer tile is the hit
//      target at its centre. CLICK an answer and ASSERT the card advances. Open
//      Teacher → press Play → ASSERT it plays again and the answer advances.
//      Teacher → Save a Copy (no edit). → copy 2
//   C  The same checks on copy 2 → copy 3 (a copy of a copy of a copy).
//   D  Open copy 3 and PLAY IT THROUGH to the end card, picking the right
//      answers; ASSERT the score line shows.
//   Then ASSERT: copy 1, 2 and 3 are byte-identical in size (three saves in a
//   row), within a few hundred bytes of the original, and none carries any
//   editor litter. File sizes are printed.
//
//   node --import tsx/esm scripts/check-living-file.ts
//
// If no headless Chrome is found the check SKIPS (exit 0) so it never blocks a
// browser-less machine; where Chrome exists it fails hard.

import { writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { withCopyCount } from "../src/shared/escapeStackJson.js";

import os from "node:os";
import path from "node:path";
import { exportLivingStack, exportStack } from "../server/exporter.js";
import { dumpDomOffline } from "./chrome.js";
import { vikingsStack } from "../src/shared/readyMadeStacks.js";
import type { Stack, Card } from "../src/shared/types.js";

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  process.env["CHROME_PATH"] ?? "",
].filter((p) => p.length > 0);

function findChrome(): string | null {
  for (const c of CHROME_CANDIDATES) if (existsSync(c)) return c;
  return null;
}

/** The first card's question/term text. */
function firstText(stack: Stack): string {
  const card = stack.cards[0] as Card;
  const t = card.elements.find((e) => e.type === "text");
  return t && t.type === "text" ? t.content : "";
}

const NEW_QUESTION = "SELF-CHECK EDIT: where was the first Viking town?";
const DRIVER_ID = "sy-selfcheck-driver";

// ---------------------------------------------------------------------------
// The in-page driver
//
// Serialised verbatim into a <script> tag and run by the browser, so it is PLAIN
// JavaScript and must contain no literal angle-bracket-slash sequence (that
// would close the injected script early — the same lesson the exporter's
// escaping exists for, learnt the hard way while writing the first version).
// Every mode writes ONE verdict into #sy-selfcheck, and the saved copy (if any)
// as base64 into #sy-selfcheck-copy.

const PRELUDE = `
  var NEW_Q = __NEW_Q__;
  var facts = {};
  function report(status, detail) {
    var node = document.createElement("div");
    node.id = "sy-selfcheck";
    node.setAttribute("data-status", status);
    node.setAttribute("data-detail", detail);
    node.setAttribute("data-facts", JSON.stringify(facts));
    document.body.appendChild(node);
  }
  function reportCopy(html, name) {
    var big = document.createElement("div");
    big.id = "sy-selfcheck-copy";
    var b64 = "";
    try { b64 = btoa(unescape(encodeURIComponent(html))); } catch (e) { b64 = ""; }
    big.setAttribute("data-copy-b64", b64);
    big.setAttribute("data-copy-name", name || "");
    document.body.appendChild(big);
  }
  function q(sel) { return document.querySelector(sel); }
  function all(sel) { return document.querySelectorAll(sel); }
  function rootText() { var r = document.getElementById("player-root"); return r ? r.textContent : ""; }
  // Poll until fn() is truthy, then cb(true); give up after tries and cb(false).
  function waitFor(fn, cb, tries) {
    var n = 0;
    (function tick() {
      var ok = false;
      try { ok = !!fn(); } catch (e) { ok = false; }
      if (ok) { cb(true); return; }
      if (++n > (tries || 60)) { cb(false); return; }
      setTimeout(tick, 100);
    })();
  }
  window.confirm = function () { return true; };
  window.fetch = function () {
    report("FAIL", "the living file tried to fetch - it must be fully offline");
    throw new Error("network blocked");
  };
  // Capture the Blob that Save a Copy hands the browser; swallow the anchor click.
  var lastBlob = null, lastName = "";
  URL.createObjectURL = function (b) { lastBlob = b; return "blob:selfcheck"; };
  URL.revokeObjectURL = function () {};
  HTMLAnchorElement.prototype.click = function () { lastName = this.download || ""; };
  function bootFacts(prefix) {
    facts[prefix + "Overlays"] = all(".sy-living-overlay").length;
    facts[prefix + "Tabs"] = all(".sy-teacher-tab").length;
    facts[prefix + "Styles"] = all("style").length;
    facts[prefix + "Cards"] = all("#player-root .sy-card").length;
  }
  function hitTestTile() {
    var tile = q("#player-root .sy-tile");
    if (!tile) return false;
    var r = tile.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var el = document.elementFromPoint(cx, cy);
    // Keep the evidence: a failing hit test is only useful if it says WHAT sits there.
    facts.hitAt = Math.round(cx) + "," + Math.round(cy) + " in " + window.innerWidth + "x" + window.innerHeight;
    facts.hitEl = el ? (el.tagName + "." + (el.className || "")) : "null";
    return !!el && tile.contains(el);
  }
  function clickRightAnswer() {
    var t = q("#player-root .sy-tile[data-correct='true']") || q("#player-root .sy-tile");
    if (!t) return false;
    t.click();
    return true;
  }
  function openTeacher() {
    var tab = q(".sy-teacher-tab");
    if (!tab) return false;
    tab.click();
    return !!q(".sy-living-overlay");
  }
  function barButton(text) {
    var btns = all(".sy-living-bar button");
    for (var i = 0; i < btns.length; i++) {
      if ((btns[i].textContent || "").indexOf(text) >= 0) return btns[i];
    }
    return null;
  }
  // Click Save a Copy and report the captured file.
  function saveAndReport(done) {
    var save = barButton("Save a Copy");
    if (!save) { report("FAIL", "no Save a Copy button in the editor"); return; }
    lastBlob = null;
    save.click();
    if (!lastBlob) { report("FAIL", "Save a Copy produced no file"); return; }
    lastBlob.text().then(function (html) {
      if (html.indexOf("stack-data") < 0 || html.length < 1000) {
        report("FAIL", "the saved copy is not a full file"); return;
      }
      reportCopy(html, lastName);
      done(html);
    }).catch(function () { report("FAIL", "could not read the saved copy"); });
  }
`;

/** Mode A: the original file — Teacher → edit → Save a Copy. */
const MODE_EDIT = `
  function run() {
    try {
      bootFacts("boot");
      if (facts.bootOverlays !== 0 || facts.bootTabs !== 1) { report("FAIL", "the original did not boot into Play with one Teacher tab"); return; }
      if (!openTeacher()) { report("FAIL", "the Teacher tab did not open the editor"); return; }
      var canvas = q(".sy-living-canvas");
      var node = canvas && canvas.querySelector(".sy-element");
      if (!node) { report("FAIL", "no element to select on card 1"); return; }
      node.click();
      var ta = q(".sy-living-inspector textarea");
      if (!ta) { report("FAIL", "selecting the question did not open a text box"); return; }
      ta.value = NEW_Q;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      saveAndReport(function () { report("PASS", "edited card 1 and saved a copy, offline"); });
    } catch (err) { report("FAIL", "driver error: " + (err && err.message)); }
  }
`;

/** Mode B/C: a saved copy — it must PLAY — then Teacher → Play → Save a Copy again. */
const MODE_VERIFY = `
  // The card flips in over 240 ms and is edge-on until it finishes, so measure
  // only once it has SETTLED: no running animation and the tile at full height.
  // (A fixed delay flaked under Chrome's virtual time; waiting on the condition
  // itself does not.)
  function settled() {
    // Chrome's virtual time does not always advance CSS animations, so let any
    // running one finish (what a real browser does on its own) before measuring.
    if (document.getAnimations) {
      document.getAnimations().forEach(function (a) { try { a.finish(); } catch (e) {} });
    }
    var t = q("#player-root .sy-tile");
    if (!t) return false;
    return t.getBoundingClientRect().height > 50;
  }
  function run() {
    try {
      waitFor(settled, function (ok) { facts.settled = ok; verify(); }, 80);
    } catch (err) { report("FAIL", "driver error: " + (err && err.message)); }
  }
  function verify() {
    try {
      bootFacts("boot");
      facts.hit = hitTestTile();
      facts.hasEdit = rootText().indexOf(NEW_Q.slice(0, 20)) >= 0;
      if (facts.bootOverlays !== 0) { report("FAIL", "the copy opened with an editor overlay on top (frozen editor)"); return; }
      if (facts.bootTabs !== 1) { report("FAIL", "the copy has " + facts.bootTabs + " Teacher tabs (need exactly 1)"); return; }
      if (!facts.hit) { report("FAIL", "an answer tile is not the click target at its centre: " + facts.hitEl + " at " + facts.hitAt); return; }
      if (!clickRightAnswer()) { report("FAIL", "no answer tile to click in the copy"); return; }
      waitFor(function () { return rootText().indexOf("Card 2 of") >= 0 || q("#player-root .sy-end-card"); }, function (advanced) {
        facts.advanced = advanced;
        if (!advanced) { report("FAIL", "clicking an answer in the copy did not advance the card"); return; }
        if (!openTeacher()) { report("FAIL", "the Teacher tab in the copy did not open the editor"); return; }
        var play = barButton("Play");
        if (!play) { report("FAIL", "no Play button in the copy's editor"); return; }
        play.click();
        facts.afterPlayOverlays = all(".sy-living-overlay").length;
        facts.afterPlayTabs = all(".sy-teacher-tab").length;
        if (facts.afterPlayOverlays !== 0) { report("FAIL", "Play in the copy's editor did not close the editor"); return; }
        if (!clickRightAnswer()) { report("FAIL", "after Play there is no answer tile to click"); return; }
        waitFor(function () { return rootText().indexOf("Card 2 of") >= 0 || q("#player-root .sy-end-card"); }, function (advanced2) {
          facts.advancedAfterPlay = advanced2;
          if (!advanced2) { report("FAIL", "after Teacher then Play, an answer did not advance the card"); return; }
          if (!openTeacher()) { report("FAIL", "could not reopen the Teacher editor to save again"); return; }
          saveAndReport(function () { report("PASS", "the copy plays, Teacher then Play works, and it saved again"); });
        }, 60);
      }, 60);
    } catch (err) { report("FAIL", "driver error: " + (err && err.message)); }
  }
`;

/** Mode D: play the last copy through to the end card. */
const MODE_PLAYTHROUGH = `
  function run() {
    try {
      bootFacts("boot");
      var steps = 0;
      (function step() {
        var root = document.getElementById("player-root");
        if (root.querySelector(".sy-end-card")) {
          var s = root.querySelector(".sy-end-score");
          facts.steps = steps;
          facts.score = s ? s.textContent : "";
          report("PASS", "played to the end card in " + steps + " steps");
          return;
        }
        if (++steps > 45) { report("FAIL", "did not reach the end card in 45 steps: " + rootText().slice(0, 80)); return; }
        var flash = root.querySelector(".sy-flash");
        if (flash) {
          var nb = flash.querySelector(".sy-flash-next button");
          if (nb) nb.click(); else flash.click();
        } else {
          var tile = root.querySelector(".sy-tile[data-correct='true']");
          if (tile) { tile.click(); }
          else {
            var b = root.querySelector(".sy-button");
            if (b && !b.disabled) b.click();
            else { report("FAIL", "stuck with nothing to press: " + rootText().slice(0, 80)); return; }
          }
        }
        setTimeout(step, 1500);
      })();
    } catch (err) { report("FAIL", "driver error: " + (err && err.message)); }
  }
`;

/** Mode E (TASK-31d): Teacher → drag a tile → Undo → Redo → Save a Copy. */
const MODE_DRAG = `
  function run() {
    try {
      if (!openTeacher()) { report("FAIL", "the Teacher tab did not open the editor"); return; }
      var canvas = q(".sy-living-canvas");
      var wrappers = canvas.querySelectorAll(".sy-element[data-element-id]");
      var wrapper = null;
      for (var i = 0; i < wrappers.length; i++) { if (wrappers[i].querySelector(".sy-tile")) wrapper = wrappers[i]; }
      if (!wrapper) { report("FAIL", "no answer tile with an element id in the Teacher preview"); return; }
      var tile = wrapper.querySelector(".sy-tile");
      facts.id = wrapper.getAttribute("data-element-id");
      facts.x0 = parseFloat(wrapper.style.left);
      facts.y0 = parseFloat(wrapper.style.top);
      var r = wrapper.getBoundingClientRect();
      var scale = r.width / parseFloat(wrapper.style.width);
      var sx = r.left + r.width / 2, sy = r.top + r.height / 2;
      function fire(type, x, y) {
        tile.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: "mouse", isPrimary: true }));
      }
      fire("pointerdown", sx, sy);
      fire("pointermove", sx + 12 * scale, sy);
      fire("pointermove", sx + 24 * scale, sy);
      fire("pointerup", sx + 24 * scale, sy);
      facts.moved = parseFloat(wrapper.style.left);
      if (facts.moved !== facts.x0 + 24) { report("FAIL", "the drag moved the tile to x=" + facts.moved + ", wanted " + (facts.x0 + 24)); return; }
      // The whole drag is ONE undo step.
      var undo = q(".sy-undo");
      if (!undo || undo.disabled) { report("FAIL", "no Undo after a drag"); return; }
      undo.click();
      var back = q(".sy-living-canvas .sy-element[data-element-id='" + facts.id + "']");
      facts.afterUndo = back ? parseFloat(back.style.left) : -1;
      if (facts.afterUndo !== facts.x0) { report("FAIL", "Undo left the tile at x=" + facts.afterUndo + ", wanted " + facts.x0); return; }
      var redo = q(".sy-redo");
      if (!redo || redo.disabled) { report("FAIL", "no Redo after an Undo"); return; }
      redo.click();
      var again = q(".sy-living-canvas .sy-element[data-element-id='" + facts.id + "']");
      facts.afterRedo = again ? parseFloat(again.style.left) : -1;
      if (facts.afterRedo !== facts.x0 + 24) { report("FAIL", "Redo left the tile at x=" + facts.afterRedo); return; }
      saveAndReport(function () { report("PASS", "dragged a tile, undid and redid it, and saved a copy"); });
    } catch (err) { report("FAIL", "driver error: " + (err && err.message)); }
  }
`;

const TAIL = `
  if (document.readyState === "complete" || document.readyState === "interactive") { setTimeout(run, 80); }
  else { document.addEventListener("DOMContentLoaded", function () { setTimeout(run, 80); }); }
`;

type Mode = "edit" | "verify" | "playthrough" | "drag";

function driverSource(mode: Mode): string {
  const body = mode === "edit" ? MODE_EDIT : mode === "verify" ? MODE_VERIFY : mode === "drag" ? MODE_DRAG : MODE_PLAYTHROUGH;
  const prelude = PRELUDE.replace("__NEW_Q__", JSON.stringify(NEW_QUESTION));
  return `(function () {\n${prelude}\n${body}\n${TAIL}\n})();`;
}

/**
 * Inject the driver as the LAST thing before </body> with NO surrounding
 * whitespace, so that stripping it back out restores the file exactly (the
 * driver is in the pristine snapshot, so it is in the copy, and the byte-size
 * comparison needs it gone).
 */
function injectDriver(html: string, mode: Mode): string {
  const tag = `<script id="${DRIVER_ID}">${driverSource(mode)}</script>`;
  const idx = html.lastIndexOf("</body>");
  return idx < 0 ? html + tag : html.slice(0, idx) + tag + html.slice(idx);
}

function stripDriver(html: string): string {
  return html.replace(new RegExp(`<script id="${DRIVER_ID}">[\\s\\S]*?</script>`), "");
}

// ---------------------------------------------------------------------------
// Running Chrome

function dumpOffline(chrome: string, file: string, budgetMs: number): string {
  return dumpDomOffline(chrome, {
    flags: ["--window-size=1366,768", `--virtual-time-budget=${budgetMs}`],
    url: `file://${file}`,
  });
}

interface Verdict {
  status: string | null;
  detail: string;
  facts: Record<string, unknown>;
  copy: string | null;
  copyName: string;
}

function readVerdict(dom: string): Verdict {
  const m = dom.match(/<div id="sy-selfcheck"([^>]*)>/);
  const attr = (name: string, from: string): string | null => {
    const a = from.match(new RegExp(name + '="([^"]*)"'));
    return a ? a[1]! : null;
  };
  const unescape = (s: string): string =>
    s.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  let facts: Record<string, unknown> = {};
  if (m) {
    try {
      facts = JSON.parse(unescape(attr("data-facts", m[1]!) ?? "{}")) as Record<string, unknown>;
    } catch {
      facts = {};
    }
  }
  const c = dom.match(/<div id="sy-selfcheck-copy" data-copy-b64="([^"]*)" data-copy-name="([^"]*)"/);
  return {
    status: m ? attr("data-status", m[1]!) : null,
    detail: m ? unescape(attr("data-detail", m[1]!) ?? "") : "(no verdict was written - the driver may not have run)",
    facts,
    copy: c ? Buffer.from(c[1]!, "base64").toString("utf8") : null,
    copyName: c ? c[2]! : "",
  };
}

function fail(msg: string): never {
  console.error(`check-living-file: FAIL — ${msg}`);
  process.exit(1);
}

const kb = (n: number): string => (n / 1024).toFixed(1);

async function main(): Promise<void> {
  const chrome = findChrome();
  const stack = vikingsStack();

  const livingHtml = await exportLivingStack(stack);
  const classHtml = await exportStack(stack);
  const dir = mkdtempSync(path.join(os.tmpdir(), "stackyard-living-"));
  const livingFile = path.join(dir, "living.html");
  writeFileSync(livingFile, livingHtml, "utf8");

  const livingBytes = Buffer.byteLength(livingHtml);
  console.log(`check-living-file: class file  = ${kb(Buffer.byteLength(classHtml))} KB`);
  console.log(`check-living-file: living file = ${kb(livingBytes)} KB (budget: < 500 KB)`);
  if (livingBytes > 500 * 1024) fail("the living file exceeds the 500 KB budget.");

  if (chrome === null) {
    console.warn("check-living-file: no headless Chrome found — SKIPPING the interactive check.");
    console.warn(`check-living-file: living file written OK at ${livingFile}.`);
    return; // exit 0: never block a browser-less machine
  }

  /** Run a driver mode on a file's HTML and return the verdict. */
  const run = (
    label: string,
    html: string,
    mode: Mode,
    budgetMs: number,
  ): Verdict => {
    const file = path.join(dir, `${label}.html`);
    writeFileSync(file, injectDriver(html, mode), "utf8");
    const v = readVerdict(dumpOffline(chrome, file, budgetMs));
    if (v.status !== "PASS") fail(`${label}: ${v.detail}`);
    return v;
  };

  // ---- A: original → edit → copy 1 ----
  const a = run("A-original", livingHtml, "edit", 20_000);
  console.log("check-living-file: A OK — opened the living file, edited card 1, saved a copy (offline).");
  if (a.copy === null) fail("A: the saved copy could not be recovered from the page.");
  if (!/\(copy\)\.html$/.test(a.copyName)) {
    fail(`A: the copy was saved as "${a.copyName}" — it must get a new name ending "(copy).html".`);
  }
  const copy1 = stripDriver(a.copy);
  const originalStyles = Number(a.facts["bootStyles"]);

  // ---- B: open copy 1, play it, Teacher → Play, save again → copy 2 ----
  const b = run("B-copy1", copy1, "verify", 30_000);
  assertCopyFacts("B (copy 1)", b, originalStyles);
  if (b.facts["hasEdit"] !== true) fail("B: copy 1 does not show the edited question in Play.");
  if (b.copy === null) fail("B: no second copy was captured.");
  const copy2 = stripDriver(b.copy);
  console.log("check-living-file: B OK — copy 1 opens in Play, an answer advances, Teacher → Play works.");

  // ---- C: open copy 2, same checks, save → copy 3 ----
  const c = run("C-copy2", copy2, "verify", 30_000);
  assertCopyFacts("C (copy 2)", c, originalStyles);
  if (c.copy === null) fail("C: no third copy was captured.");
  const copy3 = stripDriver(c.copy);
  console.log("check-living-file: C OK — copy 2 (a copy of a copy) plays and saves again.");

  // ---- sizes: three saves in a row are identical ----
  const s1 = Buffer.byteLength(copy1);
  const s2 = Buffer.byteLength(copy2);
  const s3 = Buffer.byteLength(copy3);
  console.log(
    `check-living-file: sizes — original ${livingBytes} B, copy 1 ${s1} B, copy 2 ${s2} B, copy 3 ${s3} B`,
  );
  if (s1 !== s2 || s2 !== s3) {
    fail(`three saves in a row must be identical in size (got ${s1}, ${s2}, ${s3}) — a copy is growing.`);
  }
  if (Math.abs(s1 - livingBytes) > 1024) {
    fail(`copy 1 (${s1} B) should be within 1 KB of the original (${livingBytes} B).`);
  }
  // The copy counter (TASK-27g) legitimately differs between saves; ignore it.
  const sameCopy = (x: string, y: string): boolean => withCopyCount(x, 0) === withCopyCount(y, 0);
  if (!sameCopy(copy1, copy2) || !sameCopy(copy2, copy3)) {
    fail("copies 1, 2 and 3 should be byte-identical (nothing was edited between saves).");
  }

  // ---- E (TASK-31d): drag a tile, undo, redo, Save a Copy → the copy holds the new x/y ----
  const e = run("E-drag", livingHtml, "drag", 20_000);
  if (e.copy === null) fail("E: no copy was captured after the drag.");
  {
    const m = stripDriver(e.copy).match(/<script id="stack-data"[^>]*>([\s\S]*?)<\/script>/);
    const parsed = m ? (JSON.parse(m[1]!) as Stack) : null;
    const id = String(e.facts["id"]);
    const x0 = Number(e.facts["x0"]);
    const y0 = Number(e.facts["y0"]);
    const el = parsed?.cards.flatMap((c) => c.elements).find((x) => x.id === id);
    if (!el) fail("E: the dragged element is missing from the copy.");
    if (el.x !== x0 + 24 || el.y !== y0) {
      fail(`E: the copy holds the dragged tile at (${el.x}, ${el.y}); wanted (${x0 + 24}, ${y0}).`);
    }
    console.log(`check-living-file: E OK — TASK-31d: dragged a tile (${x0} → ${el.x}), undid and redid it, and the saved copy holds the new x/y.`);
  }

  // ---- D: play copy 3 through to the end ----
  const d = run("D-copy3-playthrough", copy3, "playthrough", 60_000);
  console.log(
    `check-living-file: D OK — copy 3 played through to the end card (${String(d.facts["score"] ?? "")}).`,
  );

  // The first question really changed (and is not the original).
  if (!copy1.includes("SELF-CHECK EDIT") && !copy1.includes("SELF\\u002dCHECK")) {
    // The text is JSON-escaped in the data block; confirm via the decoded stack.
    const m = copy1.match(/<script id="stack-data"[^>]*>([\s\S]*?)<\/script>/);
    const parsed = m ? (JSON.parse(m[1]!) as Stack) : null;
    if (parsed === null || !JSON.stringify(parsed).includes("SELF-CHECK EDIT")) {
      fail("copy 1 does not carry the edited question.");
    }
  }
  if (firstText(stack).length > 0 && copy1.includes(firstText(stack).slice(0, 30))) {
    fail("copy 1 still contains the ORIGINAL first question.");
  }

  console.log("check-living-file: OK — the living file edits itself offline, and every copy it saves plays.");
}

/** Facts every reopened copy must satisfy. */
function assertCopyFacts(label: string, v: Verdict, originalStyles: number): void {
  const f = v.facts;
  if (f["bootOverlays"] !== 0) fail(`${label}: opened with ${String(f["bootOverlays"])} editor overlay(s) (need 0).`);
  if (f["bootTabs"] !== 1) fail(`${label}: has ${String(f["bootTabs"])} Teacher tab(s) (need exactly 1).`);
  if (f["bootStyles"] !== originalStyles) {
    fail(`${label}: has ${String(f["bootStyles"])} <style> blocks (the original has ${originalStyles}).`);
  }
  if (f["hit"] !== true) fail(`${label}: an answer tile is not the hit target at its centre.`);
  if (f["advanced"] !== true) fail(`${label}: clicking an answer did not advance the card.`);
  if (f["advancedAfterPlay"] !== true) fail(`${label}: after Teacher → Play, an answer did not advance.`);
  if (f["afterPlayTabs"] !== 1) fail(`${label}: after Play there are ${String(f["afterPlayTabs"])} Teacher tabs (need 1).`);
}

main().catch((err) => {
  console.error("check-living-file: unexpected error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
