// server/rateLimiter.ts
// In-memory, per-client sliding-window rate limiter for POST /api/generate.
//
// Why: the public instance holds a PAID model key, so a single client must not
// be able to drain it with a burst of generations. This caps each client to N
// generations per rolling window (default 6 per 10 minutes).
//
// Memory safety: an open service sees arbitrarily many distinct client
// addresses over time. The limiter must not grow without bound. Two guards:
//   1. On every check we evict entries whose window has fully elapsed.
//   2. A hard cap (`maxClients`) on tracked clients; when full, the oldest
//      entry (earliest first-seen hit) is evicted to make room. An attacker
//      cycling through fresh addresses therefore keeps the map bounded and, at
//      worst, evicts their own earlier entries — never pins memory open.
//
// The clock is injectable so tests can drive the window with fake timers.
// No external dependencies.

/** A record of one client's hit timestamps within the current window. */
interface ClientRecord {
  /** Hit timestamps (ms since epoch), oldest first, pruned to the window. */
  hits: number[];
  /** When this client was first seen in the map (for oldest-first eviction). */
  firstSeen: number;
}

export interface RateLimiterOptions {
  /** Max hits allowed per client within `windowMs`. */
  limit: number;
  /** Rolling window length in milliseconds. */
  windowMs: number;
  /** Hard cap on tracked clients (memory bound). */
  maxClients?: number;
  /** Clock, injectable for tests. Defaults to Date.now. */
  now?: () => number;
}

export interface RateDecision {
  /** True when the request is allowed (and has been counted). */
  allowed: boolean;
  /** Seconds until the client may retry (only meaningful when blocked). */
  retryAfterSeconds: number;
}

const DEFAULT_MAX_CLIENTS = 10_000;

export class RateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly maxClients: number;
  private readonly now: () => number;
  private readonly clients = new Map<string, ClientRecord>();

  constructor(opts: RateLimiterOptions) {
    this.limit = Math.max(1, Math.floor(opts.limit));
    this.windowMs = Math.max(1, Math.floor(opts.windowMs));
    this.maxClients = Math.max(1, Math.floor(opts.maxClients ?? DEFAULT_MAX_CLIENTS));
    this.now = opts.now ?? Date.now;
  }

  /**
   * Record a hit for `clientId` and decide whether it is allowed.
   *
   * Allowed requests ARE counted (the hit timestamp is kept). A blocked
   * request is NOT counted a second time — repeatedly hitting while over the
   * limit does not push the allowed-again time further out.
   */
  check(clientId: string): RateDecision {
    const t = this.now();
    this.evictStale(t);

    let record = this.clients.get(clientId);
    if (record === undefined) {
      this.makeRoom(t);
      record = { hits: [], firstSeen: t };
      this.clients.set(clientId, record);
    }

    // Prune hits older than the window.
    const cutoff = t - this.windowMs;
    record.hits = record.hits.filter((ts) => ts > cutoff);

    if (record.hits.length >= this.limit) {
      // Over the limit — do NOT count this blocked attempt. Retry-After is the
      // time until the OLDEST hit in the window falls out of it.
      const oldest = record.hits[0]!;
      const retryMs = Math.max(0, oldest + this.windowMs - t);
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(retryMs / 1000)),
      };
    }

    record.hits.push(t);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  /** Number of tracked clients (for tests / introspection). */
  size(): number {
    return this.clients.size;
  }

  /** Drop every client whose entire window has elapsed (no live hits). */
  private evictStale(t: number): void {
    const cutoff = t - this.windowMs;
    for (const [id, record] of this.clients) {
      const live = record.hits.some((ts) => ts > cutoff);
      if (!live) this.clients.delete(id);
    }
  }

  /**
   * Ensure there is room for one more client. When at the hard cap, evict the
   * single oldest entry (earliest first-seen) so the map size never exceeds
   * `maxClients`.
   */
  private makeRoom(_t: number): void {
    if (this.clients.size < this.maxClients) return;
    let oldestId: string | null = null;
    let oldestSeen = Infinity;
    for (const [id, record] of this.clients) {
      if (record.firstSeen < oldestSeen) {
        oldestSeen = record.firstSeen;
        oldestId = id;
      }
    }
    if (oldestId !== null) this.clients.delete(oldestId);
  }
}
