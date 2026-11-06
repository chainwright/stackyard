// src/editor/Toolbar.tsx
// Bottom toolbar (TASK-16, TASK-21): the four design-system tool cards (Add
// Text / Add Button / Add Picture / Link a Card), Undo / Redo, and the Export
// button — the only --color-stamp use in the Maker.
//
// Each tool is a real edit through store.apply, so the stack stays valid by
// construction (REQ-MKR-09):
//   - Add Text    → addTextElement on the selected card
//   - Add Button  → addButtonElement (a plain, unwired button) on the card
//   - Add Picture → read a local file as a data URI, ask for alt text, then
//                   addPictureElement (self-contained, with required alt)
//   - Link a Card → linkButtonToCard: point the selected button at a card
//
// Undo/Redo track history enablement; Export is disabled unless the current
// stack is valid (store.canExport()). Export wiring is the onExport prop
// (TASK-18).

import type { ComponentChildren, JSX } from "preact";
import { useRef, useState } from "preact/hooks";
import type { Card, Stack } from "../shared/types.js";
import type { EditorStore } from "./store.js";
import type { ExportKind } from "./api.js";
import {
  addTextElement,
  addButtonElement,
  addPictureElement,
  addAnswer,
  linkButtonToCard,
  MAX_PICTURE_BYTES,
} from "./operations.js";
import {
  TextIcon,
  ButtonIcon,
  PictureIcon,
  LinkCardIcon,
  UndoIcon,
  RedoIcon,
  ExportIcon,
} from "./icons.js";
import { primaryText, truncateLabel } from "../shared/cardTitle.js";

type Notice = (m: string | null) => void;

/** A plain name for a card in the "link a card" picker (never a raw id, and
 *  never a caption or image credit — see src/shared/cardTitle.ts). */
function cardName(card: Card, index: number): string {
  if (card.kind === "end") return "Last card";
  const text = primaryText(card);
  const short = truncateLabel(text, 28);
  return short.length > 0 ? `Card ${index + 1} — ${short}` : `Card ${index + 1}`;
}

/** Read a File as a data URI. */
function readAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read-failed"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

