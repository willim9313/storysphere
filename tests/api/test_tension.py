"""API tests for tension endpoints."""

from __future__ import annotations

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from storysphere.domain.entities import EntityType
from storysphere.domain.tension import TEU, TensionLine, TensionPole

from tests.api.conftest import hanging_call, make_entity, poll_until_terminal

BOOK = "book-1"


def _make_teu(teu_id: str, chapter: int, **kw) -> TEU:
    return TEU(
        id=teu_id,
        event_id=f"event-{teu_id}",
        document_id=BOOK,
        chapter=chapter,
        pole_a=TensionPole(
            concept_name=kw.get("pole_a", "記憶的自主"),
            carrier_names=kw.get("carriers_a", ["伊內絲"]),
            carrier_ids=kw.get("carrier_ids_a", []),
            stance=kw.get("stance_a"),
        ),
        pole_b=TensionPole(
            concept_name=kw.get("pole_b", "記憶的佔有"),
            carrier_names=kw.get("carriers_b", ["泰奧多爾"]),
            carrier_ids=kw.get("carrier_ids_b", []),
            stance=kw.get("stance_b"),
        ),
        tension_description=kw.get("desc", "記憶能否被交易。"),
        intensity=kw.get("intensity", 0.7),
        evidence=kw.get("evidence", ["「記憶不能買賣。」"]),
    )


@pytest.fixture
def mock_tension():
    """TensionService double; each test sets get_teus / get_lines as needed."""
    svc = AsyncMock()
    svc.get_teus.return_value = []
    svc.get_lines.return_value = []
    return svc


@pytest.fixture
def tension_client(mock_tension, mock_kg, mock_doc, mock_vector):
    from storysphere.api import deps
    from storysphere.api.main import create_app

    app = create_app()

    @asynccontextmanager
    async def _noop_lifespan(app):
        yield

    app.router.lifespan_context = _noop_lifespan
    app.dependency_overrides[deps.get_tension_service] = lambda: mock_tension
    app.dependency_overrides[deps.get_kg_service] = lambda: mock_kg
    app.dependency_overrides[deps.get_doc_service] = lambda: mock_doc
    app.dependency_overrides[deps.get_vector_service] = lambda: mock_vector

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


class TestReviewTensionLine:
    def test_note_reaches_the_service(self, tension_client, mock_tension):
        mock_tension.update_line_review.return_value = TensionLine(
            id="line-1", document_id=BOOK, canonical_pole_a="個人選擇"
        )
        resp = tension_client.patch(
            "/api/v1/tension/lines/line-1/review",
            json={
                "document_id": BOOK,
                "review_status": "modified",
                "canonical_pole_a": "個人選擇",
                "note": "原標籤把載體當成概念",
            },
        )
        assert resp.status_code == 200
        assert mock_tension.update_line_review.await_args.kwargs["note"] == "原標籤把載體當成概念"

    def test_note_is_optional(self, tension_client, mock_tension):
        mock_tension.update_line_review.return_value = TensionLine(id="line-1", document_id=BOOK)
        resp = tension_client.patch(
            "/api/v1/tension/lines/line-1/review",
            json={"document_id": BOOK, "review_status": "approved"},
        )
        assert resp.status_code == 200
        assert mock_tension.update_line_review.await_args.kwargs["note"] is None

    def test_unknown_line_is_404(self, tension_client, mock_tension):
        mock_tension.update_line_review.return_value = None
        resp = tension_client.patch(
            "/api/v1/tension/lines/nope/review",
            json={"document_id": BOOK, "review_status": "approved"},
        )
        assert resp.status_code == 404


class TestAssignTEU:
    """The service decides the outcome; these pin the HTTP mapping."""

    def _assign(self, client, teu_id="t2", line_id="line-1"):
        return client.patch(
            f"/api/v1/tension/teus/{teu_id}/assign",
            json={"document_id": BOOK, "line_id": line_id},
        )

    def test_returns_the_updated_line(self, tension_client, mock_tension):
        line = TensionLine(id="line-1", document_id=BOOK, teu_ids=["t1", "t2"], chapter_range=[1, 4])
        mock_tension.assign_teu_to_line.return_value = ("ok", line)

        resp = self._assign(tension_client)
        assert resp.status_code == 200
        assert resp.json()["teu_ids"] == ["t1", "t2"]
        assert resp.json()["chapter_range"] == [1, 4]

    def test_unknown_teu_is_404(self, tension_client, mock_tension):
        mock_tension.assign_teu_to_line.return_value = ("teu_not_found", None)
        assert self._assign(tension_client).status_code == 404

    def test_unknown_line_is_404(self, tension_client, mock_tension):
        mock_tension.assign_teu_to_line.return_value = ("line_not_found", None)
        assert self._assign(tension_client).status_code == 404

    def test_teu_already_grouped_is_409(self, tension_client, mock_tension):
        holder = TensionLine(id="line-9", document_id=BOOK, teu_ids=["t2"])
        mock_tension.assign_teu_to_line.return_value = ("claimed", holder)

        resp = self._assign(tension_client)
        assert resp.status_code == 409
        assert "line-9" in resp.json()["detail"]

    def test_requires_line_id(self, tension_client):
        resp = tension_client.patch(
            "/api/v1/tension/teus/t2/assign", json={"document_id": BOOK}
        )
        assert resp.status_code == 422


