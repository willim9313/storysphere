"""讀取與分析類 MCP 工具（04 §5.3、§5.4），與 REST 共用服務層（04 §6.2）。

每個工具：參數照 04 原樣（snake_case）、`ctx: Context` 放最後；本體寫成 `async def _xxx(call)`
回 `ToolResult`，列出回傳的證據 id 與 run id（trace 與寫入驗證靠它）。

共同規則（04 §5.2）：`book_id` 由 session 決定；列表排除 `superseded`／`rejected`、含第 1 層；
列表型輸出的 `summary` 截 200 字、引文截 120 字，全文只走 `get_evidence`／`get_passage`。
證據內容與題材擴充用 01 的 snake_case 原名（REST 那層會轉 camelCase，這裡直接讀表）。
"""

from __future__ import annotations

from typing import Any

from mcp.server.mcpserver import Context, MCPServer
from mcp.types import CallToolResult
from pydantic.alias_generators import to_snake
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from storysphere.api.errors import ApiError
from storysphere.api.queries.evidence import (
    FIRST_QUOTE_CHARS,
    EvidenceFilter,
    list_evidence,
    to_evidence,
    to_list_items,
)
from storysphere.api.queries.runs import INGEST_REF_PREFIX, is_superseded, latest_done
from storysphere.api.queries.trigger import trigger_method
from storysphere.api.routes import evidence as evidence_routes
from storysphere.api.routes import runs as runs_routes
from storysphere.api.routes.books import effective_genre
from storysphere.api.schemas.common import decode_cursor, encode_cursor
from storysphere.api.schemas.jobs import job_out
from storysphere.mcp.runtime import Call, McpToolError, ToolEnv, ToolResult, run_tool
from storysphere.registry.checks import build_dag, methodology_layer
from storysphere.store.books import BookRow
from storysphere.store.content_tables import CONTENT_TABLES
from storysphere.store.tables import Evidence as EvidenceRow
from storysphere.store.tables import EvidenceGenreExt, EvidenceQuote, EvidenceSubject
from storysphere.store.tables import Job as JobRow
from storysphere.store.tables import Run as RunRow

SUMMARY_CHARS = 200
QUOTE_CHARS = FIRST_QUOTE_CHARS  # 120
SEARCH_LIMIT, SEARCH_MAX = 20, 50
EVENTS_LIMIT, EVENTS_MAX = 30, 100
PASSAGE_MAX_CONTEXT = 3
RUN_EVIDENCE_MAX = 100
ENTITY_QUOTES = 3
TRACE_MAX_DEPTH = evidence_routes.MAX_TRACE_DEPTH
_CHUNK = 500
# 一次 OR 子查詢最多取幾筆來合併（search_evidence 的 `A OR B`）。
_OR_PART_MAX = 500


# ── 共用小工具 ─────────────────────────────────────────────────


def _clip(text: str | None, limit: int) -> str | None:
    if text is None or len(text) <= limit:
        return text
    return text[: limit - 1] + "…"


def _bad_args(message: str, hint: str = "") -> McpToolError:
    return McpToolError("validation_error", message, hint)


def _clamp(value: int | None, default: int, low: int, high: int) -> int:
    return default if value is None else max(low, min(high, value))


def _visible(book_id: str) -> list[Any]:
    """讀取工具的可見範圍（04 §1.4 MCP 列）：current、沒被拒絕，含第 1 層。"""
    return [
        EvidenceRow.book_id == book_id,
        EvidenceRow.status == "current",
        EvidenceRow.review_status != "rejected",
    ]


async def _book(call: Call) -> BookRow:
    book = await call.db.get(BookRow, call.session.book_id)
    if book is None:
        raise McpToolError("not_found", f"Book {call.session.book_id} not found.")
    return book


async def _evidence_row(call: Call, evidence_id: str) -> EvidenceRow:
    row = await call.db.get(EvidenceRow, evidence_id)
    if row is None or row.book_id != call.session.book_id:
        raise McpToolError(
            "not_found",
            f"Evidence {evidence_id} not found.",
            "Use search_evidence to find evidence ids in this book.",
        )
    return row


