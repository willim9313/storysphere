from __future__ import annotations

from dataclasses import dataclass

import pytest
from storysphere.store.evidence_writer import QuoteDraft, WriteContext, write_evidence
from storysphere.store.tables import EvidenceEdit, Run

from tests.api.support import P, add_book, seed
from tests.store.conftest import BOOK, FakeParagraphs, make_draft


@dataclass
class Ids:
    run: str
    event: str
    character: str
    role: str
    rejected: str
    superseded: str


async def write(store, draft, *, source="extraction", run=None, paragraphs=None):
    ctx = WriteContext(
        book_id=BOOK, source=source, produced_via="pipeline", run_id=run.id if run else None
    )
    return await write_evidence(store.session, ctx, draft, paragraphs)


async def _evidence(store) -> Ids:
    await add_book(store.session)
    run = Run(book_id=BOOK, ref_id="event.kernel_satellite", status="done")
    store.session.add(run)
    await store.session.flush()
    event = await write(
        store,
        make_draft(
            "event", summary="福爾摩斯拿下瓶子", discourse_chapter=1, confidence=0.9,
            quotes=[QuoteDraft(paragraph_id="p-1", text="福爾摩斯從壁爐架的角落拿下一個瓶子")],
        ),
        paragraphs=FakeParagraphs(),
    )  # fmt: skip
    character = await write(
        store,
        make_draft("character", summary="角色福爾摩斯", confidence=0.9,
                   quotes=[QuoteDraft(paragraph_id="p-1", text="夏洛克·福爾摩斯")]),
        paragraphs=FakeParagraphs(),
    )  # fmt: skip
    role = await write(
        store,
        make_draft(
            "event_role", summary="拿瓶子是關鍵事件", discourse_chapter=1,
            content={"event_id": event.id, "weight": "kernel"}, derived_from=[event.id],
            subjects=[{"subject_id": character.id, "role": "agent"}],
        ),
        source="method", run=run,
    )  # fmt: skip
    rejected = await write(
        store,
        make_draft("event_role", summary="被拒絕的", discourse_chapter=2,
                   content={"event_id": event.id, "weight": "satellite"}, derived_from=[event.id]),
        source="method", run=run,
    )  # fmt: skip
    rejected.review_status = "rejected"
    superseded = await write(
        store,
        make_draft("event_role", summary="舊的", content={"event_id": event.id, "weight": "kernel"},
                   derived_from=[event.id]),
        source="method",
    )  # fmt: skip
    superseded.status = "superseded"
    store.session.add(
        EvidenceEdit(evidence_id=role.id, action="modify", before_json={"summary": "原本的"})
    )
    await store.session.flush()
    return Ids(run.id, event.id, character.id, role.id, rejected.id, superseded.id)


@pytest.fixture
def ids(db_file) -> Ids:
    return seed(db_file, _evidence)


def _ids_of(page) -> list[str]:
    return [item["id"] for item in page["items"]]


class TestListEvidence:
    def test_default_is_level_2_and_up_current_and_not_rejected(self, ids, client):
        page = client.get(f"{P}/books/{BOOK}/evidence").json()
        assert _ids_of(page) == [ids.role] and page["total"] == 1 and page["nextCursor"] is None
        item = page["items"][0]
        assert item["claimType"] == "event_role" and item["level"] == 2
        assert item["subjects"] == [{"subjectId": ids.character, "role": "agent"}]
        assert item["quoteCount"] == 0 and item["firstQuote"] is None
        assert item["content"] is None  # 沒帶 withContent

    def test_include_l1_and_with_content(self, ids, client):
        page = client.get(f"{P}/books/{BOOK}/evidence?includeL1=true&withContent=true").json()
        by_id = {item["id"]: item for item in page["items"]}
        assert set(by_id) == {ids.event, ids.character, ids.role}
        assert by_id[ids.event]["content"]["eventType"] == "revelation"  # key 轉 camelCase
        assert by_id[ids.event]["firstQuote"] == "福爾摩斯從壁爐架的角落拿下一個瓶子"

    def test_rejected_and_superseded_only_when_asked(self, ids, client):
        assert _ids_of(client.get(f"{P}/books/{BOOK}/evidence?reviewStatus=rejected").json()) == [ids.rejected]
        assert _ids_of(client.get(f"{P}/books/{BOOK}/evidence?status=superseded").json()) == [ids.superseded]

    @pytest.mark.parametrize(
        ("query", "expected"),
        [
            ("claimType=character&claimType=event", {"event", "character"}),
            ("minLevel=2", {"role"}),
            ("maxLevel=1", {"event", "character"}),
            ("chapterFrom=1&chapterTo=1", {"event", "role"}),
            ("source=method", {"role"}),
        ],
    )
    def test_filters(self, ids, client, query, expected):
        page = client.get(f"{P}/books/{BOOK}/evidence?includeL1=true&{query}").json()
        assert set(_ids_of(page)) == {getattr(ids, name) for name in expected}

    def test_filter_by_run_and_subject(self, ids, client):
        assert _ids_of(client.get(f"{P}/books/{BOOK}/evidence?runId={ids.run}").json()) == [ids.role]
        page = client.get(f"{P}/books/{BOOK}/evidence?subjectId={ids.character}").json()
        assert _ids_of(page) == [ids.role]

    def test_full_text_search_on_summary_and_quotes(self, ids, client):
        # 3 個字以上走 FTS：「壁爐架」只在引文裡
        page = client.get(f"{P}/books/{BOOK}/evidence", params={"q": "壁爐架", "includeL1": True}).json()
        assert _ids_of(page) == [ids.event]

    def test_short_queries_fall_back_to_substring_match(self, ids, client):
        # trigram 搜不到 2 個字的查詢；改用 LIKE
        page = client.get(f"{P}/books/{BOOK}/evidence", params={"q": "瓶子", "includeL1": True}).json()
        assert set(_ids_of(page)) == {ids.event, ids.role}

    @pytest.mark.parametrize("q", ['"x" OR *', "NEAR(a b)", "%_%"])
    def test_query_syntax_characters_are_taken_literally(self, ids, client, q):
        response = client.get(f"{P}/books/{BOOK}/evidence", params={"q": q, "includeL1": True})
        assert response.status_code == 200 and response.json()["total"] == 0

    def test_pagination(self, ids, client):
        first = client.get(f"{P}/books/{BOOK}/evidence?includeL1=true&limit=2").json()
        assert len(first["items"]) == 2 and first["total"] == 3 and first["nextCursor"]
        second = client.get(
            f"{P}/books/{BOOK}/evidence?includeL1=true&limit=2&cursor={first['nextCursor']}"
        ).json()
        assert len(second["items"]) == 1 and second["nextCursor"] is None
        assert set(_ids_of(first)) | set(_ids_of(second)) == {ids.event, ids.character, ids.role}

    def test_unknown_book_is_404(self, client):
        assert client.get(f"{P}/books/nope/evidence").status_code == 404


