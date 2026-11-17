"""寫入與呈現類 MCP 工具（04 §5.5）：`create_note`、`add_interpretation`、`link_evidence`、`show_view`。

`cited_evidence_ids` 的驗證三條（04 §5.5）：
1. 每個 id 都要在本 session 的 trace 裡（讀過，或本 session 觸發的 run 產出）→ 否則 `not_in_trace`。
2. 筆記規則：第 1 層、`rejected` 不能引用。草稿不擋，寫進 `check.problems`；詮釋直接拒絕。
3. `derived_from`＝通過驗證的 id。

草稿存在 `agent_sessions.drafts_json`，不進 `evidence`；確認寫入是 N-06c（使用者按確認），不在這裡。
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from mcp.server.mcpserver import Context, MCPServer
from mcp.types import CallToolResult
from sqlalchemy import select, update

from storysphere.mcp.runtime import Call, McpToolError, ToolEnv, ToolResult, run_tool
from storysphere.store.agent import AgentSessionRow, TraceCallRow, traced_evidence_ids
from storysphere.store.evidence_writer import (
    EvidenceDraft,
    SystemFieldForbiddenError,
    WriteContext,
    assert_no_system_fields,
    write_evidence,
)
from storysphere.store.notes import citation_problems
from storysphere.store.tables import Evidence, Run

SUMMARY_CHARS = 200


def _now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def raw_arguments(ctx: Context) -> dict[str, Any]:
    """The call's arguments as sent: the SDK silently drops unknown keys before the tool runs."""
    try:
        params = ctx.request_context.params or {}
    except ValueError:  # 不在請求裡（直接呼叫）
        return {}
    return dict(params.get("arguments") or {})


def _forbid_system_fields(ctx: Context) -> None:
    try:
        assert_no_system_fields(raw_arguments(ctx))
    except SystemFieldForbiddenError as err:
        raise McpToolError(
            "system_field_forbidden",
            str(err),
            "Remove system fields; the server fills level, source, derived_from etc. itself.",
        ) from err


async def _require_traced(call: Call, ids: list[str]) -> None:
    """Rule 1: the brain may only cite evidence it has read in this session."""
    traced = await traced_evidence_ids(call.db, call.session.session_id)
    missing = [i for i in ids if i not in traced]
    if missing:
        raise McpToolError(
            "not_in_trace",
            f"Not read in this session: {', '.join(missing)}.",
            "Read the evidence first (get_evidence or search_evidence), then cite it.",
        )


async def _note_problems(call: Call, ids: list[str]) -> list[dict[str, Any]]:
    """Rule 2 (01 §5 note rules) as `check.problems`; empty＝can be saved."""
    return await citation_problems(call.db, call.session.book_id, ids)


def _check(problems: list[dict[str, Any]]) -> dict[str, Any]:
    return {"ok": not problems, "problems": problems}


def draft_event(draft: dict[str, Any]) -> dict[str, Any]:
    """NoteDraft（04 §2.5）的 API 形狀（camelCase）。"""
    return {
        "draftId": draft["draft_id"],
        "sessionId": draft["session_id"],
        "title": draft["title"],
        "conclusion": draft["conclusion"],
        "citedEvidenceIds": draft["cited_evidence_ids"],
        "question": draft["question"],
        # T27 之前建立的草稿沒有這個欄位。
        "turnId": draft.get("turn_id"),
        "state": draft["state"],
        "check": draft["check"],
        "noteId": draft["note_id"],
        "createdAt": draft["created_at"],
        "updatedAt": draft["updated_at"],
    }


async def _session_row(call: Call) -> AgentSessionRow:
    row = await call.db.get(AgentSessionRow, call.session.session_id)
    assert row is not None
    return row


def _dedupe(ids: list[str]) -> list[str]:
    return list(dict.fromkeys(ids))


