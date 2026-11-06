// scripts/make-samples.ts
// Generate the three sample lessons in samples/ (TASK-26m) from the ready-made
// decks, exactly as the Maker's "Export File → Living file" would. A judge can
// double-click any of them with the Wi-Fi off — no server, no account.
//
//   npm run samples        (needs the bundles: npm run build:player && npm run build:living)
//
// The samples are LIVING files: they play like any exported lesson, and a small
// Teacher tab in the corner opens the offline editor. If a headless Chrome is
// found, each sample is also opened from disk with the network blocked to prove
// it renders a card; otherwise that check is skipped (never blocking).

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exportLivingStack } from "../server/exporter.js";
import { dumpDomOffline } from "./chrome.js";
import {
  vikingsStack,
  timesTablesStack,
  irishWordsStack,
} from "../src/shared/readyMadeStacks.js";
import type { Stack } from "../src/shared/types.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "samples");

/** file name → deck. Names match what the README lists. */
export const SAMPLES: ReadonlyArray<{ file: string; build: () => Stack }> = [
  { file: "vikings-in-ireland.html", build: vikingsStack },
  { file: "times-tables.html", build: timesTablesStack },
  { file: "irish-words.html", build: irishWordsStack },
];

const CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  process.env["CHROME_PATH"] ?? "",
].find((p) => p.length > 0 && existsSync(p));

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  for (const { file, build } of SAMPLES) {
    const stack = build();
    const html = await exportLivingStack(stack);
    const target = path.join(OUT, file);
    writeFileSync(target, html, "utf8");
    console.log(`samples: wrote ${path.relative(ROOT, target)} (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB) — "${stack.title}"`);

    if (CHROME !== undefined) {
      const dom = dumpDomOffline(CHROME, {
        flags: ["--virtual-time-budget=4000"],
        url: `file://${target}`,
        timeoutMs: 60_000,
      });
      if (!dom.includes("sy-card-stack") || !dom.includes("sy-teacher-tab")) {
        console.error(`samples: FAIL — ${file} did not render a card and a Teacher tab offline.`);
        process.exit(1);
      }
    }
  }
  console.log(
    CHROME === undefined
      ? "samples: done (no headless Chrome found — skipped the open-offline check)."
      : "samples: done — each sample opened offline from disk and rendered a card.",
  );
}

// Run only when invoked directly, so a test can import SAMPLES.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error("samples:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
