# 章節審閱功能實作規劃

**日期**: 2026-05-08  
**功能**: 上傳流程中插入章節切分審閱暫停點  
**路由**: `/upload/review/:bookId`

---

## 1. 核心機制

Ingestion pipeline 在步驟 1（PDF 解析 + 章節切分）完成、書進庫後，設置 `asyncio.Event` 暫停執行，並將 task 狀態改為 `awaiting_review`。前端偵測到此狀態後跳轉至審閱頁。用戶確認後 POST 修正的章節結構，後端觸發 Event、重組章節，繼續步驟 2+（特徵提取、KG、摘要等）。

**不採用 LangGraph HIL** — 現有架構是純 asyncio，`asyncio.Event` 足夠，引入 LangGraph 過重。重啟後 Event 消失的問題可接受（審閱是上傳同 session 內的同步行為，用戶不會在中間重啟服務）。

**確認決策（2026-05-08）**:
- `IngestionWorkflow.run()` 新增 `task_id: str` 參數，讓 workflow 能自行設定 `awaiting_review`
- ProcessingCard **不自動跳轉**，改為顯示兩個按鈕（見第 8 節）
- POST /review 後停留在審閱頁，polling task 直到 pipeline 完成（見第 8 節）

---

## 2. title_span 實作方案（方向 A）

目前 `chapter_detector.py` 偵測到標題行後**丟棄**（不加入 segments）。方向 A 在 `pipeline.py` 的 chunk 步驟前，把 `span.title` 前綴拼回第一個 segment，chunker 完成後再從第一個 paragraph 反查 `title_span`：

```python
# pipeline.py — Step 3 改動
for span in spans:
    segments = span.segments
    if span.title and segments:
        first_idx, first_text = segments[0]
        prefixed = span.title + "\n" + first_text
        segments = [(first_idx, prefixed)] + list(segments[1:])
    paragraphs = chunk_segments(segments, chapter_number=span.chapter_number)
    # 回查 title_span
    if span.title and paragraphs and paragraphs[0].text.startswith(span.title):
        paragraphs[0] = paragraphs[0].model_copy(
            update={"title_span": (0, len(span.title))}
        )
```

風險：若 `span.title`（通常 ≤ 80 chars）+ 第一段正文合計 < MIN_CHARS=50，chunker 不會拆開，title 和正文融合在同一 paragraph — 這正是我們要的。若超過 MAX_CHARS=1200，chunker 可能在 title 之後斷行，此時第一個 paragraph 仍然以 title 開頭，`title_span` 依然有效。

---

## 3. paragraph_index 全書索引

DB 存的是章節內 `position`（0-indexed per chapter）。`GET /review-data` 需要全書連續索引，在 endpoint 內用累加計數器重建：

```python
global_idx = 0
for chapter in document.chapters:
    for para in chapter.paragraphs:
        # para.paragraph_index = global_idx
        global_idx += 1
```

`POST /review` 的 `start_paragraph_index` 逆向換算：先把所有 paragraphs 按 `(chapter_number, position)` 排列成全書平面陣列，找到 `global_idx` 對應的 `(chapter_number, position)`。

---

## 4. 需修改 / 新增的檔案

### 後端

| 檔案 | 類型 | 改動摘要 |
|------|------|---------|
| `src/domain/documents.py` | 修改 | `Paragraph` 新增 `title_span: tuple[int, int] \| None = None` |
| `src/api/schemas/common.py` | 修改 | `TaskStatus.status` Literal 加入 `"awaiting_review"` |
| `src/api/store.py` | 修改 | `MemoryTaskStore` / `SQLiteTaskStore` 新增 `set_awaiting_review()`；cleanup SQL 排除此狀態 |
| `src/api/review_registry.py` | **新增** | `asyncio.Event` registry，管理 pause/resume + reviewed chapters 傳遞 |
| `src/pipelines/document_processing/pipeline.py` | 修改 | Step 3 前拼接 title；chunker 後設 `title_span` |
| `src/services/document_service.py` | 修改 | `_ParagraphRow` 新增 `title_span_json` 欄位（migration）；新增 `get_review_data()`；新增 `replace_chapters()` |
| `src/workflows/ingestion.py` | 修改 | Step 1b 存檔後插入 `await review_registry.wait(book_id)`；收到 reviewed chapters 後重組 `doc.chapters`；繼續步驟 2+ |
| `src/api/schemas/books.py` | 修改 | 新增 `ReviewDataResponse`、`ReviewParagraphResponse`、`ReviewChapterInput`、`ReviewSubmitRequest` |
| `src/api/routers/books.py` | 修改 | 新增 `GET /{book_id}/review-data`（僅 `awaiting_review` 狀態可存取）；新增 `POST /{book_id}/review` |

