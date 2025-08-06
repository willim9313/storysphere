"""
多語言、任務模板管理器模組
提供多語言支持的模板管理功能，支援不同任務類型的模板
當有新的語言或任務類型加入時，只需擴展相應的模板和管理器即可
"""

from typing import Dict, Any, Optional, List
from enum import Enum
from .base_templates import BaseTemplate, Language
from .locales.zh.tasks import ChineseTaskTemplates
from .locales.en.tasks import EnglishTaskTemplates

class TaskType(Enum):
    CHATBOT = "chatbot"
    GENERAL_SUMMARIZATION = "general_summarization"
    KEYWORD_EXTRACTION = "keyword_extraction"
    ENTITY_EXTRACTION = "entity_extraction"
    COMPRESSION = "compression"
    ANALYSIS = "analysis"

class MultilingualTemplateManager:
    """
    多語言模板管理器
    會一次性的設定單一語言、多任務類型的模板
    支援新增語言和任務類型的擴展
    """

    def __init__(self, default_language: Language = Language.ENGLISH):
        self.default_language = default_language
        self._templates: Dict[Language, Dict[TaskType, BaseTemplate]] = {}
        self._load_templates()
    
    def _load_templates(self):
        """
        載入所有語言的模板
        這裡可以擴展更多語言和任務類型的模板
        """
        # 載入中文模板
        self._templates[Language.CHINESE] = {
            TaskType.CHATBOT: ChineseTaskTemplates.get_chatbot_template(),
            TaskType.GENERAL_SUMMARIZATION: ChineseTaskTemplates.get_summarization_template(),
            TaskType.KEYWORD_EXTRACTION: ChineseTaskTemplates.get_keyword_extraction_template(),
            TaskType.ENTITY_EXTRACTION: ChineseTaskTemplates.get_entity_extraction_template(),
        }
        
        # 載入英文模板
        self._templates[Language.ENGLISH] = {
            TaskType.CHATBOT: EnglishTaskTemplates.get_chatbot_template(),
            TaskType.GENERAL_SUMMARIZATION: EnglishTaskTemplates.get_summarization_template(),
            TaskType.KEYWORD_EXTRACTION: EnglishTaskTemplates.get_keyword_extraction_template(),
            TaskType.ENTITY_EXTRACTION: EnglishTaskTemplates.get_entity_extraction_template(),
        }
    
    def get_template(
        self, 
        task_type: TaskType, 
        language: Language = None
    ) -> BaseTemplate:
        """獲取指定任務和語言的模板"""
        lang = language or self.default_language
        return self._templates.get(lang, {}).get(task_type)
    
    def render_prompt(
        self, 
        task_type: TaskType, 
        language: Language = None, 
        **kwargs
    ) -> str:
        """渲染指定任務和語言的完整 prompt"""
        template = self.get_template(task_type, language)
        if not template:
            raise ValueError(f"Template for {task_type} in {language} not found")
        return template.render(**kwargs)
    
    def set_default_language(
        self, 
        language: Language
    ) -> None:
        """設定預設語言"""
        self.default_language = language
    
    def get_available_languages(
        self, 
        task_type: TaskType
    ) -> List[Language]:
        """獲取指定任務支援的語言列表"""
        available = []
        for lang, templates in self._templates.items():
            if task_type in templates:
                available.append(lang)
        return available