class TestGetEvidence:
    def test_full_evidence_with_upstream_and_edits(self, ids, client):
        evidence = client.get(f"{P}/books/{BOOK}/evidence/{ids.role}").json()
        assert evidence["derivedFrom"] == [{"upstreamId": ids.event, "upstreamKind": "evidence"}]
        assert evidence["content"]["eventId"] == ids.event and evidence["content"]["weight"] == "kernel"
        assert evidence["quotes"] == [] and evidence["genreExt"] == []
        (edit,) = evidence["edits"]
        assert edit["action"] == "modify" and edit["before"] == {"summary": "原本的"}
        assert edit["editedAt"].endswith("Z")

    def test_level_1_is_readable_by_id(self, ids, client):
        evidence = client.get(f"{P}/books/{BOOK}/evidence/{ids.event}").json()
        (quote,) = evidence["quotes"]
        assert quote["paragraphId"] == "p-1" and quote["verified"] is True
        assert quote["start"] == 4  # 「夏洛克·」之後

    def test_evidence_of_another_book_is_404(self, ids, client):
        assert client.get(f"{P}/books/book-2/evidence/{ids.role}").status_code == 404
        assert client.get(f"{P}/books/{BOOK}/evidence/nope").status_code == 404


class TestTrace:
    def test_upstream_goes_down_to_level_1(self, ids, client):
        trace = client.get(f"{P}/books/{BOOK}/evidence/{ids.role}/trace").json()
        nodes = {node["id"]: node for node in trace["nodes"]}
        assert trace["root"] == ids.role and set(nodes) == {ids.role, ids.event}
        assert nodes[ids.event]["level"] == 1 and nodes[ids.event]["firstQuote"]
        assert trace["edges"] == [{"from": ids.role, "to": ids.event}]

    def test_downstream_lists_who_cites_it(self, ids, client):
        trace = client.get(f"{P}/books/{BOOK}/evidence/{ids.event}/trace?direction=downstream").json()
        assert {node["id"] for node in trace["nodes"]} == {
            ids.event, ids.role, ids.rejected, ids.superseded,
        }  # fmt: skip

    def test_depth_is_capped(self, ids, client):
        assert client.get(f"{P}/books/{BOOK}/evidence/{ids.role}/trace?depth=7").status_code == 422


class TestParagraph:
    def test_paragraph_with_context_and_highlights(self, ids, client):
        view = client.get(
            f"{P}/books/{BOOK}/paragraphs/p-2?context=1&highlightEvidenceId={ids.event}"
        ).json()
        assert view["paragraph"]["chapterTitle"] == "演繹的科學"
        assert [p["id"] for p in view["before"]] == ["p-1"]
        assert [p["id"] for p in view["after"]] == ["p-3"]
        assert view["highlights"] == []  # 那筆證據的引文在 p-1，不在 p-2

    def test_highlight_positions(self, ids, client):
        view = client.get(f"{P}/books/{BOOK}/paragraphs/p-1?highlightEvidenceId={ids.event}").json()
        (highlight,) = view["highlights"]
        text = view["paragraph"]["text"]
        assert text[highlight["start"] : highlight["end"]] == "福爾摩斯從壁爐架的角落拿下一個瓶子"
        assert view["before"] == [] and view["after"] == []

    def test_unknown_paragraph_is_404(self, ids, client):
        assert client.get(f"{P}/books/{BOOK}/paragraphs/nope").status_code == 404
