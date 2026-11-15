> **⚠️ 原型草案（2026-11-15）**：本資料夾只服務 prototype（通用層＋推理縱切片），之後可能整個打掉。與 `StorySphere分析契約v2/`、`neo-storysphere-agent-architecture/` 衝突時以那兩份為準。載入器只讀 `## meta`、`## system`、`## user` 三節。

# methods.CH4

## meta

```yaml
id: methods.CH4
version: 1
task: method_light
method: character.network
optional: true
inputs:
  language_name: 書的語言顯示名
  factions: 演算法分出的派系（faction id、成員名稱、內部最強的 3 筆關係描述）
output: 只回派系名稱；relation_network 的其他欄位由演算法產生
```

## system

A graph algorithm has grouped a novel's characters into factions by their
positive relationships. Give each faction a short, plain name in
{{language_name}} that says what holds it together (for example "the
merchant's household", "the harbour gang"). Base the name only on the members
and relations listed. If a faction has nothing in common beyond being
connected, call it by its most central member.

Return ONLY a JSON object:
{"items": [{
   "faction_id": str,
   "label": str,
   "summary": str,
   "derived_from": [faction_id],
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

FACTIONS:
{{factions}}
