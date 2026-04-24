# StorySphere — 開發 Backlog

**用途**: 記錄已識別但尚未排入 Phase 的開發項目
**更新日期**: 2026-04-23

> 已完成項目歸檔於 [BACKLOG_ARCHIVE.md](BACKLOG_ARCHIVE.md)

---

## B 系列（既有）

### 🟡 中優先（功能完善）

#### B-014 Local LLM 選型評估（進行中）
**背景**: qwen2.5-3b JSON schema 遵從度不穩定（null 代替 []、malformed JSON），已換至 Phi-3.5-mini-instruct Q4_K_M（社群量化），功能正常但速度偏慢。

**Local model 選型條件**:
- JSON schema 遵從度：能穩定回傳 `[]` 而非 `null`，不截斷 JSON
- 大小：Q4_K_M 量化後 ≤ 5GB
- 格式：GGUF，相容 llama.cpp server（OpenAI-compatible `/v1` API）
- 推理速度：single-turn < 30s 為可接受範圍

**待評估候選**:
- Phi-3.5-mini-instruct Q4_K_M（~2.2GB）← 目前使用，格式遵從佳但偏慢
- Qwen2.5-7B-Instruct Q4_K_M（~4.7GB）← 同 family 升級版
- Llama-3.2-3B-Instruct Q4_K_M（~2.0GB）← Meta 新一代 3B

**目標**: 找到速度與格式穩定性平衡最佳的選項。

---

### 🟢 低優先（可選升級）

#### B-011 生產環境配置
**內容**:
- Dockerfile + docker-compose（API + Qdrant + 可選 Neo4j）
- PostgreSQL 遷移（`database_url` 已支援，需測試）
- `uvicorn --workers N` 配合 B-003 TaskStore 持久化

---

## F 系列（新功能）

**前置閱讀**: `docs/CORE.md`

新功能依依賴關係分為五個波次，需在既有 Backlog 的 Wave 0 前置項目完成後啟動。

```
Wave 0（前置）  →  Wave 1（底層）  →  Wave 2（輕量分析）
                                  →  Wave 3（深度分析）
                                  →  Wave 4（體驗功能）
                                  →  Wave 5（整合大功能）
                   + 加分項（無硬依賴，可插入任意波次）
```

**Wave 0 前置項目**（沿用既有 Backlog）：
- B-023 + B-031 合併 migration（EventNode 欄位）
- B-015 Chat Agent 品質審視
- B-012 前後端 API 整合驗證

---

### 🟢 Wave 1 — 底層基礎建設

#### F-01 隱性關係推論層（KG Link Prediction）
**分類**: 加分項（無硬依賴，可插入 Wave 1 或之後任意時機）
**設計文件**: `docs/notes/link_prediction_design_notes.md`（待建立）

**背景**: 現有 KG 只記錄文本明說的關係。Link Prediction 透過圖嵌入模型推斷「文本未明說但結構上暗示存在」的隱性關係，讓 KG 從「轉錄工具」變成「推理工具」。

**所需資料**:
- 現有 KG 的節點與邊（已有）

**開發方法**:
- 輕量路徑：共同鄰居統計 + Adamic-Adar 指數（規則式，無需訓練）
- 進階路徑：PyKEEN 框架的 TransE / RotatE / ComplEx，把節點和關係投影到向量空間
- 輸出需包含置信度，圖譜上用虛線顯示，與明確關係視覺區分
- 用戶可確認或否定推斷關係，確認的進入正式 KG

**內容**:
- `src/services/link_prediction_service.py`：實作推斷邏輯，輸出帶置信度的候選關係列表
- KGService 新增 `get_inferred_relations(entity_id, min_confidence)` 查詢
- API 端點：`GET /books/:bookId/graph/inferred` — 返回推斷關係（附置信度）
- 前端圖譜：虛線邊 + 置信度 badge，可點擊確認/否定
- `PATCH /books/:bookId/graph/relations/:id/confirm` — 確認推斷關係進入正式 KG

**解鎖的後續功能**: F-07（主題共鳴圖）、F-15（世界觀建構）品質提升

---

#### F-02 進度感知 KG（章節時間切片）
**分類**: 底層基礎 — Wave 1 核心
**設計文件**: `docs/notes/progressive_kg_design_notes.md`（待建立）

