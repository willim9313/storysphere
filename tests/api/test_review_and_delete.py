"""N-05e 審核證據、N-01d 刪書。"""

from __future__ import annotations

from dataclasses import dataclass

import pytest
from sqlalchemy import func, select, text
from storysphere.store.tables import Evidence, Job, Run

from tests.api.support import P, add_book, seed
from tests.store.conftest import BOOK


@dataclass
class Ids:
    event: str
    link: str
    role: str
    note: str


async def _chain(store) -> Ids:
    """event（L1）→ causal_link（L2）→ event_role（L3）→ note。"""
    await add_book(store.session)
    run = await store.run("event.causal_network")
    event = await store.extracted("event")
    link = await store.derived("causal_link", [event], run=run)
    role = await store.derived("event_role", [link])
    note = await store.note([role])
    return Ids(event.id, link.id, role.id, note.id)


@pytest.fixture
def ids(db_file) -> Ids:
    return seed(db_file, _chain)


def review(client, evidence_id, **body):
    return client.post(f"{P}/books/{BOOK}/evidence/{evidence_id}/review", json=body)


class TestReview:
    def test_approve(self, ids, client):
        response = review(client, ids.link, action="approve")
        assert response.status_code == 200
        assert response.json()["evidence"]["reviewStatus"] == "approved"
        assert response.json()["propagation"] is None

    def test_modify_keeps_the_old_values(self, ids, client):
        response = review(client, ids.link, action="modify", summary="新摘要",
                          content={"rationale": "改過的理由", "linkType": "physical"})  # fmt: skip
        evidence = response.json()["evidence"]
        assert evidence["reviewStatus"] == "modified" and evidence["summary"] == "新摘要"
        assert evidence["content"]["rationale"] == "改過的理由"
        assert evidence["content"]["linkType"] == "physical"
        (edit,) = client.get(f"{P}/books/{BOOK}/evidence/{ids.link}").json()["edits"]
        assert edit["action"] == "modify"
        assert edit["before"] == {
            "summary": "causal_link 摘要",
            "content": {"rationale": "", "link_type": "motivational"},
        }

    def test_modified_content_is_searchable(self, ids, client):
        review(client, ids.link, action="modify", summary="阿格拉寶藏的線索")
        page = client.get(f"{P}/books/{BOOK}/evidence", params={"q": "阿格拉寶藏"}).json()
        assert [item["id"] for item in page["items"]] == [ids.link]

    def test_reject_flags_everything_downstream(self, ids, client):
        response = review(client, ids.link, action="reject", reason="因果方向錯了")
        assert response.json()["propagation"] == {"evidenceCount": 2, "noteCount": 1}
        role = client.get(f"{P}/books/{BOOK}/evidence/{ids.role}").json()
        assert role["basisChanged"] is True
        (edit,) = client.get(f"{P}/books/{BOOK}/evidence/{ids.link}").json()["edits"]
        assert edit["action"] == "reject" and edit["reason"] == "因果方向錯了"

    def test_reject_announces_basis_changed_on_the_book_stream(self, ids, client):
        review(client, ids.link, action="reject")
        (event,) = client.app.state.event_bus.replay(f"book:{BOOK}", 0)
        assert event.type == "basis.changed"
        assert event.data["cause"] == {"kind": "rejected", "evidenceId": ids.link}
        assert sorted(event.data["evidenceIds"]) == sorted([ids.role, ids.note])
        assert event.data["noteIds"] == [ids.note]

    def test_level_1_is_403(self, ids, client):
        response = review(client, ids.event, action="approve")
        assert response.status_code == 403 and response.json()["code"] == "level1_readonly"

    def test_rejected_is_final(self, ids, client):
        review(client, ids.link, action="reject")
        response = review(client, ids.link, action="approve")
        assert response.status_code == 409 and response.json()["code"] == "invalid_state"

    @pytest.mark.parametrize(
        "body",
        [
            {"action": "approve", "level": 3},
            {"action": "modify", "content": {"rationale": "x", "derivedFrom": []}},
            {"action": "modify", "content": {"review_status": "approved"}},
        ],
    )
    def test_system_fields_are_rejected_not_ignored(self, ids, client, body):
        response = review(client, ids.link, **body)
        assert response.status_code == 422 and response.json()["code"] == "system_field_forbidden"

    @pytest.mark.parametrize(
        "content",
        [
            {"causeEventId": "other"},  # 參照欄位不能改
            {"nope": 1},  # 不是這個類型的欄位
            {"linkType": "telepathic"},  # 枚舉外
        ],
    )
    def test_bad_modifications_are_422(self, ids, client, content):
        response = review(client, ids.link, action="modify", content=content)
        assert response.status_code == 422 and response.json()["code"] == "validation_error"

    def test_unknown_action_is_422(self, ids, client):
        assert review(client, ids.link, action="burn").status_code == 422

    def test_unknown_evidence_is_404(self, ids, client):
        assert review(client, "nope", action="approve").status_code == 404


class TestDeleteBook:
    def test_every_row_of_the_book_goes_and_other_books_stay(self, ids, db_file, client):
        seed(db_file, lambda store: add_book(store.session, "book-2"))
        assert client.delete(f"{P}/books/{BOOK}").status_code == 204
        assert [book["id"] for book in client.get(f"{P}/books").json()] == ["book-2"]

        async def counts():
            async with client.app.state.session_factory() as session:
                return (
                    await session.scalar(select(func.count()).select_from(Evidence)),
                    await session.scalar(select(func.count()).select_from(Run)),
                    await session.scalar(text("SELECT count(*) FROM ev_causal_link")),
                    await session.scalar(text("SELECT count(*) FROM evidence_link")),
                    await session.scalar(text("SELECT count(*) FROM evidence_fts")),
                    await session.scalar(text("SELECT count(*) FROM paragraphs")),
                )

        assert client.portal.call(counts) == (0, 0, 0, 0, 0, 0)

    def test_unfinished_job_is_409(self, ids, db_file, client):
        seed(db_file, lambda store: _add(store, Job(id="j1", kind="method_run", book_id=BOOK,
                                                     status="paused_quota")))  # fmt: skip
        response = client.delete(f"{P}/books/{BOOK}")
        assert response.status_code == 409 and response.json()["jobId"] == "j1"
        assert client.get(f"{P}/books/{BOOK}").status_code == 200

    def test_unknown_book_is_404(self, client):
        assert client.delete(f"{P}/books/nope").status_code == 404


async def _add(store, row):
    store.session.add(row)
