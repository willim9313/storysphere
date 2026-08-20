"""Matching helpers for text that came out of a PDF.

``pypdf`` reconstructs spacing from glyph geometry rather than from the source,
so the text in the database is not the text a reader sees. Anything that looks
for a substring in a paragraph has to account for that.
"""

from __future__ import annotations

import re

_WHITESPACE = re.compile(r"\s+")


def squash_spacing(text: str) -> str:
    """Strip every space from *text* so a word split by one still matches.

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

    The cost is that squashing can join two words into a match neither of them
    earned (``"these ashes"`` contains ``"sea"`` once the space is gone). That
    is the accepted trade: substring matching over prose is already approximate,
    while a missed match is a silent undercount that looks like real data.
    """
    return _WHITESPACE.sub("", text or "")
