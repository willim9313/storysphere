# core/nlp/llm_operator.py
"""
封裝各類 NLP 任務的 LLM 呼叫介面（摘要、關鍵字、KG）
"""
import json
from typing import Any, Dict

from core.utils.output_extractor import extract_json_from_text
from core.validators.kg_schema_validator import validate_kg_output
from core.validators.nlp_utils_validator import validate_summary_output, validate_extracted_keywords


class LlmOperator:
    def __init__(self, client):
        self.client = client  # e.g., GeminiClient, OllamaClient
        self._load_schema()

    def _load_schema(self):
        with open("config/schema_kg_story.yaml", "r") as f:
            schema = json.load(f)
        self.entity_types = [e["type"] for e in schema["entities"]]
        self.relation_types = [r["type"] for r in schema["relations"]]
        self.attribute_types = [a["name"] for a in schema["attributes"]]

    def summarize(self, text: str) -> str:
        instruction = """
        Summarize the following context, precisely. 
        Return only the summary, keep it under 200 words.
        Format:
        {"respond": "summary text"}
        """
        for _ in range(3):
            resp = self.client.generate_response(text, instruction)
            data = extract_json_from_text(resp)
            summary, err = validate_summary_output(data)
            if summary:
                return summary.respond
        return None

    def extract_keyword(self, text: str) -> list:
        instruction = """
        Extract up to 20 keywords from the given text. 
        Format: {"respond": ["kw1", "kw2"]}
        """
        for _ in range(3):
            resp = self.client.generate_response(text, instruction)
            data = extract_json_from_text(resp)
            keyword_list, err = validate_extracted_keywords(data)
            if keyword_list:
                return keyword_list.respond
        return []

    def extract_kg_elements(self, text: str) -> Any:
        instruction = f"""
        You are an expert in extracting structured knowledge from fictional texts.
        Schema:
        - Entity Types: {json.dumps(self.entity_types)}
        - Relation Types: {json.dumps(self.relation_types)}
        - Attributes: {json.dumps(self.attribute_types)}

        Task:
        Extract entities and relations using this schema.
        Return JSON with keys: entities[], relations[]
        """
        for _ in range(5):
            try:
                resp = self.client.generate_response(text, instruction)
                data = extract_json_from_text(resp)
                result = validate_kg_output(data)
                if result:
                    return result
            except Exception as e:
                print(f"[LLM] KG extraction error: {e}")
        return None

    def close(self):
        del self.client
