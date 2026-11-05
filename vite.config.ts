// vite.config.ts
// Vite config for the Maker web app (the editor SPA).
// The player runtime has its own build (vite.player.config.ts); this config
// serves and builds the Preact editor from index.html.
//
// JSX is compiled with esbuild's automatic runtime pointed at Preact, so no
// extra Vite plugin (and no newer Vite major) is pulled in — only `preact`
// is added as a runtime dependency.

import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "preact",
  },
  resolve: {
    alias: {
      // Preact's automatic JSX runtime imports `preact/jsx-runtime`; the
      // aliases below also let any `react`-named import resolve to Preact if a
      // future dependency expects them. The Maker code imports Preact directly.
      react: "preact/compat",
      "react-dom": "preact/compat",
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Forward API calls to the dev API server (server/index.ts, PORT 3001).
      "/api": "http://localhost:3001",
    },
  },
  build: {
    outDir: "dist/maker",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: "index.html",
        // Screenshot harness (dev/CI only) for visual comparison with mockups.
        screens: "screens.html",
      },
    },
  },
});
