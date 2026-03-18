# API 人工驗測指南

用真實 PDF 驗證後端各 API 輸出品質，不需啟動前端。

---

## 前提

- 後端已可正常啟動（`uvicorn src.api.main:app --reload`）
- 環境已安裝 `httpx`（`uv sync` 後即有）
- 手邊有一份 PDF 書籍檔案

---

## 執行腳本

```bash
# 啟動後端（另開 terminal）
uvicorn src.api.main:app --reload

# 跑探索腳本
python scripts/explore_api.py path/to/book.pdf
```

腳本流程：
1. POST `/ingest/` 上傳 PDF
2. 輪詢 `/tasks/:taskId/status` 等待處理完成
3. 逐一打所有主要 GET API
4. 把每個 API 的回傳結果存成 JSON 檔

---

## 輸出結果

跑完後會在 `output/<book_id>/` 產生以下檔案：

| 檔案 | 對應 API | 看什麼 |
|---|---|---|
| `book_meta.json` | `GET /books/:id` | 書籍摘要、統計數字是否合理 |
| `chapters.json` | `GET /books/:id/chapters` | 章節切分與摘要品質 |
| `chapter_1_chunks.json` | `GET /books/:id/chapters/:cid/chunks` | 實體標記是否正確框到人名/地名 |
| `entities.json` | `GET /books/:id/entities` | 有無重複或抓錯的實體 |
| `relations.json` | `GET /books/:id/relations` | 關係是否合理 |
| `graph.json` | `GET /books/:id/graph` | 節點與邊的數量、結構 |
| `analysis_characters.json` | `GET /books/:id/analysis/characters` | 角色分析清單（需先觸發分析）|
| `analysis_events.json` | `GET /books/:id/analysis/events` | 事件分析清單（需先觸發分析）|
| `search_sample.json` | `POST /search` | 語意搜尋結果相關性 |

---

## 品質檢查重點

**`book_meta.json`**
- `summary` 非空且合理概括內容
- `entityCount` / `chapterCount` 符合書籍規模

**`chapters.json`**
- 章節數量正確
- 每章 `summary` 有實質內容（非空白或重複）

**`chapter_1_chunks.json`**
- `segments` 中的實體標記有正確框到人名、地名、概念
- `keywords` 與章節內容相關

**`entities.json`**
- 無明顯重複（如「林小明」和「小明」被視為同一人）
- 實體類型分類正確（CHARACTER / LOCATION / CONCEPT）

**`graph.json`**
- nodes 與 edges 有合理比例
- 主要角色都有出現在節點中

---

## 腳本原始碼

[scripts/explore_api.py](../../scripts/explore_api.py)
