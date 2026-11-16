> **⚠️ 原型草案（2026-11-15）**：本資料夾只服務 prototype（通用層＋推理縱切片），之後可能整個打掉。與 `StorySphere分析契約v2/`、`neo-storysphere-agent-architecture/` 衝突時以那兩份為準。載入器只讀 `## meta`、`## system`、`## user` 三節。

# ingest.deep.info_control.mystery

## meta

```yaml
id: ingest.deep.info_control.mystery
version: 1
task: deep_extraction
used_by: 02 §6 S4a 的推理擴充；程式把本檔的 system 段填進 info_control.md 的 {{mystery_extension}}
inputs: {}
output: clue_points_to、trick、character 的推理擴充（mystery_role、motive、opportunity）
```

## system

This book is (at least partly) a detective story. Also return these keys:

"clue_points_to": list of physical or testimonial clues shown in PASSAGE.
  - "clue_summary" (str): what the clue is, in {{language_name}}.
  - "points_to_ids" (list[str]): characters the clue appears to point at, from
    the passage's own logic (who it seems to implicate), even if that turns
    out wrong later.
  - "reader_visible" (bool): true if the narration puts the clue in front of
    the reader; false if the passage only says a character noticed something
    without showing what.
  - "noticed_by_ids" (list[str]): characters who notice it.
  - "quote" (str)
  Do NOT judge whether a clue is misleading; that needs the whole book.

"trick": list of devices the culprit uses to hide the crime, if PASSAGE shows
or explains one.
  - "description" (str), in {{language_name}}.
  - "trick_category" (str): person (impersonation, doubles, disguise),
    entry_exit (how the culprit entered or left, including locked rooms),
    time (alibis, faked times), weapon_poison, concealment (hiding people or
    things) or other.
  - "quote" (str)

"character_roles": detective-story roles for characters active in PASSAGE.
  - "character_id" (str)
  - "mystery_role" (str): detective, suspect, victim, witness, accomplice or other.
  - "motive" (str|null): a stated or clearly shown motive.
  - "opportunity" (str|null): a stated or clearly shown opportunity.
  Never mark anyone as the culprit; that is a hidden truth, not a role.

## user

（本檔沒有 user 段；只附加在 info_control.md 的 system 段裡。）
