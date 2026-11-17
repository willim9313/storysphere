"""讀取與分析類 MCP 工具（04 §5.3、§5.4）：回傳形狀、可見範圍、截短、trace 記下的 id。

LLM 一律不呼叫：`agent` 的引擎沒有方法實作；`run_method` 要建 job 的情境用假方法，
且把 `MethodJobs.start` 換掉，不真的跑。
"""

from __future__ import annotations

from typing import Any

import pytest
from sqlalchemy import select
from storysphere.api.events import EventBus
from storysphere.llm.settings import DEFAULT_SETTINGS_PATH, SETTINGS_ENV
from storysphere.mcp.runtime import ToolEnv
from storysphere.methods.jobs import MethodJobs
from storysphere.store.agent import create_session
from storysphere.store.evidence_writer import (
    GenreExtDraft,
    QuoteDraft,
    SubjectRef,
    WriteContext,
    write_evidence,
)
from storysphere.store.tables import Evidence, Job, Run

from tests.api.support import add_book
from tests.domain.minimal_content import MINIMAL_CONTENT
from tests.mcp.conftest import Agent, call, error_of, payload
from tests.methods.support import FakeMethod, decl, make_engine, make_registry
from tests.store.conftest import BOOK, FakeParagraphs, make_draft

OTHER = "book-2"


async def ev(
    agent: Agent,
    claim_type: str,
    *,
    book_id: str = BOOK,
    summary: str | None = None,
    quote: tuple[str, str] | None = ("p-1", "福爾摩斯"),
    derived_from: list[str] | None = None,
    subjects: list[tuple[str, str]] | None = None,
    genre_ext: list[GenreExtDraft] | None = None,
    run_id: str | None = None,
    **content: Any,
) -> str:
    """一筆證據（正式寫入路徑）；有 `derived_from` 時是方法產出（第 2 層以上）。"""
    level_1 = not derived_from
    ctx = WriteContext(
        book_id=book_id,
        source="extraction" if level_1 else "method",
        produced_via="pipeline",
        run_id=run_id,
    )
    draft = make_draft(
        claim_type,
        summary=summary or f"{claim_type} 摘要",
        content={**MINIMAL_CONTENT[claim_type], **content},
        quotes=[QuoteDraft(paragraph_id=quote[0], text=quote[1])] if quote and level_1 else [],
        derived_from=derived_from or [],
        subjects=[SubjectRef(subject_id=s, role=r) for s, r in subjects or []],
        genre_ext=genre_ext or [],
    )
    async with agent.env.session_factory() as db, db.begin():
        row = await write_evidence(db, ctx, draft, FakeParagraphs())
    return row.id


async def set_fields(agent: Agent, evidence_id: str, **values: Any) -> None:
    async with agent.env.session_factory() as db, db.begin():
        row = await db.get(Evidence, evidence_id)
        for key, value in values.items():
            setattr(row, key, value)


async def other_book(agent: Agent) -> None:
    async with agent.env.session_factory() as db, db.begin():
        await add_book(db, OTHER)


async def add_run(agent: Agent, ref_id: str, *, status: str = "done", book_id: str = BOOK) -> str:
    async with agent.env.session_factory() as db, db.begin():
        run = Run(book_id=book_id, ref_id=ref_id, scope_key="", status=status, model="m-1")
        db.add(run)
        await db.flush()
        return run.id


async def last_trace(agent: Agent):
    return (await agent.traces())[-1]


