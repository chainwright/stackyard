// scripts/check-living-file.ts
// Living-file end-to-end gate (TASK-24). Proves the exported living file edits
// ITSELF, offline, with no network request:
//
//   1. Export a living file for a real deck.
//   2. Open it FROM DISK in headless Chrome with the network BLOCKED
//      (--host-resolver-rules maps every host to NOTFOUND, so any stray fetch
//      fails hard). An injected driver:
//        - stubs window.confirm -> true (the Teacher guard is not security),
//        - clicks the "Teacher" tab to open the offline editor,
//        - selects card 1's question and changes its text,
//        - intercepts the Blob "Save a Copy" download and captures the copy's
//          full HTML into a DOM node (no file dialog, no network),
//        - writes a PASS/FAIL marker + the captured HTML into the DOM.
//   3. Read the captured copy back out of the dumped DOM, write it to a second
//      file, and open THAT from disk (network still blocked). Assert the edited
//      question renders in Play — i.e. the copy is itself a working living file
//      carrying the edit.
//
//   node --import tsx/esm scripts/check-living-file.ts
//
// If no headless Chrome is found the check SKIPS (exit 0) so it never blocks a
// browser-less machine; where Chrome exists it fails hard.

import { writeFileSync, readFileSync, mkdtempSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { exportLivingStack, exportStack } from "../server/exporter.js";
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

/** The first card's question/term text, used to prove the right card rendered. */
function firstText(stack: Stack): string {
  const card = stack.cards[0] as Card;
  const t = card.elements.find((e) => e.type === "text");
  return t && t.type === "text" ? t.content : "";
}

const NEW_QUESTION = "SELF-CHECK EDIT: where was the first Viking town?";

/**
 * The in-page driver, injected after the living runtime. It runs the real
 * Teacher -> edit -> Save a Copy flow and records the result in #sy-selfcheck.
 * Written as PLAIN JS (no TypeScript syntax) because it is serialised verbatim
 * into a <script> tag and run by the browser. Resilient: on any error it writes
 * a FAIL marker with the reason so the dumped DOM always carries a verdict.
 */
function driverSource(newQuestion: string): string {
  const NEW_Q = JSON.stringify(newQuestion);
  return `
(function () {
  function report(status, detail, copyHtml) {
    // Keep the status marker SMALL so its opening tag is trivial to match in
    // the dumped DOM. The (large) copy goes on a SEPARATE element.
    var node = document.createElement("div");
    node.id = "sy-selfcheck";
    node.setAttribute("data-status", status);
    node.setAttribute("data-detail", detail);
    document.body.appendChild(node);
    if (copyHtml) {
      var big = document.createElement("div");
      big.id = "sy-selfcheck-copy";
      // Base64 the copy HTML: it contains only A-Z a-z 0-9 + / =, so it has no
      // markup and survives DOM serialisation + extraction. UTF-8 safe.
      var b64 = "";
      try { b64 = btoa(unescape(encodeURIComponent(copyHtml))); } catch (e) { b64 = ""; }
      big.setAttribute("data-copy-b64", b64);
      document.body.appendChild(big);
    }
  }
  function run() {
    try {
      // 1. The Teacher guard is not security: auto-accept the confirm.
      window.confirm = function () { return true; };

      // Any network use must blow up — a living file must be fully offline.
      window.fetch = function () {
        report("FAIL", "the living file tried to fetch — it must be fully offline", "");
        throw new Error("network blocked");
      };

      // 2. Open the Teacher editor.
      var tab = document.querySelector(".sy-teacher-tab");
      if (!tab) { report("FAIL", "no Teacher tab found", ""); return; }
      tab.click();

      // 3. Select card 1's question text (first .sy-element), then change it.
      var canvas = document.querySelector(".sy-living-canvas");
      if (!canvas) { report("FAIL", "editor did not open (no canvas)", ""); return; }
      var elementNode = canvas.querySelector(".sy-element");
      if (!elementNode) { report("FAIL", "no element to select on card 1", ""); return; }
      elementNode.click();

      var textarea = document.querySelector(".sy-living-inspector textarea");
      if (!textarea) { report("FAIL", "selecting the question did not open a text box", ""); return; }
      textarea.value = ${NEW_Q};
      textarea.dispatchEvent(new Event("input", { bubbles: true }));

      // 4. Intercept the Blob download so we capture the copy instead of saving.
      var origCreate = URL.createObjectURL;
      URL.createObjectURL = function (blob) { URL.__lastBlob = blob; return "blob:selfcheck"; };
      var origAnchorClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () { /* swallow */ };

      var saveBtn = null;
      var btns = document.querySelectorAll(".sy-living-bar button");
      for (var i = 0; i < btns.length; i++) {
        if ((btns[i].textContent || "").indexOf("Save a Copy") >= 0) { saveBtn = btns[i]; break; }
      }
      if (!saveBtn) { report("FAIL", "no Save a Copy button", ""); return; }
      saveBtn.click();

      URL.createObjectURL = origCreate;
      HTMLAnchorElement.prototype.click = origAnchorClick;

      var blob = URL.__lastBlob;
      if (!blob) { report("FAIL", "Save a Copy produced no file", ""); return; }

      // Read the blob via blob.text() — a microtask-based Promise that resolves
      // deterministically before Chrome's --virtual-time clock advances, so it
      // never races a timer (a FileReader + watchdog did, causing false fails).
      blob.text().then(function (html) {
        // Escaped slash so this driver's own source carries no literal </...>
        // that would close the injected <script> early.
        if (html.indexOf("<\\/html>") < 0) { report("FAIL", "the copy is not a full HTML document", ""); return; }
        report("PASS", "edited and saved a copy offline", html);
      }).catch(function () {
        report("FAIL", "could not read the saved copy", "");
      });
    } catch (err) {
      report("FAIL", "driver error: " + (err && err.message), "");
    }
  }
  // Run after the living runtime's DOMContentLoaded handler has mounted.
  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(run, 50);
  } else {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(run, 50); });
  }
})();
`;
}

/** Inject a <script> running `js` right before </body> (after the living IIFE). */
function injectDriver(html: string, js: string): string {
  const tag = `\n<script>\n${js}\n</script>\n`;
  const idx = html.lastIndexOf("</body>");
  if (idx < 0) return html + tag;
  return html.slice(0, idx) + tag + html.slice(idx);
}

/** Run Chrome headless with the network blocked and return the dumped DOM. */
function dumpDomOffline(chrome: string, file: string): string {
  return execFileSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--allow-file-access-from-files",
      // Block ALL network: every host resolves to NOTFOUND, and the proxy is a
      // dead address. A self-contained file needs neither; any stray request
      // fails hard, proving the file is offline.
      '--host-resolver-rules=MAP * ~NOTFOUND',
      "--proxy-server=http://0.0.0.0:0",
      "--virtual-time-budget=9000",
      "--dump-dom",
      `file://${file}`,
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"], timeout: 60_000 },
  );
}

