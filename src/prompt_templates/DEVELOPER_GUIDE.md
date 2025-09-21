# 開發者指南

## 🚀 快速開始

### 環境設置
```bash
# 下載代碼
git clone <repository>
cd prompt_templates

# 測試系統
python3 example.py
```

## 🏗️ 新增模板完整流程

### 1. 創建YAML模板
```bash
# 基於現有模板創建
cp prompts/summarization_zh.yaml prompts/sentiment_analysis_zh.yaml
```

### 2. 編輯模板內容
```yaml
# prompts/sentiment_analysis_zh.yaml
name: "情感分析模板"
language: "zh"
task_type: "sentiment_analysis"

sections:
  system_prompt: |
    你是一個專業的情感分析助手，擅長識別文本中的情感傾向。
  
  task_instruction: |
    請分析以下文本的情感傾向，包括正面、負面或中性。
  
  constraints: |
    - 提供置信度分數（0-1）
    - 識別關鍵情感詞彙
    - 考慮上下文語境
  
  input_data: |
    {content}
  
  output_format: |
    請以 JSON 格式輸出：
    {
        "sentiment": "positive/negative/neutral",
        "confidence": 0.85,
        "keywords": ["開心", "滿意"],
        "explanation": "情感判斷的依據"
    }
```

### 3. 添加TaskType（如果需要）
```python
# registry.py
class TaskType(Enum):
    # ... 現有類型
    SENTIMENT_ANALYSIS = "sentiment_analysis"  # 新增
```

### 4. 測試新模板
```python
# test_new_template.py
from src.prompt_templates.manager import PromptManager
from src.prompt_templates.registry import TaskType, Language

pm = PromptManager()

# 測試新模板
prompt = pm.render_prompt(
    task_type=TaskType.SENTIMENT_ANALYSIS,
    language=Language.CHINESE,
    content="今天天氣真好，心情很不錯！"
)

print("生成的prompt:")
print(prompt)
```

## 🔧 常用開發任務

### 檢查所有可用模板
```python
from src.prompt_templates.registry import TemplateRegistry

registry = TemplateRegistry()
templates = registry.list_available_templates()

print("📋 可用模板:")
for task_type, languages in templates.items():
    print(f"  🎯 {task_type}")
    for lang in languages:
        print(f"    └── {lang}")
```

### 清除模板快取
```python
# 開發時如果修改了YAML文件，需要清除快取
registry = TemplateRegistry()
registry.clear_cache()
```

### 驗證YAML語法
```python
from src.prompt_templates.prompt_loader import simple_yaml_load

# 測試YAML解析
with open('prompts/your_template.yaml', 'r', encoding='utf-8') as f:
    content = f.read()
    
try:
    data = simple_yaml_load(content)
    print("✅ YAML語法正確")
    print("包含sections:", list(data.get('sections', {}).keys()))
except Exception as e:
    print(f"❌ YAML語法錯誤: {e}")
```

## 🐛 常見錯誤與解決方案

### 錯誤1: FileNotFoundError
```
FileNotFoundError: Template file not found: my_task_zh.yaml
```
**解決**: 檢查文件名格式，必須是 `{task_type}_{language}.yaml`

### 錯誤2: KeyError in render
```  
KeyError: 'max_length'
```
**解決**: 檢查YAML中使用的變數是否在render_prompt中提供

### 錯誤3: 空白的sections
```
Sections: {}
```
**解決**: 檢查YAML縮排，sections下的內容必須有4個空格縮排

## 📝 YAML編寫最佳實踐

### 1. 變數命名規範
- 使用描述性名稱：`{max_length}` ✅ 而非 `{len}` ❌
- 保持一致性：同樣的概念用同樣的變數名
- 避免特殊字符：只使用字母、數字、下劃線

### 2. 內容組織
```yaml
sections:
  system_prompt: |
    簡潔明確的角色定義
  
  task_instruction: |
    具體、可執行的任務描述
  
  constraints: |
    - 明確的限制條件
    - 使用項目符號
    - 包含變數 {max_length}
  
  examples: |
    ## 範例1
    輸入: ...
    輸出: ...
    
    ## 範例2  
    輸入: ...
    輸出: ...
  
  input_data: |
    {content}
    
  output_format: |
    明確的格式要求
    使用JSON Schema更好
```

### 3. 多語言支援
```
prompts/
├── task_zh.yaml    # 中文版
├── task_en.yaml    # 英文版  
└── task_ja.yaml    # 日文版
```

## 🔍 調試技巧

### 1. 逐步調試
```python
# Step 1: 測試YAML載入
from src.prompt_templates.prompt_loader import prompt_loader
data = prompt_loader.load_template_data('task_name', 'zh')
print("1. YAML數據:", data)

# Step 2: 測試模板建構  
from src.prompt_templates.registry import TemplateRegistry
registry = TemplateRegistry()
template = registry.get_template(TaskType.TASK_NAME, Language.CHINESE)
print("2. 模板對象:", template)

# Step 3: 測試變數替換
context = {'content': 'test', 'param': 'value'}
result = template.render_full(context)
print("3. 渲染結果:", result)
```

### 2. 檢查模板結構
```python
# 查看模板的所有sections
for section in template.sections:
    print(f"Section: {section.section_type}")
    print(f"Content: {section.content[:50]}...")
    print(f"Required: {section.required}")
    print("---")
```

### 3. 模板性能分析
```python
import time

# 測試載入時間
start = time.time()
template = registry.get_template(TaskType.SUMMARIZATION, Language.CHINESE)
load_time = time.time() - start

# 測試渲染時間  
start = time.time()
result = template.render_full({'content': 'test content'})
render_time = time.time() - start

print(f"載入時間: {load_time:.4f}秒")
print(f"渲染時間: {render_time:.4f}秒")
```

## 🧪 測試框架

### 單元測試範例
```python
# test_templates.py
import unittest
from src.prompt_templates.manager import PromptManager
from src.prompt_templates.registry import TaskType, Language

class TestTemplates(unittest.TestCase):
    
    def setUp(self):
        self.pm = PromptManager()
    
    def test_summarization_template(self):
        """測試摘要模板"""
        prompt = self.pm.render_prompt(
            task_type=TaskType.SUMMARIZATION,
            language=Language.CHINESE,
            content="測試內容",
            max_length=100
        )
        
        self.assertIn("系統提示", prompt)
        self.assertIn("任務指示", prompt)
        self.assertIn("測試內容", prompt)
        self.assertIn("100", prompt)
    
    def test_template_caching(self):
        """測試模板快取"""
        # 第一次載入
        template1 = self.pm.registry.get_template(
            TaskType.SUMMARIZATION, Language.CHINESE
        )
        
        # 第二次載入（應該來自快取）
        template2 = self.pm.registry.get_template(
            TaskType.SUMMARIZATION, Language.CHINESE
        )
        
        # 應該是同一個物件（快取有效）
        self.assertIs(template1, template2)

if __name__ == '__main__':
    unittest.main()
```

## 📚 進階用法

### 自定義Section類型
如需新增section類型，編輯 `components.py`:

```python
class SectionType(Enum):
    # ... 現有類型
    CUSTOM_SECTION = "custom_section"  # 新增
```

### 條件性Section顯示
在YAML中使用 `visible_when`:

```yaml
sections:
  reference_info: |
    參考資料內容...
    # 只有當 ref_info=True 時才顯示
```

然後在builders.py中設定：
```python
builder.reference_info(content, visible_when="ref_info")
```

使用時：
```python
pm.render_prompt(..., ref_info=True)  # 會顯示reference_info
```
