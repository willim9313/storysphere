"""方法引擎：上游補跑、前提不成立、寫入與取代、失敗處理。真實 SQLite＋假方法＋計數用假 llm。"""

from __future__ import annotations

import pytest
from sqlalchemy import select
from storysphere.methods.base import Precheck
from storysphere.methods.engine import UnknownMethodError
from storysphere.store.tables import Evidence, EvidenceLink, Run

from tests.methods.support import (
    BOOK,
    CountingLlm,
    FakeMethod,
    decl,
    draft_for,
    make_engine,
    make_registry,
    seed,
)

A = decl("test.a", ["event"], "causal_link")
B = decl("test.b", ["causal_link"], "event_role")


async def runs_of(sf, ref_id: str | None = None) -> list[Run]:
    async with sf() as session:
        query = select(Run).order_by(Run.created_at, Run.id)
        if ref_id:
            query = query.where(Run.ref_id == ref_id)
        return list(await session.scalars(query))


async def evidence_of(sf, claim_type: str, status: str | None = None) -> list[Evidence]:
    async with sf() as session:
        query = select(Evidence).where(Evidence.claim_type == claim_type)
        if status:
            query = query.where(Evidence.status == status)
        return list(await session.scalars(query))


async def links_of(sf, evidence_id: str) -> set[str]:
    async with sf() as session:
        rows = await session.scalars(
            select(EvidenceLink.upstream_id).where(EvidenceLink.evidence_id == evidence_id)
        )
        return set(rows)


