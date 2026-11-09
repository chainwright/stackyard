// src/editor/StartScreen.tsx
// Start screen: sentence → generate. Matches the three Start mockups
// (start-empty / start-generating / start-error) in docs/design/maker/.

import { useEffect, useState } from "preact/hooks";
import type { JSX } from "preact";
import type { Card } from "../shared/types.js";
import type { EditorStore } from "./store.js";
import { generateStackStream } from "./api.js";
import { announce } from "./a11y.js";
import { TopBar } from "./TopBar.js";
import { Ring, TileShape } from "./icons.js";
import { fallbackMessage, browserOnline } from "./fallbackMessages.js";
import {
  READY_MADE_DECKS,
  buildReadyMadeDeck,
  buildTypedStack,
  type ReadyMadeKey,
  type TypedQuestion,
} from "./localDecks.js";

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

const PROMISE = "Make a clickable lesson from one sentence. The lesson file works offline.";

/** True when the teacher's sentence asks for pictures, which the builder does not add. */
export function asksForPictures(sentence: string): boolean {
  return /\b(pictures?|photos?|photographs?|images?|illustrations?|drawings?|diagrams?)\b/i.test(sentence);
}

/** The plain note shown when pictures were asked for and were not added. */
export const PICTURES_NOTE = "Pictures aren't added automatically yet. Use Add Picture.";

/** Shown when the builder moved a closing message onto the last card (TASK-30a). */
export const CLOSING_MESSAGE_NOTE = "We moved your closing message onto the last card.";

const EXAMPLES: ReadonlyArray<{ label: string; sentence: string }> = [
  {
    label: "Vikings quiz",
    sentence:
      "A lesson about the Vikings in Ireland with quiz questions and a story choice, the right answer plays a cheer",
  },
  { label: "Times tables game", sentence: "A quiz game for the times tables up to 12" },
  { label: "Irish word cards", sentence: "Flashcards for ten everyday words in Irish" },
];