### 前端

| 檔案 | 類型 | 改動摘要 |
|------|------|---------|
| `frontend/src/api/types.ts` | 修改 | 新增 `ReviewData`、`ReviewChapter`、`ReviewParagraph`、`ReviewSubmitChapter` 型別；`TaskStatus.status` 加入 `"awaiting_review"` |
| `frontend/src/api/ingest.ts` | 修改 | 新增 `fetchReviewData(bookId)`、`submitReview(bookId, chapters)` |
| `frontend/src/hooks/useTaskPolling.ts` | 修改 | `refetchInterval` 停止條件加入 `"awaiting_review"` |
| `frontend/src/components/upload/ProcessingCard.tsx` | 修改 | `awaiting_review` 時顯示「接受」/ 「開始審閱」按鈕；「接受」呼叫 `GET /review-data` 再 `POST /review`；「開始審閱」為 `Link to=/upload/review/:bookId?taskId=xxx` |
| `frontend/src/router.tsx` | 修改 | 新增 `/upload/review/:bookId` 路由 |
| `frontend/src/pages/upload/ChapterReviewPage.tsx` | **新增** | `useParams(bookId)` + `useSearchParams(taskId)`；reviewing → submitting → pipeline_running → done 四段狀態；pipeline_running 複用 `ProcessingTimeline` |
| `frontend/src/components/review/ChapterList.tsx` | **新增** | 左欄元件：章節列表、狀態圓點、無標題 badge |
| `frontend/src/components/review/ParagraphCard.tsx` | **新增** | 右欄段落卡片：收合/展開、title_span highlight、切分按鈕 |
| `frontend/src/components/review/SearchBar.tsx` | **新增** | 右欄頂部搜尋工具列 |

---

## 5. API Contract（新增端點）

### GET /api/v1/books/:bookId/review-data

僅在 book 對應的 task 狀態為 `awaiting_review` 時可存取，否則 409。

```json
{
  "chapters": [
    {
      "chapterIdx": 0,
      "title": "前言",
      "paragraphs": [
        {
          "paragraphIndex": 0,
          "text": "前言\n那是1967年的秋天...",
          "titleSpan": [0, 2],
          "sentences": ["那是1967年的秋天...", "她的父親..."]
        }
      ]
    }
  ]
}
```

- `titleSpan`: `null` 代表此段落無標題
- `sentences`: 後端以 `chunker._SENTENCE_END` regex 重新切分（複用現有邏輯）
- `paragraphIndex`: 全書連續索引（0, 1, 2...）

### POST /api/v1/books/:bookId/review

```json
{
  "chapters": [
    { "title": "前言", "startParagraphIndex": 0 },
    { "title": "第一章 紅岸", "startParagraphIndex": 3 }
  ]
}
```

- `title` 空字串 → 後端儲存為 `None`（未命名章節）
- 成功後 task 狀態回到 `"running"`，pipeline 繼續
- 回傳 `204 No Content`

---

## 6. review_registry.py 設計