function attr(dom: string, name: string): string | null {
  // The marker is <div id="sy-selfcheck" data-status="..." data-detail="...">.
  const m = dom.match(/<div id="sy-selfcheck"([^>]*)>/);
  if (!m) return null;
  const a = m[1]!.match(new RegExp(name + '="([^"]*)"'));
  return a ? a[1]! : null;
}

/** Pull the captured copy HTML out of #sy-selfcheck-copy's base64 attribute. */
function extractCopy(dom: string): string | null {
  const m = dom.match(/<div id="sy-selfcheck-copy" data-copy-b64="([^"]*)"/);
  if (!m) return null;
  try {
    return Buffer.from(m[1]!, "base64").toString("utf8");
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const chrome = findChrome();
  const stack = vikingsStack();

  const livingHtml = await exportLivingStack(stack);
  const classHtml = await exportStack(stack);
  const dir = mkdtempSync(path.join(os.tmpdir(), "stackyard-living-"));
  const livingFile = path.join(dir, "living.html");
  writeFileSync(livingFile, livingHtml, "utf8");

  // Report sizes for both files (gate requirement).
  const livingKB = (Buffer.byteLength(livingHtml) / 1024).toFixed(1);
  const classKB = (Buffer.byteLength(classHtml) / 1024).toFixed(1);
  console.log(`check-living-file: class file  = ${classKB} KB`);
  console.log(`check-living-file: living file = ${livingKB} KB (budget: < 500 KB)`);
  if (Buffer.byteLength(livingHtml) > 500 * 1024) {
    console.error("check-living-file: FAIL — living file exceeds the 500 KB budget.");
    process.exit(1);
  }

  if (chrome === null) {
    console.warn("check-living-file: no headless Chrome found — SKIPPING the interactive check.");
    console.warn(`check-living-file: living file written OK at ${livingFile}.`);
    return; // exit 0: never block a browser-less machine
  }

  // Pass 1: drive Teacher -> edit -> Save a Copy, network blocked.
  const driven = injectDriver(livingHtml, driverSource(NEW_QUESTION));
  const drivenFile = path.join(dir, "living-driven.html");
  writeFileSync(drivenFile, driven, "utf8");

  const dom1 = dumpDomOffline(chrome, drivenFile);
  const status = attr(dom1, "data-status");
  const detail = attr(dom1, "data-detail") ?? "(no detail)";

  if (status !== "PASS") {
    console.error(`check-living-file: FAIL — editing/Save-a-Copy did not succeed offline: ${detail}`);
    process.exit(1);
  }
  console.log("check-living-file: pass 1 OK — edited card 1 and saved a copy, offline, no network.");

  const copyHtml = extractCopy(dom1);
  if (!copyHtml || copyHtml.indexOf("</html>") < 0) {
    console.error("check-living-file: FAIL — could not recover the saved copy from the DOM.");
    process.exit(1);
  }

  // The copy must still be a living file (carries the editor) and carry the edit.
  if (copyHtml.indexOf("sy-teacher-tab") < 0) {
    console.error("check-living-file: FAIL — the saved copy is not a living file (no Teacher tab).");
    process.exit(1);
  }

  // Pass 2: open the COPY from disk, network blocked, and confirm Play shows
  // the edited question (not the original).
  const copyFile = path.join(dir, "living-copy.html");
  writeFileSync(copyFile, copyHtml, "utf8");

  const dom2 = dumpDomOffline(chrome, copyFile);
  const renderedCard = dom2.includes('class="sy-card"') || dom2.includes("sy-card-stack");
  const showsEdit = dom2.includes(NEW_QUESTION.slice(0, 24));
  const showsOriginal = dom2.includes(firstText(stack).slice(0, 24));

  if (!renderedCard) {
    console.error("check-living-file: FAIL — the saved copy opened to a blank player.");
    process.exit(1);
  }
  if (!showsEdit) {
    console.error("check-living-file: FAIL — the saved copy does NOT show the edited question in Play.");
    process.exit(1);
  }
  if (showsOriginal) {
    console.error("check-living-file: FAIL — the saved copy still shows the ORIGINAL question.");
    process.exit(1);
  }

  console.log("check-living-file: pass 2 OK — the copy opens offline and Play shows the edit.");
  console.log("check-living-file: OK — the living file edits itself offline and saves a working copy.");
}

main().catch((err) => {
  console.error("check-living-file: unexpected error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
