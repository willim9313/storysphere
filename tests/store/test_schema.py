"""Schema tests for the evidence store: tables, defaults, FTS sync and cascades.

用真實的 SQLite 檔（`tmp_path`），不 mock。
"""

from __future__ import annotations

from datetime import datetime

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from storysphere.store.db import create_engine, init_db, make_session_factory
from storysphere.store.tables import (
    Evidence,
    EvidenceEdit,
    EvidenceGenreExt,
    EvidenceLink,
    EvidenceQuote,
    EvidenceSubject,
)

EXPECTED_TABLES = {
    "evidence",
    "evidence_subject",
    "evidence_link",
    "evidence_quote",
    "evidence_genre_ext",
    "evidence_edits",
    "runs",
    "jobs",
}

CHILD_TABLES = (EvidenceSubject, EvidenceLink, EvidenceQuote, EvidenceGenreExt, EvidenceEdit)


@pytest.fixture
async def engine(tmp_path):
    engine = create_engine(tmp_path / "neo.db")
    await init_db(engine)
    yield engine
    await engine.dispose()


@pytest.fixture
async def session(engine):
    async with make_session_factory(engine)() as session:
        yield session


def make_evidence(**overrides) -> Evidence:
    """只填必填欄位的證據。"""
    fields = {
        "book_id": "book-1",
        "claim_type": "event",
        "level": 1,
        "summary": "偵探在書房發現一封被燒掉一半的信",
        "source": "extraction",
        "confidence": 0.9,
        "produced_via": "pipeline",
    }
    fields.update(overrides)
    return Evidence(**fields)


async def fts_ids(session, query: str) -> list[str]:
    result = await session.execute(
        text("SELECT evidence_id FROM evidence_fts WHERE evidence_fts MATCH :q"), {"q": query}
    )
    return list(result.scalars())


async def table_names(engine) -> set[str]:
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT name FROM sqlite_master WHERE type = 'table'"))
        return set(result.scalars())


async def count_rows(session, model, evidence_id: str) -> int:
    result = await session.execute(
        select(func.count()).select_from(model).where(model.evidence_id == evidence_id)
    )
    return result.scalar_one()


async def add_children(session, evidence_id: str) -> None:
    """每張子表各放一列。"""
    session.add_all(
        [
            EvidenceSubject(evidence_id=evidence_id, subject_id="char-1", role="participant"),
            EvidenceLink(evidence_id=evidence_id, upstream_id="upstream-1"),
            EvidenceQuote(
                evidence_id=evidence_id,
                seq=0,
                paragraph_id="para-1",
                start=0,
                end=9,
                text="壁爐裡的灰燼還是溫的",
                verified=True,
            ),
            EvidenceGenreExt(
                evidence_id=evidence_id, genre="mystery", data_json={"mystery_role": "suspect"}
            ),
            EvidenceEdit(evidence_id=evidence_id, action="modify", before_json={"summary": "舊"}),
        ]
    )
    await session.commit()


class TestInitDb:
    async def test_creates_all_tables_and_fts(self, engine):
        names = await table_names(engine)

        assert EXPECTED_TABLES <= names
        assert "evidence_fts" in names

    async def test_called_twice_keeps_existing_data(self, engine, session):
        evidence = make_evidence()
        session.add(evidence)
        await session.commit()

        await init_db(engine)

        assert EXPECTED_TABLES <= await table_names(engine)
        assert await fts_ids(session, "被燒掉一半") == [evidence.id]

    async def test_missing_parent_directory_is_created(self, tmp_path):
        db_path = tmp_path / "nested" / "dir" / "neo.db"

        engine = create_engine(db_path)
        await init_db(engine)
        await engine.dispose()

        assert db_path.exists()

    async def test_foreign_keys_enabled_on_connection(self, engine):
        async with engine.connect() as conn:
            result = await conn.execute(text("PRAGMA foreign_keys"))

            assert result.scalar_one() == 1


class TestEvidenceDefaults:
    async def test_minimal_insert_fills_defaults(self, session):
        evidence = make_evidence()
        session.add(evidence)
        await session.commit()

        assert evidence.id
        assert evidence.status == "current"
        assert evidence.review_status == "pending"
        assert evidence.basis_changed is False
        assert isinstance(evidence.created_at, datetime)
        assert isinstance(evidence.updated_at, datetime)

    async def test_minimal_insert_leaves_optional_columns_null(self, session):
        evidence = make_evidence()
        session.add(evidence)
        await session.commit()

        row = (
            await session.execute(
                text(
                    "SELECT discourse_chapter, story_rank, known_by, run_id, basis_changed_at "
                    "FROM evidence WHERE id = :id"
                ),
                {"id": evidence.id},
            )
        ).one()

        assert tuple(row) == (None, None, None, None, None)

    async def test_two_inserts_get_distinct_ids(self, session):
        first, second = make_evidence(), make_evidence()
        session.add_all([first, second])
        await session.commit()

        assert first.id != second.id

    async def test_genre_ext_without_system_tag_defaults_to_empty_string(self, session):
        evidence = make_evidence()
        session.add(evidence)
        await session.flush()
        ext = EvidenceGenreExt(evidence_id=evidence.id, genre="mystery", data_json={})
        session.add(ext)
        await session.commit()

        assert ext.system_tag == ""


