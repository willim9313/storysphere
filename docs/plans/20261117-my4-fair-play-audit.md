# T18（只剩 MY4）公平性稽核

## 使用者的決定（2026-11-17）

- **#1 選 B**：`concealed_from=characters`（讀者本來就知道）的真相也不稽核，precheck 回「讀者本來就知道這件事，公平性稽核不適用」；03 §4.2 已補。
- #2、#3 照建議：#8 不擋 MY4、留到 T28 前；`fairness_matrix` view 這次一起做。

依據：07 T18、03 §4.2（MY4 列）、01 §6.4 `fairness_gap`、`docs/spec/08_prompts/methods/MY4.md`、`docs/spec/08_config/knox_1929.yaml`、`van_dine_1928.yaml`、05 §4.1 `fairness_matrix`、09 F7。

完成標準（07 T18）：
1. 產出證據通過 Pydantic 驗證，`derived_from` 只含宣告讀取的類型（`hidden_truth`、`reveal`、`clue_points_to`）。
2. 03 表中「不產出的條件」（無 reveal）有測試。
3. mock LLM 的單元測試；再用四簽名跑一次，對照 09 F7（E1 的判定是 `fair` 或 `partially_fair`，並列出揭曉前的線索）。

## 現有資料（`t27/neo.db`，即 `methods.db` 的副本）

- 真相 30 筆：`concealed_from` 是 both 17、characters 13（只瞞角色、讀者本來就知道）。
- 有揭曉的真相 21 筆（`reveal.hidden_truth_id` 與 `hidden_truth.reveal_id` 兩邊一致）。揭曉 152 筆，`audience` 是 both 103、characters 46、reader 3。
- 線索 176 筆，全部有 `points_to_truth_id`；讀者可見 168、誤導 7。

## 做法

一個真相一筆 run（`per_hidden_truth`，selectors 已支援）。

- **前提（per run 的 `check`）**：這個真相沒有任何揭曉 → 不呼叫 LLM、不產出，precheck 回「這個真相在書裡沒有被揭曉，公平性稽核不適用」（03「不產出的條件」）。
- **演算法**：
  - 揭曉：`reveal.hidden_truth_id`＝這個真相的 current 揭曉。
  - `reveal_chapter`：讀者看得到的揭曉（`audience` 是 reader 或 both）中最早的章；沒有的話取全部揭曉中最早的章。章號用證據的 `discourse_chapter`。
  - 線索：`points_to_truth_id`＝這個真相。章號 < `reveal_chapter` 的是「揭曉前」，其餘是「揭曉當章及之後」。
  - 數字：`clue_ids_before_reveal`、`reader_visible_count`（揭曉前且讀者可見）、`misdirection_count`（揭曉前且誤導）。
- **LLM**（`method_strong`，一個真相一次）：照 08 的 MY4 prompt，只給 `verdict`、`violations`、`gap_description`、`summary`、`confidence`。規則只送 `fairness_relevant: true` 的條目。`violations` 裡不在送出規則清單的條目丟掉；`verdict` 不在三個值裡＝格式錯，重試（共通規則）。模型棄答（`items` 空）→ 這個 run 不產出，記 `abstain_reason`。
- **`derived_from`**：真相、它的揭曉、送出去的所有線索（演算法都用到了）。
- 檔案照現行慣例搬進執行位置：`prompts/methods/MY4.md`（version 1，內容同 08）、`config/knox_1929.yaml`、`config/van_dine_1928.yaml`。prompt 的 `inputs` 說揭曉有 `statement`，但 `reveal` 沒有這個欄位，改送 `summary`；只改 meta 的說明，不動 system／user，維持 v1。
- 在 `methods/implementations.py` 註冊後，總覽的「線索公平嗎？」卡從「尚未支援」變成可執行，S5 之後入庫也會自動跑。

## 要你決定的事（P3）

### #1 只瞞角色、讀者本來就知道的真相要不要稽核

- **位置**：03 §4.2 MY4 列的「不產出的條件」只寫「無 reveal」。
- **問題**：`concealed_from=characters` 的真相（四簽名有 13 筆）讀者本來就知道，「對讀者公不公平」不成立；照現在的規格，其中有揭曉的也會各叫一次 LLM。
- **選項**：
  - **A. 照規格**：有揭曉就稽核。四簽名最多 21 次呼叫。
  - **B. 也跳過 `concealed_from=characters`**（建議）：precheck 回「讀者本來就知道這件事，公平性稽核不適用」。要在 03 §4.2 補一個不產出的條件。少花呼叫，也不會產出意義不明的「fair」。
- 兩個選項的程式差別只有一個條件判斷。

### #2 STATUS「等使用者決定」#8（S4 三件事）——不擋 MY4

- 推理屬性（`mystery_role`）：MY4 不讀，不影響。
- `reveal.revealer_id` 放寬成可空：只影響**重跑 S4** 時那 33 筆揭曉能不能留下；現有資料已經固定，MY4 不受影響。要不要放寬留到整本實跑（T28）前再決定。
- `hidden_truth.reveal_id` 回填：MY4 用 `reveal.hidden_truth_id` 找揭曉，不依賴回填。

### #3 `fairness_matrix` view 要不要這次一起做

T22 的決定是「等 MY4 做完再補」。建議這次做（B 批），否則結果卡打開只會退回證據列表。

## 分批

- **A 批：方法**。`methods/info/fair_play_audit.py`、prompt、兩份 config、註冊；`tests/methods/test_fair_play_audit.py`（mock LLM：數字、前提不成立、棄答、格式錯重試、未知規則丟掉、`derived_from` 的類型）。
- **B 批：`fairness_matrix` view**（依 #3）。真相 × 章節：線索點（實心＝讀者可見、空心＝不可見、另一種記號＝誤導）、揭曉點、判定與違反的規則。依 05 §4.1 的原則取本書所有 `fairness_gap`，再從 N-04e 的 `referenced` 拿真相、線索。
- **C 批：真的跑一次**（要你同意）。只跑 E1 那一個真相，必要時再加一個，**約 1–2 次 Gemini flash 呼叫**，對照 F7。整本 21 筆留到里程碑。

## Checkpoint 四題

1. **異動檔案**：新增 `backend/storysphere/methods/info/fair_play_audit.py`、`prompts/methods/MY4.md`、`config/knox_1929.yaml`、`config/van_dine_1928.yaml`、`tests/methods/test_fair_play_audit.py`、LLM fixture；修改 `methods/implementations.py`。B 批：新增 `frontend/src/components/views/FairnessMatrixView.tsx`，修改 `ViewRenderer.tsx`。規格：選 B 時改 03 §4.2；STATUS。
2. **現成可用**：`MethodBase`、`selectors.default_plan`（per_hidden_truth）、`_llm.ainvoke_json`／`items_of`／`clamp_unit`／`book_language`、`load_prompt`、CH5 的寫法（hybrid）、`KnowledgeMatrixView` 的矩陣畫法。舊 repo 沒有對應方法。
3. **新依賴或新結構**：無。
4. **改錯怎麼還原**：每批獨立，未 commit 前 `git stash`；實跑只用 `var/benchmark_runs/` 的副本。
