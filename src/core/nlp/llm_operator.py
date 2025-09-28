# core/nlp/llm_operator.py
"""
封裝各類 NLP 任務的 LLM 呼叫介面(摘要、關鍵字、KG)
傳統的NLP處理工具請直接使用像是pke之類的tool
目前prompt部分都用split_render的方式寫死, 後續可以針對合併再一起的處理
"""
import json
from typing import Optional, Any, Dict
import time
import yaml

from ..utils.output_extractor import extract_json_from_text
from ..validators.kg_schema_validator import validate_kg_output
from ..validators.nlp_utils_validator import (
    validate_summary_output,
    validate_extracted_keywords
)
from src.prompt_templates.manager import PromptManager
from src.prompt_templates.registry import TaskType, Language


class LLMOperationError(Exception):
    """LLM 操作基礎異常"""
    def __init__(self, operation: str, message: str):
        self.operation = operation
        super().__init__(f"[{operation}] {message}")


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

    def _prepare_base_params(
        self, 
        content: str, 
        language: Language, 
        **kwargs
    ) -> Dict[str, Any]:
        """準備基礎參數, 目前還沒有使用(for future use)"""
        return {
            'content': content,
            'language': language,
            **kwargs
        }
    
    def _load_schema(self):
        with open("config/schema_kg_story.yaml", "r") as f:
            schema = yaml.safe_load(f)
        self.entity_types = [e["type"] for e in schema["entities"]]
        self.relation_types = [r["type"] for r in schema["relations"]]
        self.attribute_types = [a["name"] for a in schema["attributes"]]

    def _execute_with_retry(
        self,
        operation_name: str,
        prompt: dict,
        validator_func=None,
        max_retry: int = 3
    ) -> Any:
        """統一的重試執行邏輯"""
        for attempt in range(max_retry):
            try:
                resp = self.client.generate_response(
                    prompt=prompt["user_message"],
                    instruction=prompt["system_message"]
                )
                resp_json, json_error = extract_json_from_text(resp)

                if not resp_json:
                    raise Exception(f"JSON extraction error: {json_error}")

                if validator_func:
                    result, error_msg = validator_func(resp_json)
                    if not result:
                        raise Exception(f"Validation error: {error_msg}")
                    return result.result if hasattr(result, 'result') else result

                return resp_json

            except Exception as e:
                print(f"[LLM] {operation_name} error: attempt {attempt + 1}, {e}")
                if attempt < max_retry - 1:
                    time.sleep(2)
                else:
                    return None
        return None

    def chat(
        self,
        content: str,
        ref_info: Optional[str] = None,
        language: Language = Language.ENGLISH
    ) -> Optional[str]:
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
                content=content,
                overrides={
                    "reference_info": ref_info or ""
                }
            )
        except LLMOperationError as e:
            raise LLMOperationError(
                operation="Chat",
                message=f"Prompt template error: {e}"
            )

        return self._execute_with_retry(
            operation_name="Chat",
            prompt=prompt,
            max_retry=3
        )

    def summarize(
        self,
        content: str,
        language: Language = Language.ENGLISH,
        max_length: int = 200
    ) -> Optional[str]:
        """
        使用 LLM 進行文本摘要
        :param content: 需要摘要的文本
        :param language: 語言, 預設為英文
        :param max_length: 最大摘要長度, 預設為200
        :return: LLM 的摘要結果
        """
        try:
            pm = PromptManager()
            prompt = pm.render_split_prompt(
                task_type=TaskType.SUMMARIZATION,
                language=language,
                content=content,
                max_length=max_length
            )
        except LLMOperationError as e:
            raise LLMOperationError(
                operation="Summarization",
                message=f"Prompt template error: {e}"
            )

        return self._execute_with_retry(
            operation_name="Summarization",
            prompt=prompt,
            validator_func=validate_summary_output,
            max_retry=3
        )

    def extract_keyword(
        self,
        content: str,
        language: Language = Language.ENGLISH,
        top_k: int = 10
    ) -> Optional[list]:
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
        except LLMOperationError as e:
            raise LLMOperationError(
                operation="Keyword Extraction",
                message=f"Prompt template error: {e}"
            )

        return self._execute_with_retry(
            operation_name="Keyword Extraction",
            prompt=prompt,
            validator_func=validate_extracted_keywords,
            max_retry=3
        )

    def extract_kg_elements(
        self,
        content: str,
        language: Language = Language.ENGLISH
    ) -> Optional[dict]:
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
                language=language,
                content=content,
                overrides={
                    "reference_info": ref_schema
                }
            )

        except LLMOperationError as e:
            raise LLMOperationError(
                operation="Entity Extraction",
                message=f"Prompt template error: {e}"
            )

        return self._execute_with_retry(
            operation_name="Entity Extraction",
            prompt=prompt,
            validator_func=validate_kg_output,
            max_retry=3
        )

    def extract_character_evidence_pack(
        self,
        content: str,
        language: Language = Language.ENGLISH,
        character_name: Optional[str] = None,
    ) -> Optional[dict]:
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
                language=language,
                character_name=character_name,
                content=content,
                overrides={
                    "reference_info": ref_info
                }
            )
        except LLMOperationError as e:
            raise LLMOperationError(
                operation="Character Evidence Pack",
                message=f"Prompt template error: {e}"
            )

        return self._execute_with_retry(
            operation_name="Character Evidence Pack",
            prompt=prompt,
            max_retry=3
        )

    def classify_archetype(
        self,
        content: str,
        ref_info: str,
        language: Language = Language.ENGLISH,
    ) -> Optional[dict]:
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
                language=language,
                content=content,
                overrides={
                    "ref_info": ref_info
                }
            )
        except LLMOperationError as e:
            raise LLMOperationError(
                operation="Archetype Classification",
                message=f"Prompt template error: {e}"
            )

        return self._execute_with_retry(
            operation_name="Archetype Classification",
            prompt=prompt,
            max_retry=3
        )

    def close(self):
        del self.client
