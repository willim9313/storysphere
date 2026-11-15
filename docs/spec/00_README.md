> **⚠️ 原型草案（2026-11-15）**：本資料夾只服務 prototype（通用層＋推理縱切片），之後可能整個打掉。與 `StorySphere分析契約v2/`、`neo-storysphere-agent-architecture/` 衝突時以那兩份為準；標「原型決定」的項目是為了開工先定的，正式版要再確認。

# prototype v0 規格草案

補齊「拿契約 v2 與 Agent 整合架構去實作」時缺的規格，範圍只到能做出原型：**通用層＋推理一個題材**，加一個檢視後端成果、可接 agent 大腦的簡易 UI。

依據：契約 v2 四份文件、Agent 整合架構設計，以及既有 storysphere repo（GitHub `main`，2026-10-24 的版本）。既有程式碼的對照都寫了路徑，實作時直接去看。

## 檔案

| 檔案 | 補的缺口 | 內容 |
| --- | --- | --- |
| `01_證據格式與儲存.md` | 證據欄位、儲存 | SQLite 外殼表＋內容表；33 種證據的欄位；層級、取代、依據已變動；筆記規則 |
| `02_入庫流程.md` | 入庫規格 | 抽取單位、S1–S5 每步的輸入輸出、斷點續跑、prompt 清單 |
| `03_方法宣告.md` | 方法宣告 | registry 格式與檢查；20 個方法的宣告與對應既有實作；預設結果卡 |
| `04_API.md` | 給前端的 API | REST、SSE、Agent Gateway、MCP 工具 |
| `05_原型UI與大腦接法.md` | 原型前端 | 9 個畫面、view 目錄、deepagents 與 Claude Code 接法 |
| `06_新專案CLAUDE.md` | 開發紀律 | 新 repo 的 `CLAUDE.md`：checkpoint、紅線、閘門、規格同步 |
| `07_任務清單.md` | 任務切分 | 28 張任務，每張寫依據與完成標準 |
| `08_prompts/`、`08_config/` | prompt 本體 | 入庫 6 份、P0 方法 13 份；Knox／Van Dine 規則摘要 |
| `09_驗收清單.md` | 驗收標準 | 《四簽名》跑完應該看到什麼（使用者已確認） |
| `10_給Fable的驅動prompt.md` | 交接 | 開工、執行任務、人工檢查、回報衝突四段 prompt |

閱讀順序：01 → 02 → 03 → 05 → 04；開工看 06 → 07；做到入庫與方法時對照 08、09。

## 範圍

| 項目 | 原型包含 | 不包含 |
| --- | --- | --- |
| 題材 | 推理（資訊控制機制） | 其他 9 個題材；它們的訊號照標，但只顯示為推薦 |
| 方法 | 通用 15＋推理 5（含 TM3、MY2 兩個內建方法論）；其中 13 個 P0 必做 | 其他 39 個 |
| 證據 | 契約 31 種＋筆記、詮釋 | 契約其他 64 種 |
| 大腦 | 無大腦、deepagents（Gemini）、Claude Code（ACP） | Codex、vendor SDK（除非 ACP spike 不通） |
| 儲存 | 單一 SQLite | Neo4j、Qdrant |
| 介面 | 繁中、桌面、兩套主題（Warm／Ink） | 英文、i18n、既有九個書籍頁 |

## 與既有 storysphere 的關係

| 沿用 | 改寫（輸出改成新證據格式） | 不沿用 |
| --- | --- | --- |
| 文件處理（loader、章節偵測、切段）、語言偵測、章節審閱 HITL、EntityLinker、ParagraphEntityLinker、意象分群、JSON fallback、retry、錯誤分類、兩套主題 token、前端技術棧與型別產生 | 抽取 prompt、因果與 kernel/satellite、角色弧線與原型、語音、派系、認知狀態、敘事時間、英雄旅程、張力（TEU → opposition）、象徵（SEP → symbol_reading） | TEU／EEP／CEP／SEP 的舊資料、九個分散的資料檔、章節摘要步驟、Neo4j 切換 |

