"""Shared embedding model loader.

Sits alongside ``llm_client.py`` because it is the same kind of thing: the
process-wide handle to a model that several layers legitimately need. It used
to live in ``pipelines/feature_extraction/``, which forced ``VectorService``
to import from ``pipelines/`` — the one place a service reached upwards.

``langchain_huggingface`` is imported lazily: loading it pulls in torch, and
nothing should pay that cost merely by importing this module.
"""

from __future__ import annotations

import logging
from functools import lru_cache

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_embeddings():  # type: ignore[return]
    """Return the cached HuggingFaceEmbeddings instance."""
    from langchain_huggingface import HuggingFaceEmbeddings  # noqa: PLC0415

    from storysphere.config.settings import get_settings  # noqa: PLC0415

    settings = get_settings()
    logger.info(
        "Loading embedding model '%s' on device '%s'",
        settings.embedding_model_name,
        settings.embedding_device,
    )
    return HuggingFaceEmbeddings(
        model_name=settings.embedding_model_name,
        model_kwargs={"device": settings.embedding_device},
        encode_kwargs={
            "batch_size": settings.embedding_batch_size,
            "normalize_embeddings": True,
        },
    )
