# src/prompt_templates/template.py
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from .components import PromptSection, SectionType

@dataclass
class FlexibleTemplate:
    """靈活的模板系統"""
    name: str
    language: str
    sections: List[PromptSection]
    
    def render_full(self, context: Dict[str, Any]) -> str:
        """渲染完整的 prompt"""
        rendered_sections = []
        
        for section in self.sections:
            rendered = section.render(context, self.language)
            if rendered:
                rendered_sections.append(rendered)
        
        return "\n\n".join(rendered_sections)
    
    def render_split(self, context: Dict[str, Any]) -> Dict[str, str]:
        """渲染分離式的 prompt"""
        system_sections = [
            SectionType.SYSTEM_PROMPT,
            SectionType.TASK_INSTRUCTION,
            SectionType.REFERENCE_INFO,
            SectionType.EXAMPLES,
            SectionType.CONSTRAINTS,
            SectionType.OUTPUT_FORMAT
        ]
        
        user_sections = [
            SectionType.INPUT_DATA
        ]
        
        system_content = []
        user_content = []
        
        for section in self.sections:
            rendered = section.render(context, self.language)
            if not rendered:
                continue
                
            if section.section_type in system_sections:
                system_content.append(rendered)
            elif section.section_type in user_sections:
                user_content.append(rendered)
        
        return {
            "system_message": "\n\n".join(system_content),
            "user_message": "\n\n".join(user_content)
        }
    
    def add_section(self, section: PromptSection) -> "FlexibleTemplate":
        """添加新段落"""
        self.sections.append(section)
        return self
    
    def remove_section(self, section_type: SectionType) -> "FlexibleTemplate":
        """移除指定類型的段落"""
        self.sections = [s for s in self.sections if s.section_type != section_type]
        return self
    
    def update_section(self, section_type: SectionType, new_content: str) -> "FlexibleTemplate":
        """更新指定段落的內容"""
        for section in self.sections:
            if section.section_type == section_type:
                section.content = new_content
                break
        return self