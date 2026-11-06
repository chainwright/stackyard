// server/index.ts
// HTTP server entry point — the ONE public web service.
//
// Routes:
//   GET  /api/health         → 200 {"ok":true} (no model call; keep-warm ping)
//   POST /api/generate       → generate a stack (rate-limited + daily-budgeted)
//        /api/export         → build the exported HTML file
//   (production only) GET/HEAD anything else → the built Maker SPA from dist/maker
//
// The paid model key lives only on this server. Two guards keep a public
// instance from draining it:
//   - a per-client in-memory rate limit on /api/generate (RateLimiter), and
//   - a global daily model-call budget (DailyBudget); once hit, /api/generate
//     answers from the offline ready-made decks and never calls the model.
//
// Every response carries the shared security headers + CSP (securityHeaders).
//
// For testing: import createServer(config) and call .listen(0) for an
// ephemeral port; config injects clocks, limits, and the static root.

import { createServer as createHttpServer } from "node:http";
import type { IncomingMessage, ServerResponse, Server } from "node:http";
import { handleGenerate, preflightGenerate } from "./routes/generate.js";
import { handleExport } from "./routes/export.js";
import { applySecurityHeaders } from "./securityHeaders.js";
import { serveStatic } from "./staticFiles.js";
import { RateLimiter } from "./rateLimiter.js";
import { DailyBudget } from "./dailyBudget.js";
import {
  clientAddress,
  clientAddressDiagnostics,
  clientIpHeaderFromEnv,
  trustProxyFromEnv,
} from "./clientAddress.js";

const TEN_MINUTES_MS = 10 * 60 * 1000;

/** How many generate requests get a diagnostic line when DEBUG_CLIENT_ADDR=1. */
const DEBUG_CLIENT_ADDR_MAX_LINES = 5;

/** The human line shown when a client is rate-limited. */
const RATE_LIMITED_MESSAGE =
  "Lots of people are building right now — try again in a few minutes, or start from a ready-made deck.";

// ---------------------------------------------------------------------------
// Config

export interface ServerConfig {
  /** Serve the built Maker SPA (production). Defaults from env (see below). */
  serveStatic?: boolean;
  /** Build root for the static Maker. Defaults to "dist/maker". */
  staticRoot?: string;
  /** Trust forwarding headers for client identity. Defaults from TRUST_PROXY=1. */
  trustProxy?: boolean;
  /**
   * Single-value provider IP header to trust for the client address (e.g.
   * `cf-connecting-ip`). Defaults from CLIENT_IP_HEADER. Only used when
   * `trustProxy` is true.
   */
  clientIpHeader?: string | undefined;
  /**
   * Log forwarding headers + chosen address for the first few generate
   * requests. Defaults from DEBUG_CLIENT_ADDR=1. Temporary, off by default.
   */
  debugClientAddr?: boolean;
  /** Max generations per client per 10 minutes. Default from env, else 20. */
  generateRatePer10Min?: number;
  /** Max exports per client per 10 minutes (a looser bucket). Default 60. */
  exportRatePer10Min?: number;
  /** Max real model calls per UTC day. Default from env, else 300. */
  generateDailyCap?: number;
  /** Clock seam for the limiter + budget (tests pass fake clocks). */
  now?: () => number;
}

