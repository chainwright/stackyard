// src/editor/StartScreen.tsx
// Start screen: sentence → generate. Matches the three Start mockups
// (start-empty / start-generating / start-error) in docs/design/maker/.

import { useState } from "preact/hooks";
import type { JSX } from "preact";
import type { EditorStore } from "./store.js";
import { generateStack } from "./api.js";
import { announce } from "./a11y.js";
import { TopBar } from "./TopBar.js";
import { Ring, TileShape } from "./icons.js";

const PROMISE = "Make a clickable lesson from one sentence. Works offline.";

const EXAMPLES: ReadonlyArray<{ label: string; sentence: string }> = [
  {
    label: "Vikings in Ireland quiz",
    sentence:
      "A 10-card quiz about the Vikings in Ireland, the right answer plays a cheer",
  },
  { label: "Times tables game", sentence: "A quiz game for the times tables up to 12" },
  { label: "Irish words flashcards", sentence: "Flashcards for ten everyday words in Irish" },
];

export function StartScreen({
  store,
  discardedNotice,
  __demoError,
}: {
  store: EditorStore;
  discardedNotice?: string | null;
  /** Harness-only: force the error state for screenshots. */
  __demoError?: string;
}): JSX.Element {
  const [sentence, setSentence] = useState(
    __demoError
      ? "A 10-card quiz about the Vikings in Ireland, the right answer plays a cheer"
      : "",
  );
  const [error, setError] = useState<string | null>(__demoError ?? null);

  const status = store.getState().status;
  const generating = status === "generating";
  const canBuild = sentence.trim().length > 0 && !generating;

  async function build(): Promise<void> {
    if (sentence.trim().length === 0) return;
    setError(null);
    store.setStatus("generating");
    const outcome = await generateStack(sentence.trim());
    if (outcome.ok) {
      store.setStack(outcome.stack, { isFallback: outcome.isFallback });
      store.setStatus("idle");
      announce(
        outcome.isFallback
          ? "Your cards are ready. We built them offline."
          : "Your cards are ready.",
      );
    } else {
      store.setStatus("idle");
      setError(outcome.message);
      announce(outcome.message);
    }
  }

  if (generating) {
    return <GeneratingScreen />;
  }

  return (
    <div class="app">
      <TopBar>
        <span class="promise">{PROMISE}</span>
      </TopBar>

      <main class="start-area">
        <div class="stage-start">
          {/* Result stack peeking out: sentence in → cards out */}
          <div class="peek" aria-hidden="true">
            <div class="peek-edge peek-edge-1"></div>
            <div class="peek-card">
              <p class="peek-meta">Card 3 of 10</p>
              <div class="peek-tiles">
                <span class="peek-tile" style="background:var(--color-tile-a); color:var(--color-ink);"><TileShape slot={0} /> Dublin</span>
                <span class="peek-tile" style="background:var(--color-tile-b); color:var(--color-ink);"><TileShape slot={1} /> Cork</span>
                <span class="peek-tile" style="background:var(--color-tile-c); color:var(--color-ink);"><TileShape slot={2} /> Galway</span>
                <span class="peek-tile" style="background:var(--color-tile-d); color:var(--color-white);"><TileShape slot={3} /> Sligo</span>
              </div>
            </div>
          </div>

          <section class="start-card" aria-label="Start a new set of cards">
            <div class="start-rings" aria-hidden="true">
              <Ring />
              <Ring />
            </div>
            <div class="start-inner">
              {error !== null ? (
                <h1>Let's try that again</h1>
              ) : (
                <h1>What would you like to teach?</h1>
              )}

              {discardedNotice ? (
                <div class="offline-notice" role="status">
                  <span>{discardedNotice}</span>
                </div>
              ) : null}

              {error !== null ? (
                <div class="error-notice" role="alert">
                  <span class="mark" aria-hidden="true">!</span>
                  <span>{error}</span>
                </div>
              ) : (
                <p class="lede">
                  Describe your lesson in a sentence. Stackyard builds a set of
                  cards you can play with the class.
                </p>
              )}

              <label class="field-label" for="sentence">Your sentence</label>
              <textarea
                id="sentence"
                class="sentence"
                aria-label="Your sentence"
                value={sentence}
                onInput={(e) => setSentence((e.target as HTMLTextAreaElement).value)}
              />

              {error === null ? (
                <div class="examples" aria-label="Or start from an example">
                  {EXAMPLES.map((ex) => (
                    <button
                      class="example-tab"
                      type="button"
                      onClick={() => setSentence(ex.sentence)}
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>
              ) : null}

              <div class="actions">
                <button
                  class="build-btn"
                  type="button"
                  disabled={!canBuild}
                  onClick={() => void build()}
                >
                  Build Cards
                </button>
                <span class="hint">
                  {error !== null
                    ? "Your sentence is still here."
                    : "Or tap an example to fill it in."}
                </span>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

/** The "building your cards…" state (start-generating mockup). */
function GeneratingScreen(): JSX.Element {
  return (
    <div class="app">
      <TopBar>
        <span class="promise">{PROMISE}</span>
      </TopBar>
      <main class="build-area" aria-busy="true" aria-label="Building your cards">
        <div class="status">
          <h1>Building your cards…</h1>
          <p>About 20 seconds. Each card appears as it's ready.</p>
          <p class="counter" aria-live="polite">Working…</p>
        </div>
        <div class="deal" aria-hidden="true">
          <div class="deal-card c1"><p class="deal-num">Card 1 · ready</p></div>
          <div class="deal-card c2"><p class="deal-num">Card 2 · ready</p></div>
          <div class="deal-card c3"><p class="deal-num">Card 3 · ready</p></div>
          <div class="deal-card c4">
            <div class="deal-rings">
              <Ring />
              <Ring />
            </div>
            <p class="deal-num">Card 4</p>
            <p class="deal-q">Who led the first Viking raid?</p>
            <div class="deal-tiles">
              <span class="deal-tile" style="background:var(--color-tile-a);"></span>
              <span class="deal-tile" style="background:var(--color-tile-b);"></span>
              <span class="deal-tile" style="background:var(--color-tile-c);"></span>
              <span class="deal-tile" style="background:var(--color-tile-d);"></span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
