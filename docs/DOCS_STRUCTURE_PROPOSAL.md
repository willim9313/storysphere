# StorySphere 新功能文件結構建議

**用途**: 說明 F 系列新功能的補充文件應放置在哪裡，以及各份文件的骨架
**更新日期**: 2026-03-31

---

## 文件放置原則

沿用現有 v3.1 結構，不另起爐灶：

```
docs/
├── BACKLOG_NEW_FEATURES.md          ← 新增（F 系列 Backlog，本次產出）
│
├── notes/                           ← 設計筆記（概念探索階段）
│   ├── progressive_kg_design_notes.md       ← F-02
│   ├── epistemic_state_design_notes.md      ← F-03
│   ├── voice_fingerprint_design_notes.md    ← F-04
│   ├── what_if_design_notes.md              ← F-05
│   ├── narrative_rhythm_design_notes.md     ← F-06（可與 F-07 合併）
│   ├── thematic_map_design_notes.md         ← F-07
│   ├── reading_memory_design_notes.md       ← F-12
│   ├── image_generation_design_notes.md     ← F-14
│   ├── character_similarity_design_notes.md ← F-11
│   ├── narrative_focalization_design_notes.md ← F-10
│   └── link_prediction_design_notes.md      ← F-01
│
└── guides/                          ← 實施指南（準備開發時才建立）
    ├── PHASE_9_TEMPORAL_TIMELINE.md ← 已有
    ├── PHASE_10_TENSION_ANALYSIS.md ← 已規劃（B-030）
    ├── PHASE_11_NARRATOLOGY.md      ← 已規劃（B-038）
    ├── PHASE_12_PROGRESSIVE_KG.md   ← F-02 + F-03（Wave 1）
    ├── PHASE_13_ROLE_AGENT.md       ← F-13 + Wave 5 Role Agent 完整系統
    ├── PHASE_14_WHATIF_SYSTEM.md    ← F-05 + Wave 5 What-If 完整系統
    └── PHASE_15_WORLDBUILDING.md    ← F-15 世界觀建構完整系統
```

**判斷規則**:
- `notes/`：功能還在設計探索階段，有開放問題尚未決定，放 notes
- `guides/`：設計決策已確認、可以直接照著實作，放 guides
- F-08（伏筆偵測器）、F-09（張力追蹤器）邏輯簡單，不需獨立設計文件，直接在 Backlog 裡說清楚即可

---

## 各份 notes 文件骨架

以下是需要建立的 notes 文件骨架，供 Claude Code 或手動填寫。

---

### `docs/notes/progressive_kg_design_notes.md`（F-02）

```markdown
# StorySphere 進度感知 KG — 設計筆記

**建立日期**: 2026-03-31
**狀態**: 待實作（Wave 1）
**對應 Backlog**: F-02

---

## 一、核心問題

讀者在第 N 章時，KG 應該呈現什麼狀態？

## 二、快照查詢設計

`get_snapshot(book_id, up_to_chapter_index)` 的邊界定義：
- 包含的節點：...
- 包含的邊：...
- 邊界情況：跨章節事件如何處理？

## 三、前端互動設計

- 滑桿操作的 debounce 策略
- 切換章節時的動畫方式（淡入淡出 vs 無動畫）
- 是否快取各章節快照

## 四、開放問題

1. 快照是按章節索引還是按章節 ID？
2. 「正在閱讀章節」如何與圖譜同步？

## 五、相關文件

- Backlog: `docs/BACKLOG_NEW_FEATURES.md` F-02
```

---

### `docs/notes/epistemic_state_design_notes.md`（F-03）

```markdown
# StorySphere 角色認識論狀態 — 設計筆記

**建立日期**: 2026-03-31
**狀態**: 待實作（Wave 1）
**對應 Backlog**: F-03

---

## 一、核心問題

角色「知道」某事件的條件是什麼？

## 二、visibility 欄位設計

三值設計的判斷標準：
- `public`：任何場景中的角色都「有可能」知道
- `private`：只有 participants 知道
- `secret`：即使是 participants 也可能不知道（需要額外推斷）

ingestion prompt 如何引導 LLM 判斷？

## 三、認識論狀態計算邏輯

```
known_events = [
    e for e in get_snapshot(chapter=N)
    if character_id in e.participants
    or e.visibility == "public"
]
```

邊界情況：
- 角色從其他角色處聽說的事件
- 角色誤解的事件（misbelief）

## 四、開放問題

1. `misbelief` 的資料結構：角色「以為自己知道但實際上錯了」如何表示？
2. 資訊傳播鏈：A 告訴 B 某事件，B 因此知道，這個推斷鏈要不要追蹤？

## 五、相關文件

- Backlog: `docs/BACKLOG_NEW_FEATURES.md` F-03
- 依賴: F-02 設計筆記
```

