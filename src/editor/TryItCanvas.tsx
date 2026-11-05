// src/editor/TryItCanvas.tsx
// "Try It" — the editor WOW (editor-try.html). The teacher presses Try It and
// the SAME card they were editing flips over in place and plays exactly as the
// class will see it, INSIDE the editor shell (top bar, card list, inspector and
// toolbar stay put). "Back to Editing" flips back to the same card.
//
// It runs the SHARED mountPlayer — the exact code the exported file runs — so
// Try It proves the real thing, not a mock. mountPlayer starts at the selected
// card and flips on every card change; here we give it an area-fit scaler so
// the live card sits in the editor canvas rather than taking over the page.

import { useEffect, useRef } from "preact/hooks";
import type { JSX } from "preact";
import type { EditorStore } from "./store.js";
import { mountPlayer } from "../player/mount.js";

/**
 * Area-fit scaler for the live card inside the editor canvas. Mirrors
 * Canvas.tsx: scale the `.sy-card-stack` the player renders to fit the area,
 * clamped ≥ 0.9 (design-system), from the top-left. It never touches
 * document.body, so the editor layout around it is undisturbed.
 */
function makeAreaScaler(area: HTMLElement): (root: HTMLElement) => () => void {
  return (root: HTMLElement) => {
    root.style.transformOrigin = "top left";

    const recompute = (): void => {
      if (!area.isConnected) return;
      const w = area.clientWidth;
      const h = area.clientHeight - 60; // room for the "Back to Editing" pill
      const s = Math.max(0.9, Math.min(Math.min((w - 48) / 812, (h - 48) / 612), 1.35));
      const stackEl = root.querySelector<HTMLElement>(".sy-card-stack");
      if (stackEl) {
        stackEl.style.transform = `scale(${s})`;
        stackEl.style.transformOrigin = "top left";
      }
      root.style.width = `${820 * s}px`;
      root.style.height = `${640 * s}px`;
    };

    recompute();
    // The player re-renders .sy-card-stack on each navigation; a MutationObserver
    // re-applies the scale to the fresh node.
    const mo =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(recompute)
        : null;
    mo?.observe(root, { childList: true });

    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(recompute) : null;
    ro?.observe(area);

    return () => {
      mo?.disconnect();
      ro?.disconnect();
    };
  };
}

export function TryItCanvas({ store }: { store: EditorStore }): JSX.Element {
  const areaRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const teardownRef = useRef<(() => void) | null>(null);

  const stack = store.getStack();
  const startCardId = store.getState().selectedCardId ?? stack?.cards[0]?.id;

  useEffect(() => {
    const area = areaRef.current;
    const root = rootRef.current;
    if (!area || !root || stack === null) return;
    teardownRef.current = mountPlayer(stack, root, {
      ...(startCardId != null ? { startCardId } : {}),
      flip: true,
      scaler: makeAreaScaler(area),
    });
    return () => {
      teardownRef.current?.();
      teardownRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * "Back to Editing" flips the live card up from the ring edge (the same
   * card-exit rotateX the class sees on a card advance), then switches to the
   * editor — so the card visibly flips back instead of snapping (built-app
   * review round 2, P2 #6). Under prefers-reduced-motion it switches at once.
   */
  function backToEditing(): void {
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cardEl = rootRef.current?.querySelector<HTMLElement>(".sy-card");
    if (!reduce && cardEl) {
      cardEl.style.transformOrigin = "top center";
      cardEl.style.animation = "card-exit 240ms ease-out forwards";
      window.setTimeout(() => store.setScreen("editor"), 240);
      return;
    }
    store.setScreen("editor");
  }

  return (
    <main class="canvas-area tryit-area" aria-label="Trying the card" ref={areaRef}>
      <button class="try-pill" type="button" onClick={backToEditing} aria-label="Stop trying and go back to editing">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 7L4 12l5 5M4 12h11a5 5 0 010 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        Back to Editing
      </button>
      <div class="tryit-stage" ref={rootRef} />
    </main>
  );
}
