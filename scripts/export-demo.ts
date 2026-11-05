// scripts/export-demo.ts
// Dev-only: export the Vikings ready-made stack to dist/exported-demo.html so
// the exported PLAYER (fonts inlined, warm desk, stamps) can be screenshot and
// compared with the play mockups. Not shipped.
//
//   node --import tsx/esm scripts/export-demo.ts

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exportStack } from "../server/exporter.js";
import { vikingsStack } from "../src/shared/readyMadeStacks.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "dist");
mkdirSync(outDir, { recursive: true });

const html = await exportStack(vikingsStack());
const out = path.join(outDir, "exported-demo.html");
writeFileSync(out, html, "utf8");
console.log(`wrote ${out} (${html.length} bytes)`);
