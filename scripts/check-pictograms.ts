// scripts/check-pictograms.ts
// TASK-31h: a generated card's pictogram really renders, offline. For a quiz, a
// flash and a story card (each made by the REAL pipeline: sanitise a model deck
// that names a picture, validate, finalise), it exports BOTH files (class and
// living), opens them from disk in headless Chrome with the network BLOCKED, and
// measures the first card in real layout:
//   - the picture is an <img> with one of our data:image/svg+xml URIs and it DECODES,
//   - it lies inside the card and overlaps no other element, nor the credit,
//   - the credit "Picture: Stackyard pictogram" is on the card, inside it,
//   - the page made no network request (the picture is inline, nothing is fetched).
//
//   node --import tsx/esm scripts/check-pictograms.ts
//
// SKIPS (exit 0) when no headless Chrome is found, like the other browser gates.

import { writeFileSync, mkdtempSync, existsSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { exportStack, exportLivingStack } from "../server/exporter.js";
import { sanitizeRawStack, finaliseGeneratedStack } from "../server/normalizeGenerated.js";
import { validate } from "../src/shared/validator.js";
import { PICTOGRAM_CREDIT } from "../src/shared/pictograms.js";
import { dumpDomOffline } from "./chrome.js";
import type { Stack } from "../src/shared/types.js";

const CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  process.env["CHROME_PATH"] ?? "",
].find((p) => p.length > 0 && existsSync(p));

type Kind = "quiz" | "flash" | "story";

/** A model deck (names only, no coordinates) whose first card is `kind`, through the real pipeline. */
function deckFor(kind: Kind, picto: string): Stack {
  const text = (content: string): Record<string, unknown> => ({ type: "text", id: "t", content });
  const btn = (label: string, actions: unknown[]): Record<string, unknown> => ({ type: "button", id: "b", label, actions });
  const elements: Record<string, unknown>[] =
    kind === "quiz"
      ? [
          text("Which of these falls from a cloud when it gets heavy?"),
          btn("Rain", [{ type: "score", delta: 1 }, { type: "goto", cardId: "c2" }]),
          btn("Sand", [{ type: "score", delta: 0 }, { type: "goto", cardId: "c2" }]),
          btn("Stones from the moon", [{ type: "score", delta: 0 }, { type: "goto", cardId: "c2" }]),
          btn("Warm milk", [{ type: "score", delta: 0 }, { type: "goto", cardId: "c2" }]),
        ]
      : kind === "flash"
        ? [text("Evaporation"), text("Water turns into vapour when the sun heats it. The vapour rises into the air."), btn("Next Card", [{ type: "goto", cardId: "c2" }])]
        : [
            text("You reach a fork in the path. A cold wind blows from the left and a warm smell comes from the right."),
            btn("Go left", [{ type: "goto", cardId: "c2" }]),
            btn("Go right", [{ type: "goto", cardId: "c2" }]),
            btn("Wait here", [{ type: "goto", cardId: "c2" }]),
          ];
  const raw = {
    id: "s", title: `Picture check ${kind}`, theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" },
    cards: [
      { id: "c1", kind, actions: [], elements: [...elements, { type: "image", picto }] },
      { id: "c2", kind: "end", actions: [], elements: [text("Finished"), { type: "field", id: "f", variable: "score" }] },
    ],
  };
  const v = validate(sanitizeRawStack(raw));
  if (!v.valid) throw new Error("fixture invalid: " + v.errors.join(", "));
  return finaliseGeneratedStack(v.stack);
}