class TestUpstreamBackfill:
    async def test_missing_upstream_runs_producer_first_then_the_method(self, sf):
        """T13 完成標準：缺上游時自動補跑。"""
        event_id = await seed(sf, "event")
        engine, llm = make_engine(sf, make_registry(A, B), FakeMethod(A), FakeMethod(B))
        assert await engine._count(BOOK, "causal_link") == 0

        result = await engine.run_method(BOOK, "test.b", triggered_by="user")

        assert result.outcome == "done"
        assert [u.method_id for u in result.upstream] == ["test.a"]
        run_a, run_b = (await runs_of(sf, "test.a"))[0], (await runs_of(sf, "test.b"))[0]
        # A 先跑完、B 後跑完；A 記 parent_run_id ＝ B 的 run
        assert run_a.status == run_b.status == "done"
        assert run_a.finished_at <= run_b.finished_at
        assert run_a.parent_run_id == run_b.id
        assert run_b.parent_run_id is None
        # 證據：層級 2、3，B 衍生自 A 的產出，A 衍生自事件
        (link,) = await evidence_of(sf, "causal_link")
        (role,) = await evidence_of(sf, "event_role")
        assert (link.level, role.level) == (2, 3)
        assert await links_of(sf, link.id) == {event_id}
        assert await links_of(sf, role.id) == {link.id}
        assert (link.run_id, role.run_id) == (run_a.id, run_b.id)
        assert llm.calls == 2

    async def test_backfill_inherits_trigger_and_job(self, sf):
        await seed(sf, "event")
        engine, _ = make_engine(sf, make_registry(A, B), FakeMethod(A), FakeMethod(B))
        await engine.run_method(BOOK, "test.b", triggered_by="agent", job_id="job-1",
                                agent_session_id="s-1")
        for run in await runs_of(sf):
            assert (run.triggered_by, run.job_id, run.agent_session_id) == ("agent", "job-1", "s-1")

    async def test_existing_upstream_is_not_run_again(self, sf):
        await seed(sf, "event")
        engine, _ = make_engine(sf, make_registry(A, B), FakeMethod(A), FakeMethod(B))
        await engine.run_method(BOOK, "test.a", triggered_by="user")
        result = await engine.run_method(BOOK, "test.b", triggered_by="user")
        assert result.upstream == []
        assert len(await runs_of(sf, "test.a")) == 1

    async def test_shared_upstream_is_backfilled_once(self, sf):
        await seed(sf, "event")
        d = decl("test.d", ["causal_link", "event_role"], "event_impact")
        engine, _ = make_engine(
            sf, make_registry(A, B, d), FakeMethod(A), FakeMethod(B), FakeMethod(d)
        )
        await engine.run_method(BOOK, "test.d", triggered_by="user")
        assert [len(await runs_of(sf, ref)) for ref in ("test.a", "test.b", "test.d")] == [1, 1, 1]

    async def test_missing_level_1_type_cannot_be_backfilled(self, sf):
        engine, llm = make_engine(sf, make_registry(A, B), FakeMethod(A), FakeMethod(B))
        result = await engine.run_method(BOOK, "test.a", triggered_by="user")
        assert result.outcome == "not_applicable"
        assert result.upstream == []
        (run,) = await runs_of(sf)
        assert run.status == "not_applicable"
        assert run.precheck_json["missing"] == ["event"]
        assert "入庫" in run.precheck_json["how_to_fix"]
        assert llm.calls == 0

    async def test_optional_requirement_is_neither_filled_nor_blocking(self, sf):
        await seed(sf, "event")
        m = decl("test.m", ["event", ("causal_link", True)], "event_role")
        engine, _ = make_engine(sf, make_registry(A, m), FakeMethod(A), FakeMethod(m))
        result = await engine.run_method(BOOK, "test.m", triggered_by="user")
        assert result.outcome == "done" and result.upstream == []
        assert await runs_of(sf, "test.a") == []

    async def test_unimplemented_upstream_makes_the_premise_unmet(self, sf):
        await seed(sf, "event")
        engine, llm = make_engine(sf, make_registry(A, B), FakeMethod(B))
        result = await engine.run_method(BOOK, "test.b", triggered_by="user")
        assert result.outcome == "not_applicable"
        assert result.not_implemented_ids() == ["test.a"]
        (run,) = await runs_of(sf)
        assert run.precheck_json["missing"] == ["causal_link"]
        assert "test.a" in run.precheck_json["how_to_fix"] and "尚未實作" in run.precheck_json["how_to_fix"]
        assert llm.calls == 0

    async def test_upstream_that_is_not_applicable_leaves_the_method_not_applicable(self, sf):
        await seed(sf, "event")

        async def unfit(_ctx, _item):
            return Precheck.unmet(["x"])

        engine, llm = make_engine(sf, make_registry(A, B), FakeMethod(A, check=unfit), FakeMethod(B))
        result = await engine.run_method(BOOK, "test.b", triggered_by="user")
        assert [u.outcome for u in result.upstream] == ["not_applicable"]
        assert result.outcome == "not_applicable"
        assert llm.calls == 0

    async def test_rate_limited_upstream_stops_the_whole_request(self, sf):
        await seed(sf, "event")
        llm = CountingLlm(error=RuntimeError("429 quota exceeded"))
        engine, _ = make_engine(sf, make_registry(A, B), FakeMethod(A), FakeMethod(B), llm=llm)
        result = await engine.run_method(BOOK, "test.b", triggered_by="user")
        assert result.rate_limited and result.outcome == "failed"
        assert [r.status for r in await runs_of(sf)] == ["failed", "failed"]
        assert llm.calls == 1


