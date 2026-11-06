// scripts/check-text-fit.ts
// Real-browser check that fitted text really fits (TASK-26c). The unit tests
// prove the fit ESTIMATE is consistent; this proves the actual fonts, at the
// sizes the estimate chose, fit the boxes the template gave them.
//
// It builds a deck of the nastiest things a model writes — a 240-character
// question, four long answers, a three-choice story with long choices, a flash
// card with a long term and a long explanation — runs it through the same
// finaliseGeneratedStack the generator uses, exports it, and PLAYS it in headless
// Chrome (network blocked). On every card it measures, in real layout:
//   - no text overflows its box (content height <= box height),
//   - no answer label is clipped inside its tile,
//   - no two elements' rectangles overlap, and nothing sits in the top band,
//   - no text is smaller than the 18 px design floor at the class-laptop scale.
//
//   node --import tsx/esm scripts/check-text-fit.ts
//
// SKIPS (exit 0) when no headless Chrome is found.

import { writeFileSync, mkdtempSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { exportStack } from "../server/exporter.js";
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
const b = (label: string, actions: Element extends infer E ? (E extends { type: "button" } ? E["actions"] : never) : never): Element => ({
  type: "button", id: id(), x: 0, y: 200, w: 300, h: 70, label, actions,
});

const LONG_Q =
  "Long ago, around the year 795, a people from the far north first sailed their longships across " +
  "the cold sea to the coast of Ireland. Which people were they, and what did they want when they came?";
const LONG_A = [
  "They put it in the freezer overnight until it sets hard",
  "Along the edges of the great tectonic plates under the sea",
  "Because the warm air rises and then cools down again high above",
  "Short",
];

function deck(): Stack {
  const end = id();
  const story2 = id();
  const flash = id();
  const quiz2 = id();
  const cards: Card[] = [
    { id: id(), kind: "quiz", actions: [], elements: [t(LONG_Q), ...LONG_A.map((a, i) => b(a, [{ type: "score", delta: i === 0 ? 1 : 0 }]))] },
    {
      id: story2, kind: "story", actions: [],
      elements: [
        t("You reach the harbour at dawn and the whole town is still asleep. The tide is out, the boats lie on their sides in the mud, and a thin smoke rises from one chimney. What do you do now? ".repeat(2)),
        b("Knock on the door of the house with the chimney smoke", [{ type: "goto", cardId: flash }]),
        b("Walk along the harbour wall to look at the boats", [{ type: "goto", cardId: flash }]),
        b("Wait quietly and watch who comes out first", [{ type: "goto", cardId: flash }]),
      ],
    },
    {
      id: flash, kind: "flash", actions: [],
      elements: [
        t("Condensation of water vapour in the cold upper air"),
        t("Condensation is when invisible water vapour cools down high in the sky and turns back into tiny drops of liquid water. Millions of these drops together make a cloud. ".repeat(2)),
        b("Next Card", [{ type: "goto", cardId: quiz2 }]),
      ],
    },
    { id: quiz2, kind: "quiz", actions: [], elements: [t("Question 4: Why?"), b(LONG_A[1]!, [{ type: "score", delta: 1 }]), b(LONG_A[2]!, [{ type: "score", delta: 0 }])] },
    { id: end, kind: "end", actions: [], elements: [{ type: "field", id: id(), x: 40, y: 250, w: 720, h: 80, variable: "score" }] },
  ];
  return {
    id: id(), title: "Long text", theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" },
    cards,
  };
}

// Plain JS, serialised into a <script>: no literal angle-bracket-slash anywhere.
const DRIVER = `
(function () {
  var problems = [];
  var steps = 0;
  function note(msg) { problems.push("card " + (steps + 1) + ": " + msg); }
  function finishAnimations() {
    if (document.getAnimations) document.getAnimations().forEach(function (a) { try { a.finish(); } catch (e) {} });
  }
  function rectOf(el) {
    return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
  }
  function measure() {
    var card = document.querySelector("#player-root .sy-card");
    if (!card) return;
    var els = card.querySelectorAll(".sy-element");
    var rects = [];
    for (var i = 0; i < els.length; i++) {
      var w = els[i], r = rectOf(w);
      rects.push({ r: r, w: w });
      if (r.y < 96) note("an element starts at y=" + r.y + " inside the 96px chrome band");
      var text = w.querySelector(".sy-question, .sy-text");
      if (text && text.offsetHeight > r.h + 2) note("text is " + text.offsetHeight + "px tall in a " + r.h + "px box: " + text.textContent.slice(0, 40));
      var label = w.querySelector(".sy-tile-label");
      if (label && label.scrollHeight > label.clientHeight + 1) note("an answer is clipped in its tile: " + label.textContent.slice(0, 40));
      var tile = w.querySelector(".sy-tile");
      if (tile && label && label.offsetHeight > tile.offsetHeight) note("an answer label is taller than its tile");
      var btn = w.querySelector(".sy-button");
      if (btn && btn.scrollHeight > btn.clientHeight + 1) note("a button label is clipped: " + btn.textContent.slice(0, 40));
    }
    for (var a = 0; a < rects.length; a++) {
      for (var b = a + 1; b < rects.length; b++) {
        var p = rects[a].r, q = rects[b].r;
        if (p.x < q.x + q.w && p.x + p.w > q.x && p.y < q.y + q.h && p.y + p.h > q.y) note("two elements overlap");
      }
    }
    // The flash surface is not wrapped in .sy-element; measure its text directly.
    var flash = card.querySelector(".sy-flash");
    if (flash) {
      var term = flash.querySelector(".sy-flash-term, .sy-flash-term-small");
      var back = flash.querySelector(".sy-flash-back");
      if (term && term.offsetTop + term.offsetHeight > 500) note("the flash term runs down into the Next area");
      if (back && back.scrollHeight > back.offsetHeight + 2) note("the flash explanation overflows its box");
    }
    // The 18px design floor, at the on-screen scale of this window.
    var stack = document.querySelector("#player-root");
    var all = card.querySelectorAll("p, span, button");
    var scale = 1;
    var tr = (document.querySelector("#player-root").style.transform || "");
    var m = /scale\\(([\\d.]+)\\)/.exec(tr);
    if (m) scale = parseFloat(m[1]);
    for (var k = 0; k < all.length; k++) {
      var fs = parseFloat(getComputedStyle(all[k]).fontSize);
      var has = (all[k].textContent || "").trim().length > 0 && all[k].children.length === 0;
      if (has && fs * scale < 17.5 && all[k].className.indexOf("sy-score") < 0) note("text at " + (fs * scale).toFixed(1) + "px on screen: " + all[k].textContent.slice(0, 30));
    }
  }
  function step() {
    finishAnimations();
    var root = document.getElementById("player-root");
    if (root.querySelector(".sy-end-card")) { done(); return; }
    measure();
    if (++steps > 12) { done(); return; }
    var flash = root.querySelector(".sy-flash");
    if (flash) {
      var nb = flash.querySelector(".sy-flash-next button");
      if (nb) { nb.click(); } else { flash.click(); setTimeout(function () { finishAnimations(); measure(); var nb2 = flash.querySelector(".sy-flash-next button"); if (nb2) nb2.click(); }, 50); }
    } else {
      var tile = root.querySelector(".sy-tile[data-correct='true']");
      if (tile) tile.click();
      else { var bt = root.querySelector(".sy-button"); if (bt) bt.click(); }
    }
    setTimeout(step, 1500);
  }
  function done() {
    var node = document.createElement("div");
    node.id = "sy-fitcheck";
    node.setAttribute("data-cards", String(steps));
    node.setAttribute("data-problems", JSON.stringify(problems));
    document.body.appendChild(node);
  }
  setTimeout(step, 300);
})();
`;

function main(): Promise<void> {
  return (async () => {
    const raw = JSON.parse(JSON.stringify(deck())) as Stack;
    const v = validate(raw);
    if (!v.valid) throw new Error("the fixture deck is invalid: " + v.errors.join(", "));
    const stack = finaliseGeneratedStack(v.stack);
    const html = await exportStack(stack);

    if (CHROME === undefined) {
      console.warn("check-text-fit: no headless Chrome found — SKIPPING the real-browser fit check.");
      return;
    }
    const idx = html.lastIndexOf("</body>");
    const driven = html.slice(0, idx) + `<script>${DRIVER}</script>` + html.slice(idx);
    const dir = mkdtempSync(path.join(os.tmpdir(), "stackyard-fit-"));
    const file = path.join(dir, "fit.html");
    writeFileSync(file, driven, "utf8");

    for (const [w, h] of [[1366, 768], [1920, 1080]] as const) {
      const dom = dumpDomOffline(CHROME, {
        flags: [`--window-size=${w},${h}`, "--virtual-time-budget=40000"],
        url: `file://${file}`,
        timeoutMs: 120_000,
      });
      const m = /<div id="sy-fitcheck" data-cards="(\d+)" data-problems="([^"]*)"/.exec(dom);
      if (!m) {
        console.error(`check-text-fit: FAIL @${w}×${h} — the in-page check never finished.`);
        process.exit(1);
      }
      const problems = JSON.parse(
        m[2]!.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"),
      ) as string[];
      const cards = Number(m[1]);
      if (cards < 4) {
        console.error(`check-text-fit: FAIL @${w}×${h} — only measured ${cards} cards (expected 4).`);
        process.exit(1);
      }
      if (problems.length > 0) {
        console.error(`check-text-fit: FAIL @${w}×${h} — ${problems.length} problem(s):`);
        for (const p of problems.slice(0, 12)) console.error("  - " + p);
        process.exit(1);
      }
      console.log(`check-text-fit: OK @${w}×${h} — ${cards} cards of long text measured; nothing overflows, clips or overlaps.`);
    }
  })();
}

main().catch((err) => {
  console.error("check-text-fit:", err instanceof Error ? err.message : err);
  process.exit(1);
});
