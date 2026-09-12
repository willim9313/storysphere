"""Unit tests for Langfuse tracing configuration (sampling)."""

from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture
def clean_langfuse_env():
    """Save/restore the Langfuse env vars *and* the module-global handler that
    configure_langfuse writes.

    Restoring ``tracing._handler`` matters for cross-test isolation: when this
    test enables tracing with a patched ``CallbackHandler``, ``_handler`` is left
    holding a MagicMock. ``LLMClient._make_callbacks`` reads it via
    ``get_langfuse_handler()`` and passes it as a LangChain callback, so a later
    test that builds a real chat model fails callback validation. Resetting it
    here keeps the leak contained to this test.
    """
    from storysphere.core import tracing

    keys = [
        "LANGFUSE_SAMPLE_RATE",
        "LANGFUSE_PUBLIC_KEY",
        "LANGFUSE_SECRET_KEY",
        "LANGFUSE_TRACING_ENABLED",
        "LANGFUSE_BASE_URL",
    ]
    saved = {k: os.environ.get(k) for k in keys}
    saved_handler = tracing._handler
    yield
    for k, v in saved.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v
    tracing._handler = saved_handler


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


def _ok_client():
    """Patch target for the startup auth probe: keys accepted.

    Needed by every test that expects ``configure_langfuse`` to return True.
    Without it the probe runs for real against Langfuse — the fake pk-test /
    sk-test keys get a 401, tracing is disabled, and the test fails for a
    reason that has nothing to do with what it is checking. It also means the
    unit suite stops making a network call.
    """
    client = MagicMock()
    client.auth_check.return_value = True
    return patch("langfuse.get_client", return_value=client)


class TestConfigureLangfuseSampleRate:
    """These two patch inside langfuse, so they need it actually installed.

    Tracing is optional (see tests/core/test_tracing_observe.py) and the suite
    has to stay green on a machine without it — hence the skips rather than a
    hard import.
    """

    def test_sample_rate_propagated_to_env(self, clean_langfuse_env):
        pytest.importorskip("langfuse")
        from storysphere.core import tracing

        with patch("langfuse.langchain.CallbackHandler"), _ok_client():
            result = tracing.configure_langfuse(_settings(langfuse_sample_rate=0.25))

        assert result is True
        assert os.environ["LANGFUSE_SAMPLE_RATE"] == "0.25"

    def test_default_sample_rate_is_full(self, clean_langfuse_env):
        pytest.importorskip("langfuse")
        from storysphere.core import tracing

        with patch("langfuse.langchain.CallbackHandler"), _ok_client():
            tracing.configure_langfuse(_settings())  # default 1.0

        assert os.environ["LANGFUSE_SAMPLE_RATE"] == "1.0"

    def test_disabled_does_not_set_sample_rate(self, clean_langfuse_env):
        from storysphere.core import tracing

        os.environ.pop("LANGFUSE_SAMPLE_RATE", None)
        result = tracing.configure_langfuse(_settings(langfuse_enabled=False))

        assert result is False
        assert "LANGFUSE_SAMPLE_RATE" not in os.environ


class TestConfigureLangfuseAuthProbe:
    """The startup credential probe (2026-09-12).

    Constructing a ``CallbackHandler`` never contacts the server, so wrong keys
    used to produce a process that logged "tracing enabled" and dropped every
    span in silence. These pin the three outcomes apart.
    """

    def test_valid_credentials_enable_tracing(self, clean_langfuse_env):
        pytest.importorskip("langfuse")
        from storysphere.core import tracing

        with patch("langfuse.langchain.CallbackHandler"), _ok_client():
            result = tracing.configure_langfuse(_settings())

        assert result is True
        assert tracing.get_langfuse_handler() is not None

    def test_rejected_credentials_disable_tracing(self, clean_langfuse_env):
        """``auth_check`` RAISES on rejection — it does not return False.

        That is the whole reason this test exists: the first version of the
        probe caught the rejection in its generic ``except`` and filed it under
        "could not verify", leaving tracing on. Asserting on the raise pins the
        distinction so a later refactor cannot quietly collapse it.
        """
        pytest.importorskip("langfuse")
        from langfuse.api import UnauthorizedError
        from storysphere.core import tracing

        client = MagicMock()
        client.auth_check.side_effect = UnauthorizedError(body={"message": "nope"})
        with patch("langfuse.langchain.CallbackHandler"), patch(
            "langfuse.get_client", return_value=client
        ):
            result = tracing.configure_langfuse(_settings())

        assert result is False
        assert tracing.get_langfuse_handler() is None

    def test_unreachable_server_leaves_tracing_on(self, clean_langfuse_env):
        """Not being able to *check* the keys is not evidence they are wrong.

        A network blip at startup must not turn tracing off for the life of the
        process, so this path warns and proceeds.
        """
        pytest.importorskip("langfuse")
        from storysphere.core import tracing

        client = MagicMock()
        client.auth_check.side_effect = ConnectionError("dns go boom")
        with patch("langfuse.langchain.CallbackHandler"), patch(
            "langfuse.get_client", return_value=client
        ):
            result = tracing.configure_langfuse(_settings())

        assert result is True
        assert tracing.get_langfuse_handler() is not None
