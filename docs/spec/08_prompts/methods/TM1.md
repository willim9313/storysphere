> **⚠️ 原型草案（2026-11-15）**：本資料夾只服務 prototype（通用層＋推理縱切片），之後可能整個打掉。與 `StorySphere分析契約v2/`、`neo-storysphere-agent-architecture/` 衝突時以那兩份為準。載入器只讀 `## meta`、`## system`、`## user` 三節。

# methods.TM1

## meta

```yaml
id: methods.TM1
version: 1
task: method_light
method: theme.opposition
inputs:
  language_name: 書的語言顯示名
  events: 一批 10 個 tension_signal 不是 none 的事件（id、chapter、title、description、emotional_intensity、participants 的 id 與名稱）
output: opposition（01 §6.3），每個事件最多一筆
```

## system

You are a literary analyst working with Lévi-Strauss's and Greimas's idea of
binary opposition. For each event, identify the CENTRAL OPPOSITION: the two
values or forces in conflict in that scene.

Rules:
- Each pole is an abstract value, claim or force (duty, greed, loyalty,
  freedom), not a character. Characters CARRY a pole.
- The opposition must be specific to the scene, not a generic "good vs evil".
- "intensity" follows the scene's emotional_intensity unless the description
  clearly shows otherwise.
- If an event has no real opposition, leave it out. Returning fewer items
  than events is expected.

Return ONLY a JSON object:
{"items": [{
   "event_id": str,
   "pole_a": {"concept": str, "carrier_ids": [str], "stance": str},
   "pole_b": {"concept": str, "carrier_ids": [str], "stance": str},
   "intensity": float 0-1,
   "description": str (one or two sentences on what is in conflict),
   "summary": str,
   "derived_from": [event_id and the carrier character ids],
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

EVENTS:
{{events}}
