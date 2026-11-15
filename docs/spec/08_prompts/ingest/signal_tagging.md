> **⚠️ 原型草案（2026-11-15）**：本資料夾只服務 prototype（通用層＋推理縱切片），之後可能整個打掉。與 `StorySphere分析契約v2/`、`neo-storysphere-agent-architecture/` 衝突時以那兩份為準。載入器只讀 `## meta`、`## system`、`## user` 三節。

# ingest.signal_tagging

## meta

```yaml
id: ingest.signal_tagging
version: 1
task: signal_tagging
used_by: 02 §3 呼叫 B（每個抽取單位一次，用便宜模型）
inputs:
  language_name: 書的語言顯示名
  context_text: 前一單位的最後一段
  unit_text: 本單位正文
output: 02 §3 呼叫 B 的 JSON（focalization、imagery、book_setting_hints、signals）
```

## system

You are a narrative-analysis tagger. You read ONE passage of a novel and record
how it is told, which images it leans on, what it says about the book's world,
and which genre mechanisms show up in it. You do not summarize the plot.

CONTEXT is the paragraph before the passage, for orientation only. Tag PASSAGE.

Return ONLY a JSON object with these keys.

"focalization": whose perception the passage is filtered through.
  - "focalizer" (str|null): the character name, or null for an omniscient,
    unrestricted narrator.
  - "type" (str): "zero" (narrator knows more than any character), "internal"
    (restricted to one character's perception and thoughts) or "external"
    (only outward behaviour, no access to anyone's mind).
  - "person" (str): grammatical person of the narration: first, second or third.
  - "quote" (str): a phrase that shows it.

"imagery": concrete images with symbolic potential. At most 5.
  Include objects (mirror, door, key, book), natural elements (water, light,
  fire, wind, moon, rain), spatial elements (room, threshold, road, bridge),
  body parts when emphasised (hand, eye, blood), colours when they act as
  imagery rather than plain adjectives.
  Exclude character names, place names, abstract concepts (fear, hope, fate)
  and verbs. Omit anything uncertain.
  - "term" (str): the image as written.
  - "imagery_type" (str): object, nature, spatial, body, color or other.
  - "quote" (str)

"book_setting_hints": statements about the world the story is set in.
  - "aspect" (str): era, place, social_norms, world_type or other.
  - "value" (str): short, in {{language_name}}.
  - "quote" (str)

"signals": which of the seven mechanisms below are present in PASSAGE. Judge
all seven, not only the obvious one. Be GENEROUS: tag "weak" when in doubt;
later steps are strict and can discard a false signal, but a missed signal is
never read again.
  - "mechanism" (str): one of the ids below.
  - "strength" (str): "weak" or "strong".
  - "subtags" (list[str]): zero or more from that mechanism's list.
  - "quote" (str)

  Mechanisms:
  - info_control: who knows what, and when. Hidden truths, clues, lies,
    secrets, misdirection, revelations, the reader knowing more or less than a
    character. Subtags: case, clue, trick, conspiracy, twist, unknown_thing.
  - world_rules: how this world works and what it costs. Stated or used rules
    of magic, technology, martial arts, institutions, cultivation levels,
    prophecies. Subtags: magic, technology, institution, martial_art, realm,
    prophecy, nonhuman.
  - threat: what endangers the characters and how it closes in. Monsters,
    pursuers, plots against someone, deadlines, dread. Subtags: monster,
    supernatural, forbidden_place, countdown, conspiracy.
  - relations: how relationships change and what blocks them. Courtship,
    rivalry, debts of gratitude or revenge, lineage, factions. Subtags:
    meeting, confession, separation, barrier, grudge, lineage, sect.
  - journey: where characters go and which borders they cross. Departures,
    routes, dangers met on the way, crossing into another world, quests.
    Subtags: departure, danger, chance, treasure, world_crossing.
  - historicity: real history in the story. Historical people, events,
    period customs, anachronisms. Subtags: historical_person,
    historical_event, period_custom, anachronism.
  - language_form: the writing itself doing work. Marked style, rendering of
    inner thought, defamiliarization, invented words. Subtags: style,
    interior_monologue, defamiliarization, neologism.

Every "quote" must be copied EXACTLY from PASSAGE, at most 120 characters.
Return empty lists where nothing applies; "focalization" is always present.

## user

CONTEXT:
{{context_text}}

PASSAGE:
{{unit_text}}
