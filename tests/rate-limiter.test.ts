// tests/rate-limiter.test.ts
// Unit tests for the per-client sliding-window RateLimiter (TASK-21c).
// The clock is injected, so these run without fake timers.

import { describe, it, expect } from "vitest";
import { RateLimiter } from "../server/rateLimiter.js";

const WINDOW = 10 * 60 * 1000; // 10 minutes

/** A controllable clock. */
function fakeClock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

describe("RateLimiter", () => {
  it("allows up to the limit, then blocks with a Retry-After", () => {
    const clock = fakeClock();
    const rl = new RateLimiter({ limit: 6, windowMs: WINDOW, now: clock.now });

    for (let i = 0; i < 6; i++) {
      expect(rl.check("client-a").allowed, `hit ${i + 1}`).toBe(true);
    }
    const seventh = rl.check("client-a");
    expect(seventh.allowed).toBe(false);
    expect(seventh.retryAfterSeconds).toBeGreaterThan(0);
    // Retry-After is bounded by the window length.
    expect(seventh.retryAfterSeconds).toBeLessThanOrEqual(WINDOW / 1000);
  });

  it("tracks clients independently — one client's limit doesn't affect another", () => {
    const clock = fakeClock();
    const rl = new RateLimiter({ limit: 3, windowMs: WINDOW, now: clock.now });

    for (let i = 0; i < 3; i++) rl.check("a");
    expect(rl.check("a").allowed).toBe(false);

    // A different client is unaffected.
    expect(rl.check("b").allowed).toBe(true);
    expect(rl.check("b").allowed).toBe(true);
  });

  it("allows again after the window fully elapses", () => {
    const clock = fakeClock();
    const rl = new RateLimiter({ limit: 2, windowMs: WINDOW, now: clock.now });

    expect(rl.check("a").allowed).toBe(true);
    expect(rl.check("a").allowed).toBe(true);
    expect(rl.check("a").allowed).toBe(false);

    // Move past the window — the earlier hits fall out and we're allowed again.
    clock.advance(WINDOW + 1);
    expect(rl.check("a").allowed).toBe(true);
  });

  it("a blocked attempt is not counted, so it doesn't push the allow time further out", () => {
    const clock = fakeClock();
    const rl = new RateLimiter({ limit: 1, windowMs: WINDOW, now: clock.now });

    expect(rl.check("a").allowed).toBe(true); // hit at t0
    clock.advance(WINDOW / 2);
    expect(rl.check("a").allowed).toBe(false); // blocked at t0+5m (not counted)
    // After the ORIGINAL hit falls out of the window, allowed again — the
    // blocked attempt did not reset the window.
    clock.advance(WINDOW / 2 + 1);
    expect(rl.check("a").allowed).toBe(true);
  });

  it("evicts stale clients so the map does not grow without bound", () => {
    const clock = fakeClock();
    const rl = new RateLimiter({ limit: 5, windowMs: WINDOW, now: clock.now });

    // 1000 distinct clients hit once each.
    for (let i = 0; i < 1000; i++) rl.check(`client-${i}`);
    expect(rl.size()).toBe(1000);

    // Advance past the window; the next check evicts every stale entry.
    clock.advance(WINDOW + 1);
    rl.check("fresh");
    expect(rl.size()).toBe(1);
  });

  it("enforces the hard client cap even within a single window", () => {
    const clock = fakeClock();
    const rl = new RateLimiter({ limit: 5, windowMs: WINDOW, maxClients: 100, now: clock.now });

    // A flood of distinct addresses within the window — the map never exceeds
    // the hard cap (oldest-first eviction makes room).
    for (let i = 0; i < 5000; i++) rl.check(`addr-${i}`);
    expect(rl.size()).toBeLessThanOrEqual(100);
  });
});
