// scripts/export-screens.ts
// Dev-only: export a few exported-player HTML files so the REAL exported
// runtime (the same bundle the class gets) can be screenshot for the review —
// including a flash card and a story choice, the two screens a judge is most
// likely to click into. Not shipped.
//
//   node --import tsx/esm scripts/export-screens.ts
//
// The exported file always opens on the first card, so to shoot a flash card
// or a story card we export a copy of the Vikings deck with that card moved to
// the front (end card kept last). This is a screenshot aid only — it does not
// change the real export, which keeps the authored order.

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exportStack } from "../server/exporter.js";
import { vikingsStack } from "../src/shared/readyMadeStacks.js";
import { validate } from "../src/shared/validator.js";
import type { Stack } from "../src/shared/types.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "dist");
mkdirSync(outDir, { recursive: true });

/** Move the first card matching `pred` to the front, keeping the end last. */
function openOn(stack: Stack, pred: (title: string) => boolean): Stack {
  const target = stack.cards.find((c) => {
    const t = c.elements.find((e) => e.type === "text");
    return c.kind !== "end" && t && t.type === "text" && pred(t.content);
  });
  if (!target) return stack;
  const rest = stack.cards.filter((c) => c.id !== target.id);
  return { ...stack, cards: [target, ...rest] };
}

async function write(name: string, stack: Stack): Promise<void> {
  const check = validate(stack);
  if (!check.valid) {
    throw new Error(`${name}: invalid stack: ${check.errors.join(", ")}`);
  }
  const html = await exportStack(stack);
  const out = path.join(outDir, name);
  writeFileSync(out, html, "utf8");
  console.log(`wrote ${out} (${html.length} bytes)`);
}

await write("exported-demo.html", vikingsStack());
await write("exported-flash.html", openOn(vikingsStack(), (t) => t === "Longphort"));
await write(
  "exported-story.html",
  openOn(vikingsStack(), (t) => t.startsWith("The longship lands")),
);

// A flash-BACK screenshot variant: the exported flash file with a tiny appended
// script that taps the live flash surface once it mounts, so headless Chrome
// captures the explanation side. Screenshot aid only; never shipped.
{
  const flashHtml = await exportStack(
    openOn(vikingsStack(), (t) => t === "Longphort"),
  );
  const autoFlip = `<script>(function(){var n=0;function f(){var s=document.querySelector('.sy-flash');if(s&&s.querySelector('.sy-flash-term')){s.click();setTimeout(function(){var c=document.querySelector('.sy-card');if(c)c.style.animation='none';},60);}else if(n++<80){setTimeout(f,50);}}setTimeout(f,300);})();</script>`;
  const withFlip = flashHtml.replace("</body>", autoFlip + "</body>");
  const out = path.join(outDir, "exported-flash-back.html");
  writeFileSync(out, withFlip, "utf8");
  console.log(`wrote ${out} (${withFlip.length} bytes)`);
}
