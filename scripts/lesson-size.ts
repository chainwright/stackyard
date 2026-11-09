// scripts/lesson-size.ts
// The one measurement behind "N lessons like it fit on a 1.44 MB floppy"
// (TASK-33b). Shared by scripts/check-claims.ts and tests/export-size.test.ts so
// the claim, its check and its budget all measure the same file: a LIVING
// export of the fixed water-cycle fixture deck (tests/fixtures/generation/
// water-cycle-g2.json), finalised exactly as /api/generate finalises it. The
// samples in samples/ carry photos and are larger; the claim names the fixture.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The fixture the claim names. */
export const LESSON_FIXTURE = path.join(ROOT, "tests", "fixtures", "generation", "water-cycle-g2.json");

/** Bytes of a living export of the water-cycle fixture (-1 if it fails to validate). */
export async function fixtureLivingExportBytes(): Promise<number> {
  const { exportLivingStack } = await import("../server/exporter.js");
  const { sanitizeRawStack, finaliseGeneratedStack } = await import("../server/normalizeGenerated.js");
  const { validate } = await import("../src/shared/validator.js");
  const fx = JSON.parse(readFileSync(LESSON_FIXTURE, "utf8")) as { prompt: string; stack: unknown };
  const v = validate(sanitizeRawStack(fx.stack));
  if (!v.valid) return -1;
  const html = await exportLivingStack(finaliseGeneratedStack(v.stack, { prompt: fx.prompt }));
  return Buffer.byteLength(html);
}
