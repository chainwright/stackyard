// src/editor/Inspector.tsx
// Right-hand inspector (TASK-15). Shows controls for the selected element/card
// and dispatches the matching pure operation through store.apply:
//   - text content / button label     → editText / editLabel
//   - "right answer" on a quiz tile    → markCorrect
//   - card kind                        → changeKind
//   - "when picked, go to…"            → setGotoTarget
// The correct-answer indicator is a label/tick (navy), never colour alone.
// A rejected edit surfaces a plain-language message and leaves the stack as is.

import type { JSX } from "preact";
import type { Card, Stack, Element as StackElement, ButtonElement } from "../shared/types.js";
import type { EditorStore } from "./store.js";
import {
  editText,
  editLabel,
  markCorrect,
  changeKind,
  setGotoTarget,
} from "./operations.js";

type Notice = (m: string | null) => void;

/** A button is an "answer" if it carries a score action (a quiz tile). */
function isAnswerButton(el: ButtonElement): boolean {
  return el.actions.some((a) => a.type === "score");
}

/** Is this answer button the current correct one? */
function isCorrect(el: ButtonElement): boolean {
  return el.actions.some((a) => a.type === "score" && a.delta === 1);
}

/** The card's current goto target id for a button, if any. */
function gotoTargetOf(el: ButtonElement): string | null {
  const g = el.actions.find((a) => a.type === "goto");
  return g && g.type === "goto" ? g.cardId : null;
}

/**
 * True when a story card has two or more choice buttons that all lead to the
 * same card — a fake branch the teacher probably didn't intend (built-app
 * review round 2, P0 #2). Mirrors `warnStack`'s `story-single-target` rule.
 */
function storyChoicesShareTarget(card: Card): boolean {
  if (card.kind !== "story") return false;
  const targets = card.elements
    .filter((e): e is ButtonElement => e.type === "button")
    .map((b) => gotoTargetOf(b))
    .filter((t): t is string => t !== null);
  if (targets.length < 2) return false;
  return new Set(targets).size === 1;
}

/** A plain name for a card in the goto picker (never a raw id). */
function cardName(stack: Stack, card: Card, index: number): string {
  if (card.kind === "end") return "Last card";
  const text = card.elements
    .filter((e): e is Extract<StackElement, { type: "text" }> => e.type === "text")
    .reduce((best, t) => (t.content.trim().length > best.length ? t.content.trim() : best), "");
  const short = text.length > 28 ? text.slice(0, 27) + "…" : text;
  return short.length > 0 ? `Card ${index + 1} — ${short}` : `Card ${index + 1}`;
}