**背景**: 現有圖譜是全書靜態快照。進度感知 KG 讓系統知道「讀者在第 N 章時，世界的狀態是什麼」，這是動態圖譜視覺化、閱讀分身認識論邊界、What-If 時間點鎖定的共同基礎。

**所需資料**:
- Event 節點的 `chapter` 欄位（已有）
- Entity 節點的 `event_ids`（已有）

**開發方法**:
- KGService 新增 `get_snapshot(book_id, up_to_chapter_index)` 查詢
- 快照邏輯：只返回 `chapter <= up_to_chapter_index` 的事件所涉及的節點與邊
- 靜態快照模式，無需額外 LLM，純圖查詢
- 前端圖譜頁新增章節進度滑桿，驅動快照切換

**內容**:
- `KGService.get_snapshot(book_id, up_to_chapter)` — 返回章節截止的子圖
- `GET /books/:bookId/graph?up_to_chapter={N}` — 現有 graph endpoint 新增可選參數
- 前端圖譜頁：章節滑桿元件 + 切換動畫（節點淡入/淡出）
- 閱讀頁：隨章節閱讀進度自動更新圖譜快照（可選，低優先）

**解鎖的後續功能**: F-03、F-05（What-If）、F-12（閱讀記憶）、F-13（Role Agent）

---

#### F-03 角色認識論狀態
**分類**: 底層基礎 — Wave 1 核心
**設計文件**: `docs/notes/epistemic_state_design_notes.md`（待建立）

**背景**: 每個角色在每個時間點，對世界的認識是不完整且可能有誤的。F-03 讓系統可以回答「第 N 章時，角色 A 知道哪些事、不知道哪些事」，這是 Role Agent 真實性和 What-If 約束的核心。

**所需資料**:
- F-02 的章節快照（依賴 F-02）
- EEP 的 `participant_roles`（已有）
- Event 的 `participants` 欄位（已有）

**開發方法**:
- 核心邏輯：角色「知道」某事件，當且僅當 (a) 他是該事件的 participant，或 (b) 事件 `visibility = "public"`
- Event 節點需新增 `visibility: Literal["public", "private", "secret"] = "public"` 欄位（ingestion prompt 引導 LLM 判斷）
- `EpistemicStateService.get_character_knowledge(character_id, up_to_chapter)` — 返回該角色已知的事件列表和未知的重要事件列表

**內容**:
- EventNode 新增 `visibility` 欄位（配合 B-023+031 migration 一起加，或單獨做）
- `src/services/epistemic_state_service.py`：計算角色認識論狀態
- Domain Model：`CharacterEpistemicState`（known_events, unknown_events, misbeliefs）
- API 端點：`GET /books/:bookId/entities/:entityId/epistemic-state?up_to_chapter={N}`

**解鎖的後續功能**: F-05（What-If 約束）、F-10（敘事視角分析）、F-13（Role Agent 認識論邊界）

---

#### F-04 角色聲音指紋
**分類**: 底層基礎 — Wave 1
**設計文件**: `docs/notes/voice_fingerprint_design_notes.md`（待建立）

**背景**: 每個角色的對話和內心獨白有獨特的語言模式。聲音指紋讓系統可以識別角色辨識度、輔助創作時保持角色一致性，也是 Role Agent 對話生成的風格約束來源。

**所需資料**:
- 章節文本中角色的對話段落（需從 chunks 識別對話歸屬）
- Qdrant 的 chunk 語意搜索（已有）

**開發方法**:
- 用角色名稱 + 對話關鍵詞做語意搜索，從 Qdrant chunks 找到角色相關段落
- 量化特徵提取：平均句長、情感詞密度（VADER 或類似工具）、常用連接詞/副詞分佈、問句比例
- LLM 補充質性描述：「傾向使用隱喻」、「說話直接不迂迴」、「常用反問句」等
- Domain Model：`VoiceFingerprint`（定量指標 + LLM 質性描述 + 代表性引文）

**內容**:
- `src/services/voice_fingerprint_service.py`：提取並存儲角色聲音指紋
- `src/domain/voice.py`：`VoiceFingerprint` Pydantic model
- API 端點：`GET /books/:bookId/entities/:entityId/voice` — 返回聲音指紋
- 前端：角色詳情面板新增「聲音風格」tab（展示指紋 + 代表性引文）
- 角色一致性檢查入口：輸入一段對話，對比聲音指紋，輸出一致性評分

