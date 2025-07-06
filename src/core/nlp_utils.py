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
#   "respond": ["Napoleon", "Animal Farm", "Spontaneous Demonstration"]
# }
# """
# result = extract_dict_from_text(response)
# print(result)  # {'respond': ['Napoleon', 'Animal Farm', 'Spontaneous Demonstration']}


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

    def summarize(self, text: str) -> str:
        '''
        文本摘要用途
        :param text: 需要摘要的文本
        '''
        instruction = """
        **Summarize the following context, precise, only the summary, keep it under 200 words as possible**

        ### Output Format (in JSON):
        {{
         "respond": "context"
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
                return summary.respond
        
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
         "respond": ["keyword1", "keyword2"]
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
                return keyword_list.respond
        
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
    
    def close(self):
        del self.client

def get_kg_elements(text: str) -> dict:
    """
    從給定的實體中，分離出實體、關係和屬性，並返回多個結構化的字典。
    """
    pass

if __name__ == "__main__":
    text = """
    But if there were hardships to be borne, they were partly
    offset by the fact that life nowadays had a greater dignity
    than it had had before. There were more songs, more
    speeches, more processions. Napoleon had commanded that
    once a week there should be held something called a
    Spontaneous Demonstration, the object of which was to
    celebrate the struggles and triumphs of Animal Farm. At the
    appointed time the animals would leave their work and
    march round the precincts of the farm in military formation,
    with the pigs leading, then the horses, then the cows, then the
    sheep, and then the poultry. The dogs flanked the procession
    and at the head of all marched Napoleon's black cockerel.
    Boxer and Clover always carried between them a green
    banner marked with the hoof and the horn and the caption,
    "Long live Comrade Napoleon!" Afterwards there were
    recitations of poems composed in Napoleon's honour, and a
    speech by Squealer giving particulars of the latest increases
    in the production of foodstuffs, and on occasion a shot was
    fired from the gun. The sheep were the greatest devotees of
    the Spontaneous Demonstration, and if anyone complained
    (as a few animals sometimes did, when no pigs or dogs were
    near) that they wasted time and meant a lot of standing about
    in the cold, the sheep were sure to silence him with a
    tremendous bleating of "Four legs good, two legs bad!" But
    by and large the animals enjoyed these celebrations. They
    found it comforting to be reminded that, after all, they were
    truly their own masters and that the work they did was for
    their own benefit. So that, what with the songs, the
    processions, Squealer's lists of figures, the thunder of the
    gun, the crowing of the cockerel, and the fluttering of the
    flag, they were able to forget that their bellies were empty, at
    least part of the time.
    """
    from pprint import pprint
    
    # print(f'kpe_tool test')
    # tool = KpeTool()
    # print(tool.extract_keywords(text, n=10))
    
    
    
    print('\n')
    # print(t.extract_keyword(text))
    client = LlmOperator(GeminiClient(API_KEY, MODEL_NAME))
    # print('client.entity_types')
    # print(client.entity_types)
    # print('client.relation_types')
    # print(client.relation_types)
    # print('client.attribute_types')
    # print(client.attribute_types)
    # resp = client.extract_kg_elements(text)
    # pprint(resp.entities)
    # print(type(resp))


    resp = client.summarize(text)
    print(f'summarize: \n{resp}\n')

    # resp = client.extract_keyword(text)
    # print(f'extract_keyword: \n{resp}\n')

    resp = client.extract_kg_elements(text)
    print(f'extract_kg_elements: \n{resp}\n')

    client.close()