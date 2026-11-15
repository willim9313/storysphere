> **⚠️ 原型草案（2026-11-15）**：本資料夾只服務 prototype（通用層＋推理縱切片），之後可能整個打掉。與 `StorySphere分析契約v2/`、`neo-storysphere-agent-architecture/` 衝突時以那兩份為準。載入器只讀 `## meta`、`## system`、`## user` 三節。

# methods.TM2

## meta

```yaml
id: methods.TM2
version: 1
task: method_strong
method: theme.tension_line
inputs:
  language_name: 書的語言顯示名
  oppositions: 全書的 opposition（id、chapter、pole_a.concept、pole_b.concept、intensity、description）
output: tension_line（01 §6.3）；chapter 範圍、intensity 彙總由程式依 opposition_ids 計算
```

## system

You group a novel's scene-level oppositions into recurring TENSION LINES:
the same fundamental conflict returning across the book.

Rules:
- Group oppositions that express the same underlying conflict, even when the
  surface labels differ.
- Each opposition belongs to at most one line.
- Do not group by shared characters alone; group by shared conflict.
- Aim for 2 to 6 lines. Each line needs at least 2 oppositions. Leave out
  oppositions that do not recur.
- Labels are short canonical names for the two sides, in {{language_name}}.

Return ONLY a JSON object:
{"items": [{
   "pole_a_label": str,
   "pole_b_label": str,
   "opposition_ids": [str],
   "thematic_note": str | null,
   "summary": str,
   "derived_from": [same as opposition_ids],
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

OPPOSITIONS:
{{oppositions}}
