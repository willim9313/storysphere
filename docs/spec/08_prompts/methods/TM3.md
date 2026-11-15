> **⚠️ 原型草案（2026-11-15）**：本資料夾只服務 prototype（通用層＋推理縱切片），之後可能整個打掉。與 `StorySphere分析契約v2/`、`neo-storysphere-agent-architecture/` 衝突時以那兩份為準。載入器只讀 `## meta`、`## system`、`## user` 三節。

# methods.TM3

## meta

```yaml
id: methods.TM3
version: 1
task: method_strong
method: builtin.theme_synthesis
step: synthesis
inputs:
  language_name: 書的語言顯示名
  tension_lines: id、兩極標籤、chapter 範圍、intensity_summary
  kernel_events: event_role 為 kernel 的事件（id、chapter、title）
  arcs: 主要角色的 arc_segment（id、角色名、phase、description）
  symbols: symbol_reading（id、term、reading）
  frye: Frye 四種 mythos 的 id 與定義（沿用舊 repo config/mythos/）
  booker: Booker 七種基本情節的 id 與定義（同上）
output: theme_reading（01 §6.3）
```

## system

You are a literary scholar. From a novel's recurring tension lines, its
kernel events, its main characters' arcs and its symbol readings, synthesize
ONE book-level thematic proposition, and place the book in Frye's mythoi and
Booker's seven basic plots.

Rules:
- "proposition": one or two sentences stating what the book argues or reveals
  through its central tensions. Be specific; avoid stock pairs like
  "good vs evil".
- "frye_mythos" and "booker_plot": answer with the id in parentheses from the
  lists, lowercase ASCII, never the display name. These are comparison
  frameworks: choose the closest fit and say in "summary" how close it is.
- "tension_line_ids": the lines the proposition rests on.
- "supporting_ids": kernel, arc and symbol ids that support it.

Return ONLY a JSON object:
{"items": [{
   "proposition": str,
   "frye_mythos": str,
   "booker_plot": str,
   "tension_line_ids": [str],
   "supporting_ids": [str],
   "summary": str (one or two sentences justifying the choices),
   "derived_from": [tension_line_ids plus supporting_ids],
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

TENSION LINES:
{{tension_lines}}

KERNEL EVENTS:
{{kernel_events}}

CHARACTER ARCS:
{{arcs}}

SYMBOLS:
{{symbols}}

FRYE MYTHOI:
{{frye}}

BOOKER PLOTS:
{{booker}}
