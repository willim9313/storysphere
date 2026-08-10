"""Integration tests for LLMClient (Gemini).

Requires GEMINI_API_KEY in .env or environment.
Run with:
    uv run pytest tests/test_llm_client.py -v -s
"""
import pytest

from storysphere.core.llm_client import LLMClient, LLMProvider, get_llm_client
from storysphere.config.settings import get_settings


# ── Unit tests (no API call) ───────────────────────────────────────────────────

def test_settings_loaded():
    settings = get_settings()
    assert isinstance(settings.gemini_model, str)
    assert isinstance(settings.analysis_cache_db_path, str)


def test_client_instantiation():
    client = get_llm_client()
    assert isinstance(client, LLMClient)


def test_singleton():
    a = get_llm_client()
    b = get_llm_client()
    assert a is b


def test_has_key_false_for_empty():
    from storysphere.config.settings import Settings
    s = Settings(gemini_api_key="", openai_api_key="", anthropic_api_key="", local_llm_model="")
    client = LLMClient(settings=s)
    assert not client._has_key(LLMProvider.GEMINI)
    assert not client._has_key(LLMProvider.OPENAI)
    assert not client._has_key(LLMProvider.ANTHROPIC)
    assert not client._has_key(LLMProvider.LOCAL)


def test_no_key_raises():
    from storysphere.config.settings import Settings
    s = Settings(gemini_api_key="", openai_api_key="", anthropic_api_key="", local_llm_model="")
    client = LLMClient(settings=s)
    with pytest.raises(RuntimeError, match="GEMINI_API_KEY is not set"):
        client.get_primary()


def test_local_has_key_when_model_set():
    from storysphere.config.settings import Settings
    s = Settings(
        gemini_api_key="", openai_api_key="", anthropic_api_key="",
        local_llm_model="qwen2.5:3b",
    )
    client = LLMClient(settings=s)
    assert client._has_key(LLMProvider.LOCAL)


def test_local_is_primary_when_only_local_configured():
    from storysphere.config.settings import Settings
    s = Settings(
        gemini_api_key="", openai_api_key="", anthropic_api_key="",
        local_llm_model="qwen2.5:3b",
        primary_llm_provider="local",
    )
    client = LLMClient(settings=s)
    assert client._resolve_primary() == LLMProvider.LOCAL


def test_get_local_raises_when_not_configured():
    from storysphere.config.settings import Settings
    s = Settings(gemini_api_key="", openai_api_key="", anthropic_api_key="", local_llm_model="")
    client = LLMClient(settings=s)
    with pytest.raises(RuntimeError, match="Local LLM not configured"):
        client.get_local()


def test_get_with_local_fallback_returns_primary_when_no_local():
    from storysphere.config.settings import Settings
    s = Settings(gemini_api_key="fake-key", local_llm_model="")
    client = LLMClient(settings=s)
    # Should not raise; returns the primary (no .with_fallbacks wrapping)
    llm = client.get_with_local_fallback()
    assert llm is client.get_primary()


# ── Placeholder credentials must not read as configured (B-075) ───────────────

def test_placeholder_keys_are_not_configured():
    from storysphere.config.settings import Settings
    # The exact strings .env.example ships. Non-empty, so bare truthiness — what
    # _has_key used to do — reports all three as ready to use.
    s = Settings(
        gemini_api_key="your_gemini_api_key_here",
        openai_api_key="your_openai_api_key_here",
        anthropic_api_key="your_anthropic_api_key_here",
        local_llm_model="",
    )
    client = LLMClient(settings=s)
    assert not client._has_key(LLMProvider.GEMINI)
    assert not client._has_key(LLMProvider.OPENAI)
    assert not client._has_key(LLMProvider.ANTHROPIC)


def test_placeholder_primary_raises_instead_of_being_used():
    from storysphere.config.settings import Settings
    s = Settings(gemini_api_key="your_gemini_api_key_here", local_llm_model="")
    client = LLMClient(settings=s)
    with pytest.raises(RuntimeError, match="GEMINI_API_KEY is not set"):
        client.get_primary()


def test_real_key_beginning_with_y_is_not_mistaken_for_a_placeholder():
    from storysphere.config.settings import Settings
    s = Settings(gemini_api_key="yA-real-looking-key", local_llm_model="")
    client = LLMClient(settings=s)
    assert client._has_key(LLMProvider.GEMINI)


def test_leftover_env_comment_does_not_become_a_fallback_llm():
    """The B-075 failure in one assertion.

    A blank LOCAL_LLM_MODEL written with a trailing comment loaded as that
    comment, so every one of the fifteen services calling
    get_with_local_fallback() got a ChatOpenAI named
    "# e.g. qwen2.5:3b, llama3.2, phi3.5" pointed at localhost:11434 — a
    fallback guaranteed to fail, attached to every LLM path in the system.
    """
    from storysphere.config.settings import Settings
    s = Settings(
        gemini_api_key="fake-key",
        local_llm_model="# e.g. qwen2.5:3b, llama3.2, phi3.5",
    )
    client = LLMClient(settings=s)
    assert not client._has_key(LLMProvider.LOCAL)
    assert client.get_with_local_fallback() is client.get_primary()


# ── Integration tests (require GEMINI_API_KEY) ─────────────────────────────────

@pytest.mark.integration
def test_gemini_sync_invoke():
    """Synchronous Gemini call — requires GEMINI_API_KEY."""
    settings = get_settings()
    if not settings.has_gemini:
        pytest.skip("GEMINI_API_KEY not set")

    client = LLMClient(settings=settings)
    llm = client.get_primary()
    response = llm.invoke("Reply with exactly one word: hello")
    assert response.content
    print(f"\nGemini response: {response.content!r}")


@pytest.mark.integration
@pytest.mark.asyncio
async def test_gemini_async_invoke():
    """Async Gemini call — requires GEMINI_API_KEY."""
    settings = get_settings()
    if not settings.has_gemini:
        pytest.skip("GEMINI_API_KEY not set")

    client = LLMClient(settings=settings)
    llm = client.get_primary()
    response = await llm.ainvoke("Reply with exactly one word: hello")
    assert response.content
    print(f"\nGemini async response: {response.content!r}")


@pytest.mark.integration
def test_gemini_provider_is_primary():
    """Verify Gemini is selected as primary when key is set."""
    settings = get_settings()
    if not settings.has_gemini:
        pytest.skip("GEMINI_API_KEY not set")

    client = LLMClient(settings=settings)
    assert client._resolve_primary() == LLMProvider.GEMINI
