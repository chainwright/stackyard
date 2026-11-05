// src/editor/PlayOverlay.tsx
// Play mode (TASK-17). A full-screen overlay that covers the editor and runs
// the current stack through the SHARED mountPlayer(stack, root) — the exact
// function the exported player entry calls — so Play mode is literally the code
// the class gets. No editing chrome is shown while playing.
//
// On exit the teardown handle mountPlayer returned is called and the editor is
// restored with the previous selection; nothing is written back to state.stack
// (playing never edits — REQ-MKR-11).

import { useEffect, useRef } from "preact/hooks";
import type { JSX } from "preact";
import type { EditorStore } from "./store.js";
import { mountPlayer } from "../player/mount.js";

export function PlayOverlay({ store }: { store: EditorStore }): JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null);
  const teardownRef = useRef<(() => void) | null>(null);

  const stack = store.getStack();

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || stack === null) return;
    // Mount the class's exact player over the current stack.
    teardownRef.current = mountPlayer(stack, stage);
    return () => {
      // Tear down the throwaway runtime on unmount / exit.
      teardownRef.current?.();
      teardownRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function exit(): void {
    // Teardown runs via the effect cleanup when we leave the play screen.
    store.setScreen("editor");
  }

  return (
    <div class="play-root">
      <header class="play-topbar">
        <span class="wordmark">Stackyard</span>
        <button
          class="exit"
          type="button"
          aria-label="Stop playing and go back to editing"
          onClick={exit}
        >
          Back to Editing
        </button>
      </header>
      {/* The shared player renders here; applyScaling styles the stage itself. */}
      <main class="play-stage" aria-label="Card">
        <div ref={stageRef} />
      </main>
    </div>
  );
}
