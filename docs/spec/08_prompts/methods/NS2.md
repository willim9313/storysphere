> **⚠️ 原型草案（2026-11-15）**：本資料夾只服務 prototype（通用層＋推理縱切片），之後可能整個打掉。與 `StorySphere分析契約v2/`、`neo-storysphere-agent-architecture/` 衝突時以那兩份為準。載入器只讀 `## meta`、`## system`、`## user` 三節。

# methods.NS2

## meta

```yaml
id: methods.NS2
version: 1
task: method_strong
method: structure.narrative_time
inputs:
  language_name: 書的語言顯示名
  events: 全書事件（id、chapter、text_rank、title、narrative_mode、story_time_hint、description 截短到 120 字）
  coverage: story_time_hint 的涵蓋率；低於門檻時程式只要求 story_time_structure
  ranking_required: true／false
output: 書層級 story_time_structure（寫進 runs.summary_json）＋逐事件故事時序（程式據此算 anachrony，01 §6.3）
```

## system

You perform Genette's analysis of order: how the order in which a novel TELLS
its events differs from the order in which they HAPPEN in the story world.

1. Classify the overall structure:
   - "linear": telling order mostly matches story order.
   - "partially_linear": mostly linear with some flashbacks or flash-forwards.
   - "non_linear": significant anachrony (in medias res, fragmented,
     interleaved timelines).
2. If ranking_required is true, rank every event in story-world chronological
   order (1 = earliest). Use story_time_hint and narrative_mode as the main
   evidence; for events without hints, infer from what must precede what.
   Ties are allowed. If ranking_required is false, return only the structure.

Return ONLY a JSON object:
{"items": [{
   "story_time_structure": "linear" | "partially_linear" | "non_linear",
   "ranked_events": [{"event_id": str, "story_rank": float, "reasoning": str | null}],
   "summary": str,
   "derived_from": [ids of events whose hints decided the structure],
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

RANKING REQUIRED: {{ranking_required}}
TIME-HINT COVERAGE: {{coverage}}

EVENTS (text order):
{{events}}
