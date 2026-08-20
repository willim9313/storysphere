# 意象出現位置的段落定位（B-079 根因與修法）

**日期**: 2026-08-20
**狀態**: 規劃（尚未實作）
**範圍**: `backend/storysphere/pipelines/symbol_discovery/pipeline.py`
**Backlog**: B-079（2026-08-10 開立，本文件補上根因）

> 本文是規劃當下的評估快照，實作後凍結。與現況衝突時以程式碼為準。

---

## 1. B-079 原記的症狀，以及它記漏的部分

原條目記「18% 的 occurrence 指向不含該詞的段落」，並列出兩個待釐清的候選：
`paragraph_id` 對應錯，或 `assemble_sep` 的查表落空後靜默填了別的段落。

**兩個都不是。** 真正的位置在抽取端，不在組裝端。全 142 筆 occurrence 實測：

| 指標 | 數字 |
|---|---|
| `paragraph_id` 查無此段 | **0** —— 段落都存在，不是查表落空 |
| `term` 不在 `paragraph_text` | **28 / 142 = 19.7%** |
| `term` 也不在 `context_window` | 25 |
| 兩者皆不含（完全對不上） | 17 |
| `occurrence.chapter_number` 與段落實際章號不符 | **0 / 142** —— 章號永遠是對的 |

最後一列是關鍵線索：**章號全對、段落錯了五分之一**，指向「章是迴圈給的、段是算出來的」。

---

## 2. 根因

`pipelines/symbol_discovery/pipeline.py:159`：

```python
@staticmethod
def _find_paragraph_id(chapter, context_sentence: str) -> str:
    """Return the id of the paragraph most likely containing the context."""
    if not context_sentence:
        return chapter.paragraphs[0].id if chapter.paragraphs else ""
    snippet = context_sentence[:80]
    for para in chapter.paragraphs:
        if snippet in para.text:
            return para.id
    return chapter.paragraphs[0].id if chapter.paragraphs else ""   # ← 靜默退回第一段
```

`_find_position`（`:169`）是同一套邏輯，失敗退回 `0`。

兩層失效相乘：

1. **`context_sentence` 是 LLM 生成的**（`imagery_extractor.py:40` 的 prompt 要求
   `{"term": ..., "context_sentence": ...}`），沒有任何機制要求它逐字引用原文。
   142 筆裡有 25 筆的 `context_window` 連 `term` 本身都不含 —— 模型在轉述，不是引用。
2. **比對失敗不報錯，靜默退回該章第一段。** 不是回 `""`、不是 log warning，是回一個
   *看起來完全合法* 的段落 id。

資料完全吻合：

| 訊號 | 觀測 | 解釋 |
|---|---|---|
| `context_window[:80]` 在該段落找不到 | **22 / 142 = 15.5%** | 這些當初就走了 fallback 分支 |
| 對不上的 28 筆只有 19 個相異 `paragraph_id` | 9 筆共用 | 不同意象一起掉進同一個「第一段」 |
| 章號正確率 | 28 / 28 | 章號來自 `_extract_all_chapters` 的迴圈變數，不經比對 |

一個典型案例：`古玉`（ch3）、`古玉`（ch4）、`長江`（ch4）三筆的段落文字都是
「漫天星斗、月華斜照。在黯淡的月色下…」—— 該章第一段，與三個詞都無關。

**這就是為什麼「戒指」的詮釋會回「『戒指』在此後記中並未出現」** —— 模型是誠實的，
它拿到的證據確實不含該詞。

---

## 3. 影響

`occurrence_contexts` 是送進 symbol interpretation LLM 的**證據本體**
（`symbol_analysis_service._build_prompt()` 取 `sep.occurrence_contexts[:20]`）。
約五分之一的引文與該意象無關。

與 B-074（前置頁污染，2026-08-10 已修）是不同層次的問題：那是「不該送的送了」，
這是「送的內容根本對應錯」。B-074 修好之後這條仍然成立。

---

## 4. 查證出的事實

### 4.1 改用「詞」定位的可行性（實測 142 筆）

對每一筆 occurrence，掃該書該章的所有段落，看有幾段含 `term`：

| 情況 | 筆數 | 佔比 |
|---|---|---|
| **唯一**段落含該詞 → 可直接定位，無歧義 | **83** | 58.5% |
| 多段含該詞 → 需 tiebreaker | 44 | 31.0% |
| 本體找不到、但**別名**找得到 | 14 | 9.9% |
| 全章無任何段落含該詞或別名 | **1** | 0.7% |

正確率可從現行的 **80.3%（114/142）** 提到 **99.3%（141/142）**。

唯一真正定位不了的是「礁石」（ch9, 8f18dd59）—— 全章找不到這兩個字，是模型憑空生成的
出現位置。這種**應該被丟棄或明確標記，不該編一個段落給它**。

### 4.2 `aliases` 是現成的

`ImageryEntity.aliases`（`domain/imagery.py`）由 `cluster_synonyms()` 產生並已存入
`imagery_entities.aliases_json`。上表第三列的 14 筆就是靠它救回來的，不需要新資料。