## 決策同步

本次確認、或為了原型先定下的決策。右欄是原文件中需要改的地方（原文件以線上版為準，這裡只列，不改）。

| # | 決策 | 原文件要改的地方 |
| --- | --- | --- |
| 1 | **筆記＝第 2 層以上、經人審核的產物**。agent 的 `create_note` 只產生草稿，使用者確認才寫入 | 架構文件「待決問題」第 1 項可結案；契約 v2「分析結果與筆記」表的「誰決定：使用者，或使用者授權的 agent」改成必經人審核 |
| 2 | **既有 LangGraph／service 一定要改**，因為輸出改成新證據格式；能沿用的是演算法與 prompt 思路 | 架構文件「與現有 LangGraph pipeline 的關係」說「既有的 LangGraph 模組幾乎不用改」，要改寫 |
| 3 | **證據庫＝外殼表＋內容表，放 SQLite**；Neo4j 留給資料量大、需要知識圖譜後端時 | 契約 v2 待決問題第 2 項結案；白板與架構圖的 Evidence Store 標成 Neo4j，要改 |
| 4 | 原型就接 Claude Code（ACP），不等階段二 | 架構文件「v1 只做 deepagents，ACP 第二階段加入」，原型例外 |
| 5 | 英雄旅程用 Vogler 12 階段 | 既有 repo `config/hero_journey/` 標的是 Campbell，要改內容 |
| 6 | 證據 `source` 多一個 `agent`，規則同 `user` | 契約 v2 外殼欄位 `source` 只列抽取、方法、使用者 |
| 7 | 不做章節摘要 | 無（新契約本來就沒有） |
| 8 | 原型的開發者檢視可以看第 1 層證據 | 契約 v2 決策 #8 不變；只在原型例外 |
| 9 | NS1 讀 `archetype` 改成選填輸入（有就參考，沒有照跑） | 契約 v2 兩處互相矛盾：證據路徑圖讓 NS1 讀 `archetype`，注意事項又說原型這類對照框架不能當前提。正式版要二擇一 |
| 10 | 筆記的 `source`：結果卡存的＝method，agent 草稿存的＝agent | 契約 v2 外殼欄位 |

## 建議的開工順序

每一步都用 `storysphere_benchmark/texts_zh/01_推理_四簽名_柯南道爾_1890_繁中譯.txt` 驗證。

1. 儲存層與 registry：01 的資料表、Pydantic models、registry 載入與檢查（03 §2）。
2. 入庫前半：P1、章節審閱、S1、S2。先看第 1 層證據的品質，不急著往下。
3. 入庫後半：S3、S4。
4. P0 方法 13 個，依 DAG 順序。
5. REST、SSE、MCP server（04）。
6. 原型 UI（05），先做無大腦模式。
7. 大腦：deepagents → Claude Code（先做 ACP spike）。
8. 驗收：05 §1 的三個成功條件。

既有 repo 的 `CLAUDE.md` 紀律（動手前 checkpoint、六道閘門、文件同步）建議新專案一起帶過去。

## 還沒寫的

做到那一步前要補，現在不擋開工：

| 項目 | 何時需要 | 對應任務 |
| --- | --- | --- |
| 其餘 8 種 view 的規格（causal_graph、character_arc、network、tension_lines、theme_card、symbol_trend、label_card、stage_strip） | UI 第二批之前 | T24 |
| Agent 的兩份 skill（`event-analysis`、`mystery-fair-play`） | 接大腦之前 | T25 |
| P1 方法的 prompt 與分類表（MY3 的江戸川亂步、Carr 密室、MY2 的謎題類型、NS1 的 Vogler 12 階段） | 做 P1 時 | — |
| 舊 repo 的逐檔沿用清單 | 開工時由實作者在各任務的 checkpoint 列出 | T07、T10、T14–T17 |