---

### `docs/notes/what_if_design_notes.md`（F-05）

```markdown
# StorySphere What-If 情境推演 — 設計筆記

**建立日期**: 2026-03-31
**狀態**: 待實作（Wave 3）
**對應 Backlog**: F-05

---

## 一、核心問題

分歧點確定後，因果鏈傳播的邊界在哪裡？

## 二、因果鏈傳播演算法

從分歧點 E0 往後遍歷：
```
affected = []
queue = [e for e in all_events if E0.id in e.prior_event_ids]
while queue:
    e = queue.pop()
    affected.append(e)
    queue += [e2 for e2 in all_events if e.id in e2.prior_event_ids]
```

停止條件：達到書末 / 無更多後繼事件。

## 三、角色一致性約束

每個受影響事件，LLM 判斷的 prompt 結構：
- 輸入：CEP 性格摘要 + 新情境描述 + 原事件描述
- 輸出：`consistent: bool` + `adjusted_behavior: str` + `reasoning: str`

## 四、分支版本控制

`WhatIfBranch` schema：
- `id`、`book_id`、`parent_branch_id`（null = 主線）
- `divergence_event_id`、`divergence_description`
- `affected_event_ids`：受影響事件的 ID 列表
- `branch_events`：替代版本的事件列表（新生成的）

## 五、開放問題

1. 受影響事件的替代版本由 LLM 完整重寫，還是只標記「已改變」讓用戶自己填？
2. 分支嵌套（What-If 的 What-If）是否支援？
3. 分支事件是否要存入主 KG，還是獨立存放？

## 六、相關文件

- Backlog: `docs/BACKLOG_NEW_FEATURES.md` F-05
- 依賴: F-02、F-03 設計筆記
```

---

### `docs/notes/reading_memory_design_notes.md`（F-12）

```markdown
# StorySphere 閱讀記憶外化系統 — 設計筆記

**建立日期**: 2026-03-31
**狀態**: 待實作（Wave 2）
**對應 Backlog**: F-12

---

## 一、UserAnnotation schema

```python
class UserAnnotation(BaseModel):
    id: str
    book_id: str
    chunk_id: str | None
    event_id: str | None           # 可選，與 KG 節點關聯
    annotation_type: Literal["question", "interpretation", "prediction"]
    content: str
    created_at: datetime
    resolved: bool = False         # 疑問是否已被後續閱讀解答
    resolved_by_chapter: str | None
```

## 二、提醒觸發邏輯

```
當用戶進入第 N 章時：
1. 取出 created_at_chapter < N 的所有未解決 annotation
2. 用 annotation.content 做向量搜索，找當前章節最相似的事件
3. 相似度 > 閾值（建議 0.75）→ 觸發提醒
4. 提醒內容：「你在第 X 章有個疑問：'{annotation.content}'，第 N 章的 '{event.title}' 可能是答案」
```

## 三、開放問題

1. 提醒觸發時機：進章節時立刻觸發，還是讀到對應 chunk 時才觸發？
2. 預測類標注的「驗證」邏輯：預測是否成真，怎麼讓系統知道？

## 四、相關文件

- Backlog: `docs/BACKLOG_NEW_FEATURES.md` F-12
```

---

### `docs/notes/image_generation_design_notes.md`（F-14）

```markdown
# StorySphere 生圖整合 — 設計筆記

**建立日期**: 2026-03-31
**狀態**: 待實作（Wave 4）
**對應 Backlog**: F-14

---

## 一、角色 prompt 組裝邏輯

從 CEP 提取的外貌相關句子來源：
- `get_passages(entity_id)` 中含外貌關鍵詞的段落（高 / 身材 / 眼睛 / 髮色 / 表情等）
- CEP 的原型標籤（轉為視覺描述詞，如「英雄原型 → 堅毅面容」）

書級風格 token 附加方式：
```
prompt = f"{character_description}, {book_style_token}, {quality_tokens}"
```

## 二、圖像服務抽象接口

```python
class ImageGenService(Protocol):
    async def generate(self, prompt: str, size: str) -> ImageAsset: ...
```

預設實作：DALL-E 3（OpenAI API）
可替換：Stable Diffusion API、本地 ComfyUI

## 三、BookVisualStyle schema

```python
class BookVisualStyle(BaseModel):
    book_id: str
    style_token: str               # e.g. "水彩插畫風格，柔和色調，東方古風"
    quality_tokens: str            # e.g. "high quality, detailed, artistic"
    negative_prompt: str | None    # e.g. "photorealistic, 3D render"
    updated_at: datetime