**解鎖的後續功能**: F-10（敘事視角）、F-13（Role Agent 對話風格約束）

---

### 🟡 Wave 2 — 輕量分析功能

#### F-06 敘事節奏分析器
**分類**: 分析功能 — Wave 2
**設計文件**: `docs/notes/narrative_rhythm_design_notes.md`（待建立，可與 F-07 合併）

**背景**: 把全書投影成多維節奏曲線，讓讀者一眼看出作者的敘事節奏型態，也讓創作者可以檢查自己的節奏是否過於平均或集中。

**所需資料**:
- 章節列表（已有）
- Event 節點的 `chapter` 欄位（已有）
- `emotional_intensity`（B-023 完成後有）
- `narrative_weight`（B-033 完成後有）
- 新角色首次出現的章節（可從 KG 查詢）

**開發方法**:
- 純計算，無額外 LLM：per-chapter 統計以下指標：
  - 事件密度（該章事件數 / 全書平均）
  - 情感強度均值（`emotional_intensity` 平均）
  - kernel 事件比例
  - 新角色出現數
- 節奏型態識別：用滑動窗口（window_size = 3 章）找重複模式（可選，後期優化）
- 輸出：per-chapter 的多維指標陣列，供前端視覺化

**內容**:
- `src/services/rhythm_service.py`：計算節奏指標
- API 端點：`GET /books/:bookId/analysis/rhythm` — 返回章節節奏數據
- 前端：深度分析頁新增「敘事節奏」tab，渲染多維折線圖（Recharts）
- 可與情感溫度圖疊加顯示（同一 X 軸）

**前置依賴**: B-023（emotional_intensity）、B-033（narrative_weight）

---

#### F-08 伏筆偵測器（「我沒注意到」）
**分類**: 分析功能 — Wave 2
**設計文件**: 不需獨立設計文件，邏輯簡單

**背景**: 找出「重要但低調」的事件節點——這些是作者埋下的伏筆，讀者往往在第一遍閱讀時忽略。選取邏輯完全基於 KG 結構性查詢，不需要額外 LLM。

**所需資料**:
- `narrative_weight = "kernel"`（B-033 完成後有）
- Event 的 chunk 出現次數（已有）
- EEP 的 `subsequent_event_ids`（已有）

**開發方法**:
- 純 KG 查詢，三個條件交集：
  1. `narrative_weight = "kernel"`（敘事上重要）
  2. 出現的 chunk 數少於全書事件的中位數（文本上低調）
  3. `subsequent_event_ids` 中有至少一個 `tension_signal = "explicit"` 的後續事件（因果上關鍵）
- 按「重要性 / 低調程度比值」排序輸出
- 不需要 LLM 額外調用

**內容**:
- `KGService.get_overlooked_events(book_id, top_n)` — 返回符合條件的事件列表
- API 端點：`GET /books/:bookId/analysis/overlooked-events`
- 前端：閱讀頁新增「伏筆提示」浮動按鈕（讀完後解鎖），點擊展開列表
- 每個伏筆項目：事件標題 + 出現章節 + 後來呼應的事件 + 原文引用段落

**前置依賴**: B-023（tension_signal）、B-033（narrative_weight）

---

#### F-12 閱讀記憶外化系統
**分類**: 體驗功能 — Wave 2
**設計文件**: `docs/notes/reading_memory_design_notes.md`（待建立）

**背景**: 閱讀時的疑問、感想、預測是讀者最有價值的思考，但通常消散在閱讀過程中。F-12 讓這些標注與 KG 結構對齊，並在後續閱讀中主動提醒「你之前的疑問現在有答案了」。

**所需資料**:
- 用戶標注（新資料，需建立 `UserAnnotation` 資料結構）
- Chunk_id 與 Event 的對應關係（已有）
- Qdrant 向量搜索（已有）

**開發方法**:
- `UserAnnotation` 掛在 `chunk_id` 或 `event_id` 上，儲存用戶文字 + 標注類型（疑問 / 詮釋 / 預測）
- 主動提醒邏輯：用標注文字做向量搜索，當用戶進入新章節時，找語義相關的新事件，相關度超過閾值即推送提醒
- 本質上是「個人知識庫 + 觸發式推送」

