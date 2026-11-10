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
//   - no text is smaller than the 18 px design floor at the class-laptop scale,
//   - (TASK-27a) the CORRECT ✓ and ✗ stamps never touch an answer: on cards with
//     four long answers it CLICKS a right tile and wrong tiles in both rows and
//     asserts stampRect ∩ labelTextRect == 0 (and ∩ question text, ∩ other tiles),
//     at scale 0.9 (the Maker/player floor) and ≈ 1.4 (a projector). It also checks
//     the "✓ Right answer" tab a wrong pick reveals.
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
import { pictogramDataUri } from "../src/shared/pictograms.js";
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

/** A model-style picture slot: the generator re-places it from the template. */
const pic = (name: string): Element => ({ type: "image", id: id(), x: 0, y: 0, w: 10, h: 10, src: pictogramDataUri(name), alt: `Picture: ${name}` });

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
    // Cards 1–3 carry a pictogram (TASK-31h): the same worst-case text, plus a picture
    // and its credit, must still fit with nothing overlapping.
    { id: id(), kind: "quiz", actions: [], elements: [t(LONG_Q), ...LONG_A.map((a, i) => b(a, [{ type: "score", delta: i === 0 ? 1 : 0 }])), pic("rain")] },
    {
      id: story2, kind: "story", actions: [],
      elements: [
        t("You reach the harbour at dawn and the whole town is still asleep. The tide is out, the boats lie on their sides in the mud, and a thin smoke rises from one chimney. What do you do now? ".repeat(2)),
        b("Knock on the door of the house with the chimney smoke", [{ type: "goto", cardId: flash }]),
        b("Walk along the harbour wall to look at the boats", [{ type: "goto", cardId: flash }]),
        b("Wait quietly and watch who comes out first", [{ type: "goto", cardId: flash }]),
        pic("ship"),
      ],
    },
    {
      id: flash, kind: "flash", actions: [],
      elements: [
        t("Condensation of water vapour in the cold upper air"),
        t("Condensation is when invisible water vapour cools down high in the sky and turns back into tiny drops of liquid water. Millions of these drops together make a cloud. ".repeat(2)),
        b("Next Card", [{ type: "goto", cardId: quiz2 }]),
        pic("sun"),
      ],
    },
    { id: quiz2, kind: "quiz", actions: [], elements: [t("Question 4: Why?"), b(LONG_A[1]!, [{ type: "score", delta: 1 }]), b(LONG_A[2]!, [{ type: "score", delta: 0 }])] },
    // Stamp cards (TASK-27a): four LONG answers each, so every label wraps to 2–3
    // lines and starts only ~10 px below its tile's top — the exact case the stamp
    // used to strike through.
    { id: id(), kind: "quiz", actions: [], elements: [t("Which of these do you think is the best answer to this question?"), ...LONG_A.map((a, i) => b(a + " " + i, [{ type: "score", delta: i === 0 ? 1 : 0 }]))] },
    { id: id(), kind: "quiz", actions: [], elements: [t("Which of these do you think is the second best answer here?"), ...LONG_A.map((a, i) => b(a + " " + i, [{ type: "score", delta: i === 0 ? 1 : 0 }]))] },
    { id: id(), kind: "quiz", actions: [], elements: [t("Which of these do you think is the third best answer there?"), ...LONG_A.map((a, i) => b(a + " " + i, [{ type: "score", delta: i === 0 ? 1 : 0 }]))] },
    { id: end, kind: "end", actions: [], elements: [{ type: "field", id: id(), x: 40, y: 250, w: 720, h: 80, variable: "score" }] },
  ];
  return {
    id: id(), title: "Long text", theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" },
    cards,
  };
}

/**
 * Swap answer payloads so tile `idx` (0..3, row-major) is the RIGHT one. The
 * generator shuffles the right answer by a random per-stack seed; the stamp check
 * needs it in a known row/column every run.
 */
function putRightAt(card: Card, idx: number): void {
  const tiles = card.elements.filter((e) => e.type === "button");
  const rightAt = tiles.findIndex((e) => e.type === "button" && e.actions.some((a) => a.type === "score" && a.delta === 1));
  if (rightAt < 0 || idx >= tiles.length || rightAt === idx) return;
  const a = tiles[rightAt]!, c = tiles[idx]!;
  if (a.type !== "button" || c.type !== "button") return;
  const swap = { label: a.label, actions: a.actions };
  a.label = c.label; a.actions = c.actions;
  c.label = swap.label; c.actions = swap.actions;
}

