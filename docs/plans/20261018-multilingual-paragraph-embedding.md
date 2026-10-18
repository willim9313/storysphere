# 段落向量改用多語 embedding 模型 —— 實作計畫

日期：2026-10-18
來源：搜尋頁 impeccable 評估子任務 4（語意門檻）量分數分布時發現。

## 問題

段落向量（Qdrant）用 `all-MiniLM-L6-v2`（`settings.embedding_model_name` 預設值，`.env` 未覆寫）。
這是**只認英文**的模型：tokenizer 把多數中文字切成 `[UNK]`。

- 「戰鬥」→ `[UNK] [UNK]`；「主角內心的動搖」→ `主 [UNK] [UNK] 心 的 [UNK] [UNK]`
- `cos(孤獨, 戰鬥) = 0.99999`：兩個查詢是同一個向量，#23a 語意搜尋回完全相同的結果與分數
- 幾乎所有中文查詢的第一名是同一段短句；亂碼查詢與有意義查詢的分數區間重疊，任何門檻都分不開

受影響的不只搜尋頁：段落向量的使用端是 `VectorService.search`（#23a、聊天 `vector_search` 工具、
各 composite tools、事件分析）與 `lib/passageLookup.ts`（B-134 語意最近鄰跳原文，事件頁 18 句實測 9 句跳錯）。

## 試算（《名字的潮汐》32 段，記憶體內比較）

| 查詢 | `all-MiniLM-L6-v2` 第一名 | `paraphrase-multilingual-MiniLM-L12-v2` 第一名 |
|---|---|---|
| 孤獨／戰鬥 | 兩者相同（版權頁） | 兩者不同 |
| 母親的死 | 版權頁 0.33 | 伊內絲跪在泥裡…0.65（第二名「母親正…」） |
| 鹽 | 版權頁 | 「讀鹽人」0.52 |
| zzzqqxx | 0.16 | 0.40（版權頁，第三名 0.17） |

亂碼高分落在版權頁；正式重建時非正文章節不進索引。門檻另議（見「不做」）。

## 做法

1. `settings.embedding_model_name` 預設改為 `paraphrase-multilingual-MiniLM-L12-v2`。
   - 同為 384 維，`qdrant_vector_size` 與 collection 結構不變。
   - 該模型已因意象功能（`imagery_embedding_model_name`）在本機快取，約 470MB（原模型約 90MB）。
   - 寫入（`FeatureExtractionPipeline` → `EmbeddingGenerator`）與查詢（`VectorService._embed`）都走 `core.embeddings.get_embeddings()`，改設定即兩端一致。
2. **重建既有書的向量：用既有 #8d `POST /books/:id/rerun/feature-extraction`**（建構概覽頁可按），不寫新腳本。
   段落 id 不變，upsert 覆寫舊向量；沒有 collection 的書會補建。
   - `KEYWORD_EXTRACTOR_TYPE=llm` 時，**章節尚無關鍵字的書會逐段呼叫 LLM 抽關鍵字（花 token）**；已有關鍵字的章節跳過。
     2026-10-18 盤點：ageoffire、名字的潮汐全數已有 → 不花 token；大唐雙龍傳（58 段）、空屋的鑰匙（4 段）全無 → 會花 token，重跑前另行確認。
3. 文件：`.env.example`、`README.md`、`README.zh-TW.md`、`docs/guides/pipelines.md`、`embedding_generator.py` docstring；
   `docs/BACKLOG.md` B-134 補記根因。ADR_002 為當時決策紀錄，不改。

## 驗證

- 重跑前後以同一組查詢（孤獨、戰鬥、母親的死、被遺忘的名字、主角內心的動搖、海上的風暴、鹽、亂碼×2）比對 #23a 前 3 名
- 已有關鍵字的書重跑前後 Token 用量不變
- 聊天 `vector_search` 抽測
- B-134：事件頁 18 句關鍵引言重測跳錯數

## 回滾

動工前 `var/qdrant_local` 已備份到 scratchpad（專案外）。還原：設定改回並重跑特徵抽取，或停後端後以備份覆蓋。

## 不做

- **模型不一致防護**（在索引記錄建立時的模型，查詢時比對）：本次不加，換完當下全部重建。
  使用者表示日後希望能自由更換模型；屆時「換模型後未重建的書會靜默回無關結果」會成為實際問題，應另案設計。
- **語意門檻**：搜尋頁子任務 4 延到換完後，以新模型的分數分布再決定。
