// src/editor/StartScreen.tsx
// Start screen: sentence → generate. Matches the three Start mockups
// (start-empty / start-generating / start-error) in docs/design/maker/.

import { useState } from "preact/hooks";
import type { JSX } from "preact";
import type { Card } from "../shared/types.js";
import type { EditorStore } from "./store.js";
import { generateStackStream } from "./api.js";
import { announce } from "./a11y.js";
import { TopBar } from "./TopBar.js";
import { Ring, TileShape } from "./icons.js";

/** A card dealt onto the pile during progressive generation. */
interface DealtCard {
  index: number;
  total: number;
  kind: Card["kind"];
  /** The card's first question/term text, if any (shown on the dealt card). */
  question: string | null;
  /** Answer labels for a quiz card (up to four), for the tile preview. */
  answers: string[];
}

/** Pull a human-facing question/term and answer labels out of a streamed card. */
function summariseCard(card: Card, index: number, total: number): DealtCard {
  const firstText = card.elements.find((e) => e.type === "text");
  const question =
    firstText && firstText.type === "text" ? firstText.content : null;
  const answers = card.elements
    .filter((e): e is Extract<Card["elements"][number], { type: "button" }> => e.type === "button")
    .map((b) => b.label)
    .slice(0, 4);
  return { index, total, kind: card.kind, question, answers };
}

const PROMISE = "Make a clickable lesson from one sentence. Works offline.";

const EXAMPLES: ReadonlyArray<{ label: string; sentence: string }> = [
  {
    label: "Vikings in Ireland quiz",
    sentence:
      "A lesson about the Vikings in Ireland with quiz questions and a story choice, the right answer plays a cheer",
  },
  { label: "Times tables game", sentence: "A quiz game for the times tables up to 12" },
  { label: "Irish words flashcards", sentence: "Flashcards for ten everyday words in Irish" },
];

