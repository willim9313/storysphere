> **⚠️ 原型草案（2026-11-15）**：本資料夾只服務 prototype（通用層＋推理縱切片），之後可能整個打掉。與 `StorySphere分析契約v2/`、`neo-storysphere-agent-architecture/` 衝突時以那兩份為準。載入器只讀 `## meta`、`## system`、`## user` 三節。

# ingest.deep.info_control

## meta

```yaml
id: ingest.deep.info_control
version: 1
task: deep_extraction
used_by: 02 §6 S4a（每個有 info_control 訊號的單位一次）
inputs:
  language_name: 書的語言顯示名
  characters: S2 的角色清單（id、名稱、別名），程式組好的 JSON Lines
  unit_signals: 本單位的 info_control 訊號與子標籤
  unit_text: 本單位正文
  mystery_extension: 主題材或混入元素含推理時，填入 info_control.mystery.md 的 system 段；否則為空字串
render_order: 先把 mystery_extension 填進去，再代換其他變數（擴充段裡也有 {{language_name}}）
output: hidden_truth、reveal 的候選（推理時另含 clue_points_to、trick、角色推理擴充）
```

## system

You extract the INFORMATION-CONTROL structure of one passage of a novel:
truths that are being kept hidden, and moments where a hidden truth comes out.
Work only from PASSAGE. Refer to characters by the ids in CHARACTERS.

You will not see the rest of the book. Record candidates; a later step merges
candidates from all passages and links them together. So:
- Record a hidden truth when PASSAGE shows that something is concealed,
  unknown or misunderstood (a mystery is posed, a secret is kept, a lie is
  told), even if you cannot tell what the truth is yet. Describe it as the
  open question ("who killed X", "where the box went") when the answer is not
  in the passage.
- Record a reveal only when PASSAGE itself discloses a previously hidden
  truth, to the reader, to characters, or both.

Return ONLY a JSON object:

"hidden_truth": list of
  - "statement" (str): the concealed fact, or the open question, in {{language_name}}.
  - "truth_kind" (str): who, how, why, where, when or other.
  - "concealer_ids" (list[str]): characters hiding it, if shown.
  - "concealed_from" (str): reader, characters or both.
  - "quote" (str)

"reveal": list of
  - "statement" (str): what is disclosed, in {{language_name}}.
  - "revealer_id" (str|null)
  - "audience" (str): reader, characters or both.
  - "reveal_method" (str): confession, deduction, discovery, testimony or other.
  - "quote" (str)

{{mystery_extension}}

Every "quote" is copied EXACTLY from PASSAGE, at most 120 characters.
Use only character ids from CHARACTERS. Return empty lists when nothing applies.

## user

CHARACTERS:
{{characters}}

SIGNALS IN THIS PASSAGE:
{{unit_signals}}

PASSAGE:
{{unit_text}}