function intFromEnv(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function shouldServeStatic(env: NodeJS.ProcessEnv): boolean {
  return env["NODE_ENV"] === "production" || env["SERVE_STATIC"] === "1";
}

// ---------------------------------------------------------------------------
// Helpers

function sendJson(res: ServerResponse, status: number, body: unknown, extraHeaders: Record<string, string> = {}): void {
  applySecurityHeaders(res);
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

// ---------------------------------------------------------------------------
// Server factory

export function createServer(config: ServerConfig = {}): Server {
  const env = process.env;
  const serveStaticEnabled = config.serveStatic ?? shouldServeStatic(env);
  const staticRoot = config.staticRoot ?? "dist/maker";
  const trustProxy = config.trustProxy ?? trustProxyFromEnv(env);
  const clientIpHeader =
    config.clientIpHeader !== undefined ? config.clientIpHeader : clientIpHeaderFromEnv(env);
  const debugClientAddr = config.debugClientAddr ?? env["DEBUG_CLIENT_ADDR"] === "1";
  const rateLimit = config.generateRatePer10Min ?? intFromEnv(env, "GENERATE_RATE_PER_10MIN", 20);
  const exportRate = config.exportRatePer10Min ?? intFromEnv(env, "EXPORT_RATE_PER_10MIN", 60);
  const dailyCap = config.generateDailyCap ?? intFromEnv(env, "GENERATE_DAILY_CAP", 300);
  const now = config.now;

  // Temporary diagnostics counter (TASK-21g #2): at most N lines after start.
  let debugLinesLogged = 0;

  const limiter = new RateLimiter({
    limit: rateLimit,
    windowMs: TEN_MINUTES_MS,
    ...(now ? { now } : {}),
  });
  // Export is cheap but not free (it reads the player IIFE + fonts and builds a
  // document), so put it behind a looser per-client bucket too (J4 L3).
  const exportLimiter = new RateLimiter({
    limit: exportRate,
    windowMs: TEN_MINUTES_MS,
    ...(now ? { now } : {}),
  });
  const budget = new DailyBudget({
    cap: dailyCap,
    ...(now ? { now } : {}),
    onCapReached: (day) =>
      console.warn(`[server] daily model-call cap (${dailyCap}) reached for ${day}; serving ready-made decks`),
  });

  function onUnhandled(res: ServerResponse, err: unknown): void {
    console.error("[server] unhandled error:", err);
    if (!res.headersSent) {
      sendJson(res, 500, {
        ok: false,
        message: "Something went wrong on our end. Please try again in a moment.",
      });
    }
  }

  return createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "/";
    const method = req.method ?? "GET";
    const pathname = url.split("?")[0]!.split("#")[0]!;

    // ---- Health (no model call) ----
    if (pathname === "/api/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    // ---- Generate (rate-limited + daily-budgeted) ----
    if (pathname === "/api/generate") {
      if (method !== "POST") {
        sendJson(res, 405, { ok: false, message: "Method not allowed." });
        return;
      }

      const clientId = clientAddress(req, { trustProxy, clientIpHeader });

      // Temporary diagnostics: the forwarding headers + chosen address for the
      // first few generate requests after start (TASK-21g #2).
      if (debugClientAddr && debugLinesLogged < DEBUG_CLIENT_ADDR_MAX_LINES) {
        debugLinesLogged++;
        console.log(
          "[client-addr]",
          JSON.stringify(clientAddressDiagnostics(req, clientId)),
        );
      }

      // Read and validate the body BEFORE counting any rate/budget slot: a
      // truncated or empty request is the client's mistake and costs nothing
      // (J4 P2-3). readBody/validation answer 400/413 themselves.
      applySecurityHeaders(res);
      const goodBody = await preflightGenerate(req, res).catch((err) => {
        onUnhandled(res, err);
        return null;
      });
      if (goodBody === null) return;

      // Global daily budget first: when it is exhausted, the request is served
      // from the ready-made decks with NO model call — so it must NOT cost the
      // paid key AND must NOT consume a per-visitor rate-limit slot (J4 M2 /
      // J1). canSpend() is non-consuming; the real spend is counted per upstream
      // call via onModelCall (so a request that makes two calls records two, and
      // a fallback-only request records none).
      const canSpend = budget.canSpend();

      if (canSpend) {
        // A real model call is about to be attempted — this is the only path
        // that can drain the key, so this is the path the per-visitor limit
        // guards. Check (and count) a slot here.
        const decision = limiter.check(clientId);
        if (!decision.allowed) {
          sendJson(
            res,
            429,
            { ok: false, message: RATE_LIMITED_MESSAGE },
            { "Retry-After": String(decision.retryAfterSeconds) },
          );
          return;
        }
      }

      const forceFallback = !canSpend;
      const onModelCall = (): void => budget.record();

      await handleGenerate(req, res, {
        body: goodBody,
        forceFallback,
        ...(canSpend ? { onModelCall } : {}),
      }).catch((err) => onUnhandled(res, err));
      return;
    }

    // ---- Export (lightly rate-limited) ----
    if (pathname === "/api/export") {
      if (method === "POST") {
        const exportClient = clientAddress(req, { trustProxy, clientIpHeader });
        const decision = exportLimiter.check(exportClient);
        if (!decision.allowed) {
          sendJson(
            res,
            429,
            { ok: false, message: "That's a lot of exports — give it a minute and try again." },
            { "Retry-After": String(decision.retryAfterSeconds) },
          );
          return;
        }
      }
      applySecurityHeaders(res);
      await handleExport(req, res).catch((err) => onUnhandled(res, err));
      return;
    }

    // ---- Any other /api/* path: JSON 404 (never the SPA shell) ----
    if (pathname.startsWith("/api/")) {
      sendJson(res, 404, { ok: false, message: "Not found." });
      return;
    }

    // ---- Static Maker (production) ----
    if (serveStaticEnabled) {
      await serveStatic(req, res, { root: staticRoot }).catch((err) => onUnhandled(res, err));
      return;
    }

    // Static serving off (dev / API-only): JSON 404.
    sendJson(res, 404, { ok: false, message: "Not found." });
  });
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
    const mode = shouldServeStatic(process.env) ? "serving built Maker + API" : "API only";
    console.log(`Stackyard server listening on http://localhost:${PORT} (${mode})`);
  });
}
