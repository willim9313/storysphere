"""Integration tests for LLMClient (Gemini).

Requires GEMINI_API_KEY in .env or environment.
Run with:
    uv run pytest tests/test_llm_client.py -v -s
"""
import pytest

from core.llm_client import LLMClient, LLMProvider, get_llm_client
from config.settings import get_settings


# ── Unit tests (no API call) ───────────────────────────────────────────────────

def test_settings_loaded():
    settings = get_settings()
    assert isinstance(settings.gemini_model, str)
    assert isinstance(settings.chat_cache_ttl_seconds, int)


def test_client_instantiation():
    client = get_llm_client()
    assert isinstance(client, LLMClient)


def test_singleton():
    a = get_llm_client()
    b = get_llm_client()
    assert a is b


def test_has_key_false_for_empty():
    from config.settings import Settings
    s = Settings(gemini_api_key="", openai_api_key="", anthropic_api_key="")
    client = LLMClient(settings=s)
    assert not client._has_key(LLMProvider.GEMINI)
    assert not client._has_key(LLMProvider.OPENAI)
    assert not client._has_key(LLMProvider.ANTHROPIC)
    assert not client._has_key(LLMProvider.LOCAL)


def test_no_key_raises():
    from config.settings import Settings
    s = Settings(gemini_api_key="", openai_api_key="", anthropic_api_key="")
    client = LLMClient(settings=s)
    with pytest.raises(RuntimeError, match="No LLM provider configured"):
        client.get_primary()


def test_local_has_key_when_model_set():
    from config.settings import Settings
    s = Settings(
        gemini_api_key="", openai_api_key="", anthropic_api_key="",
        local_llm_model="qwen2.5:3b",
    )
    client = LLMClient(settings=s)
    assert client._has_key(LLMProvider.LOCAL)


def test_local_is_primary_when_only_local_configured():
    from config.settings import Settings
    s = Settings(
        gemini_api_key="", openai_api_key="", anthropic_api_key="",
        local_llm_model="qwen2.5:3b",
    )
    client = LLMClient(settings=s)
    assert client._resolve_primary() == LLMProvider.LOCAL


def test_get_local_raises_when_not_configured():
    from config.settings import Settings
    s = Settings(gemini_api_key="", openai_api_key="", anthropic_api_key="")
    client = LLMClient(settings=s)
    with pytest.raises(RuntimeError, match="Local LLM not configured"):
        client.get_local()


def test_get_with_local_fallback_returns_primary_when_no_local():
    from config.settings import Settings
    s = Settings(gemini_api_key="fake-key", local_llm_model="")
    client = LLMClient(settings=s)
    # Should not raise; returns the primary (no .with_fallbacks wrapping)
    llm = client.get_with_local_fallback()
    assert llm is client.get_primary()


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
