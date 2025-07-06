"""
向量資料庫操作模組：封裝 Qdrant 用法
"""
import os
import uuid
import hashlib
from collections import Counter
from typing import List, Dict, Any, Optional, Union

from qdrant_client import QdrantClient
from qdrant_client.http import models
from sentence_transformers import SentenceTransformer
from llama_index.core import Document
from llama_index.core.node_parser import SentenceSplitter


class VectorStore:
    def __init__(self, 
                 collection_name: str = "default_collection", 
                 encode_model: str = 'all-MiniLM-L6-v2'):
        self.client = QdrantClient(
            host=os.getenv("QDRANT_HOST", "localhost"),
            port=int(os.getenv("QDRANT_PORT", 6333))
        )
        self.encoder = SentenceTransformer(encode_model)
        self.collection_name = collection_name
        self._ensure_collection()

    def _ensure_collection(self):
        collections = self.client.get_collections().collections
        exists = any(col.name == self.collection_name for col in collections)
        if not exists:
            self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=models.VectorParams(
                    size=self.encoder.get_sentence_embedding_dimension(),
                    distance=models.Distance.COSINE
                )
            )

    def store_chunk(self, point_id: Union[str, int], chunk: str, metadata: Dict[str, Any]):
        embedding = self.encoder.encode(chunk)
        point = models.PointStruct(
            id=point_id,
            vector=embedding.tolist(),
            payload=metadata
        )
        self.client.upsert(collection_name=self.collection_name, points=[point])

    def search(self, query_text: str, limit: int = 5,
               filter: Optional[Dict[str, Any]] = None,
               with_payload: Union[bool, List[str]] = True,
               with_vectors: Union[bool, List[str]] = False) -> List[Dict[str, Any]]:
        query_vec = self.encoder.encode(query_text).tolist()
        qdrant_filter = self._build_filter(filter) if filter else None

        results = self.client.search(
            collection_name=self.collection_name,
            query_vector=query_vec,
            query_filter=qdrant_filter,
            limit=limit,
            with_payload=with_payload,
            with_vectors=with_vectors,
        )

        return [{
            "id": r.id,
            "score": r.score,
            "payload": r.payload,
            "vector": r.vector if with_vectors else None
        } for r in results]

    def get_by_id(self, node_id: Union[str, int],
                  with_payload: Union[bool, List[str]] = True,
                  with_vectors: Union[bool, List[str]] = False) -> Optional[Dict[str, Any]]:
        try:
            result = self.client.retrieve(
                collection_name=self.collection_name,
                ids=[node_id],
                with_payload=with_payload,
                with_vectors=with_vectors
            )
            return result[0].dict() if result else None
        except Exception as e:
            print(f"[Qdrant] Get node failed: {e}")
            return None

    def update_metadata(self, node_id: Union[str, int], new_metadata: Dict[str, Any], merge=True) -> bool:
        try:
            if merge:
                self.client.set_payload(
                    collection_name=self.collection_name,
                    payload=new_metadata,
                    points=[node_id],
                    wait=True
                )
            else:
                self.client.overwrite_payload(
                    collection_name=self.collection_name,
                    payload=new_metadata,
                    points=[node_id],
                    wait=True
                )
            return True
        except Exception as e:
            print(f"[Qdrant] Update metadata failed: {e}")
            return False

    def count(self, filter: Optional[Dict[str, Any]] = None) -> int:
        qdrant_filter = self._build_filter(filter) if filter else None
        try:
            result = self.client.count(
                collection_name=self.collection_name,
                count_filter=qdrant_filter,
                exact=True
            )
            return result.count
        except Exception as e:
            print(f"[Qdrant] Count failed: {e}")
            return 0

    def scroll(self, filter: Optional[Dict[str, Any]] = None, limit: int = 100,
               with_payload: Union[bool, List[str]] = True,
               with_vectors: Union[bool, List[str]] = False) -> List[Dict[str, Any]]:
        qdrant_filter = self._build_filter(filter) if filter else None
        result, _ = self.client.scroll(
            collection_name=self.collection_name,
            scroll_filter=qdrant_filter,
            limit=limit,
            with_payload=with_payload,
            with_vectors=with_vectors,
        )
        return [{
            "id": r.id,
            "payload": r.payload,
            "vector": r.vector if with_vectors else None
        } for r in result]

    def _build_filter(self, fdict: Dict[str, Any]) -> models.Filter:
        must = [
            models.FieldCondition(
                key=k,
                match=models.MatchValue(value=v)
            ) for k, v in fdict.items() if v is not None
        ]
        return models.Filter(must=must)