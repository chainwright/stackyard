// vite.player.config.ts
// Separate Vite build config for the player runtime (IIFE bundle).
// Output: dist/player/player.iife.js
// Target: ES2018 (Chrome 70, Firefox 63, Safari 12, Edge 18)

import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2018",
    minify: true,
    outDir: "dist/player",
    emptyOutDir: true,
    lib: {
      entry: "src/player/index.ts",
      formats: ["iife"],
      name: "StackyardPlayer",
      fileName: () => "player.iife.js",
    },
    rollupOptions: {
      output: {
        // No code splitting — single IIFE file.
        inlineDynamicImports: true,
      },
    },
  },
});
