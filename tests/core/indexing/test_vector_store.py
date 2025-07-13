import pytest
from unittest.mock import patch, MagicMock
from src.core.indexing.vector_store import VectorStore

@pytest.fixture
def mock_qdrant():
    with patch('src.core.indexing.vector_store.QdrantClient') as mock_client:
        mock_instance = MagicMock()
        mock_client.return_value = mock_instance
        yield mock_instance

@pytest.fixture
def mock_encoder():
    with patch('src.core.indexing.vector_store.SentenceTransformer') as mock_transformer:
        mock_instance = MagicMock()
        mock_instance.encode.return_value = [0.1, 0.2, 0.3]
        mock_instance.get_sentence_embedding_dimension.return_value = 3
        mock_transformer.return_value = mock_instance
        yield mock_instance

@pytest.fixture
def vector_store(mock_qdrant, mock_encoder):
    return VectorStore(collection_name="test_collection")

def test_initialization(vector_store, mock_qdrant):
    assert vector_store.collection_name == "test_collection"
    mock_qdrant.get_collections.assert_called_once()

def test_store_chunk(vector_store, mock_qdrant, mock_encoder):
    # Test storing a single chunk
    vector_store.store_chunk(
        point_id="test1",
        chunk="Test text",
        metadata={"source": "test"}
    )
    
    mock_encoder.encode.assert_called_once_with("Test text")
    mock_qdrant.upsert.assert_called_once()

def test_search(vector_store, mock_qdrant, mock_encoder):
    # Mock search results
    mock_result = MagicMock()
    mock_result.id = "test1"
    mock_result.score = 0.95
    mock_result.payload = {"source": "test"}
    mock_result.vector = None
    mock_qdrant.search.return_value = [mock_result]

    results = vector_store.search("test query", limit=1)
    
    assert len(results) == 1
    assert results[0]["id"] == "test1"
    assert results[0]["score"] == 0.95
    mock_encoder.encode.assert_called_once_with("test query")

def test_update_metadata(vector_store, mock_qdrant):
    vector_store.update_metadata(
        node_id="test1",
        new_metadata={"updated": True},
        merge=True
    )
    
    mock_qdrant.set_payload.assert_called_once()

def test_count(vector_store, mock_qdrant):
    mock_count_result = MagicMock()
    mock_count_result.count = 5
    mock_qdrant.count.return_value = mock_count_result

    count = vector_store.count()
    assert count == 5
    mock_qdrant.count.assert_called_once()

def test_get_by_id(vector_store, mock_qdrant):
    mock_point = MagicMock()
    mock_point.model_dump.return_value = {
        "id": "test1",
        "payload": {"source": "test"}
    }
    mock_qdrant.retrieve.return_value = [mock_point]

    result = vector_store.get_by_id("test1")
    assert result["id"] == "test1"
    mock_qdrant.retrieve.assert_called_once()
