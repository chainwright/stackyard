#!/usr/bin/env python3
"""Rewrite the internal name table of the Atkinson Hyperlegible Latin subset
to the non-reserved family name "Stackyard Reading".

Why this exists
---------------
Atkinson Hyperlegible declares the Reserved Font Names "Atkinson" and
"Hyperlegible" (Braille Institute of America, Inc.). Under the SIL Open Font
License 1.1, deleting glyph components to make a subset produces a Modified
Version, which may not present a Reserved Font Name to users. Renaming the file
and the CSS `font-family` is not enough: the name table *inside* the font file
still declares "Atkinson Hyperlegible", and any font inspector — or the base64
font embedded in an exported stack — would still present the reserved name.

This script rewrites every name record so the font declares "Stackyard Reading"
on every platform/encoding, while leaving the glyph outlines untouched and
keeping the copyright notice (name ID 0) and licence records (13/14) intact, as
the OFL requires.

Usage
-----
    # Rename the two bundled subsets in place (default):
    python3 scripts/rename-reading-font.py

    # Rename specific files (used by the export build to clean whatever font
    # it is about to inline as base64):
    python3 scripts/rename-reading-font.py path/to/font.woff2 [...]

    # Verify only — read the name tables back and fail if any record still
    # contains "Atkinson" / "Hyperlegible":
    python3 scripts/rename-reading-font.py --check [files...]

Requirements
------------
    pip install --user fonttools brotli

`fonttools` reads and writes the name table; `brotli` is required by fonttools
to decode and re-encode woff2. If `--check`/rename reports a missing module,
run the line above.
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from fontTools.ttLib import TTFont
except ImportError:  # pragma: no cover - environment guard
    sys.stderr.write(
        "fonttools is required. Install it with:\n"
        "    pip install --user fonttools brotli\n"
    )
    raise SystemExit(2)

# The non-reserved family name we present to users.
FAMILY = "Stackyard Reading"

# Reserved tokens that must not appear in the renamed font's name table.
RESERVED_TOKENS = ("Atkinson", "Hyperlegible")

# The two subsets shipped in the repo. The export build passes explicit paths
# instead of relying on this default.
DEFAULT_TARGETS = [
    Path(__file__).resolve().parent.parent
    / "docs"
    / "design"
    / "maker"
    / "fonts"
    / "reading-400.woff2",
    Path(__file__).resolve().parent.parent
    / "docs"
    / "design"
    / "maker"
    / "fonts"
    / "reading-700.woff2",
]


def _subfamily(font: TTFont) -> str:
    """Return the weight word for this face (Regular / Bold / ...)."""
    name = font["name"]
    # name ID 2 is the (RFN-free) subfamily; it is safe to keep verbatim.
    for rec in name.names:
        if rec.nameID == 2:
            text = rec.toUnicode().strip()
            if text:
                return text
    return "Regular"


def _postscript_token(subfamily: str) -> str:
    """'Regular' -> 'StackyardReading-Regular'."""
    cleaned = subfamily.replace(" ", "")
    return f"StackyardReading-{cleaned}"


def rename_font(path: Path) -> list[str]:
    """Rewrite the name table of one font in place.

    Returns the list of (nameID, value) strings written, for logging.
    """
    font = TTFont(str(path))
    name = font["name"]
    subfamily = _subfamily(font)
    full_name = f"{FAMILY} {subfamily}".strip()
    ps_name = _postscript_token(subfamily)
    unique_id = f"{FAMILY} {subfamily}"

    # Replacement values keyed by name ID. We rewrite every record that carries
    # the reserved name, on every platform/encoding/language, so no inspector
    # can surface it. IDs we deliberately leave alone:
    #   0  Copyright  — must be preserved (OFL).
    #   2  Subfamily  — the weight word, RFN-free, kept as-is.
    #   5  Version    — may mention the upstream build; harmless and not a name
    #                   users select by, but we strip the token if present.
    #   13 Licence / 14 Licence URL — must be preserved verbatim (OFL).
    replacements = {
        1: FAMILY,  # Font Family name
        3: unique_id,  # Unique font identifier
        4: full_name,  # Full font name
        6: ps_name,  # PostScript name
        16: FAMILY,  # Typographic (preferred) family, if present
        17: subfamily,  # Typographic subfamily, if present
    }

    written: list[str] = []
    for rec in name.names:
        if rec.nameID in replacements:
            new_value = replacements[rec.nameID]
            rec.string = new_value.encode(rec.getEncoding())
            written.append(f"  nameID {rec.nameID}: {new_value!r}")
        elif rec.nameID == 5:
            # Version string: scrub the reserved tokens but keep the number.
            text = rec.toUnicode()
            scrubbed = text
            for token in RESERVED_TOKENS:
                scrubbed = scrubbed.replace(token, FAMILY.split()[0])
            if scrubbed != text:
                rec.string = scrubbed.encode(rec.getEncoding())
                written.append(f"  nameID 5: {scrubbed!r}")

    font.save(str(path))
    return written


def check_font(path: Path) -> list[str]:
    """Return a list of offending 'nameID: value' strings, empty if clean.

    A font is clean when no user-facing name record contains a reserved token.
    The copyright (ID 0) and licence (ID 13/14) records are allowed to mention
    Atkinson — the OFL requires the original copyright line to stay.
    """
    font = TTFont(str(path))
    allowed_to_mention = {0, 13, 14}
    offenders: list[str] = []
    for rec in font["name"].names:
        if rec.nameID in allowed_to_mention:
            continue
        value = rec.toUnicode()
        if any(token in value for token in RESERVED_TOKENS):
            offenders.append(f"  nameID {rec.nameID}: {value!r}")
    return offenders


def main(argv: list[str]) -> int:
    args = list(argv)
    check_only = False
    if "--check" in args:
        check_only = True
        args.remove("--check")

    targets = [Path(a) for a in args] if args else list(DEFAULT_TARGETS)

    missing = [t for t in targets if not t.exists()]
    if missing:
        for t in missing:
            sys.stderr.write(f"Not found: {t}\n")
        return 2

    if check_only:
        failed = False
        for path in targets:
            offenders = check_font(path)
            if offenders:
                failed = True
                sys.stderr.write(f"{path.name}: reserved name still present:\n")
                sys.stderr.write("\n".join(offenders) + "\n")
            else:
                print(f"{path.name}: clean (no reserved font name).")
        return 1 if failed else 0

    for path in targets:
        print(f"Renaming {path.name} -> family {FAMILY!r}")
        written = rename_font(path)
        for line in written:
            print(line)
        # Verify immediately by reading the table back.
        offenders = check_font(path)
        if offenders:
            sys.stderr.write(
                f"{path.name}: rename failed, reserved name still present:\n"
            )
            sys.stderr.write("\n".join(offenders) + "\n")
            return 1
        print(f"  verified: {path.name} is clean.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
