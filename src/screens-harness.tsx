// src/screens-harness.tsx
// Screenshot harness (dev/CI only, not shipped). Renders one Maker screen state
// at a time so headless Chrome can capture it for comparison with the mockups
// in docs/design/maker/. Choose the state with ?state=<name>.

import { render } from "preact";
import { EditorStore } from "./editor/store.js";
import { demoStack } from "./editor/demoStack.js";
import { ensureAnnouncer } from "./editor/a11y.js";
import { StartScreen } from "./editor/StartScreen.js";
import { EditorScreen } from "./editor/EditorScreen.js";
import { ExportDone } from "./editor/ExportDone.js";
import "./editor/styles.css";

ensureAnnouncer();

const params = new URLSearchParams(location.search);
const state = params.get("state") ?? "start-empty";
const root = document.getElementById("app")!;

function makeStore(select?: { card?: number; element?: "firstAnswer" | "firstText" | "firstButton" }): EditorStore {
  const stack = demoStack();
  const store = new EditorStore({ stack, screen: "editor" }, {});
  if (select?.card !== undefined) {
    const card = stack.cards[select.card];
    if (card) {
      store.setSelectedCard(card.id);
      if (select.element === "firstAnswer") {
        const btn = card.elements.find((e) => e.type === "button");
        if (btn) store.setSelectedElement(btn.id);
      } else if (select.element === "firstText") {
        const t = card.elements.find((e) => e.type === "text");
        if (t) store.setSelectedElement(t.id);
      } else if (select.element === "firstButton") {
        const b = card.elements.find((e) => e.type === "button");
        if (b) store.setSelectedElement(b.id);
      }
    }
  }
  return store;
}

switch (state) {
  case "start-empty": {
    const store = new EditorStore({ screen: "start" }, {});
    render(<StartScreen store={store} />, root);
    break;
  }
  case "start-generating": {
    const store = new EditorStore({ screen: "start", status: "generating" }, {});
    // Seed a few dealt cards so the screenshot shows the WOW moment: cards
    // dealt one by one with real questions while the stack is built. The built
    // app (no LLM key) uses the offline fallback, so the honest offline wording
    // is shown — no "About 20 seconds" for a ready-made deck.
    const demoDealt = [
      { index: 0, total: 12, kind: "quiz" as const, question: "Who sailed to Ireland first?", answers: ["Vikings", "Romans", "Greeks", "Egyptians"] },
      { index: 1, total: 12, kind: "quiz" as const, question: "What is a longship?", answers: ["A fast boat", "A house", "A sword", "A town"] },
      { index: 2, total: 12, kind: "quiz" as const, question: "Where did the Vikings build a town in 841?", answers: ["Dublin", "Cork", "Galway", "Sligo"] },
      { index: 3, total: 12, kind: "quiz" as const, question: "Who led the first Viking raid?", answers: ["A chieftain", "A monk", "A king", "A farmer"] },
    ];
    render(<StartScreen store={store} __demoDealt={demoDealt} __demoTotal={12} __demoOffline />, root);
    break;
  }
  case "start-error": {
    const store = new EditorStore({ screen: "start" }, {});
    render(<StartScreen store={store} __demoError="We couldn't build your cards. Check your internet and press Build Cards again." />, root);
    break;
  }
  case "editor-quiz": {
    render(<EditorScreen store={makeStore({ card: 2, element: "firstAnswer" })} />, root);
    break;
  }
  case "editor-flash": {
    render(<EditorScreen store={makeStore({ card: 3, element: "firstText" })} />, root);
    break;
  }
  case "editor-story": {
    render(<EditorScreen store={makeStore({ card: 4, element: "firstButton" })} />, root);
    break;
  }
  case "editor-end": {
    // The end card is the last card in the (now 12-card) Vikings deck.
    const stack = demoStack();
    const store = new EditorStore({ stack, screen: "editor" }, {});
    store.setSelectedCard(stack.cards[stack.cards.length - 1]!.id);
    render(<EditorScreen store={store} />, root);
    break;
  }
  case "editor-invalid": {
    // Force an invalid quiz (no correct answer) on card 3 and show the banner.
    const stack = demoStack();
    const card = stack.cards[2]!;
    for (const el of card.elements) {
      if (el.type === "button") {
        el.actions = el.actions.map((a) =>
          a.type === "score" ? { type: "score", delta: 0 } : a,
        );
      }
    }
    const store = new EditorStore({ stack, screen: "editor" }, {});
    store.setSelectedCard(card.id);
    const btn = card.elements.find((e) => e.type === "button");
    if (btn) store.setSelectedElement(btn.id);
    render(
      <EditorScreen
        store={store}
        __demoNotice="Card 3 needs a right answer. Tap the answer the class should pick."
      />,
      root,
    );
    break;
  }
  case "play": {
    // Try It is now an in-editor mode: the editor shell stays and the canvas
    // area plays the live card. Open on card 3 (a quiz) in play mode.
    const stack = demoStack();
    const store = new EditorStore({ stack, screen: "play" }, {});
    const card = stack.cards[2];
    if (card) store.setSelectedCard(card.id);
    render(<EditorScreen store={store} />, root);
    break;
  }
  case "play-flash": {
    // Try It on the Longphort flash card — the FRONT (the term only).
    const stack = demoStack();
    const store = new EditorStore({ stack, screen: "play" }, {});
    store.setSelectedCard(stack.cards[3]!.id); // the Longphort flash card
    render(<EditorScreen store={store} />, root);
    break;
  }
  case "play-flash-back": {
    // Try It on the Longphort flash card, flipped to the BACK. The real player
    // runs inside Try It, so after it mounts we tap the flash surface to flip.
    const stack = demoStack();
    const store = new EditorStore({ stack, screen: "play" }, {});
    store.setSelectedCard(stack.cards[3]!.id);
    render(<EditorScreen store={store} />, root);
    // Flip to the back once the live card has mounted (screenshot only), then
    // settle the flip animation so the capture isn't a mid-rotation frame.
    let tries = 0;
    const flipToBack = (): void => {
      const surface = document.querySelector<HTMLElement>(".tryit-area .sy-flash");
      if (surface && surface.querySelector(".sy-flash-term")) {
        surface.click();
        // Clear the flip animation so the captured frame shows the settled back.
        setTimeout(() => {
          const cardEl = document.querySelector<HTMLElement>(".tryit-area .sy-card");
          if (cardEl) cardEl.style.animation = "none";
        }, 60);
      } else if (tries++ < 60) {
        setTimeout(flipToBack, 50);
      }
    };
    setTimeout(flipToBack, 300);
    break;
  }
  case "play-story": {
    // Try It on the branching story card — the class sees the two choices.
    const stack = demoStack();
    const store = new EditorStore({ stack, screen: "play" }, {});
    store.setSelectedCard(stack.cards[4]!.id); // the story card
    render(<EditorScreen store={store} />, root);
    break;
  }
  case "export-done": {
    // Shown as it is in the real flow: the confirmation overlay OVER the
    // editor desk (the stack still visible beneath the 45% scrim).
    render(
      <>
        <EditorScreen store={makeStore({ card: 2, element: "firstAnswer" })} />
        <ExportDone
          filename="Vikings-in-Ireland.html"
          onOpen={() => {}}
          onBack={() => {}}
          onExportAgain={() => {}}
        />
      </>,
      root,
    );
    break;
  }
  default: {
    const store = new EditorStore({ screen: "start" }, {});
    render(<StartScreen store={store} />, root);
  }
}
