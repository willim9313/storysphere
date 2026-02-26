"""Paragraph embedding generator using langchain-huggingface.

Wraps ``HuggingFaceEmbeddings`` (sentence-transformers) so the rest of the
pipeline stays provider-agnostic.  Settings are read from ``get_settings()``.
"""

from __future__ import annotations

import logging
from functools import lru_cache

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _get_embeddings():  # type: ignore[return]
    """Return a cached HuggingFaceEmbeddings instance."""
    from config.settings import get_settings
    from langchain_huggingface import HuggingFaceEmbeddings  # noqa: PLC0415

    settings = get_settings()
    logger.info(
        "Loading embedding model '%s' on device '%s'",
        settings.embedding_model_name,
        settings.embedding_device,
    )
    return HuggingFaceEmbeddings(
        model_name=settings.embedding_model_name,
        model_kwargs={"device": settings.embedding_device},
        encode_kwargs={"batch_size": settings.embedding_batch_size, "normalize_embeddings": True},
    )


class EmbeddingGenerator:
    """Generate dense vector embeddings for a list of text strings.

    Uses the model specified in ``Settings.embedding_model_name``
    (default: ``all-MiniLM-L6-v2``, 384 dims).
    """

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Return one embedding vector per input text (sync).

        Args:
            texts: Non-empty list of strings to embed.

        Returns:
            List of float vectors, same length as ``texts``.
        """
        if not texts:
            return []
        embeddings_model = _get_embeddings()
        return embeddings_model.embed_documents(texts)

    async def aembed_texts(self, texts: list[str]) -> list[list[float]]:
        """Async variant — offloads to a thread pool.

        Args:
            texts: Non-empty list of strings to embed.

        Returns:
            List of float vectors, same length as ``texts``.
        """
        import asyncio  # noqa: PLC0415

        if not texts:
            return []
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self.embed_texts, texts)
