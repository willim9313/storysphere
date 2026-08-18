"""Paragraph embedding generator using langchain-huggingface.

Wraps ``HuggingFaceEmbeddings`` (sentence-transformers) so the rest of the
pipeline stays provider-agnostic.  The model handle itself lives in
``core.embeddings`` because ``VectorService`` needs it too.
"""

from __future__ import annotations

import logging

from storysphere.core.embeddings import get_embeddings as _get_embeddings

logger = logging.getLogger(__name__)


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
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self.embed_texts, texts)
