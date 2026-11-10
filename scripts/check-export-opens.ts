// scripts/check-export-opens.ts
// Exported-file open/play regression check (TASK-23 a.3), run by the
// `export-regression-check` hook on changes to the exporter / security headers
// / html template.
//
// On 5 Nov we shipped an exported file that opened to a BLANK page because the
// blob inherited the app CSP and the inline player script was blocked (J4 H1).
// This exports a real deck, opens the file FROM DISK in headless Chrome (where
// no app CSP applies), lets the player's inline script run, and asserts the
// DOM actually rendered a card with the question text — not a blank page.
//
//   node --import tsx/esm scripts/check-export-opens.ts
//
// If no headless Chrome is found, the check SKIPS with a warning (exit 0) so it
// never blocks a machine without a browser; where Chrome exists it fails hard
// on a blank page.

import { writeFileSync, mkdtempSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { exportStack } from "../server/exporter.js";
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

/** The first question/term text in the deck, used to prove the card rendered. */
function firstText(stack: Stack): string {
  const card = stack.cards[0] as Card;
  const t = card.elements.find((e) => e.type === "text");
  return t && t.type === "text" ? t.content : "";
}

async function main(): Promise<void> {
  const chrome = findChrome();

  const stack = vikingsStack();
  const html = await exportStack(stack);
  const dir = mkdtempSync(path.join(os.tmpdir(), "stackyard-export-"));
  const file = path.join(dir, "exported.html");
  writeFileSync(file, html, "utf8");

  if (chrome === null) {
    console.warn("check-export-opens: no headless Chrome found — SKIPPING the render check.");
    console.warn(`check-export-opens: exported file written OK (${html.length} bytes) at ${file}.`);
    return; // exit 0: never block a browser-less machine
  }

  // Dump the post-JS DOM, with the network blocked (an exported file must need
  // none). --virtual-time-budget lets the inline player run. Judged by its
  // output, not Chrome's exit status — see scripts/chrome.ts.
  const dom = dumpDomOffline(chrome, {
    flags: ["--virtual-time-budget=3000"],
    url: `file://${file}`,
    timeoutMs: 30_000,
  });

  const expected = firstText(stack);
  const renderedCard = dom.includes('class="sy-card"') || dom.includes("sy-card-stack");
  const renderedQuestion = expected.length > 0 && dom.includes(expected.slice(0, 20));
  const emptyRoot = /<(?:div|main) id="player-root"><\/(?:div|main)>/.test(dom);

  if (emptyRoot || !renderedCard || !renderedQuestion) {
    console.error("check-export-opens: FAIL — the exported file opened to a blank/empty player.");
    console.error(`  renderedCard=${renderedCard} renderedQuestion=${renderedQuestion} emptyRoot=${emptyRoot}`);
    process.exit(1);
  }

  console.log("check-export-opens: OK — the exported file opens from disk and plays (card rendered).");
}

main().catch((err) => {
  console.error("check-export-opens: unexpected error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
