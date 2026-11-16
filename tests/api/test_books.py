from __future__ import annotations

from datetime import UTC, datetime

from storysphere.store.tables import Job

from tests.api.support import P, add_book, seed
from tests.store.conftest import BOOK

PROFILE = {
    "primary": "mystery",
    "mixed": [{"genre": "thriller", "score": 0.8, "chapters": [3, 4]}],
    "mechanism_density": {"info_control": 1.0, "world_rules": 0.5},
    "rationale": "資訊控制密度最高",
    "detected_by": "google_genai:gemini-2.5-flash",
    "detected_at": "2026-11-16T06:00:00+00:00",
}


async def _two_books(store):
    await add_book(store.session, profile=PROFILE)
    await add_book(store.session, "book-2", title="還在入庫")
    store.session.add_all(
        [
            Job(id="j-old", kind="ingest", book_id=BOOK, status="error",
                created_at=datetime(2026, 11, 1, tzinfo=UTC)),
            Job(id="j-new", kind="ingest_rerun", book_id=BOOK, status="done",
                created_at=datetime(2026, 11, 2, tzinfo=UTC)),
            # 方法的 job 不算入庫狀態
            Job(id="j-method", kind="method_run", book_id=BOOK, status="running",
                created_at=datetime(2026, 11, 3, tzinfo=UTC)),
            Job(id="j-2", kind="ingest", book_id="book-2", status="awaiting_review"),
        ]
    )  # fmt: skip


class TestListBooks:
    def test_empty_library(self, client):
        assert client.get(f"{P}/books").json() == []

    def test_books_carry_the_latest_ingest_job_and_effective_genre(self, db_file, client):
        seed(db_file, _two_books)
        books = {book["id"]: book for book in client.get(f"{P}/books").json()}
        assert books[BOOK]["ingestStatus"] == "done" and books[BOOK]["ingestJobId"] == "j-new"
        assert books[BOOK]["effectiveGenre"] == "mystery"
        assert books[BOOK]["chapterCount"] == 1  # 第 0 章是 other，不算
        assert books[BOOK]["uploadedAt"].endswith("Z")
        assert books["book-2"]["ingestStatus"] == "awaiting_review"
        assert books["book-2"]["effectiveGenre"] is None


class TestGetBook:
    def test_detail_has_the_genre_profile_in_camel_case(self, db_file, client):
        seed(db_file, _two_books)
        book = client.get(f"{P}/books/{BOOK}").json()
        assert book["fileType"] == "txt" and book["genreOverride"] is None
        assert book["genreProfile"]["detectedBy"] == "google_genai:gemini-2.5-flash"
        # 機制名是資料，不轉
        assert book["genreProfile"]["mechanismDensity"] == {"info_control": 1.0, "world_rules": 0.5}

    def test_unknown_book_is_404(self, client):
        response = client.get(f"{P}/books/nope")
        assert response.status_code == 404 and response.json()["code"] == "not_found"


class TestChapters:
    def test_chapters_in_order_with_paragraph_stats(self, db_file, client):
        seed(db_file, _two_books)
        assert client.get(f"{P}/books/{BOOK}/chapters").json() == [
            {"number": 0, "title": None, "role": "other", "paragraphCount": 0, "firstParagraphId": None},
            {"number": 1, "title": "演繹的科學", "role": "body", "paragraphCount": 3, "firstParagraphId": "p-1"},
        ]  # fmt: skip

    def test_unknown_book_is_404(self, client):
        assert client.get(f"{P}/books/nope/chapters").status_code == 404


class TestGenre:
    def test_profile_and_override(self, db_file, client):
        async def fill(store):
            await _two_books(store)
            from storysphere.store.books import set_genre_override

            await set_genre_override(store.session, BOOK, "romance")

        seed(db_file, fill)
        card = client.get(f"{P}/books/{BOOK}/genre").json()
        assert (card["primary"], card["override"], card["effectiveGenre"]) == ("mystery", "romance", "romance")
        assert card["mixed"] == [{"genre": "thriller", "score": 0.8, "chapters": [3, 4]}]
        assert card["mechanismDensity"]["info_control"] == 1.0

    def test_book_not_yet_classified(self, db_file, client):
        seed(db_file, _two_books)
        card = client.get(f"{P}/books/book-2/genre").json()
        assert card["primary"] is None and card["mixed"] == [] and card["mechanismDensity"] == {}