**內容**:
- `src/domain/annotation.py`：`UserAnnotation` Pydantic model
- `src/services/annotation_service.py`：標注的 CRUD + 提醒觸發邏輯
- SQLite 存儲（沿用 `analysis_cache.py` 模式）
- API 端點：
  - `POST /books/:bookId/annotations` — 建立標注
  - `GET /books/:bookId/annotations` — 列出標注
  - `GET /books/:bookId/annotations/reminders?current_chapter={N}` — 取得當前章節相關的歷史標注提醒
- 前端：閱讀頁 chunk 旁新增標注按鈕 + 提醒浮動 toast

**前置依賴**: F-02（章節進度感知，用於觸發提醒）

---

### 🟠 Wave 3 — 深度分析功能

#### F-05 What-If 情境推演
**分類**: 分析功能 — Wave 3（核心體驗功能）
**設計文件**: `docs/notes/what_if_design_notes.md`（待建立）

**背景**: 讓讀者在 KG 的任意事件節點上標記「反轉此事件」，系統基於因果鏈和角色一致性約束，推演出一條替代敘事分支。多條分支可以並存，形成平行時間軸結構。

**所需資料**:
- F-02（章節快照）
- F-03（角色認識論狀態）— 作為角色反應的約束條件
- EEP 的 `prior_event_ids` / `subsequent_event_ids`（已有）
- CEP 的角色性格結構（已有）

**開發方法**:
四步驟流程：
1. **分歧點選擇**：用戶在事件節點標記「反轉此事件」，輸入反轉描述
2. **因果鏈傳播**：從分歧點往後做圖遍歷，找出所有 `prior_event_ids` 包含它的後續事件，標記為「受影響節點」
3. **角色一致性約束**：對每個受影響事件，用 CEP 性格結構做 LLM 判斷「這個角色在新情境下的反應是否合理」
4. **分支快照生成**：建立平行 KG 版本，受影響節點替換為新推演版本

分支管理：版本控制概念，每條分支有 `id`、`parent_event_id`（分歧點）、`divergence_description`。

**內容**:
- `src/domain/whatif.py`：`WhatIfBranch`、`WhatIfEvent` Pydantic models
- `src/services/whatif_service.py`：因果鏈傳播 + 一致性約束 + 分支生成
- API 端點：
  - `POST /books/:bookId/whatif` — 建立分歧點，觸發推演，返回 `task_id`
  - `GET /books/:bookId/whatif` — 列出所有分支
  - `GET /books/:bookId/whatif/:branchId` — 取得分支詳情（替代事件鏈）
  - `DELETE /books/:bookId/whatif/:branchId` — 刪除分支
- 前端：圖譜頁事件節點右鍵選單新增「建立 What-If 分支」
- 分支視覺化：主線 + 分支以不同顏色顯示，分歧點有特殊標記

**前置依賴**: F-02、F-03、B-023（tension_signal 用於識別高影響節點）

---

#### F-07 主題共鳴地圖
**分類**: 分析功能 — Wave 3
**設計文件**: `docs/notes/thematic_map_design_notes.md`（待建立）

**背景**: 把全書的 Concept 節點投影到語義空間，讓讀者一眼看出「這本書真正在談的幾組核心對立」，以及概念之間的共鳴結構。

**所需資料**:
- Concept 節點（已有）
- Concept 節點的向量嵌入（已有，Qdrant）
- 張力分析的 TensionLine（B-027 完成後有，可選）

**開發方法**:
- 從 Qdrant 取 Concept 節點的嵌入向量
- UMAP（或 t-SNE）降維到 2D，保留語義聚類結構
- 共現強度：計算 Concept 節點在相同 chunk 中的共現頻率，作為邊的權重
- 對立關係：優先從 TensionLine 的 `poles` 取得；若 TensionLine 未完成，用向量距離的遠端對作為候選
- 輸出：帶 2D 座標的節點列表 + 帶權重的邊列表

**內容**:
- `src/services/thematic_map_service.py`：降維計算 + 共現矩陣
- API 端點：`GET /books/:bookId/analysis/thematic-map` — 返回節點座標與邊
- 前端：深度分析頁新增「主題地圖」tab，以 Cytoscape.js（已引入）渲染語義散佈圖
- 節點大小 = 全書出現頻率，邊粗細 = 共現強度，顏色 = 概念類型