class TestSearchEvidence:
    async def test_hits_shape_and_level_1_included(self, agent):
        l1 = await ev(agent, "character")
        hits = payload(await call(agent, "search_evidence", {"query": "福爾摩斯"}))
        assert hits["total"] == 1
        (hit,) = hits["hits"]
        assert set(hit) == {
            "id", "claim_type", "level", "summary", "discourse_chapter", "confidence",
            "review_status", "basis_changed", "first_quote",
        }  # fmt: skip
        assert (hit["id"], hit["level"], hit["first_quote"]) == (l1, 1, "福爾摩斯")

    async def test_returned_ids_are_recorded_in_trace(self, agent):
        ids = {await ev(agent, "character"), await ev(agent, "event")}
        payload(await call(agent, "search_evidence", {"query": "福爾摩斯"}))
        trace = await last_trace(agent)
        assert set(trace.result_evidence_ids) == ids
        _, (_, result) = agent.events()
        assert result["data"]["summary"] == "找到 2 筆"

    async def test_superseded_and_rejected_are_excluded(self, agent):
        keep = await ev(agent, "character")
        old = await ev(agent, "event")
        bad = await ev(agent, "utterance")
        await set_fields(agent, old, status="superseded")
        await set_fields(agent, bad, review_status="rejected")
        hits = payload(await call(agent, "search_evidence", {"query": "福爾摩斯"}))["hits"]
        assert [h["id"] for h in hits] == [keep]

    async def test_long_summary_is_truncated_to_200(self, agent):
        await ev(agent, "character", summary="長" * 300)
        (hit,) = payload(await call(agent, "search_evidence", {"query": "長長長"}))["hits"]
        assert len(hit["summary"]) == 200

    async def test_other_book_is_not_visible(self, agent):
        await other_book(agent)
        await ev(agent, "character", book_id=OTHER)
        assert payload(await call(agent, "search_evidence", {"query": "福爾摩斯"}))["total"] == 0

    async def test_or_merges_both_terms(self, agent):
        a = await ev(agent, "character")
        b = await ev(agent, "event", quote=("p-2", "珍珠"))
        found = payload(await call(agent, "search_evidence", {"query": "福爾摩斯 OR 珍珠"}))
        assert found["total"] == 2 and {h["id"] for h in found["hits"]} == {a, b}

    async def test_limit_is_capped_at_50_and_filters_apply(self, agent):
        for _ in range(3):
            await ev(agent, "event")
        await ev(agent, "character")
        found = payload(
            await call(
                agent, "search_evidence",
                {"query": "福爾摩斯", "claim_types": ["event"], "limit": 2},
            )
        )  # fmt: skip
        assert found["total"] == 3 and len(found["hits"]) == 2
        many = payload(await call(agent, "search_evidence", {"query": "福爾摩斯", "limit": 500}))
        assert len(many["hits"]) == 4


class TestGetEvidence:
    async def test_full_evidence_with_snake_case_content(self, agent):
        cid = await ev(agent, "character", canonical_name="福爾摩斯", aliases=["夏洛克"])
        out = payload(await call(agent, "get_evidence", {"evidence_id": cid}))
        assert out["id"] == cid and out["level"] == 1
        assert out["content"]["canonical_name"] == "福爾摩斯"
        assert out["content"]["aliases"] == ["夏洛克"]
        assert out["quotes"][0]["text"] == "福爾摩斯"
        assert {"genre_ext", "subjects", "derived_from", "basis_changed"} <= set(out)
        assert "trace" not in out
        assert (await last_trace(agent)).result_evidence_ids == [cid]

    async def test_include_trace_records_upstream_ids(self, agent):
        up = await ev(agent, "event")
        mid = await ev(agent, "causal_link", derived_from=[up])
        top = await ev(agent, "event_role", derived_from=[mid])
        out = payload(
            await call(agent, "get_evidence", {"evidence_id": top, "include_trace": True})
        )
        assert out["derived_from"] == [{"upstream_id": mid, "upstream_kind": "evidence"}]
        # trace_depth 預設 1：只展一層
        assert {n["id"] for n in out["trace"]["nodes"]} == {top, mid}
        assert out["trace"]["edges"] == [{"from": top, "to": mid}]
        assert (await last_trace(agent)).result_evidence_ids == [top, mid]

        deep = payload(
            await call(
                agent, "get_evidence",
                {"evidence_id": top, "include_trace": True, "trace_depth": 6},
            )
        )  # fmt: skip
        assert {n["id"] for n in deep["trace"]["nodes"]} == {top, mid, up}

    async def test_other_books_evidence_is_not_found_with_hint(self, agent):
        await other_book(agent)
        foreign = await ev(agent, "character", book_id=OTHER)
        err = error_of(await call(agent, "get_evidence", {"evidence_id": foreign}))
        assert err["code"] == "not_found" and "search_evidence" in err["hint"]


