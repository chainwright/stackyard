// src/editor/CardList.tsx
// Left-hand card list (TASK-13). One entry per card in stack order, each a
// ≥ 44 px keyboard-focusable control showing its position and kind. Selecting
// an entry sets selectedCardId. Add / Remove / Move-up / Move-down go through
// store.apply with addCard / removeCard / reorderCards. A rejected removal
// (sole end card) surfaces a plain-language message and changes nothing.

import type { JSX } from "preact";
import type { Card, Stack } from "../shared/types.js";
import type { EditorStore } from "./store.js";
import { addCardAfter, removeCard, reorderCards, takeLastInsertedCardId, takeLastInsertNote } from "./operations.js";
import { KindShape } from "./icons.js";
import { cardTitle } from "../shared/cardTitle.js";

/**
 * A plain label for a card list entry: the card's QUESTION / FRONT / STORY
 * line (never a caption or image credit — see src/shared/cardTitle.ts). Falls
 * back to a kind description. The full-length title is shown (the list column
 * truncates visually with CSS).
 */
function cardLabel(card: Card): string {
  return cardTitle(card, Number.MAX_SAFE_INTEGER);
}

export function CardList({
  store,
  onNotice,
}: {
  store: EditorStore;
  onNotice?: (message: string | null) => void;
}): JSX.Element {
  const state = store.getState();
  const stack = state.stack as Stack;
  const selectedId = state.selectedCardId;
  const n = stack.cards.length;

  function select(cardId: string): void {
    // A transient notice (e.g. "This card is full") belongs to the card it was
    // raised on; clear it when the teacher moves to another card so a stale
    // banner can't linger or cover later chrome (built-app review round 3, P1 #1).
    onNotice?.(null);
    store.setSelectedCard(cardId);
  }

  function add(): void {
    onNotice?.(null);
    // Insert AFTER the current card (never after the last card) and link it into
    // the flow, so play reaches it — then select it (J2 #1 / J3 D6).
    const afterId = selectedId ?? stack.cards[0]!.id;
    const res = store.apply((s) => addCardAfter(s, afterId, "quiz"));
    if (!res.ok) {
      onNotice?.(res.message);
      return;
    }
    const newId = takeLastInsertedCardId();
    if (newId !== null) store.setSelectedCard(newId);
    const note = takeLastInsertNote();
    if (note !== null) onNotice?.(note);
  }

  function remove(cardId: string): void {
    onNotice?.(null);
    const res = store.apply((s) => removeCard(s, cardId));
    if (!res.ok) onNotice?.(res.message);
  }

  function move(from: number, to: number): void {
    onNotice?.(null);
    const res = store.apply((s) => reorderCards(s, from, to));
    if (!res.ok) onNotice?.(res.message);
  }

  return (
    <nav class="cardlist" aria-label="Cards">
      <h2>Cards</h2>
      <div class="cardlist-scroll">
        {stack.cards.map((card, i) => {
          const current = card.id === selectedId;
          // TASK-33d1: the move buttons sit BESIDE the card's button, not inside
          // it (a button inside a button is "nested-interactive" for axe, and a
          // screen reader can't reach the inner one).
          return (
            <div class="card-entry-row">
              <button
                class="card-entry"
                type="button"
                aria-current={current ? "true" : undefined}
                onClick={() => select(card.id)}
              >
                <span class="num">{i + 1}</span>
                <span class="kshape"><KindShape kind={card.kind} /></span>
                <span class="label">{cardLabel(card)}</span>
                {current ? null : <span class="grip" aria-hidden="true">⋮⋮</span>}
              </button>
              {current ? (
                <span class="reorder">
                  <button
                    type="button"
                    aria-label={`Move card ${i + 1} up`}
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move card ${i + 1} down`}
                    disabled={i === n - 1}
                    onClick={() => move(i, i + 1)}
                  >
                    ↓
                  </button>
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <div class="cardlist-foot">
        <button class="add-card" type="button" onClick={add}>
          + Add Card
        </button>
        {selectedId !== null ? (
          <button
            class="remove-card"
            type="button"
            onClick={() => remove(selectedId)}
          >
            Remove this card
          </button>
        ) : null}
      </div>
    </nav>
  );
}