**前置依賴**: Concept 節點向量嵌入（已有）；B-027（TensionLine，可選強化）

---

#### F-10 敘事視角分析
**分類**: 分析功能 — Wave 3
**設計文件**: `docs/notes/narrative_focalization_design_notes.md`（待建立）

**背景**: 誰在講這個故事？哪些資訊是被刻意過濾的？F-10 分析每章節的敘事視角與資訊不對稱結構，讓讀者理解「故事是怎麼被講的」，讓創作者可以分析技法。

**所需資料**:
- 章節文本（已有）
- F-03（角色認識論狀態）— 用於計算資訊不對稱
- F-04（角色聲音指紋）— 用於對話歸屬識別（可選強化）
- Event 的 `participants` 欄位（已有）

**開發方法**:
- 每章節用 LLM 判斷主要敘事視角類型：`omniscient` / `limited_third` / `first_person` / `multiple`
- 資訊不對稱標記（需 F-03）：找「讀者知道但角色 X 不知道」的事件——即事件的 participants 不包含 X，但 X 是後來受影響的角色
- 輸出：per-chapter 的視角標記 + 資訊不對稱節點列表

**內容**:
- `src/services/focalization_service.py`：視角分類 + 資訊不對稱計算
- `src/domain/focalization.py`：`ChapterFocalization`、`InformationGap` models
- API 端點：`GET /books/:bookId/analysis/focalization` — 返回全書視角分析
- 前端：深度分析頁新增「敘事視角」tab，章節時間軸上標記視角類型 + 資訊不對稱熱點

**前置依賴**: F-03（資訊不對稱計算）

---

### 🔵 Wave 4 — 體驗型功能

#### F-09 未解決張力追蹤器
**分類**: 分析功能 — Wave 4
**設計文件**: 不需獨立設計文件，基於 TensionLine

**背景**: 追蹤全書結尾哪些對立張力仍處於開放狀態——這些可能是作者刻意留下的，也可能是未兌現的承諾。對讀者是閱後反思工具，對創作者是結構性檢查工具。

**所需資料**:
- TensionLine（B-027 完成後有）
- TEU 的 `local_resolution` 欄位（B-026 完成後有）

**開發方法**:
- 對每條 TensionLine，聚合其所有 TEU 的 `local_resolution` 狀態
- 書末層面：用 LLM 判斷 TensionLine 在最後幾章是否有對應的解決事件
- 輸出四種解決狀態：`resolved`（完全解決）/ `transformed`（部分轉化）/ `suspended`（懸而未決）/ `avoided`（被迴避）
- 解決度評分：0.0（完全未解決）~ 1.0（完全解決）

**內容**:
- `TensionService.analyze_resolution(book_id)` — 計算全書張力解決狀態
- API 端點：`GET /books/:bookId/analysis/tension-resolution`
- 前端：深度分析頁張力分析 tab 新增「解決狀態概覽」區塊

**前置依賴**: B-026（TEU）、B-027（TensionLine）

---

#### F-11 角色命運相似度
**分類**: 分析功能 — Wave 4
**設計文件**: `docs/notes/character_similarity_design_notes.md`（待建立）

**背景**: 計算不同角色的命運模式相似度——不是外貌或性格，而是他們經歷的事件弧線、在關係網中的位置、角色弧線類型的相似程度。跨書比較讓讀者看到更深的敘事原型。

**所需資料**:
- CEP（已有）
- 角色弧線（已有）
- 多本書的資料（跨書比較需要）

**開發方法**:
- 把 CEP 的結構化欄位（原型標籤、弧線類型、關係位置）編碼為特徵向量
- 單書內：用餘弦相似度計算角色間的命運模式距離
- 跨書比較：現有架構以 `book_id` 隔離，跨書查詢需新增 `cross_book` 查詢接口（`book_id=None` 則全庫查詢）

**內容**:
- `src/services/character_similarity_service.py`：特徵編碼 + 相似度計算
- API 端點：
  - `GET /books/:bookId/entities/:entityId/similar-characters?scope=book|all` — 返回相似角色列表（附相似度分數）
- 前端：角色分析頁新增「相似角色」區塊，可切換「本書內」/ 「跨書」範圍

**前置依賴**: CEP（已有）

---

