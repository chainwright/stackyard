# Fonts

Self-hosted woff2 subsets for the Maker app and the exported player. No CDN
links anywhere, so the exported file works offline (see `tech.md`).

| File               | Family (CSS)        | Weight | Upstream                                             |
|--------------------|---------------------|--------|------------------------------------------------------|
| `bricolage.woff2`  | `Bricolage Grotesque` | 700/800 | https://github.com/ateliertriay/bricolage         |
| `reading-400.woff2`| `Stackyard Reading` | 400    | https://github.com/googlefonts/atkinson-hyperlegible |
| `reading-700.woff2`| `Stackyard Reading` | 700    | https://github.com/googlefonts/atkinson-hyperlegible |

Each file ships beside its full licence text:

- `OFL-BricolageGrotesque.txt`
- `OFL-AtkinsonHyperlegible.txt`

Both licence files are kept **verbatim** (copyright line + SIL Open Font
License 1.1). No Stackyard notes are added inside them.

## Reserved Font Name compliance (the `reading-*` subsets)

Atkinson Hyperlegible declares the Reserved Font Names "Atkinson" and
"Hyperlegible" (Braille Institute of America, Inc.).

`reading-400.woff2` and `reading-700.woff2` are a **Modified Version** of
Atkinson Hyperlegible under the SIL Open Font License 1.1: they are a
Latin-subset woff2 (codepoint coverage reduced to U+0020–U+007E and
U+00A0–U+00FF; glyph outlines unchanged). Under the OFL, deleting glyph
components to make a subset produces a Modified Version, which may not present
a Reserved Font Name to users.

So the subset does **not** present the reserved name — not in CSS and not inside
the font file:

- the CSS `font-family` is `Stackyard Reading`;
- the font's own name table was rewritten so the family, full name, PostScript
  name and unique identifier all read `Stackyard Reading` on every
  platform/encoding. Renaming only the CSS would leave "Atkinson Hyperlegible"
  inside the file, which a font inspector — and the base64 font embedded in an
  exported stack — would still surface. The copyright (name ID 0) and licence
  records are preserved as the OFL requires.

The rename is reproducible and also runs in the export build:

```
# needs: pip install --user fonttools brotli
python3 scripts/rename-reading-font.py             # rename the two subsets in place
python3 scripts/rename-reading-font.py --check     # verify no reserved name remains
```

Bricolage Grotesque declares no Reserved Font Name, so it keeps its upstream
name and is shipped unmodified.
