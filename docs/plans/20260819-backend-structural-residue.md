# 後端結構性殘留清理

**日期**: 2026-08-19
**狀態**: 規劃（尚未實作）
**範圍**: `backend/storysphere/api/schemas/`、`api/routers/unraveling.py`、跨檔的 deferred import、repo 層級殘留
**性質**: 低風險、可各自獨立執行的小任務集合。**刻意不綁成一個 PR**

本份收的是「上一輪重構掃過但沒跟上」的尾巴。每一項都可以單獨挑走，彼此無依賴。

---

## 1. `api/schemas/books.py` 沒跟上 router 拆分

**現況**: `books.py` router 已於 `35647a3` 拆成 7 支，但 schema 沒動：

- `api/schemas/books.py` = **779 行 / 67 個 class**
- 消費端剛好就是那 7 支：`books.py`、`book_ingestion.py`、`book_reader.py`、`book_graph.py`、`book_timeline.py`、`book_entity_analysis.py`、`book_event_analysis.py`

7 支 router 共吃一個巨檔，等於拆分只做了一半 —— 改任何一個主題的 schema 都會讓其他 6 支的 import 重新解析，且看不出哪些 model 屬於誰。

**做法**: 依 router 的同一套主題切分，鏡像成 `schemas/book_ingestion.py`、`schemas/book_reader.py`… 保留 `schemas/books.py` 作為共用 model 的落點。

**注意**:
- 這會動到 `frontend/src/api/generated.ts` 嗎？**不會**。型別是從 `/openapi.json` 產生的，OpenAI schema 的 component 名稱取自 class 名稱，不是模組路徑。class 名稱不改就不會漂
- 但**仍需跑一次** `npm run gen:types` 並確認 diff 為空，作為上述判斷的驗證，而不是相信推論

**檔案數**: 1 刪→7 增 + 7 支 router 改 import。**必須分批**（每批 ≤ 3 檔），建議一次搬一個主題。

---

## 2. `unraveling.py` 是目前最大的 router（697 行）

上一輪拆 `books.py` 時沒動到它。內容失衡得很明顯：

| 區段 | 行數 |
|---|---|
| `_build_nodes()` **單一函式** | 170–508 = **338 行** |
| `_compute_chapter_distributions()` | 611–660 |
| 端點 | **只有 2 個**（`get_unraveling`、`get_chapter_distribution`） |
| 內聯定義的 schema | `NodeData`、`EdgeData`、`UnravelingManifest`、`ChapterDistribution` |

兩個問題：

1. **338 行的 `_build_nodes`** 是建構概覽整張圖的組裝邏輯，屬於**領域計算**，不該住在 router 裡。它是 B-046 Phase 2 要接更多節點時的必經之處 —— 現在每加一個節點都是往這 338 行裡再塞
2. **schema 內聯在 router**，違反 `api/schemas/` 的既有慣例（其他 router 都從 `schemas/` 取）

**做法**:
- `_build_nodes` / `_compute_chapter_distributions` 下沉到 `services/`（或 `domain/`，視它實際依賴什麼決定）
- 4 個 model 搬到 `api/schemas/unraveling.py`

**與 B-046 的關係**: B-046 Phase 2 要把 `tension_lines` / `hero_journey_stage` 等節點接上 CTA。**先做本項再做 B-046 Phase 2**，否則是在 338 行的函式上繼續疊。

---

## 3. 272 處函式內 deferred import

**現況**: `noqa: PLC0415` 全後端 272 處，熱點：

| 檔案 | 處數 |
|---|---|
| `api/deps.py` | 32 |
| `services/analysis_service.py` | 17 |
| `api/main.py` | 15 |
| `workflows/ingestion.py` | 14 |
| `api/routers/kg_settings.py` / `book_ingestion.py` | 11 each |

**已有一個空分支**: `refactor/hoist-deferred-imports` 存在但**零 commit** —— 開了沒做。

**必須先查證，不要直接搬**: 這 272 處至少有三種不同的成因，處置方式完全不同：

| 成因 | 該怎麼辦 |
|---|---|
| 迴避循環 import | **不能搬**，搬了就炸。應改為修正相依方向 |
| 縮短冷啟動（langchain / torch 這類重套件） | **不該搬**，這是刻意的。應加註解說明 |
| 單純寫習慣，無實際理由 | 可以搬 |

**做法**: 第一步是**分類**，不是搬動。先產出一份「272 處各屬哪一類」的清單，再決定哪些真的要動。若分類後可搬的比例很低，這項就該直接關掉，並在 `CLAUDE.md` 或本文件記下結論，免得下次又有人開一個空分支。

**優先度最低** —— 它不造成任何使用者可見問題，只是讀起來吵。

---

## 4. 雙 KG backend 靠人工對齊

**現況**:

- `services/kg_service_base.py` 定義 **27 個抽象方法**
- `kg_service.py`（NetworkX）35 個方法、`kg_service_neo4j.py`（Neo4j）33 個
- 兩邊的私有 helper **完全不同構**：NetworkX 側是 `_add` / `_best_edge` / `_edge_to_relation` / `_snapshot_by_chapter`；Neo4j 側是 `_node_to_entity` / `_record_to_relation` / `_temporal_props`…

抽象方法本身有 ABC 強制，但**新功能加在哪一側、另一側跟不跟上，沒有任何機制**。B-048（Link Prediction 的 `nx.adamic_adar_index()` 直接耦合 NetworkX，Neo4j 無法執行）就是第一個已知案例，而它至今仍在 backlog。

**做法（本份只提最小的一步）**: 加一個測試，斷言兩個實作類別的公開方法集合一致（`set(dir(KGService)) ^ set(dir(Neo4jKGService))` 的公開部分為空，或明列例外白名單）。

這不解決 B-048，但能**讓下一次漂移在 CI 就被抓到**，而不是半年後由使用者回報。真正的 backend 抽象收斂留給 B-048 自己。

---

## 5. repo 層級殘留

- **殘留 worktree**: `.claude/worktrees/chore+prune-orphan-symbols`（detached `f791dff`）。對應 PR #40 已合併，可移除：
  `git worktree remove .claude/worktrees/chore+prune-orphan-symbols`
- **空分支**: `refactor/hoist-deferred-imports`（本地 + origin 皆有，零 commit）。決定第 3 項怎麼處置後，一併刪或用它

**這一項是清潔工作，不需要 PR**，但**動 worktree / 刪遠端分支前先問過使用者**。

---

## 6. 建議順序

| 順位 | 項目 | 理由 |
|---|---|---|
| 1 | §2 `unraveling.py` 下沉 | 擋在 B-046 Phase 2 前面 |
| 2 | §4 backend 一致性測試 | 一個測試檔，擋住未來漂移 |
| 3 | §1 schemas 拆分 | 純機械，但檔案數多 |
| 4 | §5 repo 清潔 | 隨手 |
| 5 | §3 deferred import 分類 | 先分類再決定做不做 |

---

## 7. 明確不做

- **不改任何 endpoint 路徑或 response schema** → `docs/API_CONTRACT.md` 不需更新（§1 / §2 都只搬 model 的**所在模組**，不改 class 名稱與欄位）
- 不在本份範圍內解 B-048
- 不順手重排各檔內其他程式碼
- §3 在完成分類前不搬動任何 import

---

## 8. 回滾

五項彼此獨立，各自 commit。§1 / §2 是搬移，revert 即還原；§4 純新增測試；§5 是 repo 操作，刪 worktree 不影響已合併的 commit。
