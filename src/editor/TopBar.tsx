// src/editor/TopBar.tsx
// The design-system top bar: navy background, "Stackyard" wordmark, and a
// right-hand slot (the stack description, Try It button, etc.).

import type { ComponentChildren, JSX } from "preact";

export function TopBar({ children }: { children?: ComponentChildren }): JSX.Element {
  return (
    <header class="topbar">
      <span class="wordmark">Stackyard</span>
      {children}
    </header>
  );
}
