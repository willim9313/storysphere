"""
測試 prompt templates 系統，特別是 examples 和 reference_info 的條件渲染
"""
from typing import Dict, Any
from src.prompt_templates.manager import PromptManager
from src.prompt_templates.registry import TaskType, Language
from src.prompt_templates.builders import TemplateBuilder
from src.prompt_templates.components import PromptSection, SectionType

def test_conditional_sections():
    """測試條件性段落的渲染"""
    print("=== 測試條件性段落渲染 ===")
    
    # 建立測試模板
    builder = TemplateBuilder()
    template = (builder
                .system_prompt("你是一個helpful的AI助手")
                .task_instruction("請根據以下內容進行處理")
                .reference_info("參考資訊: {reference_info}")
                .examples("範例: {examples}")
                .constraints("請保持簡潔")
                .input_data("輸入: {content}")
                .output_format("請以JSON格式輸出")
                .build("test_template", "zh"))
    
    # 測試案例1: 沒有提供 examples 和 reference_info
    print("\n--- 測試1: 沒有可選內容 ---")
    context1 = {"content": "測試內容"}
    result1 = template.render_full(context1)
    print("Context:", context1)
    print("Result:")
    print(result1)
    print("包含 examples:", "範例:" in result1)
    print("包含 reference_info:", "參考資訊:" in result1)
    
    # 測試案例2: 只提供 examples
    print("\n--- 測試2: 只有 examples ---")
    context2 = {
        "content": "測試內容",
        "examples": "這是範例內容"
    }
    result2 = template.render_full(context2)
    print("Context:", context2)
    print("Result:")
    print(result2)
    print("包含 examples:", "範例:" in result2)
    print("包含 reference_info:", "參考資訊:" in result2)
    
    # 測試案例3: 只提供 reference_info
    print("\n--- 測試3: 只有 reference_info ---")
    context3 = {
        "content": "測試內容", 
        "reference_info": "這是參考資訊"
    }
    result3 = template.render_full(context3)
    print("Context:", context3)
    print("Result:")
    print(result3)
    print("包含 examples:", "範例:" in result3)
    print("包含 reference_info:", "參考資訊:" in result3)
    
    # 測試案例4: 兩者都提供
    print("\n--- 測試4: 兩者都有 ---")
    context4 = {
        "content": "測試內容",
        "examples": "這是範例內容",
        "reference_info": "這是參考資訊"
    }
    result4 = template.render_full(context4)
    print("Context:", context4)
    print("Result:")
    print(result4)
    print("包含 examples:", "範例:" in result4)
    print("包含 reference_info:", "參考資訊:" in result4)

def test_split_rendering():
    """測試分離式渲染中的條件段落"""
    print("\n\n=== 測試分離式渲染 ===")
    
    builder = TemplateBuilder()
    template = (builder
                .system_prompt("你是一個helpful的AI助手")
                .task_instruction("請根據以下內容進行處理")
                .reference_info("參考資訊: {reference_info}")
                .examples("範例: {examples}")
                .constraints("請保持簡潔")
                .input_data("輸入: {content}")
                .output_format("請以JSON格式輸出")
                .build("test_template", "zh"))
    
    context = {
        "content": "測試內容",
        "examples": "這是範例內容",
        "reference_info": "這是參考資訊"
    }
    
    result = template.render_split(context)
    
    print("System Message:")
    print(result["system_message"])
    print("\nUser Message:")
    print(result["user_message"])
    
    print("\nSystem包含 examples:", "範例:" in result["system_message"])
    print("System包含 reference_info:", "參考資訊:" in result["system_message"])

def test_manager_with_overrides():
    """測試透過 PromptManager 進行覆寫"""
    print("\n\n=== 測試 Manager 覆寫功能 ===")
    
    # 這個測試需要實際的 YAML 檔案，先模擬
    try:
        pm = PromptManager()
        
        # 測試覆寫
        context = {
            "content": "測試內容",
            "examples": "原始範例",
            "reference_info": "原始參考資訊"
        }
        
        overrides = {
            "examples": "覆寫後的範例內容",
            "reference_info": "覆寫後的參考資訊"
        }
        
        result = pm.render_prompt(
            task_type=TaskType.SUMMARIZATION,
            language=Language.CHINESE,
            context=context,
            overrides=overrides,
            max_length=100
        )
        
        print("覆寫測試結果:")
        print(result)
        
    except Exception as e:
        print(f"Manager 測試失敗 (可能缺少YAML檔案): {e}")

def debug_section_rendering():
    """詳細調試段落渲染邏輯"""
    print("\n\n=== 調試段落渲染邏輯 ===")
    
    # 手動建立 PromptSection 進行測試
    examples_section = PromptSection(
        section_type=SectionType.EXAMPLES,
        content="範例: {examples}",
        required=False,
        visible_when="examples"
    )
    
    reference_section = PromptSection(
        section_type=SectionType.REFERENCE_INFO,
        content="參考資訊: {reference_info}",
        required=False,
        visible_when="reference_info"
    )
    
    test_contexts = [
        {},
        {"examples": "有範例"},
        {"reference_info": "有參考資訊"}, 
        {"examples": "有範例", "reference_info": "有參考資訊"},
        {"examples": "", "reference_info": ""},  # 空字串測試
        {"examples": None, "reference_info": None},  # None 測試
    ]
    
    for i, context in enumerate(test_contexts):
        print(f"\n--- 測試情境 {i+1}: {context} ---")
        
        # 測試 examples
        should_render_examples = examples_section.should_render(context)
        rendered_examples = examples_section.render(context, "zh")
        print(f"Examples should_render: {should_render_examples}")
        print(f"Examples rendered: {repr(rendered_examples)}")
        
        # 測試 reference_info
        should_render_ref = reference_section.should_render(context)
        rendered_ref = reference_section.render(context, "zh")
        print(f"Reference should_render: {should_render_ref}")
        print(f"Reference rendered: {repr(rendered_ref)}")

if __name__ == "__main__":
    test_conditional_sections()
    test_split_rendering()
    test_manager_with_overrides()
    debug_section_rendering()