```python
# src/api/review_registry.py
import asyncio
from typing import Any

_events: dict[str, asyncio.Event] = {}
_results: dict[str, Any] = {}

def register(book_id: str) -> asyncio.Event:
    event = asyncio.Event()
    _events[book_id] = event
    return event

async def wait(book_id: str) -> Any:
    event = _events.get(book_id)
    if event is None:
        raise KeyError(f"No review event for book {book_id}")
    await event.wait()
    return _results.pop(book_id, None)

def notify(book_id: str, chapters_data: Any) -> bool:
    event = _events.pop(book_id, None)
    if event is None:
        return False
    _results[book_id] = chapters_data
    event.set()
    return True

def is_waiting(book_id: str) -> bool:
    return book_id in _events
```

---

## 7. ingestion.py 修改點

在 Step 1b（`save_document()`）成功後插入：

```python
# ── Step 1c: 等待章節審閱 ────────────────────────────────────────
_progress(18, "Awaiting chapter review")
task_store.set_awaiting_review(task_id)  # task_id 需傳入 run()
event = review_registry.register(doc.id)
reviewed_chapters = await review_registry.wait(doc.id)

# 依用戶提交的章節結構重組 doc.chapters
if reviewed_chapters is not None:
    doc.chapters = _rebuild_chapters(doc, reviewed_chapters)
    await self._document_service.replace_chapters(doc)

task_store.set_running(task_id)
_progress(20, "Resuming pipeline")
# 繼續 Step 2（summarization）...
```

`run()` 需新增 `task_id: str` 參數（目前已有，從 `books.py` 的 `_run_ingestion` 傳入）。

---

## 8. 前端元件狀態設計

### ProcessingCard：awaiting_review 狀態（不自動跳轉）

task 狀態為 `awaiting_review` 時，ProcessingCard 顯示兩個按鈕：

```
┌─────────────────────────────────────────────────────┐
│ 書名                                                 │
│ ─────────────────────────────────────────────────── │
│ 章節切分已完成，請確認偵測結果是否正確。              │
│                                                     │
│  [接受系統判斷，繼續分析]   [開始審閱章節 →]         │
└─────────────────────────────────────────────────────┘
```

- **「接受系統判斷，繼續分析」**：呼叫 `GET /review-data` 取得原始章節，立刻原樣 `POST /review`，ProcessingCard 繼續顯示 pipeline 進度（回到 processing 狀態）。
- **「開始審閱章節 →」**：`Link to={/upload/review/${bookId}?taskId=${task.taskId}}`，在 `useTaskPolling` 停止輪詢（`awaiting_review` 加入停止條件）的前提下打開審閱頁。

ProcessingCard 不再需要 `navigate`，只需要 `Link` 和一個 accept mutation。

### ChapterReviewPage：URL 與狀態

路由：`/upload/review/:bookId?taskId=xxx`（taskId 從 ProcessingCard 的 Link 帶入）

頁面階段：

```
"reviewing"       ← 初始，用戶審閱並編輯
"submitting"      ← POST /review 進行中（confirm 按鈕 loading）
"pipeline_running" ← POST 成功後，轉為 polling task 進度
"done"            ← task.status === 'done'，顯示完成 + 進入書籍連結
"error"           ← task.status === 'error'
```

```typescript
interface ReviewState {
  chapters: LocalChapter[];
  expandedParagraphs: Set<number>;
  searchQuery: string;
  searchHits: number[];
  searchCursor: number;
  pendingSplit: { paragraphIndex: number; sentenceIndex: number } | null;
  phase: 'reviewing' | 'submitting' | 'pipeline_running' | 'done' | 'error';
}

interface LocalChapter {
  title: string;       // 可編輯，空字串 = 未命名
  startParagraphIndex: number;
}
```

`pipeline_running` 階段用 `useTaskPolling(taskId)` 輪詢，在頁面底部顯示現有的 `ProcessingTimeline` 元件（複用），直到 `done`。

### ChapterReviewPage：底部確認列（reviewing 階段）

```
[N 個章節  ·  M 個未命名]        [確認，開始分析 →]
```

未命名章節不阻擋送出。`pipeline_running` 階段隱藏確認列，改顯示進度。

---

## 9. Design Token 備注

