#!/usr/bin/env python3
"""Make src/assets/fonts/digits.woff2 (TASK-29o).

Atkinson Hyperlegible ("Stackyard Reading") draws its zero with a slash, and the
font has no plain-zero alternate. In a maths deck for 9-year-olds "10" in the
question (Bricolage Grotesque, plain zero) and "1Ø" on the answer tile looked like
two different numbers. This cuts the ten digits 0-9 out of Bricolage Grotesque
(SIL OFL 1.1, no Reserved Font Name, so the name may stay) as "Stackyard Digits".
It is listed FIRST in the font-family of every Reading-face rule, so digits are
Bricolage's and everything else is Atkinson's.

    python3 scripts/make-digits-font.py          # needs: pip install fonttools brotli
"""
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "assets" / "fonts" / "bricolage.woff2"
OUT = ROOT / "src" / "assets" / "fonts" / "digits.woff2"

opts = subset.Options()
opts.flavor = "woff2"
opts.layout_features = []          # plain figures only: no frac/dnom/numr/tnum swaps
opts.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
opts.notdef_outline = True
opts.hinting = False

font = TTFont(SRC)
subsetter = subset.Subsetter(opts)
subsetter.populate(unicodes=[ord(c) for c in "0123456789"])
subsetter.subset(font)
font.flavor = "woff2"
font.save(OUT)
print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size} bytes)")
