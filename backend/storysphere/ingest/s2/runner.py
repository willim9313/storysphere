"""S2 整併的主流程（02 §4）。不叫 LLM；意象分群用 embedding（可注入）。

整個寫入在一個交易裡：一個 run（`ref_id="ingest.s2"`）的產出要一起成功或一起失敗，
`complete_run` 讓重跑時舊的一批變 superseded。
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from storysphere.ingest.s2.characters import MergedCharacter, RawCharacter, merge_characters
from storysphere.ingest.s2.common import UnitView
from storysphere.ingest.s2.drafts import (
    NameResolver,
    assign_text_rank,
    character_drafts,
    event_drafts,
    focalization_drafts,
    relation_drafts,
    utterance_drafts,
)
from storysphere.ingest.s2.imagery import DEFAULT_EMBEDDING_MODEL, SIMILARITY_THRESHOLD, Embedder
from storysphere.ingest.s2.motifs import collect_occurrences, imagery_drafts, setting_drafts
from storysphere.ingest.s2.parse import clean_str, list_items, str_list
from storysphere.ingest.s2.report import (
    CHARACTER_UNTAGGED,
    FIELD_INVALID,
    MALFORMED_ITEM,
    WRITE_REJECTED,
    S2Report,
)
from storysphere.ingest.s2.tagging import TagHit, build_surface_map, compile_pattern, tag_paragraph
from storysphere.ingest.units import build_units
from storysphere.store.books import BookParagraphSource, get_book
from storysphere.store.dedupe import dedupe_drafts
from storysphere.store.evidence_writer import (
    EvidenceDraft,
    EvidenceWriteError,
    WriteContext,
    write_evidence,
)
from storysphere.store.ingest_units import IngestUnitOutputRow, IngestUnitRow
from storysphere.store.lifecycle import complete_run
from storysphere.store.paragraph_entities import Mention, replace_mentions
from storysphere.store.tables import Run

logger = logging.getLogger(__name__)

S2_REF_ID = "ingest.s2"
_STAGES = ("s1a", "s1b")
_CHARACTER_KINDS = ("person", "group", "animal")


async def _load_views(
    session: AsyncSession, book_id: str
) -> tuple[list[UnitView], dict[str, str]] | None:
    """Units (reading order) with their S1 outputs, and the text of their paragraphs."""
    doc = await get_book(session, book_id)
    if doc is None:
        return None
    done = {
        (row.stage, row.unit_id)
        for row in await session.scalars(
            select(IngestUnitRow).where(
                IngestUnitRow.book_id == book_id,
                IngestUnitRow.stage.in_(_STAGES),
                IngestUnitRow.status == "done",
            )
        )
    }
    outputs = {
        (row.stage, row.unit_id): row.raw_json
        for row in await session.scalars(
            select(IngestUnitOutputRow).where(
                IngestUnitOutputRow.book_id == book_id, IngestUnitOutputRow.stage.in_(_STAGES)
            )
        )
    }
    views = []
    for unit in build_units(doc):
        s1a, s1b = (
            outputs.get((stage, unit.id)) if (stage, unit.id) in done else None for stage in _STAGES
        )
        if s1a is not None or s1b is not None:
            views.append(UnitView(unit, s1a, s1b))
    paragraph_ids = [pid for view in views for pid in view.unit.paragraph_ids]
    texts = await BookParagraphSource(session).get_texts(paragraph_ids)
    return views, texts


def parse_characters(views: Sequence[UnitView], report: S2Report) -> list[RawCharacter]:
    raws: list[RawCharacter] = []
    for view in views:
        unit = view.unit
        for item in list_items(view.s1a, "characters", report, unit.id):
            name = clean_str(item.get("name"))
            if name is None:
                report.drop(MALFORMED_ITEM, f"{unit.id}: character without name")
                continue
            kind = (clean_str(item.get("kind")) or "").lower()
            if kind == "organization":
                kind = "group"
            if kind not in _CHARACTER_KINDS:
                report.drop_field(
                    FIELD_INVALID, f"{unit.id}: character '{name}' kind '{kind}' → person"
                )
                kind = "person"
            attributes = item.get("attributes")
            raws.append(
                RawCharacter(
                    name=name,
                    kind=kind,
                    aliases=str_list(item.get("aliases")),
                    description=clean_str(item.get("description")),
                    attributes=attributes if isinstance(attributes, dict) else {},
                    chapter=unit.chapter,
                )
            )
    return raws


def tag_book(
    views: Sequence[UnitView], texts: dict[str, str], characters: list[MergedCharacter]
) -> tuple[list[tuple[str, TagHit]], dict[int, tuple[str, TagHit]]]:
    """All mentions in reading order, and each character's first mention."""
    surface_map = build_surface_map(characters)
    pattern = compile_pattern(surface_map)
    if pattern is None:
        return [], {}
    hits: list[tuple[str, TagHit]] = []
    first: dict[int, tuple[str, TagHit]] = {}
    for view in views:
        for paragraph_id in view.unit.paragraph_ids:
            for hit in tag_paragraph(texts.get(paragraph_id, ""), pattern, surface_map):
                hits.append((paragraph_id, hit))
                first.setdefault(hit.character_index, (paragraph_id, hit))
    return hits, first


