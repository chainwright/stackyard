// server/index.ts
// HTTP server entry point.
//
// Usage:
//   node --experimental-specifier-resolution=node dist/server/index.js
//   or: tsx server/index.ts
//
// For testing: import createServer() and call .listen(0) to get an
// ephemeral port.

import { createServer as createHttpServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleGenerate } from "./routes/generate.js";
import { handleExport } from "./routes/export.js";

export function createServer() {
  return createHttpServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ?? "/";
      const method = req.method ?? "GET";

      if (method === "POST" && url === "/api/generate") {
        await handleGenerate(req, res).catch((err) => {
          console.error("[server] unhandled error:", err);
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                ok: false,
                message:
                  "Something went wrong on our end. Please try again in a moment.",
              })
            );
          }
        });
        return;
      }

      if (url === "/api/export") {
        // Dispatch any method to handleExport; it replies 405 for non-POST.
        await handleExport(req, res).catch((err) => {
          console.error("[server] unhandled error:", err);
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                ok: false,
                message:
                  "Something went wrong on our end. Please try again in a moment.",
              })
            );
          }
        });
        return;
      }

      // 404 for everything else.
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, message: "Not found." }));
    }
  );
}

// ---------------------------------------------------------------------------
// Start the server when run directly.

const isMain =
  process.argv[1] !== undefined &&
  new URL(import.meta.url).pathname === process.argv[1];

if (isMain) {
  const PORT = Number(process.env["PORT"] ?? 3001);
  const server = createServer();
  server.listen(PORT, () => {
    console.log(`Stackyard server listening on http://localhost:${PORT}`);
  });
}
