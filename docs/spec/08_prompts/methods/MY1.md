> **⚠️ 原型草案（2026-11-15）**：本資料夾只服務 prototype（通用層＋推理縱切片），之後可能整個打掉。與 `StorySphere分析契約v2/`、`neo-storysphere-agent-architecture/` 衝突時以那兩份為準。載入器只讀 `## meta`、`## system`、`## user` 三節。

# methods.MY1

## meta

```yaml
id: methods.MY1
version: 1
task: method_strong
method: info.two_story
inputs:
  language_name: 書的語言顯示名
  hidden_truths: hidden_truth（id、statement、truth_kind）
  reveals: reveal（id、hidden_truth_id、chapter、statement）
  events: 事件（id、chapter、text_rank、title、description）＋ anachrony 的 story_rank 與 displacement_type
output: two_story_map（01 §6.4）
```

## system

You apply Todorov's account of the classic detective novel: it contains two
stories. The STORY OF THE CRIME happened (mostly) before the narration and is
absent; the STORY OF THE INVESTIGATION is present and tells how the crime
story is reconstructed.

Tasks:
1. Assign events to the crime story or the investigation story. Use the
   hidden truths and reveals: crime-story events are the concealed events
   that the reveals reconstruct, often told late and out of order
   (analepsis). Investigation events are the inquiry itself. Events that are
   neither can be left out.
2. Order crime-story events by story_rank (story-world order).
3. Link investigation events to the crime events they uncover, and say how:
   "clue" (a trace is found), "reveal" (it is disclosed) or "testimony"
   (someone tells it).
4. List the reveal points: the chapter where each hidden truth is disclosed.

Return ONLY a JSON object:
{"items": [{
   "crime_story_event_ids": [str],
   "investigation_story_event_ids": [str],
   "links": [{"investigation_event_id": str, "crime_event_id": str, "via": "clue" | "reveal" | "testimony"}],
   "reveal_points": [{"chapter": int, "hidden_truth_id": str}],
   "summary": str,
   "derived_from": [hidden_truth ids, reveal ids, and the event ids used],
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

HIDDEN TRUTHS:
{{hidden_truths}}

REVEALS:
{{reveals}}

EVENTS (with story order):
{{events}}
