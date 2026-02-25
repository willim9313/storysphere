from __future__ import annotations

import logging
from enum import Enum
from typing import Optional

from langchain_core.language_models import BaseChatModel

from config.settings import Settings, get_settings

logger = logging.getLogger(__name__)


class LLMProvider(str, Enum):
    GEMINI = "gemini"
    OPENAI = "openai"
    ANTHROPIC = "anthropic"


class LLMClient:
    """LangChain LLM factory.

    Provider priority (ADR-009):
        1. Gemini   – primary
        2. OpenAI   – fallback
        3. Anthropic – second fallback

    Usage::

        client = get_llm_client()
        llm = client.get_primary()           # Gemini by default
        response = llm.invoke("Hello!")

        # Async
        response = await llm.ainvoke("Hello!")
    """

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self._settings = settings or get_settings()
        self._cache: dict[str, BaseChatModel] = {}

    # ── Public API ─────────────────────────────────────────────────────────────

    def get_primary(self, temperature: float = 0.1, **kwargs: object) -> BaseChatModel:
        """Return the primary LLM (Gemini if configured, else first available fallback)."""
        return self.get_llm(provider=self._resolve_primary(), temperature=temperature, **kwargs)

    def get_fallback(self, temperature: float = 0.1, **kwargs: object) -> BaseChatModel:
        """Return the first available fallback LLM (OpenAI → Anthropic)."""
        for provider in (LLMProvider.OPENAI, LLMProvider.ANTHROPIC):
            if self._has_key(provider):
                return self.get_llm(provider=provider, temperature=temperature, **kwargs)
        raise RuntimeError(
            "No fallback LLM configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in .env."
        )

    def get_llm(
        self,
        provider: Optional[LLMProvider] = None,
        temperature: float = 0.1,
        **kwargs: object,
    ) -> BaseChatModel:
        """Return (and cache) a LangChain chat model for the given provider."""
        provider = provider or self._resolve_primary()
        cache_key = f"{provider.value}:t={temperature}"
        if cache_key not in self._cache:
            self._cache[cache_key] = self._build(provider, temperature, **kwargs)
        return self._cache[cache_key]

    # ── Internal helpers ───────────────────────────────────────────────────────

    def _resolve_primary(self) -> LLMProvider:
        for provider in (LLMProvider.GEMINI, LLMProvider.OPENAI, LLMProvider.ANTHROPIC):
            if self._has_key(provider):
                if provider != LLMProvider.GEMINI:
                    logger.warning(
                        "GEMINI_API_KEY not set. Using %s as primary LLM.", provider.value
                    )
                return provider
        raise RuntimeError(
            "No LLM provider configured. "
            "Set at least one of: GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY."
        )

    def _has_key(self, provider: LLMProvider) -> bool:
        match provider:
            case LLMProvider.GEMINI:
                return bool(self._settings.gemini_api_key)
            case LLMProvider.OPENAI:
                return bool(self._settings.openai_api_key)
            case LLMProvider.ANTHROPIC:
                return bool(self._settings.anthropic_api_key)

    def _build(
        self, provider: LLMProvider, temperature: float, **kwargs: object
    ) -> BaseChatModel:
        match provider:
            case LLMProvider.GEMINI:
                return self._build_gemini(temperature, **kwargs)
            case LLMProvider.OPENAI:
                return self._build_openai(temperature, **kwargs)
            case LLMProvider.ANTHROPIC:
                return self._build_anthropic(temperature, **kwargs)

    def _build_gemini(self, temperature: float, **kwargs: object) -> BaseChatModel:
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=str(kwargs.pop("model", self._settings.gemini_model)),
            temperature=temperature,
            google_api_key=self._settings.gemini_api_key,
            **kwargs,
        )

    def _build_openai(self, temperature: float, **kwargs: object) -> BaseChatModel:
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=str(kwargs.pop("model", self._settings.openai_model)),
            temperature=temperature,
            api_key=self._settings.openai_api_key,  # type: ignore[arg-type]
            **kwargs,
        )

    def _build_anthropic(self, temperature: float, **kwargs: object) -> BaseChatModel:
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            model=str(kwargs.pop("model", self._settings.anthropic_model)),
            temperature=temperature,
            api_key=self._settings.anthropic_api_key,  # type: ignore[arg-type]
            **kwargs,
        )


# ── Singleton ──────────────────────────────────────────────────────────────────

_client: Optional[LLMClient] = None


def get_llm_client() -> LLMClient:
    """Return the global LLMClient singleton."""
    global _client
    if _client is None:
        _client = LLMClient()
    return _client
