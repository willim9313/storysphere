"""
中文任務模板
"""
from ...base_templates import BaseTemplate, Language
from .base import ChineseBaseTemplates

class ChineseTaskTemplates:
    """中文任務模板"""
    @staticmethod
    def get_chatbot_template() -> BaseTemplate:
        return BaseTemplate(
            system_prompt=ChineseBaseTemplates.GENERAL_SYSTEM_PROMPT,
            task_instruction="請回答用戶的問題",
            constraints=ChineseBaseTemplates.COMMON_CONSTRAINTS,
            output_format=ChineseBaseTemplates.COMMON_OUTPUT_FORMAT.replace(
                '"result": "你的處理結果"',
                '"result": "回答內容"'
            ),
            language=Language.CHINESE
        )   
    
    @staticmethod
    def get_summarization_template() -> BaseTemplate:
        return BaseTemplate(
            system_prompt=(
                "你是一個專業的文本處理助手，"
                "擅長理解和分析中文文本內容。"
                "請仔細閱讀用戶的要求，並提供準確、有用的回應。"
            ),
            task_instruction=(
                "請為以下文本生成簡潔明瞭的摘要，保留最重要的資訊和核心內容"
            ),
            constraints=(
                f"""- 摘要長度不超過 {{max_length}} 字\n"""
                "- 保留關鍵資訊、重要人物和主要情節\n"
                "- 保持原文的敘事邏輯和時序\n"
            ),
            output_format=ChineseBaseTemplates.COMMON_OUTPUT_FORMAT.replace(
                '"result": "你的處理結果"',
                '"result": "摘要內容"'
            ),
            language=Language.CHINESE
        )
    
    @staticmethod
    def get_keyword_extraction_template() -> BaseTemplate:
        return BaseTemplate(
            system_prompt=(
                "你是一個專業的文本處理助手，"
                "擅長理解和分析中文文本內容。"
                "請仔細閱讀用戶的要求，並提供準確、有用的回應。"
            ),            
            task_instruction="從文本中提取最重要和具有代表性的關鍵詞",
            constraints=f"""{ChineseBaseTemplates.COMMON_CONSTRAINTS}
- 提取 {{top_k}} 個最重要的關鍵詞
- 優先選擇具有代表性的名詞和重要概念
- 按重要性排序關鍵詞
- 避免過於通用的詞彙""",
            output_format="""
請以 JSON 格式輸出：
{{
    "result": ["關鍵詞1", "關鍵詞2", "關鍵詞3"],
    "confidence": "信心度分數 (0-1)",
    "metadata": {{
        "total_keywords": "提取的關鍵詞總數",
        "categories": {{
            "人物": ["人物關鍵詞"],
            "地點": ["地點關鍵詞"],
            "事件": ["事件關鍵詞"],
            "概念": ["概念關鍵詞"]
        }}
    }}
}}
""",
            language=Language.CHINESE
        )
