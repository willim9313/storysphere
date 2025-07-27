"""
中文基礎模板
"""
from ...base_templates import BaseTemplate, Language

class ChineseBaseTemplates:
    """中文基底模板"""
    
    GENERAL_SYSTEM_PROMPT = """你是一個專業的文本分析大師，擅長理解和分析中文文本內容。請仔細閱讀用戶的要求，並提供準確、有用的回應。"""
    #GENERAL_SYSTEM_PROMPT = """你是一個專業的文本處理助手，擅長理解和分析中文文本內容。請仔細閱讀用戶的要求，並提供準確、有用的回應。"""

    COMMON_EXAMPLES_INTRO = "參考範例："

    COMMON_CONSTRAINTS = """
- 保持原文的語義和邏輯結構
- 確保輸出格式正確且完整
- 使用繁體中文進行回應
"""

    COMMON_OUTPUT_FORMAT = """
請以 JSON 格式輸出結果：
{{
    "result": "你的處理結果"
}}
"""
