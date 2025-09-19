# 🚀 完全自動化 Prompt Template 系統

## 設計理念

這是一個**完全自動化**的 prompt 模板系統，解決了：
1. **長 prompt 內容影響代碼可讀性**
2. **需要手動註冊每個模板**
3. **擴展新任務需要寫額外的建構函數**

## ✨ 核心特色

### 🎯 **零代碼註冊** - 放檔案就能用！

```
prompts/
├── summarization_zh.yaml           ✅ 放檔案
├── character_evidence_pack_zh.yaml ✅ 放檔案  
└── entity_extraction_zh.yaml       ✅ 放檔案
```

**不需要在 registry.py 中寫任何註冊代碼！**

## 📐 系統架構與模組依賴

### 🏗️ 模組依賴關係圖

```
使用者 API (manager.py)
    ↓
模板註冊器 (registry.py)
    ↓                    ↓
YAML載入器              模板建構器
(prompt_loader.py)  →   (builders.py)
    ↓                    ↓
YAML文件              模板實例
(prompts/*.yaml)      (template.py)
                         ↓
                    組件定義
                  (components.py)
```

### 📁 檔案結構與職責

```
src/prompt_templates/
├── manager.py          # 使用者入口 - 統一API介面
├── registry.py         # 模板管理 - 自動載入與快取
├── builders.py         # 模板建構 - 流暢API建構模板
├── template.py         # 模板實例 - 渲染邏輯
├── components.py       # 基礎組件 - 段落類型與渲染
├── prompt_loader.py    # 檔案載入 - YAML解析
└── prompts/            # 模板內容 - YAML檔案
    ├── summarization_zh.yaml
    ├── character_evidence_pack_zh.yaml
    └── entity_extraction_zh.yaml
```

### 🔄 執行流程

```
1. 用戶調用 → manager.render_prompt()
2. 管理器 → registry.get_template() 
3. 註冊器 → prompt_loader.load_template_data() 
4. 載入器 → 解析 YAML 文件
5. 註冊器 → builders.TemplateBuilder() 建構模板
6. 建構器 → template.FlexibleTemplate() 創建實例
7. 模板   → components.PromptSection() 渲染各段落
8. 返回   → 完整的 prompt 字串
```

## 🐛 Debug 指南

### 常見問題排查

#### 1. 🚨 模板載入失敗
```
ValueError: Template not found: summarization_zh
```

**排查步驟：**
```bash
# 檢查文件是否存在
ls prompts/summarization_zh.yaml

# 測試YAML解析
python3 -c "
from src.prompt_templates.prompt_loader import prompt_loader
data = prompt_loader.load_template_data('summarization', 'zh')
print(data)
"
```

#### 2. 🚨 YAML解析錯誤
```
KeyError: 'sections'
```

**排查步驟：**
```bash
# 檢查YAML格式
cat prompts/summarization_zh.yaml

# 驗證sections結構
python3 -c "
from src.prompt_templates.prompt_loader import simple_yaml_load
with open('prompts/summarization_zh.yaml') as f:
    data = simple_yaml_load(f.read())
print('Sections:', list(data.get('sections', {}).keys()))
"
```

#### 3. 🚨 變數替換失敗
```
KeyError: 'max_length'
```

**排查步驟：**
```python
# 檢查傳入的參數
pm.render_prompt(
    task_type=TaskType.SUMMARIZATION,
    language=Language.CHINESE,
    content="...",
    max_length=100  # ← 確保參數名正確
)
```

### 🔧 開發工具

#### 快速測試模板
```python
# test_template.py
from src.prompt_templates.prompt_loader import prompt_loader
from src.prompt_templates.registry import TemplateRegistry

# 1. 測試YAML載入
data = prompt_loader.load_template_data('task_name', 'zh')
print("載入的數據:", data)

# 2. 測試模板建構
registry = TemplateRegistry()
template = registry.get_template(TaskType.TASK_NAME, Language.CHINESE)
print("模板物件:", template)

# 3. 測試渲染
result = template.render_full({'content': 'test', 'param': 'value'})
print("渲染結果:", result)
```

#### 列出所有可用模板
```python
from src.prompt_templates.registry import TemplateRegistry
registry = TemplateRegistry()
templates = registry.list_available_templates()
for task, langs in templates.items():
    print(f"📝 {task}: {langs}")
```

## 📝 YAML 文件格式規範

### 完整範例
```yaml
# 任務描述註解
name: "模板顯示名稱"
language: "zh"
task_type: "task_name"

sections:
  system_prompt: |
    系統角色定義...
  
  task_instruction: |
    具體任務指示...
  
  constraints: |
    - 限制條件1 {variable_name}
    - 限制條件2
  
  examples: |
    範例內容（可選）...
  
  reference_info: |
    參考資訊（可選）...
  
  input_data: |
    {content}
    額外參數：{param_name}
  
  output_format: |
    輸出格式要求...
```

