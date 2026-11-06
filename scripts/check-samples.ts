// scripts/check-samples.ts
// TASK-27n: samples/*.html must be exactly what `npm run samples` would write
// today. Regenerates each sample in memory and compares it byte-for-byte with
// the file on disk, so a stale sample (old layout, old text) fails the gate.
//
//   npm run check:samples      (needs the bundles: npm run build:player && npm run build:living)

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exportLivingStack } from "../server/exporter.js";
import { SAMPLES } from "./make-samples.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main(): Promise<void> {
  let stale = 0;
  for (const { file, build } of SAMPLES) {
    const p = path.join(ROOT, "samples", file);
    const fresh = await exportLivingStack(build());
    const onDisk = existsSync(p) ? readFileSync(p, "utf8") : null;
    if (onDisk !== fresh) {
      stale++;
      console.error(`check-samples: STALE — samples/${file} differs from a fresh export.`);
    } else {
      console.log(`check-samples: OK — samples/${file}`);
    }
  }
  if (stale > 0) {
    console.error("check-samples: run `npm run samples` and commit the result.");
    process.exit(1);
  }
}

void main();
