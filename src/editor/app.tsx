// src/editor/app.tsx
// Top-level screen switch for the Maker app (Start | Editor | Play).
//
// Owns the single EditorStore and re-renders the tree on any store change.
// On first mount it restores a saved stack from localStorage (if valid) and
// opens the editor on it; otherwise it shows the Start screen.

import { useMemo, useState, useRef } from "preact/hooks";
import type { JSX } from "preact";
import { EditorStore } from "./store.js";
import * as persistence from "./persistence.js";
import { announce, ensureAnnouncer } from "./a11y.js";
import { StartScreen } from "./StartScreen.js";
import { EditorScreen } from "./EditorScreen.js";
import "./styles.css";

/** Build the initial store, restoring a valid saved stack if present. */
function createInitialStore(onChange: () => void): EditorStore {
  ensureAnnouncer();
  const saved = persistence.load();
  const store = new EditorStore(
    saved !== null
      ? { stack: saved, screen: "editor" }
      : { screen: "start" },
    { onChange, announce },
  );
  return store;
}

export function App(): JSX.Element {
  // A cheap force-update: the store is the source of truth, not component state.
  const [, setTick] = useState(0);
  const forceRender = () => setTick((n) => n + 1);

  // A gentle Start-screen notice when a corrupted save was discarded on load.
  const discardedNotice = useRef<string | null>(null);

  const store = useMemo(() => {
    const hadRaw = typeof localStorage !== "undefined" && localStorage.getItem(persistence.STORAGE_KEY) !== null;
    const s = createInitialStore(() => forceRender());
    if (hadRaw && s.getStack() === null) {
      discardedNotice.current =
        "We couldn't open your last set of cards, so we've started fresh.";
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const state = store.getState();

  if (state.screen === "play") {
    // Play overlay renders on top; the editor stays mounted beneath it.
    return (
      <>
        <EditorScreen store={store} />
        <PlayMount store={store} />
      </>
    );
  }

  if (state.screen === "editor" && state.stack !== null) {
    return <EditorScreen store={store} />;
  }

  return (
    <StartScreen store={store} discardedNotice={discardedNotice.current} />
  );
}

// Lazy import avoids pulling the player bundle into the Start screen path.
import { PlayOverlay } from "./PlayOverlay.js";
function PlayMount({ store }: { store: EditorStore }): JSX.Element | null {
  return <PlayOverlay store={store} />;
}
