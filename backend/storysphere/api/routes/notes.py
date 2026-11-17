"""N-06a–e：筆記與詮釋（04 §4.6）。

原型範圍（使用者 2026-11-17 決定）：重跑只支援 `methodologyTrace.kind=ui_run`。
從 agent 草稿建立（`origin=draft`）在 T27 補上。
筆記與詮釋都是使用者在 UI 按確認才寫入（01 §5），agent 不能呼叫這些端點。
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any, TypeVar

from fastapi import APIRouter, Body, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from storysphere.api.deps import BookDep, MethodEngineDep, MethodJobsDep, PagingDep, SessionDep
from storysphere.api.errors import ApiError, not_found, validation_error
from storysphere.api.queries.evidence import (
    EvidenceFilter,
    list_evidence,
    to_evidence,
    to_list_items,
)
from storysphere.api.queries.trigger import scope_of, trigger_method
from storysphere.api.routes.agent import GatewayDep
from storysphere.api.schemas.common import next_cursor
from storysphere.api.schemas.notes import (
    InterpretationCreated,
    InterpretationIn,
    NoteCreated,
    NoteDetail,
    NoteFromDraftIn,
    NoteFromRunIn,
    NoteListItem,
    NotePage,
)
from storysphere.api.schemas.runs import TriggerOut
from storysphere.gateway.service import Gateway, invalid_state
from storysphere.store.agent import AgentSessionRow, mcp_methodology_trace
from storysphere.store.content_tables import get_content
from storysphere.store.evidence_writer import (
    EvidenceDraft,
    SystemFieldForbiddenError,
    WriteContext,
    assert_no_system_fields,
    write_evidence,
)
from storysphere.store.notes import citation_problems
from storysphere.store.tables import Evidence as EvidenceRow
from storysphere.store.tables import EvidenceLink
from storysphere.store.tables import Run as RunRow

router = APIRouter(tags=["notes"])

_M = TypeVar("_M", bound=BaseModel)

SUMMARY_CHARS = 200


def _parse(model: type[_M], raw: dict[str, Any]) -> _M:
    """系統欄位回 422 `system_field_forbidden`（不是默默忽略，04 §1.5），其餘照 schema 驗。"""
    try:
        assert_no_system_fields(raw)
    except SystemFieldForbiddenError as exc:
        raise ApiError(422, "system_field_forbidden", str(exc)) from exc
    try:
        return model.model_validate(raw)
    except ValidationError as exc:
        first = exc.errors()[0]
        where = ".".join(str(part) for part in first["loc"])
        raise validation_error(f"{where}: {first['msg']}") from exc


async def _check_citations(session: AsyncSession, book_id: str, ids: list[str]) -> None:
    """01 §5 筆記規則：至少一筆、都在本書、全部 ≥ 2 層、沒有 rejected。"""
    problems = await citation_problems(session, book_id, ids)
    if problems:
        first = problems[0]
        code = (
            "validation_error" if first["code"] in ("no_citation", "not_found") else first["code"]
        )
        raise ApiError(422, code, first["message"], evidenceId=first.get("evidenceId"))


async def _note_or_404(session: AsyncSession, book_id: str, note_id: str) -> EvidenceRow:
    row = await session.get(EvidenceRow, note_id)
    if row is None or row.book_id != book_id or row.claim_type != "note":
        raise not_found("Note", note_id)
    return row


@router.get("/books/{book_id}/notes", response_model=NotePage)
async def list_notes(
    book: BookDep,
    session: SessionDep,
    paging: PagingDep,
    basis_changed: Annotated[bool | None, Query(alias="basisChanged")] = None,
    produced_via: Annotated[str | None, Query(alias="producedVia")] = None,
    q: str | None = None,
) -> NotePage:
    """N-06a 筆記列表，新到舊。"""
    flt = EvidenceFilter(claim_types=["note"], basis_changed=basis_changed, q=q, sort="createdAt")
    rows, total = await list_evidence(session, book.id, flt, offset=0, limit=10_000)
    if produced_via is not None:
        rows = [row for row in rows if row.produced_via == produced_via]
        total = len(rows)
    rows = sorted(rows, key=lambda row: row.created_at, reverse=True)
    page = rows[paging.offset : paging.offset + paging.limit]
    counts = dict(
        (
            await session.execute(
                select(EvidenceLink.evidence_id, func.count())
                .where(EvidenceLink.evidence_id.in_([row.id for row in page]))
                .group_by(EvidenceLink.evidence_id)
            )
        ).all()
    )
    items = []
    for row in page:
        content = await get_content(session, "note", row.id) or {}
        items.append(
            NoteListItem(
                id=row.id,
                title=content.get("title", row.summary),
                question=content.get("question"),
                level=row.level,
                basis_changed=row.basis_changed,
                produced_via=row.produced_via,
                agent_backend=row.agent_backend,
                cited_count=counts.get(row.id, 0),
                created_at=row.created_at,
            )
        )
    return NotePage(
        items=items, next_cursor=next_cursor(paging.offset, len(page), total), total=total
    )


@router.get("/books/{book_id}/notes/{note_id}", response_model=NoteDetail)
async def get_note(book: BookDep, note_id: str, session: SessionDep) -> NoteDetail:
    """N-06b：結論、引用的證據（展開一層，superseded 照實標示）、引用此筆記的詮釋。"""
    row = await _note_or_404(session, book.id, note_id)
    (note,) = await to_evidence(session, [row])
    cited_ids = [link.upstream_id for link in note.derived_from]
    cited_rows = list(
        await session.scalars(select(EvidenceRow).where(EvidenceRow.id.in_(cited_ids)))
    )
    order = {evidence_id: index for index, evidence_id in enumerate(cited_ids)}
    cited_rows.sort(key=lambda r: order[r.id])
    interp_rows = list(
        await session.scalars(
            select(EvidenceRow)
            .join(EvidenceLink, EvidenceLink.evidence_id == EvidenceRow.id)
            .where(
                EvidenceLink.upstream_id == note_id,
                EvidenceRow.claim_type == "interpretation",
                EvidenceRow.status != "rejected",
            )
            .order_by(EvidenceRow.created_at)
        )
    )
    return NoteDetail(
        **note.model_dump(),
        cited=await to_list_items(session, cited_rows, with_content=True),
        interpretations=await to_list_items(session, interp_rows, with_content=True),
    )


async def _ui_run_trace(session: AsyncSession, run: RunRow) -> dict[str, Any]:
    """04 §5.6 `ui_run`：這個 run 與它的步驟 run（上游補跑、方法論步驟）。"""
    steps = list(
        await session.scalars(
            select(RunRow).where(RunRow.parent_run_id == run.id).order_by(RunRow.created_at)
        )
    )
    return {
        "kind": "ui_run",
        "runs": [
            {
                "run_id": r.id,
                "ref_id": r.ref_id,
                "version": r.ref_version,
                "prompt_version": r.prompt_version,
                "model": r.model,
                "params": r.params_json or {},
            }
            for r in [run, *steps]
        ],
    }


async def _note_from_draft(
    book_id: str, session: AsyncSession, gateway: Gateway, body: NoteFromDraftIn
) -> NoteCreated:
    """N-06c `origin=draft`：寫筆記、草稿標 confirmed、發 `note_draft`（op=confirmed）。"""
    row = await session.get(AgentSessionRow, body.session_id)
    if row is None or row.book_id != book_id:
        raise not_found("Agent session", body.session_id)
    drafts = [dict(d) for d in row.drafts_json]
    draft = next((d for d in drafts if d["draft_id"] == body.draft_id), None)
    if draft is None:
        raise not_found("Draft", body.draft_id)
    if draft["state"] != "open":
        raise invalid_state(f"Draft {body.draft_id} is {draft['state']}.")

    edited = any(
        value is not None for value in (body.title, body.conclusion, body.cited_evidence_ids)
    )
    title = body.title if body.title is not None else draft["title"]
    conclusion = body.conclusion if body.conclusion is not None else draft["conclusion"]
    cited = body.cited_evidence_ids
    ids = list(dict.fromkeys(cited if cited is not None else draft["cited_evidence_ids"]))
    await _check_citations(session, book_id, ids)

    ctx = WriteContext(
        book_id=book_id,
        source="agent",
        produced_via="agent",
        agent_backend=row.backend,
        review_status="modified" if edited else "approved",
    )
    note_draft = EvidenceDraft(
        claim_type="note",
        summary=title[:SUMMARY_CHARS],
        confidence=1.0,
        content={
            "title": title,
            "conclusion": conclusion,
            # 從草稿建立的筆記以 trace 為準（01 §5）。
            "methodology_run_id": None,
            "methodology_trace": await mcp_methodology_trace(session, row, draft, ids),
            "question": draft.get("question"),
        },
        derived_from=ids,
    )
    note_row = await write_evidence(session, ctx, note_draft)
    draft.update(state="confirmed", note_id=note_row.id, updated_at=datetime.now(UTC).isoformat().replace("+00:00", "Z"))
    row.drafts_json = drafts
    await session.commit()
    gateway.notify_draft(row, "confirmed", draft)
    (note,) = await to_evidence(session, [note_row])
    return NoteCreated(note=note)


@router.post("/books/{book_id}/notes", response_model=NoteCreated, status_code=201)
async def create_note(
    book: BookDep,
    session: SessionDep,
    engine: MethodEngineDep,
    gateway: GatewayDep,
    raw: Annotated[dict[str, Any], Body()],
) -> NoteCreated:
    """N-06c 存成筆記：從結果卡或 agent 草稿（使用者按確認＝人工審核，01 §5）。"""
    if raw.get("origin") == "draft":
        return await _note_from_draft(book.id, session, gateway, _parse(NoteFromDraftIn, raw))
    body = _parse(NoteFromRunIn, raw)
    if body.origin != "run":
        raise validation_error("origin must be 'run' or 'draft'.")
    run = await session.get(RunRow, body.from_run_id)
    if run is None or run.book_id != book.id:
        raise not_found("Run", body.from_run_id)
    ids = list(dict.fromkeys(body.cited_evidence_ids))
    await _check_citations(session, book.id, ids)

    decl = engine.registry.methods.get(run.ref_id) or engine.registry.methodologies.get(run.ref_id)
    ctx = WriteContext(
        book_id=book.id, source="method", produced_via="ui", review_status="approved"
    )
    draft = EvidenceDraft(
        claim_type="note",
        summary=body.title[:SUMMARY_CHARS],
        # 筆記是使用者確認過的結論（01 §5）。
        confidence=1.0,
        content={
            "title": body.title,
            "conclusion": body.conclusion,
            "methodology_run_id": run.id,
            "methodology_trace": await _ui_run_trace(session, run),
            "question": decl.question if decl else None,
        },
        derived_from=ids,
    )
    row = await write_evidence(session, ctx, draft)
    await session.commit()
    (note,) = await to_evidence(session, [row])
    return NoteCreated(note=note)


@router.post("/books/{book_id}/notes/{note_id}/rerun", response_model=TriggerOut, status_code=202)
async def rerun_note(
    book: BookDep,
    note_id: str,
    session: SessionDep,
    engine: MethodEngineDep,
    jobs: MethodJobsDep,
) -> JSONResponse:
    """N-06d 依筆記的 `methodologyTrace` 重跑；筆記本身不變。

    原型只支援 `ui_run`：照主 run 的 refId、params、主體重跑（同 N-04d）。回應同 N-04a 的形狀。
    """
    row = await _note_or_404(session, book.id, note_id)
    content = await get_content(session, "note", row.id) or {}
    trace = content.get("methodology_trace") or {}
    if trace.get("kind") != "ui_run" or not trace.get("runs"):
        raise validation_error("Only notes saved from a result card (ui_run) can be rerun for now.")
    run = await session.get(RunRow, trace["runs"][0]["run_id"])
    if run is None or run.book_id != book.id:
        raise ApiError(409, "invalid_state", "The run this note came from no longer exists.")
    status_code, out = await trigger_method(
        session, engine, jobs, book.id, run.ref_id,
        params=dict(run.params_json or {}), scope=scope_of(run), force=True, dry_run=False,
    )  # fmt: skip
    return JSONResponse(status_code=status_code, content=out.model_dump(mode="json", by_alias=True))


@router.post(
    "/books/{book_id}/interpretations", response_model=InterpretationCreated, status_code=201
)
async def create_interpretation(
    book: BookDep, session: SessionDep, raw: Annotated[dict[str, Any], Body()]
) -> InterpretationCreated:
    """N-06e 使用者寫詮釋：引用至少一筆、全部 ≥ 2 層（原型決定）。"""
    body = _parse(InterpretationIn, raw)
    ids = list(dict.fromkeys(body.cited_evidence_ids))
    await _check_citations(session, book.id, ids)
    ctx = WriteContext(book_id=book.id, source="user", produced_via="ui", review_status="approved")
    draft = EvidenceDraft(
        claim_type="interpretation",
        summary=body.text[:SUMMARY_CHARS],
        confidence=1.0,
        content={"text": body.text},
        derived_from=ids,
    )
    row = await write_evidence(session, ctx, draft)
    await session.commit()
    (interpretation,) = await to_evidence(session, [row])
    return InterpretationCreated(interpretation=interpretation)
