"""把 S1 的項目變成證據草稿（02 §4 步驟 3、4、7）。

這裡的草稿都要用到角色的 evidence id，所以在角色寫入之後才能組。`text_rank` 先填 1，
等去重之後由 `assign_text_rank` 依順序重排。
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from storysphere.domain.evidence import (
    CharacterContent,
    EventContent,
    FocalizationContent,
    RelationStateContent,
    UtteranceContent,
)
from storysphere.ingest.s2.characters import MergedCharacter, name_key
from storysphere.ingest.s2.common import (
    EXTRACTION_CONFIDENCE,
    UnitView,
    clean_content,
    locate_item_quote,
    short,
)
from storysphere.ingest.s2.parse import as_dict, clean_str, list_items, str_list
from storysphere.ingest.s2.report import (
    FIELD_INVALID,
    MALFORMED_ITEM,
    NAME_FIELD_UNRESOLVED,
    NAME_UNRESOLVED,
    OVER_LIMIT,
    S2Report,
)
from storysphere.ingest.s2.tagging import TagHit
from storysphere.store.evidence_writer import EvidenceDraft, QuoteDraft, SubjectRef

MAX_UTTERANCES_PER_UNIT = 10

_EVENT_OPTIONAL = (
    "narrative_mode",
    "story_time_hint",
    "significance",
    "consequences",
    "visibility",
    "tension_signal",
    "emotional_intensity",
    "emotional_valence",
)
_POLARITIES = ("positive", "negative", "neutral")
_RELATION_OPTIONAL = ("weight", "is_bidirectional", "description")


class NameResolver:
    """Turns the names S1 wrote into `character` evidence ids.

    一個字串只有在毫無歧義時才換：先看「名字」（某角色併進來的原始名字），只有一個角色
    用它就是它；沒有人當名字用，才看別名，同樣要只有一個角色宣稱。
    """

    def __init__(self, entries: Iterable[tuple[str, MergedCharacter]]) -> None:
        names: dict[str, set[str]] = {}
        aliases: dict[str, set[str]] = {}
        self.display: dict[str, str] = {}
        for evidence_id, character in entries:
            self.display[evidence_id] = character.canonical_name
            for name in {character.canonical_name, *character.member_names}:
                if key := name_key(name):
                    names.setdefault(key, set()).add(evidence_id)
            for alias in character.aliases:
                if key := name_key(alias):
                    aliases.setdefault(key, set()).add(evidence_id)
        self._by_key: dict[str, str] = {}
        for key in names.keys() | aliases.keys():
            owners = names.get(key) or aliases[key]
            if len(owners) == 1:
                self._by_key[key] = next(iter(owners))

    def resolve(self, name: Any) -> str | None:
        text = clean_str(name)
        return self._by_key.get(name_key(text)) if text else None


def character_drafts(
    characters: list[MergedCharacter], first_mentions: dict[int, tuple[str, TagHit]]
) -> list[tuple[int, EvidenceDraft]]:
    """One draft per character that has a first mention; ``(character index, draft)``.

    ``first_mentions``: character index → (paragraph id, hit).
    引文取自首次提及的段落與字面（01 §3）；沒有首次提及的角色不入庫。
    """
    drafts: list[tuple[int, EvidenceDraft]] = []
    for i, character in enumerate(characters):
        if i not in first_mentions:
            continue
        paragraph_id, hit = first_mentions[i]
        content = CharacterContent(
            canonical_name=character.canonical_name,
            kind=character.kind,  # type: ignore[arg-type]
            aliases=character.aliases,
            description=character.description,
            attributes=character.attributes,
            first_chapter=character.first_chapter,
            last_chapter=character.last_chapter,
            mention_count=character.mention_count,
        ).model_dump(mode="json")
        summary = character.canonical_name
        if character.description:
            summary += "：" + short(character.description, 80)
        drafts.append(
            (
                i,
                EvidenceDraft(
                    claim_type="character",
                    summary=summary,
                    confidence=EXTRACTION_CONFIDENCE,
                    content=content,
                    quotes=[QuoteDraft(paragraph_id=paragraph_id, text=hit.surface)],
                    discourse_chapter=character.first_chapter,
                    discourse_paragraph_id=paragraph_id,
                ),
            )
        )
    return drafts


def _resolve_all(
    names: list[str], resolver: NameResolver, report: S2Report, label: str
) -> list[str]:
    ids: list[str] = []
    for name in names:
        evidence_id = resolver.resolve(name)
        if evidence_id is None:
            report.drop_field(NAME_FIELD_UNRESOLVED, f"{label}: cannot resolve '{name}'")
        elif evidence_id not in ids:
            ids.append(evidence_id)
    return ids


def event_drafts(
    view: UnitView,
    texts: dict[str, str],
    resolver: NameResolver,
    report: S2Report,
) -> list[EvidenceDraft]:
    unit = view.unit
    drafts: list[EvidenceDraft] = []
    for item in list_items(view.s1a, "events", report, unit.id):
        title = clean_str(item.get("title"))
        if title is None:
            report.drop(MALFORMED_ITEM, f"{unit.id}: event without title")
            continue
        quote = locate_item_quote(view, item.get("quote"), texts, report, f"event '{title}'")
        if quote is None:
            continue
        event_type = item.get("event_type")
        data: dict[str, Any] = {
            "title": title,
            "event_type": event_type if isinstance(event_type, str) else "other",
            "description": clean_str(item.get("description")) or title,
            "chapter": unit.chapter,
            "text_rank": 1,
            **{k: item[k] for k in _EVENT_OPTIONAL if item.get(k) is not None},
        }
        content = clean_content(EventContent, data, report, f"{unit.id} event '{title}'")
        if content is None:
            continue
        participants = _resolve_all(
            str_list(item.get("participants")), resolver, report, f"{unit.id} event '{title}'"
        )
        drafts.append(
            EvidenceDraft(
                claim_type="event",
                summary=title,
                confidence=EXTRACTION_CONFIDENCE,
                content=content,
                subjects=[SubjectRef(subject_id=p, role="participant") for p in participants],
                quotes=[quote],
                discourse_chapter=unit.chapter,
                discourse_paragraph_id=quote.paragraph_id,
            )
        )
    return drafts


def relation_drafts(
    view: UnitView, texts: dict[str, str], resolver: NameResolver, report: S2Report
) -> list[EvidenceDraft]:
    unit = view.unit
    drafts: list[EvidenceDraft] = []
    for item in list_items(view.s1a, "relation_states", report, unit.id):
        source_name, target_name = clean_str(item.get("source")), clean_str(item.get("target"))
        if source_name is None or target_name is None:
            report.drop(MALFORMED_ITEM, f"{unit.id}: relation without both ends")
            continue
        source_id, target_id = resolver.resolve(source_name), resolver.resolve(target_name)
        label = f"{unit.id} relation '{source_name}'→'{target_name}'"
        if source_id is None or target_id is None or source_id == target_id:
            report.drop(NAME_UNRESOLVED, label)
            continue
        quote = locate_item_quote(view, item.get("quote"), texts, report, label)
        if quote is None:
            continue
        relation_type = item.get("relation_type")
        polarity = item.get("polarity")
        if polarity not in _POLARITIES:
            # S1 偶爾給 mixed 之類不在枚舉內的值；枚舉沒有 other，退到最接近的 neutral。
            report.drop_field(FIELD_INVALID, f"{label}: polarity {polarity!r} → neutral")
            polarity = "neutral"
        data = {
            "source_id": source_id,
            "target_id": target_id,
            "relation_type": relation_type if isinstance(relation_type, str) else "other",
            "polarity": polarity,
            **{k: item[k] for k in _RELATION_OPTIONAL if item.get(k) is not None},
        }
        content = clean_content(RelationStateContent, data, report, label)
        if content is None:
            continue
        summary = (
            f"{resolver.display[source_id]} → {resolver.display[target_id]}"
            f"（{content['relation_type']}）"
        )
        if content.get("description"):
            summary += short(content["description"], 60)
        drafts.append(
            EvidenceDraft(
                claim_type="relation_state",
                summary=summary,
                confidence=EXTRACTION_CONFIDENCE,
                content=content,
                subjects=[
                    SubjectRef(subject_id=source_id, role="source"),
                    SubjectRef(subject_id=target_id, role="target"),
                ],
                quotes=[quote],
                discourse_chapter=unit.chapter,
                discourse_paragraph_id=quote.paragraph_id,
            )
        )
    return drafts


def utterance_drafts(
    view: UnitView, texts: dict[str, str], resolver: NameResolver, report: S2Report
) -> list[EvidenceDraft]:
    unit = view.unit
    drafts: list[EvidenceDraft] = []
    for item in list_items(view.s1a, "utterances", report, unit.id):
        speaker_name = clean_str(item.get("speaker"))
        if speaker_name is None:
            report.drop(MALFORMED_ITEM, f"{unit.id}: utterance without speaker")
            continue
        label = f"{unit.id} utterance by '{speaker_name}'"
        speaker_id = resolver.resolve(speaker_name)
        if speaker_id is None:
            report.drop(NAME_UNRESOLVED, label)
            continue
        quote = locate_item_quote(view, item.get("quote"), texts, report, label)
        if quote is None:
            continue
        if len(drafts) >= MAX_UTTERANCES_PER_UNIT:
            report.drop(OVER_LIMIT, label)
            continue
        addressees = [
            a
            for a in _resolve_all(str_list(item.get("addressees")), resolver, report, label)
            if a != speaker_id
        ]
        data = {
            "speaker_id": speaker_id,
            "kind": item.get("kind"),
            "text": quote.text,
            "addressee_ids": addressees,
        }
        content = clean_content(UtteranceContent, data, report, label)
        if content is None:
            continue
        drafts.append(
            EvidenceDraft(
                claim_type="utterance",
                summary=f"{resolver.display[speaker_id]}：{short(quote.text, 80)}",
                confidence=EXTRACTION_CONFIDENCE,
                content=content,
                subjects=[
                    SubjectRef(subject_id=speaker_id, role="speaker"),
                    *(SubjectRef(subject_id=a, role="addressee") for a in addressees),
                ],
                quotes=[quote],
                discourse_chapter=unit.chapter,
                discourse_paragraph_id=quote.paragraph_id,
            )
        )
    return drafts


def focalization_drafts(
    views: list[UnitView], texts: dict[str, str], resolver: NameResolver, report: S2Report
) -> list[EvidenceDraft]:
    """每個單位標一筆；同一章、同 focalizer、同類型、同人稱的相鄰標記併成一筆（段落與引文併入）。"""
    groups: dict[tuple, dict[str, Any]] = {}
    for view in views:
        unit = view.unit
        container = as_dict(view.s1b)
        if container is None or "focalization" not in container:
            continue
        item = container["focalization"]
        if not isinstance(item, dict):
            if item is not None:
                report.drop(MALFORMED_ITEM, f"{unit.id}: focalization is not an object")
            continue
        label = f"{unit.id} focalization"
        quote = locate_item_quote(view, item.get("quote"), texts, report, label)
        if quote is None:
            continue
        focalizer_name = clean_str(item.get("focalizer"))
        focalizer_id = None
        if focalizer_name is not None and focalizer_name.lower() not in ("null", "none"):
            focalizer_id = resolver.resolve(focalizer_name)
            if focalizer_id is None:
                report.drop_field(
                    NAME_FIELD_UNRESOLVED, f"{label}: cannot resolve '{focalizer_name}'"
                )
        data = {
            "chapter": unit.chapter,
            "focalization_type": item.get("type"),
            "grammatical_person": item.get("person"),
            "paragraph_ids": unit.paragraph_ids,
            "focalizer_id": focalizer_id,
        }
        content = clean_content(FocalizationContent, data, report, label)
        if content is None:
            continue
        key = (
            unit.chapter,
            focalizer_id,
            content["focalization_type"],
            content["grammatical_person"],
        )
        group = groups.setdefault(key, {"content": content, "quotes": [], "paragraph_ids": []})
        group["quotes"].append(quote)
        group["paragraph_ids"].extend(
            p for p in unit.paragraph_ids if p not in group["paragraph_ids"]
        )

    drafts: list[EvidenceDraft] = []
    for (chapter, focalizer_id, kind, person), group in groups.items():
        content = {**group["content"], "paragraph_ids": group["paragraph_ids"]}
        who = resolver.display[focalizer_id] if focalizer_id else "none"
        drafts.append(
            EvidenceDraft(
                claim_type="focalization",
                summary=f"ch{chapter} {kind} focalization, {person} person (focalizer: {who})",
                confidence=EXTRACTION_CONFIDENCE,
                content=content,
                subjects=[SubjectRef(subject_id=focalizer_id, role="focalizer")]
                if focalizer_id
                else [],
                quotes=group["quotes"],
                discourse_chapter=chapter,
                discourse_paragraph_id=group["paragraph_ids"][0],
            )
        )
    return drafts


def assign_text_rank(drafts: list[EvidenceDraft]) -> list[EvidenceDraft]:
    """Number the events 1.. in unit order, then output order inside the unit (02 §4 步驟 7)."""
    result: list[EvidenceDraft] = []
    rank = 0
    for draft in drafts:
        if draft.claim_type == "event":
            rank += 1
            draft = draft.model_copy(update={"content": {**draft.content, "text_rank": rank}})
        result.append(draft)
    return result
