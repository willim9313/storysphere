"""Tests for the book status badge — `_book_status` (B-088).

書庫書卡右上角那顆徽章。後端過去兩個建構點都硬寫 `status="ready"`，所以每本書
都顯示藍色「已就緒」，「已分析」篩選永遠是空的。現在改由 pipeline_status 推導。

`processing` 不在值域內：`GET /books` 會濾掉還在跑 ingestion 的書（前端另外用
ProcessingBookCard 畫），而 `StepStatus` 沒有 `running`——停在 `pending` 的步驟
可能正在跑，也可能根本沒被要求跑，這裡分不出來。
"""

from __future__ import annotations

import pytest
from storysphere.api.routers.books import _book_status, _parse_pipeline_status
from storysphere.domain.documents import PipelineStatus, StepStatus

_STEPS = ("summarization", "feature_extraction", "knowledge_graph", "symbol_discovery")


def _ps(**overrides: StepStatus) -> PipelineStatus:
    """PipelineStatus，未指定的步驟一律 pending。"""
    return PipelineStatus(**overrides)


def _all(status: StepStatus) -> PipelineStatus:
    return PipelineStatus(**dict.fromkeys(_STEPS, status))


class TestBookStatus:
    def test_all_steps_done_is_analyzed(self):
        assert _book_status(_all(StepStatus.done)) == "analyzed"

    def test_nothing_run_is_ready(self):
        assert _book_status(_ps()) == "ready"

    def test_partial_progress_is_ready(self):
        ps = _ps(summarization=StepStatus.done, feature_extraction=StepStatus.done)
        assert _book_status(ps) == "ready"

    @pytest.mark.parametrize("step", _STEPS)
    def test_any_failed_step_is_error(self, step: str):
        """任一步失敗就是 error，不論其他步驟跑完沒有。"""
        ps = _all(StepStatus.done)
        setattr(ps, step, StepStatus.failed)
        assert _book_status(ps) == "error"

    def test_failed_wins_over_incomplete(self):
        """既有失敗又有沒跑完時報 error——壞掉比沒做完更該讓人看到。"""
        ps = _ps(summarization=StepStatus.failed)
        assert _book_status(ps) == "error"


class TestParsePipelineStatus:
    def test_absent_json_means_nothing_has_run(self):
        assert _book_status(_parse_pipeline_status(None)) == "ready"

    def test_json_round_trips(self):
        ps = _parse_pipeline_status(_all(StepStatus.done).model_dump_json())
        assert _book_status(ps) == "analyzed"

    def test_unknown_extra_keys_are_ignored(self):
        """實際資料帶著 `*_at` 時戳（見 var/storysphere.db），不能因此炸掉。"""
        raw = (
            '{"summarization":"done","feature_extraction":"done",'
            '"knowledge_graph":"done","symbol_discovery":"done",'
            '"summarization_at":"2026-08-17T13:04:43.024183Z"}'
        )
        assert _book_status(_parse_pipeline_status(raw)) == "analyzed"
