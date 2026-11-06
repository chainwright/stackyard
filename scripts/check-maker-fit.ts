// scripts/check-maker-fit.ts
// TASK-27 c/d/h/w: the MAKER app checked in a real headless Chrome, offline,
// from the built files (jsdom has no layout, so it can't judge any of these).
//
//   - Start screen at the laptop size: the heading is below the top bar, the
//     "Type your own questions" link is fully visible or the area scrolls, and
//     each ready-made deck name appears once.
//   - Editor, quiz card with 3-line answers: the "✓ Right answer" tag does not
//     touch any answer text.
//   - Editor, story card with 4 long choices: no "→ Card N" label overlaps the
//     next choice.
//   - Toolbar: icons are at least 20 px; Export File is one line.
//
//   node --import tsx/esm scripts/check-maker-fit.ts      (builds the Maker to a temp dir)

import { writeFileSync, mkdtempSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { finaliseGeneratedStack } from "../server/normalizeGenerated.js";
import { validate } from "../src/shared/validator.js";
import { dumpDomOffline } from "./chrome.js";
import type { Stack, Card, Element } from "../src/shared/types.js";

const CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  process.env["CHROME_PATH"] ?? "",
].find((p) => p.length > 0 && existsSync(p));

let n = 0;
const id = (): string => `fade0000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;
const t = (content: string): Element => ({ type: "text", id: id(), x: 40, y: 40, w: 720, h: 120, content });
const btn = (label: string, actions: Extract<Element, { type: "button" }>["actions"]): Element => ({
  type: "button", id: id(), x: 0, y: 0, w: 100, h: 50, label, actions,
});
const LONG = [
  "Along the edges of the great tectonic plates under the sea",
  "Because the warm air rises and then cools down again high above",
  "In the deep dark middle of the very biggest ocean on Earth",
  "Short",
];
const THEME = { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" };

function quizDeck(): Stack {
  const end = id();
  const cards: Card[] = [
    { id: id(), kind: "quiz", actions: [], elements: [t("Where do most earthquakes happen on our planet?"), ...LONG.map((a, i) => btn(a, [{ type: "score", delta: i === 0 ? 1 : 0 }]))] },
    { id: end, kind: "end", actions: [], elements: [{ type: "field", id: id(), x: 40, y: 250, w: 720, h: 80, variable: "score" }] },
  ];
  return { id: id(), title: "Quiz", theme: THEME, cards };
}
function storyDeck(): Stack {
  const end = id();
  const next = id();
  const cards: Card[] = [
    {
      id: id(), kind: "story", actions: [],
      elements: [
        t("You reach the harbour at dawn and the whole town is still asleep. What do you do now?"),
        ...LONG.map((a) => btn(a, [{ type: "goto", cardId: next }])),
      ],
    },
    { id: next, kind: "story", actions: [], elements: [t("You made it."), btn("Finish", [{ type: "goto", cardId: end }])] },
    { id: end, kind: "end", actions: [], elements: [{ type: "field", id: id(), x: 40, y: 250, w: 720, h: 80, variable: "score" }] },
  ];
  return { id: id(), title: "Story", theme: THEME, cards };
}
function prepared(s: Stack): Stack {
  const v = validate(JSON.parse(JSON.stringify(s)));
  if (!v.valid) throw new Error("fixture invalid: " + v.errors.join(", "));
  const out = finaliseGeneratedStack(v.stack);
  if (!validate(out).valid) throw new Error("fixture invalid after layout");
  return out;
}

// Plain JS, serialised into a <script>. SEED is the stack (or null = Start screen).
const DRIVER = `
(function () {
  var MODE = __MODE__;
  var problems = [];
  function rect(el) { return el.getBoundingClientRect(); }
  function hit(a, b) { return a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5; }
  function textRect(el) {
    var r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect();
  }
  function check() {
    if (MODE === "start") {
      var h1 = document.querySelector(".start-card h1");
      var bar = document.querySelector(".topbar");
      if (!h1) problems.push("no heading on the Start screen");
      else if (bar && rect(h1).top < rect(bar).bottom - 1) problems.push("the Start heading is hidden under the top bar");
      var area = document.querySelector(".start-area");
      var own = Array.prototype.find.call(document.querySelectorAll("button, a, summary"), function (e) { return /Type your own/i.test(e.textContent || ""); });
      if (!own) problems.push("no 'Type your own questions' control");
      else {
        var r = rect(own), ar = rect(area);
        var scrolls = area.scrollHeight > area.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(area).overflowY);
        if (!scrolls && (r.bottom > ar.bottom + 1 || r.top < ar.top - 1)) problems.push("'Type your own questions' is clipped and the page cannot scroll");
      }
      var names = Array.prototype.map.call(document.querySelectorAll(".ready-made-link"), function (e) { return e.textContent; });
      if (names.length === 0) problems.push("no ready-made deck links");
      if (new Set(names).size !== names.length) problems.push("a ready-made deck is listed twice");
      return;
    }
    var card = document.querySelector(".sy-card");
    if (!card) return false;
    var exp = document.querySelector(".export-btn");
    if (exp && exp.getBoundingClientRect().height > 60) problems.push("Export File wraps onto two lines (" + Math.round(exp.getBoundingClientRect().height) + "px tall)");
    Array.prototype.forEach.call(document.querySelectorAll(".tool-card svg"), function (s) {
      var r = rect(s); if (r.width < 20 || r.height < 20) problems.push("a toolbar icon is squashed to " + Math.round(r.width) + "x" + Math.round(r.height));
    });
    if (MODE === "quiz") {
      var tag = document.querySelector(".right-tag");
      if (!tag) { problems.push("no Right answer tag"); return; }
      var tr = rect(tag);
      Array.prototype.forEach.call(document.querySelectorAll(".sy-tile-label"), function (l) {
        if (hit(tr, textRect(l))) problems.push("the Right answer tag covers answer text: " + (l.textContent || "").slice(0, 30) + " tag=" + JSON.stringify([tr.left|0,tr.top|0,tr.right|0,tr.bottom|0]) + " label=" + JSON.stringify((function(r){return [r.left|0,r.top|0,r.right|0,r.bottom|0];})(textRect(l))));
      });
    }
    if (MODE === "story") {
      var labels = document.querySelectorAll(".branch-label");
      var buttons = document.querySelectorAll(".sy-story-btn");
      if (labels.length === 0) problems.push("no '→ Card N' labels on the story card");
      Array.prototype.forEach.call(labels, function (lab) {
        var lr = rect(lab);
        Array.prototype.forEach.call(buttons, function (bt) { if (hit(lr, rect(bt))) problems.push("a '→ Card N' label overlaps a choice"); });
      });
    }
    return true;
  }
  function finish() {
    var node = document.createElement("div");
    node.id = "mk-fitcheck";
    node.setAttribute("data-vp", window.innerWidth + "x" + window.innerHeight);
    node.setAttribute("data-problems", JSON.stringify(problems));
    document.body.appendChild(node);
  }
  var tries = 0;
  (function poll() {
    tries++;
    var ready = MODE === "start" ? document.querySelector(".start-card h1") : document.querySelector(".sy-card .sy-element");
    if (ready || tries > 60) { setTimeout(function () { if (check() === false) problems.push("the editor never showed a card"); finish(); }, 600); }
    else setTimeout(poll, 100);
  })();
})();
`;

function main(): void {
  if (CHROME === undefined) {
    console.warn("check-maker-fit: no headless Chrome found — SKIPPING the real-browser Maker check.");
    return;
  }
  const out = mkdtempSync(path.join(os.tmpdir(), "stackyard-maker-"));
  execFileSync("npx", ["vite", "build", "--base=./", "--outDir", out, "--emptyOutDir", "--logLevel", "error"], { stdio: "inherit" });
  const indexHtml = readFileSync(path.join(out, "index.html"), "utf8");

  const scenarios: Array<{ name: string; mode: "start" | "quiz" | "story"; stack: Stack | null; win: [number, number] }> = [
    // Window = viewport + 143 px of Chrome: 1366×768 -> a 1366×625 viewport (the hard case).
    { name: "Start screen @1366×768 window", mode: "start", stack: null, win: [1366, 768] },
    { name: "Start screen @1366×911 (768 viewport)", mode: "start", stack: null, win: [1366, 911] },
    { name: "Start screen @1920×1080", mode: "start", stack: null, win: [1920, 1080] },
    { name: "quiz editor @1366×911", mode: "quiz", stack: prepared(quizDeck()), win: [1366, 911] },
    { name: "story editor @1366×911", mode: "story", stack: prepared(storyDeck()), win: [1366, 911] },
  ];
  let failed = false;
  for (const s of scenarios) {
    const seed =
      s.stack === null
        ? `try { localStorage.removeItem("stackyard:maker:v1"); } catch (e) {}`
        : `try { localStorage.setItem("stackyard:maker:v1", ${JSON.stringify(JSON.stringify(s.stack))}); } catch (e) {}`;
    const driver = DRIVER.replace("__MODE__", JSON.stringify(s.mode));
    const idx = indexHtml.indexOf("<script");
    const html = indexHtml.slice(0, idx) + `<script>${seed}</script>` + indexHtml.slice(idx).replace("</body>", `<script>${driver}</script></body>`);
    const file = path.join(out, `check-${s.mode}-${s.win[0]}-${s.win[1]}.html`);
    writeFileSync(file, html, "utf8");
    const dom = dumpDomOffline(CHROME, {
      flags: [`--window-size=${s.win[0]},${s.win[1]}`, "--virtual-time-budget=20000"],
      url: `file://${file}`,
      timeoutMs: 120_000,
    });
    const m = /<div id="mk-fitcheck" data-vp="([^"]*)" data-problems="([^"]*)"/.exec(dom);
    if (!m) {
      console.error(`check-maker-fit: FAIL — ${s.name}: the in-page check never finished.`);
      failed = true;
      continue;
    }
    const problems = JSON.parse(m[2]!.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")) as string[];
    if (problems.length > 0) {
      failed = true;
      console.error(`check-maker-fit: FAIL — ${s.name} (viewport ${m[1]}):`);
      for (const p of problems) console.error("  - " + p);
    } else {
      console.log(`check-maker-fit: OK — ${s.name} (viewport ${m[1]})`);
    }
  }
  if (failed) process.exit(1);
}

main();