#### F-13 Role Agent 系統
**分類**: 體驗功能 — Wave 4（核心沉浸功能）
**設計文件**: `docs/guides/PHASE_X_ROLE_AGENT.md`（待建立，因複雜度需完整 guide）

**背景**: 讓每個角色成為可以對話的 Agent，有認識論邊界（不知道他不該知道的事）、有聲音風格、有性格約束。支援四種使用模式：視角重述、單角色對話、多角色聊天室、世界觀建構中的角色測試。

**所需資料**:
- CEP（已有）
- F-03（角色認識論狀態）
- F-04（聲音指紋）
- F-02（章節快照，用於時間點鎖定）

**開發方法**:
Agent persona 組裝（system prompt 建構）：
```
CEP 的性格結構 + 原型標籤
+ 聲音指紋的量化指標與質性描述
+ 認識論狀態（已知事件、未知事件列表）
+ 時間點鎖定（第幾章之後的狀態）
```

認識論邊界強制：Agent 在對話中被問及「他不該知道的事」時，識別並以「不知情」方式回應，不洩露信息。

多角色聊天室：多個 Agent 實例並存，orchestrator 決定輪次（用戶指定角色 / 按對話自然流向），每個 Agent 的 persona 獨立。

**內容**:
- `src/agents/role_agent.py`：RoleAgent class，封裝 persona 建構 + 對話邏輯
- `src/services/role_agent_service.py`：Session 管理、多角色 orchestration
- `src/domain/role_session.py`：`RoleSession`、`RoleMessage`、`MultiRoleRoom` models
- SQLite 存儲：對話記錄（可掛回 KG 作為「平行事件」）
- API 端點：
  - `POST /books/:bookId/role-sessions` — 建立角色對話 session（指定角色 + 章節時間點）
  - `WS /ws/role-sessions/:sessionId` — WebSocket 對話串流
  - `POST /books/:bookId/role-rooms` — 建立多角色聊天室
  - `GET /books/:bookId/role-sessions/:sessionId/history` — 取得對話記錄
- 前端：獨立頁面 `/books/:bookId/roleplay`，支援切換三種模式（視角重述 / 對話 / 多角色室）

**前置依賴**: F-02、F-03、F-04

---

#### F-14 生圖整合（角色縮圖 + 場景圖）
**分類**: 體驗功能 — Wave 4
**設計文件**: `docs/notes/image_generation_design_notes.md`（待建立）

**背景**: 利用 CEP 的外貌描述和 Location 節點的場景描述，自動組裝圖像生成 prompt，為角色和場景生成視覺呈現。書級共享風格設定，保持視覺一致性。

**所需資料**:
- CEP 的外貌相關段落（已有）
- Location 節點描述（已有）
- EEP 的 `state_before/after`（已有，用於場景圖語境）

**開發方法**:
- Prompt 組裝：從 CEP 提取外貌相關句子 + 原型標籤 → 組成角色視覺 prompt
- 書級風格設定：用戶在書籍設定頁設定一次「美術風格 token」（如「水彩插畫，柔和色調」），所有角色和場景 prompt 自動附加
- 預設 API 接口：外部圖像生成服務（DALL-E 3 / Stable Diffusion API），抽象成可替換接口
- 生圖結果存入 `ImageAsset` 資料結構，與 entity_id 關聯

**內容**:
- `src/services/image_gen_service.py`：prompt 組裝 + API 調用 + 結果存儲
- `src/domain/image_asset.py`：`ImageAsset`、`BookVisualStyle` models
- 書籍設定：新增「視覺風格」設定欄位（書級）
- API 端點：
  - `POST /books/:bookId/entities/:entityId/generate-image` — 觸發角色縮圖生成
  - `POST /books/:bookId/locations/:locationId/generate-image` — 觸發場景圖生成
  - `GET /books/:bookId/visual-style` / `PUT` — 取得/更新書籍視覺風格
- 前端：角色詳情面板顯示縮圖，可觸發重新生成；圖譜頁角色節點可顯示縮圖

**前置依賴**: CEP（已有）；無其他硬依賴

---

### 🔴 Wave 5 — 整合型大功能

#### What-If 完整系統
**分類**: 整合 — Wave 5
**設計文件**: `docs/guides/PHASE_X_WHATIF_SYSTEM.md`（待建立）

