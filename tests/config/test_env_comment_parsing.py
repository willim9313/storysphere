"""Settings must not mistake a leftover ``.env`` comment for a value.

python-dotenv strips an inline comment only when a value precedes it, so a blank
setting written ``FOO=    # note`` loads as the string ``"# note"``. Every
consumer of these settings guards with plain truthiness, which a non-empty
comment sails straight through — see B-075.
"""

from __future__ import annotations

import io

from dotenv import dotenv_values
from storysphere.config.settings import Settings


class TestDotenvBehaviour:
    """Pins the upstream quirk this validator exists to absorb."""

    @staticmethod
    def _parse(text: str) -> dict[str, str | None]:
        return dotenv_values(stream=io.StringIO(text))

    def test_comment_after_a_value_is_stripped(self):
        assert self._parse("FOO=bar    # note\n")["FOO"] == "bar"

    def test_comment_after_a_blank_value_becomes_the_value(self):
        # Not our behaviour to fix upstream — the point is that it happens, so
        # the validator below has to exist.
        assert self._parse("FOO=    # note\n")["FOO"] == "# note"


class TestOrphanedCommentsAreBlankedOut:
    def test_comment_only_value_reads_as_unset(self):
        s = Settings(local_llm_model="# e.g. qwen2.5:3b, llama3.2, phi3.5")
        assert s.local_llm_model == ""
        assert not s.has_local_llm

    def test_leading_whitespace_does_not_hide_the_comment(self):
        assert Settings(qdrant_api_key="   # Leave empty for local Qdrant").qdrant_api_key == ""

    def test_a_real_value_is_untouched(self):
        s = Settings(local_llm_model="qwen2.5:3b")
        assert s.local_llm_model == "qwen2.5:3b"
        assert s.has_local_llm

    def test_applies_across_subsystems_not_just_the_llm_settings(self):
        # All four are written as blank-plus-comment in .env.example, and all
        # four consumers test them for truthiness.
        s = Settings(
            local_llm_model="# e.g. qwen2.5:3b",
            qdrant_api_key="# Leave empty for local Qdrant",
            langfuse_base_url="# Leave empty for cloud",
            log_file="# Optional log file path",
        )
        assert s.local_llm_model == ""
        assert s.qdrant_api_key == ""
        assert s.langfuse_base_url == ""
        assert s.log_file == ""

    def test_a_value_merely_containing_a_hash_is_kept(self):
        # Only a value that *starts* with '#' is a leaked comment.
        assert Settings(qdrant_api_key="abc#def").qdrant_api_key == "abc#def"
