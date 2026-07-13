# 書籍上傳流程優化（feat/book-upload-revamp）

## Context

書籍上傳目前的問題：(1) 語系偵測用 `langdetect` 對前 2000 字取樣，樣本常落在目錄/扉頁等非典型文字，中文常被誤判為韓文，前端下拉選單目前只能讓使用者手動補救、預設是空的「自動偵測」，UX 不理想；(2) 解析後的章節是扁平清單，目錄頁、作者序、推薦序、跋等非正文內容目前會被當成一般章節，混入 chunk/embedding 系統，也沒有編輯能力；過程中額外發現 TXT 編碼、DOCX/PDF 結構化資訊未利用、重複上傳、EPUB 不支援等相關缺口，使用者確認全部納入這次 branch。

這是一個跨前後端、多檔案的架構性變更，依 CLAUDE.md 規範分成多個子任務逐步確認，每個子任務開工前都會重新過一次 4 問 checkpoint。本文件只定調**設計方向**，不代表可以一次性全部落地。

Branch 已建立：`feat/book-upload-revamp`（from `main`, working tree clean）。

**進度**：項目 1–7 全部完成並各自 commit（TXT 編碼、語系偵測改善、語系預判 endpoint、DOCX/PDF 結構化偵測、章節分類 domain model+HITL review+前端 UI、重複上傳警告、EPUB 支援），另外補了一個 API_CONTRACT.md 既有落差的獨立修正 commit。**本 revamp 已收斂**。

後續回頭審視上傳路徑時，另修了一個 detect-language 端點的既有缺陷：原本只取檔案前 2 MB 就丟給 loader 解析，對 ZIP 容器（DOCX/EPUB）與 xref 在檔尾的 PDF 會截斷失敗、靜默 fallback 成 `en`——已改為串流整檔（受 `MAX_UPLOAD_BYTES` 保護）後再取樣，並補了 >2 MB EPUB 回歸測試；同時把上傳白名單抽成 `_ALLOWED_UPLOAD_SUFFIXES` 常數消除重複。

---

## 全部項目與設計

### 1. TXT 編碼偵測（新發現，優先度最高，中文相關根因）

`loader.py:132-135` 的 `load_txt` 只試 UTF-8，失敗就 fallback 到 `latin-1`——這對 Big5/GBK 存的中文 txt 檔案會直接產生亂碼（不是誤判語系，是內容本身壞掉）。

- 新增直接依賴 `charset-normalizer`（已是 transitive dep，鎖在 `uv.lock` 3.4.7，但不是直接依賴，需要 `uv add charset-normalizer` 正式列入 `pyproject.toml`）
- `load_txt` 改用 `charset_normalizer.from_path()` 偵測實際編碼後再解碼，取代現有的 utf-8→latin-1 fallback
- 測試：擴充 `tests/pipelines/test_document_processing.py::TestLoaderMeta`，新增 Big5/GBK 樣本檔案的解碼測試

### 2. 語系偵測改善（Unicode script pre-filter + 更好取樣）

`language_detection.py` 完全沒有 script-level 檢查，直接把樣本丟給 `langdetect`。

- 在 `detect_language` 最前面加一個 script 檢查：統計樣本中 Han（U+4E00–9FFF）、Hangul（U+AC00–D7A3）、Hiragana/Katakana（U+3040–30FF）字元數。若 Han 佔顯著比例且 Hangul/Kana ≈ 0 → 直接回傳 `"zh-cn"`（沿用現有 langdetect 輸出格式），不呼叫 langdetect；其餘情況維持原邏輯。這條規則本身就足以消滅絕大多數中文誤判韓文的案例，不需要換偵測套件
- `detect_language_from_document` 取樣時改用 `domain.documents.extract_body_text(p)`（已存在的函式，過濾非 body 段落）而非直接讀 `para.text`，避免被目錄類雜訊段落稀釋樣本
- 測試：新增 `tests/` 對應的純函數單元測試（無 fixture），涵蓋純中文/純韓文/混合/中文含少量英文人名等案例

### 3. 上傳前預先語系判斷（新 endpoint + 前端預選）

使用者要的是「下拉選單不要是空的」，但目前語系偵測發生在上傳任務啟動之後（`ingestion.py:261`），此時 metadata card 已經顯示空白下拉選單。