class TestPrecheck:
    async def test_failed_check_makes_zero_llm_calls_and_writes_nothing(self, sf):
        """T13 完成標準：前提不成立時零次 LLM 呼叫。"""
        await seed(sf, "event")

        async def unfit(_ctx, _item):
            return Precheck.unmet(["hidden_truth"], "先入庫", "這本書沒有這個機制")

        method = FakeMethod(A, check=unfit)
        engine, llm = make_engine(sf, make_registry(A), method)

        result = await engine.run_method(BOOK, "test.a", triggered_by="user")

        assert result.outcome == "not_applicable"
        (run,) = await runs_of(sf)
        assert run.status == "not_applicable"
        assert run.precheck_json == {
            "missing": ["hidden_truth"],
            "how_to_fix": "先入庫",
            "when_useless_even_if_fixed": "這本書沒有這個機制",
        }
        assert llm.calls == 0 and method.run_calls == 0
        assert await evidence_of(sf, "causal_link") == []

    async def test_declared_precondition_is_judged_before_the_methods_own_check(self, sf):
        await seed(sf, "event")
        d = decl("test.p", ["event", ("causal_link", True)], "event_role", preconditions=["causal_link"])
        checked = []

        async def spy(_ctx, _item):
            checked.append(True)
            return Precheck.passed()

        method = FakeMethod(d, check=spy)
        engine, llm = make_engine(sf, make_registry(d), method)
        await engine.run_method(BOOK, "test.p", triggered_by="user")
        (run,) = await runs_of(sf)
        assert run.status == "not_applicable" and run.precheck_json["missing"] == ["causal_link"]
        assert checked == [] and llm.calls == 0

    async def test_no_subject_in_scope_is_not_applicable(self, sf):
        c = decl("test.c", ["character"], "archetype", scope="per_character",
                 selector="top_characters(5)")
        engine, llm = make_engine(sf, make_registry(c), FakeMethod(c))
        await seed(sf, "character", canonical_name="狗", kind="animal")  # 有角色，但沒有 person
        result = await engine.run_method(BOOK, "test.c", triggered_by="user")
        assert result.outcome == "not_applicable" and llm.calls == 0
        (run,) = await runs_of(sf)
        assert run.precheck_json["missing"] == ["scope"]


class TestExecution:
    async def test_run_row_records_version_model_params_and_inputs(self, sf):
        event_id = await seed(sf, "event")
        engine, _ = make_engine(sf, make_registry(A), FakeMethod(A, prompt_version="p7"))
        await engine.run_method(BOOK, "test.a", params={"k": 1}, triggered_by="agent",
                                job_id="j", agent_session_id="s")
        (run,) = await runs_of(sf)
        assert (run.ref_id, run.ref_version, run.prompt_version) == ("test.a", 3, "p7")
        assert (run.provider, run.model) == ("fake", "fake-1")
        assert run.params_json == {"k": 1} and run.scope_key == ""
        assert run.input_evidence_ids == [event_id]
        assert (run.triggered_by, run.job_id, run.agent_session_id) == ("agent", "j", "s")
        assert run.started_at is not None and run.finished_at is not None
        (link,) = await evidence_of(sf, "causal_link")
        assert (link.source, link.produced_via, link.run_id) == ("method", "agent", run.id)

    @pytest.mark.parametrize(
        ("trigger", "via"), [("auto", "pipeline"), ("user", "ui"), ("agent", "agent")]
    )
    async def test_produced_via_follows_the_trigger(self, sf, trigger, via):
        await seed(sf, "event")
        engine, _ = make_engine(sf, make_registry(A), FakeMethod(A))
        await engine.run_method(BOOK, "test.a", triggered_by=trigger)
        (link,) = await evidence_of(sf, "causal_link")
        assert link.produced_via == via

    async def test_rerun_supersedes_the_old_result_of_the_same_analysis(self, sf):
        await seed(sf, "event")
        engine, _ = make_engine(sf, make_registry(A), FakeMethod(A))
        await engine.run_method(BOOK, "test.a", triggered_by="user")
        await engine.run_method(BOOK, "test.a", triggered_by="user")
        (old,) = await evidence_of(sf, "causal_link", "superseded")
        (new,) = await evidence_of(sf, "causal_link", "current")
        first, second = await runs_of(sf, "test.a")
        assert (old.run_id, new.run_id) == (first.id, second.id)

    async def test_one_run_per_scope_item_with_scope_key(self, sf):
        a = await seed(sf, "character", canonical_name="甲", mention_count=2)
        b = await seed(sf, "character", canonical_name="乙", mention_count=1)
        c = decl("test.c", ["character"], "archetype", scope="per_character",
                 selector="top_characters(5)")

        async def per_subject(ctx, item):
            await ctx.llm().ainvoke("x")
            return [draft_for(c, [item.subject_id])]

        engine, llm = make_engine(sf, make_registry(c), FakeMethod(c, run=per_subject))
        result = await engine.run_method(BOOK, "test.c", triggered_by="user")
        assert [r.scope_key for r in await runs_of(sf)] == [f"subject:{a}", f"subject:{b}"]
        assert result.outcome == "done" and llm.calls == 2
        # 只重跑一個主體：只取代那個主體的舊結果
        await engine.run_method(BOOK, "test.c", scope=[b], triggered_by="user")
        current = {e.run_id for e in await evidence_of(sf, "archetype", "current")}
        assert len(current) == 2 and len(await evidence_of(sf, "archetype", "superseded")) == 1

    async def test_unknown_subject_id_fails_the_run(self, sf):
        await seed(sf, "character")
        c = decl("test.c", ["character"], "archetype", scope="per_character")
        engine, llm = make_engine(sf, make_registry(c), FakeMethod(c))
        result = await engine.run_method(BOOK, "test.c", scope=["nope"], triggered_by="user")
        assert result.outcome == "failed" and llm.calls == 0
        assert "nope" in (await runs_of(sf))[0].error

    async def test_summary_set_by_the_method_is_stored(self, sf):
        await seed(sf, "event")

        async def run(ctx, _item):
            ctx.summary["conclusion"] = "有"
            return [draft_for(A, [(await ctx.evidence.list("event"))[0].id])]

        engine, _ = make_engine(sf, make_registry(A), FakeMethod(A, run=run))
        await engine.run_method(BOOK, "test.a", triggered_by="user")
        assert (await runs_of(sf))[0].summary_json == {"conclusion": "有"}