async def _raw_content(db: AsyncSession, rows: list[EvidenceRow]) -> dict[str, dict[str, Any]]:
    """{evidence_id: content}，欄位名照 01（snake_case）；空的 `raw_label` 不回。"""
    by_type: dict[str, list[str]] = {}
    for row in rows:
        by_type.setdefault(row.claim_type, []).append(row.id)
    out: dict[str, dict[str, Any]] = {}
    for claim_type, ids in by_type.items():
        table = CONTENT_TABLES[claim_type]
        for start in range(0, len(ids), _CHUNK):
            result = await db.execute(
                select(table).where(table.c.evidence_id.in_(ids[start : start + _CHUNK]))
            )
            for mapping in result.mappings():
                content = {k: v for k, v in mapping.items() if k != "evidence_id"}
                if content.get("raw_label") is None:
                    content.pop("raw_label", None)
                out[mapping["evidence_id"]] = content
    return out


async def _raw_genre_ext(db: AsyncSession, evidence_id: str) -> list[dict[str, Any]]:
    exts = await db.scalars(
        select(EvidenceGenreExt)
        .where(EvidenceGenreExt.evidence_id == evidence_id)
        .order_by(EvidenceGenreExt.genre, EvidenceGenreExt.system_tag)
    )
    return [
        {"genre": ext.genre, "system_tag": ext.system_tag or None, "data": ext.data_json}
        for ext in exts
    ]


async def _full_evidence(db: AsyncSession, row: EvidenceRow) -> dict[str, Any]:
    """01 的完整證據（N-05b 的組裝），內容與題材擴充換成 snake_case 原名。"""
    (evidence,) = await to_evidence(db, [row])
    out = evidence.model_dump(mode="json")
    out["content"] = (await _raw_content(db, [row])).get(row.id, {})
    out["genre_ext"] = await _raw_genre_ext(db, row.id)
    return out


def _precheck_snake(precheck: dict[str, Any] | None) -> dict[str, Any] | None:
    """REST 回的 precheck 是 camelCase；MCP 用 snake_case（04 §1.1）。"""
    if precheck is None:
        return None
    return {to_snake(key): value for key, value in precheck.items()}


async def _current_runs(db: AsyncSession, book_id: str) -> dict[str, RunRow]:
    """{ref_id: 最新一筆沒被取代的 done run}（方法的 current 結果）。"""
    newest = await latest_done(db, book_id)
    out: dict[str, RunRow] = {}
    for run in await db.scalars(
        select(RunRow)
        .where(RunRow.book_id == book_id, RunRow.status == "done")
        .order_by(RunRow.created_at.desc(), RunRow.id)
    ):
        if run.ref_id not in out and not is_superseded(run, newest):
            out[run.ref_id] = run
    return out