class TestGetEntity:
    async def test_by_name_matches_alias(self, agent):
        cid = await ev(
            agent, "character", canonical_name="福爾摩斯", aliases=["夏洛克"],
            genre_ext=[GenreExtDraft(genre="mystery", data={"mystery_role": "detective"})],
        )  # fmt: skip
        out = payload(await call(agent, "get_entity", {"name": "夏洛克"}))
        assert out["id"] == cid and out["level"] == 1
        assert out["content"]["canonical_name"] == "福爾摩斯"
        assert out["genre_ext"][0]["data"]["mystery_role"] == "detective"
        assert len(out["quotes"]) <= 3 and "derived_from" not in out
        assert (await last_trace(agent)).result_evidence_ids == [cid]

    async def test_include_genre_ext_false_omits_it(self, agent):
        cid = await ev(agent, "character")
        out = payload(
            await call(agent, "get_entity", {"entity_id": cid, "include_genre_ext": False})
        )
        assert out["id"] == cid and "genre_ext" not in out

    async def test_several_matches_return_candidates(self, agent):
        a = await ev(agent, "character", canonical_name="華生醫生")
        b = await ev(agent, "character", canonical_name="華生太太")
        out = payload(await call(agent, "get_entity", {"name": "華生"}))
        assert {c["id"] for c in out["candidates"]} == {a, b}
        assert set((await last_trace(agent)).result_evidence_ids) == {a, b}

    async def test_exact_match_wins_over_partial(self, agent):
        exact = await ev(agent, "character", canonical_name="華生")
        await ev(agent, "character", canonical_name="華生太太")
        assert payload(await call(agent, "get_entity", {"name": "華生"}))["id"] == exact

    async def test_unknown_name_is_not_found(self, agent):
        err = error_of(await call(agent, "get_entity", {"name": "莫里亞蒂"}))
        assert err["code"] == "not_found" and err["hint"]

    async def test_non_character_id_is_rejected(self, agent):
        eid = await ev(agent, "event")
        assert error_of(await call(agent, "get_entity", {"entity_id": eid}))["code"] == (
            "validation_error"
        )

    async def test_other_book_is_not_visible(self, agent):
        await other_book(agent)
        foreign = await ev(agent, "character", book_id=OTHER, canonical_name="福爾摩斯")
        assert error_of(await call(agent, "get_entity", {"name": "福爾摩斯"}))["code"] == (
            "not_found"
        )
        assert error_of(await call(agent, "get_entity", {"entity_id": foreign}))["code"] == (
            "not_found"
        )


class TestGetEvents:
    async def test_events_in_text_rank_order_with_participants(self, agent):
        late = await ev(agent, "event", text_rank=5, title="後", subjects=[("c1", "participant")])
        early = await ev(agent, "event", text_rank=2, title="前")
        out = payload(await call(agent, "get_events"))
        assert [e["id"] for e in out["events"]] == [early, late]
        first = out["events"][0]
        assert set(first) >= {
            "id", "level", "title", "event_type", "chapter", "text_rank", "visibility",
            "summary", "participant_ids",
        }  # fmt: skip
        assert out["events"][1]["participant_ids"] == ["c1"]
        assert out["next_cursor"] is None
        assert (await last_trace(agent)).result_evidence_ids == [early, late]

    async def test_filters_by_participant_and_chapter(self, agent):
        hit = await ev(agent, "event", chapter=2, subjects=[("c1", "participant")])
        await ev(agent, "event", chapter=2)
        await ev(agent, "event", chapter=5, subjects=[("c1", "participant")])
        out = payload(
            await call(agent, "get_events", {"participant_id": "c1", "chapter_to": 3})
        )
        assert [e["id"] for e in out["events"]] == [hit]

    async def test_cursor_pages_through(self, agent):
        ids = [await ev(agent, "event", text_rank=rank) for rank in (1, 2, 3)]
        first = payload(await call(agent, "get_events", {"limit": 2}))
        assert [e["id"] for e in first["events"]] == ids[:2]
        second = payload(
            await call(agent, "get_events", {"limit": 2, "cursor": first["next_cursor"]})
        )
        assert [e["id"] for e in second["events"]] == ids[2:] and second["next_cursor"] is None

    async def test_superseded_and_other_book_excluded(self, agent):
        await other_book(agent)
        await ev(agent, "event", book_id=OTHER)
        old = await ev(agent, "event")
        await set_fields(agent, old, status="superseded")
        assert payload(await call(agent, "get_events"))["events"] == []


class TestGetPassage:
    async def test_paragraph_with_context(self, agent):
        out = payload(await call(agent, "get_passage", {"paragraph_id": "p-2", "context": 1}))
        assert out["paragraph_id"] == "p-2" and out["chapter"] == 1
        assert out["text"] == "摩斯坦小姐每年都會收到一顆珍珠。"
        assert [p["paragraph_id"] for p in out["before"]] == ["p-1"]
        assert [p["paragraph_id"] for p in out["after"]] == ["p-3"]
        assert out["highlight"] is None
        assert (await last_trace(agent)).result_evidence_ids == []

    async def test_by_evidence_quote_highlights_it(self, agent):
        cid = await ev(agent, "character")
        out = payload(await call(agent, "get_passage", {"evidence_id": cid}))
        assert out["paragraph_id"] == "p-1"
        assert out["highlight"]["verified"] is True
        assert out["highlight"]["start"] is not None
        assert (await last_trace(agent)).result_evidence_ids == [cid]

    async def test_context_is_capped_at_3(self, agent):
        out = payload(await call(agent, "get_passage", {"paragraph_id": "p-1", "context": 9}))
        assert [p["paragraph_id"] for p in out["after"]] == ["p-2", "p-3"]

    async def test_missing_quote_is_not_found(self, agent):
        cid = await ev(agent, "character")
        err = error_of(await call(agent, "get_passage", {"evidence_id": cid, "quote_seq": 7}))
        assert err["code"] == "not_found" and "get_evidence" in err["hint"]

    async def test_other_book_paragraph_is_not_found(self, agent):
        assert error_of(await call(agent, "get_passage", {"paragraph_id": "nope"}))["code"] == (
            "not_found"
        )


