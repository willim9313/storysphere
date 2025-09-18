# 完全自動化版本使用範例
from src.prompt_templates.manager import PromptManager
from src.prompt_templates.registry import TaskType, Language

# 初始化管理器
pm = PromptManager()

print("🎯 測試自動載入 YAML 模板...")

# 測試中文摘要 - 應該自動載入 summarization_zh.yaml
try:
    prompt = pm.render_prompt(
        task_type=TaskType.SUMMARIZATION,
        language=Language.CHINESE,
        content="三隻小豬的故事...",
        max_length=100
    )
    print("✅ 中文摘要模板載入成功")
    print("生成的 prompt:")
    print(prompt[:200] + "..." if len(prompt) > 200 else prompt)
except Exception as e:
    print(f"❌ 中文摘要模板載入失敗: {e}")

print("\n" + "="*50 + "\n")

# 測試角色證據包 - 應該自動載入 character_evidence_pack_zh.yaml  
try:
    prompt = pm.render_prompt(
        task_type=TaskType.CHARACTER_EVIDENCE_PACK,
        language=Language.CHINESE,
        character_name="小豬大哥",
        content="三隻小豬的故事..."
    )
    print("✅ 角色證據包模板載入成功")
    print("生成的 prompt:")
    print(prompt[:200] + "..." if len(prompt) > 200 else prompt)
    print("\n完整 prompt:")
    print(prompt)
except Exception as e:
    print(f"❌ 角色證據包模板載入失敗: {e}")

print("\n" + "="*50 + "\n")

# 列出所有可用模板
from src.prompt_templates.registry import TemplateRegistry
registry = TemplateRegistry()
available = registry.list_available_templates()
print("📋 可用的模板:")
for task, languages in available.items():
    print(f"  - {task}: {languages}")