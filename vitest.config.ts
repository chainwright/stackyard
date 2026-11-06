import { defineConfig } from "vitest/config";

export default defineConfig({
  // Compile .tsx with esbuild's automatic JSX runtime pointed at Preact so the
  // Maker component tests render without any extra plugin.
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "preact",
  },
  resolve: {
    alias: {
      react: "preact/compat",
      "react-dom": "preact/compat",
    },
  },
  test: {
    // Most tests run in Node environment.
    environment: "node",
    // Heavy property tests (1000 runs) get room on a slow CI runner.
    testTimeout: 60_000,
    // CSS imports in components are irrelevant to logic tests.
    css: false,
    // Per-file environment override: player + Maker UI tests need jsdom.
    environmentMatchGlobs: [
      // New jsdom tests are named *.dom.test.ts so they need no registration.
      ["tests/**/*.dom.test.ts", "jsdom"],
      ["tests/renderer.test.ts", "jsdom"],
      ["tests/scaler.test.ts", "jsdom"],
      ["tests/player.index.test.ts", "jsdom"],
      ["tests/timing-endcard.test.ts", "jsdom"],
      ["tests/play-through.test.ts", "jsdom"],
      ["tests/flash-play.test.ts", "jsdom"],
      ["tests/play-again-flash-back.test.ts", "jsdom"],
      ["tests/living.test.ts", "jsdom"],
      // Maker UI tests (Preact components) need a DOM.
      ["tests/maker/app-shell.test.ts", "jsdom"],
      ["tests/maker/generate-flow.test.ts", "jsdom"],
      ["tests/maker/card-list.test.ts", "jsdom"],
      ["tests/maker/canvas.test.ts", "jsdom"],
      ["tests/maker/inspector.test.ts", "jsdom"],
      ["tests/maker/toolbar.test.ts", "jsdom"],
      ["tests/maker/play-overlay.test.ts", "jsdom"],
      ["tests/maker/sticky-notice.test.ts", "jsdom"],
      ["tests/maker/export-download.test.ts", "jsdom"],
      ["tests/maker/persistence-wiring.test.ts", "jsdom"],
      ["tests/maker/a11y.test.ts", "jsdom"],
      ["tests/player/mount.test.ts", "jsdom"],
    ],
  },
});
