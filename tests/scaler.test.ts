// tests/scaler.test.ts
// Unit tests for src/player/scaler.ts (TASK-06).
// Tests scale factor calculation for common viewport sizes.

import { describe, it, expect, beforeAll, vi } from "vitest";

// Stub ResizeObserver on globalThis before importing the module.
// jsdom (used by vitest via environment config) does not ship ResizeObserver.
const disconnectSpy = vi.fn();
const observeSpy = vi.fn();

class FakeResizeObserver {
  observe(): void { observeSpy(); }
  unobserve(): void { /* no-op */ }
  disconnect(): void { disconnectSpy(); }
}

(globalThis as unknown as Record<string, unknown>)["ResizeObserver"] =
  FakeResizeObserver;

// Import after stubbing.
import { applyScaling } from "../src/player/scaler.js";

// ---------------------------------------------------------------------------
// Helper — set viewport size on globalThis

function setViewport(w: number, h: number): void {
  Object.defineProperty(globalThis, "innerWidth", {
    value: w,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, "innerHeight", {
    value: h,
    writable: true,
    configurable: true,
  });
}

function extractScale(transform: string): number {
  const m = /scale\(([^)]+)\)/.exec(transform);
  if (!m || !m[1]) throw new Error(`Could not parse transform: ${transform}`);
  return parseFloat(m[1]);
}

// ---------------------------------------------------------------------------
// applyScaling() tests

describe("applyScaling()", () => {
  it("1920×1080 — factor is height-constrained with 0.90 margin", () => {
    setViewport(1920, 1080);
    const el = document.createElement("div");
    const cleanup = applyScaling(el);
    // min((1920*0.90)/800, (1080*0.90)/600) = min(2.16, 1.62) = 1.62
    expect(extractScale(el.style.transform)).toBeCloseTo(1.62, 5);
    cleanup();
  });

  it("1024×768 — factor is width-constrained with 0.90 margin", () => {
    setViewport(1024, 768);
    const el = document.createElement("div");
    const cleanup = applyScaling(el);
    // min((1024*0.90)/800, (768*0.90)/600) = min(1.152, 1.152) = 1.152
    expect(extractScale(el.style.transform)).toBeCloseTo(1.152, 5);
    cleanup();
  });

  it("320×480 — factor is width-constrained with 0.90 margin", () => {
    setViewport(320, 480);
    const el = document.createElement("div");
    const cleanup = applyScaling(el);
    // min((320*0.90)/800, (480*0.90)/600) = min(0.36, 0.72) = 0.36
    expect(extractScale(el.style.transform)).toBeCloseTo(0.36, 5);
    cleanup();
  });

  it("800×600 — factor is 0.90 (exact fit with margin)", () => {
    setViewport(800, 600);
    const el = document.createElement("div");
    const cleanup = applyScaling(el);
    // min((800*0.90)/800, (600*0.90)/600) = 0.9
    expect(extractScale(el.style.transform)).toBeCloseTo(0.9, 5);
    cleanup();
  });

  it("sets root width to 800px", () => {
    setViewport(800, 600);
    const el = document.createElement("div");
    const cleanup = applyScaling(el);
    expect(el.style.width).toBe("800px");
    cleanup();
  });

  it("sets root height to 600px", () => {
    setViewport(800, 600);
    const el = document.createElement("div");
    const cleanup = applyScaling(el);
    expect(el.style.height).toBe("600px");
    cleanup();
  });

  it("sets position to relative", () => {
    setViewport(800, 600);
    const el = document.createElement("div");
    const cleanup = applyScaling(el);
    expect(el.style.position).toBe("relative");
    cleanup();
  });

  it("sets transform-origin to center center", () => {
    setViewport(800, 600);
    const el = document.createElement("div");
    const cleanup = applyScaling(el);
    expect(el.style.transformOrigin).toBe("center center");
    cleanup();
  });

  it("cleanup disconnects the ResizeObserver", () => {
    disconnectSpy.mockClear();
    setViewport(800, 600);
    const el = document.createElement("div");
    const cleanup = applyScaling(el);
    cleanup();
    expect(disconnectSpy).toHaveBeenCalledOnce();
  });
});