export function Inspector({
  store,
  onNotice,
}: {
  store: EditorStore;
  onNotice?: Notice;
}): JSX.Element {
  const state = store.getState();
  const stack = state.stack as Stack;
  const card = stack.cards.find((c) => c.id === state.selectedCardId) ?? stack.cards[0]!;
  const selectedEl = card.elements.find((e) => e.id === state.selectedElementId);

  const notice: Notice = (m) => onNotice?.(m);

  function dispatch(op: Parameters<EditorStore["apply"]>[0]): void {
    notice(null);
    const res = store.apply(op);
    if (!res.ok) notice(res.message);
  }

  const kindPicker = (
    <div class="field-group">
      <label for="kind">Card type</label>
      <select
        id="kind"
        value={card.kind}
        disabled={card.kind === "end"}
        onChange={(e) => {
          const value = (e.target as HTMLSelectElement).value as Card["kind"];
          dispatch((s) => changeKind(s, card.id, value));
        }}
      >
        <option value="quiz">Quiz</option>
        <option value="flash">Flash</option>
        <option value="story">Story</option>
        <option value="end">Last card</option>
      </select>
    </div>
  );

  function gotoPicker(el: ButtonElement): JSX.Element {
    const current = gotoTargetOf(el);
    return (
      <div class="field-group">
        <label for="goto">When picked, go to…</label>
        <select
          id="goto"
          value={current ?? ""}
          onChange={(e) => {
            const target = (e.target as HTMLSelectElement).value;
            if (target.length === 0) return;
            dispatch((s) => setGotoTarget(s, el.id, target));
          }}
        >
          {current === null ? <option value="">Choose a card…</option> : null}
          {stack.cards
            .filter((c) => c.id !== card.id)
            .map((c) => {
              const index = stack.cards.indexOf(c);
              return (
                <option value={c.id} selected={c.id === current}>
                  {cardName(stack, c, index)}
                </option>
              );
            })}
        </select>
        {card.kind === "story" ? (
          storyChoicesShareTarget(card) ? (
            <p class="hint hint-warn" role="status">
              Both choices go to the same card, so the class ends up in the same
              place whatever they pick. Send each choice to a different card to
              make the story branch.
            </p>
          ) : (
            <p class="hint">
              Each button sends the class to a different card, so the story can
              branch.
            </p>
          )
        ) : null}
      </div>
    );
  }

  // ---- End card ----
  if (card.kind === "end") {
    const heading = card.elements.find(
      (e): e is Extract<StackElement, { type: "text" }> => e.type === "text",
    );
    return (
      <aside class="inspector" aria-label="Edit">
        <h2>Edit the last card</h2>
        <div class="field-group">
          <label for="heading">Heading</label>
          <input
            id="heading"
            type="text"
            value={heading?.content ?? ""}
            onInput={(e) => {
              const value = (e.target as HTMLInputElement).value;
              if (heading) dispatch((s) => editText(s, heading.id, value));
            }}
          />
          <p class="hint">
            The last card shows the class their score. You can't remove it —
            every set of cards needs one.
          </p>
        </div>
        <div class="field-group">
          <label for="score-preview">Score line (shown to the class)</label>
          <input
            id="score-preview"
            class="score-preview-field"
            type="text"
            value="Score 3 of 8"
            readonly
            aria-readonly="true"
            tabIndex={-1}
          />
          <p class="hint">
            Stackyard fills this in from how many questions the class gets
            right. One stamp lands for each right answer.
          </p>
        </div>
      </aside>
    );
  }

  // ---- A quiz answer tile selected ----
  if (selectedEl && selectedEl.type === "button" && isAnswerButton(selectedEl)) {
    const correct = isCorrect(selectedEl);
    return (
      <aside class="inspector" aria-label="Edit">
        <h2>Edit this answer</h2>
        <div class="field-group">
          <label for="label">Answer</label>
          <input
            id="label"
            type="text"
            value={selectedEl.label}
            onInput={(e) => {
              const value = (e.target as HTMLInputElement).value;
              dispatch((s) => editLabel(s, selectedEl.id, value));
            }}
          />
        </div>
        <div class="field-group">
          <button
            class="toggle-row"
            type="button"
            aria-pressed={correct ? "true" : "false"}
            onClick={() => {
              if (!correct) dispatch((s) => markCorrect(s, card.id, selectedEl.id));
            }}
          >
            <span class="toggle-box" aria-hidden="true">{correct ? "✓" : ""}</span>
            <span>Right answer</span>
          </button>
          <p class="hint">
            {correct
              ? "Only one answer can be the right one. The class hears a cheer when they pick it."
              : "No answer is the right one yet. Pick one so the class can earn a point."}
          </p>
        </div>
        {kindPicker}
        {gotoPicker(selectedEl)}
      </aside>
    );
  }

  // ---- A story / navigation button selected ----
  if (selectedEl && selectedEl.type === "button") {
    return (
      <aside class="inspector" aria-label="Edit">
        <h2>Edit this button</h2>
        <div class="field-group">
          <label for="label">Button text</label>
          <input
            id="label"
            type="text"
            value={selectedEl.label}
            onInput={(e) => {
              const value = (e.target as HTMLInputElement).value;
              dispatch((s) => editLabel(s, selectedEl.id, value));
            }}
          />
        </div>
        {gotoPicker(selectedEl)}
        {kindPicker}
      </aside>
    );
  }

  // ---- Flash card: Front (term) + Back (explanation) ----
  if (card.kind === "flash") {
    const texts = card.elements.filter(
      (e): e is Extract<StackElement, { type: "text" }> => e.type === "text",
    );
    const front = texts[0];
    const back = texts[1];
    return (
      <aside class="inspector" aria-label="Edit">
        <h2>Edit this card</h2>
        <div class="field-group">
          <label for="front">Front (the term)</label>
          <input
            id="front"
            type="text"
            value={front?.content ?? ""}
            onInput={(e) => {
              const value = (e.target as HTMLInputElement).value;
              if (front) dispatch((s) => editText(s, front.id, value));
            }}
          />
        </div>
        <div class="field-group">
          <label for="back">Back (the explanation)</label>
          <textarea
            id="back"
            rows={6}
            value={back?.content ?? ""}
            onInput={(e) => {
              const value = (e.target as HTMLTextAreaElement).value;
              if (back) dispatch((s) => editText(s, back.id, value));
            }}
          />
          <p class="hint">
            The class taps the card to flip from the term to the explanation.
          </p>
        </div>
        {kindPicker}
      </aside>
    );
  }

  // ---- A text element selected (story body) ----
  if (selectedEl && selectedEl.type === "text") {
    return (
      <aside class="inspector" aria-label="Edit">
        <h2>Edit this card</h2>
        <div class="field-group">
          <label for="content">Text</label>
          <textarea
            id="content"
            rows={6}
            value={selectedEl.content}
            onInput={(e) => {
              const value = (e.target as HTMLTextAreaElement).value;
              dispatch((s) => editText(s, selectedEl.id, value));
            }}
          />
        </div>
        {kindPicker}
      </aside>
    );
  }

  // ---- Nothing selected: card-level editing ----
  return (
    <aside class="inspector" aria-label="Edit">
      <h2>Edit this card</h2>
      <p class="hint">Tap something on the card to edit it.</p>
      {kindPicker}
    </aside>
  );
}
