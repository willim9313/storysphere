from .template_manager import MultilingualTemplateManager, TaskType
from .base_templates import Language, BaseTemplate

class TemplateBuilder:
    """
    負責根據任務、語言、用戶自訂參數動態構建 prompt
    """
    def __init__(
        self, 
        template_manager: MultilingualTemplateManager
    ):
        """
        初始化模板管理器
        :param template_manager: 多語言模板管理器實例
        """
        self.template_manager = template_manager

    def build(
        self,
        task_type: TaskType,
        language: Language = None,
        overrides: dict = None,
        **kwargs
    ) -> str:
        """
        根據任務、語言和可選的覆寫內容，組裝最終 prompt
        - task_type: 任務類型(增加設定請至template_manager.py處理)
        - language: 語言
        - overrides: 可選，覆寫模板中的任意欄位（如 task_instruction、constraints 等）
        - kwargs: 傳給模板 render 的參數, 如 content、max_length 等
        :return: 完整的 prompt 字符串
        """
        base_template: BaseTemplate = self.template_manager.get_template(task_type, language)
        if not base_template:
            raise ValueError(f"Template for {task_type} in {language} not found")
        # 動態覆寫欄位
        if overrides:
            for k, v in overrides.items():
                setattr(base_template, k, v)
        return base_template.render(**kwargs)