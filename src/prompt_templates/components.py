# src/prompt_templates/components.py
from typing import Dict, Optional, Any
from dataclasses import dataclass
from enum import Enum


class SectionType(Enum):
    """定義yaml中各種段落類型"""
    SYSTEM_PROMPT = "system_prompt"
    TASK_INSTRUCTION = "task_instruction"
    REFERENCE_INFO = "reference_info"
    EXAMPLES = "examples"
    CONSTRAINTS = "constraints"
    INPUT_DATA = "input_data"
    OUTPUT_FORMAT = "output_format"


@dataclass
class PromptSection:
    """單個 prompt 段落組件"""
    section_type: SectionType
    content: str
    header: Optional[str] = None
    required: bool = True
    visible_when: Optional[str] = None  # 條件顯示，如 "reference_info"

    def render(self, context: Dict[str, Any], language: str = "en") -> str:
        """渲染單個段落"""
        if not self.should_render(context):
            return ""

        # 獲取標題
        header = self.get_header(language) if self.header is None else self.header

        # 渲染內容
        try:
            content = self.content.format(**context)
        except KeyError as e:
            if self.required:
                raise ValueError(f"Missing required context key: {e}")
            return ""

        if not content.strip():
            return ""

        return f"{header}:\n{content}" if header else content

    def should_render(self, context: Dict[str, Any]) -> bool:
        """判斷是否應該渲染此段落"""
        # 如果有 visible_when 條件，優先檢查
        if self.visible_when:
            return bool(context.get(self.visible_when))

        # 如果是必需的段落，總是渲染
        if self.required:
            return True

        # 如果是可選段落，檢查是否有內容
        return bool(context.get(self.section_type.value))

    def get_header(self, language: str) -> str:
        """獲取段落標題"""
        headers = {
            "en": {
                SectionType.SYSTEM_PROMPT: "# System Prompt",
                SectionType.TASK_INSTRUCTION: "# Task Instructions",
                SectionType.REFERENCE_INFO: "# Reference Information",
                SectionType.EXAMPLES: "# Examples",
                SectionType.CONSTRAINTS: "# Constraints",
                SectionType.INPUT_DATA: "# Input Data",
                SectionType.OUTPUT_FORMAT: "# Output Format",
            },
            "zh": {
                SectionType.SYSTEM_PROMPT: "# 系統提示",
                SectionType.TASK_INSTRUCTION: "# 任務指示",
                SectionType.REFERENCE_INFO: "# 參考資訊",
                SectionType.EXAMPLES: "# 範例",
                SectionType.CONSTRAINTS: "# 限制條件",
                SectionType.INPUT_DATA: "# 輸入資料",
                SectionType.OUTPUT_FORMAT: "# 輸出格式",
            }
        }
        return headers.get(language, headers["en"]).get(self.section_type, "")
