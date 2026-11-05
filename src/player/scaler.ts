// src/player/scaler.ts
// Scales the 800×600 card canvas to fit the current viewport using CSS transform.
// The canvas is centred in the viewport on the desk-surface backdrop.
// No framework. No external dependencies. Vanilla TypeScript.

/**
 * Applies CSS transform scaling to `root` so the 800×600 canvas fills the
 * viewport as large as possible while preserving aspect ratio, with a small
 * margin (5 % each side so the card never bleeds to the screen edge).
 *
 * Strategy:
 *   - `body` is set to flex-centre (done here so it works even when the
 *     style tag hasn't been injected yet).
 *   - `root` is 800×600 with `transform-origin: center center`.
 *     Scaling from the centre keeps the element centred inside the flexbox
 *     without needing translate offsets.
 *   - factor = min((vw * 0.95) / 800, (vh * 0.95) / 600)
 *     The 0.95 factor gives a 2.5 % margin on each side.
 *
 * A `ResizeObserver` on `document.body` recalculates when the viewport changes.
 *
 * @param root - The element representing the 800×600 card canvas.
 * @returns A cleanup function that disconnects the ResizeObserver.
 */
export function applyScaling(root: HTMLElement): () => void {
  // ---- Body: centred flex, desk-surface backdrop ----
  const body = document.body;
  body.style.margin = "0";
  body.style.padding = "0";
  body.style.width = "100vw";
  body.style.height = "100vh";
  body.style.display = "flex";
  body.style.alignItems = "center";
  body.style.justifyContent = "center";
  body.style.overflow = "hidden";
  // Warm wood desk (#C9A47C) + a faint CSS grain, matching design-system.md
  // (no image, so the exported file stays self-contained).
  body.style.background = "#C9A47C";
  body.style.backgroundImage =
    "repeating-linear-gradient(90deg, rgba(30,42,71,.025) 0 2px, transparent 2px 9px)";

  // ---- Root: fixed 800×600 canvas ----
  root.style.width = "800px";
  root.style.height = "600px";
  root.style.position = "relative";
  root.style.flexShrink = "0";
  // Scale from the centre so the element stays centred in the flexbox.
  root.style.transformOrigin = "center center";

  function recalculate(): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // 5 % breathing room on each side (0.90 total = 0.95 each axis).
    const factor = Math.min((vw * 0.90) / 800, (vh * 0.90) / 600);
    root.style.transform = `scale(${factor})`;
  }

  // Initial scale.
  recalculate();

  // Recompute on viewport resize.
  const observer = new ResizeObserver(recalculate);
  observer.observe(document.body);

  return function cleanup(): void {
    observer.disconnect();
  };
}
