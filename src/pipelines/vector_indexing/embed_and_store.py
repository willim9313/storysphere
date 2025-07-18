# pipeline/vector_indexing/embed_and_store.py
"""
將處理後的 chunk 向量化並儲存進 Qdrant。
"""
from core.indexing.vector_store import VectorStore
from typing import Dict, Any


def embed_and_store_chunk(
    chunk_data: Dict[str, Any], 
    collection_name: str
) -> None:
    """
    將一個 chunk 的處理結果向量化並儲存進指定 Qdrant collection。

    chunk_data 應包含欄位：
        - chunk_id: str
        - chunk: str
        - 其他欄位將視為 metadata 一併儲存
    """
    chunk_id = chunk_data["chunk_id"]
    chunk_text = chunk_data["chunk"]
    metadata = {k: v for k, v in chunk_data.items()}

    vs = VectorStore(collection_name)
    # chunk_text 這樣進去會被拿去向量化，因此原文會儲存在metadata中
    vs.store_chunk(
        point_id=chunk_id, 
        chunk=chunk_text, 
        metadata=metadata
    )