class TestEvidenceFts:
    async def test_inserted_evidence_found_by_chinese_summary_substring(self, session):
        evidence = make_evidence()
        other = make_evidence(summary="管家在午夜離開了莊園")
        session.add_all([evidence, other])
        await session.commit()

        assert await fts_ids(session, "被燒掉") == [evidence.id]

    async def test_query_shorter_than_three_chars_finds_nothing(self, session):
        session.add(make_evidence())
        await session.commit()

        assert await fts_ids(session, "書房") == []

    async def test_inserted_quote_found_by_quote_text(self, session):
        evidence = make_evidence()
        session.add(evidence)
        await session.flush()
        session.add(
            EvidenceQuote(
                evidence_id=evidence.id,
                seq=0,
                paragraph_id="para-1",
                text="壁爐裡的灰燼還是溫的",
                verified=True,
            )
        )
        await session.commit()

        assert await fts_ids(session, "灰燼還是") == [evidence.id]

    async def test_quotes_joined_by_newline_in_seq_order(self, session):
        evidence = make_evidence()
        session.add(evidence)
        await session.flush()
        # 故意倒著寫入，確認是依 seq 而不是寫入順序。
        for seq, quote in ((1, "第二段引文"), (0, "第一段引文")):
            session.add(
                EvidenceQuote(
                    evidence_id=evidence.id,
                    seq=seq,
                    paragraph_id="para-1",
                    text=quote,
                    verified=True,
                )
            )
            await session.flush()
        await session.commit()

        quotes = (
            await session.execute(
                text("SELECT quotes FROM evidence_fts WHERE evidence_id = :id"),
                {"id": evidence.id},
            )
        ).scalar_one()

        assert quotes == "第一段引文\n第二段引文"

    async def test_deleted_quote_no_longer_matches(self, session):
        evidence = make_evidence()
        session.add(evidence)
        await session.flush()
        quote = EvidenceQuote(
            evidence_id=evidence.id,
            seq=0,
            paragraph_id="para-1",
            text="壁爐裡的灰燼還是溫的",
            verified=True,
        )
        session.add(quote)
        await session.commit()

        await session.delete(quote)
        await session.commit()

        assert await fts_ids(session, "灰燼還是") == []
        assert await fts_ids(session, "被燒掉") == [evidence.id]

    async def test_updated_quote_text_updates_index(self, session):
        evidence = make_evidence()
        session.add(evidence)
        await session.flush()
        quote = EvidenceQuote(
            evidence_id=evidence.id,
            seq=0,
            paragraph_id="para-1",
            text="壁爐裡的灰燼還是溫的",
            verified=True,
        )
        session.add(quote)
        await session.commit()

        quote.text = "窗台上留著半個腳印"
        await session.commit()

        assert await fts_ids(session, "灰燼還是") == []
        assert await fts_ids(session, "半個腳印") == [evidence.id]

    async def test_updated_summary_updates_index(self, session):
        evidence = make_evidence()
        session.add(evidence)
        await session.commit()

        evidence.summary = "園丁承認他見過那把鑰匙"
        await session.commit()

        assert await fts_ids(session, "被燒掉") == []
        assert await fts_ids(session, "那把鑰匙") == [evidence.id]

    async def test_deleted_evidence_removed_from_index_and_children(self, session):
        evidence = make_evidence()
        session.add(evidence)
        await session.flush()
        await add_children(session, evidence.id)

        await session.delete(evidence)
        await session.commit()

        assert await fts_ids(session, "被燒掉") == []
        assert await fts_ids(session, "灰燼還是") == []
        remaining = (await session.execute(text("SELECT count(*) FROM evidence_fts"))).scalar_one()
        assert remaining == 0
        for model in (EvidenceQuote, EvidenceLink, EvidenceSubject):
            assert await count_rows(session, model, evidence.id) == 0


class TestEvidenceCascade:
    async def test_deleted_evidence_cascades_to_all_child_tables(self, session):
        evidence = make_evidence()
        session.add(evidence)
        await session.flush()
        await add_children(session, evidence.id)
        for model in CHILD_TABLES:
            assert await count_rows(session, model, evidence.id) == 1

        await session.delete(evidence)
        await session.commit()

        for model in CHILD_TABLES:
            assert await count_rows(session, model, evidence.id) == 0

    async def test_deleted_evidence_keeps_other_evidence_children(self, session):
        doomed, kept = make_evidence(), make_evidence(summary="管家在午夜離開了莊園")
        session.add_all([doomed, kept])
        await session.flush()
        await add_children(session, doomed.id)
        await add_children(session, kept.id)

        await session.delete(doomed)
        await session.commit()

        for model in CHILD_TABLES:
            assert await count_rows(session, model, kept.id) == 1

    async def test_child_without_parent_evidence_rejected(self, session):
        session.add(EvidenceLink(evidence_id="no-such-evidence", upstream_id="upstream-1"))

        with pytest.raises(IntegrityError):
            await session.commit()


class TestEvidenceLinkPrimaryKey:
    async def test_duplicate_link_rejected(self, engine, session):
        evidence = make_evidence()
        session.add(evidence)
        await session.flush()
        session.add(EvidenceLink(evidence_id=evidence.id, upstream_id="upstream-1"))
        await session.commit()

        # 另開一個 session，避開同一 session 內 identity map 的重複檢查，讓資料庫來擋。
        async with make_session_factory(engine)() as other:
            other.add(EvidenceLink(evidence_id=evidence.id, upstream_id="upstream-1"))
            with pytest.raises(IntegrityError):
                await other.commit()

    async def test_same_evidence_different_upstreams_allowed(self, session):
        evidence = make_evidence()
        session.add(evidence)
        await session.flush()
        session.add_all(
            [
                EvidenceLink(evidence_id=evidence.id, upstream_id="upstream-1"),
                EvidenceLink(evidence_id=evidence.id, upstream_id="upstream-2"),
            ]
        )
        await session.commit()

        assert await count_rows(session, EvidenceLink, evidence.id) == 2