async def write_all(
    session: AsyncSession,
    ctx: WriteContext,
    drafts: Sequence[EvidenceDraft],
    report: S2Report,
) -> list[str | None]:
    """Write every draft in its own savepoint; the evidence id, or None if it was rejected."""
    source = BookParagraphSource(session)
    ids: list[str | None] = []
    for draft in drafts:
        try:
            async with session.begin_nested():
                evidence = await write_evidence(session, ctx, draft, source)
        except EvidenceWriteError as exc:
            report.drop(WRITE_REJECTED, f"{draft.claim_type} '{draft.summary[:40]}': {exc}")
            ids.append(None)
            continue
        report.count_written(draft.claim_type)
        ids.append(evidence.id)
    return ids


async def run_s2(
    session_factory: async_sessionmaker[AsyncSession],
    book_id: str,
    *,
    job_id: str | None = None,
    embedder: Embedder | None = None,
) -> S2Report:
    """Consolidate the stored S1 outputs of ``book_id`` into level 1 evidence."""
    report = S2Report()

    async with session_factory() as session:
        loaded = await _load_views(session, book_id)
    if loaded is None:
        raise LookupError(f"Book {book_id} not found")
    views, texts = loaded
    report.units_used = len(views)

    # ── 不需要 id 的部分：角色合併、段落標記、意象、書籍背景 ──
    raws = parse_characters(views, report)
    characters = merge_characters(raws)
    mention_hits, first_mentions = tag_book(views, texts, characters)
    for i, character in enumerate(characters):
        if i not in first_mentions:
            report.drop(
                CHARACTER_UNTAGGED, f"character '{character.canonical_name}' never found in text"
            )
    report.raw_characters = len(raws)
    report.merged_characters = len(first_mentions)
    report.tagged_mentions = len(mention_hits)

    motif_drafts = await imagery_drafts(collect_occurrences(views, texts, report), embedder, report)
    motif_drafts += setting_drafts(views, texts, report)

    # ── 寫入（一個交易） ──
    async with session_factory() as session, session.begin():
        run = Run(
            book_id=book_id,
            ref_id=S2_REF_ID,
            status="running",
            job_id=job_id,
            triggered_by="auto",
            started_at=datetime.now(UTC),
            params_json={
                "embedding_model": DEFAULT_EMBEDDING_MODEL,
                "cluster_threshold": SIMILARITY_THRESHOLD,
            },
        )
        session.add(run)
        await session.flush()
        report.run_id = run.id
        ctx = WriteContext(
            book_id=book_id, source="extraction", produced_via="pipeline", run_id=run.id
        )

        # 角色先寫：其他類型要它的 id。角色已由合併規則決定，不再過去重。
        char_drafts = character_drafts(characters, first_mentions)
        char_ids = await write_all(session, ctx, [d for _, d in char_drafts], report)
        written = {
            index: evidence_id
            for (index, _), evidence_id in zip(char_drafts, char_ids, strict=True)
            if evidence_id is not None
        }
        resolver = NameResolver((evidence_id, characters[i]) for i, evidence_id in written.items())

        drafts: list[EvidenceDraft] = []
        for view in views:
            drafts += event_drafts(view, texts, resolver, report)
        for view in views:
            drafts += relation_drafts(view, texts, resolver, report)
            drafts += utterance_drafts(view, texts, resolver, report)
        drafts += focalization_drafts(views, texts, resolver, report)
        drafts += motif_drafts

        deduped = dedupe_drafts(drafts)
        report.merged_duplicates = len(drafts) - len(deduped)
        await write_all(session, ctx, assign_text_rank(deduped), report)

        await replace_mentions(
            session,
            book_id,
            (
                Mention(paragraph_id, written[hit.character_index], hit.start, hit.end, hit.surface)
                for paragraph_id, hit in mention_hits
                if hit.character_index in written
            ),
        )
        run.summary_json = report.to_dict()
        await complete_run(session, run.id)

    logger.info("run_s2 done: book=%s %s", book_id, report.to_dict())
    return report
