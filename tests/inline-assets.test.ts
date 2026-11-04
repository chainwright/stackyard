// tests/inline-assets.test.ts
// Unit tests for server/inline-assets.ts — covers the data-URI no-op, a valid
// relative path inside the assets dir, and the path-security cases
// (`..` traversal, absolute path, symlink escape, missing file).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { inlineImages } from "../server/inline-assets.js";
import { ExportValidationError } from "../server/exporter.js";
import type { Stack, ImageElement } from "../src/shared/types.js";

// ---------------------------------------------------------------------------
// Fixtures

const STACK_ID = "10000000-0000-4000-8000-000000000001";
const CARD_ID = "20000000-0000-4000-8000-000000000002";
const IMG_ID = "30000000-0000-4000-8000-000000000003";

// A 1×1 transparent PNG.
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);

function makeStackWithImage(src: string): Stack {
  const img: ImageElement = {
    type: "image",
    id: IMG_ID,
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    src,
    alt: "a picture",
  };
  return {
    id: STACK_ID,
    title: "Image Test",
    theme: { background: "#fff", foreground: "#000", font: "sans-serif" },
    cards: [
      { id: CARD_ID, kind: "story", elements: [img], actions: [] },
      {
        id: "40000000-0000-4000-8000-000000000004",
        kind: "end",
        elements: [],
        actions: [],
      },
    ],
  };
}

function imageSrcOf(stack: Stack): string {
  const el = stack.cards[0]!.elements[0]!;
  if (el.type !== "image") throw new Error("expected an image element");
  return el.src;
}

// ---------------------------------------------------------------------------
// Temp dir lifecycle

let assetsDir: string;
let outsideDir: string;

beforeEach(async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "stackyard-assets-"));
  assetsDir = path.join(base, "assets");
  outsideDir = path.join(base, "outside");
  await fs.mkdir(assetsDir, { recursive: true });
  await fs.mkdir(outsideDir, { recursive: true });
});

afterEach(async () => {
  // Clean up both dirs (and their shared parent).
  const parent = path.dirname(assetsDir);
  await fs.rm(parent, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests

describe("inlineImages", () => {
  it("leaves an existing data: URI unchanged and does not touch the filesystem", async () => {
    const dataUri =
      "data:image/png;base64," + PNG_BYTES.toString("base64");
    const stack = makeStackWithImage(dataUri);

    const readSpy = vi.spyOn(fs, "readFile");
    const realpathSpy = vi.spyOn(fs, "realpath");

    const result = await inlineImages(stack, assetsDir);

    expect(imageSrcOf(result)).toBe(dataUri);
    expect(readSpy).not.toHaveBeenCalled();
    expect(realpathSpy).not.toHaveBeenCalled();

    readSpy.mockRestore();
    realpathSpy.mockRestore();
  });

  it("reads a relative path inside the assets dir and replaces it with a data URI", async () => {
    await fs.writeFile(path.join(assetsDir, "pic.png"), PNG_BYTES);
    const stack = makeStackWithImage("pic.png");

    const result = await inlineImages(stack, assetsDir);

    const expected =
      "data:image/png;base64," + PNG_BYTES.toString("base64");
    expect(imageSrcOf(result)).toBe(expected);
  });

  it("resolves a nested relative path inside the assets dir", async () => {
    await fs.mkdir(path.join(assetsDir, "sub"), { recursive: true });
    await fs.writeFile(path.join(assetsDir, "sub", "pic.jpg"), PNG_BYTES);
    const stack = makeStackWithImage("sub/pic.jpg");

    const result = await inlineImages(stack, assetsDir);

    expect(imageSrcOf(result)).toBe(
      "data:image/jpeg;base64," + PNG_BYTES.toString("base64"),
    );
  });

  it("does not mutate the input stack", async () => {
    await fs.writeFile(path.join(assetsDir, "pic.png"), PNG_BYTES);
    const stack = makeStackWithImage("pic.png");

    await inlineImages(stack, assetsDir);

    expect(imageSrcOf(stack)).toBe("pic.png");
  });

  it("throws ExportValidationError('path-traversal') for a `..` path escaping the assets dir", async () => {
    // Put a real file outside so only the path check — not a missing file —
    // can be the cause of the throw.
    await fs.writeFile(path.join(outsideDir, "secret.png"), PNG_BYTES);
    const stack = makeStackWithImage("../outside/secret.png");

    await expect(inlineImages(stack, assetsDir)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ExportValidationError &&
        err.errors.includes("path-traversal"),
    );
  });

  it("throws ExportValidationError('path-traversal') for an absolute path", async () => {
    const abs = path.join(outsideDir, "secret.png");
    await fs.writeFile(abs, PNG_BYTES);
    const stack = makeStackWithImage(abs);

    await expect(inlineImages(stack, assetsDir)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ExportValidationError &&
        err.errors.includes("path-traversal"),
    );
  });

  it("throws ExportValidationError('path-traversal') for a symlink whose real path is outside the assets dir", async () => {
    const target = path.join(outsideDir, "secret.png");
    await fs.writeFile(target, PNG_BYTES);
    const link = path.join(assetsDir, "link.png");
    try {
      await fs.symlink(target, link);
    } catch {
      // Some environments disallow symlink creation; skip rather than fail.
      return;
    }
    const stack = makeStackWithImage("link.png");

    await expect(inlineImages(stack, assetsDir)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ExportValidationError &&
        err.errors.includes("path-traversal"),
    );
  });

  it("rejects with a descriptive error for a non-existent file inside the assets dir", async () => {
    const stack = makeStackWithImage("does-not-exist.png");

    await expect(inlineImages(stack, assetsDir)).rejects.toThrow(
      /Asset not found/,
    );
  });
});
