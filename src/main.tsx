// src/main.tsx
// SPA entry: mounts <App> into #app. Preact only; no other UI libraries.

import { render } from "preact";
import { App } from "./editor/app.js";

const root = document.getElementById("app");
if (root) {
  render(<App />, root);
}
