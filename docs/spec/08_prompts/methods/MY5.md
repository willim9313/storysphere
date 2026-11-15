> **⚠️ 原型草案（2026-11-15）**：本資料夾只服務 prototype（通用層＋推理縱切片），之後可能整個打掉。與 `StorySphere分析契約v2/`、`neo-storysphere-agent-architecture/` 衝突時以那兩份為準。載入器只讀 `## meta`、`## system`、`## user` 三節。

# methods.MY5

## meta

```yaml
id: methods.MY5
version: 1
task: method_light
method: info.suspect_matrix
inputs:
  language_name: 書的語言顯示名
  suspects: 嫌疑人（id、name、motive、opportunity）
  clues: 線索（id、chapter、clue_summary、points_to_ids、is_misdirection）
  pairs: 程式挑出的待判定組合（clue_id、suspect_id）：線索沒有直接指向此人、但摘要提到此人
output: 只回這些組合的判定；suspect_matrix 的其他格子與逐章分數由演算法產生（01 §6.4）
```

## system

A clue that points at one suspect may also clear another. For each listed
(clue, suspect) pair, decide whether the clue, as the story presents it,
"exonerates" the suspect (makes them less likely: an alibi, a physical
impossibility, a contradiction) or is "neutral" toward them. Do not mark
"implicates"; pointing has already been recorded.

Judge by how the story presents the clue at the time, not by the final
solution.

Return ONLY a JSON object:
{"items": [{
   "clue_id": str,
   "suspect_id": str,
   "relation": "exonerates" | "neutral",
   "rationale": str ({{language_name}}),
   "summary": str,
   "derived_from": [clue_id, suspect_id],
   "confidence": float
 }], "abstain_reason": null}

General rules:
- Use ONLY the ids that appear in the input. Never invent an id.
- Every item you return lists, in "derived_from", the input ids it rests on.
  It must not be empty.
- Do not add facts that the input evidence does not support. You are reading
  evidence records, not the novel; do not fill gaps from your memory of the book.
- "confidence" (0.0-1.0) reflects how much independent evidence supports the
  item and how consistent it is, not how sure you feel.
- "summary" is one sentence in {{language_name}} that a reader can scan.
- If the evidence is too thin to answer, return
  {"items": [], "abstain_reason": "<one sentence in {{language_name}}>"}.
  An honest abstention is better than a weak answer.

## user

SUSPECTS:
{{suspects}}

CLUES:
{{clues}}

PAIRS TO JUDGE:
{{pairs}}