- 新增輕量 endpoint（暫名）`POST /api/v1/books/detect-language`：接受 multipart file，內部只呼叫 `load_pdf`/`load_docx`/`load_txt`（不跑 chapter_detector、不建任務），取樣文字後呼叫改善後的 `detect_language`，回傳 `{"language": "zh-cn"}`。純同步輕量呼叫，不經過 task_store
- 前端 `DropZone`/`UploadPage.tsx`：檔案選定後立即呼叫此 endpoint，`pending.language` 初始值改為偵測結果（而非 `''`），下拉選單本身邏輯不變，使用者仍可覆蓋；呼叫失敗則靜默 fallback 回目前的空值行為
- 需更新 `docs/API_CONTRACT.md` 新增此 endpoint

### 4. DOCX 段落樣式 + PDF 頁首頁尾雜訊過濾

- `load_docx` 目前只讀 `para.text`，捨棄 `para.style.name`；改為一併回傳樣式資訊（例如 `(idx, text, style_name)` 或在 `DocumentMeta`/獨立結構帶上 heading style），供 `chapter_detector` 優先信任 Word 「標題 1/2」樣式作為章節邊界，regex 作為沒有樣式資訊時的 fallback
- `load_pdf` 目前逐行照單全收；新增重複行偵測（同一行文字在多個頁面的固定位置重複出現 → 視為頁首/頁尾雜訊行，過濾掉），避免污染章節偵測與 chunk 內容
- 測試：擴充 `TestDetectChapters`（樣式優先於 regex）與 `TestLoaderMeta`（頁首/頁尾過濾）

### 5. 章節結構分類（正文/目錄/序/跋/其他）—— 本次範圍最大的項目

現況：`Chapter` 完全沒有型別欄位，`chapter_detector.py` 雖然已經用 regex 抓到 `prologue|epilogue|preface|introduction|foreword|afterword`（僅限英文），但抓到後跟一般章節一視同仁，語意直接被丟棄；chunking/embedding 對所有章節一律處理。

**Domain model**：`domain/documents.py` 新增
```python
class ChapterRole(str, Enum):
    body = "body"
    toc = "toc"
    preface = "preface"
    afterword = "afterword"
    other = "other"
```
`Chapter.role: ChapterRole = ChapterRole.body` 新欄位。`prologue`/`epilogue` 維持 `body`（它們是敘事內容的一部分，不是後設內容）；只有目錄/序/前言/推薦序/跋/後記歸類為非 body。

**偵測**：`chapter_detector.py` 擴充關鍵字規則（含中文）：
- `toc`: 目錄、目次、Table of Contents、Contents
- `preface`: 序、自序、作者序、譯者序、推薦序、前言、序言、Preface、Foreword、Introduction
- `afterword`: 跋、後記、Afterword
規則式偵測結果只是初步標記，最終由 HITL review 畫面人工確認/修正（符合先前確認的「規則式偵測 + 人工確認」方向）。

**Chunking/embedding**：`feature_extraction/pipeline.py` 的 embed 迴圈加一個 chapter-role 檢查——`role != body` 的章節整章跳過（不 embed、不進 Qdrant）。章節內容本身仍完整存在既有的 `chapters`/`paragraphs` SQLite 表中（不需要新表），足以滿足「另外保存方便跨書籍查閱」的需求；跨書籍查閱介面留待未來任務。

**持久化**：`_ChapterRow` 新增 `role` column，沿用 `document_service.py:init_db()` 既有的 idempotent `ALTER TABLE ... ADD COLUMN` pattern；`save_document`/`get_document`/`replace_chapters` 同步讀寫。

**HITL Review**：
- `ReviewChapterResponse` 新增 `role: str = "body"`；`ReviewChapterInput` 新增可選 `role`（缺省 "body"）
- `_rebuild_chapters`（`ingestion.py`）依審閱結果設定 `Chapter.role`
- 前端 `ChapterReviewPage.tsx` 章節標題列（header row，目前是標題輸入框 + 刪除按鈕）加一個章節類型切換控制，比照現有段落 role 的「點擊循環」按鈕風格（無現成 per-row `<select>` 前例），循環 正文→目錄→序→跋→其他
- `frontend/src/api/types.ts` 的 `ReviewSubmitChapter` 新增 `role` 欄位，`handleSubmit` 一併送出
- i18n：`en/upload.json` 目前完全缺少 `review.*` 區塊（`zh-TW` 有、`en` 沒有，是既有缺口）——這次會補齊英文 `review.*`，因為新加的章節類型標籤如果不補齊英文版就會直接顯示 key 而不是文字，這屬於讓新功能可用的必要修正，不是額外整理

