# 舊的
"""
負責處理所有跟nlp task相關的功能
像是keyword extraction, summary generation、theme analysis...
預計透過指定好合適的input, output 就可以實踐
"""
# 標準函式庫
import os
import re
import ast
import json
from pprint import pprint

# 第三方套件
import yaml
import pke
from pke.unsupervised import TfIdf, YAKE, MultipartiteRank
from dotenv import load_dotenv

# 型別提示
from typing import Dict, Any

# 專案自訂模組
from src.core.llm.gemini_client import GeminiClient
from src.core.validators.kg_schema_validator import validate_kg_output
from src.core.validators.nlp_utils_validator import validate_summary_output, validate_extracted_keywords
from src.templates.template_builder import TemplateBuilder
from src.templates.template_manager import MultilingualTemplateManager, TaskType
from src.templates.base_templates import Language

load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")
MODEL_NAME = os.getenv("GEMINI_MODEL")

def extract_json_from_text(text: str) -> Dict[str, Any]:
    """
    從包含Python資料結構的文字中提取出最早出現的list或dict物件。
    
    參數:
        text (str): 包含Python物件的文字（可能夾雜雜訊）。
        
    回傳:
        Any: 成功提取的物件 (list 或 dict)，若無法提取則回傳 None。
    """
    # 嘗試找到第一個 {...} 結構
    # match = re.search(r"\{.*?\}", text, re.DOTALL)
    match = re.search(r"(\[.*\]|\{.*\})", text, re.DOTALL)

    if not match:
        return {}
    
    try:
        return ast.literal_eval(match.group(0))
    except (ValueError, SyntaxError):
        return {}

# # 測試用例
# response = """
# Here are the extracted keywords in a structure less than 20 words:

# {
#   "result": ["Napoleon", "Animal Farm", "Spontaneous Demonstration"]
# }
# """
# result = extract_dict_from_text(response)
# print(result)  # {'result': ['Napoleon', 'Animal Farm', 'Spontaneous Demonstration']}


# 自定義關鍵字提取（示例，可替換為你熟悉的 NLP 模型或算法）
def extract_keywords(text):
    # 這裡僅用簡單分詞作為示例，實際應根據具體需求選用更高級的關鍵字提取方案
    words = re.findall(r'\w+', text)
    # 這裡簡單返回最頻繁的 5 個單詞作為關鍵字（實際場景應用中可用 TF-IDF、TextRank 等）
    freq = {}
    for word in words:
        freq[word] = freq.get(word, 0) + 1
    sorted_words = sorted(freq.items(), key=lambda x: x[1], reverse=True)
    keywords = [w for w, count in sorted_words[:5]]
    return keywords

def filter_keys(result: dict, expected_keys: dict) -> dict:
    return {k: v for k, v in result.items() if k in expected_keys}


class KpeTool:
    """
    使用 pke模組 進行關鍵字提取，先用MultipartiteRank頂著
    目前僅支援英文版本
    """
    def __init__(self):
        self.model = MultipartiteRank()
        # TfIdf, YAKE

    def extract_keywords(self, text, language="en", n=10) -> dict:
        """
        使用 pke 模組進行關鍵字提取
        :param text: 需要提取關鍵字的文本
        :param language: 語言，預設為英文
        :param n: 返回的關鍵字數量，預設為10
        :return: 提取的關鍵字字典，格式為 {keyword: score}
        """
        self.model.load_document(input=text, language=language)
        self.model.candidate_selection()
        self.model.candidate_weighting()
        keywords = self.model.get_n_best(n=n)
        keyword_dict = dict(keywords)

        # keywords = [kw[0] for kw in keywords] # retrieve only words, no score
        return keyword_dict
        

class LlmOperator:
    """
    Using the llm to process related nlp task, such as summary, keyword extraction.
    will call llm_interface
    prompt and structure output are defined here
    """
    def __init__(self, client=None):
        '''
        client example: OllamaClient, GeminiClient
        '''
        self.client = client
        self._load_kg_schema()
    
    def _load_kg_schema(self):
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
        '''
        文本摘要用途
        :param text: 需要摘要的文本
        '''
        instruction = """
        **Summarize the following context, precise, only the summary, keep it under 200 words as possible**

        ### Output Format (in JSON):
        {{
         "result": "context"
         }}
        ###
        """
    
        MAX_TRY = 3

        for attempt in range(MAX_TRY):
            resp = self.client.generate_response(prompt=text,
                                                 instruction=instruction)
            resp_json = extract_json_from_text(resp)
            summary, error = validate_summary_output(resp_json)
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
        '''
        文本關鍵字提取用途
        :param text: 需要提取關鍵字的文本
        '''
        instruction = """
        **Extract keyword from the following context precisely, it should be less than 20 words**
        using the following structure:
        ### Output Format (in JSON):
        {
         "result": ["keyword1", "keyword2"]
         }
        ##
        """
        MAX_TRY = 3

        for attempt in range(MAX_TRY):
            resp = self.client.generate_response(prompt=text,
                                                 instruction=instruction)
            resp_json = extract_json_from_text(resp)
            keyword_list, error = validate_extracted_keywords(resp_json)
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

    def extract_kg_elements(self, text:str):
        '''這是用來進行知識圖譜元素的提取'''
        instruction = '''
        You are an expert in extracting structured knowledge from fictional texts.

        ## Schema Definition:
        You are provided with a knowledge graph schema that contains the following components:

        ### Entity Types:
        {entity_types}

        ### Relation Types:
        {relation_types}

        ### Entity Attributes:
        Each extracted entity can optionally include the following attributes:
        {attribute_types}

        ---

        ## Task:
        Given a text passage, extract structured knowledge in the following format.

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
        '''
        MAX_TRY = 7
        
        for attempt in range(MAX_TRY):
            try:
                instruction_filled = instruction.format(
                    entity_types=json.dumps(self.entity_types, indent=2),
                    relation_types=json.dumps(self.relation_types, indent=2),
                    attribute_types=json.dumps(self.attribute_types, indent=2),
                )
                resp = self.client.generate_response(prompt=text, instruction=instruction_filled)
                resp_json = extract_json_from_text(resp)
                result = validate_kg_output(resp_json)
                if result:
                    return result
            except Exception as e:
                print(f"Error during KG extraction attempt {attempt+1}: {e}")
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
        template_manager = MultilingualTemplateManager()
        builder = TemplateBuilder(
            template_manager=template_manager
        )

        input_data = builder.build_split(
            task_type=TaskType.KG_EXTRACTION,
            language=language,
            content=content
        )

        MAX_TRY = 3

        for attempt in range(MAX_TRY):
            resp = self.client.generate_response(prompt=input_data["user_message"],
                                                 instruction=input_data["system_message"])
            resp_json = extract_json_from_text(resp)
            if resp_json:
                return resp_json.get("result", [])

        return None

    def close(self):
        del self.client

def get_kg_elements(text: str) -> dict:
    """
    從給定的實體中，分離出實體、關係和屬性，並返回多個結構化的字典。
    """
    pass