// Plain JS, serialised into a <script>: no literal angle-bracket-slash anywhere.
const DRIVER = `
(function () {
  var CREDIT = __CREDIT__;
  var problems = [];
  function rect(el) { return el.getBoundingClientRect(); }
  function hit(a, b) { return a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5; }
  function report() {
    var node = document.createElement("div");
    node.id = "sy-picturecheck";
    node.setAttribute("data-problems", JSON.stringify(problems));
    document.body.appendChild(node);
  }
  function measure() {
    // The card flips in over 240 ms and is edge-on until it settles; let any
    // running animation finish before measuring (virtual time may not advance it).
    if (document.getAnimations) document.getAnimations().forEach(function (a) { try { a.finish(); } catch (e) {} });
    var card = document.querySelector("#player-root .sy-card");
    if (!card) { problems.push("no card rendered"); report(); return; }
    var imgs = card.querySelectorAll("img.sy-image");
    if (imgs.length !== 1) { problems.push("expected exactly one picture, found " + imgs.length); report(); return; }
    var img = imgs[0];
    if ((img.getAttribute("src") || "").indexOf("data:image/svg+xml,") !== 0) problems.push("the picture src is not one of our inline SVG data URIs");
    var cr = rect(card);
    var wrapper = img.closest(".sy-element");
    var ir = rect(wrapper);
    if (ir.left < cr.left - 1 || ir.right > cr.right + 1 || ir.top < cr.top - 1 || ir.bottom > cr.bottom + 1) problems.push("the picture lies outside the card");
    if (ir.width < 40 || ir.height < 40) problems.push("the picture is tiny: " + Math.round(ir.width) + "x" + Math.round(ir.height));
    // The credit line is on the card and inside it.
    var creditEl = null;
    Array.prototype.forEach.call(card.querySelectorAll("p"), function (p) { if ((p.textContent || "").trim() === CREDIT) creditEl = p; });
    if (!creditEl) problems.push("the credit line is missing");
    var crw = creditEl ? creditEl.closest(".sy-element") : null;
    if (crw) {
      var kr = rect(crw);
      if (kr.left < cr.left - 1 || kr.right > cr.right + 1 || kr.bottom > cr.bottom + 1) problems.push("the credit lies outside the card");
    }
    // Nothing else overlaps the picture or the credit.
    var others = [];
    Array.prototype.forEach.call(card.querySelectorAll(".sy-element"), function (w) { if (w !== wrapper && w !== crw) others.push(w); });
    Array.prototype.forEach.call(card.querySelectorAll(".sy-flash-term, .sy-flash-hint, .sy-flash-next button"), function (w) { others.push(w); });
    others.forEach(function (w) {
      var r = rect(w);
      if (r.width === 0 || r.height === 0) return;
      if (hit(ir, r)) problems.push("the picture overlaps " + (w.className || w.tagName));
      if (crw && hit(rect(crw), r)) problems.push("the credit overlaps " + (w.className || w.tagName));
    });
    // No network: the only things loaded are inline.
    var net = (performance.getEntriesByType("resource") || []).filter(function (e) { return !/^(data|blob):/.test(e.name); });
    if (net.length) problems.push("network requests: " + net.map(function (e) { return e.name; }).join(", "));
    // The SVG decodes.
    if (img.decode) {
      img.decode().then(function () { report(); }, function () { problems.push("the picture did not decode"); report(); });
    } else { if (!img.complete) problems.push("the picture did not load"); report(); }
  }
  setTimeout(measure, 900);
})();
`;

function inject(html: string): string {
  const driver = DRIVER.replace("__CREDIT__", JSON.stringify(PICTOGRAM_CREDIT));
  const idx = html.lastIndexOf("</body>");
  return html.slice(0, idx) + `<script>${driver}</script>` + html.slice(idx);
}

async function main(): Promise<void> {
  if (CHROME === undefined) {
    console.warn("check-pictograms: no headless Chrome found — SKIPPING the real-browser picture check.");
    return;
  }
  const dir = mkdtempSync(path.join(os.tmpdir(), "stackyard-picto-"));
  const cases: Array<[Kind, string]> = [["quiz", "rain"], ["flash", "sun"], ["story", "ship"]];
  let failed = false;
  try {
    for (const [kind, name] of cases) {
      const stack = deckFor(kind, name);
      for (const [fileKind, html] of [["class", await exportStack(stack)], ["living", await exportLivingStack(stack)]] as const) {
        const file = path.join(dir, `${kind}-${fileKind}.html`);
        writeFileSync(file, inject(html), "utf8");
        for (const [w, h] of [[1366, 768 + 143], [800, 600 + 143]] as const) {
          const dom = dumpDomOffline(CHROME, { flags: [`--window-size=${w},${h}`, "--virtual-time-budget=8000"], url: `file://${file}`, timeoutMs: 60_000 });
          const m = /<div id="sy-picturecheck" data-problems="([^"]*)"/.exec(dom);
          const label = `${kind} card, ${fileKind} file, ${w}-wide window, picture "${name}"`;
          if (!m) {
            console.error(`check-pictograms: FAIL — ${label}: the in-page check never finished.`);
            failed = true;
            continue;
          }
          const problems = JSON.parse(m[1]!.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")) as string[];
          if (problems.length > 0) {
            failed = true;
            console.error(`check-pictograms: FAIL — ${label}:`);
            for (const p of problems) console.error("  - " + p);
          } else {
            console.log(`check-pictograms: OK — ${label}`);
          }
        }
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  if (failed) process.exit(1);
  console.log("check-pictograms: OK — TASK-31h: a pictogram on a quiz, flash and story card renders, decodes, overlaps nothing and needs no network.");
}

main().catch((err) => {
  console.error("check-pictograms:", err instanceof Error ? err.message : err);
  process.exit(1);
});