def register(server: MCPServer, env: ToolEnv) -> None:
    # ── 讀取（04 §5.3）───────────────────────────────────────

    @server.tool()
    async def search_evidence(
        query: str,
        claim_types: list[str] | None = None,
        min_level: int | None = None,
        chapter_from: int | None = None,
        chapter_to: int | None = None,
        limit: int | None = SEARCH_LIMIT,
        *,
        ctx: Context,
    ) -> CallToolResult:
        """Full-text search over evidence summaries and quotes (words, a phrase, or `A OR B`); includes level 1."""
        args = {
            "query": query, "claim_types": claim_types, "min_level": min_level,
            "chapter_from": chapter_from, "chapter_to": chapter_to, "limit": limit,
        }  # fmt: skip

        async def body(call: Call) -> ToolResult:
            size = _clamp(limit, SEARCH_LIMIT, 1, SEARCH_MAX)
            # 04 §5.3：FTS5 子集＝詞、片語、OR。共用服務把整串當一個 phrase，OR 在這裡拆開合併。
            parts = [part.strip().strip('"') for part in query.split(" OR ")]
            parts = [part for part in parts if part] or [""]

            def flt(q: str) -> EvidenceFilter:
                return EvidenceFilter(
                    claim_types=claim_types or [], min_level=min_level,
                    chapter_from=chapter_from, chapter_to=chapter_to,
                    q=q or None, include_l1=True,
                )  # fmt: skip

            if len(parts) == 1:
                rows, total = await list_evidence(
                    call.db, call.session.book_id, flt(parts[0]), offset=0, limit=size
                )
            else:
                merged: dict[str, EvidenceRow] = {}
                for part in parts:
                    found, _ = await list_evidence(
                        call.db, call.session.book_id, flt(part), offset=0, limit=_OR_PART_MAX
                    )
                    for row in found:
                        merged.setdefault(row.id, row)
                total, rows = len(merged), list(merged.values())[:size]

            items = await to_list_items(call.db, rows)
            hits = [
                {
                    "id": item.id,
                    "claim_type": item.claim_type,
                    "level": item.level,
                    "summary": _clip(item.summary, SUMMARY_CHARS),
                    "discourse_chapter": item.discourse_chapter,
                    "confidence": item.confidence,
                    "review_status": item.review_status,
                    "basis_changed": item.basis_changed,
                    "first_quote": item.first_quote,
                }
                for item in items
            ]
            return ToolResult(
                {"hits": hits, "total": total},
                evidence_ids=[hit["id"] for hit in hits],
                summary=f"找到 {total} 筆",
            )

        return await run_tool(ctx, env, "search_evidence", args, body)

    @server.tool()
    async def get_evidence(
        evidence_id: str,
        include_trace: bool = False,
        trace_depth: int = 1,
        *,
        ctx: Context,
    ) -> CallToolResult:
        """Full text of one evidence item by id (content, quotes, genre_ext, derived_from), optionally with its upstream trace."""
        args = {"evidence_id": evidence_id, "include_trace": include_trace or None,
                "trace_depth": trace_depth if include_trace else None}  # fmt: skip

        async def body(call: Call) -> ToolResult:
            row = await _evidence_row(call, evidence_id)
            out = await _full_evidence(call.db, row)
            evidence_ids, run_ids = [row.id], [row.run_id] if row.run_id else []
            if include_trace:
                trace = await evidence_routes.get_trace(
                    await _book(call), evidence_id, call.db, call.env.registry,
                    depth=_clamp(trace_depth, 1, 1, TRACE_MAX_DEPTH), direction="upstream",
                )  # fmt: skip
                nodes = []
                for node in trace.nodes:
                    item = node.model_dump(mode="json", exclude_none=True)
                    if "summary" in item:
                        item["summary"] = _clip(item["summary"], SUMMARY_CHARS)
                    nodes.append(item)
                    if node.id == row.id:
                        continue
                    (evidence_ids if node.kind == "evidence" else run_ids).append(node.id)
                out["trace"] = {
                    "nodes": nodes,
                    "edges": [{"from": edge.from_, "to": edge.to} for edge in trace.edges],
                }
            return ToolResult(
                out,
                evidence_ids=evidence_ids,
                run_ids=list(dict.fromkeys(run_ids)),
                summary=f"{row.claim_type} L{row.level}",
            )

        return await run_tool(ctx, env, "get_evidence", args, body)

    @server.tool()
    async def get_entity(
        entity_id: str | None = None,
        name: str | None = None,
        include_genre_ext: bool = True,
        *,
        ctx: Context,
    ) -> CallToolResult:
        """A character by evidence id or by name (canonical name or alias); several name matches return candidates."""
        args = {"entity_id": entity_id, "name": name,
                "include_genre_ext": None if include_genre_ext else False}  # fmt: skip

        async def body(call: Call) -> ToolResult:
            if (entity_id is None) == (name is None):
                raise _bad_args("Give exactly one of entity_id and name.")
            if entity_id is not None:
                row = await _evidence_row(call, entity_id)
                if row.claim_type != "character":
                    raise _bad_args(
                        f"Evidence {entity_id} is a {row.claim_type}, not a character.",
                        "Use get_evidence for other claim types.",
                    )
            else:
                matches = await _match_name(call, name or "")
                if not matches:
                    raise McpToolError(
                        "not_found",
                        f"No character named '{name}'.",
                        "Try search_evidence with claim_types=['character'].",
                    )
                if len(matches) > 1:
                    candidates = [
                        {
                            "id": row.id,
                            "level": row.level,
                            "canonical_name": content.get("canonical_name"),
                            "aliases": content.get("aliases") or [],
                            "summary": _clip(row.summary, SUMMARY_CHARS),
                        }
                        for row, content in matches
                    ]
                    return ToolResult(
                        {"candidates": candidates},
                        evidence_ids=[c["id"] for c in candidates],
                        summary=f"{len(candidates)} 個候選",
                    )
                row = matches[0][0]

            out = await _full_evidence(call.db, row)
            out.pop("derived_from", None)
            out["summary"] = _clip(out["summary"], SUMMARY_CHARS)
            out["quotes"] = [
                {**quote, "text": _clip(quote["text"], QUOTE_CHARS)}
                for quote in out["quotes"][:ENTITY_QUOTES]
            ]
            if not include_genre_ext:
                out.pop("genre_ext", None)
            return ToolResult(
                out,
                evidence_ids=[row.id],
                summary=out["content"].get("canonical_name") or row.id,
            )

        return await run_tool(ctx, env, "get_entity", args, body)

    async def _match_name(call: Call, name: str) -> list[tuple[EvidenceRow, dict[str, Any]]]:
        """比對 `canonical_name` 與 `aliases`：先找完全相同（不分大小寫），沒有再找包含。"""
        table = CONTENT_TABLES["character"]
        rows = list(
            await call.db.scalars(
                select(EvidenceRow)
                .join(table, table.c.evidence_id == EvidenceRow.id)
                .where(*_visible(call.session.book_id), EvidenceRow.claim_type == "character")
                .order_by(EvidenceRow.level, EvidenceRow.created_at, EvidenceRow.id)
            )
        )
        contents = await _raw_content(call.db, rows)
        wanted = name.strip().casefold()
        exact, partial = [], []
        for row in rows:
            content = contents.get(row.id, {})
            names = [content.get("canonical_name") or "", *(content.get("aliases") or [])]
            folded = [n.casefold() for n in names if n]
            if wanted in folded:
                exact.append((row, content))
            elif wanted and any(wanted in n for n in folded):
                partial.append((row, content))
        return exact or partial

    @server.tool()
    async def get_events(
        participant_id: str | None = None,
        chapter_from: int | None = None,
        chapter_to: int | None = None,
        event_type: str | None = None,
        limit: int | None = EVENTS_LIMIT,
        cursor: str | None = None,
        *,
        ctx: Context,
    ) -> CallToolResult:
        """Events of the book in narrative order (text_rank), filterable by participant, chapter range and type."""
        args = {
            "participant_id": participant_id, "chapter_from": chapter_from,
            "chapter_to": chapter_to, "event_type": event_type, "limit": limit, "cursor": cursor,
        }  # fmt: skip

        async def body(call: Call) -> ToolResult:
            size = _clamp(limit, EVENTS_LIMIT, 1, EVENTS_MAX)
            offset = decode_cursor(cursor)
            table = CONTENT_TABLES["event"]
            conds = [*_visible(call.session.book_id), EvidenceRow.claim_type == "event"]
            if participant_id is not None:
                conds.append(
                    EvidenceRow.id.in_(
                        select(EvidenceSubject.evidence_id).where(
                            EvidenceSubject.subject_id == participant_id,
                            EvidenceSubject.role == "participant",
                        )
                    )
                )
            if chapter_from is not None:
                conds.append(table.c.chapter >= chapter_from)
            if chapter_to is not None:
                conds.append(table.c.chapter <= chapter_to)
            if event_type is not None:
                conds.append(table.c.event_type == event_type)
            joined = select(EvidenceRow, table).join(
                table, table.c.evidence_id == EvidenceRow.id
            ).where(and_(*conds))
            total = await call.db.scalar(select(func.count()).select_from(joined.subquery()))
            result = await call.db.execute(
                joined.order_by(table.c.text_rank, EvidenceRow.id).offset(offset).limit(size)
            )
            pairs = [(r[0], r._mapping) for r in result]
            ids = [ev.id for ev, _ in pairs]
            participants: dict[str, list[str]] = {}
            if ids:
                for evidence_id, subject_id in await call.db.execute(
                    select(EvidenceSubject.evidence_id, EvidenceSubject.subject_id)
                    .where(
                        EvidenceSubject.evidence_id.in_(ids),
                        EvidenceSubject.role == "participant",
                    )
                    .order_by(EvidenceSubject.subject_id)
                ):
                    participants.setdefault(evidence_id, []).append(subject_id)
            events = [
                {
                    "id": ev.id,
                    "level": ev.level,
                    "title": m[table.c.title],
                    "event_type": m[table.c.event_type],
                    "chapter": m[table.c.chapter],
                    "text_rank": m[table.c.text_rank],
                    "visibility": m[table.c.visibility],
                    "summary": _clip(ev.summary, SUMMARY_CHARS),
                    "basis_changed": ev.basis_changed,
                    "participant_ids": participants.get(ev.id, []),
                }
                for ev, m in pairs
            ]
            end = offset + len(events)
            return ToolResult(
                {
                    "events": events,
                    "next_cursor": encode_cursor(end) if events and end < (total or 0) else None,
                },
                evidence_ids=ids,
                summary=f"{len(events)} 個事件（共 {total}）",
            )

        return await run_tool(ctx, env, "get_events", args, body)

    @server.tool()
    async def get_passage(
        paragraph_id: str | None = None,
        evidence_id: str | None = None,
        quote_seq: int = 1,
        context: int = 0,
        *,
        ctx: Context,
    ) -> CallToolResult:
        """Original text of a paragraph (untruncated), by paragraph id or by an evidence quote, with optional surrounding paragraphs."""
        args = {"paragraph_id": paragraph_id, "evidence_id": evidence_id,
                "quote_seq": quote_seq if evidence_id else None,
                "context": context or None}  # fmt: skip

        async def body(call: Call) -> ToolResult:
            if (paragraph_id is None) == (evidence_id is None):
                raise _bad_args("Give exactly one of paragraph_id and evidence_id.")
            target = paragraph_id
            if evidence_id is not None:
                await _evidence_row(call, evidence_id)
                quote = await call.db.scalar(
                    select(EvidenceQuote).where(
                        EvidenceQuote.evidence_id == evidence_id, EvidenceQuote.seq == quote_seq
                    )
                )
                if quote is None or quote.paragraph_id is None:
                    raise McpToolError(
                        "not_found",
                        f"Evidence {evidence_id} has no quote {quote_seq} located in the text.",
                        "Call get_evidence to see its quotes and their seq numbers.",
                    )
                target = quote.paragraph_id
            assert target is not None
            try:
                view = await evidence_routes.get_paragraph(
                    await _book(call), target, call.db,
                    context=_clamp(context, 0, 0, PASSAGE_MAX_CONTEXT),
                    highlight_evidence_id=evidence_id,
                )  # fmt: skip
            except ApiError as err:
                raise McpToolError(err.code, err.detail, "Paragraph ids come from evidence quotes.") from err
            highlight = next(
                (
                    {"start": h.start, "end": h.end, "verified": h.verified}
                    for h in view.highlights
                    if h.seq == quote_seq
                ),
                None,
            )

            def para(p) -> dict[str, Any]:
                return {"paragraph_id": p.id, "chapter": p.chapter_number, "text": p.text}

            payload = {
                "paragraph_id": view.paragraph.id,
                "chapter": view.paragraph.chapter_number,
                "text": view.paragraph.text,
                "before": [para(p) for p in view.before],
                "after": [para(p) for p in view.after],
                "highlight": highlight,
            }
            return ToolResult(
                payload,
                evidence_ids=[evidence_id] if evidence_id else [],
                summary=f"第 {view.paragraph.chapter_number} 章段落",
            )

        return await run_tool(ctx, env, "get_passage", args, body)

    @server.tool()
    async def list_genre_elements(ctx: Context) -> CallToolResult:
        """The book's genre judgement and every evidence type with its layer, mechanism, level and current count."""

        async def body(call: Call) -> ToolResult:
            book = await _book(call)
            profile = book.genre_profile or {}
            counts = dict(
                (
                    await call.db.execute(
                        select(EvidenceRow.claim_type, func.count())
                        .where(*_visible(book.id))
                        .group_by(EvidenceRow.claim_type)
                    )
                ).all()
            )
            exts: dict[str, set[str]] = {}
            for claim_type, genre in await call.db.execute(
                select(EvidenceRow.claim_type, EvidenceGenreExt.genre)
                .join(EvidenceGenreExt, EvidenceGenreExt.evidence_id == EvidenceRow.id)
                .where(*_visible(book.id))
                .distinct()
            ):
                exts.setdefault(claim_type, set()).add(genre)
            elements = []
            for node in build_dag(call.env.registry)["nodes"]:
                if node["kind"] != "claim_type":
                    continue
                element = {
                    "claim_type": node["id"],
                    "layer": node["layer"],
                    "mechanism": node["mechanism"],
                    "level": node["level"],
                    "count": counts.get(node["id"], 0),
                }
                if node["id"] in exts:
                    element["genre_ext"] = sorted(exts[node["id"]])
                elements.append(element)
            payload = {
                "genre": {
                    "primary": profile.get("primary"),
                    "mixed": profile.get("mixed") or [],
                    "effective": effective_genre(book),
                },
                "elements": elements,
            }
            return ToolResult(
                payload, summary=f"題材 {payload['genre']['effective']}，{len(elements)} 種證據"
            )

        return await run_tool(ctx, env, "list_genre_elements", {}, body)

    @server.tool()
    async def list_methods(
        query: str | None = None,
        layer: str | None = None,
        mechanism: str | None = None,
        *,
        ctx: Context,
    ) -> CallToolResult:
        """Analysis methods and methodologies with their question, prerequisites and whether a current result exists; use it to pick a method_id."""
        args = {"query": query, "layer": layer, "mechanism": mechanism}

        async def body(call: Call) -> ToolResult:
            registry = call.env.registry
            engine = call.env.method_engine
            book_id = call.session.book_id
            current = await _current_runs(call.db, book_id)
            wanted = (query or "").strip().casefold()
            entries: list[tuple[str, Any, str | None, str | None]] = [
                (decl.id, decl, decl.layer, decl.mechanism)
                for decl in sorted(registry.methods.values(), key=lambda d: d.code)
            ] + [
                (decl.id, decl, methodology_layer(registry, decl.id), None)
                for decl in registry.methodologies.values()
            ]
            methods = []
            for ref_id, decl, decl_layer, decl_mechanism in entries:
                if wanted and wanted not in decl.question.casefold() and wanted not in ref_id:
                    continue
                if layer is not None and decl_layer != layer:
                    continue
                if mechanism is not None and decl_mechanism != mechanism:
                    continue
                is_method = ref_id in registry.methods
                plan = await engine.plan_method(book_id, ref_id)
                run = current.get(ref_id)
                item: dict[str, Any] = {
                    "id": ref_id,
                    "code": decl.code,
                    "kind": "method" if is_method else "methodology",
                    "question": decl.question,
                    "grade": decl.grade,
                    "requires": [r.claim_type for r in decl.requires] if is_method else [],
                    "produces": decl.produces if is_method else None,
                    "precheck": {"ok": not plan.blocked, "missing": sorted(set(plan.blocked))},
                    "has_current_run": run is not None,
                    "implemented": engine.is_implemented(ref_id),
                }
                if run is not None:
                    item["run_id"] = run.id
                methods.append(item)
            return ToolResult(
                {"methods": methods},
                run_ids=[m["run_id"] for m in methods if "run_id" in m],
                summary=f"{len(methods)} 個方法",
            )

        return await run_tool(ctx, env, "list_methods", args, body)

    @server.tool()
    async def get_run(
        run_id: str | None = None,
        method_id: str | None = None,
        *,
        ctx: Context,
    ) -> CallToolResult:
        """Result of a method run (status, summary, produced evidence ids); with method_id, the method's latest current run."""
        args = {"run_id": run_id, "method_id": method_id}

        async def body(call: Call) -> ToolResult:
            if (run_id is None) == (method_id is None):
                raise _bad_args("Give exactly one of run_id and method_id.")
            book = await _book(call)
            registry = call.env.registry
            target = run_id
            if method_id is not None:
                known = method_id in registry.methods or method_id in registry.methodologies
                if not known and not method_id.startswith(INGEST_REF_PREFIX):
                    raise McpToolError(
                        "unknown_ref",
                        f"'{method_id}' is not a registered method or methodology.",
                        "Call list_methods to see the method ids.",
                    )
                target = await _latest_run_id(call.db, book.id, method_id)
                if target is None:
                    raise McpToolError(
                        "not_found",
                        f"Method {method_id} has no run in this book yet.",
                        f"Call run_method('{method_id}') first.",
                    )
            assert target is not None
            try:
                detail = await runs_routes.get_run(book, target, call.db, registry)
            except ApiError as err:
                raise McpToolError(
                    err.code, err.detail, "Use list_methods to find current run ids."
                ) from err
            row = await call.db.get(RunRow, target)
            assert row is not None
            ids = list(
                await call.db.scalars(
                    select(EvidenceRow.id)
                    .where(*_visible(book.id), EvidenceRow.run_id == target)
                    .order_by(
                        EvidenceRow.discourse_chapter.is_(None),
                        EvidenceRow.discourse_chapter,
                        EvidenceRow.created_at,
                        EvidenceRow.id,
                    )
                )
            )
            payload: dict[str, Any] = {
                "run_id": detail.id,
                "method_id": detail.ref_id,
                "code": detail.code,
                "status": detail.status,
                "model": detail.model,
                "prompt_version": detail.prompt_version,
                "finished_at": detail.model_dump(mode="json")["finished_at"],
                "summary": row.summary_json,
                "evidence_ids": ids[:RUN_EVIDENCE_MAX],
                "evidence_count": len(ids),
            }
            if row.precheck_json:
                payload["precheck"] = row.precheck_json
            return ToolResult(
                payload,
                evidence_ids=payload["evidence_ids"],
                run_ids=[detail.id],
                summary=f"{detail.code or detail.ref_id} {detail.status}，{len(ids)} 筆證據",
            )

        return await run_tool(ctx, env, "get_run", args, body)

    async def _latest_run_id(db: AsyncSession, book_id: str, ref_id: str) -> str | None:
        """最新一筆 current 的 done run；沒有就退回最新一筆任何狀態的 run（例如 not_applicable）。"""
        current = await _current_runs(db, book_id)
        if ref_id in current:
            return current[ref_id].id
        return await db.scalar(
            select(RunRow.id)
            .where(RunRow.book_id == book_id, RunRow.ref_id == ref_id)
            .order_by(RunRow.created_at.desc(), RunRow.id)
            .limit(1)
        )

    # ── 分析（04 §5.4）───────────────────────────────────────

    @server.tool()
    async def run_method(
        method_id: str,
        inputs: dict[str, Any] | None = None,
        force: bool = False,
        dry_run: bool = False,
        *,
        ctx: Context,
    ) -> CallToolResult:
        """Run an analysis method or methodology (reuses a current result unless force); dry_run only shows the plan."""
        args = {"method_id": method_id, "inputs": inputs,
                "force": force or None, "dry_run": dry_run or None}  # fmt: skip

        async def body(call: Call) -> ToolResult:
            given = dict(inputs or {})
            unknown = sorted(set(given) - {"subject_ids", "params"})
            if unknown:
                raise _bad_args(
                    f"inputs: unknown keys {', '.join(unknown)}.",
                    "inputs takes only subject_ids and params.",
                )
            try:
                _status, out = await trigger_method(
                    call.db, call.env.method_engine, call.env.method_jobs,
                    call.session.book_id, method_id,
                    params=dict(given.get("params") or {}), scope=given.get("subject_ids"),
                    force=force, dry_run=dry_run,
                    triggered_by="agent", agent_session_id=call.session.session_id,
                )  # fmt: skip
            except ApiError as err:
                if err.code == "unknown_ref":
                    raise McpToolError(
                        err.code, err.detail, "Call list_methods to see the method ids."
                    ) from err
                raise
            payload: dict[str, Any] = {
                "status": out.status,
                "plan": out.plan,
                "not_implemented": out.not_implemented,
            }
            if out.job_id:
                payload["job_id"] = out.job_id
                payload["hint"] = "Poll get_job_status(job_id) until it is done, then get_run."
            if out.run_id:
                payload["run_id"] = out.run_id
            if out.precheck is not None:
                payload["precheck"] = _precheck_snake(out.precheck)
            if out.status == "not_implemented":
                payload["hint"] = (
                    "This method is not supported in the prototype yet; tell the user. Do not retry."
                )
            return ToolResult(
                payload,
                run_ids=[out.run_id] if out.run_id else [],
                job_id=out.job_id,
                summary=f"{method_id} {out.status}",
            )

        return await run_tool(ctx, env, "run_method", args, body)

    @server.tool()
    async def get_job_status(job_id: str, ctx: Context) -> CallToolResult:
        """Status of a background job started by run_method (progress, stage, produced run ids)."""

        async def body(call: Call) -> ToolResult:
            row = await call.db.get(JobRow, job_id)
            if row is None or row.book_id != call.session.book_id:
                raise McpToolError("not_found", f"Job {job_id} not found.")
            job = job_out(row)
            result = job.result or {}
            run_ids = list(result.get("runIds") or [])
            payload: dict = {
                "status": job.status,
                "progress": job.progress,
                "stage": job.stage,
                "run_ids": run_ids,
            }
            if job.error_kind:
                payload["error_kind"] = job.error_kind
            if job.status == "paused_quota":
                payload["hint"] = (
                    "LLM quota is exhausted; tell the user to resume later. Do not retry."
                )
            return ToolResult(payload, run_ids=run_ids, job_id=job_id, summary=f"job {job.status}")

        return await run_tool(ctx, env, "get_job_status", {"job_id": job_id}, body)
