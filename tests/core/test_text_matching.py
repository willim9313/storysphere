"""Unit tests for ``core.utils.text_matching`` (B-083).

The two pipelines that match terms against paragraph text share this helper, so
its contract is pinned here rather than being re-asserted from each side.
"""

from __future__ import annotations

from storysphere.core.utils.text_matching import squash_spacing


class TestSquashSpacing:
    def test_word_broken_across_a_line_rejoins(self):
        """The shape ``pypdf`` produces for CJK: ``礁石`` stored as ``礁 石``."""
        assert squash_spacing("走下了礁 石。") == "走下了礁石。"

    def test_letter_spaced_display_type_rejoins(self):
        """Colophons and title pages come back with a space per character, in
        both scripts — which is why CJK gaps alone would not be enough."""
        squashed = squash_spacing("霧  港  文  化 　 F O G  H A R B O R  P R E S S")

        assert "霧港文化" in squashed
        assert "FOGHARBORPRESS" in squashed

    def test_newlines_and_tabs_go_too(self):
        assert squash_spacing("a\nb\tc") == "abc"

    def test_ideographic_space_is_whitespace(self):
        """U+3000 is what separates columns in the corpus, and ``\\s`` covers it."""
        assert squash_spacing("霧　港") == "霧港"

    def test_text_without_spacing_is_unchanged(self):
        assert squash_spacing("礁石") == "礁石"

    def test_empty_and_none_are_safe(self):
        assert squash_spacing("") == ""
        assert squash_spacing(None) == ""

    def test_it_can_join_words_that_did_not_earn_the_match(self):
        """The accepted cost, pinned so it is a known trade rather than a
        surprise: a missed match is a silent undercount that looks like real
        data, while this one is visible in the text."""
        assert "sea" in squash_spacing("these ashes")
