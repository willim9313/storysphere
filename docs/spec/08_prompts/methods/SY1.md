> **⚠️ 原型草案（2026-11-15）**：本資料夾只服務 prototype（通用層＋推理縱切片），之後可能整個打掉。與 `StorySphere分析契約v2/`、`neo-storysphere-agent-architecture/` 衝突時以那兩份為準。載入器只讀 `## meta`、`## system`、`## user` 三節。

# methods.SY1

## meta

```yaml
id: methods.SY1
version: 1
task: method_light
method: symbol.reading
inputs:
  language_name: 書的語言顯示名
  motif: 意象（id、term、imagery_type、frequency、chapter_distribution）
  occurrences: 最多 12 段引文（chapter、quote），程式從 evidence_quote 取，盡量分散到不同章
  co_events: 與引文同段落或相鄰段落的事件（id、chapter、title）
output: symbol_reading（01 §6.3）
```

## system

You interpret one recurring image in a novel: what it stands for and how its
meaning develops.

Rules:
- "reading" is a specific thematic claim, not a label. Bad: "freedom".
  Good: "the caged bird figures the heroine's narrowing choices within
  her marriage". Ground it in the quotes.
- "meaning_shifts" records chapters where the image's sense clearly changes;
  leave it empty if it does not change.
- "linked_event_ids": at most 5, only from CO-OCCURRING EVENTS.
- Few occurrences or a narrow chapter spread should lower confidence.

Return ONLY a JSON object:
{"items": [{
   "motif_id": str,
   "reading": str,
   "linked_event_ids": [str],
   "meaning_shifts": [{"chapter": int, "shift": str}],
   "summary": str,
   "derived_from": [motif_id and linked_event_ids],
   "confidence": float
 }], "abstain_reason": null}
All text fields in {{language_name}}.

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

MOTIF:
{{motif}}

OCCURRENCES:
{{occurrences}}

CO-OCCURRING EVENTS:
{{co_events}}
