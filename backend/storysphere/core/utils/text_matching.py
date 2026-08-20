"""Matching helpers for text that came out of a PDF.

``pypdf`` reconstructs spacing from glyph geometry rather than from the source,
so the text in the database is not the text a reader sees. Anything that looks
for a substring in a paragraph has to account for that.
"""

from __future__ import annotations

import re

# Whitespace except newline: see the docstring for why the newline stays.
_INLINE_SPACE = re.compile(r"[^\S\n]+")


def squash_spacing(text: str) -> str:
    """Strip inline spacing from *text* so a word split by one still matches.

    ``pypdf`` places spaces from glyph positions, which means two things this
    repo's corpus shows plainly:

    - a word broken across a line comes back split — ``礁石`` is stored as
      ``礁 石``;
    - letter-spaced display type comes back with a space between every
      character — a colophon reads ``霧  港  文  化 　 F O G  H A R B O R  P R E S S``.

    Both scripts are affected, which is why this strips all whitespace rather
    than only the gaps between CJK characters. Two thirds of the paragraphs in
    the PDF-sourced books carry at least one split, so a term landing on one is
    luck rather than an edge case.

    **Newlines are left alone**, which bounds how far a wrong join can reach.
    The loader strips each PDF line and stores it as its own segment, so a word
    broken across a line always arrives as a *space* — never a newline. The
    newlines that do survive mark real structure: a chapter title against its
    body, or one paragraph against the next once ``"\n".join`` builds the
    chapter text. Squashing those would let two paragraphs fabricate a name
    across the seam between them. Audited over the corpus: keeping the newline
    costs nothing — all 32 spacing-repaired matches sit within a line — and
    closes that seam entirely.

    The cost that remains is that two words on the *same* line can join into a
    match neither of them earned (``"these ashes"`` contains ``"sea"`` once the
    space is gone). That is the accepted trade: substring matching over prose is
    already approximate, while a missed match is a silent undercount that looks
    like real data.
    """
    return _INLINE_SPACE.sub("", text or "")
