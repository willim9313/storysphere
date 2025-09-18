# src/prompt_templates/builders.py
from typing import Dict, Optional
from .template import FlexibleTemplate
from .components import PromptSection, SectionType

class TemplateBuilder:
    """模板建構器"""
    
    def __init__(self):
        self.sections = []
    
    def system_prompt(self, content: str) -> "TemplateBuilder":
        """添加系統提示"""
        self.sections.append(PromptSection(
            section_type=SectionType.SYSTEM_PROMPT,
            content=content,
            required=True
        ))
        return self
    
    def task_instruction(self, content: str) -> "TemplateBuilder":
        """添加任務指示"""
        self.sections.append(PromptSection(
            section_type=SectionType.TASK_INSTRUCTION,
            content=content,
            required=True
        ))
        return self
    
    def reference_info(self, content: str, required: bool = False) -> "TemplateBuilder":
        """添加參考資訊"""
        self.sections.append(PromptSection(
            section_type=SectionType.REFERENCE_INFO,
            content=content,
            required=required,
            visible_when="ref_info"
        ))
        return self
    
    def examples(self, content: str, required: bool = False) -> "TemplateBuilder":
        """添加範例"""
        self.sections.append(PromptSection(
            section_type=SectionType.EXAMPLES,
            content=content,
            required=required,
            visible_when="examples"
        ))
        return self
    
    def constraints(self, content: str) -> "TemplateBuilder":
        """添加限制條件"""
        self.sections.append(PromptSection(
            section_type=SectionType.CONSTRAINTS,
            content=content,
            required=True
        ))
        return self
    
    def input_data(self, content: str = "{content}") -> "TemplateBuilder":
        """添加輸入資料"""
        self.sections.append(PromptSection(
            section_type=SectionType.INPUT_DATA,
            content=content,
            required=True
        ))
        return self
    
    def output_format(self, content: str) -> "TemplateBuilder":
        """添加輸出格式"""
        self.sections.append(PromptSection(
            section_type=SectionType.OUTPUT_FORMAT,
            content=content,
            required=True
        ))
        return self
    
    def build(self, name: str, language: str = "en") -> FlexibleTemplate:
        """建構模板"""
        return FlexibleTemplate(
            name=name,
            language=language,
            sections=self.sections.copy()
        )