// src/editor/EditorScreen.tsx
// The editor screen shell: top bar + workspace (card list | canvas | inspector)
// + bottom toolbar. Fleshed out across TASK-13…TASK-16. For now it renders the
// shell with the canvas so TASK-11's smoke test can see the first card.

import type { JSX } from "preact";
import { useState } from "preact/hooks";
import type { EditorStore } from "./store.js";
import { TopBar } from "./TopBar.js";
import { Canvas } from "./Canvas.js";
import { CardList } from "./CardList.js";
import { Inspector } from "./Inspector.js";
import { Toolbar } from "./Toolbar.js";
import { ExportDone } from "./ExportDone.js";
import { PlayIcon } from "./icons.js";
import { exportStack as exportStackApi, triggerDownload } from "./api.js";
import { announce } from "./a11y.js";

export type FlashSide = "front" | "back";

export function EditorScreen({
  store,
  __demoNotice,
}: {
  store: EditorStore;
  /** Harness-only: force the invalid-edit banner for screenshots. */
  __demoNotice?: string;
}): JSX.Element {
  const state = store.getState();
  const stack = state.stack;
  // A transient plain-language banner for the most recent failed/rejected edit.
  const [notice, setNotice] = useState<string | null>(__demoNotice ?? null);
  // Which side of a flash card the canvas is previewing.
  const [flashSide, setFlashSide] = useState<FlashSide>("front");
  // Export state: in-flight flag, the last downloaded HTML (to re-trigger), and
  // the filename shown on the confirmation overlay (null = overlay hidden).
  const [exporting, setExporting] = useState(false);
  const [exportedName, setExportedName] = useState<string | null>(null);
  const [exportedHtml, setExportedHtml] = useState<string | null>(null);

  if (stack === null) return <div class="app" />;

  async function onExport(): Promise<void> {
    const current = store.getStack();
    if (current === null || !store.canExport()) return;
    setNotice(null);
    setExporting(true);
    const outcome = await exportStackApi(current);
    setExporting(false);
    if (outcome.ok) {
      triggerDownload(outcome.html, outcome.filename);
      setExportedHtml(outcome.html);
      setExportedName(outcome.filename);
      announce(`Your file is ready. Saved as ${outcome.filename}.`);
    } else {
      setNotice(outcome.message);
      announce(outcome.message);
    }
  }

  const selectedCard =
    stack.cards.find((c) => c.id === state.selectedCardId) ?? stack.cards[0]!;
  const isFlash = selectedCard.kind === "flash";

  const desc =
    stack.title.length > 0 ? stack.title : "Your set of cards";

  return (
    <div class="app">
      <TopBar>
        <span class="stack-desc">{desc}</span>
        <button
          class="tryit"
          type="button"
          aria-label="Try it: play these cards like the class will"
          onClick={() => store.setScreen("play")}
        >
          <PlayIcon />
          Try It
        </button>
      </TopBar>

      {notice !== null ? (
        <div class="notice" role="status">
          <span class="mark" aria-hidden="true">!</span>
          <span>{notice}</span>
        </div>
      ) : null}

      <div class="workspace">
        <CardList store={store} onNotice={setNotice} />
        <Canvas
          store={store}
          flashSide={flashSide}
          flashControl={
            isFlash ? (
              <div class="segmented" role="group" aria-label="Show front or back">
                <button
                  type="button"
                  aria-pressed={flashSide === "front" ? "true" : "false"}
                  onClick={() => setFlashSide("front")}
                >
                  Front
                </button>
                <button
                  type="button"
                  aria-pressed={flashSide === "back" ? "true" : "false"}
                  onClick={() => setFlashSide("back")}
                >
                  Back
                </button>
              </div>
            ) : null
          }
        />
        <Inspector store={store} onNotice={setNotice} />
      </div>

      <Toolbar
        store={store}
        onNotice={setNotice}
        onExport={() => void onExport()}
        exporting={exporting}
      />

      {exportedName !== null ? (
        <ExportDone
          filename={exportedName}
          onOpen={() => {
            if (exportedHtml !== null) {
              const blob = new Blob([exportedHtml], { type: "text/html" });
              const url = URL.createObjectURL(blob);
              window.open(url, "_blank");
            }
          }}
          onBack={() => setExportedName(null)}
          onExportAgain={() => {
            setExportedName(null);
            void onExport();
          }}
        />
      ) : null}
    </div>
  );
}