def register(server: MCPServer, env: ToolEnv) -> None:
    @server.tool()
    async def create_note(
        title: str, conclusion: str, cited_evidence_ids: list[str], ctx: Context
    ) -> CallToolResult:
        """Draft a note (markdown conclusion citing evidence you have read); the user confirms it in the UI."""

        async def body(call: Call) -> ToolResult:
            _forbid_system_fields(ctx)
            ids = _dedupe(cited_evidence_ids)
            await _require_traced(call, ids)
            now = _now()
            draft = {
                "draft_id": str(uuid.uuid4()),
                "session_id": call.session.session_id,
                "title": title,
                "conclusion": conclusion,
                "cited_evidence_ids": ids,
                "question": call.session.question,
                # 前端用 turn_id 把草稿放回它那一輪（05 §3.3）；call_seq 是確認時切 trace 的位置
                # （04 §5.6「到該次 create_note 為止」），不對外。
                "turn_id": call.trace.turn_id,
                "call_seq": call.trace.seq,
                "state": "open",
                "check": _check(await _note_problems(call, ids)),
                "note_id": None,
                "created_at": now,
                "updated_at": now,
            }
            row = await _session_row(call)
            row.drafts_json = [*row.drafts_json, draft]
            await call.db.commit()
            env.emit(call.session, "note_draft", {"op": "created", "draft": draft_event(draft)})
            return ToolResult(
                {"draft_id": draft["draft_id"], "check": draft["check"]},
                summary="筆記草稿已建立" if draft["check"]["ok"] else "筆記草稿有問題",
            )

        args = {"title": title, "conclusion": conclusion, "cited_evidence_ids": cited_evidence_ids}
        return await run_tool(ctx, env, "create_note", args, body)

    @server.tool()
    async def link_evidence(
        draft_id: str,
        ctx: Context,
        add_ids: list[str] | None = None,
        remove_ids: list[str] | None = None,
    ) -> CallToolResult:
        """Add or remove cited evidence on an open note draft created in this session."""

        async def body(call: Call) -> ToolResult:
            _forbid_system_fields(ctx)
            row = await _session_row(call)
            drafts = [dict(d) for d in row.drafts_json]
            draft = next((d for d in drafts if d["draft_id"] == draft_id), None)
            if draft is None:
                raise McpToolError("not_found", f"Draft {draft_id} not found in this session.")
            if draft["state"] != "open":
                raise McpToolError(
                    "invalid_state",
                    f"Draft {draft_id} is {draft['state']}.",
                    "Create a new note with create_note instead.",
                )
            await _require_traced(call, add_ids or [])
            removed = set(remove_ids or [])
            ids = [i for i in draft["cited_evidence_ids"] if i not in removed]
            ids = _dedupe([*ids, *(i for i in add_ids or [] if i not in removed)])
            draft["cited_evidence_ids"] = ids
            draft["check"] = _check(await _note_problems(call, ids))
            draft["updated_at"] = _now()
            row.drafts_json = drafts
            await call.db.commit()
            env.emit(call.session, "note_draft", {"op": "updated", "draft": draft_event(draft)})
            return ToolResult(
                {"draft_id": draft_id, "cited_evidence_ids": ids, "check": draft["check"]},
                summary=f"草稿引用 {len(ids)} 筆",
            )

        args = {"draft_id": draft_id, "add_ids": add_ids, "remove_ids": remove_ids}
        return await run_tool(ctx, env, "link_evidence", args, body)

    @server.tool()
    async def add_interpretation(
        text: str, cited_evidence_ids: list[str], ctx: Context
    ) -> CallToolResult:
        """Write an interpretation citing evidence you have read; waits for the user's approval."""

        async def body(call: Call) -> ToolResult:
            _forbid_system_fields(ctx)
            ids = _dedupe(cited_evidence_ids)
            await _require_traced(call, ids)
            problems = await _note_problems(call, ids)
            if problems:
                first = problems[0]
                raise McpToolError(
                    first["code"],
                    first["message"],
                    "Cite level-2+ evidence that is not rejected (e.g. a method result).",
                )

            request_id = str(uuid.uuid4())
            await call.db.execute(
                update(TraceCallRow)
                .where(TraceCallRow.id == call.trace.id)
                .values(status="pending_approval", approval_request_id=request_id)
            )
            await call.db.commit()
            env.approvals.open(request_id)
            env.emit(
                call.session,
                "approval_request",
                {
                    "requestId": request_id,
                    "callId": call.trace.seq,
                    "tool": "add_interpretation",
                    "args": {"text": text, "cited_evidence_ids": ids},
                    "reason": "add_interpretation writes evidence; it needs your approval.",
                    "origin": "mcp",
                },
            )
            if not await env.approvals.wait(request_id):
                raise McpToolError(
                    "approval_denied",
                    "The user declined this interpretation.",
                    "Do not retry; ask the user what to change.",
                    status="denied",
                )

            write_ctx = WriteContext(
                book_id=call.session.book_id,
                source="agent",
                produced_via="agent",
                agent_backend=call.session.backend,
                # 原型決定：使用者在確認時已看過（04 §5.5）。
                review_status="approved",
            )
            draft = EvidenceDraft(
                claim_type="interpretation",
                summary=text[:SUMMARY_CHARS],
                # 原型決定：使用者確認過的詮釋，信心度記 1.0。
                confidence=1.0,
                content={"text": text},
                derived_from=ids,
            )
            evidence = await write_evidence(call.db, write_ctx, draft)
            await call.db.commit()
            return ToolResult(
                {"evidence_id": evidence.id, "level": evidence.level},
                evidence_ids=[evidence.id],
                summary=f"詮釋已寫入（第 {evidence.level} 層）",
            )

        args = {"text": text, "cited_evidence_ids": cited_evidence_ids}
        return await run_tool(ctx, env, "add_interpretation", args, body)

    @server.tool()
    async def show_view(view_type: str, data_ref: dict[str, Any], ctx: Context) -> CallToolResult:
        """Show a result view in the user's workspace; data_ref is {run_id} or {evidence_ids: [...]}."""

        async def body(call: Call) -> ToolResult:
            if view_type not in env.registry.views:
                raise McpToolError(
                    "unknown_view",
                    f"Unknown view_type '{view_type}'.",
                    f"Use one of: {', '.join(sorted(env.registry.views))}.",
                )
            book_id = call.session.book_id
            if set(data_ref) == {"run_id"}:
                run = await call.db.get(Run, data_ref["run_id"])
                if run is None or run.book_id != book_id:
                    raise McpToolError("not_found", f"Run {data_ref['run_id']} not found.")
                ref: dict[str, Any] = {"runId": run.id}
            elif set(data_ref) == {"evidence_ids"} and data_ref["evidence_ids"]:
                evidence_ids = list(dict.fromkeys(data_ref["evidence_ids"]))
                found = set(
                    await call.db.scalars(
                        select(Evidence.id).where(
                            Evidence.id.in_(evidence_ids), Evidence.book_id == book_id
                        )
                    )
                )
                if missing := [i for i in evidence_ids if i not in found]:
                    raise McpToolError("not_found", f"Evidence not found: {', '.join(missing)}.")
                ref = {"evidenceIds": evidence_ids}
            else:
                raise McpToolError(
                    "validation_error",
                    "data_ref must be {run_id} or {evidence_ids: [...]} (non-empty).",
                )
            view_id = str(uuid.uuid4())
            env.emit(
                call.session,
                "view",
                {"viewId": view_id, "viewType": view_type, "dataRef": ref},
            )
            # 不把 data_ref 的 id 記成「讀過」：大腦只是指名，沒有讀到內容（04 §5.5 規則 1）。
            return ToolResult({"view_id": view_id}, summary=f"顯示 {view_type}")

        args = {"view_type": view_type, "data_ref": data_ref}
        return await run_tool(ctx, env, "show_view", args, body)
