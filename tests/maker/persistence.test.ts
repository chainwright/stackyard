// tests/maker/persistence.test.ts
// Unit tests for src/editor/persistence.ts (TASK-04), with a localStorage stub.

import { describe, it, expect, beforeEach } from "vitest";
import {
  save,
  load,
  clear,
  flush,
  STORAGE_KEY,
  type StorageLike,
} from "../../src/editor/persistence.js";
import { quizStack } from "./fixtures.js";

/** A simple in-memory localStorage stub. */
class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  clear(storage); // drop any pending debounced write from a prior test
});

describe("persistence", () => {
  it("a valid saved stack round-trips through load()", () => {
    const stack = quizStack();
    save(stack, storage);
    flush(); // force the debounced write
    const loaded = load(storage);
    expect(loaded).not.toBeNull();
    expect(loaded).toEqual(stack);
  });

  it("writes under the stackyard:maker:v1 key", () => {
    save(quizStack(), storage);
    flush();
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("returns null without throwing for an unparseable value", () => {
    storage.setItem(STORAGE_KEY, "this is not json {{{");
    expect(() => load(storage)).not.toThrow();
    expect(load(storage)).toBeNull();
  });

  it("returns null for a parseable-but-invalid stack", () => {
    // Valid JSON, but not a valid stack (no end card, bad shape).
    storage.setItem(STORAGE_KEY, JSON.stringify({ id: "nope", cards: [] }));
    expect(load(storage)).toBeNull();
  });

  it("load returns null when nothing is saved", () => {
    expect(load(storage)).toBeNull();
  });

  it("clear removes the key", () => {
    save(quizStack(), storage);
    flush();
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
    clear(storage);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("rapid saves collapse to one write of the latest stack", () => {
    const a = quizStack();
    a.title = "First";
    const b = quizStack();
    b.title = "Second";
    save(a, storage);
    save(b, storage);
    flush();
    const loaded = load(storage);
    expect(loaded!.title).toBe("Second");
  });
});
