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
import { vikingsStack, irishWordsStack } from "../src/shared/readyMadeStacks.js";
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
const autoFlip = `<script>(function(){var n=0;function f(){var s=document.querySelector('.sy-flash');if(s&&s.querySelector('.sy-flash-term')){s.click();setTimeout(function(){var c=document.querySelector('.sy-card');if(c)c.style.animation='none';},60);}else if(n++<80){setTimeout(f,50);}}setTimeout(f,300);})();</script>`;

{
  const flashHtml = await exportStack(
    openOn(vikingsStack(), (t) => t === "Longphort"),
  );
  const withFlip = flashHtml.replace("</body>", autoFlip + "</body>");
  const out = path.join(outDir, "exported-flash-back.html");
  writeFileSync(out, withFlip, "utf8");
  console.log(`wrote ${out} (${withFlip.length} bytes)`);
}

// The Irish-words deck flash BACK — the exact deck whose back layout the round-3
// verdict flagged (explanation centred, "Next Card" over the hint). Export it
// opening on the first Irish flash card and auto-flip to the back, so the
// re-shoot proves the one fixed back layout (term top-left, body left-aligned,
// hint bottom-left, Next Card bottom-right, no overlap) on the Irish positions.
{
  const irishFlashBack = await exportStack(
    openOn(irishWordsStack(), (t) => t === "Dia duit"),
  );
  const withFlip = irishFlashBack.replace("</body>", autoFlip + "</body>");
  const out = path.join(outDir, "exported-irish-back.html");
  writeFileSync(out, withFlip, "utf8");
  console.log(`wrote ${out} (${withFlip.length} bytes)`);
}

// The end card of the Vikings deck, showing the stamp collection and the new
// "Play Again" tab. The exported file opens on the first card, so move the end
// card to the front for the screenshot and seed a score so some stamps are
// earned. Screenshot aid only; the real export keeps the authored order.
{
  const stack = vikingsStack();
  const end = stack.cards.find((c) => c.kind === "end")!;
  const rest = stack.cards.filter((c) => c.id !== end.id);
  const endFirst: Stack = { ...stack, cards: [end, ...rest] };
  const html = await exportStack(endFirst);
  const out = path.join(outDir, "exported-end.html");
  writeFileSync(out, html, "utf8");
  console.log(`wrote ${out} (${html.length} bytes)`);
}