class TestListTEUs:
    def test_returns_empty_list_before_assembly(self, tension_client):
        resp = tension_client.get(f"/api/v1/tension/teus?book_id={BOOK}")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_requires_book_id(self, tension_client):
        assert tension_client.get("/api/v1/tension/teus").status_code == 422

    def test_exposes_pole_concepts_and_carriers(self, tension_client, mock_tension):
        mock_tension.get_teus.return_value = [_make_teu("t1", 3)]
        resp = tension_client.get(f"/api/v1/tension/teus?book_id={BOOK}")
        assert resp.status_code == 200
        item = resp.json()[0]
        assert item["pole_a_concept"] == "記憶的自主"
        assert item["pole_b_concept"] == "記憶的佔有"
        assert [c["name"] for c in item["pole_a_carriers"]] == ["伊內絲"]
        assert item["chapter"] == 3
        assert item["evidence"] == ["「記憶不能買賣。」"]

    def test_beats_of_one_scene_share_a_narrative_run_index(self, tension_client, mock_tension, mock_kg):
        """Three TEUs in one unbroken stretch of present-tense narration."""
        from storysphere.domain.events import Event, EventType, NarrativeMode

        mock_kg.get_events.return_value = [
            Event(
                id=f"event-t{i}",
                document_id=BOOK,
                title=f"beat {i}",
                event_type=EventType.PLOT,
                description="d",
                chapter=3,
                narrative_position=i,
                narrative_mode=NarrativeMode.PRESENT,
            )
            for i in (1, 2, 3)
        ]
        mock_tension.get_teus.return_value = [_make_teu(f"t{i}", 3) for i in (1, 2, 3)]

        items = tension_client.get(f"/api/v1/tension/teus?book_id={BOOK}").json()

        assert [i["narrative_run_index"] for i in items] == [1, 1, 1]

    def test_a_narrative_mode_change_starts_a_new_run(self, tension_client, mock_tension, mock_kg):
        from storysphere.domain.events import Event, EventType, NarrativeMode

        modes = {1: NarrativeMode.PRESENT, 2: NarrativeMode.FLASHBACK, 3: NarrativeMode.PRESENT}
        mock_kg.get_events.return_value = [
            Event(
                id=f"event-t{i}",
                document_id=BOOK,
                title=f"beat {i}",
                event_type=EventType.PLOT,
                description="d",
                chapter=3,
                narrative_position=i,
                narrative_mode=modes[i],
            )
            for i in (1, 2, 3)
        ]
        mock_tension.get_teus.return_value = [_make_teu(f"t{i}", 3) for i in (1, 2, 3)]

        items = tension_client.get(f"/api/v1/tension/teus?book_id={BOOK}").json()

        assert [i["narrative_run_index"] for i in items] == [1, 2, 3]

    def test_a_teu_whose_event_is_gone_reports_no_run(self, tension_client, mock_tension, mock_kg):
        """Better null than a number that quietly means "a run of its own"."""
        mock_kg.get_events.return_value = []
        mock_tension.get_teus.return_value = [_make_teu("t1", 3)]

        items = tension_client.get(f"/api/v1/tension/teus?book_id={BOOK}").json()

        assert items[0]["narrative_run_index"] is None

    def test_carrier_gets_its_kg_entity_type(self, tension_client, mock_tension, mock_kg):
        mock_kg.list_entities.return_value = [
            make_entity(name="伊內絲", eid="ent-1", etype=EntityType.CHARACTER),
            make_entity(name="退名之潮", eid="ent-2", etype=EntityType.CONCEPT),
        ]
        mock_tension.get_teus.return_value = [
            _make_teu(
                "t1",
                1,
                carriers_a=["伊內絲"],
                carrier_ids_a=["ent-1"],
                carriers_b=["退名之潮"],
                carrier_ids_b=["ent-2"],
            )
        ]
        item = tension_client.get(f"/api/v1/tension/teus?book_id={BOOK}").json()[0]
        assert item["pole_a_carriers"][0]["entity_type"] == "character"
        assert item["pole_b_carriers"][0]["entity_type"] == "concept"

    def test_unresolved_carrier_keeps_name_with_null_type(
        self, tension_client, mock_tension, mock_kg
    ):
        """Roughly a fifth of carrier names have no entity id; they must still
        appear, just untyped."""
        mock_kg.list_entities.return_value = []
        mock_tension.get_teus.return_value = [
            _make_teu("t1", 1, carriers_a=["讀鹽人"], carrier_ids_a=[])
        ]
        carrier = tension_client.get(f"/api/v1/tension/teus?book_id={BOOK}").json()[0][
            "pole_a_carriers"
        ][0]
        assert carrier["name"] == "讀鹽人"
        assert carrier["id"] is None
        assert carrier["entity_type"] is None

    def test_carrier_with_id_the_kg_no_longer_knows_is_untyped(
        self, tension_client, mock_tension, mock_kg
    ):
        mock_kg.list_entities.return_value = []
        mock_tension.get_teus.return_value = [
            _make_teu("t1", 1, carriers_a=["幽靈"], carrier_ids_a=["ent-gone"])
        ]
        carrier = tension_client.get(f"/api/v1/tension/teus?book_id={BOOK}").json()[0][
            "pole_a_carriers"
        ][0]
        assert carrier["id"] == "ent-gone"
        assert carrier["entity_type"] is None

    def test_exposes_pole_stance(self, tension_client, mock_tension):
        mock_tension.get_teus.return_value = [_make_teu("t1", 1, stance_a="她捍衛記憶的純粹性。")]
        item = tension_client.get(f"/api/v1/tension/teus?book_id={BOOK}").json()[0]
        assert item["pole_a_stance"] == "她捍衛記憶的純粹性。"

    def test_grouped_teu_carries_its_line_id(self, tension_client, mock_tension):
        mock_tension.get_teus.return_value = [_make_teu("t1", 1)]
        mock_tension.get_lines.return_value = [
            TensionLine(id="line-1", document_id=BOOK, teu_ids=["t1"])
        ]
        resp = tension_client.get(f"/api/v1/tension/teus?book_id={BOOK}")
        assert resp.json()[0]["line_id"] == "line-1"

    def test_ungrouped_teu_has_null_line_id(self, tension_client, mock_tension):
        """The point of this endpoint: TEUs grouping dropped are visible here."""
        mock_tension.get_teus.return_value = [_make_teu("t1", 1), _make_teu("t2", 7)]
        mock_tension.get_lines.return_value = [
            TensionLine(id="line-1", document_id=BOOK, teu_ids=["t1"])
        ]
        body = tension_client.get(f"/api/v1/tension/teus?book_id={BOOK}").json()
        by_id = {t["id"]: t for t in body}
        assert by_id["t1"]["line_id"] == "line-1"
        assert by_id["t2"]["line_id"] is None

    def test_preserves_service_ordering(self, tension_client, mock_tension):
        mock_tension.get_teus.return_value = [
            _make_teu("t1", 1),
            _make_teu("t2", 4),
            _make_teu("t3", 9),
        ]
        body = tension_client.get(f"/api/v1/tension/teus?book_id={BOOK}").json()
        assert [t["chapter"] for t in body] == [1, 4, 9]


