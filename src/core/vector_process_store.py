"""
# vector_process_store.py
負責文本進入向量資料庫的處理模組。
"""
# 這應該是舊的寫法
# 新版不叫做custom vector store，而是叫做VectorStore

# 標準函式庫
import os
import uuid
import hashlib

# 第三方函式庫
from qdrant_client import QdrantClient
from qdrant_client.http import models
from sentence_transformers import SentenceTransformer
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core import Document
from collections import Counter

# 型別提示
from typing import List, Dict, Any, Optional


# def generate_point_id(doc_id: str, chunk_index: int) -> int:
#     # 使用 MD5 生成 doc_id 的哈希值
#     doc_id = str(doc_id)

#     hash_digest = hashlib.md5(doc_id.encode('utf-8')).hexdigest()
#     # 取前 8 個字符轉換成整數，作為基數
#     base_id = int(hash_digest[:8], 16)
#     # 結合 chunk_index 生成最終 ID
#     return base_id * 1000 + chunk_index

def generate_point_id() -> int:
    """
    這是用來彌補萬一沒有取得point_id的狀況下，備用生成的
    理論上在第一時間從data_store階段就會產生一組
    """
    uuid_point_id = str(uuid.uuid4())
    return uuid_point_id


class CustomVectorStore:
    def __init__(self, 
                 collection_name="novels", 
                 encode_model='all-MiniLM-L6-v2',
                 data=None):
        """
        Initialize the vector store with Qdrant client and encoder.
        目前寫死在裡面，暫時沒有移出的必要
        """
        self.client = QdrantClient(
            host=os.getenv("QDRANT_HOST", "localhost"),
            port=int(os.getenv("QDRANT_PORT", 6333))
        )
        self.encoder = SentenceTransformer(encode_model)
        self.collection_name = collection_name
        self._ensure_collection()
        
        self.chapter_data = data if data is not None else []

        self.data_chunk = []
        self.document = [] # Document objects to store text chunks; chunk_data output
        self.sections = [] # 切割後的文本片段，Document前的模樣; chunk_data output
        self.metadata_base = []

    def set_collection(self, collection_name:str):
        self.collection_name = collection_name
        self._ensure_collection()

    def _ensure_collection(self):
        """
        Ensure the collection exists with the correct settings.
        """
        collections = self.client.get_collections().collections
        exists = any(col.name == self.collection_name for col in collections)
        
        if exists:
            print(f'collection: {self.collection_name} already exist')
        else:
            self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=models.VectorParams(
                    size=self.encoder.get_sentence_embedding_dimension(),
                    distance=models.Distance.COSINE
                )
            )
    def chunk_data(self) -> tuple[List[Document], List[str]]:
        """
        Chunk the input data into several data point
        這塊有功能，但是並未使用，因為理想上chunking應該在data_store階段就完成
        同時會有其他資訊一起萃取跟處理
        """
        splitter = SentenceSplitter(chunk_size=1024, chunk_overlap=100)
        sections = splitter.split_text(self.chapter_data)
        
        documents = [Document(text=section) for section in sections]

        # 這邊應該要存放好切完的部分
        self.document = documents
        self.data_chunk = sections
        return documents, sections
    
    def store_chunk(self, 
                    point_id: int, 
                    chunk: str,
                    metadata: Dict[str, Any]):
        """
        Store the chunked data into the vector database.
        一次只塞一個 chunk
        """
        # Encode chunks
        embeddings = self.encoder.encode(chunk)
        
        # Prepare points for insertion
        points = [
            models.PointStruct(
                id=point_id,
                vector=embeddings.tolist(),
                payload={
                    **metadata
                }
            )]
        
        # Upload to Qdrant
        self.client.upsert(
            collection_name=self.collection_name,
            points=points
        )
        return None
    
    def store_chunks(self, 
                     doc_id: str, 
                     chunks_ids: List[int],
                     chunks: List[str], 
                     metadata: Dict) -> None:
        # 目前沒有使用，裡面也不對，未來要做調整
        """
        Store text chunks in the vector database.
        
        Args:
            doc_id: Unique identifier for the document
            chunks: List of text chunks to store
            metadata: Document metadata
        """
        # Encode chunks
        embeddings = self.encoder.encode(chunks)
        
        # Prepare points for insertion
        points = []
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            point_id = generate_point_id(doc_id, i)
            points.append(models.PointStruct(
                # id=doc_id*1000 +i,  # Using integer IDs
                id=point_id, # modified-using hashlib
                vector=embedding.tolist(),
                payload={
                    "doc_id": doc_id,
                    "chunk_index": i,
                    "text": chunk,
                    **metadata
                }
            ))
        
        # Upload to Qdrant
        self.client.upsert(
            collection_name=self.collection_name,
            points=points
        )

    def get_node_by_id(
        self,
        node_id: int | str,
        with_payload: bool | list[str] = True,
        with_vectors: bool | list[str] = False,
    ):
        """
        依據節點（Point）ID 讀取 Qdrant 中的單筆資料。

        參數
        ----------
        node_id : int | str
            Point 的 ID（`generate_point_id()` 產生的 int，或自行指定的字串）。
        with_payload : bool | list[str]
            - True  → 回傳完整 payload（預設）
            - False → 不回傳 payload
            - list  → 只回傳指定欄位
        with_vectors : bool | list[str]
            - True  → 一併取回向量
            - False → 不取回向量（預設）
            - list  → 只取回指定名稱的向量

        回傳
        -------
        dict | None
            找到時回傳 Qdrant `Record` 轉成 `dict`；否則回傳 `None`。
        """
        try:
            records = self.client.retrieve(
                collection_name=self.collection_name,
                ids=[node_id],                 # <- 官方建議傳入序列
                with_payload=with_payload,
                with_vectors=with_vectors,
            )  # 會回傳 list[Record]；空 list 代表查無此 ID
            return records[0].dict() if records else None
        except Exception as exc:
            print(f"[Qdrant] 讀取 ID={node_id} 失敗：{exc}")
            return None

    def update_node_metadata(
            self,
            node_id: int | str,
            new_metadata: Dict[str, Any],
            merge: bool = True,
            wait: bool = True,
            ) -> bool:
        """
        更新（或覆蓋）指定節點的 payload/metadata。

        參數
        ----------
        node_id : int | str
            要更新的 Point ID。
        new_metadata : Dict[str, Any]
            欲寫入的 metadata／payload。
        merge : bool, 預設 True
            - True  → 只更新指定欄位；未提到的欄位保持原值（呼叫 `set_payload`）。
            - False → 直接以 `new_metadata` 取代整個 payload（呼叫 `overwrite_payload`）。
        wait : bool, 預設 True
            是否等待伺服器完成寫入才回傳。

        回傳
        -------
        bool
            成功回傳 True；失敗回傳 False。
        """
        try:
            if merge:
                # 部分更新：只寫入 new_metadata 中的欄位
                self.client.set_payload(
                    collection_name=self.collection_name,
                    payload=new_metadata,
                    points=[node_id],          # 指定要更新的 point
                    wait=wait,
                )  # 其他欄位不會被動到 :contentReference[oaicite:0]{index=0}
            else:
                # 完全覆蓋：old payload 會被整筆替換
                self.client.overwrite_payload(
                    collection_name=self.collection_name,
                    payload=new_metadata,
                    points=[node_id],
                    wait=wait,
                )  # 非 new_metadata 欄位將被刪除 :contentReference[oaicite:1]{index=1}
            return True
        except Exception as exc:
            print(f"[Qdrant] 更新 node {node_id} metadata 失敗：{exc}")
            return False
    
    def delete_points(self, ids: Optional[List[int | str]] = None,
                      filter: Optional[Dict[str, Any]] = None,
                      wait: bool = True) -> bool:
        """
        從 Qdrant collection 中刪除指定的點。

        參數
        ----------
        ids : Optional[List[int | str]]
            要刪除的點的 ID 列表。
        filter : Optional[Dict[str, Any]]
            用於篩選要刪除的點的 payload 過濾器。
        wait : bool, 預設 True
            是否等待伺服器完成刪除操作。

        回傳
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
                    wait=wait,
                )
            elif filter:
                # Convert dictionary filter to Qdrant Filter object
                qdrant_filter = self._build_qdrant_filter(filter)
                self.client.delete(
                    collection_name=self.collection_name,
                    points_selector=models.PointStruct(filter=qdrant_filter),
                    wait=wait,
                )
            return True
        except Exception as exc:
            print(f"[Qdrant] 刪除點失敗：{exc}")
            return False

    # def _build_qdrant_filter(self, filter_dict: Dict[str, Any]) -> models.Filter:
    #     """
    #     Helper to convert a dictionary filter into a Qdrant Filter object.
    #     This is a simplified example and might need to be expanded for complex queries.
    #     目前還沒有相關情境，後續再盤點實際使用狀況再作調整
    #     """
    #     must_conditions = []
    #     for key, value in filter_dict.items():
    #         must_conditions.append(
    #             models.FieldCondition(
    #                 key=key,
    #                 match=models.MatchValue(value=value)
    #             )
    #         )
    #     return models.Filter(must=must_conditions)
    
    def _build_qdrant_filter(self, filter_dict: Dict[str, Any]) -> models.Filter:
        """
        將字典轉換為 Qdrant Filter。
        僅支援基本的 key-value 精準匹配（MatchValue），不包含 range、multi-match 等複雜條件。
        """
        must_conditions = []
        for key, value in filter_dict.items():
            if value is not None:
                must_conditions.append(
                    models.FieldCondition(
                        key=key,
                        match=models.MatchValue(value=value)
                    )
                )
        return models.Filter(must=must_conditions)
    

    def search_similar(self, query_text: str,
                       limit: int = 5,
                       filter: Optional[Dict[str, Any]] = None,
                       with_payload: bool | List[str] = True,
                       with_vectors: bool | List[str] = False) -> List[Dict[str, Any]]:
        """
        在向量資料庫中執行相似度搜尋。

        參數
        ----------
        query_text : str
            用於搜尋的查詢文本。
        limit : int, 預設 5
            回傳的相似結果數量上限。
        filter : Optional[Dict[str, Any]]
            用於篩選搜尋結果的 payload 過濾器。
        with_payload : bool | list[str]
            - True  → 回傳完整 payload（預設）
            - False → 不回傳 payload
            - list  → 只回傳指定欄位
        with_vectors : bool | list[str]
            - True  → 一併取回向量
            - False → 不取回向量（預設）
            - list  → 只取回指定名稱的向量

        回傳
        -------
        List[Dict[str, Any]]
            包含相似結果的字典列表，每個字典包含 'id', 'score', 'payload' 等資訊。
        """
        try:
            query_embedding = self.encoder.encode(query_text).tolist()
            
            qdrant_filter = None
            if filter:
                qdrant_filter = self._build_qdrant_filter(filter) # Re-use the helper

            search_result = self.client.search(
                collection_name=self.collection_name,
                query_vector=query_embedding,
                query_filter=qdrant_filter,
                limit=limit,
                with_payload=with_payload,
                with_vectors=with_vectors,
            )
            
            results = []
            for hit in search_result:
                results.append({
                    "id": hit.id,
                    "score": hit.score,
                    "payload": hit.payload,
                    "vector": hit.vector if with_vectors else None
                })
            return results
        except Exception as exc:
            print(f"[Qdrant] 搜尋失敗：{exc}")
            return []

    def count_points(self,
                     filter: Optional[Dict[str, Any]] = None,
                     exact: bool = True) -> int:
        """
        計算 Qdrant collection 中的點數量。

        參數
        ----------
        filter : Optional[Dict[str, Any]]
            用於篩選要計數的點的 payload 過濾器。
        exact : bool, 預設 True
            如果為 True，則回傳精確計數；如果為 False，則回傳近似計數（可能更快）。

        回傳
        -------
        int
            符合條件的點數量。
        """
        try:
            qdrant_filter = None
            if filter:
                qdrant_filter = self._build_qdrant_filter(filter) # Re-use the helper

            count_result = self.client.count(
                collection_name=self.collection_name,
                # query_filter=qdrant_filter,
                count_filter=qdrant_filter,
                exact=exact,
            )
            return count_result.count
        except Exception as exc:
            print(f"[Qdrant] 計數點失敗：{exc}")
            return 0

    # yet validate
    def retrieve_by_filter(self, 
                           filter: Dict[str, Any],
                           limit: int = 100, # 可以設定一個預設上限，避免一次撈取過多
                           collection: Optional[str] = None,
                           with_payload: bool | List[str] = True,
                           with_vectors: bool | List[str] = False) -> List[Dict[str, Any]]:

        """
        根據 payload 過濾器直接從 Qdrant 撈取資料，不需要 query 詞。
        在執行前會先使用 count_points 確認符合條件的數量。

        參數
        ----------
        filter : Dict[str, Any]
            用於篩選結果的 payload 過濾器。
        limit : int, 預設 100
            回傳的結果數量上限。
        with_payload : bool | list[str]
            - True  → 回傳完整 payload（預設）
            - False → 不回傳 payload
            - list  → 只回傳指定欄位
        with_vectors : bool | list[str]
            - True  → 一併取回向量
            - False → 不取回向量（預設）
            - list  → 只取回指定名稱的向量

        回傳
        -------
        List[Dict[str, Any]]
            包含符合條件結果的字典列表。
        """
        collection_name = collection or self.collection_name

        try:
            # 先使用 count_points 確認數量
            count = self.count_points(filter=filter)
            print(f"符合條件的資料數量為: {count} 筆。")

            if count == 0:
                return []
            
            # 如果數量過多，可以考慮是否要提示使用者或限制撈取
            if count > limit:
                print(f"警告：符合條件的資料數量 ({count} 筆) 超過預設撈取上限 ({limit} 筆)。將只撈取前 {limit} 筆。")

            qdrant_filter = self._build_qdrant_filter(filter)

            # 使用 client.scroll 方法：這是 Qdrant SDK 中用於根據 filter 遍歷點的標準方法，
            # 無需提供 query_vector。它會返回一個包含點記錄的列表。
            search_result, _next_page_offset = self.client.scroll(
                collection_name=collection_name,
                scroll_filter=qdrant_filter,
                limit=limit,
                with_payload=with_payload,
                with_vectors=with_vectors,
            )
            
            results = []
            for hit in search_result: 
                results.append({
                    "id": hit.id,
                    "payload": hit.payload,
                    "vector": hit.vector if with_vectors else None
                })
            return results
        except Exception as exc:
            print(f"[Qdrant] 根據 filter 撈取資料失敗：{exc}")
            return []

    def get_unique_metadata_values(self,
                                   collection_name: Optional[str] = None,
                                   key: str = None, 
                                   batch_size: int = 1000) -> set:
        """取得指定 metadata key 的所有 unique 值"""
        collection_name = collection_name or self.collection_name

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
            collection_name: Optional[str] = None,
            key: str = None,
            batch_size: int = 1000,
            filters: dict = None,
        ) -> Counter:
        """
        統計 Qdrant 中指定 metadata 欄位每個值的出現次數。

        :param collection_name: Collection 名稱
        :param key: 要統計的 payload 欄位名稱
        :param client: QdrantClient 實例
        :param batch_size: 每次 scroll 的筆數
        :param filters: 可選的 Qdrant filter dict（預設為 None）
        :return: Counter 物件，key 為 metadata 值，value 為出現次數
        """
        from qdrant_client.models import Filter
        collection_name = collection_name or self.collection_name
        offset = None
        value_counter = Counter()

        while True:
            result = self.client.scroll(
                collection_name=collection_name,
                limit=batch_size,
                offset=offset,
                with_payload=True,
                scroll_filter=Filter(**filters) if filters else None,
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


    

if __name__ == "__main__":
    # Example usage
  
    vs = CustomVectorStore('Animal Farm')
    
    
    
    # Retrieve a node by ID
    node = vs.get_node_by_id(21436896000)
    print(node)