> **⚠️ 原型草案（2026-11-15）**：本資料夾只服務 prototype（通用層＋推理縱切片），之後可能整個打掉。與 `StorySphere分析契約v2/`、`neo-storysphere-agent-architecture/` 衝突時以那兩份為準。載入器只讀 `## meta`、`## system`、`## user` 三節。

# ingest.consolidate.info_control

## meta

```yaml
id: ingest.consolidate.info_control
version: 1
task: consolidation
used_by: 02 §6 S4b（每本書一次；候選超過 150 筆時分批）
inputs:
  language_name: 書的語言顯示名
  characters: 角色清單（id、名稱）
  candidates: S4a 的所有候選，每筆帶暫時 id（cand_n）、類型、章、摘要與引文，程式組好的 JSON Lines
  is_mystery: true／false
output: 合併後的 hidden_truth，以及 reveal、clue、trick 到真相的連結
```

## system

You see every information-control candidate extracted from a whole novel,
passage by passage, in reading order. You do not see the full text. Your job is
to merge duplicates and connect the pieces.

1. MERGE hidden_truth candidates that are about the same concealed fact or the
   same open question. A question posed in chapter 2 and its answer revealed in
   chapter 12 belong to the same truth. Give each merged truth one clear
   "statement" in {{language_name}}: the actual fact if a reveal states it,
   otherwise the question.
2. LINK each reveal to the truth it discloses. A truth may have several reveals
   (to the reader first, to characters later, or partial reveals). A truth may
   have none if the book never discloses it.
3. If is_mystery is true:
   - LINK each clue to the truth it bears on.
   - Decide "is_misdirection" for each clue: true if, judged against what the
     reveals finally establish, the clue points the reader toward a wrong
     answer (an innocent suspect, a false method). False if it points toward
     the truth or is neutral. If no reveal settles it, use null.
   - LINK each trick to the truth it hides.
4. Drop candidates that are clearly not information control (ordinary plot
   facts that nobody conceals). List their ids in "dropped".

Use only the candidate ids and character ids you were given.

Return ONLY a JSON object:
  "truths": [{
      "truth_id": str (new, t1, t2, ...),
      "statement": str,
      "truth_kind": str,
      "concealer_ids": [str],
      "concealed_from": "reader" | "characters" | "both",
      "merged_candidate_ids": [str],
      "reveal_candidate_ids": [str]
  }],
  "clues": [{"candidate_id": str, "truth_id": str, "is_misdirection": bool | null}],
  "tricks": [{"candidate_id": str, "truth_id": str}],
  "dropped": [str]

## user

IS_MYSTERY: {{is_mystery}}

CHARACTERS:
{{characters}}

CANDIDATES (reading order):
{{candidates}}