# ── Background tasks are cancellable ─────────────────────────────────────────


class TestCancellation:
    """``POST /tension/analyze`` is the batch TEU assembly — the longest run
    on this router, and the one a user is most likely to want to stop.

    Before the migration it went through ``BackgroundTasks.add_task``, which
    hands back no task handle, so ``POST /tasks/:id/cancel`` could only answer
    409 "not cancellable".
    """

    def _start(self, client) -> str:
        resp = client.post("/api/v1/tension/analyze", json={"document_id": BOOK})
        assert resp.status_code == 202
        return resp.json()["taskId"]

    def test_running_batch_can_be_cancelled(self, tension_client, mock_tension):
        mock_tension.analyze_book_tensions.side_effect = hanging_call()

        task_id = self._start(tension_client)

        resp = tension_client.post(f"/api/v1/tasks/{task_id}/cancel")
        assert resp.status_code == 204, "runner was not registered as cancellable"

    def test_cancelled_batch_ends_up_failed(self, tension_client, mock_tension):
        mock_tension.analyze_book_tensions.side_effect = hanging_call()

        task_id = self._start(tension_client)
        tension_client.post(f"/api/v1/tasks/{task_id}/cancel")

        status = poll_until_terminal(tension_client, task_id)
        assert status["status"] == "error"
        assert status["error"] == "cancelled"

    def test_completion_carries_the_summary(self, tension_client, mock_tension):
        mock_tension.analyze_book_tensions.return_value = {"assembled": 12, "failed": 0}

        task_id = self._start(tension_client)

        status = poll_until_terminal(tension_client, task_id)
        assert status["status"] == "done"
        assert status["result"] == {"assembled": 12, "failed": 0}

    def test_failure_reaches_the_task(self, tension_client, mock_tension):
        mock_tension.analyze_book_tensions.side_effect = RuntimeError("Qdrant 連不上")

        task_id = self._start(tension_client)

        status = poll_until_terminal(tension_client, task_id)
        assert status["status"] == "error"
        assert status["error"] == "Qdrant 連不上"


