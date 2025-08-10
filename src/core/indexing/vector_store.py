"""
向量資料庫操作模組：封裝 Qdrant 用法
note: 目前不會在此模組中進行chunking
"""
import os
from typing import List, Dict, Any, Optional, Union

from qdrant_client import QdrantClient
from qdrant_client.http import models
from sentence_transformers import SentenceTransformer
from collections import Counter


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
        """
        Ensure the collection exists with the correct settings.
        """
        collections = self.client.get_collections().collections
        exists = any(col.name == self.collection_name for col in collections)

        if exists:
            print(f"[Qdrant] Collection '{self.collection_name}' already exists.")
        if not exists:
            self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=models.VectorParams(
                    size=self.encoder.get_sentence_embedding_dimension(),
                    distance=models.Distance.COSINE
                )
            )
            print(f"[Qdrant] Collection '{self.collection_name}' created.")

    def set_collection(self, collection_name: str) -> None:
        """
        Set the current collection to use. if you want to switch collections.
        :param collection_name: Name of the collection to set
        """
        self.collection_name = collection_name
        self._ensure_collection()

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
        with_vectors: Union[bool, List[str]] = False,
        list_fields: Optional[Dict[str, str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Search for similar text chunks based on a query string.
        :param query_text: The text to search for
        :param limit: Maximum number of results to return
        :param filter: Optional filter to apply to the search
        :param with_payload: Whether to include payload in results
            - True  → 回傳完整 payload（預設）
            - False → 不回傳 payload
            - list  → 只回傳指定欄位
        :param with_vectors: Whether to include vectors in results
            - True  → 一併取回向量
            - False → 不取回向量（預設）
            - list  → 只取回指定名稱的向量
        :param list_fields: 指定 list 欄位的匹配模式 {'field_name': 'any'|'exact'}
        
        :return: List of search results with IDs, scores, payloads, and vectors
        """
        query_vec = self.encoder.encode(query_text).tolist()
        qdrant_filter = self._build_filter(filter, list_fields) if filter else None

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

    def get_node_by_id(
        self, 
        node_id: Union[str, int],
        with_payload: Union[bool, List[str]] = True,
        with_vectors: Union[bool, List[str]] = False
    ) -> Optional[Dict[str, Any]]:
        """
        Retrieve a node by its ID.
        :param node_id: The ID of the node to retrieve
        :param with_payload: Whether to include payload in the result
            - True  → 回傳完整 payload（預設）
            - False → 不回傳 payload
            - list  → 只回傳指定欄位
        :param with_vectors: Whether to include vectors in the result
            - True  → 一併取回向量
            - False → 不取回向量（預設）
            - list  → 只取回指定名稱的向量

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

    ### till here ###
    def update_node_metadata(
        self, 
        node_id: Union[str, int], 
        new_metadata: Dict[str, Any], 
        merge: bool = True,
        wait: bool = True
    ) -> bool:
        """
        Update(or overwrite) the metadata of a node in the collection.
        :param node_id: The ID of the node to update
        :param new_metadata: New metadata to set for the node
        :param merge: If True, merge with existing metadata; if False, overwrite
        :param wait: If True, wait for the operation to complete before returning
        
        :return: True if update was successful, False otherwise
        """
        try:
            if merge:
                # 部分更新：只寫入 new_metadata 中的欄位
                self.client.set_payload(
                    collection_name=self.collection_name,
                    payload=new_metadata,
                    points=[node_id],
                    wait=wait
                )
            else:
                # 完全覆蓋：old payload 會被整筆替換
                self.client.overwrite_payload(
                    collection_name=self.collection_name,
                    payload=new_metadata,
                    points=[node_id],
                    wait=wait
                )
            return True
        except Exception as e:
            print(f"[Qdrant] Update node {node_id} metadata failed: {e}")
            return False

    def count_nodes(
        self, 
        filter: Optional[Dict[str, Any]] = None,
        exact: bool = True,
        list_fields: Optional[Dict[str, str]] = None
    ) -> int:
        """
        Count the number of points in the collection with optional filtering.
        :param filter: Optional filter to apply to the count
        :param exact: If True, count only points that exactly match the filter
        :return: Count of points matching the filter
        """
        qdrant_filter = self._build_filter(filter, list_fields) if filter else None
        try:
            result = self.client.count(
                collection_name=self.collection_name,
                count_filter=qdrant_filter,
                exact=exact
            )
            return result.count
        except Exception as e:
            print(f"[Qdrant] Count failed: {e}")
            return 0

    def scroll(
        self, 
        filter: Optional[Dict[str, Any]] = None, 
        limit: int = 100,
        offset: Optional[str] = None,
        with_payload: Union[bool, List[str]] = True,
        with_vectors: Union[bool, List[str]] = False,
        list_fields: Dict[str, str] = None
    ) -> List[Dict[str, Any]]:
        """
        Scroll through points in the collection with optional filtering.
        :param filter: Optional filter to apply to the scroll
        :param limit: Maximum number of points to return
        :param offset: Optional offset for pagination
        :param with_payload: Whether to include payload in results
            - True  → 回傳完整 payload（預設）
            - False → 不回傳 payload
            - list  → 只回傳指定欄位
        :param with_vectors: Whether to include vectors in results
            - True  → 一併取回向量
            - False → 不取回向量（預設）
            - list  → 只取回指定名稱的向量
        list_fields: 指定 list 欄位的匹配模式 {'field_name': 'any'|'exact'}
            - 'any': 匹配 list 中任一元素
            - 'exact': 精確匹配整個 list
        :return: List of points with IDs, payloads, and vectors
        """
        qdrant_filter = self._build_filter(filter, list_fields) if filter else None
        result, next_offset = self.client.scroll(
            collection_name=self.collection_name,
            scroll_filter=qdrant_filter,
            limit=limit,
            offset=offset,
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
        fdict: Dict[str, Any],
        list_fields: Optional[Dict[str, str]] = None
    ) -> models.Filter:
        """
        Build a Qdrant filter from a dictionary.
        :param fdict: Dictionary containing filter conditions
        :param list_fields: 指定 list 欄位的匹配模式 {'field_name': 'any'|'exact'}
        
        :return: Qdrant Filter object
        """
        list_fields = list_fields or {}
        must = []
        
        for k, v in fdict.items():
            if v is None:
                continue
                
        #     if k in list_fields:
        #         # 對於 list 欄位，使用 MatchValue 查詢包含關係
        #         # 在 Qdrant 中，對 list 欄位使用 MatchValue 會自動檢查是否包含該值
        #         # 最基本的條件符合對照方式
        #         must.append(models.FieldCondition(
        #             key=k,
        #             match=models.MatchValue(value=v)
        #         ))
        #     elif isinstance(v, list):
        #         # 如果傳入的值是 list，使用 MatchAny，有中就會被抓回
        #         must.append(models.FieldCondition(
        #             key=k,
        #             match=models.MatchAny(any=v)
        #         ))
        #     else:
        #         # 一般欄位使用 MatchValue
        #         must.append(models.FieldCondition(
        #             key=k,
        #             match=models.MatchValue(value=v)
        #         ))
    
        # return models.Filter(must=must)
            for k, v in fdict.items():
                if v is None:
                    continue
                    
                if k in list_fields:
                    match_mode = list_fields[k]
                    if match_mode == 'any':
                        # 對於 list 欄位，使用 MatchValue 查詢包含關係
                        must.append(models.FieldCondition(
                            key=k,
                            match=models.MatchValue(value=v)
                        ))
                    elif match_mode == 'exact':
                        # 精確匹配整個 list
                        must.append(models.FieldCondition(
                            key=k,
                            match=models.MatchValue(value=v)
                        ))
                elif isinstance(v, list):
                    # 如果傳入的值是 list，使用 MatchAny
                    must.append(models.FieldCondition(
                        key=k,
                        match=models.MatchAny(any=v)
                    ))
                else:
                    # 一般欄位使用 MatchValue
                    must.append(models.FieldCondition(
                        key=k,
                        match=models.MatchValue(value=v)
                    ))
    
        return models.Filter(must=must)
    def get_unique_metadata_values(
        self,
        collection_name: Optional[str] = None,
        key: str = None,
        batch_size: int = 1000
    ) -> set:
        """
        Get unique values for a specific metadata key across all points in the collection.
        :param collection_name: Name of the collection to query
        :param key: Metadata key to get unique values for
        :param batch_size: Number of points to process in each batch
        :return: Set of unique values for the specified metadata key
        """
        if not collection_name:
            collection_name = self.collection_name
        
        unique_values = set()
        offset = None
        
        while True:
            result = self.client.scroll(
                collection_name=collection_name,
                limit=batch_size,
                offset=offset,
                with_payload=True,
            )
            for point in result[0]:
                value = point.payload.get(key)
                if isinstance(value, list):
                    unique_values.update(value)
                else:
                    unique_values.add(value)

            if result[1] is None:
                break
            offset = result[1]

        return unique_values

    def get_metadata_value_counts(
        self,
        key: str,
        batch_size: int = 1000,
        filters: Optional[Dict[str, Any]] = None,
        list_fields: Optional[Dict[str, str]] = None
    ) -> Counter:
        """
        統計 Qdrant 中指定 metadata 欄位每個值的出現次數。

        :param key: 要統計的 payload 欄位名稱
        :param batch_size: 每次 scroll 的筆數
        :param filters: 可選的過濾條件
        :return: Counter 物件，key 為 metadata 值，value 為出現次數
        """
        offset = None
        value_counter = Counter()
        qdrant_filter = self._build_filter(filters, list_fields) if filters else None

        while True:
            result = self.client.scroll(
                collection_name=self.collection_name,
                limit=batch_size,
                offset=offset,
                with_payload=True,
                scroll_filter=qdrant_filter,
            )
            for point in result[0]:
                value = point.payload.get(key)
                if isinstance(value, list):
                    value_counter.update(value)
                else:
                    value_counter[value] += 1

            if result[1] is None:
                break
            offset = result[1]

        return value_counter

    def delete_points(
        self, 
        ids: Optional[List[int | str]] = None,
        filter: Optional[Dict[str, Any]] = None,
        wait: bool = True,
        list_fields: Optional[Dict[str, str]] = None
    ) -> bool:
        """
        從 Qdrant collection 中刪除指定的點。
        會優先以 IDs 刪除，若未提供 IDs 則使用 filter 刪除
        必定會等待資料庫處理完畢後才回傳

        Params
        ------
        ids : 要刪除的點的 ID 列表。
        filter : 用於篩選要刪除的點的 payload 過濾器

        Returns
        -------
        bool
            成功回傳 True; 失敗回傳 False。
        """
        if not ids and not filter:
            print("[Qdrant] 刪除點失敗：必須提供 IDs 或 filter。")
            return False

        try:
            if ids:
                self.client.delete(
                    collection_name=self.collection_name,
                    points_selector=models.PointIdsSelector(points=ids),
                    wait=wait,
                )
            elif filter:
                # Convert dictionary filter to Qdrant Filter object
                qdrant_filter = self._build_filter(filter, list_fields) if filter else None
                self.client.delete(
                    collection_name=self.collection_name,
                    points_selector=models.PointStruct(filter=qdrant_filter),
                    # points_selector=models.FilterSelector(filter=qdrant_filter),  # 還沒用過，後面要確認
                    wait=wait,
                )
            return True
        except Exception as exc:
            print(f"[Qdrant] 刪除點失敗：{exc}")
            return False
    
    # 別名方法，保持向後兼容
    def search_similar(self, *args, **kwargs):
        """Alias for search method"""
        return self.search(*args, **kwargs)
    
    def get_node_by_id(self, *args, **kwargs):
        """Alias for get_by_id method"""
        return self.get_by_id(*args, **kwargs)
    
    def update_node_metadata(self, *args, **kwargs):
        """Alias for update_metadata method"""
        return self.update_metadata(*args, **kwargs)
    
    def count_points(self, *args, **kwargs):
        """Alias for count method"""
        return self.count(*args, **kwargs)