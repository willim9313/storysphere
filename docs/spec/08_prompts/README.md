> **⚠️ 原型草案（2026-11-15）**：本資料夾只服務 prototype（通用層＋推理縱切片），之後可能整個打掉。與 `StorySphere分析契約v2/`、`neo-storysphere-agent-architecture/` 衝突時以那兩份為準；標「原型決定」的項目是為了開工先定的，正式版要再確認。

# 08 Prompt 本體

入庫 6 份、P0 方法 13 份。開工時整個資料夾複製到 repo 的 `prompts/`（`ingest/`、`methods/` 結構不變）。規則設定檔在同層的 `08_config/`，複製到 repo 的 `config/`。

## 檔案格式

每份 prompt 是一個 markdown 檔，載入器**只讀三節**，其他內容（包括最上面這種註記）都忽略：

| 節 | 內容 |
| --- | --- |
| `## meta` | 一個 yaml code block：`id`、`version`、`task`（`llm_for` 用的 task 名）、`inputs`（模板變數）、`output`（對應的證據類型或 02 的輸出形狀） |
| `## system` | system prompt 全文 |
| `## user` | user 訊息模板，變數寫成 `{{name}}` |

- 模板只做字串代換，不支援條件或迴圈；要組的清單由程式先組好再填進去。
- `version` 寫進 `runs.prompt_version`；改任何一個字都要 +1（`CLAUDE.md` 紅線）。
- 所有 prompt 都要求「只回 JSON」。解析沿用舊 repo 的 4 步 fallback（`core/utils/output_extractor.py`）。

## 共用約定

這些約定寫在每份 prompt 裡，程式也要照著檢查：

- **語言**：prompt 是英文；描述類欄位用 `{{language_name}}` 輸出；`quote` 一律保留原文、逐字照抄。
- **引文**：`quote` 必須是輸入段落的連續子字串，長度 ≤ 120 字元，不得改寫、不得加刪節號。程式會驗證（01 §3）。
- **id**：方法的輸入證據都帶 `id`，輸出只能引用輸入裡出現過的 id；`derived_from` 不得為空。
- **不產出**：證據不足時回 `{"items": [], "abstain_reason": "…"}`，不要硬給低品質結果（產品原則「訊號不可靠時不產出」）。
- **信心**：每筆輸出帶 `confidence`（0–1），反映證據多寡與一致性，不是模型的自信程度。

## 給方法的輸入格式

程式把證據壓成一行一筆的 JSON（JSON Lines），只放方法需要的欄位：

```
{"id":"ev_12","type":"event","chapter":5,"text_rank":31,"title":"…","summary":"…","participants":["ch_3","ch_7"],"visibility":"secret"}
{"id":"ch_3","type":"character","name":"…","aliases":["…"],"mention_count":88}
```

各 prompt 的 `inputs` 寫明要放哪些類型與欄位。

## 對照舊 repo

| 新 prompt | 改寫自舊 repo |
| --- | --- |
| `ingest/core_extraction.md` | `services/extraction_service.py` 的 `_ENTITY_SYSTEM_PROMPT`＋`_RELATION_SYSTEM_PROMPT` |
| `ingest/signal_tagging.md` | 意象段落沿用 `services/imagery_extractor.py` 的 `_IMAGERY_EXTRACTION_SYSTEM_PROMPT` |
| `methods/EV1.md` | `services/narrative_service.py` 的 `_REFINE_SYSTEM_PROMPT` |
| `methods/EV2.md` | `services/analysis_service.py` 的 `_CAUSALITY_SYSTEM_PROMPT` |
| `methods/CH2.md` | `services/analysis_service.py` 的 `_ARC_SYSTEM_PROMPT` |
| `methods/CH5.md` | `services/epistemic_state_service.py` 的 `_MISBELIEFS_SYSTEM_PROMPT` |
| `methods/NS2.md` | `services/narrative_service.py` 的 `_TEMPORAL_ORDER_SYSTEM_PROMPT` |
| `methods/TM1.md`、`TM2.md`、`TM3.md` | `services/tension_service.py` 的 `_TEU_`、`_GROUPING_`、`_THEME_SYSTEM_PROMPT` |
| `methods/SY1.md` | `services/symbol_analysis_service.py` 的 `_SYMBOL_SYSTEM_PROMPT` |
| 其餘 | 新寫 |

CH4 是純圖運算，只有一份選用的「派系命名」prompt；MY5 以演算法為主，prompt 只處理「排除嫌疑」的判斷。
