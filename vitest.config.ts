import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Most tests run in Node environment.
    environment: "node",
    // Per-file environment override: player tests need jsdom.
    environmentMatchGlobs: [
      ["tests/renderer.test.ts", "jsdom"],
      ["tests/scaler.test.ts", "jsdom"],
      ["tests/player.index.test.ts", "jsdom"],
      ["tests/timing-endcard.test.ts", "jsdom"],
    ],
  },
});
