# core/nlp/llm_operator.py
"""
封裝各類 NLP 任務的 LLM 呼叫介面（摘要、關鍵字、KG）
"""
import json
from typing import Any, Dict
import yaml

from ..utils.output_extractor import extract_json_from_text
from ..validators.kg_schema_validator import validate_kg_output
from ..validators.nlp_utils_validator import validate_summary_output, validate_extracted_keywords
from ...templates.template_builder import TemplateBuilder
from ...templates.template_manager import MultilingualTemplateManager, TaskType
from ...templates.base_templates import Language

class LlmOperator:
    """
    Using the llm to process related nlp task, such as summary, keyword extraction.
    will call llm_interface
    prompt and structure output are defined here
    """
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

    def nu_chat(
        self, 
        content: str, 
        ref_info: str = None,
        language: Language = Language.ENGLISH
    ) -> str:
        """
        使用 LLM 進行聊天任務
        :param content: 用戶輸入的內容
        :param ref_info: 可選的參考資訊
        :return: LLM 的回應
        """

        template_manager = MultilingualTemplateManager()
        builder = TemplateBuilder(
            template_manager=template_manager
        )
        
        input_data = builder.build_split(
            task_type=TaskType.CHATBOT,
            language=language,
            ref_info=ref_info,
            content=content
        )

        MAX_TRY = 3

        for attempt in range(MAX_TRY):
            resp = self.client.generate_response(prompt=input_data["user_message"],
                                                 instruction=input_data["system_message"])
            resp_json = extract_json_from_text(resp)
            if resp_json:
                return resp_json.get("result", "")

        return None
    
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
    
    def nu_summarize(
        self, 
        content: str, 
        language: Language = Language.ENGLISH,
        max_length: int = 200
    ) -> str:
        """
        使用 LLM 進行文本摘要
        :param content: 需要摘要的文本
        :param language: 語言，預設為英文
        :param max_length: 最大摘要長度，預設為200
        :return: LLM 的摘要結果
        """
        template_manager = MultilingualTemplateManager()
        builder = TemplateBuilder(
            template_manager=template_manager
        )
        
        input_data = builder.build_split(
            task_type=TaskType.GENERAL_SUMMARIZATION,
            language=language,
            content=content,
            max_length=max_length
        )

        MAX_TRY = 3

        for attempt in range(MAX_TRY):
            resp = self.client.generate_response(prompt=input_data["user_message"],
                                                 instruction=input_data["system_message"])
            resp_json = extract_json_from_text(resp)
            if resp_json:
                return resp_json.get("result", "")

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

    def nu_extract_keyword(
        self, 
        content: str,
        language: Language = Language.ENGLISH,
        top_k: int = 10
    ) -> list:
        '''
        使用 LLM 進行關鍵字提取
        :param content: 需要提取關鍵字的文本
        :param language: 語言，預設為英文
        :return: LLM 的關鍵字提取結果
        '''
        template_manager = MultilingualTemplateManager()
        builder = TemplateBuilder(
            template_manager=template_manager
        )

        input_data = builder.build_split(
            task_type=TaskType.KEYWORD_EXTRACTION,
            language=language,
            content=content,
            top_k=top_k
        )

        MAX_TRY = 3

        for attempt in range(MAX_TRY):
            resp = self.client.generate_response(prompt=input_data["user_message"],
                                                 instruction=input_data["system_message"])
            resp_json = extract_json_from_text(resp)
            if resp_json:
                return resp_json.get("result", [])

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

    def nu_extract_kg_elements(
        self, 
        content: str,
        language: Language = Language.ENGLISH
        # 這邊還沒有把底層做好
    ) -> dict:
        '''
        使用 LLM 進行知識圖譜元素提取
        :param content: 需要提取的文本
        :param language: 語言，預設為英文
        :return: LLM 的知識圖譜元素提取結果
        '''
        ref_schema = (
            f"## Schema:"
            "- Entity Types:"
            f"{json.dumps(self.entity_types, indent=2)}"
            "- Relation Types:"
            f"{json.dumps(self.relation_types, indent=2)}"
            "- Attributes:"
            f"{json.dumps(self.attribute_types, indent=2)}"
        )

        template_manager = MultilingualTemplateManager()
        builder = TemplateBuilder(
            template_manager=template_manager
        )

        input_data = builder.build_split(
            task_type=TaskType.ENTITY_EXTRACTION,
            language=language,
            content=content,
            overrides={
                "ref_info": ref_schema
            }
        )

        MAX_TRY = 3

        for attempt in range(MAX_TRY):
            try:
                resp = self.client.generate_response(prompt=input_data["user_message"],
                                                     instruction=input_data["system_message"])
                resp_json = extract_json_from_text(resp)
                result = validate_kg_output(resp_json)
                if result:
                    return result
            except Exception as e:
                print(f"[LLM] Entity extraction error: {e}")
                print("Entity Types:", self.entity_types)
                print("Relation Types:", self.relation_types)
                print("Attribute Types:", self.attribute_types)
        return None
    
    def close(self):
        del self.client