### 支援的Section類型
- `system_prompt` ✅ 系統提示（必需）
- `task_instruction` ✅ 任務指示（必需）
- `constraints` ✅ 限制條件（建議）
- `examples` 📖 範例（可選）
- `reference_info` 📖 參考資訊（可選）
- `input_data` ✅ 輸入資料（必需）
- `output_format` ✅ 輸出格式（建議）

## 🔄 使用方式

```python
from prompt_templates.manager import PromptManager
from prompt_templates.registry import TaskType, Language

pm = PromptManager()

# 基本使用
prompt = pm.render_prompt(
    task_type=TaskType.SUMMARIZATION,  # 會自動載入 summarization_zh.yaml
    language=Language.CHINESE,
    content="文本內容...",
    max_length=100
)

# 分離式渲染（適合ChatGPT API）
prompts = pm.render_split_prompt(
    task_type=TaskType.SUMMARIZATION,
    language=Language.CHINESE,
    content="文本內容...",
    max_length=100
)
system_msg = prompts["system_message"] 
user_msg = prompts["user_message"]
```

## 🚀 新增任務超級簡單

### 步驟1：創建YAML檔案
```bash
# 複製現有模板
cp prompts/summarization_zh.yaml prompts/my_new_task_zh.yaml

# 編輯內容
vim prompts/my_new_task_zh.yaml
```

### 步驟2：修改TaskType枚舉（可選）
如果是全新任務類型，需要在 `registry.py` 中添加：
```python
class TaskType(Enum):
    # ... 現有的任務類型
    MY_NEW_TASK = "my_new_task"  # 新增這一行
```

### 步驟3：直接使用！
```python
pm.render_prompt(
    task_type=TaskType.MY_NEW_TASK,  # 系統會自動載入 my_new_task_zh.yaml
    language=Language.CHINESE,
    # ... 其他參數
)
```

**就是這麼簡單！完全不需要寫建構函數或註冊代碼！**

## ⚡ 效能優化

### 模板快取機制
- ✅ 首次載入後自動快取到記憶體
- ✅ 相同模板後續調用直接返回快取
- 🔧 開發時可用 `registry.clear_cache()` 清除快取

### 最佳實踐
1. **變數命名**: 使用描述性變數名 `{max_length}` 而非 `{len}`
2. **檔案命名**: 遵循 `{task_type}_{language}.yaml` 格式
3. **內容組織**: 將相關限制條件群組化
4. **錯誤處理**: 為必需變數提供預設值或錯誤訊息

## 🔗 模組詳細說明

### 📋 registry.py - 自動化註冊器
**職責**: 模板發現、載入、快取管理
```python
class TemplateRegistry:
    def get_template(task_type, language):
        # 1. 檢查快取
        # 2. 載入YAML → 建構模板
        # 3. 儲存快取 → 返回
```

### 📂 prompt_loader.py - YAML解析器  
**職責**: 文件讀取、YAML解析、格式驗證
```python
def simple_yaml_load(content):
    # 自實現YAML解析器
    # 支援多行字串 (|)
    # 處理sections嵌套結構
```

### 🔧 builders.py - 模板建構器
**職責**: 流暢API、模板組裝
```python
TemplateBuilder()
    .system_prompt("...")
    .task_instruction("...")
    .build(name, language)
```

### 📄 template.py - 模板實例
**職責**: 渲染邏輯、變數替換、分離式輸出
```python
def render_full(context):      # 完整prompt
def render_split(context):     # 分離system/user
```

### 🧩 components.py - 基礎組件
**職責**: 段落類型定義、單段落渲染
```python
class SectionType(Enum):       # 段落類型
class PromptSection:           # 單段落組件
```

## 📊 系統統計

| 指標 | 數值 |
|------|------|
| 核心模組數 | 6個 |  
| YAML模板數 | 4個（範例）|
| 代碼行數 | ~300行 |
| 外部依賴 | 0個 |
| 新增任務成本 | 1個YAML檔案 |

## 🎉 優點總結

1. **零註冊代碼**: 放 YAML 文件就自動可用
2. **完全自動化**: 系統自動解析和載入模板
3. **超級可擴展**: 20個任務 = 20個 YAML 文件，無需額外代碼
4. **向後相容**: 使用方式完全不變
5. **無外部依賴**: 自實現 YAML 解析器

## 🔥 這才是真正的簡化！

- **添加新任務**: 複製 YAML 文件 → 修改內容 → 完成！
- **不需要碰代碼**: registry.py 完全不用改
- **自動發現**: 系統自動掃描並載入所有模板

**20+ 個任務？沒問題，只要 20+ 個 YAML 文件！**
