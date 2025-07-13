"""
向量資料庫操作模組：封裝 Qdrant 用法
"""
import os
from typing import List, Dict, Any, Optional, Union

from qdrant_client import QdrantClient
from qdrant_client.http import models
from sentence_transformers import SentenceTransformer


class VectorStore:
    def __init__(
        self, 
        collection_name: str = "default_collection", 
        encode_model: str = 'all-MiniLM-L6-v2'
    ):
        """
        Initialize the vector store with Qdrant client and encoder.
        """
        self.client = QdrantClient(
            host=os.getenv("QDRANT_HOST", "localhost"),
            port=int(os.getenv("QDRANT_PORT", 6333))
        )
        self.encoder = SentenceTransformer(encode_model)
        self.collection_name = collection_name
        self._ensure_collection()

    def _ensure_collection(self) -> None:
        """Ensure the collection exists with the correct settings."""
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

    def store_chunk(
        self, 
        point_id: Union[str, int], 
        chunk: str, 
        metadata: Dict[str, Any]
    ) -> None:
        """
        Store a single text chunk in the vector database.
        :param point_id: Unique identifier for the point
        :param chunk: Text chunk to store
        :param metadata: Metadata associated with the chunk

        example:
        point_id = str(uuid.uuid4())  # Generate a unique ID for the point
        chunk = "This is a sample text chunk."
        metadata = {"source": "document_1", "timestamp": "2023-10-01T12:00:00Z"}
        self.store_chunk(point_id, chunk, metadata)
        """
        embedding = self.encoder.encode(chunk)
        point = models.PointStruct(
            id=point_id,
            vector=embedding.tolist(),
            payload=metadata
        )

        self.client.upsert(
            collection_name=self.collection_name, 
            points=[point]
        )

    def search(
        self, 
        query_text: str, 
        limit: int = 5,
        filter: Optional[Dict[str, Any]] = None,
        with_payload: Union[bool, List[str]] = True,
        with_vectors: Union[bool, List[str]] = False
    ) -> List[Dict[str, Any]]:
        """
        Search for similar text chunks based on a query string.
        :param query_text: The text to search for
        :param limit: Maximum number of results to return
        :param filter: Optional filter to apply to the search
        :param with_payload: Whether to include payload in results
        :param with_vectors: Whether to include vectors in results
        :return: List of search results with IDs, scores, payloads, and vectors
        """
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

    def get_by_id(
        self, 
        node_id: Union[str, int],
        with_payload: Union[bool, List[str]] = True,
        with_vectors: Union[bool, List[str]] = False
    ) -> Optional[Dict[str, Any]]:
        """
        Retrieve a node by its ID.
        :param node_id: The ID of the node to retrieve
        :param with_payload: Whether to include payload in the result
        :param with_vectors: Whether to include vectors in the result
        :return: Node data if found, otherwise None
        """
        try:
            result = self.client.retrieve(
                collection_name=self.collection_name,
                ids=[node_id],
                with_payload=with_payload,
                with_vectors=with_vectors
            )
            return result[0].model_dump() if result else None
        except Exception as e:
            print(f"[Qdrant] Get node failed: {e}")
            return None

    def update_metadata(
        self, 
        node_id: Union[str, int], 
        new_metadata: Dict[str, Any], 
        merge=True
    ) -> bool:
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

    def count(
        self, 
        filter: Optional[Dict[str, Any]] = None
    ) -> int:
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

    def scroll(
        self, 
        filter: Optional[Dict[str, Any]] = None, 
        limit: int = 100,
        with_payload: Union[bool, List[str]] = True,
        with_vectors: Union[bool, List[str]] = False
    ) -> List[Dict[str, Any]]:
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

    def _build_filter(
        self, 
        fdict: Dict[str, Any]
    ) -> models.Filter:
        must = [
            models.FieldCondition(
                key=k,
                match=models.MatchValue(value=v)
            ) for k, v in fdict.items() if v is not None
        ]
        return models.Filter(must=must)

    def delete_points(
        self, 
        ids: Optional[List[int | str]] = None,
        filter: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """
        從 Qdrant collection 中刪除指定的點。
        會優先以 IDs 刪除，若未提供 IDs 則使用 filter 刪除
        必定會等待資料庫處理完畢後才回傳

        Params
        ----------
        ids : 要刪除的點的 ID 列表。
        filter : 用於篩選要刪除的點的 payload 過濾器

        Returns
        -------
        bool
            成功回傳 True；失敗回傳 False。
        """
        if not ids and not filter:
            print("[Qdrant] 刪除點失敗：必須提供 IDs 或 filter。")
            return False

        try:
            if ids:
                self.client.delete(
                    collection_name=self.collection_name,
                    points_selector=models.PointIdsSelector(points=ids),
                    wait=True,
                )
            elif filter:
                # Convert dictionary filter to Qdrant Filter object
                qdrant_filter = self._build_qdrant_filter(filter)
                self.client.delete(
                    collection_name=self.collection_name,
                    points_selector=models.PointStruct(filter=qdrant_filter),
                    wait=True,
                )
            return True
        except Exception as exc:
            print(f"[Qdrant] 刪除點失敗：{exc}")
            return False