**內容**: F-05 的延伸，加入多分支管理 UI、分支事件鏈的完整視覺化、分支之間的比對工具，以及將 Role Agent（F-13）帶入 What-If 分支進行角色對話驗證。

**前置依賴**: F-05、F-13

---

#### Role Agent 完整系統
**分類**: 整合 — Wave 5
**設計文件**: `docs/guides/PHASE_X_ROLE_AGENT.md`（同 F-13）

**內容**: F-13 的完整實作，加入視角重述模式（角色日記 / 回憶錄生成）、對話記錄掛回 KG 作為「平行事件」、多角色聊天室的完整 orchestration 邏輯。

**前置依賴**: F-13（F-02、F-03、F-04）

---

#### F-15 世界觀建構完整系統
**分類**: 整合 — Wave 5（新使用模式）
**設計文件**: `docs/guides/PHASE_X_WORLDBUILDING.md`（待建立）

**背景**: 把整個系統的使用方向翻轉——從「輸入文本 → 分析理解」變成「輸入設定碎片 → 系統幫你結構化、補全、檢查一致性」。用戶不需要完整小說文本，可以自定義角色卡、地點描述、事件設定，系統自動建構 KG、檢查邏輯、並提供 Role Agent 和 What-If 功能。

**所需資料**:
- 用戶輸入的設定素材（新輸入來源，非 PDF）

**開發方法**:
- 輸入模式：自由文本（設定片段）或結構化表單（角色卡 / 地點卡 / 事件卡）
- 走相同的 ingestion pipeline，來源從 PDF 換成用戶輸入文字
- 邏輯驗證器（核心）：KG 建好後，用圖查詢做：
  - 時間線一致性：事件的因果前提是否在時間上已成立
  - 能力邊界一致性：角色的能力或知識是否有未解釋的突變
  - 地理邏輯：涉及移動的事件時間是否合理（需有地點間距離設定）

**內容**:
- 前端：新增「創作工作坊」模式入口（與閱讀模式平行的使用路徑）
- `src/pipelines/worldbuilding_ingestion.py`：接受結構化設定素材，走改版的 ingestion pipeline
- `src/services/consistency_checker.py`：邏輯一致性圖查詢
- `src/domain/worldbuilding.py`：`CharacterCard`、`LocationCard`、`EventSetting` models
- API 端點：
  - `POST /worldbuilding` — 建立世界觀專案
  - `POST /worldbuilding/:projectId/entities` — 新增角色 / 地點設定
  - `POST /worldbuilding/:projectId/events` — 新增事件設定
  - `GET /worldbuilding/:projectId/consistency-check` — 執行邏輯驗證，返回矛盾列表

**前置依賴**: F-05（What-If）、F-13（Role Agent）、F-09（張力追蹤，可選）

---

### 加分項

#### F-01 隱性關係推論（見 Wave 1 F-01）

---

---

## I 系列（多語系 / i18n）

**目標**: 前端支援繁體中文（zh-TW）與英文（en），後續語系按需新增。
**技術選型**: `react-i18next` + `i18next`（React 生態主流方案）
**字串規模**: 約 380–420 個不重複字串，分布在 33 個元件 / 頁面中

### 執行策略

```
I-01 (基礎設置) → I-02 (共用字串) → I-03..I-08 (頁面逐批遷移) → I-09 (框架索引)
```

FrameworksPage（I-09）獨立最後處理，因含 140+ 靜態內容字串（原型名稱、描述），需評估是否用 JSON content 檔而非一般 translation key。

---

### I-08：其餘頁面（settings.json + chat.json）

**工作量**: ~2 小時
**涉及元件**: `pages/SettingsPage.tsx`、`pages/TokenUsagePage.tsx`、`pages/SymbolsPage.tsx`、`pages/UnravelingPage.tsx`、`components/chat/ChatWindow.tsx`
**預估字串數**: ~75 個
**代表字串（設定）**: 系統設定、知識圖譜後端、目前後端、已連線、未連線、實體、關係、切換查詢後端、NetworkX、Neo4j、資料遷移、遷移中…
**代表字串（Token）**: Token 用量、今天、7 天、30 天、全部、Prompt Tokens、Completion Tokens、服務別用量、每日趨勢
**代表字串（意象）**: 物件、自然、空間、身體、色彩、全部、搜尋意象…、尚無意象資料、章節分布、共現意象
**代表字串（Chat）**: StorySphere Chat、新對話、開啟新對話？目前的對話紀錄將會清除。、思考中…