class TestFailures:
    async def test_wrong_claim_type_fails_the_run_and_writes_nothing(self, sf):
        await seed(sf, "event")

        async def wrong(ctx, _item):
            ev = (await ctx.evidence.list("event"))[0]
            return [draft_for(A, [ev.id]), draft_for(B, [ev.id])]

        engine, _ = make_engine(sf, make_registry(A), FakeMethod(A, run=wrong))
        result = await engine.run_method(BOOK, "test.a", triggered_by="user")
        (run,) = await runs_of(sf)
        assert result.outcome == "failed" and run.status == "failed"
        assert "event_role" in run.error and "causal_link" in run.error
        assert await evidence_of(sf, "causal_link") == [] and await evidence_of(sf, "event_role") == []

    async def test_derived_from_a_type_not_declared_fails_the_run(self, sf):
        await seed(sf, "event")
        character = await seed(sf, "character")

        async def sneaky(_ctx, _item):
            return [draft_for(A, [character])]

        engine, _ = make_engine(sf, make_registry(A), FakeMethod(A, run=sneaky))
        result = await engine.run_method(BOOK, "test.a", triggered_by="user")
        assert result.outcome == "failed"
        assert "character" in (await runs_of(sf))[0].error
        assert await evidence_of(sf, "causal_link") == []

    async def test_derived_from_unknown_id_fails_the_run(self, sf):
        await seed(sf, "event")

        async def ghost(_ctx, _item):
            return [draft_for(A, ["no-such-id"])]

        engine, _ = make_engine(sf, make_registry(A), FakeMethod(A, run=ghost))
        assert (await engine.run_method(BOOK, "test.a", triggered_by="user")).outcome == "failed"

    async def test_exception_in_run_rolls_back_every_write_of_the_run(self, sf):
        await seed(sf, "event")

        async def half_bad(ctx, _item):
            ev = (await ctx.evidence.list("event"))[0]
            bad = draft_for(A, [ev.id], content={"cause_event_id": "x"})  # 缺必填欄位
            return [draft_for(A, [ev.id]), bad]

        engine, _ = make_engine(sf, make_registry(A), FakeMethod(A, run=half_bad))
        result = await engine.run_method(BOOK, "test.a", triggered_by="user")
        assert result.outcome == "failed"
        assert await evidence_of(sf, "causal_link") == []  # 第一筆也沒留下
        assert (await runs_of(sf))[0].status == "failed"

    async def test_exception_inside_run_marks_failed_and_keeps_old_result(self, sf):
        await seed(sf, "event")
        engine, _ = make_engine(sf, make_registry(A), FakeMethod(A))
        await engine.run_method(BOOK, "test.a", triggered_by="user")

        async def boom(_ctx, _item):
            raise RuntimeError("boom")

        broken, _ = make_engine(sf, make_registry(A), FakeMethod(A, run=boom))
        result = await broken.run_method(BOOK, "test.a", triggered_by="user")
        assert result.outcome == "failed" and not result.rate_limited
        failed = (await runs_of(sf, "test.a"))[1]
        assert (failed.status, failed.error) == ("failed", "boom")
        assert failed.summary_json == {"error_kind": "other"}
        # 失敗的 run 不取代舊結果
        assert len(await evidence_of(sf, "causal_link", "current")) == 1
        assert await evidence_of(sf, "causal_link", "superseded") == []

    async def test_429_stops_remaining_items_and_flags_rate_limited(self, sf):
        for name in ("甲", "乙"):
            await seed(sf, "character", canonical_name=name)
        c = decl("test.c", ["character"], "archetype", scope="per_character")
        llm = CountingLlm(error=RuntimeError("Error code: 429 - quota exceeded"))
        engine, _ = make_engine(sf, make_registry(c), FakeMethod(c), llm=llm)
        result = await engine.run_method(BOOK, "test.c", triggered_by="user")
        assert result.rate_limited and llm.calls == 1
        (run,) = await runs_of(sf)  # 第二個主體沒開始，沒有 run
        assert run.status == "failed" and run.summary_json == {"error_kind": "rate_limited"}

    async def test_reading_an_undeclared_type_fails_the_run(self, sf):
        await seed(sf, "event")
        await seed(sf, "character")

        async def peek(ctx, _item):
            await ctx.evidence.list("character")
            return []

        engine, _ = make_engine(sf, make_registry(A), FakeMethod(A, run=peek))
        result = await engine.run_method(BOOK, "test.a", triggered_by="user")
        assert result.outcome == "failed"
        assert "character" in (await runs_of(sf))[0].error