/**
 * What to click on which card (1-based), and where the right answer sits:
 *   card 1: the RIGHT tile, right answer in row 1, col 2   -> CORRECT stamp, row 1
 *   card 5: the RIGHT tile, right answer in row 2, col 1   -> CORRECT stamp, row 2
 *   card 6: tile 3 (row 2) while the right one is tile 0   -> ✗ stamp, row 2 (+ reveal tab on row 1)
 *   card 7: tile 0 (row 1) while the right one is tile 3   -> ✗ stamp, row 1 (+ reveal tab on row 2)
 */
const STAMP_PLAN: Record<number, { right: number; click: number | "right" }> = {
  1: { right: 1, click: "right" },
  5: { right: 2, click: "right" },
  6: { right: 0, click: 3 },
  7: { right: 3, click: 0 },
};

// Plain JS, serialised into a <script>: no literal angle-bracket-slash anywhere.
const DRIVER = `
(function () {
  var PLAN = __PLAN__;
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
      // A pictogram sits in the top strip on purpose (like the ready-made decks' pictures).
      if (r.y < 96 && !w.querySelector(".sy-image")) note("an element starts at y=" + r.y + " inside the 96px chrome band");
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
  // ---- stamps (TASK-27a) ----
  function area(a, b) {
    var w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    var h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return (w > 0.5 && h > 0.5) ? Math.round(w * h) : 0;
  }
  function textRects(el) {
    var r = document.createRange();
    r.selectNodeContents(el);
    return Array.prototype.slice.call(r.getClientRects());
  }
  function measureStamp(kind, cardNo) {
    var card = document.querySelector("#player-root .sy-card");
    var stamp = card.querySelector(kind === "right" ? ".sy-stamp" : ".sy-wrong-stamp");
    if (!stamp) { note("no " + (kind === "right" ? "CORRECT" : "wrong (✗)") + " stamp appeared"); return; }
    var sr = stamp.getBoundingClientRect();
    var own = stamp.closest(".sy-tile");
    var tiles = card.querySelectorAll(".sy-tile");
    var scale = parseFloat((/scale\\(([\\d.]+)\\)/.exec(document.querySelector("#player-root").style.transform || "") || [0, 1])[1]) || 1;
    for (var i = 0; i < tiles.length; i++) {
      var label = tiles[i].querySelector(".sy-tile-label");
      var rects = textRects(label);
      for (var k = 0; k < rects.length; k++) {
        var a = area(sr, rects[k]);
        if (a > 0) note("the " + kind + " stamp overlaps the text of an answer by " + a + "px² (scale " + scale.toFixed(2) + "): " + label.textContent.slice(0, 30));
      }
      if (tiles[i] !== own) {
        var tb = tiles[i].getBoundingClientRect();
        var a2 = area(sr, tb);
        if (a2 > 0) note("the " + kind + " stamp reaches another tile by " + a2 + "px²");
      }
    }
    var q = card.querySelector(".sy-question");
    if (q) {
      var qr = textRects(q);
      for (var m = 0; m < qr.length; m++) {
        var a3 = area(sr, qr[m]);
        if (a3 > 0) note("the " + kind + " stamp overlaps the question text by " + a3 + "px²");
      }
    }
    // The tab a wrong pick reveals on the right tile.
    var mark = card.querySelector(".sy-reveal-mark");
    if (kind === "wrong") {
      if (!mark) { note("a wrong pick revealed no 'Right answer' tab"); }
      else {
        var mr = mark.getBoundingClientRect();
        var rt = mark.closest(".sy-tile");
        textRects(rt.querySelector(".sy-tile-label")).forEach(function (r) { var a4 = area(mr, r); if (a4 > 0) note("the revealed 'Right answer' tab covers answer text by " + a4 + "px²"); });
        var a5 = area(mr, sr);
        if (a5 > 0) note("the revealed tab and the stamp overlap by " + a5 + "px²");
        if (q) textRects(q).forEach(function (r) { var a6 = area(mr, r); if (a6 > 0) note("the revealed tab covers question text by " + a6 + "px²"); });
        for (var j = 0; j < tiles.length; j++) { if (tiles[j] !== rt) { var a7 = area(mr, tiles[j].getBoundingClientRect()); if (a7 > 0) note("the revealed tab reaches another tile by " + a7 + "px²"); } }
      }
    }
    stampsChecked.push(kind + "@card" + cardNo + "/scale" + scale.toFixed(2));
  }
  var stampsChecked = [];

  function step() {
    finishAnimations();
    var root = document.getElementById("player-root");
    if (root.querySelector(".sy-end-card")) { done(); return; }
    measure();
    if (++steps > 14) { done(); return; }
    var plan = PLAN[steps];
    var flash = root.querySelector(".sy-flash");
    if (flash) {
      // TASK-33d1: Next Card sits beside the flash surface, not inside it.
      var nb = root.querySelector(".sy-flash-next button");
      if (nb) { nb.click(); } else { flash.click(); setTimeout(function () { finishAnimations(); measure(); var nb2 = root.querySelector(".sy-flash-next button"); if (nb2) nb2.click(); }, 50); }
    } else if (plan) {
      var tiles = root.querySelectorAll(".sy-tile");
      var target = plan.click === "right" ? root.querySelector(".sy-tile[data-correct='true']") : tiles[plan.click];
      var kind = (target && target.getAttribute("data-correct") === "true") ? "right" : "wrong";
      target.click();
      // The CORRECT stamp lands at once; the ✗ after the 180 ms shake. Measure once
      // both have settled, well inside the 600/900 ms hold before the card advances.
      var cardNo = steps;
      setTimeout(function () { finishAnimations(); measureStamp(kind, cardNo); }, 380);
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
    node.setAttribute("data-viewport", window.innerWidth + "x" + window.innerHeight);
    node.setAttribute("data-stamps", stampsChecked.join(","));
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
    const pictures = stack.cards.filter((c) => c.elements.some((e) => e.type === "image")).length;
    if (pictures !== 3) throw new Error(`the fixture should carry 3 pictograms after layout, it has ${pictures}`);
    // Put the right answer where each stamp card needs it (the generator shuffles).
    for (const [no, plan] of Object.entries(STAMP_PLAN)) {
      const card = stack.cards[Number(no) - 1];
      if (card && card.kind === "quiz") putRightAt(card, plan.right);
    }
    if (!validate(stack).valid) throw new Error("the fixture deck became invalid when placing right answers");
    const html = await exportStack(stack);

    if (CHROME === undefined) {
      console.warn("check-text-fit: no headless Chrome found — SKIPPING the real-browser fit check.");
      return;
    }
    const idx = html.lastIndexOf("</body>");
    const driver = DRIVER.replace("__PLAN__", JSON.stringify(STAMP_PLAN));
    const driven = html.slice(0, idx) + `<script>${driver}</script>` + html.slice(idx);
    const dir = mkdtempSync(path.join(os.tmpdir(), "stackyard-fit-"));
    const file = path.join(dir, "fit.html");
    writeFileSync(file, driven, "utf8");

    // 1366×768 and 1920×1080 are the real screens. The player scales the card by
    // min(vw·0.9/800, vh·0.9/600), so a viewport of 800×600 gives EXACTLY 0.9 (the
    // smallest the design allows: 20 px type renders at 18 px) and 1244×933 gives
    // 1.4 (a projector): the two scales the stamp assertions are required at
    // (TASK-27a). Headless Chrome's window is 143 px taller than its viewport
    // (measured: 768 -> 625), so the window sizes below are the viewports plus that.
    const sizes: Array<[number, number, string]> = [
      [1366, 768, "laptop"], [1920, 1080, "projector"], [800, 743, "scale 0.9"], [1244, 1076, "scale 1.4"],
    ];
    for (const [w, h, name] of sizes) {
      const dom = dumpDomOffline(CHROME, {
        flags: [`--window-size=${w},${h}`, "--virtual-time-budget=60000"],
        url: `file://${file}`,
        timeoutMs: 180_000,
      });
      const m = /<div id="sy-fitcheck" data-viewport="([^"]*)" data-stamps="([^"]*)" data-cards="(\d+)" data-problems="([^"]*)"/.exec(dom);
      if (!m) {
        console.error(`check-text-fit: FAIL @${w}×${h} (${name}) — the in-page check never finished.`);
        process.exit(1);
      }
      const problems = JSON.parse(
        m[4]!.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"),
      ) as string[];
      const cards = Number(m[3]);
      const stamps = m[2]!.split(",").filter(Boolean);
      const viewport = m[1]!;
      if (cards < 7) {
        console.error(`check-text-fit: FAIL @${w}×${h} (${name}) — only measured ${cards} cards (expected 7).`);
        process.exit(1);
      }
      if (stamps.length < 4) {
        console.error(`check-text-fit: FAIL @${w}×${h} (${name}) — only ${stamps.length} of 4 stamp scenarios ran (${stamps.join(", ")}).`);
        process.exit(1);
      }
      if (problems.length > 0) {
        console.error(`check-text-fit: FAIL @${w}×${h} (${name}) — ${problems.length} problem(s):`);
        for (const p of problems.slice(0, 14)) console.error("  - " + p);
        process.exit(1);
      }
      console.log(`check-text-fit: OK @${w}×${h} (${name}, viewport ${viewport}) — ${cards} cards of long text; nothing overflows, clips or overlaps; stamps clear of every answer, TASK-27a (${stamps.join(", ")}).`);
    }
  })();
}

main().catch((err) => {
  console.error("check-text-fit:", err instanceof Error ? err.message : err);
  process.exit(1);
});
