// vite.living.config.ts
// Build config for the LIVING-FILE runtime (TASK-24): the player PLUS the
// offline in-file editor and Save a Copy, bundled into a single IIFE.
// Output: dist/living/living.iife.js
// Target: ES2018 (same reach as the player bundle).

import { defineConfig } from "vite";
import { stripCssComments } from "./vite.cssComments.js";

export default defineConfig({
  plugins: [stripCssComments()],
  build: {
    target: "es2018",
    minify: true,
    outDir: "dist/living",
    emptyOutDir: true,
    lib: {
      entry: "src/living/index.ts",
      formats: ["iife"],
      name: "StackyardLiving",
      fileName: () => "living.iife.js",
    },
    rollupOptions: {
      output: {
        // No code splitting — a single IIFE file embedded into the export.
        inlineDynamicImports: true,
      },
    },
  },
});
