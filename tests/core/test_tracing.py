"""Unit tests for Langfuse tracing configuration (sampling)."""

from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture
def clean_langfuse_env():
    """Save/restore the Langfuse env vars that configure_langfuse writes."""
    keys = [
        "LANGFUSE_SAMPLE_RATE",
        "LANGFUSE_PUBLIC_KEY",
        "LANGFUSE_SECRET_KEY",
        "LANGFUSE_TRACING_ENABLED",
        "LANGFUSE_BASE_URL",
    ]
    saved = {k: os.environ.get(k) for k in keys}
    yield
    for k, v in saved.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v


def _settings(**overrides):
    s = MagicMock()
    s.langfuse_enabled = True
    s.langfuse_public_key = "pk-test"
    s.langfuse_secret_key = "sk-test"
    s.langfuse_base_url = ""
    s.langfuse_sample_rate = 1.0
    for k, v in overrides.items():
        setattr(s, k, v)
    return s


class TestConfigureLangfuseSampleRate:
    def test_sample_rate_propagated_to_env(self, clean_langfuse_env):
        from storysphere.core import tracing

        with patch("langfuse.langchain.CallbackHandler"):
            result = tracing.configure_langfuse(_settings(langfuse_sample_rate=0.25))

        assert result is True
        assert os.environ["LANGFUSE_SAMPLE_RATE"] == "0.25"

    def test_default_sample_rate_is_full(self, clean_langfuse_env):
        from storysphere.core import tracing

        with patch("langfuse.langchain.CallbackHandler"):
            tracing.configure_langfuse(_settings())  # default 1.0

        assert os.environ["LANGFUSE_SAMPLE_RATE"] == "1.0"

    def test_disabled_does_not_set_sample_rate(self, clean_langfuse_env):
        from storysphere.core import tracing

        os.environ.pop("LANGFUSE_SAMPLE_RATE", None)
        result = tracing.configure_langfuse(_settings(langfuse_enabled=False))

        assert result is False
        assert "LANGFUSE_SAMPLE_RATE" not in os.environ
