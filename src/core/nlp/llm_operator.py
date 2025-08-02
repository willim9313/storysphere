# core/nlp/llm_operator.py
"""
封裝各類 NLP 任務的 LLM 呼叫介面（摘要、關鍵字、KG）
"""
import json
from typing import Any, Dict
import yaml

from core.utils.output_extractor import extract_json_from_text
from core.validators.kg_schema_validator import validate_kg_output
from core.validators.nlp_utils_validator import validate_summary_output, validate_extracted_keywords


class LlmOperator:
    def __init__(self, client):
        """
        初始化 LLM 操作介面。
        :param client: LLM 客戶端實例，例如 GeminiClient 或 OllamaClient
        """
        self.client = client  # e.g., GeminiClient, OllamaClient
        self._load_schema()

    def _load_schema(self):
        with open("config/schema_kg_story.yaml", "r") as f:
            schema = yaml.safe_load(f)
        self.entity_types = [e["type"] for e in schema["entities"]]
        self.relation_types = [r["type"] for r in schema["relations"]]
        self.attribute_types = [a["name"] for a in schema["attributes"]]

    def summarize(self, text: str) -> str:
        instruction = """
        **Summarize the following context, precisely. 
        Return only the summary, keep it under 200 words.**

        ## Format:
        {"result": "summary text"}
        """
        for _ in range(3):
            resp = self.client.generate_response(
                prompt=text, 
                instruction=instruction
            )
            data = extract_json_from_text(resp)
            summary, err = validate_summary_output(data)
            if summary:
                return summary.result
        return None

    def extract_keyword(self, text: str) -> list:
        instruction = """
        Extract up to 20 keywords from the given text. 
        Format: {"result": ["kw1", "kw2"]}
        """
        for _ in range(3):
            resp = self.client.generate_response(text, instruction)
            data = extract_json_from_text(resp)
            keyword_list, err = validate_extracted_keywords(data)
            if keyword_list:
                return keyword_list.result
        return None

    def extract_kg_elements(self, text: str) -> Any:
        instruction = f"""
        **You are an expert in extracting structured knowledge from fictional texts.**
        
        ## Schema:
        - Entity Types: {json.dumps(self.entity_types, indent=2)}
        - Relation Types: {json.dumps(self.relation_types, indent=2)}
        - Attributes: {json.dumps(self.attribute_types, indent=2)}

        ## Task:
        Extract entities and relations using this schema.
        Return JSON with keys: entities[], relations[]

        ### Output Format (in JSON):
        {{
            "entities": [
                {{
                    "type": "Person",
                    "name": "Harry Potter",
                    "attributes": {{
                        "gender": "Male",
                        "role": "Protagonist",
                        "description": "The boy who lived"
                    }}
                }},
                {{
                    "type": "Object",
                    "name": "Invisibility Cloak"
                }}
            ],
            "relations": [
                {{
                    "head": "Harry Potter",
                    "relation": "possesses",
                    "tail": "Invisibility Cloak"
                }}
            ]
        }}
        ###
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
                print("Entity Types:", self.entity_types)
                print("Relation Types:", self.relation_types)
                print("Attribute Types:", self.attribute_types)
        return None

    def close(self):
        del self.client