class TestUnimplemented:
    async def test_declared_but_unimplemented_is_reported_not_raised(self, sf):
        await seed(sf, "event")
        engine, llm = make_engine(sf, make_registry(A))
        result = await engine.run_method(BOOK, "test.a", triggered_by="user")
        assert result.outcome == "not_implemented" and result.runs == []
        assert not engine.is_implemented("test.a")
        assert await runs_of(sf) == [] and llm.calls == 0

    async def test_methodology_ids_are_not_supported_yet(self, sf):
        from storysphere.registry.models import MethodologyDecl

        registry = make_registry(A)
        registry.methodologies["test.meth"] = MethodologyDecl(
            kind="methodology", id="test.meth", version=1, owner="user", question="?",
            grade="使用者自建", steps=[{"method": "test.a"}],
        )
        engine, _ = make_engine(sf, registry, FakeMethod(A))
        result = await engine.run_method(BOOK, "test.meth", triggered_by="user")
        assert (result.outcome, result.detail) == ("not_implemented", "methodology")

    async def test_unknown_id_raises(self, sf):
        engine, _ = make_engine(sf, make_registry(A), FakeMethod(A))
        with pytest.raises(UnknownMethodError):
            await engine.run_method(BOOK, "nope", triggered_by="user")

    async def test_bad_trigger_is_refused(self, sf):
        engine, _ = make_engine(sf, make_registry(A), FakeMethod(A))
        with pytest.raises(ValueError):
            await engine.run_method(BOOK, "test.a", triggered_by="robot")


class TestPlanMethod:
    async def test_lists_backfill_in_order_and_what_is_blocked(self, sf):
        engine, _ = make_engine(sf, make_registry(A, B), FakeMethod(A), FakeMethod(B))
        plan = await engine.plan_method(BOOK, "test.b")
        assert plan.steps == ["test.a", "test.b"] and plan.blocked == ["event"]
        await seed(sf, "event")
        plan = await engine.plan_method(BOOK, "test.b")
        assert plan.steps == ["test.a", "test.b"] and plan.blocked == []
        assert (await engine.plan_method(BOOK, "test.a")).steps == ["test.a"]

    async def test_reports_unimplemented_steps(self, sf):
        await seed(sf, "event")
        engine, _ = make_engine(sf, make_registry(A, B), FakeMethod(B))
        plan = await engine.plan_method(BOOK, "test.b")
        assert plan.not_implemented == ["test.a"] and plan.steps == ["test.b"]
