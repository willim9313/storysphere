from src.prompt_templates.manager import PromptManager
from src.prompt_templates.registry import TaskType, Language

pm = PromptManager()

# 中文摘要
prompt = pm.render_prompt(
    task_type=TaskType.ENTITY_EXTRACTION,
    language=Language.ENGLISH,
    content="很長的文章內容...",
    max_length=200,
    overrides={
        "examples": "這是覆寫後的範例內容",
        "reference_info": "這是覆寫後的參考資訊"
    }
)

print(prompt)