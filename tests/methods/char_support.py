"""CH2／CH4／CH5 測試共用：播種角色、事件（含參與者）、關係狀態、話語，以及組引擎。"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from storysphere.methods.engine import MethodEngine
from storysphere.methods.implementations import MethodImplementations
from storysphere.methods.universal.arc import CharacterArc
from storysphere.methods.universal.belief import CharacterBelief
from storysphere.methods.universal.network import CharacterNetwork
from storysphere.store.evidence_writer import SubjectRef, WriteContext, write_evidence
from storysphere.store.tables import Evidence

from tests.methods.ev_support import REGISTRY, ScriptedLlm
from tests.methods.support import BOOK
from tests.store.conftest import DEFAULT_QUOTE, FakeParagraphs, make_draft

CH2_ID, CH4_ID, CH5_ID = "character.arc", "character.network", "character.belief"
_CLASSES = {CH2_ID: CharacterArc, CH4_ID: CharacterNetwork, CH5_ID: CharacterBelief}


def make_engine(sf, llm: ScriptedLlm, *method_ids: str) -> MethodEngine:
    impls = MethodImplementations()
    for method_id in method_ids:
        impls.register(_CLASSES[method_id](REGISTRY.methods[method_id]))
    return MethodEngine(
        sf, REGISTRY, impls, llm_factory=lambda _task: llm, model_info=lambda _t: ("fake", "fake-1")
    )


async def _write(sf, claim_type: str, content: dict[str, Any], **fields: Any) -> str:
    ctx = WriteContext(book_id=BOOK, source="extraction", produced_via="pipeline")
    draft = make_draft(claim_type, confidence=0.9, content=content, quotes=[DEFAULT_QUOTE], **fields)
    async with sf() as session, session.begin():
        return (await write_evidence(session, ctx, draft, FakeParagraphs())).id


async def seed_character(sf, name: str, mention_count: int = 10, kind: str = "person", **extra) -> str:
    return await _write(
        sf, "character",
        {"canonical_name": name, "kind": kind, "mention_count": mention_count, "first_chapter": 1, **extra},
    )


async def seed_event(
    sf, title: str, chapter: int, rank: int, participants: list[str], *,
    visibility: str = "public", description: str | None = None, **extra,
) -> str:
    return await _write(
        sf, "event",
        {"title": title, "event_type": "plot", "description": description or f"{title}，在倫敦發生。",
         "chapter": chapter, "text_rank": rank, "visibility": visibility, **extra},
        summary=title, discourse_chapter=chapter,
        subjects=[SubjectRef(subject_id=p, role="participant") for p in participants],
    )


async def seed_relation(
    sf, a: str, b: str, chapter: int, relation_type: str = "friendship", *,
    names: tuple[str, str] = ("甲", "乙"), description: str | None = None, weight: float = 1.0,
) -> str:
    polarity = "negative" if relation_type == "enemy" else "positive"
    return await _write(
        sf, "relation_state",
        {"source_id": a, "target_id": b, "relation_type": relation_type, "polarity": polarity,
         "weight": weight, "description": description or f"{names[0]}與{names[1]}的關係"},
        summary=f"{names[0]} → {names[1]}（{relation_type}）", discourse_chapter=chapter,
        subjects=[SubjectRef(subject_id=a, role="source"), SubjectRef(subject_id=b, role="target")],
    )


async def seed_utterance(
    sf, speaker: str, addressees: list[str], chapter: int, *, name: str = "甲", text: str = "你好。"
) -> str:
    return await _write(
        sf, "utterance",
        {"speaker_id": speaker, "kind": "dialogue", "text": text, "addressee_ids": addressees},
        summary=f"{name}：{text}", discourse_chapter=chapter,
        subjects=[SubjectRef(subject_id=speaker, role="speaker"),
                  *(SubjectRef(subject_id=a, role="addressee") for a in addressees)],
    )


async def all_evidence(sf, claim_type: str) -> list[Evidence]:
    async with sf() as session:
        return list(
            await session.scalars(
                select(Evidence).where(Evidence.claim_type == claim_type, Evidence.status == "current")
            )
        )
