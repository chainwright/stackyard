// tests/font-name.test.ts
// Reserved Font Name compliance (design review round 4, P0-1).
//
// Atkinson Hyperlegible declares the Reserved Font Names "Atkinson" and
// "Hyperlegible". Our Latin subset is a Modified Version under the SIL Open
// Font License 1.1, so it must NOT present the reserved name to users — not in
// CSS, and not inside the font file's own name table. (`scripts/rename-reading-font.py`
// rewrites the table; this test guards that it stays rewritten, and that the
// same holds for any woff2 the export build would embed as base64.)
//
// The font files are the single source of truth here. This test reads the
// internal `name` table straight out of the woff2 binaries — with Node's
// built-in brotli, no extra dependency — and asserts no user-facing name
// record contains a reserved token. The copyright record (name ID 0) and the
// licence records (13/14) are allowed to mention the original name: the OFL
// requires the copyright line to travel with the font.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { brotliDecompressSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(MODULE_DIR, "..");
const FONTS_DIR = path.join(PROJECT_ROOT, "docs", "design", "maker", "fonts");

// The two subsets derived from Atkinson Hyperlegible. These are the fonts the
// exporter will embed (base64) for body text, so they are what the compliance
// check must cover.
const EMBEDDED_READING_FONTS = ["reading-400.woff2", "reading-700.woff2"];

const RESERVED_TOKENS = ["Atkinson", "Hyperlegible"];

// Name IDs the OFL requires (or allows) to keep the original name:
//   0  Copyright notice
//  13  Licence description
//  14  Licence URL
const NAME_IDS_ALLOWED_TO_MENTION_ORIGINAL = new Set([0, 13, 14]);

// ---------------------------------------------------------------------------
// Minimal WOFF2 reader — enough to extract the decompressed `name` table and
// read its records. WOFF2 concatenates all table data into a single
// brotli-compressed block (see the W3C WOFF2 spec).

interface NameRecord {
  nameID: number;
  platformID: number;
  value: string;
}

// Table tags indexed by the 6-bit "known tag" code in the table directory.
const KNOWN_TAGS = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post",
  "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT",
  "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea",
  "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH",
  "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar",
  "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar",
  "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop",
  "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill",
];

/** Read a UIntBase128 value; returns [value, nextOffset]. */
function readBase128(buf: Buffer, p: number): [number, number] {
  let result = 0;
  for (let i = 0; i < 5; i++) {
    const byte = buf[p++];
    result = (result << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return [result >>> 0, p];
  }
  throw new Error("UIntBase128 sequence too long");
}

/** Extract the decompressed `name` table bytes from a woff2 file. */
function extractNameTable(file: string): Buffer {
  const b = readFileSync(file);
  if (b.toString("ascii", 0, 4) !== "wOF2") {
    throw new Error(`${path.basename(file)} is not a WOFF2 file`);
  }
  const numTables = b.readUInt16BE(12);
  const totalCompressedSize = b.readUInt32BE(20);

  let p = 48; // fixed WOFF2 header length
  const tables: { tag: string; length: number }[] = [];
  for (let i = 0; i < numTables; i++) {
    const flags = b[p++];
    const tagIndex = flags & 0x3f;
    let tag: string;
    if (tagIndex === 0x3f) {
      tag = b.toString("ascii", p, p + 4);
      p += 4;
    } else {
      tag = KNOWN_TAGS[tagIndex];
    }
    const [origLength, afterOrig] = readBase128(b, p);
    p = afterOrig;

    // glyf/loca carry a transformLength when transformVersion === 0; every
    // other table carries one only when transformVersion !== 0. `name` is
    // never transformed, so this branch is effectively a no-op for it, but we
    // handle it generally so table offsets stay correct.
    const transformVersion = (flags >> 6) & 0x3;
    let transformLength: number | null = null;
    if (tag === "glyf" || tag === "loca") {
      if (transformVersion === 0) {
        const [tl, after] = readBase128(b, p);
        transformLength = tl;
        p = after;
      }
    } else if (transformVersion !== 0) {
      const [tl, after] = readBase128(b, p);
      transformLength = tl;
      p = after;
    }
    tables.push({ tag, length: transformLength ?? origLength });
  }

  const compressed = b.subarray(p, p + totalCompressedSize);
  const decompressed = brotliDecompressSync(compressed);

  let offset = 0;
  for (const t of tables) {
    if (t.tag === "name") {
      return decompressed.subarray(offset, offset + t.length);
    }
    offset += t.length;
  }
  throw new Error(`${path.basename(file)} has no name table`);
}

/** Parse name records from a `name` table (format 0/1). */
function readNameRecords(table: Buffer): NameRecord[] {
  const count = table.readUInt16BE(2);
  const stringOffset = table.readUInt16BE(4);
  const records: NameRecord[] = [];
  for (let i = 0; i < count; i++) {
    const base = 6 + i * 12;
    const platformID = table.readUInt16BE(base);
    const nameID = table.readUInt16BE(base + 6);
    const length = table.readUInt16BE(base + 8);
    const strOff = table.readUInt16BE(base + 10);
    const raw = table.subarray(
      stringOffset + strOff,
      stringOffset + strOff + length,
    );
    // Platforms 3 (Windows) and 0 (Unicode) store UTF-16BE; platform 1
    // (Macintosh) stores single-byte Latin.
    const value =
      platformID === 3 || platformID === 0
        ? Buffer.from(raw).swap16().toString("utf16le")
        : raw.toString("latin1");
    records.push({ nameID, platformID, value });
  }
  return records;
}

function readFontNames(file: string): NameRecord[] {
  return readNameRecords(extractNameTable(file));
}

// ---------------------------------------------------------------------------

describe("embedded font Reserved Font Name compliance (round 4 P0-1)", () => {
  for (const fontFile of EMBEDDED_READING_FONTS) {
    const fontPath = path.join(FONTS_DIR, fontFile);

    it(`${fontFile}: no user-facing name record mentions a reserved name`, () => {
      const records = readFontNames(fontPath);

      const offenders = records.filter(
        (r) =>
          !NAME_IDS_ALLOWED_TO_MENTION_ORIGINAL.has(r.nameID) &&
          RESERVED_TOKENS.some((token) => r.value.includes(token)),
      );

      expect(
        offenders,
        `Reserved font name leaked in ${fontFile}: ` +
          JSON.stringify(offenders),
      ).toEqual([]);
    });

    it(`${fontFile}: presents the family "Stackyard Reading"`, () => {
      const records = readFontNames(fontPath);
      const family = records.find((r) => r.nameID === 1);
      expect(family?.value).toBe("Stackyard Reading");
    });

    it(`${fontFile}: keeps the original copyright line (OFL)`, () => {
      const records = readFontNames(fontPath);
      const copyright = records.find((r) => r.nameID === 0);
      expect(copyright?.value).toMatch(/Braille Institute/);
    });
  }
});
