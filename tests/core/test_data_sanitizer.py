"""Tests for core.utils.data_sanitizer."""

from core.utils.data_sanitizer import DataSanitizer


class TestSanitizeForTemplate:
    def test_dict_to_safe_text(self):
        result = DataSanitizer.sanitize_for_template({"name": "Alice", "age": 30})
        assert "name: Alice" in result
        assert "age: 30" in result

    def test_list_to_safe_text(self):
        result = DataSanitizer.sanitize_for_template(["a", "b", "c"])
        assert "1. a" in result
        assert "3. c" in result

    def test_empty_list(self):
        assert DataSanitizer.sanitize_for_template([]) == "None"

    def test_relation_triple(self):
        data = [{"head": "Alice", "relation": "KNOWS", "tail": "Bob"}]
        result = DataSanitizer.sanitize_for_template(data)
        assert "Alice KNOWS Bob" in result


class TestFormatVectorResults:
    def test_format_results(self):
        results = [
            {
                "id": "chunk-1",
                "score": 0.95,
                "text": "Alice went to the market.",
                "document_id": "doc-1",
                "chapter_number": 3,
                "position": 5,
            }
        ]
        formatted = DataSanitizer.format_vector_store_results(results)
        assert len(formatted) == 1
        assert "Chunk ID: chunk-1" in formatted[0]
        assert "Score: 0.9500" in formatted[0]
        assert "Chapter: 3" in formatted[0]
        assert "Alice went to the market." in formatted[0]

    def test_empty_results(self):
        assert DataSanitizer.format_vector_store_results([]) == []

    def test_format_pydantic_results(self):
        from services.query_models import VectorSearchResult

        results = [
            VectorSearchResult(
                id="chunk-2",
                score=0.81,
                text="Bob met Alice at the door.",
                document_id="doc-1",
                chapter_number=4,
                position=2,
            )
        ]
        formatted = DataSanitizer.format_vector_store_results(results)
        assert len(formatted) == 1
        assert "Chunk ID: chunk-2" in formatted[0]
        assert "Score: 0.8100" in formatted[0]
        assert "Chapter: 4" in formatted[0]
        assert "Bob met Alice at the door." in formatted[0]
