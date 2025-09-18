# src/prompt_templates/registry.py
from typing import Dict
from enum import Enum
from .template import FlexibleTemplate
from .builders import TemplateBuilder
from .prompt_loader import prompt_loader

class TaskType(Enum):
    CHATBOT = "chatbot"
    SUMMARIZATION = "summarization"
    KEYWORD_EXTRACTION = "keyword_extraction"
    ENTITY_EXTRACTION = "entity_extraction"
    CHARACTER_EVIDENCE_PACK = "character_evidence_pack"
    ARCHETYPE_CLASSIFICATION = "archetype_classification"

class Language(Enum):
    ENGLISH = "en"
    CHINESE = "zh"

class TemplateRegistry:
    """自動化模板註冊器 - 直接從 YAML 文件載入"""
    
    def __init__(self):
        self._template_cache: Dict[str, FlexibleTemplate] = {}
    
    def get_template(self, task_type: TaskType, language: Language) -> FlexibleTemplate:
        """自動載入模板 - 不需要手動註冊"""
        task_str = task_type.value if isinstance(task_type, TaskType) else task_type
        lang_str = language.value if isinstance(language, Language) else language
        key = f"{task_str}_{lang_str}"
        
        # 檢查快取
        if key in self._template_cache:
            return self._template_cache[key]
        
        # 嘗試從 YAML 文件載入
        try:
            template = self._load_from_yaml(task_str, lang_str)
            self._template_cache[key] = template
            return template
        except FileNotFoundError:
            raise ValueError(f"Template not found: {key}. Please create prompts/{task_str}_{lang_str}.yaml")
    
    def _load_from_yaml(self, task_type: str, language: str) -> FlexibleTemplate:
        """從 YAML 文件載入模板"""
        data = prompt_loader.load_template_data(task_type, language)
        sections = data.get('sections', {})
        
        # 自動建構模板
        builder = TemplateBuilder()
        
        if sections.get('system_prompt'):
            builder.system_prompt(sections['system_prompt'])
        if sections.get('task_instruction'):
            builder.task_instruction(sections['task_instruction'])
        if sections.get('constraints'):
            builder.constraints(sections['constraints'])
        if sections.get('examples'):
            builder.examples(sections['examples'])
        if sections.get('reference_info'):
            builder.reference_info(sections['reference_info'])
        if sections.get('output_format'):
            builder.output_format(sections['output_format'])
        
        # input_data 是必需的
        input_data = sections.get('input_data', '{content}')
        builder.input_data(input_data)
        
        template_name = data.get('name', f"{task_type}_{language}")
        return builder.build(template_name, language)
    
    def list_available_templates(self) -> Dict[str, list]:
        """列出所有可用的模板"""
        return prompt_loader.list_available_templates()
    
    def clear_cache(self) -> None:
        """清除模板快取"""
        self._template_cache.clear()