"""N-03b 結果卡、N-03c「也可以問」。"""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import select

from storysphere.api.deps import BookDep, MethodEngineDep, RegistryDep, SessionDep
from storysphere.api.queries.cards import card_state, open_method_jobs, static_precheck
from storysphere.api.routes.books import effective_genre
from storysphere.api.schemas.common import camelize
from storysphere.api.schemas.overview import Askable, AskableItem, Card, OtherSignal
from storysphere.registry.loader import Registry
from storysphere.store.ingest_units import IngestUnitOutputRow, IngestUnitRow

router = APIRouter(tags=["overview"])

UNIVERSAL = "universal"
# 題材的主機制：原型只做推理（02 §6）。主機制不列進「其他題材訊號」。
PRIMARY_MECHANISM = {"mystery": "info_control"}


def default_cards(registry: Registry, genre: str | None) -> list[tuple[str, str, str]]:
    """(perspective, ref_id, question) of the book's default cards, in registry order."""
    cards = []
    for perspective in (UNIVERSAL, genre):
        decl = registry.perspectives.get(perspective) if perspective else None
        if decl is None or (perspective == genre == UNIVERSAL and cards):
            continue
        cards.extend((perspective, card.ref, card.question) for card in decl.cards)
    return cards


@router.get("/books/{book_id}/cards", response_model=list[Card])
async def list_cards(
    book: BookDep, session: SessionDep, registry: RegistryDep, engine: MethodEngineDep
) -> list[Card]:
    """N-03b：通用卡在前，接著是有效題材的視角卡；狀態由該 refId 最新的 run 推得。"""
    open_jobs = await open_method_jobs(session, book.id)
    out = []
    for perspective, ref_id, question in default_cards(registry, effective_genre(book)):
        decl = registry.methods.get(ref_id) or registry.methodologies.get(ref_id)
        state = await card_state(session, book.id, ref_id, open_jobs)
        out.append(
            Card(
                ref_id=ref_id,
                code=decl.code if decl else None,
                question=question,
                perspective=perspective,
                view_type=decl.view if decl else None,
                state=state.state,
                implemented=engine.is_implemented(ref_id),
                run_id=state.run_id,
                job_id=state.job_id,
                max_level=state.max_level,
                finished_at=state.finished_at,
                precheck=camelize(state.precheck),
            )
        )
    return out


async def _signal_chapters(session, book_id: str) -> dict[str, list[int]]:
    """{mechanism: chapters} from the S1b signal outputs (02 §3 call B)."""
    rows = await session.execute(
        select(IngestUnitRow.chapter, IngestUnitOutputRow.raw_json)
        .join(
            IngestUnitRow,
            (IngestUnitRow.book_id == IngestUnitOutputRow.book_id)
            & (IngestUnitRow.stage == IngestUnitOutputRow.stage)
            & (IngestUnitRow.unit_id == IngestUnitOutputRow.unit_id),
        )
        .where(IngestUnitOutputRow.book_id == book_id, IngestUnitOutputRow.stage == "s1b")
    )
    found: dict[str, set[int]] = {}
    for chapter, raw in rows:
        signals = raw.get("signals") if isinstance(raw, dict) else None
        for signal in signals if isinstance(signals, list) else []:
            if isinstance(signal, dict) and isinstance(signal.get("mechanism"), str):
                found.setdefault(signal["mechanism"], set()).add(chapter)
    return {mechanism: sorted(chapters) for mechanism, chapters in found.items()}


@router.get("/books/{book_id}/askable", response_model=Askable)
async def get_askable(
    book: BookDep, session: SessionDep, registry: RegistryDep, engine: MethodEngineDep
) -> Askable:
    """N-03c：registry 所有問句扣掉預設卡，加上其他題材訊號的推薦。"""
    genre = effective_genre(book)
    on_cards = {ref_id for _p, ref_id, _q in default_cards(registry, genre)}
    items = []
    for decl in sorted(registry.methods.values(), key=lambda d: d.code):
        if decl.id in on_cards:
            continue
        items.append(
            AskableItem(
                ref_id=decl.id, code=decl.code, question=decl.question, ref_kind="method",
                layer=decl.layer, mechanism=decl.mechanism, grade=decl.grade,
                priority=decl.priority, implemented=engine.is_implemented(decl.id),
                precheck=camelize(await static_precheck(engine, book.id, decl.id)),
            )
        )  # fmt: skip
    for decl in registry.methodologies.values():
        if decl.id in on_cards:
            continue
        items.append(
            AskableItem(
                ref_id=decl.id, code=decl.code, question=decl.question, ref_kind="methodology",
                layer=None, mechanism=None, grade=decl.grade, priority=decl.priority,
                implemented=False, precheck=None,
            )
        )  # fmt: skip

    density = (book.genre_profile or {}).get("mechanism_density") or {}
    chapters = await _signal_chapters(session, book.id) if density else {}
    primary = PRIMARY_MECHANISM.get(genre or "")
    signals = [
        OtherSignal(
            mechanism=mechanism.id,
            density=density[mechanism.id],
            chapters=chapters.get(mechanism.id, []),
            suggested_question=mechanism.question,
            supported=mechanism.supported,
        )
        for mechanism in registry.mechanisms.values()
        if mechanism.id != primary and density.get(mechanism.id, 0) > 0
    ]
    signals.sort(key=lambda signal: signal.density, reverse=True)
    return Askable(askable=items, other_signals=signals)
