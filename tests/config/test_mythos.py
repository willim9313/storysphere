"""Unit tests for mythos id resolution."""

from __future__ import annotations

import pytest
from storysphere.config.mythos import resolve_mythos_id


class TestResolveMythosId:
    def test_passes_through_a_canonical_id(self):
        assert resolve_mythos_id("frye", "tragedy") == "tragedy"
        assert resolve_mythos_id("booker", "overcoming_the_monster") == (
            "overcoming_the_monster"
        )

    def test_maps_a_chinese_display_name_back_to_its_id(self):
        """The observed failure: the prompt shows `**悲劇** (tragedy)` and the
        model answers with the bold name."""
        assert resolve_mythos_id("frye", "悲劇") == "tragedy"
        assert resolve_mythos_id("frye", "浪漫傳奇") == "romance"
        assert resolve_mythos_id("frye", "諷刺／反諷") == "irony_satire"

    def test_maps_an_english_display_name_back_to_its_id(self):
        assert resolve_mythos_id("frye", "Tragedy") == "tragedy"

    def test_resolves_per_framework(self):
        assert resolve_mythos_id("booker", "重生") == "rebirth"
        assert resolve_mythos_id("booker", "追尋") == "the_quest"

    @pytest.mark.parametrize("value", ["", None])
    def test_empty_values_resolve_to_none(self, value):
        assert resolve_mythos_id("frye", value) is None

    def test_unknown_value_resolves_to_none_rather_than_passing_through(self):
        """A value no consumer can key on is worse than null."""
        assert resolve_mythos_id("frye", "autumn_tragedy") is None
        assert resolve_mythos_id("frye", "史詩") is None

    def test_ignores_surrounding_whitespace_and_case(self):
        assert resolve_mythos_id("frye", "  TRAGEDY  ") == "tragedy"
        assert resolve_mythos_id("frye", " 悲劇 ") == "tragedy"

    def test_same_name_in_both_frameworks_resolves_within_its_own(self):
        """'悲劇' is both a Frye mythos and a Booker plot."""
        assert resolve_mythos_id("frye", "悲劇") == "tragedy"
        assert resolve_mythos_id("booker", "悲劇") == "tragedy"
        # ...but a Booker-only plot must not resolve under Frye.
        assert resolve_mythos_id("frye", "重生") is None
