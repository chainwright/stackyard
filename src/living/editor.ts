// src/living/editor.ts
// The offline in-file card editor for the living file (TASK-24). Vanilla TS,
// no framework, built on the SHARED pure operations so every edit keeps the
// stack valid. It owns a local stack, lets the teacher edit text / button
// labels / "go to card…" and add / remove cards, previews the selected card
// with the player renderer, offers Try It, and reports the current stack back
// to the app controller (which gates Save a Copy on reachability).

import type { Stack, Card, Element, ButtonElement } from "../shared/types.js";
import { validate } from "../shared/validator.js";
import { isRejected } from "../editor/types.js";
import {
  editText,
  editLabel,
  setGotoTarget,
  addCardAfter,
  takeLastInsertedCardId,
  removeCard,
  markCorrect,
  setFlashSide,
} from "../editor/operations.js";
import { renderCard } from "../player/renderer.js";
import { createRuntime } from "../player/runtime.js";
import { mountPlayer } from "../player/mount.js";
import { primaryText, truncateLabel } from "../shared/cardTitle.js";

type ApplyFn = (s: Stack) => Stack | import("../editor/types.js").Rejected;

export class LivingEditor {
  private stack: Stack;
  private selectedCardId: string;
  private selectedElementId: string | null = null;
  private tryingTeardown: (() => void) | null = null;

  constructor(
    stack: Stack,
    private readonly host: HTMLElement,
    private readonly onNotice: (msg: string) => void,
  ) {
    this.stack = stack;
    this.selectedCardId = stack.cards[0]!.id;
  }

  /** The current edited stack (what Save a Copy writes). */
  getStack(): Stack {
    return this.stack;
  }

  /** Apply a pure operation; commit only if the result is valid. */
  private apply(op: ApplyFn): boolean {
    const next = op(this.stack);
    if (isRejected(next)) {
      this.onNotice(next.message);
      return false;
    }
    const check = validate(next);
    if (!check.valid) {
      this.onNotice("That change would break the cards, so it wasn't applied.");
      return false;
    }
    this.stack = next;
    return true;
  }

  private card(): Card {
    return this.stack.cards.find((c) => c.id === this.selectedCardId) ?? this.stack.cards[0]!;
  }

  // -------------------------------------------------------------------------
  // Render

  /** Render the whole editor UI into the host element. */
  render(): void {
    this.stopTrying();
    this.host.innerHTML = "";
    const body = el("div", "sy-living-body");

    body.appendChild(this.renderList());
    const main = el("div", "sy-living-main");
    main.appendChild(this.renderCanvas());
    main.appendChild(this.renderInspector());
    body.appendChild(main);
    this.host.appendChild(body);
  }

  private renderList(): HTMLElement {
    const list = el("nav", "sy-living-list");
    this.stack.cards.forEach((c, i) => {
      const b = document.createElement("button");
      b.type = "button";
      if (c.id === this.selectedCardId) b.setAttribute("aria-current", "true");
      const num = el("span", "num");
      num.textContent = String(i + 1);
      b.appendChild(num);
      b.appendChild(document.createTextNode(this.cardLabel(c)));
      b.addEventListener("click", () => {
        this.selectedCardId = c.id;
        this.selectedElementId = null;
        this.render();
      });
      list.appendChild(b);
    });
    return list;
  }

  private cardLabel(card: Card): string {
    if (card.kind === "end") return "Last card";
    // The question/front/story line, never a caption or image credit.
    const short = truncateLabel(primaryText(card), 22);
    return short.length > 0 ? short : card.kind + " card";
  }

  private renderCanvas(): HTMLElement {
    const area = el("div", "sy-living-canvas");
    this.mountPreview(area);
    return area;
  }

  /**
   * (Re)build the card preview inside `area`: render the selected card with the
   * player renderer, attach the click-to-select listener, and fit it to the
   * area. This is the ONE place a preview is built — both the full render and
   * the lighter "refresh after a text edit" go through it, so selection can
   * never be lost again. (The old refreshPreviewOnly re-rendered without
   * re-attaching the listener, so after any text edit a click on an answer
   * PLAYED it instead of selecting it — round-2 J3 N3.)
   */
  private mountPreview(area: HTMLElement): void {
    area.innerHTML = "";
    const card = this.card();
    const stackWrap = el("div", "");
    area.appendChild(stackWrap);

    const runtime = createRuntime(this.stack);
    runtime.currentCardId = card.id;
    const index = this.stack.cards.findIndex((c) => c.id === card.id);
    renderCard(
      card,
      stackWrap,
      runtime,
      () => {}, // no navigation in the preview
      () => {}, // silent
      index >= 0 ? { position: index + 1, total: this.stack.cards.length } : {},
    );
    // Click an element in the preview to SELECT it for editing — never to play
    // it. Capture phase, so it runs before the tile's own click handler.
    stackWrap.addEventListener(
      "click",
      (e) => {
        const id = this.elementIdFromClick(card, stackWrap, e.target);
        if (id !== null) {
          this.selectedElementId = id;
          this.render();
        }
        e.preventDefault();
        e.stopPropagation();
      },
      true,
    );
    // Fit the 800×600 card into the available area.
    this.fit(area, stackWrap);
  }

