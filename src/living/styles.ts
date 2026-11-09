// src/living/styles.ts
// The living file's own chrome CSS (TASK-24): the Teacher tab, the confirm, the
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

.sy-living-tryit { position: relative; padding-top: 48px; } /* the pill sits above the rings */
.sy-living-tryit .sy-back {
  position: absolute; top: 2px; left: 8px; z-index: 5;
}

/* Dragging an element in the preview (TASK-31d). */
.sy-living-canvas .sy-element { touch-action: none; cursor: grab; }
.sy-living-canvas .sy-element:active { cursor: grabbing; }

/* The "Cards" toggle only exists on a phone (TASK-31b). */
.sy-cards-toggle { display: none; }

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