**但有順序問題**：occurrence 是在 `build_imagery_entities()`（`imagery_extractor.py:243`）
裡建的，那時 cluster 已經算完，`canonical` 與 `variants` 都拿得到。而
`_find_paragraph_id` 目前是在**更早的** `_extract_all_chapters()`（`pipeline.py:115`）
呼叫的，那時還沒有 cluster。這是本次唯一的結構調整點，見 §5 Task 2。

### 4.3 順帶發現：`co_occurring_terms` 是個永遠空的欄位

`_find_co_occurring`（`pipeline.py:181`）無條件 `return []`，註解說真正的共現分析由
`SymbolGraphService` on demand 做。但這個空值一路流到
`api/schemas/symbols.py:48` 的 `co_occurring_terms` 送給前端 —— DB 裡 **142/142 筆都是 `[]`**。

不在本計畫的修復範圍（它不影響證據正確性），但既然這次要動同一個檔案的相鄰函式，
在 §5 記為一個明確的**待裁決**項，避免下次又被當成新發現重查一遍。

---

## 5. 做法

### Task 1｜定位策略換成「詞優先、句子作 tiebreaker」

`_find_paragraph_id` 與 `_find_position` 合併成一個回傳 `(paragraph_id, position)` 的
函式（兩者永遠一起用、且必須指向同一段，分開寫等於留一個能不一致的縫）。策略：

1. 候選 = 該章中含 `term` 的段落；為空則改用含任一 `alias` 的段落
2. 候選恰好一個 → 用它
3. 候選多於一個 → 用 `context_sentence` 在候選之間挑（沿用現行的 `[:80]` 子字串比對）；
   仍分不出來 → 取**最前面**的候選
4. 候選為空 → **回 `None`，不退回第一段**

### Task 2｜把定位移到 cluster 之後

為了讓 Task 1 的第 1 步拿得到 alias，段落定位必須從 `_extract_all_chapters()` 移到
`build_imagery_entities()` 建 `SymbolOccurrence` 的地方。

**這是本計畫唯一的結構改動**，也是風險最高的一步：`_extract_all_chapters` 目前把
`paragraph_id` / `position` / `co_occurring_terms` 三個欄位塞進 `item` dict 後傳下去，
搬動後 `build_imagery_entities` 需要拿得到 `chapter.paragraphs`。

需在實作時決定介面（傳 `doc`、傳 chapter map、或回一個 callable），**先寫測試釘住
現行行為再搬**。這一步單獨一個 commit，與 Task 1 分開。

### Task 3｜候選為空時的處置

Task 1 第 4 步回 `None` 之後，`build_imagery_entities` 要決定怎麼辦。兩個選項：

| 選項 | 效果 | 代價 |
|---|---|---|
| **A. 丟棄該 occurrence** | 證據集乾淨，`frequency` 少算 | 意象的出現次數會變低（實測影響 1 筆） |
| **B. 保留但 `paragraph_id=""`** | 次數不變，組裝端可辨識 | `assemble_sep` 與前端都要處理空值 |

**裁示結果（2026-08-20）：選項 A —— 丟棄該 occurrence。**

實測只影響 1/142，而 B 要為 0.7% 的案例在 `assemble_sep` 與前端各加一個分支。
接受 `frequency` 的語意改變：從「LLM 說出現幾次」變成「**定位得到幾次**」。

這個語意改變要寫進 `_find_anchor` 與 `build_imagery_entities` 的 docstring ——
否則日後有人比對 `frequency` 與 `len(occurrences)` 對不上時，會以為是 bug。

### Task 4｜健全性 log

定位失敗（候選為空）與走到 tiebreaker 都各 log 一行 `warning` / `debug`，
讓下次再有漂移時看得見，不必再從 DB 反推。

### 待裁決（不在本次範圍，但需要一個決定）

`co_occurring_terms` 永遠是 `[]`（§4.3）：**填它**（在 `_find_co_occurring` 真的實作，
或改由 `SymbolGraphService` 在讀取時填）還是**從 API schema 拿掉**。
兩者都不影響本計畫，但拖著就是一個對前端說謊的欄位。

---

## 6. 既有資料

本計畫**不寫遷移腳本**。`symbol_occurrences` 是 pipeline 產物，重跑
`POST /books/{id}/rerun/symbol-discovery` 就會重建（該 pipeline 開頭有
`delete_by_book()`，是 re-ingest safe 的 —— 與
`20260820-kg-rerun-idempotency.md` 所描述的 KG 情況正好相反）。

但**重跑會重新呼叫 LLM**，因此已生成的 symbol interpretation 需要一併失效
（`sep:{book}:%`、`symbol_analysis:{book}:%` 已在 `cache_invalidation.py:60`
的 `symbol-discovery` 條目內，這條路是通的）。

---

## 7. 回滾

Task 1、3、4 都在單一檔案內，revert 即回到現況。Task 2 動到函式間的資料流，
若要回滾需連 Task 1 一起 revert —— 因此兩者**必須是相鄰的兩個 commit，且不與其他改動交錯**。

---

## 8. 文件同步

- 無 endpoint 異動 → `docs/API_CONTRACT.md` 不需更新（除非 §5 待裁決項決定拿掉
  `co_occurring_terms`，那會是 response schema 異動，屆時必須更新）
- 前端零改動
- `docs/BACKLOG.md` 的 B-079 需改寫「待辦內容」段 —— 原本列的兩個候選根因都已排除
