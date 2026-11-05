// src/editor/ExportDone.tsx
// The "file exported" confirmation overlay (export-done mockup). Shown after a
// successful export triggers the browser download. Red is used only on the
// earned "Exported ✓" stamp (design-system five-role rule).

import type { JSX } from "preact";
import { Ring } from "./icons.js";

export function ExportDone({
  filename,
  onOpen,
  onBack,
  onExportAgain,
}: {
  filename: string;
  onOpen: () => void;
  onBack: () => void;
  onExportAgain: () => void;
}): JSX.Element {
  return (
    <div class="desk-overlay">
      <section class="done-card" aria-label="File exported">
        <div class="done-rings" aria-hidden="true">
          <Ring />
          <Ring />
        </div>
        <div class="done-inner">
          <span class="done-stamp" aria-hidden="true">Exported ✓</span>
          <h1>Your file is ready</h1>
          <p class="sub">We've saved your set of cards as one file.</p>
          <span class="filename">{filename}</span>

          <ol class="steps">
            <li><span class="n">1</span><span>Email it or put it on a USB stick.</span></li>
            <li><span class="n">2</span><span>Double-click on the class laptop.</span></li>
            <li><span class="n">3</span><span>No internet needed — try it with Wi-Fi off.</span></li>
          </ol>

          <div class="done-actions">
            <button class="primary-btn" type="button" onClick={onOpen}>Open the File</button>
            <button class="ghost-btn" type="button" onClick={onBack}>Back to Editing</button>
          </div>
          <button class="link-btn" type="button" onClick={onExportAgain}>Export again</button>
        </div>
      </section>
    </div>
  );
}
