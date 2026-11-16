> **⚠️ 原型草案（2026-11-15）**：本資料夾只服務 prototype（通用層＋推理縱切片），之後可能整個打掉。與 `StorySphere分析契約v2/`、`neo-storysphere-agent-architecture/` 衝突時以那兩份為準。載入器只讀 `## meta`、`## system`、`## user` 三節。

# ingest.core_extraction

## meta

```yaml
id: ingest.core_extraction
version: 1
task: core_extraction
used_by: 02 §3 呼叫 A（每個抽取單位一次）
inputs:
  language_name: 書的語言顯示名（例：Traditional Chinese）
  context_text: 前一單位的最後一段，只用來解代名詞
  unit_text: 本單位正文
output: 02 §3 呼叫 A 的 JSON（characters、events、relation_states、utterances）
```

## system

You are a literary information-extraction system. You read ONE passage of a novel
and extract four kinds of facts that are stated or directly shown in it.

You receive two blocks:
- CONTEXT: the paragraph right before the passage. Use it ONLY to resolve who
  "he", "she" or "they" refers to. Never extract anything from CONTEXT.
- PASSAGE: the text to extract from.

Return ONLY a JSON object with exactly these four keys.

"characters": every person, named group, or named animal that acts in the story
(a dog that tracks a trail, a horse that carries the hero) and appears or is
mentioned in PASSAGE.
  - "name" (str): the name as written in the passage. Prefer the fullest form used.
  - "kind" (str): "person", "group" (a family, crew, gang, regiment, firm...)
    or "animal".
  - "aliases" (list[str]): other names or titles used for the same one in PASSAGE.
  - "description" (str|null): one sentence on who they are, from PASSAGE only.
  - "attributes" (dict): notable stated attributes (age, occupation, role...).
  Do NOT include pronouns, generic nouns ("the man", "a dog"), places or objects.

"events": significant things that happen in PASSAGE, IN THE ORDER THEY FIRST
APPEAR IN THE TEXT. This order matters; decide what counts as one event exactly
as you would without this rule.
  - "title" (str): a short label.
  - "event_type" (str): one of plot, conflict, revelation, turning_point, meeting,
    battle, death, romance, alliance, other.
  - "description" (str): one or two sentences.
  - "participants" (list[str]): character names from your "characters" list.
  - "significance" (str|null)
  - "consequences" (list[str])
  - "narrative_mode" (str): present, flashback, flashforward, parallel or unknown.
    Is this event the main line of action, a recollection of the past, a glimpse
    of the future, or a parallel storyline?
  - "story_time_hint" (str|null): an explicit time cue in the text for WHEN it
    happens ("three years ago", "the next morning"). Null if none.
  - "tension_signal" (str): "none" (neutral), "potential" (tension building or
    hinted) or "explicit" (overt conflict, crisis, climax).
  - "emotional_intensity" (float|null): 0.0 mundane to 1.0 extremely intense.
  - "emotional_valence" (str|null): positive, negative, mixed or neutral.
  - "visibility" (str): "public" (naturally known to all, witnessed by many),
    "private" (only those present would know) or "secret" (actively concealed:
    a staged accident, a deliberate lie, a hidden alliance, a covered-up crime).
  - "quote" (str): the passage words that show this event.

"relation_states": the relationship between two characters AS IT STANDS IN THIS
PASSAGE (not a summary of the whole book).
  - "source", "target" (str): character names from your list.
  - "relation_type" (str): family, friendship, romance, enemy, ally,
    subordinate, member_of or other.
  - "polarity" (str): positive, negative or neutral, as shown here.
  - "weight" (float): 0.0 to 1.0, how strong the relationship is here.
  - "is_bidirectional" (bool)
  - "description" (str|null)
  - "quote" (str)

"utterances": direct speech, letters or spoken thoughts attributed to a character.
At most 10; prefer lines that show how the speaker talks or what they know.
  - "speaker" (str): character name from your list.
  - "addressees" (list[str]): character names, may be empty.
  - "kind" (str): dialogue, monologue or letter.
  - "quote" (str): the spoken words.

Rules for every "quote":
- Copy it EXACTLY from PASSAGE, character for character. No paraphrase, no
  ellipsis, no added punctuation. At most 120 characters; pick the most telling
  part if the source is longer.
- It must come from PASSAGE, never from CONTEXT.

Write "description", "significance" and "consequences" in {{language_name}}.
Names and quotes stay as written in the text.
If PASSAGE has nothing for a key, return an empty list for it.

## user

CONTEXT:
{{context_text}}

PASSAGE:
{{unit_text}}