@pytest.fixture
def scene_client(tension_client, mock_doc, mock_kg, mock_tension):
    """Two chapters: ch1 has a divider, ch2 has none.

    Local rather than in conftest, per docs/guides/TESTING.md — only this file
    needs paragraphs shaped around a separator.
    """
    from unittest.mock import AsyncMock

    from storysphere.domain.documents import Paragraph, ParagraphRole
    from storysphere.domain.events import Event
    from storysphere.domain.tension import TEU, TensionPole

    def _para(ch, pos, text, role=ParagraphRole.body):
        return Paragraph(text=text, chapter_number=ch, position=pos, role=role)

    mock_doc.get_paragraphs = AsyncMock(return_value=[
        _para(1, 0, "鹹水井邊相遇"),
        _para(1, 1, "✦ ✦ ✦", ParagraphRole.separator),
        _para(1, 2, "泥灘上的懷錶"),
        _para(2, 0, "母親補襯衫，針腳細密，一針一針。"),
    ])

    def _ev(eid, ch, pos, title):
        return Event(
            id=eid, document_id="book-1", title=title, event_type="meeting",
            description=title, chapter=ch, narrative_position=pos,
            tension_signal="explicit",
        )

    mock_kg.get_events = AsyncMock(return_value=[
        _ev("e1", 1, 1, "鹹水井邊相遇"),
        _ev("e2", 1, 2, "泥灘上的懷錶"),
        _ev("e3", 2, 1, "母親補襯衫"),
    ])

    def _teu(tid, eid, ch):
        return TEU(
            id=tid, event_id=eid, document_id="book-1", chapter=ch,
            pole_a=TensionPole(concept_name="A"), pole_b=TensionPole(concept_name="B"),
            tension_description="…",
        )

    mock_tension.get_teus = AsyncMock(return_value=[
        _teu("t1", "e1", 1), _teu("t2", "e2", 1), _teu("t3", "e3", 2),
    ])
    mock_tension.get_lines = AsyncMock(return_value=[])
    return tension_client


class TestTeuSceneIndex:
    """B-068: scenes reach the page, and 'not known' stays distinguishable."""

    def _by_id(self, resp):
        return {t["id"]: t for t in resp.json()}

    def test_divider_splits_the_chapter_into_two_scenes(self, scene_client):
        resp = scene_client.get("/api/v1/tension/teus?book_id=book-1")

        teus = self._by_id(resp)
        assert teus["t1"]["scene_index"] == 1
        assert teus["t2"]["scene_index"] == 2

    def test_chapter_without_a_divider_reports_null_not_one(self, scene_client):
        """Null means 'not known'. Reporting 1 would assert the opposite."""
        resp = scene_client.get("/api/v1/tension/teus?book_id=book-1")

        assert self._by_id(resp)["t3"]["scene_index"] is None

    def test_scene_index_is_separate_from_narrative_run_index(self, scene_client):
        """Two different criteria; conflating them is what B-068 corrected.

        All three events are `present`, so every run index is 1 — while the
        scene indices differ. One field cannot stand in for the other.

        Note the snake_case keys: TEUDetail is a plain BaseModel, not one of
        the `to_camel` schemas. An earlier version of these tests asserted
        `sceneIndex` and passed — against an empty list, so the loop body never
        ran. A vacuous assertion is worse than none.
        """
        teus = self._by_id(scene_client.get("/api/v1/tension/teus?book_id=book-1"))

        assert [teus[t]["narrative_run_index"] for t in ("t1", "t2")] == [1, 1]
        assert [teus[t]["scene_index"] for t in ("t1", "t2")] == [1, 2]
