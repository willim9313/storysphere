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
    LOCAL = "local"  # OpenAI-compat local (llama.cpp / Ollama / LM Studio)


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
        self._token_store: object | None = None

    def set_token_store(self, token_store: object) -> None:
        """Inject a :class:`TokenUsageStore` for persistent token tracking.

        Must be called before any ``get_*`` method so that newly built LLMs
        include the tracking callback.  Clears the LLM cache to ensure all
        future builds pick up the store.
        """
        self._token_store = token_store
        self._cache.clear()

    # ── Public API ─────────────────────────────────────────────────────────────

    def get_primary(
        self, temperature: float = 0.1, **kwargs: object
    ) -> BaseChatModel:
        """Return the primary LLM as configured by PRIMARY_LLM_PROVIDER."""
        return self.get_llm(
            provider=self._resolve_primary(), temperature=temperature, **kwargs
        )

    def get_fallback(
        self, temperature: float = 0.1, **kwargs: object
    ) -> BaseChatModel:
        """Return the first available fallback LLM, excluding the primary provider."""
        primary = LLMProvider(self._settings.primary_llm_provider)
        for provider in (
            LLMProvider.GEMINI,
            LLMProvider.OPENAI,
            LLMProvider.ANTHROPIC,
            LLMProvider.LOCAL,
        ):
            if provider != primary and self._has_key(provider):
                return self.get_llm(
                    provider=provider, temperature=temperature, **kwargs
                )
        raise RuntimeError(
            "No fallback LLM configured (excluding primary provider). "
            "Set at least one additional provider key in .env."
        )

    def get_local(
        self, temperature: float = 0.1, **kwargs: object
    ) -> BaseChatModel:
        """Return the local LLM (requires LOCAL_LLM_MODEL to be set)."""
        if not self._has_key(LLMProvider.LOCAL):
            raise RuntimeError(
                "Local LLM not configured. Set LOCAL_LLM_MODEL in .env."
            )
        return self.get_llm(
            provider=LLMProvider.LOCAL, temperature=temperature, **kwargs
        )

    def get_with_local_fallback(
        self, temperature: float = 0.1, **kwargs: object
    ) -> BaseChatModel:
        """Return a cloud LLM chained with local fallback: cloud fails → local.

        Fallback chain is intentionally flat (cloud → local only).
        Multiple cloud providers are NOT chained — only the highest-priority
        configured cloud is used as primary.

        Scenarios:
        - cloud + local configured : primary.with_fallbacks([local])
        - cloud only               : primary (no fallback)
        - local only               : local (no fallback)
        """
        has_cloud = LLMProvider(self._settings.primary_llm_provider) in (
            LLMProvider.GEMINI, LLMProvider.OPENAI, LLMProvider.ANTHROPIC
        )
        has_local = self._has_key(LLMProvider.LOCAL)

        primary = self.get_primary(temperature=temperature, **kwargs)

        if has_cloud and has_local:
            local = self.get_local(temperature=temperature)
            return primary.with_fallbacks([local])

        return primary

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
        target = LLMProvider(self._settings.primary_llm_provider)
        if not self._has_key(target):
            key_hint = {
                LLMProvider.GEMINI: "GEMINI_API_KEY",
                LLMProvider.OPENAI: "OPENAI_API_KEY",
                LLMProvider.ANTHROPIC: "ANTHROPIC_API_KEY",
                LLMProvider.LOCAL: "LOCAL_LLM_MODEL",
            }[target]
            raise RuntimeError(
                f"PRIMARY_LLM_PROVIDER={target.value} but {key_hint} is not set. "
                f"Set {key_hint} in .env or change PRIMARY_LLM_PROVIDER."
            )
        return target

    def _has_key(self, provider: LLMProvider) -> bool:
        match provider:
            case LLMProvider.GEMINI:
                return bool(self._settings.gemini_api_key)
            case LLMProvider.OPENAI:
                return bool(self._settings.openai_api_key)
            case LLMProvider.ANTHROPIC:
                return bool(self._settings.anthropic_api_key)
            case LLMProvider.LOCAL:
                return bool(self._settings.local_llm_model)

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
            case LLMProvider.LOCAL:
                return self._build_local(temperature, **kwargs)

    def _make_callbacks(self, provider: str, model: str) -> list:
        """Build callback list including token tracking if a store is set."""
        from core.token_callback import TokenTrackingHandler

        return [TokenTrackingHandler(provider=provider, model=model, token_store=self._token_store)]

    def _build_gemini(self, temperature: float, **kwargs: object) -> BaseChatModel:
        from langchain_google_genai import ChatGoogleGenerativeAI

        model = str(kwargs.pop("model", self._settings.gemini_model))
        # Thinking config: disable by default to save token costs
        if self._settings.llm_thinking_enabled:
            kwargs.setdefault("thinking_budget", self._settings.llm_thinking_budget)
        else:
            kwargs.setdefault("thinking_budget", 0)
        return ChatGoogleGenerativeAI(
            model=model,
            temperature=temperature,
            google_api_key=self._settings.gemini_api_key,
            callbacks=self._make_callbacks("gemini", model),
            **kwargs,
        )

    def _build_openai(self, temperature: float, **kwargs: object) -> BaseChatModel:
        from langchain_openai import ChatOpenAI

        model = str(kwargs.pop("model", self._settings.openai_model))
        return ChatOpenAI(
            model=model,
            temperature=temperature,
            api_key=self._settings.openai_api_key,  # type: ignore[arg-type]
            callbacks=self._make_callbacks("openai", model),
            **kwargs,
        )

    def _build_anthropic(self, temperature: float, **kwargs: object) -> BaseChatModel:
        from langchain_anthropic import ChatAnthropic

        model = str(kwargs.pop("model", self._settings.anthropic_model))
        # Thinking config: only pass when explicitly enabled
        if self._settings.llm_thinking_enabled and "thinking" not in kwargs:
            kwargs["thinking"] = {
                "type": "enabled",
                "budget_tokens": self._settings.llm_thinking_budget,
            }
        return ChatAnthropic(
            model=model,
            temperature=temperature,
            api_key=self._settings.anthropic_api_key,  # type: ignore[arg-type]
            callbacks=self._make_callbacks("anthropic", model),
            **kwargs,
        )

    def _build_local(self, temperature: float, **kwargs: object) -> BaseChatModel:
        """Build a ChatOpenAI pointed at a local OpenAI-compatible server.

        Compatible with llama.cpp server, Ollama (``/v1`` path), and LM Studio.
        No API key is required; a dummy value satisfies the SDK validation.
        """
        from langchain_openai import ChatOpenAI

        model = str(kwargs.pop("model", self._settings.local_llm_model))
        return ChatOpenAI(
            model=model,
            temperature=temperature,
            base_url=self._settings.local_llm_base_url,
            api_key="local",  # type: ignore[arg-type]  # dummy — not validated locally
            max_tokens=4096,   # prevent runaway generation on local models
            timeout=120,       # 120s hard timeout per request
            callbacks=self._make_callbacks("local", model),
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
