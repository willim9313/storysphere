# src/prompt_templates/manager.py
from typing import Dict, Optional, Any
from .registry import TemplateRegistry, TaskType, Language
from .components import SectionType

class PromptManager:
    """統一的 Prompt 管理器"""
    
    def __init__(self):
        self.registry = TemplateRegistry()
    
    def render_prompt(self, 
                     task_type: TaskType, 
                     language: Language = Language.ENGLISH,
                     context: Optional[Dict[str, Any]] = None,
                     overrides: Optional[Dict[str, str]] = None,
                     **kwargs) -> str:
        """渲染完整 prompt"""
        template = self.registry.get_template(task_type, language)
        
        # 應用覆寫
        if overrides:
            for section_name, new_content in overrides.items():
                section_type = getattr(SectionType, section_name.upper(), None)
                if section_type:
                    template.update_section(section_type, new_content)
        
        # 合併上下文
        final_context = context or {}
        final_context.update(kwargs)
        
        return template.render_full(final_context)
    
    def render_split_prompt(self,
                           task_type: TaskType,
                           language: Language = Language.ENGLISH,
                           context: Optional[Dict[str, Any]] = None,
                           overrides: Optional[Dict[str, str]] = None,
                           **kwargs) -> Dict[str, str]:
        """渲染分離式 prompt"""
        template = self.registry.get_template(task_type, language)
        
        # 應用覆寫
        if overrides:
            for section_name, new_content in overrides.items():
                print(f"Overriding section: {section_name}")
                print(f"New content: {new_content}")
                section_type = getattr(SectionType, section_name.upper(), None)
                if section_type:
                    template.update_section(section_type, new_content)
        
        # 合併上下文
        final_context = context or {}
        final_context.update(kwargs)
        
        return template.render_split(final_context)