---

### I-09：框架索引頁（frameworks.json）⚠️ 特殊處理

**工作量**: ~3 小時
**涉及元件**: `pages/FrameworksPage.tsx`
**預估字串數**: 142+ 個（最大單頁）
**特殊說明**: 大量靜態內容字串（Jung/Schmidt 原型名稱 + 描述、英雄旅程各階段、Frye/Booker 框架文字）。建議兩層處理：
1. UI 骨架字串（標題、Tab 名稱、按鈕）→ 走一般 `t('key')` 路徑
2. 原型內容資料（名稱 + 描述文字）→ 評估從後端 `src/config/archetypes.py` 的 JSON 直接提供多語系版本，前端以 API 取得，而非存在前端翻譯檔中

**代表字串**: Jung 原型（天真者、孤兒、英雄…×12）、Schmidt 類型（×45）、英雄旅程階段（×12）、Frye 四季神話（×4）、Booker 七種情節（×7）、SEP 步驟（×7）

---

## 📋 狀態追蹤

### B 系列

| ID | 項目 | 優先 | 狀態 |
|----|------|------|------|
| B-011 | 生產環境配置 | 🟢 低 | 待開始 |
| B-014 | Local LLM 選型評估 | 🟡 中 | 進行中 |

### F 系列

| ID | 項目 | Wave | 前置依賴 | 狀態 |
|----|------|------|----------|------|
| F-01 | 隱性關係推論（Link Prediction） | 加分項 | — | 待開始 |
| F-02 | 進度感知 KG（章節快照） | Wave 1 | B-023 migration | 待開始 |
| F-03 | 角色認識論狀態 | Wave 1 | F-02 | 待開始 |
| F-04 | 角色聲音指紋 | Wave 1 | — | 待開始 |
| F-05 | What-If 情境推演 | Wave 3 | F-02、F-03 | 待開始 |
| F-06 | 敘事節奏分析器 | Wave 2 | B-023、B-033 | 待開始 |
| F-07 | 主題共鳴地圖 | Wave 3 | Vector embeddings | 待開始 |
| F-08 | 伏筆偵測器 | Wave 2 | B-023、B-033 | 待開始 |
| F-09 | 未解決張力追蹤器 | Wave 4 | B-026、B-027 | 待開始 |
| F-10 | 敘事視角分析 | Wave 3 | F-03 | 待開始 |
| F-11 | 角色命運相似度 | Wave 4 | CEP | 待開始 |
| F-12 | 閱讀記憶外化系統 | Wave 2 | F-02 | 待開始 |
| F-13 | Role Agent 系統 | Wave 4 | F-02、F-03、F-04 | 待開始 |
| F-14 | 生圖整合 | Wave 4 | CEP | 待開始 |
| F-15 | 世界觀建構完整系統 | Wave 5 | F-05、F-13 | 待開始 |

---

### I 系列

| ID | 項目 | 字串數 | 工作量 | 狀態 |
|----|------|--------|--------|------|
| I-01 | 基礎設置（react-i18next + 語言切換） | — | ~2h | ✅ 完成 |
| I-02 | 共用字串（common.json） | ~20 | ~1h | ✅ 完成 |
| I-03 | 導覽 & 書庫（nav.json + library.json） | ~45 | ~1.5h | ✅ 完成 |
| I-04 | 上傳 & 處理（upload.json） | ~25 | ~1h | ✅ 完成 |
| I-05 | 深度分析（analysis.json） | ~60 | ~2h | ✅ 完成 |
| I-06 | 張力 & 時間軸（analysis.json） | ~55 | ~2h | ✅ 完成 |
| I-07 | 圖譜 & 閱讀器（graph.json + reader.json） | ~35 | ~1.5h | ✅ 完成 |
| I-08 | 其餘頁面（settings.json + chat.json） | ~75 | ~2h | ✅ 完成 |
| I-09 | 框架索引頁（frameworks.json，特殊處理） | ~142+ | ~3h | 待開始 |

**總計**: 約 380–420 個字串，估計 ~14–16 小時工作量

---

**維護者**: William
**最後更新**: 2026-04-24（I-08 完成）
