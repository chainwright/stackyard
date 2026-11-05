// server/inline-assets.ts
// inlineImages(stack, assetsDir): returns a deep copy of the stack with every
// image element's `src` resolved to a base64 data URI.
//
// Security model (see .kiro/specs/exporter/design.md "Path security"):
//   - `data:` URIs are left unchanged; the filesystem is never touched.
//   - Relative paths are resolved only inside the single `assetsDir`:
//       1. Absolute paths are rejected outright.
//       2. The resolved path must start with `assetsDir + path.sep`.
//       3. `fs.realpath` of the resolved path must also start with
//          `assetsDir + path.sep` (catches symlinks that escape the dir).
//   - Any violation throws ExportValidationError with "path-traversal".

import { promises as fs } from "node:fs";
import path from "node:path";

import { ExportValidationError } from "./exporter.js";
import type { Stack, Element, ImageElement } from "../src/shared/types.js";

// ---------------------------------------------------------------------------
// MIME lookup — small, extension-based table for the formats a teacher is
// likely to drop into a card. Unknown extensions fall back to a generic
// binary type so the file is still inlined rather than silently dropped.

const MIME_BY_EXT: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".avif": "image/avif",
};

function mimeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

// ---------------------------------------------------------------------------
// Path classification

/** True for a `data:` URI (any casing of the scheme). */
function isDataUri(src: string): boolean {
  return /^data:/i.test(src);
}

/**
 * True for an absolute path. Covers POSIX ("/foo"), Windows drive
 * ("C:\foo", "C:/foo") and UNC ("\\server\share") styles so the check is
 * robust regardless of the platform the export runs on.
 */
function isAbsoluteSrc(src: string): boolean {
  if (path.isAbsolute(src)) return true;
  if (src.startsWith("/") || src.startsWith("\\")) return true;
  if (/^[A-Za-z]:[\\/]/.test(src)) return true;
  return false;
}

/** True if `child` is `parent` itself or lives strictly inside it. */
function isInside(parent: string, child: string): boolean {
  return child === parent || child.startsWith(parent + path.sep);
}

// ---------------------------------------------------------------------------
// Core: resolve one image src to a data URI

async function inlineOne(
  src: string,
  assetsBase: string,
  getCanonicalBase: () => Promise<string>,
): Promise<string> {
  // 1. data: URIs pass through untouched — never hit the filesystem.
  if (isDataUri(src)) {
    return src;
  }

  // 2. Absolute paths are rejected before any resolution.
  if (isAbsoluteSrc(src)) {
    throw new ExportValidationError(["path-traversal"]);
  }

  // 3. Resolve lexically against the assets directory and confirm containment.
  //    This blocks `..` escapes before any filesystem access.
  const resolved = path.resolve(assetsBase, src);
  if (!isInside(assetsBase, resolved)) {
    throw new ExportValidationError(["path-traversal"]);
  }

  // 4. Follow symlinks: the real path must also be inside the *canonical*
  //    base (the base itself may be reached through a symlink — e.g. macOS
  //    /var -> /private/var — so both sides must be canonicalised to compare).
  //    realpath throws ENOENT for a missing file — surface that as a plain,
  //    descriptive Error (not a path-traversal error).
  let real: string;
  try {
    real = await fs.realpath(resolved);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      // A relative/missing image src — surface as a validation error so the
      // export route answers a clean 422 (not a 500). The exported file must be
      // self-contained, so a picture that can't be inlined is a user-fixable
      // problem, not a server crash (J4 L2).
      throw new ExportValidationError(["missing-asset"]);
    }
    throw err;
  }
  const canonicalBase = await getCanonicalBase();
  if (!isInside(canonicalBase, real)) {
    throw new ExportValidationError(["path-traversal"]);
  }

  // 5. Read the file and build the data URI.
  const bytes = await fs.readFile(real);
  const mime = mimeForPath(real);
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

// ---------------------------------------------------------------------------
// Deep copy (structuredClone is available on Node 17+; Node 24 is the target)

function cloneStack(stack: Stack): Stack {
  return structuredClone(stack);
}

// ---------------------------------------------------------------------------
// Public API

/**
 * Returns a deep copy of `stack` in which every image element's `src` is a
 * base64 data URI. The input stack is never mutated.
 *
 * @throws ExportValidationError with "path-traversal" for any unsafe path.
 */
export async function inlineImages(
  stack: Stack,
  assetsDir: string,
): Promise<Stack> {
  // Normalise the base once so the containment checks are reliable.
  // `assetsBase` is the lexical base (used for the pre-fs `..`/absolute
  // check). `canonicalBase` resolves any symlinks in the base path itself so
  // the realpath comparison is apples-to-apples — it is computed lazily the
  // first time a real file must be read, so a stack whose images are all
  // `data:` URIs never touches the filesystem at all.
  const assetsBase = path.resolve(assetsDir);
  let canonicalBase: string | null = null;
  const getCanonicalBase = async (): Promise<string> => {
    if (canonicalBase === null) {
      try {
        canonicalBase = await fs.realpath(assetsBase);
      } catch {
        canonicalBase = assetsBase;
      }
    }
    return canonicalBase;
  };

  const copy = cloneStack(stack);

  for (const card of copy.cards) {
    for (const el of card.elements) {
      if (isImageElement(el)) {
        el.src = await inlineOne(el.src, assetsBase, getCanonicalBase);
      }
    }
  }

  return copy;
}

function isImageElement(el: Element): el is ImageElement {
  return el.type === "image";
}
