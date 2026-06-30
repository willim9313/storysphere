"""Data sanitizer — template-safe formatting for LLM prompts.

Provides:
- ``DataSanitizer.sanitize_for_template(data)`` — convert any data to template-safe text.
- ``DataSanitizer.format_vector_store_results(results)`` — format VectorService results for prompts.
"""

from __future__ import annotations

from typing import Any


class DataSanitizer:
    """Convert data to template-safe text, neutralising prompt-injection vectors."""

    @staticmethod
    def sanitize_for_template(data: Any) -> str:
        if isinstance(data, dict):
            return DataSanitizer._dict_to_safe_text(data)
        if isinstance(data, list):
            return DataSanitizer._list_to_safe_text(data)
        return DataSanitizer._escape_template_chars(str(data))

    @staticmethod
    def _dict_to_safe_text(data: dict) -> str:
        lines = []
        for key, value in data.items():
            safe_value = DataSanitizer.sanitize_for_template(value)
            lines.append(f"{key}: {safe_value}")
        return "\n".join(lines)

    @staticmethod
    def _list_to_safe_text(data: list) -> str:
        if not data:
            return "None"
        lines = []
        for i, item in enumerate(data, 1):
            if isinstance(item, dict):
                # Special handling for relation triples
                if all(k in item for k in ("head", "relation", "tail")):
                    safe_text = f"{item['head']} {item['relation']} {item['tail']}"
                else:
                    safe_text = DataSanitizer._dict_to_safe_text(item)
                lines.append(f"  {i}. {safe_text}")
            else:
                safe_text = DataSanitizer.sanitize_for_template(item)
                lines.append(f"  {i}. {safe_text}")
        return "\n".join(lines)

    @staticmethod
    def _escape_template_chars(text: str) -> str:
        text = text.replace("'", '"')
        return text

    @staticmethod
    def format_vector_store_results(results) -> list[str]:
        """Format VectorService search results for inclusion in LLM prompts.

        Accepts ``VectorSearchResult`` Pydantic models (the production type
        returned by ``VectorService.search``) or dicts with the same keys:
        id, score, text, document_id, chapter_number, position.
        """
        def _get(r, key, default=None):
            if isinstance(r, dict):
                return r.get(key, default)
            return getattr(r, key, default)

        formatted = []
        for r in results:
            parts = []
            chunk_id = _get(r, "id", "N/A")
            parts.append(f"Chunk ID: {chunk_id}")

            score = _get(r, "score")
            if score is not None:
                parts.append(f"Score: {score:.4f}")

            chapter = _get(r, "chapter_number")
            if chapter is not None:
                parts.append(f"Chapter: {chapter}")

            content = _get(r, "text", "") or ""
            safe_content = DataSanitizer._escape_template_chars(content)
            parts.append(f"Content: {safe_content}")

            formatted.append("\n".join(parts) + "\n---")
        return formatted
