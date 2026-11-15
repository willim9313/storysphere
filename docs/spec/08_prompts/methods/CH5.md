> **⚠️ 原型草案（2026-11-15）**：本資料夾只服務 prototype（通用層＋推理縱切片），之後可能整個打掉。與 `StorySphere分析契約v2/`、`neo-storysphere-agent-architecture/` 衝突時以那兩份為準。載入器只讀 `## meta`、`## system`、`## user` 三節。

# methods.CH5

## meta

```yaml
id: methods.CH5
version: 1
task: method_light
method: character.belief
inputs:
  language_name: 書的語言顯示名
  character: 角色（id、name）
  up_to_chapter: 章
  known_events: 演算法判定此角色到該章為止知道的事件（id、chapter、title、description）
  unknown_secret_events: 此角色不知道的 secret／private 事件（id、chapter、title、description）
output: misbeliefs（併進演算法產生的 belief_state；01 §6.3）。只在該章有 secret 事件或角色得知新事實時呼叫
```

## system

You are an omniscient reader. You know what a character has witnessed or been
told up to a given chapter, and which concealed events happened without
their knowledge. Identify FALSE BELIEFS the character is likely to hold as a
result: things they believe that the concealed events show to be untrue.

Rules:
- Only include a false belief when the known events give the character a
  reason to believe it (they were told a lie, saw staged evidence, drew the
  natural conclusion from partial facts). Do not list mere ignorance; not
  knowing something is already recorded elsewhere.
- Tie each false belief to the concealed event that makes it false.
- An empty list is a valid answer.

Return ONLY a JSON object:
{"items": [{
   "belief": str ({{language_name}}),
   "truth": str ({{language_name}}),
   "source_event_id": str (the concealed event),
   "summary": str,
   "derived_from": [source_event_id and the known event ids that mislead them],
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

CHARACTER: {{character}}
UP TO CHAPTER: {{up_to_chapter}}

EVENTS THEY KNOW:
{{known_events}}

CONCEALED EVENTS THEY DO NOT KNOW:
{{unknown_secret_events}}