class TestListGenreElements:
    async def test_genre_and_counts(self, agent):
        async with agent.env.session_factory() as db, db.begin():
            from storysphere.store.books import BookRow

            book = await db.get(BookRow, BOOK)
            book.genre_profile = {"primary": "mystery", "mixed": []}
        await ev(
            agent, "character",
            genre_ext=[GenreExtDraft(genre="mystery", data={"mystery_role": "detective"})],
        )  # fmt: skip
        await ev(agent, "character")
        gone = await ev(agent, "event")
        await set_fields(agent, gone, status="superseded")
        out = payload(await call(agent, "list_genre_elements"))
        assert out["genre"] == {"primary": "mystery", "mixed": [], "effective": "mystery"}
        by_type = {e["claim_type"]: e for e in out["elements"]}
        assert by_type["character"]["count"] == 2 and by_type["character"]["level"] == 1
        assert by_type["character"]["genre_ext"] == ["mystery"]
        assert by_type["event"]["count"] == 0 and "genre_ext" not in by_type["event"]
        assert {"layer", "mechanism"} <= set(by_type["hidden_truth"])


class TestListMethods:
    async def test_lists_methods_and_methodologies(self, agent):
        out = payload(await call(agent, "list_methods"))
        registry = agent.env.registry
        ids = {m["id"] for m in out["methods"]}
        assert ids == set(registry.methods) | set(registry.methodologies)
        item = next(m for m in out["methods"] if m["id"] == "character.network")
        assert set(item) >= {
            "id", "code", "kind", "question", "grade", "requires", "produces", "precheck",
            "has_current_run", "implemented",
        }  # fmt: skip
        assert item["kind"] == "method" and item["implemented"] is False
        assert item["precheck"] == {"ok": True, "missing": []}
        assert item["has_current_run"] is False and "run_id" not in item

    async def test_current_run_is_reported_and_traced(self, agent):
        run_id = await add_run(agent, "character.network")
        out = payload(await call(agent, "list_methods"))
        item = next(m for m in out["methods"] if m["id"] == "character.network")
        assert item["has_current_run"] is True and item["run_id"] == run_id
        assert (await last_trace(agent)).result_run_ids == [run_id]

    async def test_query_and_layer_filter(self, agent):
        decl_ = agent.env.registry.methods["character.network"]
        out = payload(await call(agent, "list_methods", {"query": decl_.question[:4]}))
        assert "character.network" in {m["id"] for m in out["methods"]}
        genre = payload(await call(agent, "list_methods", {"layer": "genre"}))["methods"]
        assert genre and all(
            agent.env.registry.methods[m["id"]].layer == "genre"
            for m in genre
            if m["kind"] == "method"
        )


