// src/living/styles.ts
// The living file's own chrome CSS (TASK-24): the Teacher tab, the in-file
// "are you sure?" box (TASK-42a1; it replaced the browser confirm), the
// editor panel, and the Save a Copy controls. Injected once at mount. The
// player's own styles are injected by the renderer; this is only the editor
// shell that sits over the play surface. Kept small and dependency-free.

export const LIVING_STYLES = `
.sy-teacher-tab {
  position: fixed; bottom: 12px; right: 12px; z-index: 60;
  font-family: 'Stackyard Digits', 'Stackyard Reading', system-ui, sans-serif; font-size: 18px;
  background: rgba(30,42,71,0.85); color: #FBF8F1; border: none; cursor: pointer;
  border-radius: 999px; padding: 8px 14px; min-height: 44px; opacity: 0.7;
}
.sy-teacher-tab:hover { opacity: 1; }

.sy-living-overlay {
  position: fixed; inset: 0; z-index: 70; background: #D4C9B0;
  display: flex; flex-direction: column; overflow: hidden; overflow: clip;
  font-family: 'Stackyard Digits', 'Stackyard Reading', system-ui, sans-serif; color: #1E2A47;
}
.sy-living-bar {
  flex: 0 0 auto; display: flex; align-items: center; gap: 12px;
  background: #1E2A47; color: #FBF8F1; padding: 10px 16px;
}
.sy-living-bar h1 { font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-size: 20px; margin: 0; }
.sy-living-bar .sy-spacer { flex: 1 1 auto; }
.sy-living-btn {
  font-family: inherit; font-size: 18px; cursor: pointer; border-radius: 8px;
  min-height: 44px; padding: 8px 14px; border: 2px solid #1E2A47;
  background: #FBF8F1; color: #1E2A47;
}
.sy-living-btn.primary { background: #CE3926; color: #fff; border-color: #CE3926; }
.sy-living-btn.ghost { background: transparent; color: #FBF8F1; border-color: #FBF8F1; }
.sy-living-btn:disabled { opacity: 0.5; cursor: default; }

.sy-living-body { flex: 1 1 auto; display: flex; min-height: 0; }
.sy-living-list {
  flex: 0 0 240px; overflow-y: auto; background: #FBF8F1;
  border-right: 1px solid #C9D3E3; padding: 8px;
}
@media (min-width: 1600px) { .sy-living-list { flex-basis: 340px; } }
.sy-living-list button {
  display: block; width: 100%; text-align: left; font-family: inherit;
  font-size: 18px; background: #FBF8F1; border: 1px solid #C9D3E3;
  border-radius: 8px; padding: 8px 10px; margin-bottom: 6px; cursor: pointer;
  color: #1E2A47;
}
.sy-living-list button[aria-current="true"] { border: 2px solid #1E2A47; background: #fff; }
.sy-living-list .num { font-weight: 700; margin-right: 6px; }
.sy-living-list button { display: flex; align-items: baseline; white-space: nowrap; }
.sy-living-list .txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

.sy-living-main { flex: 1 1 auto; display: flex; min-height: 0; }
.sy-living-canvas {
  flex: 1 1 auto; display: flex; align-items: center; justify-content: center;
  overflow: hidden; overflow: clip; padding: 16px; position: relative;
}
.sy-living-canvas .sy-card-stack { transform-origin: center center; }

.sy-living-inspector {
  flex: 0 0 300px; overflow-y: auto; overflow-x: hidden; background: #FBF8F1;
  border-left: 1px solid #C9D3E3; padding: 14px; overflow-wrap: anywhere;
}
.sy-living-inspector h2 { font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-weight: 800; font-size: 22px; line-height: 1.3; margin: 0 0 10px; }
.sy-living-field { margin-bottom: 14px; }
.sy-living-field label { display: block; font-size: 18px; font-weight: 700; margin-bottom: 4px; }
.sy-living-field input, .sy-living-field textarea, .sy-living-field select {
  width: 100%; font: inherit; font-size: 18px; padding: 7px 9px;
  border: 1.5px solid #C9D3E3; border-radius: 8px; color: #1E2A47; background: #fff;
}
.sy-living-field textarea { min-height: 90px; resize: vertical; }
.sy-living-hint { font-size: 18px; color: #4a5878; margin-top: 4px; line-height: 1.4; }
.sy-living-hint.warn {
  color: #1E2A47; border-left: 3px solid #1E2A47; padding-left: 8px;
  background: rgba(30,42,71,0.05); border-radius: 4px;
}
.sy-living-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.sy-living-field .sy-living-radio {
  display: flex; align-items: center; gap: 8px; font-weight: 700; cursor: pointer;
}
.sy-living-field .sy-living-radio input { width: auto; accent-color: #1E2A47; }

.sy-living-toast {
  position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%);
  z-index: 90; background: #1E2A47; color: #FBF8F1; padding: 10px 16px;
  border-radius: 8px; font-size: 18px; max-width: 80vw;
  font-family: 'Stackyard Digits', 'Stackyard Reading', system-ui, sans-serif;
}

/* TASK-42a1: the in-file "are you sure?" box (replaces the browser's confirm box). Ink on
   paper, 18px floor, 44px buttons, no stamp red, no blur, fits 390px. */
.sy-dialog-backdrop {
  position: fixed; inset: 0; z-index: 100; background: rgba(30,42,71,0.55);
  display: flex; align-items: center; justify-content: center; padding: 16px;
  box-sizing: border-box; overflow-y: auto;
}
.sy-dialog {
  box-sizing: border-box; width: 100%; max-width: 520px;
  background: #FBF8F1; color: #1E2A47; border: 2px solid #1E2A47; border-radius: 10px;
  padding: 20px 22px; font-family: 'Stackyard Digits', 'Stackyard Reading', system-ui, sans-serif;
  font-size: 18px; line-height: 1.5; overflow-wrap: anywhere;
  animation: sy-dialog-in 120ms ease-out;
}
.sy-dialog-title {
  font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-weight: 800; font-size: 24px;
  line-height: 1.3; margin: 0 0 10px; padding-bottom: 8px; border-bottom: 1px solid #C9D3E3;
}
.sy-dialog-body { margin: 0 0 8px; }
.sy-dialog-list { margin: 0 0 8px; padding-left: 22px; }
.sy-dialog-row { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; margin-top: 16px; }
.sy-dialog-btn {
  font-family: inherit; font-size: 18px; font-weight: 700; cursor: pointer; border-radius: 10px;
  min-height: 44px; min-width: 44px; padding: 8px 16px; border: 2px solid #1E2A47;
}
.sy-dialog-btn.primary { background: #1E2A47; color: #FFFFFF; }
.sy-dialog-btn.quiet { background: #FBF8F1; color: #1E2A47; }
.sy-dialog-btn:focus-visible { outline: 3px solid #1E2A47; outline-offset: 2px; box-shadow: 0 0 0 2px #FBF8F1; }
@keyframes sy-dialog-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .sy-dialog { animation: none; } }

.sy-living-tryit { position: relative; padding-top: 48px; } /* the pill sits above the rings */
.sy-living-tryit .sy-back {
  position: absolute; top: 2px; left: 8px; z-index: 5;
}

/* Dragging an element in the preview (TASK-31d). */
.sy-living-canvas .sy-element { touch-action: none; cursor: grab; }
.sy-living-canvas .sy-element:active { cursor: grabbing; }

/* The "Cards" toggle only exists on a phone (TASK-31b). */
.sy-cards-toggle { display: none; }

/* TASK-34b5: the "Class results" panel. Ink on paper, 18px floor, no stamp red. */
.sy-results-host { flex: 1 1 auto; overflow-y: auto; background: #FBF8F1; }
.sy-results { max-width: 960px; margin: 0 auto; padding: 18px 20px 40px; font-size: 18px; line-height: 1.45; }
.sy-results h2 { font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-weight: 800; font-size: 28px; margin: 0 0 8px; }
.sy-results h3 { font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-weight: 800; font-size: 22px; margin: 18px 0 6px; }
.sy-results textarea { min-height: 120px; text-transform: uppercase; }
.sy-results-status { font-weight: 700; margin: 8px 0; min-height: 1.45em; }
.sy-results-problems { margin: 0 0 8px; padding-left: 22px; }
.sy-results-summary { font-size: 22px; font-weight: 700; margin: 10px 0; }
.sy-results-table { border-collapse: collapse; margin: 8px 0; background: #fff; }
.sy-results-table caption { text-align: left; font-weight: 700; padding: 4px 0; }
.sy-results-table th, .sy-results-table td { border: 1px solid #C9D3E3; padding: 6px 10px; text-align: left; vertical-align: top; }
.sy-results-table td { text-align: center; min-width: 3em; }
.sy-results-scroll { overflow-x: auto; max-width: 100%; }
.sy-results button:focus-visible, .sy-results textarea:focus-visible, .sy-results-scroll:focus-visible,
.sy-living-bar button:focus-visible {
  outline: 3px solid #1E2A47; outline-offset: 2px; box-shadow: 0 0 0 2px #FBF8F1;
}
.sy-results h2:focus, .sy-results-status:focus { outline: none; }
/* TASK-43a3: the panel as a ruled index card, in the lesson's ink-on-paper look.
   Rule lines every 32 px (--color-rule), ink text and borders, existing fonts;
   no stamp red (nothing here is earned), no blur, no new font. */
.sy-results {
  background-color: #FBF8F1;
  background-image: repeating-linear-gradient(to bottom, transparent 0, transparent 31px, #C9D3E3 31px, #C9D3E3 32px);
  border: 1px solid #C9D3E3; border-radius: 10px; margin-top: 16px; margin-bottom: 24px;
}
.sy-results-table { border-collapse: separate; border-spacing: 0; border: 2px solid #1E2A47; border-radius: 10px; overflow: hidden; background: #FFFFFF; }
.sy-results-table caption { font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-weight: 800; font-size: 20px; }
.sy-results-table thead th { background: #1E2A47; color: #FFFFFF; border-color: #1E2A47; }
.sy-results-table th, .sy-results-table td { border: 0; border-bottom: 1px solid #C9D3E3; }
.sy-results-table tbody tr:last-child th, .sy-results-table tbody tr:last-child td { border-bottom: 0; }
.sy-results-revisit { list-style: none; padding-left: 0; margin: 4px 0 12px; }
.sy-results [data-testid="results-missed"] { list-style: none; padding-left: 0; margin: 8px 0; }
.sy-results-revisit li { padding: 6px 0; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
/* A stamp-like "Revisit" label: boxed, rotated, ink. A word, not a colour. */
.sy-revisit-stamp {
  display: inline-block; flex: 0 0 auto; font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-weight: 800;
  font-size: 18px; letter-spacing: 0.04em; text-transform: uppercase; color: #1E2A47;
  border: 2px solid #1E2A47; border-radius: 4px; padding: 0 6px; transform: rotate(-3deg);
}
/* TASK-43a2: on a narrow screen the per-question table stacks: the question on
   its own line, then Right / Wrong / Did not reach, each with its label. It is
   still a table (caption, column headers), so assistive tech reads it as one. */
@media (max-width: 480px) {
  .sy-results { padding: 14px 12px 32px; }
  .sy-results-questions, .sy-results-questions tbody, .sy-results-questions tr, .sy-results-questions th, .sy-results-questions td { display: block; width: auto; }
  .sy-results-questions thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .sy-results-questions caption { display: block; }
  .sy-results-questions tr { border-bottom: 1px solid #C9D3E3; padding: 6px 10px; }
  .sy-results-questions tbody tr:last-child { border-bottom: 0; }
  .sy-results-questions th[scope="row"] { border: 0; padding: 4px 0; overflow-wrap: anywhere; }
  .sy-results-questions td { display: inline-block; border: 0; text-align: left; min-width: 0; padding: 2px 12px 2px 0; }
  .sy-results-questions td::before { content: attr(data-label) ": "; font-weight: 700; }
}
@media print {
  .sy-printing body > :not(.sy-living-overlay), .sy-printing .sy-living-bar, .sy-printing .sy-noprint { display: none !important; }
  .sy-printing .sy-living-overlay, .sy-printing .sy-results-host { position: static; overflow: visible; background: #fff; }
}

/* TASK-31b: on a phone the card list folds behind a one-line "Cards" toggle,
   the preview gets the full width (scaled to fit by the editor) and the
   inspector sits BELOW the card. Desktop is untouched. */
@media (max-width: 699px) {
  .sy-living-bar { flex-wrap: wrap; gap: 8px; padding: 8px 12px; }
  .sy-living-bar h1 { font-size: 18px; flex: 1 1 100%; }
  .sy-living-bar .sy-spacer { display: none; }
  .sy-living-body { flex-direction: column; overflow-y: auto; overflow-x: hidden; }
  .sy-cards-toggle { display: block; flex: 0 0 auto; width: 100%; text-align: left; border-radius: 0; border-width: 0 0 1px; }
  .sy-living-list { display: none; flex: 0 0 auto; border-right: 0; border-bottom: 1px solid #C9D3E3; max-height: 40vh; }
  .sy-living-list.sy-open { display: block; }
  .sy-living-main { flex: 0 0 auto; flex-direction: column; min-height: auto; }
  .sy-living-canvas { flex: 0 0 auto; width: 100%; height: calc(78vw + 40px); padding: 16px; }
  .sy-living-inspector { flex: 0 0 auto; width: 100%; border-left: 0; border-top: 1px solid #C9D3E3; overflow: visible; }
  .sy-living-canvas.sy-living-tryit { height: auto; min-height: calc(78vw + 40px); }
}
`.trim();

/**
 * Inject the living chrome styles once per document. The check looks at the
 * DOM, not a module flag, so a second document (a reopened copy in a test) gets
 * its own styles and the same page never gets two blocks.
 */
export function ensureLivingStyles(doc: Document = document): void {
  if (doc.head.querySelector('style[data-living="chrome"]')) return;
  const style = doc.createElement("style");
  style.setAttribute("data-living", "chrome");
  style.textContent = LIVING_STYLES;
  doc.head.appendChild(style);
}