**閱讀端影響**：`GET /{book_id}/chapters`（一般讀者章節列表）預設排除 `role != body` 的章節，避免序/跋/目錄污染正常閱讀導覽與章節編號；非 body 章節仍在資料庫中可查，只是不出現在預設閱讀清單。

**文件同步**：`docs/API_CONTRACT.md`（review 相關 endpoint 與 chapters endpoint 的欄位變動）。

### 6. 重複上傳偵測

- `document_service.py` 新增依標題（不分大小寫）查詢既有文件的方法
- `POST /books/upload` 上傳前查詢，若有同名書籍，回傳一個警告訊號（例如 202 回應中夾帶 `duplicateWarning: true`，或前端在送出前先呼叫一個輕量檢查）——採「警告但允許繼續」，前端顯示提示訊息，使用者確認後仍可繼續上傳
- 不阻擋上傳，只是提醒

### 7. EPUB 支援（已用真實套件驗證下列行為，非臆測）

**技術驗證結果**（用 `uv run --with ebooklib` 建了一個含 guide/landmarks 的測試 EPUB 並讀回驗證）：
- `ebooklib.epub.read_epub()` 讀取後，`book.guide` 統一回傳 `[{"type": "toc"|"preface"|..., "href": str, "title": str}, ...]`——無論原始檔案是 EPUB2 舊式 `<guide>` 還是 EPUB3 `<nav epub:type="landmarks">`，ebooklib 都正規化成同一個介面，**不需要自己解析 XHTML nav**
- `book.spine`：依閱讀順序排列的 `(item_id, "yes"/"no")` 列表，是章節順序的權威來源
- `item.is_chapter()`（`EpubHtml`/`EpubNav` 都有這個方法）：`EpubNav`（導覽頁本身）回傳 `False`，其餘正文 XHTML 回傳 `True`——用這個排除導覽頁，不需要猜測
- `ebooklib` 本身依賴 `lxml`（已是 transitive dependency），可以直接用 `lxml.html.fromstring(item.get_content())` 解析每個 XHTML，取 `h1-h6`/`p` 等區塊層級元素的 `.text_content()` 當作段落

**架構決策：EPUB 不靠 regex 猜章節邊界，而是延伸現有的 `styled_heading_indices` 機制**

現有 `detect_chapters(segments, styled_heading_indices)` 已經有「信任外部提供的 heading 位置、regex 只當 fallback」的機制（子任務4為 DOCX 樣式建立）。EPUB 沿用同一條路徑，但額外提供「這個 heading 的權威角色是什麼」，不需要再靠 `_classify_chapter_role` 猜文字：

- `DocumentMeta` 新增 `heading_roles: dict[int, ChapterRole]`（索引 → 權威角色，只有 EPUB 會填，PDF/DOCX/TXT 維持空字典不受影響）
- `detect_chapters()` 新增可選參數 `styled_heading_roles: dict[int, ChapterRole] | None = None`；當某個 heading 的 index 同時出現在 `styled_heading_indices` 且 `styled_heading_roles` 有值時，直接採用該 role，不呼叫 `_classify_chapter_role`
- `load_epub()` 邏輯：依 `book.spine` 順序遍歷，跳過非 chapter 的 item（`is_chapter() is False`），每個 item 的第一個區塊文字設為 heading（進 `heading_indices`），並用 `book.guide` 的 href 對照該 item，若有對應 guide type 就轉換成 `ChapterRole` 存進 `heading_roles`；guide 沒有標記的 item 維持 `ChapterRole.body`（不特別處理 cover/title-page 等次要 landmark，讓內容量門檻或 body 分類自然處理，範圍不過度擴張）

guide type 對照表（只做官方 OPF guide type 中語意明確對應的部分）：
```python
_EPUB_GUIDE_TYPE_TO_ROLE = {
    "toc": ChapterRole.toc,
    "preface": ChapterRole.preface,
    "foreword": ChapterRole.preface,
    "introduction": ChapterRole.preface,
}
```
沒有官方 "afterword" guide type；未對應到的 item 維持 `body`，跋/後記仍能靠既有的 `_classify_chapter_role` 文字 fallback（`_AFTERWORD_HEADING_RE`）在 heading 文字比對階段抓到。