class TestGetRun:
    async def test_by_run_id(self, agent):
        run_id = await add_run(agent, "character.network")
        up = await ev(agent, "character")
        mine = await ev(agent, "relation_network", derived_from=[up], run_id=run_id)
        old = await ev(agent, "relation_network", derived_from=[up], run_id=run_id)
        await set_fields(agent, old, status="superseded")
        out = payload(await call(agent, "get_run", {"run_id": run_id}))
        assert set(out) >= {
            "run_id", "method_id", "code", "status", "model", "prompt_version", "finished_at",
            "summary", "evidence_ids", "evidence_count",
        }  # fmt: skip
        assert (out["run_id"], out["method_id"], out["status"]) == (
            run_id, "character.network", "done",
        )  # fmt: skip
        assert out["evidence_ids"] == [mine] and out["evidence_count"] == 1
        trace = await last_trace(agent)
        assert trace.result_evidence_ids == [mine] and trace.result_run_ids == [run_id]

    async def test_by_method_id_takes_latest_current_run(self, agent):
        await add_run(agent, "character.network")
        newest = await add_run(agent, "character.network")
        out = payload(await call(agent, "get_run", {"method_id": "character.network"}))
        assert out["run_id"] == newest

    async def test_method_without_run_hints_run_method(self, agent):
        err = error_of(await call(agent, "get_run", {"method_id": "character.network"}))
        assert err["code"] == "not_found" and "run_method" in err["hint"]

    async def test_unknown_method_is_unknown_ref(self, agent):
        err = error_of(await call(agent, "get_run", {"method_id": "nope"}))
        assert err["code"] == "unknown_ref" and "list_methods" in err["hint"]

    async def test_other_books_run_is_not_found(self, agent):
        await other_book(agent)
        foreign = await add_run(agent, "character.network", book_id=OTHER)
        assert error_of(await call(agent, "get_run", {"run_id": foreign}))["code"] == "not_found"

    async def test_needs_exactly_one_of_run_id_and_method_id(self, agent):
        assert error_of(await call(agent, "get_run"))["code"] == "validation_error"

    async def test_evidence_ids_capped_at_100(self, agent):
        run_id = await add_run(agent, "character.network")
        up = await ev(agent, "character")
        for _ in range(101):
            await ev(agent, "relation_network", derived_from=[up], run_id=run_id)
        out = payload(await call(agent, "get_run", {"run_id": run_id}))
        assert len(out["evidence_ids"]) == 100 and out["evidence_count"] == 101


A = decl("test.a", ["event"], "causal_link")


@pytest.fixture
async def fake_agent(sf, monkeypatch) -> Agent:
    """可以真的建 job 的 agent：假方法 `test.a`，`start` 換成只記錄。"""
    monkeypatch.setenv(SETTINGS_ENV, str(DEFAULT_SETTINGS_PATH))
    monkeypatch.setenv("GEMINI_API_KEY", "test-key-not-used")
    async with sf() as db, db.begin():
        await add_book(db)
        row, token = await create_session(db, book_id=BOOK, backend="deepagents")
    engine, _llm = make_engine(sf, make_registry(A), FakeMethod(A))
    jobs = MethodJobs(engine)
    started: list[str] = []
    monkeypatch.setattr(jobs, "start", started.append)
    env = ToolEnv(sf, engine, jobs, EventBus())
    sctx = env.sessions.ensure(row)

    async def resolve(_ctx, _env):
        return sctx

    env.resolve = resolve
    agent = Agent(env, sctx, token)
    await ev(agent, "event")
    return agent


class TestRunMethod:
    async def test_dry_run_is_planned(self, fake_agent):
        out = payload(await call(fake_agent, "run_method", {"method_id": "test.a", "dry_run": True}))
        assert out["status"] == "planned" and out["plan"] == ["test.a"]

    async def test_unimplemented_method_is_not_an_error(self, agent):
        out = payload(await call(agent, "run_method", {"method_id": "character.network"}))
        assert out["status"] == "not_implemented"
        assert out["not_implemented"] == ["character.network"] and "hint" in out

    async def test_unknown_method_is_unknown_ref(self, agent):
        err = error_of(await call(agent, "run_method", {"method_id": "nope"}))
        assert err["code"] == "unknown_ref" and "list_methods" in err["hint"]

    async def test_queued_then_attached_as_agent(self, fake_agent):
        out = payload(await call(fake_agent, "run_method", {"method_id": "test.a", "force": True}))
        assert out["status"] == "queued" and out["job_id"]
        again = payload(
            await call(fake_agent, "run_method", {"method_id": "test.a", "force": True})
        )
        assert again["status"] == "attached" and again["job_id"] == out["job_id"]
        async with fake_agent.env.session_factory() as db:
            job = (await db.scalars(select(Job))).one()
        assert job.params_json["triggered_by"] == "agent"
        assert job.params_json["agent_session_id"] == fake_agent.session.session_id
        trace = await last_trace(fake_agent)
        assert trace.job_id == out["job_id"]

    async def test_reuses_a_current_result(self, fake_agent):
        run_id = await add_run(fake_agent, "test.a")
        out = payload(await call(fake_agent, "run_method", {"method_id": "test.a"}))
        assert (out["status"], out["run_id"]) == ("reused", run_id)
        assert (await last_trace(fake_agent)).result_run_ids == [run_id]

    async def test_unknown_inputs_key_is_rejected(self, fake_agent):
        err = error_of(
            await call(fake_agent, "run_method", {"method_id": "test.a", "inputs": {"x": 1}})
        )
        assert err["code"] == "validation_error"