export function StartScreen({
  store,
  discardedNotice,
  __demoError,
  __demoDealt,
  __demoTotal,
  __demoOffline,
}: {
  store: EditorStore;
  discardedNotice?: string | null;
  /** Harness-only: force the error state for screenshots. */
  __demoError?: string;
  /** Harness-only: seed the generating screen's dealt pile for screenshots. */
  __demoDealt?: DealtCard[];
  __demoTotal?: number;
  /** Harness-only: show the generating screen's honest offline wording. */
  __demoOffline?: boolean;
}): JSX.Element {
  const [sentence, setSentence] = useState(
    __demoError
      ? EXAMPLES[0]!.sentence
      : // Pre-fill the Vikings example as real text so one click on Build Cards
        // gives the demo, and Build Cards starts enabled (built-app review:
        // start-empty had an empty textarea and a disabled button).
        EXAMPLES[0]!.sentence,
  );
  const [error, setError] = useState<string | null>(__demoError ?? null);
  // Cards dealt so far during progressive generation, and the expected total.
  const [dealt, setDealt] = useState<DealtCard[]>(__demoDealt ?? []);
  const [total, setTotal] = useState<number>(__demoTotal ?? 0);
  // True once the server tells us this run is the offline fallback (a
  // ready-made deck, no live model). The building line is honest for each path:
  // "About 20 seconds." only for the live model; offline just says each card
  // appears as it's ready, with no time (built-app review round 2, P1 #3).
  const [offline, setOffline] = useState<boolean>(__demoOffline ?? false);

  const status = store.getState().status;
  const generating = status === "generating";
  const canBuild = sentence.trim().length > 0 && !generating;

  async function build(): Promise<void> {
    if (sentence.trim().length === 0) return;
    setError(null);
    setDealt([]);
    setTotal(0);
    setOffline(false);
    store.setStatus("generating");

    const outcome = await generateStackStream(sentence.trim(), {
      onStart: ({ total: t, isFallback, isReadyMadeExample }) => {
        setTotal(t);
        // The fallback (and any ready-made example) is the offline path.
        setOffline(isFallback || isReadyMadeExample);
      },
      onCard: ({ index, card, total: t }) => {
        setTotal(t);
        // Deal this card onto the pile with its real question. We append in
        // arrival order; the GeneratingScreen shows the latest on top.
        setDealt((prev) => [...prev, summariseCard(card, index, t)]);
        announce(
          t > 0 ? `Card ${index + 1} of ${t} ready.` : `Card ${index + 1} ready.`,
        );
      },
      onReset: () => {
        // The server abandoned a partial stream and is restarting from a
        // fallback. Clear the cards dealt so far so the pile matches the
        // replacement stack. The replacement's own `start` sets `offline`.
        setDealt([]);
        setTotal(0);
        setOffline(false);
      },
    });

    if (outcome.ok) {
      store.setStack(outcome.stack, {
        isFallback: outcome.isFallback,
        isReadyMadeExample: outcome.isReadyMadeExample,
      });
      store.setStatus("idle");
      announce(
        outcome.isReadyMadeExample
          ? "We couldn't reach the internet, so here's a ready-made example you can edit."
          : outcome.isFallback
            ? "Your cards are ready. We built them offline."
            : "Your cards are ready.",
      );
    } else {
      store.setStatus("idle");
      setDealt([]);
      setTotal(0);
      setError(outcome.message);
      announce(outcome.message);
    }
  }

  if (generating) {
    return <GeneratingScreen dealt={dealt} total={total} offline={offline || (__demoOffline ?? false)} />;
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

/**
 * The "building your cards…" state (start-generating mockup). Cards are dealt
 * onto the pile one by one as they stream in from POST /api/generate, each with
 * its real question and an "N of M" label. Until the first card arrives it
 * shows the preparing state; the mockup look is preserved for both.
 */
function GeneratingScreen({
  dealt,
  total,
  offline,
}: {
  dealt: DealtCard[];
  total: number;
  /** True on the offline fallback path (a ready-made deck, no live model). */
  offline: boolean;
}): JSX.Element {
  const dealtCount = dealt.length;
  // The three most recently dealt cards form the fanned pile; the newest lands
  // on top (c4) with its question and tiles, matching the mockup.
  const recent = dealt.slice(-4);
  const top = recent.length > 0 ? recent[recent.length - 1]! : null;
  const behind = recent.slice(0, -1); // up to three cards behind the top one

  // On the real LLM stream the total is not known up front (total === 0): show
  // a live count of what's been dealt instead of "N of M". On the fallback
  // path the total is known, so "N of M" / "All M ready" is used.
  // Show the count DEALT so far so the counter matches the top card's own
  // "Card N of M" (built-app review: they were off by one).
  const counter =
    total > 0
      ? dealtCount >= total
        ? `All ${total} cards ready`
        : `Card ${Math.min(dealtCount, total)} of ${total}`
      : dealtCount > 0
        ? `Card ${dealtCount} ready`
        : "Working…";

  return (
    <div class="app">
      <TopBar>
        <span class="promise">{PROMISE}</span>
      </TopBar>
      <main class="build-area" aria-busy="true" aria-label="Building your cards">
        <div class="status">
          <h1>Building your cards…</h1>
          <p>
            {offline
              ? "Each card appears as it's ready."
              : "Each card appears as it's ready. About 20 seconds."}
          </p>
          <p class="counter" aria-live="polite">{counter}</p>
        </div>
        <div class="deal" aria-hidden="true">
          {/* Cards behind the top one, fanned. We always render three slots so
              the pile has depth even early on. */}
          {[0, 1, 2].map((slot) => {
            const card = behind[behind.length - 3 + slot];
            const label =
              card != null ? `Card ${card.index + 1} · ready` : "";
            return (
              <div class={`deal-card c${slot + 1}`} key={`behind-${slot}`}>
                {label ? <p class="deal-num">{label}</p> : null}
              </div>
            );
          })}
          {/* The newest card, landed on top. */}
          <div class="deal-card c4" key={top ? `top-${top.index}` : "top-empty"}>
            <div class="deal-rings">
              <Ring />
              <Ring />
            </div>
            <p class="deal-num">
              {top
                ? top.total > 0
                  ? `Card ${top.index + 1} of ${top.total}`
                  : `Card ${top.index + 1}`
                : "Preparing…"}
            </p>
            {top?.question ? <p class="deal-q">{top.question}</p> : null}
            {top && top.kind === "quiz" ? (
              <div class="deal-tiles">
                <span class="deal-tile" style="background:var(--color-tile-a);"></span>
                <span class="deal-tile" style="background:var(--color-tile-b);"></span>
                <span class="deal-tile" style="background:var(--color-tile-c);"></span>
                <span class="deal-tile" style="background:var(--color-tile-d);"></span>
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
