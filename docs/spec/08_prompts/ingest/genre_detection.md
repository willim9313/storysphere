> **⚠️ 原型草案（2026-11-15）**：本資料夾只服務 prototype（通用層＋推理縱切片），之後可能整個打掉。與 `StorySphere分析契約v2/`、`neo-storysphere-agent-architecture/` 衝突時以那兩份為準。載入器只讀 `## meta`、`## system`、`## user` 三節。

# ingest.genre_detection

## meta

```yaml
id: ingest.genre_detection
version: 1
task: genre_detection
used_by: 02 §5（每本書一次）
inputs:
  title: 書名
  author: 作者
  density_table: 七個機制的密度表（程式組好的 markdown 表：mechanism、density、strong_share、chapters）
  strong_quotes: 各機制前 5 個 strong 訊號的引文（程式組好的清單）
  opening_sample: 全書開頭 2,000 字
  language_name: 書的語言顯示名
output: books.genre_profile（不含 detected_by、detected_at，由程式補）
```

## system

You decide which genre a novel primarily belongs to, and which other genres are
mixed into it, from signal statistics collected over the whole book.

Genres and the mechanisms they rest on (● primary, ○ supporting):
- mystery: info_control ●; threat ○; relations ○
- thriller: info_control ●; threat ●; relations ○; journey ○
- science_fiction: world_rules ●; info_control ○; relations ○; language_form ○
- fantasy: world_rules ●; journey ●; threat ○; relations ○
- horror: info_control ●; threat ●; world_rules ○
- romance: relations ●; info_control ○
- historical: historicity ●; relations ○; language_form ○
- wuxia_xianxia: world_rules ●; relations ●; journey ○
- adventure: journey ●; threat ○; relations ○
- literary: language_form ●; relations ○

How to decide:
- Density is the share of passages that carry a signal for a mechanism.
  Signals were tagged generously, so a high density alone does not prove a
  genre. Look at which mechanisms are high TOGETHER and match a genre's ●
  pattern, and check the strong quotes for what the signals actually are.
- Use the title, author and opening only to break ties or confirm.
- "mixed" lists other genres whose ● mechanisms are clearly present in part of
  the book, with the chapters where they cluster. Leave it empty if none.
- If no genre fits, choose the closest one and say so in "rationale".

Return ONLY a JSON object:
  "primary" (str): one genre id from the list.
  "mixed" (list): [{"genre": str, "score": float 0-1, "chapters": [int]}]
  "mechanism_density" (dict): copy the density values you were given,
    {mechanism_id: float}.
  "rationale" (str): two or three sentences in {{language_name}}.

## user

TITLE: {{title}}
AUTHOR: {{author}}

SIGNAL DENSITY:
{{density_table}}

STRONG SIGNAL QUOTES:
{{strong_quotes}}

OPENING:
{{opening_sample}}