export function StartScreen({
  store,
  discardedNotice,
  __demoError,
  __demoDealt,
  __demoTotal,
  __demoOffline,
  __demoTitle,
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
  /** Harness-only: the title the stream's `start` event has announced. */
  __demoTitle?: string;
}): JSX.Element {
  // Start EMPTY with a grey example in the placeholder; the three example chips
  // fill the box on tap (J2: a pre-filled real sentence read like someone had
  // left their text there). The error state keeps whatever the teacher typed,
  // which the harness seeds via __demoError.
  const [sentence, setSentence] = useState(__demoError ? EXAMPLES[0]!.sentence : "");
  const [error, setError] = useState<string | null>(__demoError ?? null);
  // Cards dealt so far during progressive generation, and the expected total.
  const [dealt, setDealt] = useState<DealtCard[]>(__demoDealt ?? []);
  const [total, setTotal] = useState<number>(__demoTotal ?? 0);
  // True once the server tells us this run is the offline fallback (a
  // ready-made deck, no live model). The building line is honest for each path:
  // "About 20 seconds." only for the live model; offline just says each card
  // appears as it's ready, with no time (built-app review round 2, P1 #3).
  const [offline, setOffline] = useState<boolean>(__demoOffline ?? false);
  // The set's title, known the moment the stream's `start` event arrives (long
  // before the first card). Shown on the wait screen so ~10–25 s of "Preparing…"
  // never looks frozen (TASK-26f).
  const [startTitle, setStartTitle] = useState<string | null>(__demoTitle ?? null);

  // "Type your own questions" form (J2 item q): shown on request, no server.
  const [typing, setTyping] = useState(false);

  const status = store.getState().status;
  const generating = status === "generating";
  const canBuild = sentence.trim().length > 0 && !generating;

  /** Load a ready-made deck CLIENT-SIDE (no server) — the 429/failure way out. */
  function openReadyMade(key: ReadyMadeKey): void {
    const stack = buildReadyMadeDeck(key);
    // The teacher chose this deck: it is not a failure, so say so honestly
    // ("chosen"), never "the lesson builder is resting" (TASK-26i).
    store.setStack(stack, { isFallback: true, isReadyMadeExample: false, fallbackReason: "chosen", fallbackOnline: browserOnline() });
    store.setStatus("idle");
    announce("Here's a ready-made deck you can edit.");
  }

  async function build(): Promise<void> {
    if (sentence.trim().length === 0) return;
    setError(null);
    setDealt([]);
    setTotal(0);
    setOffline(false);
    setStartTitle(null);
    store.setStatus("generating");

    const outcome = await generateStackStream(sentence.trim(), {
      onStart: ({ total: t, isFallback, title }) => {
        setTotal(t);
        setStartTitle(title.trim().length > 0 ? title : null);
        // A fallback deck is the offline/ready-made path; the honest wording is
        // chosen from the reason when the run completes.
        setOffline(isFallback);
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
        setStartTitle(null);
      },
    });

    if (outcome.ok) {
      const online = browserOnline();
      store.setStack(outcome.stack, {
        isFallback: outcome.isFallback,
        isReadyMadeExample: outcome.isReadyMadeExample,
        ...(outcome.fallbackReason ? { fallbackReason: outcome.fallbackReason } : {}),
        fallbackOnline: online,
        // A teacher who asked for pictures and got a deck without any should be
        // told, in one line, instead of wondering where they went (TASK-27t). A folded
        // closing message is told too (TASK-30a).
        ...(() => {
          const notes: string[] = [];
          if (!outcome.isFallback && asksForPictures(sentence)) notes.push(PICTURES_NOTE);
          if (outcome.movedClosingMessage === true) notes.push(CLOSING_MESSAGE_NOTE);
          return notes.length > 0 ? { note: notes.join(" ") } : {};
        })(),
      });
      store.setStatus("idle");
      announce(
        outcome.isFallback
          ? fallbackMessage(outcome.fallbackReason, online)
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
    return (
      <GeneratingScreen
        dealt={dealt}
        total={total}
        offline={offline || (__demoOffline ?? false)}
        title={startTitle}
        sentence={sentence.trim()}
      />
    );
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
                placeholder="e.g. A 6-card quiz about the water cycle for 4th class"
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

              {/* Always-available ways to start without the AI: ONE line of ready-made
                  decks (built locally) and a quick type-your-own form. On the
                  429/failure screen these are the only way forward. They are plain
                  text links, visibly different from the example chips above, so the
                  same names no longer do two different things (TASK-27d). */}
              <div class="ready-made" aria-label="Start without the AI">
                <p class="ready-made-row">
                  <span class="ready-made-lede">Or open a ready-made deck:</span>
                  {READY_MADE_DECKS.map((d, i) => (
                    <span class="ready-made-item">
                      <button
                        class="ready-made-link"
                        type="button"
                        title={d.label}
                        onClick={() => openReadyMade(d.key)}
                      >
                        {d.name}
                      </button>
                      {i < READY_MADE_DECKS.length - 1 ? <span aria-hidden="true"> · </span> : null}
                    </span>
                  ))}
                </p>
                <p class="lesson-file-line">
                  <a
                    class="lesson-file-link"
                    href="/samples/vikings-in-ireland.html"
                    target="_blank"
                    rel="noopener"
                  >
                    Open a lesson file (works with Wi-Fi off)
                  </a>
                  <span class="lesson-file-hint"> Try the Teacher tab in its corner.</span>
                </p>
                <button
                  class="link-btn type-own-toggle"
                  type="button"
                  onClick={() => setTyping((v) => !v)}
                  aria-expanded={typing ? "true" : "false"}
                >
                  {typing ? "Hide the question form" : "Type your own questions"}
                </button>
                {typing ? (
                  <TypeYourOwn
                    onBuilt={(stack) => {
                      store.setStack(stack, { isFallback: false, isReadyMadeExample: false });
                      store.setStatus("idle");
                      announce("Your cards are ready.");
                    }}
                  />
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

/**
 * "Type your own questions" — a local quiz builder (J2 item q). Each row is a
 * question with a right answer and up to three wrong answers. Build turns the
 * rows into a playable stack through the shared validator, with NO server call.
 */
function TypeYourOwn({ onBuilt }: { onBuilt: (stack: import("../shared/types.js").Stack) => void }): JSX.Element {
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState<TypedQuestion[]>([
    { question: "", right: "", wrong: ["", ""] },
  ]);
  const [formError, setFormError] = useState<string | null>(null);

  function update(i: number, patch: Partial<TypedQuestion>): void {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function updateWrong(i: number, j: number, value: string): void {
    setRows((prev) =>
      prev.map((r, idx) =>
        idx === i ? { ...r, wrong: r.wrong.map((w, k) => (k === j ? value : w)) } : r,
      ),
    );
  }
  function addRow(): void {
    setRows((prev) => [...prev, { question: "", right: "", wrong: ["", ""] }]);
  }

  function build(): void {
    const stack = buildTypedStack(title, rows);
    if (stack === null) {
      setFormError("Each question needs a right answer and at least one wrong answer.");
      return;
    }
    setFormError(null);
    onBuilt(stack);
  }

  return (
    <div class="type-own" aria-label="Type your own questions">
      <label class="field-label" for="own-title">Title</label>
      <input
        id="own-title"
        type="text"
        value={title}
        placeholder="e.g. Fractions quiz"
        onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
      />
      {rows.map((row, i) => (
        <fieldset class="type-own-row">
          <legend>Question {i + 1}</legend>
          <input
            type="text"
            aria-label={`Question ${i + 1}`}
            placeholder="Question"
            value={row.question}
            onInput={(e) => update(i, { question: (e.target as HTMLInputElement).value })}
          />
          <input
            type="text"
            aria-label={`Right answer for question ${i + 1}`}
            placeholder="Right answer"
            value={row.right}
            onInput={(e) => update(i, { right: (e.target as HTMLInputElement).value })}
          />
          {row.wrong.map((w, j) => (
            <input
              type="text"
              aria-label={`Wrong answer ${j + 1} for question ${i + 1}`}
              placeholder={`Wrong answer ${j + 1}`}
              value={w}
              onInput={(e) => updateWrong(i, j, (e.target as HTMLInputElement).value)}
            />
          ))}
        </fieldset>
      ))}
      <div class="type-own-actions">
        <button class="ghost-btn" type="button" onClick={addRow}>Add another question</button>
        <button class="build-btn" type="button" onClick={build}>Make these cards</button>
      </div>
      {formError !== null ? (
        <p class="hint hint-warn" role="alert">{formError}</p>
      ) : null}
    </div>
  );
}

/**
 * The "building your cards…" state (start-generating mockup). Cards are dealt
 * onto the pile one by one as they stream in from POST /api/generate, each with
 * its real question and an "N of M" label. Until the first card arrives it
 * shows the preparing state; the mockup look is preserved for both.
 */
export function GeneratingScreen({
  dealt,
  total,
  offline,
  title,
  sentence = "",
}: {
  /**
   * The teacher's own sentence. It is written on the top card from the first
   * frame, so the wait starts with her words instead of an empty "Preparing…"
   * card for 20 s (TASK-27k).
   */
  sentence?: string;
  dealt: DealtCard[];
  total: number;
  /** True on the offline fallback path (a ready-made deck, no live model). */
  offline: boolean;
  /** The set's title once the stream's `start` event has announced it. */
  title: string | null;
}): JSX.Element {
  // Whole seconds since this screen appeared. A counter that always moves is the
  // difference between "working" and "hung": real builds take 30–45 s and the
  // first card can be 25 s away (TASK-26f).
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  // The dealt stack scales with the viewport, like the player's card does; at a
  // fixed pixel size it was ~520 px wide in a 1920 desk and clipped on a small
  // laptop (TASK-27k). 1 is the designed size (a 1366×768 laptop); up to 1.5 on a
  // projector, down to 0.7 on a tablet.
  const [dealScale, setDealScale] = useState(() => dealScaleFor(viewport()));
  useEffect(() => {
    const onResize = (): void => setDealScale(dealScaleFor(viewport()));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
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
        ? `Card ${dealtCount} written`
        : title !== null
          ? `Writing “${title}” — card 1…`
          : "Asking the AI to plan your cards…";
  const seconds = offline ? "" : ` ${elapsed}s`;

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
              : "Each card appears as it's ready. Usually 20–45 seconds."}
          </p>
          <p class="counter" aria-live="polite">
            {counter}
            {seconds !== "" ? <span class="elapsed"> ·{seconds}</span> : null}
          </p>
        </div>
        <div class="deal" aria-hidden="true" style={{ ["--deal-scale" as string]: String(dealScale) }}>
          {/* Cards behind the top one, fanned. We always render three slots so
              the pile has depth even early on. */}
          {[0, 1, 2].map((slot) => {
            const card = behind[behind.length - 3 + slot];
            const label =
              card != null ? `Card ${card.index + 1} · ready` : "";
            return (
              <div class={`deal-card c${slot + 1}${card == null ? " deal-ghost" : ""}`} key={`behind-${slot}`}>
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
                : title !== null
                  ? title
                  : "Your sentence"}
            </p>
            {top?.question ? <p class="deal-q">{top.question}</p> : null}
            {!top && sentence.length > 0 ? <p class="deal-q deal-sentence">{sentence}</p> : null}
            {top && top.kind === "quiz" && top.answers.length > 0 ? (
              <div class="deal-tiles">
                {top.answers.slice(0, 4).map((label, i) => (
                  <span
                    class="deal-tile"
                    key={i}
                    style={`background:var(--color-tile-${"abcd"[i]}); color:${i === 3 ? "var(--color-white)" : "var(--color-ink)"};`}
                  >
                    <TileShape slot={i} /> <span class="deal-tile-label">{label}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}


/** The size of the window the Maker is in (guarded for tests/SSR). */
function viewport(): { w: number; h: number } {
  if (typeof window === "undefined") return { w: 1366, h: 768 };
  return { w: window.innerWidth || 1366, h: window.innerHeight || 768 };
}

/**
 * Scale for the dealt pile: relative to the 1366×768 design size, taking the
 * tighter of the two axes, clamped to 0.7–1.5.
 */
export function dealScaleFor(v: { w: number; h: number }): number {
  const s = Math.min(v.w / 1366, v.h / 768);
  return Math.round(Math.min(1.5, Math.max(0.7, s)) * 100) / 100;
}
