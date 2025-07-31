"""
中文基礎模板
"""
from ...base_templates import BaseTemplate, Language

class ChineseBaseTemplates:
    """中文基底模板"""
    # 系統提示詞
    GENERAL_SYSTEM_PROMPT = (
        "你是一個專業的文本分析大師，"
        "擅長理解和分析中文文本內容。"
        "請仔細閱讀用戶的要求，並提供準確、有用的回應。"
    )

    # 範例說明
    COMMON_EXAMPLES_INTRO = "參考範例："

    # 常見限制條件
    COMMON_CONSTRAINTS = (
        "請確保你的回答符合以下限制條件：\n"
        "- 保持原文的語義和邏輯結構。\n"
        "- 確保輸出格式正確且完整。\n"
        "- 使用繁體中文進行回應。"
    )

    # 輸出格式範本
    COMMON_OUTPUT_FORMAT = """請以 JSON 格式輸出結果：
{{
    "result": "你的處理結果"
}}"""