```

## 四、開放問題

1. 角色縮圖的尺寸規格（256x256 / 512x512？）
2. 生成失敗的 fallback（顯示首字母頭像）
3. 是否支援「基於已有縮圖重新生成（保持角色一致性）」（需要 image-to-image）

## 五、相關文件

- Backlog: `docs/BACKLOG_NEW_FEATURES.md` F-14
```

---

## Guides 文件骨架

以下是需要在「準備開發時」建立的 guides 骨架。**現在不需要填內容，只需要建立空骨架作為佔位**。

---

### `docs/guides/PHASE_12_PROGRESSIVE_KG.md`

```markdown
# Phase 12: 進度感知 KG + 角色認識論狀態

**前置**: Phase 8（FastAPI 層）完成
**目標**: 實作 F-02 章節快照 KG 和 F-03 角色認識論狀態服務，為 Role Agent 和 What-If 系統建立底層基礎

---

## 目錄

1. 概覽
2. F-02：KGService.get_snapshot() 實作
3. F-03：EventNode visibility 欄位（配合 B-023+031 migration）
4. F-03：EpistemicStateService 實作
5. API 端點
6. 前端：圖譜頁章節滑桿
7. 測試計畫

---

（待填寫）
```

---

### `docs/guides/PHASE_13_ROLE_AGENT.md`

```markdown
# Phase 13: Role Agent 系統

**前置**: Phase 12（F-02、F-03）完成，F-04 聲音指紋完成
**目標**: 實作可與角色對話的 Agent 系統，支援認識論邊界強制、聲音風格約束、多角色聊天室

---

## 目錄

1. 概覽與設計理念
2. Agent Persona 組裝
3. 認識論邊界強制機制
4. 單角色對話模式
5. 多角色聊天室 Orchestration
6. 對話記錄與 KG 掛接
7. API 端點與 WebSocket 協議
8. 前端頁面設計
9. 測試計畫

---

（待填寫）
```

---

### `docs/guides/PHASE_14_WHATIF_SYSTEM.md`

```markdown
# Phase 14: What-If 情境推演系統

**前置**: Phase 12（F-02、F-03）完成
**目標**: 實作 What-If 情境推演，支援因果鏈傳播、角色一致性約束、平行分支版本控制

---

## 目錄

1. 概覽與設計理念
2. 因果鏈傳播演算法
3. 角色一致性約束（LLM 判斷）
4. WhatIfBranch Domain Model
5. 分支版本存儲策略
6. API 端點
7. 前端圖譜頁整合
8. 測試計畫

---

（待填寫）
```

---

### `docs/guides/PHASE_15_WORLDBUILDING.md`

```markdown
# Phase 15: 世界觀建構模式

**前置**: Phase 13（Role Agent）、Phase 14（What-If）完成
**目標**: 實作創作工作坊模式，讓用戶不需要完整小說文本即可建構世界觀 KG，並使用現有分析與互動功能

---

## 目錄

1. 概覽與使用模式翻轉
2. 設定素材輸入類型（角色卡 / 地點卡 / 事件卡）
3. Worldbuilding Ingestion Pipeline
4. 邏輯一致性驗證器
5. 與現有 Role Agent / What-If 的整合
6. API 端點
7. 前端「創作工作坊」頁面
8. 測試計畫

---

（待填寫）
```

---

## 補充：CORE.md 需要的更新

當 F 系列開始實作後，`docs/CORE.md` 的「待辦 & 缺口」區塊和「實施指南」區塊需要同步更新，加入 F 系列的索引：

```markdown
### 待辦 & 缺口
- [既有 Backlog](BACKLOG.md)
- [新功能 Backlog（F 系列）](BACKLOG_NEW_FEATURES.md)   ← 新增

### 實施指南（按 Phase）
...現有 Phase 1-11...
- [Phase 12: 進度感知 KG + 認識論狀態](guides/PHASE_12_PROGRESSIVE_KG.md)   ← 準備開發時新增
- [Phase 13: Role Agent 系統](guides/PHASE_13_ROLE_AGENT.md)
- [Phase 14: What-If 系統](guides/PHASE_14_WHATIF_SYSTEM.md)
- [Phase 15: 世界觀建構模式](guides/PHASE_15_WORLDBUILDING.md)
```

---

**維護者**: William
**建立日期**: 2026-03-31
