"""意象分群（02 §4 步驟 5），搬自舊 repo `ImageryExtractor.cluster_synonyms`。

嵌入模型可注入（`embedder`），測試與離線試跑用假的；沒給才 lazy 載入 sentence-transformers。
"""

from __future__ import annotations

import asyncio
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import numpy as np

# 舊 repo `imagery_embedding_model_name` 的預設（支援 50 多種語言）。
DEFAULT_EMBEDDING_MODEL = "paraphrase-multilingual-MiniLM-L12-v2"
SIMILARITY_THRESHOLD = 0.75

# 輸入一串字、回傳每個字一個向量（list[list[float]] 或 2 維 ndarray）。
Embedder = Callable[[list[str]], Any]


@dataclass
class TermCluster:
    canonical: str
    variants: list[str] = field(default_factory=list)

    @property
    def terms(self) -> set[str]:
        return {self.canonical, *self.variants}


def default_embedder() -> Embedder:
    """Load the sentence-transformers model (slow: only called when no embedder is injected)."""
    from sentence_transformers import SentenceTransformer  # noqa: PLC0415

    model = SentenceTransformer(DEFAULT_EMBEDDING_MODEL)

    def embed(texts: list[str]) -> Any:
        return model.encode(
            texts, normalize_embeddings=True, show_progress_bar=False, convert_to_numpy=True
        )

    return embed


def cluster_terms(
    terms: list[str], vectors: Any, threshold: float = SIMILARITY_THRESHOLD
) -> list[TermCluster]:
    """Greedy clustering by frequency.

    ``terms`` may repeat (for frequency); ``vectors`` has one row per UNIQUE term in order of
    first appearance. The most frequent unclustered term becomes canonical and absorbs every
    unclustered term whose cosine similarity to it is ≥ ``threshold``.
    """
    freq = Counter(terms)
    unique = list(freq)
    if not unique:
        return []
    matrix = np.asarray(vectors, dtype=np.float32)
    if matrix.ndim != 2 or matrix.shape[0] != len(unique):
        raise ValueError(f"Embedder returned {matrix.shape} for {len(unique)} terms")
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    matrix = matrix / np.where(norms == 0, 1.0, norms)

    position = {term: i for i, term in enumerate(unique)}
    ranked = sorted(unique, key=lambda t: freq[t], reverse=True)  # 同次數保持首次出現順序
    assigned: set[str] = set()
    clusters: list[TermCluster] = []
    for canonical in ranked:
        if canonical in assigned:
            continue
        assigned.add(canonical)
        cluster = TermCluster(canonical)
        for other in ranked:
            if other in assigned:
                continue
            if float(matrix[position[canonical]] @ matrix[position[other]]) >= threshold:
                cluster.variants.append(other)
                assigned.add(other)
        clusters.append(cluster)
    return clusters


async def embed_terms(embedder: Embedder | None, terms: list[str]) -> Any:
    """Run the (synchronous) embedder off the event loop."""
    if embedder is None:
        embedder = await asyncio.to_thread(default_embedder)
    return await asyncio.to_thread(embedder, terms)
