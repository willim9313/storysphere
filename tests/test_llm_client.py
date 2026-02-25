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


def test_no_key_raises():
    from config.settings import Settings
    s = Settings(gemini_api_key="", openai_api_key="", anthropic_api_key="")
    client = LLMClient(settings=s)
    with pytest.raises(RuntimeError, match="No LLM provider configured"):
        client.get_primary()


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
