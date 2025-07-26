from ...base_templates import BaseTemplate, Language
from .base import ChineseBaseTemplates

class ChineseTaskTemplates:
    """中文任務模板"""
    
    @staticmethod
    def get_summarization_template() -> BaseTemplate:
        return BaseTemplate(
            system_prompt=ChineseBaseTemplates.GENERAL_SYSTEM_PROMPT,
            task_instruction="請為以下文本生成簡潔明瞭的摘要，保留最重要的資訊和核心內容",
            input_format="需要摘要的原始文本內容",
            output_format=ChineseBaseTemplates.COMMON_OUTPUT_FORMAT.replace(
                '"result": "你的處理結果"',
                '"result": "摘要內容"'
            ),
            constraints=f"""{ChineseBaseTemplates.COMMON_CONSTRAINTS}
- 摘要長度不超過 {{max_length}} 字
- 保留關鍵資訊、重要人物和主要情節
- 保持原文的敘事邏輯和時序""",
            examples=f"""
{ChineseBaseTemplates.COMMON_EXAMPLES_INTRO}
輸入：「小明今天去公園散步，意外遇到了多年未見的老朋友小華。他們坐在長椅上聊了很久，回憶起學生時代的點點滴滴，兩人都感到非常開心和懷念。」
輸出：{{"result": "小明在公園遇到老朋友小華，兩人愉快回憶學生時代", "confidence": 0.95}}
""",
            language=Language.CHINESE
        )
    
    @staticmethod
    def get_keyword_extraction_template() -> BaseTemplate:
        return BaseTemplate(
            system_prompt=ChineseBaseTemplates.GENERAL_SYSTEM_PROMPT,
            task_instruction="從文本中提取最重要和具有代表性的關鍵詞",
            input_format="需要提取關鍵詞的原始文本內容",
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
            constraints=f"""{ChineseBaseTemplates.COMMON_CONSTRAINTS}
- 提取 {{top_k}} 個最重要的關鍵詞
- 優先選擇具有代表性的名詞和重要概念
- 按重要性排序關鍵詞
- 避免過於通用的詞彙""",
            examples="",
            language=Language.CHINESE
        )