  /** Map a clicked node to the element id it belongs to (by .sy-element order). */
  private elementIdFromClick(card: Card, root: HTMLElement, target: EventTarget | null): string | null {
    if (!(target instanceof Node)) return null;
    let node: Node | null = target;
    while (node && node !== root) {
      if (node instanceof HTMLElement && node.classList.contains("sy-element")) {
        const wrappers = Array.from(root.querySelectorAll<HTMLElement>(".sy-element"));
        const i = wrappers.indexOf(node);
        if (i >= 0 && i < card.elements.length) return card.elements[i]!.id;
        return null;
      }
      node = node.parentNode;
    }
    return null;
  }

  private fit(area: HTMLElement, stackWrap: HTMLElement): void {
    const apply = (): void => {
      const w = area.clientWidth - 32;
      const h = area.clientHeight - 32;
      if (w <= 0 || h <= 0) return;
      const s = Math.min(w / 820, h / 640, 1);
      const inner = stackWrap.querySelector<HTMLElement>(".sy-card-stack");
      if (inner) {
        inner.style.transform = `scale(${s})`;
        inner.style.transformOrigin = "center center";
      }
    };
    apply();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(apply);
      ro.observe(area);
    }
  }

  private renderInspector(): HTMLElement {
    const insp = el("aside", "sy-living-inspector");
    const card = this.card();
    const selected = card.elements.find((e) => e.id === this.selectedElementId);

    const h = document.createElement("h2");
    h.textContent = "Edit this card";
    insp.appendChild(h);

    if (selected && selected.type === "text") {
      insp.appendChild(this.textField(selected));
    } else if (selected && selected.type === "button") {
      insp.appendChild(this.labelField(selected));
      // On a quiz answer: which one is right (exactly one — invariant 4).
      if (selected.actions.some((a) => a.type === "score")) {
        insp.appendChild(this.rightAnswerField(card, selected));
      }
      insp.appendChild(this.gotoField(card, selected));
    } else if (card.kind === "flash") {
      // A flash card plays as a flip surface, so there is nothing to click in
      // the preview: edit the front and back right here.
      insp.appendChild(this.flashFields(card));
    } else {
      const hint = el("p", "sy-living-hint");
      hint.textContent = "Tap the words or a button on the card to edit it.";
      insp.appendChild(hint);
    }

    // Card-level controls: add after, remove.
    const row = el("div", "sy-living-row");
    const addBtn = this.button("Add a card after this", "sy-living-btn", () => {
      if (this.apply((s) => addCardAfter(s, card.id, "quiz"))) {
        const id = takeLastInsertedCardId();
        if (id) this.selectedCardId = id;
        this.selectedElementId = null;
        this.render();
      }
    });
    row.appendChild(addBtn);
    if (card.kind !== "end") {
      const rm = this.button("Remove this card", "sy-living-btn", () => {
        if (this.apply((s) => removeCard(s, card.id))) {
          this.selectedCardId = this.stack.cards[0]!.id;
          this.selectedElementId = null;
          this.render();
        }
      });
      row.appendChild(rm);
    }
    insp.appendChild(row);

    const tryRow = el("div", "sy-living-row");
    tryRow.appendChild(this.button("Try It", "sy-living-btn", () => this.tryIt()));
    insp.appendChild(tryRow);

    return insp;
  }

  /** "This one is right" — a radio that makes this answer the only right one. */
  private rightAnswerField(card: Card, elm: ButtonElement): HTMLElement {
    const field = el("div", "sy-living-field");
    const isRight = elm.actions.some((a) => a.type === "score" && a.delta === 1);
    const label = document.createElement("label");
    label.className = "sy-living-radio";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "sy-right-answer";
    radio.checked = isRight;
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      if (this.apply((s) => markCorrect(s, card.id, elm.id))) this.render();
    });
    label.appendChild(radio);
    label.appendChild(document.createTextNode("This one is right"));
    field.appendChild(label);
    const hint = el("p", "sy-living-hint");
    const right = card.elements.find(
      (e): e is ButtonElement =>
        e.type === "button" && e.actions.some((a) => a.type === "score" && a.delta === 1),
    );
    hint.textContent = isRight
      ? "Only one answer can be right. The class hears a cheer when they pick it."
      : right
        ? `“${right.label}” is the right answer now. Choose this to change it.`
        : "No answer is right yet. Choose one.";
    field.appendChild(hint);
    return field;
  }

  /** Front (term) and Back (explanation) boxes for a flash card. */
  private flashFields(card: Card): HTMLElement {
    const wrap = el("div", "");
    const texts = card.elements.filter(
      (e): e is Extract<Element, { type: "text" }> => e.type === "text",
    );
    const make = (labelText: string, side: "front" | "back", value: string): HTMLElement => {
      const field = el("div", "sy-living-field");
      const label = document.createElement("label");
      label.textContent = labelText;
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.addEventListener("input", () => {
        // Creates the side if the card has none yet — typing is never dropped.
        this.apply((s) => setFlashSide(s, card.id, side, ta.value));
        const list = this.host.querySelector<HTMLElement>(".sy-living-list");
        if (list) list.replaceWith(this.renderList());
      });
      field.appendChild(label);
      field.appendChild(ta);
      return field;
    };
    wrap.appendChild(make("Front (the word)", "front", texts[0]?.content ?? ""));
    wrap.appendChild(make("Back (the explanation)", "back", texts[1]?.content ?? ""));
    return wrap;
  }

  private textField(elm: Extract<Element, { type: "text" }>): HTMLElement {
    const field = el("div", "sy-living-field");
    const label = document.createElement("label");
    label.textContent = "Text";
    const ta = document.createElement("textarea");
    ta.value = elm.content;
    ta.addEventListener("input", () => {
      this.apply((s) => editText(s, elm.id, ta.value));
      this.refreshPreviewOnly();
    });
    field.appendChild(label);
    field.appendChild(ta);
    return field;
  }

  private labelField(elm: ButtonElement): HTMLElement {
    const field = el("div", "sy-living-field");
    const label = document.createElement("label");
    label.textContent = "Button text";
    const input = document.createElement("input");
    input.type = "text";
    input.value = elm.label;
    input.addEventListener("input", () => {
      if (this.apply((s) => editLabel(s, elm.id, input.value))) this.refreshPreviewOnly();
    });
    field.appendChild(label);
    field.appendChild(input);
    return field;
  }

  private gotoField(card: Card, elm: ButtonElement): HTMLElement {
    const field = el("div", "sy-living-field");
    const label = document.createElement("label");
    label.textContent = "If they pick this, show card…";
    const select = document.createElement("select");
    const current = elm.actions.find((a) => a.type === "goto");
    const currentId = current && current.type === "goto" ? current.cardId : "";
    if (currentId === "") {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Choose a card…";
      select.appendChild(opt);
    }
    this.stack.cards
      .filter((c) => c.id !== card.id)
      .forEach((c) => {
        const i = this.stack.cards.indexOf(c);
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.kind === "end" ? "Last card" : `Card ${i + 1} · ${this.cardLabel(c)}`;
        if (c.id === currentId) opt.selected = true;
        select.appendChild(opt);
      });
    select.addEventListener("change", () => {
      if (select.value.length === 0) return;
      if (this.apply((s) => setGotoTarget(s, elm.id, select.value))) this.refreshPreviewOnly();
    });
    field.appendChild(label);
    field.appendChild(select);
    return field;
  }

  /**
   * Re-render just the preview canvas (and the card list's labels) after a
   * text/label edit, so the textarea keeps its focus. Goes through the same
   * mountPreview as a full render.
   */
  private refreshPreviewOnly(): void {
    const area = this.host.querySelector<HTMLElement>(".sy-living-canvas");
    if (!area) return;
    this.mountPreview(area);
    // The left list names each card after its question: refresh it too, or it
    // keeps the OLD wording after an edit (J2 step 16).
    const list = this.host.querySelector<HTMLElement>(".sy-living-list");
    if (list) list.replaceWith(this.renderList());
  }

  // -------------------------------------------------------------------------
  // Try It

  private tryIt(): void {
    this.stopTrying();
    const area = this.host.querySelector<HTMLElement>(".sy-living-canvas");
    if (!area) return;
    area.classList.add("sy-living-tryit");
    area.innerHTML = "";
    const back = this.button("Back to editing", "sy-living-btn sy-back", () => this.render());
    area.appendChild(back);
    const stage = el("div", "");
    area.appendChild(stage);
    this.tryingTeardown = mountPlayer(this.stack, stage, {
      startCardId: this.card().id,
      flip: true,
      scaler: makeAreaScaler(area),
    });
  }

  private stopTrying(): void {
    if (this.tryingTeardown) {
      this.tryingTeardown();
      this.tryingTeardown = null;
    }
  }

  private button(text: string, cls: string, onClick: () => void): HTMLElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.textContent = text;
    b.addEventListener("click", onClick);
    return b;
  }
}

/** An area-fit scaler for the Try It player (keeps the card inside the canvas). */
function makeAreaScaler(area: HTMLElement): (root: HTMLElement) => () => void {
  return (root: HTMLElement) => {
    root.style.transformOrigin = "top left";
    const recompute = (): void => {
      if (!area.isConnected) return;
      const w = area.clientWidth;
      const hh = area.clientHeight - 48;
      const s = Math.max(0.5, Math.min(Math.min((w - 48) / 812, (hh - 48) / 612), 1.35));
      const stackEl = root.querySelector<HTMLElement>(".sy-card-stack");
      if (stackEl) {
        stackEl.style.transform = `scale(${s})`;
        stackEl.style.transformOrigin = "top left";
      }
      root.style.width = `${820 * s}px`;
      root.style.height = `${640 * s}px`;
    };
    recompute();
    const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(recompute) : null;
    mo?.observe(root, { childList: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(recompute) : null;
    ro?.observe(area);
    return () => {
      mo?.disconnect();
      ro?.disconnect();
    };
  };
}

/** Tiny element helper. */
function el(tag: string, className: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}
