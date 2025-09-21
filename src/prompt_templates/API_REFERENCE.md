# API 參考文檔

## 核心類別

### PromptManager
統一的Prompt管理器，提供主要使用接口。

```python
from src.prompt_templates.manager import PromptManager

pm = PromptManager()
```

#### 方法

##### `render_prompt(task_type, language, context=None, overrides=None, **kwargs) -> str`
渲染完整的prompt字串。

**參數:**
- `task_type: TaskType` - 任務類型枚舉
- `language: Language` - 語言枚舉，預設為英文
- `context: Dict[str, Any]` - 上下文變數字典（可選）
- `overrides: Dict[str, str]` - 覆蓋特定段落內容（可選）
- `**kwargs` - 額外的變數參數

**返回:** 完整的prompt字串

**範例:**
```python
prompt = pm.render_prompt(
    task_type=TaskType.SUMMARIZATION,
    language=Language.CHINESE,
    content="要摘要的文本",
    max_length=100
)
```

##### `render_split_prompt(task_type, language, context=None, overrides=None, **kwargs) -> Dict[str, str]`
渲染分離式prompt，適合ChatGPT API使用。

**返回:** `{"system_message": "...", "user_message": "..."}`

**範例:**
```python
prompts = pm.render_split_prompt(
    task_type=TaskType.SUMMARIZATION,
    language=Language.CHINESE,
    content="要摘要的文本",
    max_length=100
)

# 用於OpenAI API
messages = [
    {"role": "system", "content": prompts["system_message"]},
    {"role": "user", "content": prompts["user_message"]}
]
```

---

### TaskType
任務類型枚舉，定義所有支援的任務。

```python
from src.prompt_templates.registry import TaskType

# 可用的任務類型
TaskType.SUMMARIZATION           # 摘要
TaskType.ENTITY_EXTRACTION      # 實體抽取  
TaskType.CHARACTER_EVIDENCE_PACK # 角色證據包
TaskType.KEYWORD_EXTRACTION     # 關鍵詞抽取
TaskType.CHATBOT               # 聊天機器人
TaskType.ARCHETYPE_CLASSIFICATION # 原型分類
```

---

### Language
語言枚舉，定義支援的語言。

```python
from src.prompt_templates.registry import Language

Language.CHINESE    # "zh" - 中文
Language.ENGLISH    # "en" - 英文
```

---

### TemplateRegistry
模板註冊器，負責模板的載入和管理。通常不需要直接使用。

```python
from src.prompt_templates.registry import TemplateRegistry

registry = TemplateRegistry()
```

#### 方法

##### `get_template(task_type, language) -> FlexibleTemplate`
獲取指定的模板實例。

##### `list_available_templates() -> Dict[str, list]`
列出所有可用的模板。

**範例:**
```python
templates = registry.list_available_templates()
# 輸出: {"summarization": ["zh", "en"], "entity_extraction": ["zh"]}
```

##### `clear_cache() -> None`
清除模板快取。開發時修改YAML文件後需要調用。

---

## YAML 模板格式

### 基本結構
```yaml
name: "模板顯示名稱"
language: "zh"  # 或 "en"
task_type: "task_name"

sections:
  system_prompt: |
    系統角色定義
  
  task_instruction: |
    任務指示
  
  constraints: |
    限制條件
  
  input_data: |
    {content}
  
  output_format: |
    輸出格式要求
```

### 支援的Section類型

| Section | 必需 | 描述 | 範例 |
|---------|------|------|------|
| `system_prompt` | ✅ | 系統角色定義 | "你是一個專業助手" |
| `task_instruction` | ✅ | 具體任務指示 | "請生成摘要" |
| `constraints` | 🔸 | 限制條件 | "- 長度不超過{max_length}字" |
| `examples` | ❌ | 使用範例 | "輸入: ... 輸出: ..." |
| `reference_info` | ❌ | 參考資訊 | "相關背景知識" |
| `input_data` | ✅ | 輸入資料 | "{content}" |
| `output_format` | 🔸 | 輸出格式 | "請以JSON格式輸出" |

圖例: ✅必需 🔸建議 ❌可選

### 變數替換

模板中可以使用 `{variable_name}` 格式的變數，在render時會被替換：

```yaml
constraints: |
  - 摘要長度不超過 {max_length} 字
  - 保留 {keep_elements} 等關鍵資訊

input_data: |
  文本內容：{content}
  作者：{author}
```

使用時：
```python
pm.render_prompt(
    task_type=TaskType.SUMMARIZATION,
    language=Language.CHINESE,
    content="要處理的文本",
    max_length=100,
    keep_elements="人物、情節",
    author="張三"
)
```

---

## 錯誤處理

### 常見異常

#### `ValueError: Template not found`
模板文件不存在或命名錯誤。

**解決方案:**
1. 檢查文件是否存在：`ls prompts/{task_type}_{language}.yaml`
2. 確認TaskType枚舉中有對應項目
3. 檢查language參數是否正確

#### `KeyError: 'variable_name'`
模板中使用的變數未在render時提供。

**解決方案:**
1. 檢查YAML文件中使用的變數名
2. 在render_prompt調用時提供對應參數
3. 或在YAML中提供預設值

#### `FileNotFoundError: Template file not found`
YAML文件路徑錯誤或文件不存在。

**解決方案:**
1. 確認prompts/目錄存在
2. 檢查文件命名格式：`{task_type}_{language}.yaml`
3. 確認文件編碼為UTF-8

---

## 使用範例

### 基本使用
```python
from src.prompt_templates.manager import PromptManager
from src.prompt_templates.registry import TaskType, Language

pm = PromptManager()

# 中文摘要
prompt = pm.render_prompt(
    task_type=TaskType.SUMMARIZATION,
    language=Language.CHINESE,
    content="很長的文章內容...",
    max_length=200
)

print(prompt)
```

### 分離式使用（適合API）
```python
prompts = pm.render_split_prompt(
    task_type=TaskType.ENTITY_EXTRACTION,
    language=Language.CHINESE,
    content="包含實體的文本"
)

# 用於OpenAI API
import openai

response = openai.ChatCompletion.create(
    model="gpt-3.5-turbo",
    messages=[
        {"role": "system", "content": prompts["system_message"]},
        {"role": "user", "content": prompts["user_message"]}
    ]
)
```

### 覆蓋特定段落
```python
prompt = pm.render_prompt(
    task_type=TaskType.SUMMARIZATION,
    language=Language.CHINESE,
    content="文本內容",
    max_length=100,
    overrides={
        "constraints": "- 必須包含關鍵人物\n- 保持時間順序",
        "output_format": "請用純文本格式輸出，不要JSON"
    }
)
```

### 批量處理
```python
texts = ["文本1", "文本2", "文本3"]
prompts = []

for text in texts:
    prompt = pm.render_prompt(
        task_type=TaskType.SUMMARIZATION,
        language=Language.CHINESE,
        content=text,
        max_length=100
    )
    prompts.append(prompt)
```