本功能的章節審閱 UI（切分點指示線、章節 tag、title_span highlight）暫時沿用 `--entity-con-*`（靛紫）：

| 用途 | Token |
|------|-------|
| 章節起始卡片左側 bar、tag 底色 | `--entity-con-bg` / `--entity-con-border` |
| tag 文字、link 文字 | `--entity-con-fg` |
| title_span highlight 底色 | `--entity-con-bg` |
| title_span 底部邊線 | `--entity-con-border` |

非預設主題（manuscript / minimal-ink / pulp）下這組 token 是灰色，視覺語意會弱化。已記錄於 B-041，後續補 `--review-*` token 系列時一起修正。

---

## 10. 完整資料流（含 task 狀態機）

```
用戶上傳 PDF
  ↓
task: pending → running
  ↓
Step 1: PDF 解析 + 章節切分（pipeline.py，含 title_span 設定）
  ↓
Step 1b: save_document()（書進庫，paragraphs 含 title_span 存 DB）
  ↓
task: running → awaiting_review
asyncio.Event 掛起
  ↓
前端 ProcessingCard 偵測 awaiting_review
  → 顯示「接受系統判斷」/ 「開始審閱」兩個按鈕
  ↓
路徑 A（接受）:
  ProcessingCard 呼叫 GET /review-data → 原樣 POST /review
  task: awaiting_review → running
  ProcessingCard 繼續顯示 pipeline 進度（polling 恢復）
  task: running → done → ProcessingCard 顯示完成 banner

路徑 B（審閱）:
  點擊 Link → /upload/review/:bookId?taskId=xxx
  ChapterReviewPage 呼叫 GET /review-data → 取章節 + 段落 + sentences
  用戶審閱：調整標題、新增/移除切分點
  用戶點「確認，開始分析 →」
  前端 POST /review（送出 chapters 陣列）→ phase: pipeline_running
  後端 notify(book_id, chapters_data)
  asyncio.Event 觸發
  ingestion 繼續：_rebuild_chapters()
  DocumentService.replace_chapters()（刪舊、寫新）
  task: awaiting_review → running
  Step 2+（summarization、feature extraction、KG、symbol discovery）
  task: running → done
  ChapterReviewPage polling 偵測 done → phase: done
  顯示完成 banner + 「前往書籍」連結
```

---

## 11. 邊界情況處理

| 情況 | 處理 |
|------|------|
| 用戶關閉分頁後重開 | ProcessingCard 從 sessionStorage 恢復 task，重新偵測 `awaiting_review`，再次跳轉審閱頁 |
| 用戶重整審閱頁 | `ChapterReviewPage` 直接從 `/review-data` 取資料，不依賴前頁 state |
| 切分後某章節無段落 | 前端驗證：`startParagraphIndex` 不可與下一章相同，實際上保證每章 ≥ 1 段 |
| 書只有一章（無標題） | 左欄顯示單一未命名章節，右欄全書段落，用戶可新增切分點 |
| 服務重啟（asyncio.Event 消失） | task 狀態留在 `awaiting_review`，前端可再次跳轉審閱頁，但 POST /review 會找不到 event → 回傳 409。目前接受此限制，不做持久化補救。 |
| 取消上傳（cancel task） | `awaiting_review` 期間若收到 cancel，`review_registry.notify(book_id, None)` 後 ingestion 終止；DB 保留書（已存入），pipeline_status 全為 failed |

---

## 12. Definition of Done

- [ ] `ruff check src/` 無新增錯誤
- [ ] `cd frontend && npm run lint` 無新增錯誤
- [ ] `docs/API_CONTRACT.md` 同步更新（`GET /review-data`、`POST /review`）
- [ ] `npm run gen:types` 執行後 `generated.ts` 包含新 schema
- [ ] 上傳一本書：ProcessingCard 自動跳轉審閱頁，調整章節後確認，pipeline 繼續完成
- [ ] 服務重啟場景：task 留 `awaiting_review`，POST /review 回 409（可接受）
