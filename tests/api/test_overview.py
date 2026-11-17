"""N-03b 結果卡、N-03c「也可以問」、N-04a 觸發、N-04d 重跑。"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import pytest
from storysphere.store.ingest_units import IngestUnitOutputRow, IngestUnitRow
from storysphere.store.tables import Job, Run

from tests.api.support import P, add_book, seed
from tests.store.conftest import BOOK

PROFILE = {"primary": "mystery", "mechanism_density": {"info_control": 1.0, "threat": 0.8, "journey": 0.0}}


@dataclass
class Ids:
    network_run: str
    network_role: str


async def _book(store) -> Ids:
    """推理書；有 CH4 要的第 1 層類型（relation_state、utterance），CH4 跑過一次。"""
    await add_book(store.session, profile=PROFILE)
    await store.extracted("relation_state")
    await store.extracted("utterance")
    run = Run(book_id=BOOK, ref_id="character.network", status="done")
    store.session.add(run)
    await store.session.flush()
    upstream = await store.extracted("character")
    network = await store.derived("relation_network", [upstream], run=run)
    # S1b 訊號：第 2、5 章有 threat
    for chapter in (2, 5):
        unit_id = f"{BOOK}:{chapter}:0"
        store.session.add(IngestUnitRow(book_id=BOOK, stage="s1b", unit_id=unit_id, chapter=chapter,
                                        paragraph_ids=["p-1"], status="done"))
        store.session.add(IngestUnitOutputRow(book_id=BOOK, stage="s1b", unit_id=unit_id,
                                              raw_json={"signals": [{"mechanism": "threat"}]}))  # fmt: skip
    await store.session.flush()
    return Ids(run.id, network.id)


@pytest.fixture
def ids(db_file) -> Ids:
    return seed(db_file, _book)


@pytest.fixture
def llm_key(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key-not-used")


@pytest.fixture
def started(client, monkeypatch) -> list[str]:
    """不真的跑方法：記下哪些 job 被啟動。"""
    jobs: list[str] = []
    monkeypatch.setattr(client.app.state.method_jobs, "start", jobs.append)
    return jobs


class TestCards:
    def test_universal_then_mystery_cards_with_state(self, ids, client):
        cards = client.get(f"{P}/books/{BOOK}/cards").json()
        assert [(c["perspective"], c["code"]) for c in cards] == [
            ("universal", "EV1"), ("universal", "CH2"), ("universal", "CH4"),
            ("mystery", "MY4"), ("mystery", "CH5"),
        ]  # fmt: skip
        by_code = {c["code"]: c for c in cards}
        network = by_code["CH4"]
        assert network["state"] == "done" and network["runId"] == ids.network_run
        assert network["maxLevel"] == 2 and network["viewType"] == "network"
        assert network["question"] == "角色分成哪些陣營？"
        assert by_code["EV1"]["state"] == "not_run" and by_code["EV1"]["implemented"] is True
        assert by_code["MY4"]["state"] == "not_run" and by_code["MY4"]["implemented"] is True

    def test_basis_changed_and_running(self, ids, db_file, client):
        async def fill(store):
            from storysphere.store.tables import Evidence

            (await store.session.get(Evidence, ids.network_role)).basis_changed = True
            store.session.add(Job(id="m1", kind="method_run", book_id=BOOK, status="running",
                                  params_json={"method_id": "character.arc"}))  # fmt: skip

        seed(db_file, fill)
        by_code = {c["code"]: c for c in client.get(f"{P}/books/{BOOK}/cards").json()}
        assert by_code["CH4"]["state"] == "basis_changed"
        assert by_code["CH2"]["state"] == "running" and by_code["CH2"]["jobId"] == "m1"

    def test_book_without_genre_gets_universal_cards_only(self, db_file, client):
        seed(db_file, lambda store: add_book(store.session))
        assert [c["perspective"] for c in client.get(f"{P}/books/{BOOK}/cards").json()] == ["universal"] * 3


class TestAskable:
    def test_registry_questions_minus_the_cards(self, ids, client):
        askable = client.get(f"{P}/books/{BOOK}/askable").json()
        items = {item["code"]: item for item in askable["askable"]}
        assert not {"EV1", "CH2", "CH4", "MY4", "CH5"} & items.keys()
        assert items["EV2"]["implemented"] is True and items["NS2"]["implemented"] is False
        assert items["TM3"]["refKind"] == "methodology"
        # EV2 讀 event：這本書沒有 → 補不了，先標不適用
        assert items["EV2"]["precheck"]["missing"] == ["event"]

    def test_other_genre_signals_skip_the_primary_mechanism_and_empty_ones(self, ids, client):
        signals = client.get(f"{P}/books/{BOOK}/askable").json()["otherSignals"]
        assert signals == [
            {"mechanism": "threat", "density": 0.8, "chapters": [2, 5],
             "suggestedQuestion": signals[0]["suggestedQuestion"], "supported": False},
        ]  # fmt: skip


class TestTrigger:
    def _post(self, client, **body):
        return client.post(f"{P}/books/{BOOK}/runs", json=body)

    def test_dry_run_plans_without_a_job(self, ids, client, started):
        response = self._post(client, refId="character.network", dryRun=True)
        assert response.status_code == 200
        assert response.json()["status"] == "planned" and response.json()["plan"] == ["character.network"]
        assert started == []

    def test_reuses_a_current_result(self, ids, client, started):
        body = self._post(client, refId="character.network").json()
        assert (body["status"], body["runId"]) == ("reused", ids.network_run) and started == []

    def test_force_queues_a_job(self, ids, client, started, llm_key):
        response = self._post(client, refId="character.network", force=True)
        assert response.status_code == 202 and response.json()["status"] == "queued"
        job_id = response.json()["jobId"]
        assert started == [job_id]
        # 同一分析再點一次：接到同一個 job
        again = self._post(client, refId="character.network", force=True)
        assert again.status_code == 200 and again.json() == {**response.json(), "status": "attached"}

    def test_basis_changed_result_is_not_reused(self, ids, db_file, client, started, llm_key):
        async def fill(store):
            from storysphere.store.tables import Evidence

            (await store.session.get(Evidence, ids.network_role)).basis_changed = True

        seed(db_file, fill)
        assert self._post(client, refId="character.network").json()["status"] == "queued"

    def test_unimplemented_method_is_not_an_error(self, ids, client, started):
        body = self._post(client, refId="info.two_story").json()
        assert body["status"] == "not_implemented" and body["notImplemented"] == ["info.two_story"]

    def test_missing_level_1_type_is_not_applicable(self, ids, client, started):
        body = self._post(client, refId="event.causal_network").json()
        assert body["status"] == "not_applicable" and body["precheck"]["missing"] == ["event"]
        assert started == []

    def test_unknown_ref_is_422(self, ids, client):
        response = self._post(client, refId="nope")
        assert response.status_code == 422 and response.json()["code"] == "unknown_ref"

    def test_unfinished_ingest_is_409_with_its_job(self, ids, db_file, client, started, llm_key):
        seed(db_file, lambda store: _add(store, Job(id="i1", kind="ingest", book_id=BOOK, status="running")))
        response = self._post(client, refId="character.network", force=True)
        assert response.status_code == 409
        assert response.json() == {**response.json(), "code": "job_conflict", "jobId": "i1"}

    def test_no_model_is_503_and_creates_no_job(self, ids, client, started, monkeypatch):
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        response = self._post(client, refId="character.network", force=True)
        assert response.status_code == 503 and response.json()["code"] == "llm_unconfigured"
        assert started == [] and client.get(f"{P}/jobs").json() == []


class TestPerSubjectCardState:
    """每個主體一筆 run 的方法：任一 scope 完成就算完成（04 N-03b，2026-11-17）。"""

    def fill(self, db_file, statuses: list[str]) -> None:
        async def go(store):
            await add_book(store.session, profile=PROFILE)
            start = datetime(2026, 11, 17, tzinfo=UTC)
            for i, status in enumerate(statuses):
                store.session.add(Run(id=f"r{i}", book_id=BOOK, ref_id="info.fair_play_audit", status=status,
                                      scope_key=f"subject:t{i}", created_at=start + timedelta(minutes=i),
                                      precheck_json={"missing": ["reveal"]} if status == "not_applicable" else None))  # fmt: skip

        seed(db_file, go)

    def my4(self, client) -> dict:
        return next(c for c in client.get(f"{P}/books/{BOOK}/cards").json() if c["code"] == "MY4")

    def test_any_done_scope_makes_the_card_done(self, db_file, client):
        self.fill(db_file, ["done", "done", "not_applicable"])  # 最新的一筆不適用
        card = self.my4(client)
        assert card["state"] == "done" and card["runId"] == "r1"

    def test_all_not_applicable_stays_not_applicable(self, db_file, client):
        self.fill(db_file, ["not_applicable", "not_applicable"])
        card = self.my4(client)
        assert card["state"] == "not_applicable" and card["precheck"]["missing"] == ["reveal"]


class TestRerun:
    def test_rerun_queues_the_same_analysis(self, ids, client, started, llm_key):
        response = client.post(f"{P}/books/{BOOK}/runs/{ids.network_run}/rerun", json={})
        assert response.status_code == 202 and response.json()["status"] == "queued"
        job = client.get(f"{P}/jobs/{response.json()['jobId']}").json()
        assert job["params"]["method_id"] == "character.network" and job["params"]["scope"] is None

    def test_scope_comes_from_the_run(self, ids, db_file, client, started, llm_key):
        async def fill(store):
            await store.extracted("event")  # CH2 還要讀 event
            store.session.add(Run(id="arc", book_id=BOOK, ref_id="character.arc", status="done",
                                  scope_key="subject:c-9"))  # fmt: skip

        seed(db_file, fill)
        response = client.post(f"{P}/books/{BOOK}/runs/arc/rerun", json={})
        assert response.status_code == 202
        assert client.get(f"{P}/jobs/{response.json()['jobId']}").json()["params"]["scope"] == ["c-9"]

    def test_rerun_upstream_is_not_supported_yet(self, ids, client):
        response = client.post(f"{P}/books/{BOOK}/runs/{ids.network_run}/rerun", json={"rerunUpstream": True})
        assert response.status_code == 422

    def test_unknown_run_is_404(self, ids, client):
        assert client.post(f"{P}/books/{BOOK}/runs/nope/rerun", json={}).status_code == 404


async def _add(store, row):
    store.session.add(row)
