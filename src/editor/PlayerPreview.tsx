// src/editor/PlayerPreview.tsx
// "Open the File" preview — plays the exported stack IN-APP via the shared
// mountPlayer, the exact renderer the exported file runs.
//
// Why not open the blob: the exported file opened as a `blob:` URL inherits the
// app's strict CSP (`script-src 'self'`, `font-src 'self'`), which blocks the
// player's inline <script> and its data: fonts, so the page is blank (J4 H1,
// 5 Nov panel). Playing the same stack through mountPlayer in a same-origin
// overlay sidesteps the CSP entirely and shows exactly what the class will see.
// The downloaded file still plays fine from disk (where no app CSP applies).

import { useEffect, useRef } from "preact/hooks";
import type { JSX } from "preact";
import type { Stack } from "../shared/types.js";
import { mountPlayer } from "../player/mount.js";

export function PlayerPreview({
  stack,
  onClose,
}: {
  stack: Stack;
  onClose: () => void;
}): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // mountPlayer owns the whole area and starts at card 1, flipping on every
    // card change — exactly the exported file's behaviour.
    const teardown = mountPlayer(stack, root, { flip: true });
    return () => teardown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape closes the preview.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div class="player-preview" role="dialog" aria-label="Playing your file">
      <button class="player-preview-close" type="button" onClick={onClose} aria-label="Close the preview">
        Close
      </button>
      <div class="player-preview-stage" ref={rootRef} />
    </div>
  );
}
