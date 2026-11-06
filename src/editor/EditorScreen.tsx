// src/editor/EditorScreen.tsx
// The editor screen shell: top bar + workspace (card list | canvas | inspector)
// + bottom toolbar. Fleshed out across TASK-13…TASK-16. For now it renders the
// shell with the canvas so TASK-11's smoke test can see the first card.

import type { JSX } from "preact";
import { useState } from "preact/hooks";
import type { EditorStore } from "./store.js";
import { TopBar } from "./TopBar.js";
import { Canvas } from "./Canvas.js";
import { TryItCanvas } from "./TryItCanvas.js";
import { CardList } from "./CardList.js";
import { Inspector } from "./Inspector.js";
import { Toolbar } from "./Toolbar.js";
import { ExportDone } from "./ExportDone.js";
import { PlayerPreview } from "./PlayerPreview.js";
import { fallbackMessage } from "./fallbackMessages.js";
import { repairFlow } from "./operations.js";
import { PlayIcon } from "./icons.js";
import { exportStack as exportStackApi, triggerDownload } from "./api.js";
import type { ExportKind } from "./api.js";
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
  // When the open stack is an offline ready-made example (no internet to build
  // from the teacher's sentence), start with an honest note they can dismiss.
  const [notice, setNotice] = useState<string | null>(
    __demoNotice ??
      (state.isFallback
        ? fallbackMessage(state.fallbackReason, state.fallbackOnline)
        : null),
  );
  // Which side of a flash card the canvas is previewing.
  const [flashSide, setFlashSide] = useState<FlashSide>("front");
  // Export state: in-flight flag, the last downloaded HTML (to re-trigger), and
  // the filename shown on the confirmation overlay (null = overlay hidden).
  const [exporting, setExporting] = useState(false);
  const [exportedName, setExportedName] = useState<string | null>(null);
  // Which kind of file to export (TASK-24). Defaults to the living file — the
  // one the teacher can edit later without Stackyard.
  const [exportKind, setExportKind] = useState<ExportKind>("living");
  // The kind of the file that was just exported (the toolbar choice may change
  // while the confirmation is open); drives the Teacher-tab hint.
  const [exportedLiving, setExportedLiving] = useState(true);
  // When set, play the exported stack in-app (avoids the blob CSP blank page,
  // J4 H1). We play the current stack through the shared mountPlayer.
  const [previewing, setPreviewing] = useState(false);

  if (stack === null) return <div class="app" />;

  async function onExport(kind: ExportKind = exportKind): Promise<void> {
    const current = store.getStack();
    if (current === null || !store.canExport()) return;
    setNotice(null);
    setExporting(true);
    const outcome = await exportStackApi(current, kind);
    setExporting(false);
    if (outcome.ok) {
      triggerDownload(outcome.html, outcome.filename);
      setExportedLiving(kind === "living");
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
  const trying = state.screen === "play";
  // Try It starts on the card being edited. When that is not the first card,
  // the end-card score counts every question in the set, but the teacher only
  // played from here — so say so plainly (built-app review round 2, P2 #8).
  const tryStartIndex = stack.cards.findIndex((c) => c.id === selectedCard.id);
  const tryingFromMidDeck = trying && tryStartIndex > 0;

  const desc =
    stack.title.length > 0 ? stack.title : "Your set of cards";

  return (
    <div class="app">
      {/* Phone-width guard (J1): the editor needs room to drag and inspect, so
          below a tablet width show a polite notice instead of a broken layout.
          The exported file plays fine on any device — only the EDITOR needs a
          bigger screen. Shown/hidden purely by CSS media query. */}
      <div class="small-screen-notice" role="note">
        <div class="small-screen-card">
          <h1>Open on a laptop or tablet</h1>
          <p>
            Stackyard's editor needs a laptop or tablet to move cards around. The
            files it makes play on any device, including this one.
          </p>
        </div>
      </div>

      <TopBar>
        <span class="stack-desc">{desc}</span>
        <button
          class="tryit"
          type="button"
          aria-pressed={trying ? "true" : "false"}
          aria-label={
            trying
              ? "Trying this card like the class will"
              : "Try it: play these cards like the class will"
          }
          onClick={() => {
            // Entering or leaving Try It clears any transient notice: it was
            // raised while editing a specific card and must not carry into the
            // play view, where it would push the canvas down and sit over the
            // "Back to Editing" pill (built-app review round 3, P1 #1).
            setNotice(null);
            store.setScreen(trying ? "editor" : "play");
          }}
        >
          <PlayIcon />
          {trying ? "Trying It" : "Try It"}
        </button>
      </TopBar>

      {notice !== null && !trying ? (
        <div class="notice" role="status">
          <span class="mark" aria-hidden="true">!</span>
          <span>{notice}</span>
        </div>
      ) : null}

      <div class="workspace">
        <CardList store={store} onNotice={setNotice} />
        {trying ? (
          <TryItCanvas store={store} />
        ) : (
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
        )}
        {trying ? (
          <aside class="inspector inspector-trying" aria-label="Try It">
            <h2>Trying your card</h2>
            <p class="readout readout-box">
              You pressed <strong>Try It</strong>. The card flips over and plays
              exactly as the class will see it.
            </p>
            <p class="hint">
              Tap an answer to hear the cheer or the buzz. The right answer earns
              a stamp. Press <strong>Back to Editing</strong> and it flips back to
              the same card.
            </p>
            {tryingFromMidDeck ? (
              <p class="hint hint-warn" role="status">
                You started on card {tryStartIndex + 1}. The class begins at card
                one, so the final score here only counts the cards you played.
              </p>
            ) : null}
          </aside>
        ) : (
          <Inspector store={store} onNotice={setNotice} />
        )}
      </div>

      <Toolbar
        store={store}
        onNotice={setNotice}
        onExport={() => void onExport()}
        exportKind={exportKind}
        onExportKind={setExportKind}
        exporting={exporting}
        disabled={trying}
      />

      {exportedName !== null ? (
        <ExportDone
          living={exportedLiving}
          filename={exportedName}
          stack={stack}
          onOpen={() => {
            // Play it in-app (not a blob: window, which the CSP blanks — J4 H1).
            setPreviewing(true);
          }}
          onBack={() => setExportedName(null)}
          onExportAgain={() => {
            setExportedName(null);
            void onExport();
          }}
          onFixFlow={() => {
            // Link unreachable cards into the flow, then export the fixed stack.
            const res = store.apply((s) => repairFlow(s));
            setExportedName(null);
            if (res.ok) void onExport();
            else setNotice(res.message);
          }}
        />
      ) : null}

      {previewing && stack !== null ? (
        <PlayerPreview stack={stack} onClose={() => setPreviewing(false)} />
      ) : null}
    </div>
  );
}