**檔案異動：**
- `pyproject.toml`/`uv.lock` — 新增 `ebooklib`
- `domain/documents.py` — `FileType.EPUB = "epub"`
- `loader.py` — 新增 `load_epub()`；`DocumentMeta` 新增 `heading_roles` 欄位
- `chapter_detector.py` — `detect_chapters()` 新增 `styled_heading_roles` 參數
- `pipeline.py` — `_load_sync`/file_type 判斷加 `.epub`；呼叫 `detect_chapters` 時傳入 `styled_heading_roles=file_meta.heading_roles`
- `api/routers/books.py` — 上傳白名單、`/detect-language` 白名單都要加 `.epub`
- 前端 `DropZone.tsx` — `ALLOWED_EXTENSIONS`、`accept` 屬性加 `.epub`
- 前端 `UploadPage.tsx` — **順便修正子任務3就發現、當時記錄延後處理的既有 bug**：metadata card 檔案資訊列固定寫死顯示「PDF」字樣，不論實際格式；這次既然要新增 EPUB 顯示，順便改成依副檔名動態顯示
- `en/upload.json`、`zh-TW/upload.json` — `dropzone.supportText`/`errorInvalidFormat` 文案加入 epub
- 測試：仿照 `TestLoaderMeta`/`TestDocumentProcessingPipeline`/`TestDetectChapters` 新增 EPUB 對應測試（用真實 `ebooklib` 建構測試檔案，比照 DOCX 測試用真實 `python-docx` 建構的既有慣例）
- 文件同步：`docs/API_CONTRACT.md` 上傳格式白名單說明

**執行順序（子任務內再分批）：**
- 7a：後端核心 — `domain/documents.py` + `loader.py` + `chapter_detector.py` + `pipeline.py` + 依賴 + 測試
- 7b：後端上傳白名單 — `routers/books.py` + `API_CONTRACT.md`
- 7c：前端 — `DropZone.tsx` + `UploadPage.tsx`（含 PDF 文字 bug 修正）+ i18n

---

## 執行順序（子任務拆分）

依 CLAUDE.md「異動超過 3 個檔案先拆子任務」規範，每個子任務開工前都會重新跑一次 4 問 checkpoint，逐一確認後才進下一個：

1. ✅ TXT 編碼偵測修正
2. ✅ 語系偵測 script pre-filter + 取樣改善
3. ✅ 語系預判 endpoint + 前端預選
4. ✅ DOCX 樣式 + PDF 頁首頁尾過濾
5. ✅ 章節結構分類（5a domain model+持久化 / 5b HITL review API / 5c 前端 review UI）
6. ✅ 重複上傳偵測
- ✅ （額外）修正 API_CONTRACT.md 既有的 upload endpoint 文件落差
7. ✅ EPUB 支援（三小段皆完成）：
   - 7a. ✅ 後端核心（`documents.py`、`loader.py`、`chapter_detector.py`、`pipeline.py`、新依賴、測試）
   - 7b. ✅ 後端上傳白名單（`routers/books.py`、`API_CONTRACT.md`）
   - 7c. ✅ 前端（`DropZone.tsx`、`UploadPage.tsx` 含 PDF 文字 bug 修正、i18n 兩檔）

每個子任務完成後依 CLAUDE.md「完成後必報」列出異動清單、引用完整性確認、文件同步確認，並跑 `ruff check backend/`、`npm run lint`。

---

## 驗證方式

- 每個子任務跑 `python -m pytest` 對應範圍測試 + 全套回歸（無新增失敗）
- 語系偵測：用實際中文（含少量目錄/扉頁雜訊）、韓文、日文樣本手動驗證 `detect_language`/`detect_language_from_document`
- 章節分類：實際上傳一本有序文/目錄的中文小說 PDF/TXT，跑完整 ingestion pipeline，確認 HITL review 畫面能看到分類結果、提交後 Qdrant 沒有序文/目錄的 embedding、閱讀端章節列表沒有序文/目錄
- EPUB：用 `ebooklib` 建構一個含 guide/landmarks（toc/preface）+ 正文 + 無標記後記的測試 EPUB，跑 `load_epub` → `detect_chapters` → `DocumentProcessingPipeline.run()` 全鏈路，確認 toc/preface 由 guide 權威判定、後記靠文字 fallback 判定、正文維持 body；並實際透過 `npm run dev` 上傳一個 .epub 檔案跑完整前端流程
- 前端變動用 `npm run dev` 實際跑一次上傳流程（drag file → 檢查語系預選 → review 畫面 → 完成閱讀）驗證，不只跑 type check
