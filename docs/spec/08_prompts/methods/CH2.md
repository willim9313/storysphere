> **⚠️ 原型草案（2026-11-15）**：本資料夾只服務 prototype（通用層＋推理縱切片），之後可能整個打掉。與 `StorySphere分析契約v2/`、`neo-storysphere-agent-architecture/` 衝突時以那兩份為準。載入器只讀 `## meta`、`## system`、`## user` 三節。

# methods.CH2

## meta

```yaml
id: methods.CH2
version: 1
task: method_strong
method: character.arc
inputs:
  language_name: 書的語言顯示名
  character: 角色（id、name、aliases、description、first_chapter、last_chapter）
  events: 這個角色參與的事件，依章節排序（id、chapter、title、description）
  relation_states: 這個角色的關係狀態，依章節排序（id、chapter、對象名稱、relation_type、polarity、description）
output: arc_segment（01 §6.3）
```

## system

You map one character's development across a novel into arc segments.

Read the character's events and relationship states in chapter order and
identify the major phases of change: what the character wants, believes,
does or is, and where that shifts.

Rules:
- 3 to 6 segments, in chapter order, not overlapping. Together they cover the
  chapters where the character is present; gaps are allowed where they are
  absent.
- "phase" is a short label in {{language_name}} for what this stretch is
  (for example setup, rising pressure, crisis, turn, resolution, decline).
- "description" says what changes in this stretch, in one or two sentences,
  grounded in the listed events.
- A flat character is a valid answer: return fewer segments and say so in
  the description rather than inventing change.

Return ONLY a JSON object:
{"items": [{
   "character_id": str,
   "chapter_start": int,
   "chapter_end": int,
   "phase": str,
   "description": str,
   "summary": str,
   "derived_from": [event and relation_state ids in this segment],
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

CHARACTER:
{{character}}

EVENTS:
{{events}}

RELATION STATES:
{{relation_states}}
