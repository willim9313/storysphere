import pytest
import re
from unittest.mock import MagicMock, patch
from src.core.vector_process_store import CustomVectorStore, generate_point_id
from sentence_transformers import SentenceTransformer


# 測試 1: 測試 generate_point_id 是否產出合法 UUID
def test_generate_point_id_format():
    point_id = generate_point_id()
    assert re.fullmatch(r"[a-f0-9\-]{36}", point_id)


# 測試 2: 測試 CustomVectorStore 初始化時欄位是否正確
@patch("vector_process_store.QdrantClient")
@patch("vector_process_store.SentenceTransformer")
def test_init_custom_vector_store(mock_encoder, mock_qdrant):
    instance = CustomVectorStore(collection_name="test_collection")
    assert instance.collection_name == "test_collection"
    assert instance.encoder == mock_encoder.return_value
    assert instance.client == mock_qdrant.return_value


# 測試 3: 測試 _ensure_collection 在 collection 存在/不存在時行為
@patch("vector_process_store.QdrantClient")
@patch("vector_process_store.SentenceTransformer")
def test_ensure_collection(mock_encoder, mock_qdrant):
    mock_client = mock_qdrant.return_value
    mock_client.get_collections.return_value.collections = [
        type("obj", (object,), {"name": "test_collection"})()
    ]

    store = CustomVectorStore(collection_name="test_collection")
    store._ensure_collection()  # 應不會呼叫 create_collection
    mock_client.create_collection.assert_not_called()

    # 改為不存在的 collection
    mock_client.get_collections.return_value.collections = []
    store = CustomVectorStore(collection_name="new_collection")
    store._ensure_collection()
    mock_client.create_collection.assert_called_once()


# 測試 4: chunk_data 能否將文字正確切分為 chunks
@patch("vector_process_store.SentenceTransformer")
@patch("vector_process_store.QdrantClient")
def test_chunk_data(mock_qdrant, mock_encoder):
    long_text = "這是第一段。這是第二段。這是第三段。" * 50
    store = CustomVectorStore(data=long_text)
    documents, sections = store.chunk_data()

    assert isinstance(documents, list)
    assert isinstance(sections, list)
    assert all(hasattr(doc, "text") for doc in documents)
    assert len(documents) == len(sections)


# 測試 5: chunk_data 傳入空值應回傳空陣列
@patch("vector_process_store.SentenceTransformer")
@patch("vector_process_store.QdrantClient")
def test_chunk_data_empty(mock_qdrant, mock_encoder):
    store = CustomVectorStore(data="")
    documents, sections = store.chunk_data()
    assert documents == []
    assert sections == []


# 測試 6: encode model 不存在時應拋出例外
@patch("vector_process_store.QdrantClient")
def test_invalid_model_raises_error(mock_qdrant):
    with pytest.raises(OSError):
        CustomVectorStore(encode_model="non_existent_model")


# 測試 7: Qdrant 無法連線時應出現例外
@patch("vector_process_store.SentenceTransformer")
def test_qdrant_connection_fail(mock_encoder):
    with patch("vector_process_store.QdrantClient", side_effect=ConnectionError("fail")):
        with pytest.raises(ConnectionError):
            CustomVectorStore()


# 測試 8: encoder.encode 應能處理多段文本
@patch("vector_process_store.SentenceTransformer")
@patch("vector_process_store.QdrantClient")
def test_encoder_encode_batch(mock_qdrant, mock_encoder):
    mock_encoder.return_value.encode.return_value = [[0.1]*384, [0.2]*384]
    store = CustomVectorStore()
    encoded = store.encoder.encode(["text1", "text2"])
    assert isinstance(encoded, list)
    assert len(encoded) == 2
    assert all(isinstance(vec, list) for vec in encoded)


# 測試 9: 模擬 upsert 向量進入 Qdrant（未來擴充用途）
@patch("vector_process_store.QdrantClient")
@patch("vector_process_store.SentenceTransformer")
def test_mock_upsert(mock_encoder, mock_qdrant):
    mock_client = mock_qdrant.return_value
    store = CustomVectorStore()

    # 模擬資料與向量
    vectors = [[0.1]*384]
    payloads = [{"text": "測試資料", "doc_id": "abc"}]
    point_id = ["mock-id"]

    # 假設你未來會呼叫 store.client.upsert(collection_name=..., points=...)
    store.client.upsert(collection_name="novels", points=[
        MagicMock(id=point_id[0], vector=vectors[0], payload=payloads[0])
    ])

    mock_client.upsert.assert_called_once()


# 測試 10: 模擬 Qdrant 查詢（search）
@patch("vector_process_store.QdrantClient")
@patch("vector_process_store.SentenceTransformer")
def test_mock_search(mock_encoder, mock_qdrant):
    mock_client = mock_qdrant.return_value
    mock_client.search.return_value = [
        type("Result", (object,), {"id": "123", "score": 0.95})()
    ]

    store = CustomVectorStore()
    result = store.client.search(collection_name="novels", query_vector=[0.1]*384, top=1)

    assert isinstance(result, list)
    assert result[0].id == "123"
    assert result[0].score == 0.95
