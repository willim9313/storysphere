# core/nlp/llm_operator.py
"""
封裝各類 NLP 任務的 LLM 呼叫介面(摘要、關鍵字、KG)
傳統的NLP處理工具請直接使用像是pke之類的tool

"""
import json
from typing import Any, Dict
import time
import yaml

from ..utils.output_extractor import extract_json_from_text
from ..validators.kg_schema_validator import validate_kg_output
from ..validators.nlp_utils_validator import validate_summary_output, validate_extracted_keywords
from src.prompt_templates.manager import PromptManager
from src.prompt_templates.registry import TaskType, Language

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

    def chat(
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
        try:
            pm = PromptManager()
            prompt = pm.render_split_prompt(
                task_type=TaskType.CHATBOT,
                language=language,
                content=content
            )
        except Exception as e:
            raise Exception(f"ERROR, 聊天模板載入失敗: {e}")

        MAX_TRY = 3

        for attempt in range(MAX_TRY):
            resp = self.client.generate_response(prompt=prompt["user_message"],
                                                 instruction=prompt["system_message"])
            resp_json, json_error = extract_json_from_text(resp)
            if resp_json:
                return resp_json.get("result", "")
            if json_error:
                print(f"[LLM] JSON extraction error: {json_error}")

        return None

    def summarize(
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
        try:
            pm = PromptManager()
            prompt = pm.render_split_prompt(
                task_type=TaskType.SUMMARIZATION,
                language=Language.ENGLISH,
                content=content,
                max_length=max_length
            )
        except Exception as e:
            raise Exception(f"ERROR 摘要模板載入失敗: {e}")

        MAX_TRY = 3

        for attempt in range(MAX_TRY):
            try:
                resp = self.client.generate_response(prompt=prompt["user_message"],
                                                     instruction=prompt["system_message"])
                resp_json, json_error = extract_json_from_text(resp)

                if resp_json:
                    result, error_msg = validate_summary_output(resp_json)
                else:
                    print(f"[LLM] JSON extraction error: {json_error}")
                    result = None
                if result:
                    return result.result
            except Exception as e:
                print(f"[LLM] Summary error: {e}")
                print("Content:", content)
                print("Language:", language)
                print("Max Length:", max_length)
                time.sleep(5)
        return None

    def extract_keyword(
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
        try:
            pm = PromptManager()
            prompt = pm.render_split_prompt(
                task_type=TaskType.KEYWORD_EXTRACTION,
                language=language,
                content=content,
                top_k=top_k
            )
        except Exception as e:
            raise(f"❌ 關鍵字提取模板載入失敗: {e}")

        MAX_TRY = 3

        for attempt in range(MAX_TRY):
            try:
                resp = self.client.generate_response(prompt=prompt["user_message"],
                                                    instruction=prompt["system_message"])
                resp_json, json_error = extract_json_from_text(resp)
                result = validate_extracted_keywords(resp_json)
                if result:
                    return result.result
                if json_error:
                    print(f"[LLM] JSON extraction error: {json_error}")
            except Exception as e:
                print(f"[LLM] Keyword extraction error: {e}")
                print("Content:", content)
                print("Language:", language)
                print("Top K:", top_k)
                time.sleep(5)
        return None

    def extract_kg_elements(
        self, 
        content: str,
        language: Language = Language.ENGLISH
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
        try:
            pm = PromptManager()
            prompt = pm.render_split_prompt(
                task_type=TaskType.ENTITY_EXTRACTION,
                language=Language.ENGLISH,
                content=content,
                overrides={
                    "reference_info": ref_schema
                }
            )
        except Exception as e:
            raise(f"❌ 實體提取模板載入失敗: {e}")

        MAX_TRY = 3
        # print("Entity extraction prompt:")
        # print(prompt)
        # print("\n---\n")
        # exit(1)
        for attempt in range(MAX_TRY):
            try:
                resp = self.client.generate_response(prompt=prompt["user_message"],
                                                     instruction=prompt["system_message"])
                resp_json, json_error = extract_json_from_text(resp)
                result = validate_kg_output(resp_json)
                if result:
                    return result
                if json_error:
                    print(f"[LLM] JSON extraction error: {json_error}")
            except Exception as e:
                print(f"[LLM] Entity extraction error: {e}")
                print("Entity Types:", self.entity_types)
                print("Relation Types:", self.relation_types)
                print("Attribute Types:", self.attribute_types)
                time.sleep(5)
        return None
    
    def extract_character_evidence_pack(
        self,
        content: str,
        language: Language = Language.ENGLISH,
        character_name: str = None,
    ) -> dict:
        """
        使用 LLM 提取角色證據包
        :param content: 需要提取的文本, qdrant提取出的文本基礎
        :param language: 語言, 預設為英文
        :param character_name: 角色名稱, 可選
        :return: LLM 的角色證據包提取結果
        """
        ref_info = (
            '[Character Name]'
            f'{character_name}\n'
            '[Content]'
            f'{content}\n'
        )
        try:
            pm = PromptManager()
            prompt = pm.render_split_prompt(
                task_type=TaskType.CHARACTER_EVIDENCE_PACK,
                language=Language.ENGLISH,
                character_name=character_name,
                content=content
            )
        except Exception as e:
            print(f"❌ 角色證據包模板載入失敗: {e}")

        MAX_TRY = 3
        for attempt in range(MAX_TRY):
            try:
                resp = self.client.generate_response(prompt=prompt["user_message"],
                                                     instruction=prompt["system_message"])
                # print(f"[LLM] Character evidence pack response: {resp}")
                resp_json, json_error = extract_json_from_text(resp)
                # print(f"[LLM] Character evidence pack response JSON: {resp_json}")
                # validate the response structure, not yet
                if resp_json:
                    return resp_json
                if json_error:
                    print(f"[LLM] JSON extraction error: {json_error}")
            except Exception as e:
                print(f"[LLM] Character evidence pack extraction error: {e}")
                print("Content:", content)
                print("Language:", language)
                print("Character Name:", character_name)
                time.sleep(5)
        return None
    
    def extract_character_evidence_pack2(
        self, 
        content: str,
        language: Language = Language.ENGLISH,
        character_name: str = None,
    ) -> dict:
        """
        使用 LLM 提取角色證據包
        :param content: 需要提取的文本, qdrant提取出的文本基礎
        :param language: 語言, 預設為英文
        :param character_name: 角色名稱, 可選
        :return: LLM 的角色證據包提取結果
        """
        from src.prompt_templates.manager import PromptManager
        from src.prompt_templates.registry import TaskType, Language
        pm = PromptManager()

        try:
            prompt = pm.render_split_prompt(
                task_type=TaskType.CHARACTER_EVIDENCE_PACK,
                language=Language.ENGLISH,
                character_name=character_name,
                content=content
            )
            print("✅ 角色證據包模板載入成功")
            print("生成的 prompt:")
            print(prompt[:200] + "..." if len(prompt) > 200 else prompt)
            print("\n完整 prompt:")
            print(prompt)
        except Exception as e:
            print(f"❌ 角色證據包模板載入失敗: {e}")

        MAX_TRY = 3
        for attempt in range(MAX_TRY):
            try:
                resp = self.client.generate_response(prompt=prompt["user_message"],
                                                     instruction=prompt["system_message"])
                # print(f"[LLM] Character evidence pack response: {resp}")
                resp_json, json_error = extract_json_from_text(resp)
                # print(f"[LLM] Character evidence pack response JSON: {resp_json}")
                # validate the response structure, not yet
                if resp_json:
                    return resp_json
                if json_error:
                    print(f"[LLM] JSON extraction error: {json_error}")
            except Exception as e:
                print(f"[LLM] Character evidence pack extraction error: {e}")
                print("Content:", content)
                print("Language:", language)
                print("Character Name:", character_name)
                time.sleep(5)
        return None

    def classify_archetype(
        self, 
        content: str,
        ref_info: str,
        language: Language = Language.ENGLISH,
    ) -> dict:
        """
        使用 LLM 針對角色證據進行判斷，並回傳角色原型分類結果
        :param content: 角色證據包
        :param ref_info: 參考資訊，像是角色原型用的資料
        :param language: 語言，預設為英文
        :param character_name: 角色名稱，可選
        :return: LLM 的角色證據包提取結果
        """
        try:
            pm = PromptManager()
            prompt = pm.render_split_prompt(
                task_type=TaskType.ARCHETYPE_CLASSIFICATION,
                language=Language.ENGLISH,
                content=content,
                overrides={
                    "ref_info": ref_info
                }
            )
        except Exception as e:
            print(f"❌ 角色原型分類模板載入失敗: {e}")

        MAX_TRY = 3
        for attempt in range(MAX_TRY):
            try:
                print('input_data 1:', input_data["user_message"])
                print('input_data 2:', input_data["system_message"])

                resp = self.client.generate_response(prompt=prompt["user_message"],
                                                     instruction=prompt["system_message"])
                # print(f"[LLM] Character evidence pack response: {resp}")
                resp_json, json_error = extract_json_from_text(resp)
                # print(f"[LLM] Character evidence pack response JSON: {resp_json}")
                # validate the response structure, not yet
                if resp_json:
                    return resp_json
                if json_error:
                    print(f"[LLM] JSON extraction error: {json_error}")
            except Exception as e:
                print(f"[LLM] Classification error: {e}")
                print("Content:", content)
                print("Language:", language)
        return None

    def close(self):
        del self.client