export function Toolbar({
  store,
  onNotice,
  onExport,
  exportKind = "living",
  onExportKind,
  exporting = false,
  disabled = false,
}: {
  store: EditorStore;
  onNotice?: Notice;
  /** Called when Export is pressed (wired in TASK-18). */
  onExport?: () => void;
  /** Which file the Export button makes (TASK-24). Defaults to "living". */
  exportKind?: ExportKind;
  /** Change the export kind from the toolbar's choice control (TASK-24). */
  onExportKind?: (kind: ExportKind) => void;
  exporting?: boolean;
  /**
   * Dim and inert the whole toolbar — used while the teacher is Trying the
   * card, so an edit tool can't silently change the card they're playing
   * (built-app review round 2, P1 #5). Disabled visually AND for keyboard
   * (every control gets `disabled`, so it leaves the tab order).
   */
  disabled?: boolean;
}): JSX.Element {
  const canUndo = store.canUndo();
  const canRedo = store.canRedo();
  const canExport = store.canExport();

  const state = store.getState();
  const stack = state.stack as Stack;
  const selectedCard =
    stack.cards.find((c) => c.id === state.selectedCardId) ?? stack.cards[0]!;
  const selectedEl = selectedCard.elements.find((e) => e.id === state.selectedElementId);
  const selectedIsButton = selectedEl?.type === "button";

  const fileInputRef = useRef<HTMLInputElement>(null);
  // The "link a card" picker opens inline when a button is selected.
  const [linking, setLinking] = useState(false);

  const notice: Notice = (m) => onNotice?.(m);

  function dispatch(op: Parameters<EditorStore["apply"]>[0]): boolean {
    notice(null);
    const res = store.apply(op);
    if (!res.ok) notice(res.message);
    return res.ok;
  }

  function addText(): void {
    const ok = dispatch((s) => addTextElement(s, selectedCard.id));
    if (ok) selectLastElement();
  }

  function addButton(): void {
    const ok = dispatch((s) => addButtonElement(s, selectedCard.id));
    if (ok) selectLastElement();
  }

  // "Add Answer" (TASK-26o): a real, linked answer tile — not a plain button
  // that goes nowhere. Only offered on a quiz card.
  function addAnswerTile(): void {
    const ok = dispatch((s) => addAnswer(s, selectedCard.id));
    if (ok) selectLastElement();
  }

  function addPicture(): void {
    notice(null);
    fileInputRef.current?.click();
  }

  async function onFileChosen(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ""; // allow re-choosing the same file later
    if (!file) return;
    if (file.size > MAX_PICTURE_BYTES) {
      notice("That picture is too big. Choose a smaller one, under two megabytes.");
      return;
    }
    let dataUri: string;
    try {
      dataUri = await readAsDataUri(file);
    } catch {
      notice("That picture couldn't be read. Choose a picture file from this computer.");
      return;
    }
    const alt = (window.prompt(
      "Describe the picture in a few words, so every pupil knows what it shows.",
      "",
    ) ?? "").trim();
    if (alt.length === 0) {
      notice("Describe the picture in a few words so every pupil knows what it shows.");
      return;
    }
    const ok = dispatch((s) => addPictureElement(s, selectedCard.id, dataUri, alt));
    if (ok) selectLastElement();
  }

  function selectLastElement(): void {
    const current = store.getStack();
    if (current === null) return;
    const card =
      current.cards.find((c) => c.id === store.getState().selectedCardId) ??
      current.cards[0]!;
    const last = card.elements[card.elements.length - 1];
    if (last) store.setSelectedElement(last.id);
  }

  function linkTo(targetCardId: string): void {
    if (!selectedIsButton || selectedEl === undefined) return;
    const ok = dispatch((s) => linkButtonToCard(s, selectedEl.id, targetCardId));
    if (ok) setLinking(false);
  }

  function onLinkClick(): void {
    notice(null);
    if (!selectedIsButton) {
      notice("Pick a button first, then choose the card it goes to.");
      return;
    }
    setLinking((v) => !v);
  }

  const tool = (
    label: string,
    icon: ComponentChildren,
    onClick: () => void,
    extra?: { pressed?: boolean },
  ): JSX.Element => (
    <button
      class="tool-card"
      type="button"
      disabled={disabled}
      aria-disabled={disabled ? "true" : undefined}
      aria-pressed={extra?.pressed === undefined ? undefined : extra.pressed ? "true" : "false"}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <footer class={disabled ? "toolbar toolbar-disabled" : "toolbar"} aria-disabled={disabled ? "true" : undefined}>
      {tool("Add Text", <TextIcon />, addText)}
      {selectedCard.kind === "quiz"
        ? tool("Add Answer", <ButtonIcon />, addAnswerTile)
        : tool("Add Button", <ButtonIcon />, addButton)}
      {tool("Add Picture", <PictureIcon />, addPicture)}
      {tool("Go to card…", <LinkCardIcon />, onLinkClick, { pressed: linking })}

      <input
        ref={fileInputRef}
        class="sr-only"
        type="file"
        accept="image/*"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => void onFileChosen(e)}
      />

      {linking && selectedIsButton ? (
        <label class="link-picker">
          <span class="sr-only">Choose the card this button goes to</span>
          <select
            aria-label="Choose the card this button goes to"
            onChange={(e) => {
              const value = (e.target as HTMLSelectElement).value;
              if (value.length > 0) linkTo(value);
            }}
          >
            <option value="">Go to…</option>
            {stack.cards
              .filter((c) => c.id !== selectedCard.id)
              .map((c) => (
                <option value={c.id}>{cardName(c, stack.cards.indexOf(c))}</option>
              ))}
          </select>
        </label>
      ) : null}

      <span class="tool-sep" aria-hidden="true"></span>

      <button
        class="tool-icon-btn"
        type="button"
        aria-label="Undo"
        disabled={disabled || !canUndo}
        aria-disabled={disabled ? "true" : undefined}
        onClick={() => {
          onNotice?.(null);
          store.undo();
        }}
      >
        <UndoIcon />
      </button>
      <button
        class="tool-icon-btn"
        type="button"
        aria-label="Redo"
        disabled={disabled || !canRedo}
        aria-disabled={disabled ? "true" : undefined}
        onClick={() => {
          onNotice?.(null);
          store.redo();
        }}
      >
        <RedoIcon />
      </button>

      <span class="spacer"></span>

      {/* Export choice (TASK-24): the living file (default) can be edited later
          without Stackyard; the class file is play-only and smaller. */}
      <fieldset
        class="export-choice"
        disabled={disabled}
        aria-label="What kind of file to export"
      >
        <label class="export-choice-opt">
          <input
            type="radio"
            name="export-kind"
            value="living"
            checked={exportKind === "living"}
            onChange={() => onExportKind?.("living")}
          />
          <span>Living file <span class="export-choice-hint">you can edit it later without Stackyard</span></span>
        </label>
        <label class="export-choice-opt">
          <input
            type="radio"
            name="export-kind"
            value="class"
            checked={exportKind === "class"}
            onChange={() => onExportKind?.("class")}
          />
          <span>Export for class <span class="export-choice-hint">smaller</span></span>
        </label>
      </fieldset>

      <button
        class="export-btn"
        type="button"
        disabled={disabled || !canExport || exporting}
        aria-disabled={disabled ? "true" : undefined}
        onClick={() => onExport?.()}
      >
        <ExportIcon />
        {exporting ? "Exporting…" : "Export File"}
      </button>
    </footer>
  );
}
