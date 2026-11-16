"""S2 整合測試：真實 SQLite（tmp_path）＋手寫的一小本合成書與 S1 輸出；不叫 LLM。"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker
from storysphere.domain.documents import Chapter, Document, FileType, Paragraph
from storysphere.ingest.s2 import S2Report, run_s2
from storysphere.ingest.service import IngestService, open_checkpointer
from storysphere.ingest.units import build_units
from storysphere.llm.json_output import extract_json_from_text
from storysphere.store.books import BookParagraphSource, ParagraphRow, save_book
from storysphere.store.content_tables import get_content
from storysphere.store.db import create_engine, init_db, make_session_factory
from storysphere.store.ingest_units import IngestUnitOutputRow, IngestUnitRow, seed_units
from storysphere.store.paragraph_entities import ParagraphEntityRow
from storysphere.store.tables import Evidence, EvidenceQuote, EvidenceSubject, Job, Run

from tests.ingest.test_unit_runner import BOOK_TEXT

BOOK_ID = "book-s2"
FIXTURES = Path(__file__).parents[1] / "fixtures" / "llm"

# 合成文本（自己寫的，沒有著作權問題）。
PARAGRAPHS = {
    "p1": "偵探林默在清晨抵達莊園，管家老周站在門口迎接。「房門從裡面反鎖了。」老周低聲說。",
    "p2": "老周的兒子周小明從樓上跑下來，林默看見他手裡握著一把銅鑰匙。周小明說：「我沒有碰過那扇門。」",
    "p3": "書房的壁爐裡積著灰燼，窗外的霧氣像一層灰色的紗。",
    "p4": "第二天，周大明從城裡回來，他是老周的另一個兒子。林默問他昨夜身在何處。",
    "p5": "周大明說：「我整夜都在火車上。」林默沒有再問，只是盯著那把銅鑰匙。",
}

U1, U2 = f"{BOOK_ID}:1:0", f"{BOOK_ID}:2:0"

S1A_U1 = {
    "characters": [
        {
            "name": "林默",
            "kind": "person",
            "aliases": ["偵探"],
            "description": "到莊園調查的偵探",
            "attributes": {"occupation": "偵探"},
        },
        {"name": "老周", "kind": "person", "aliases": ["管家", "周先生", "先生"]},
        {"name": "周小明", "kind": "person", "aliases": ["周先生"]},
        "這不是物件",
        {"kind": "person"},
    ],
    "events": [
        {
            "title": "房門反鎖",
            "event_type": "plot",
            "description": "管家報告房門從裡面反鎖",
            "participants": ["老周", "林默", "不存在的人"],
            "quote": "房門從裡面反鎖了",
            "tension_signal": "potential",
            "visibility": "loud",
        },
        {
            "title": "少年否認",
            "event_type": "conflict",
            "description": "周小明否認碰過房門",
            "participants": ["周小明"],
            "quote": "我沒有碰過那扇門！",
        },
        {"title": "憑空的事件", "event_type": "plot", "description": "d", "quote": "原文沒有這句"},
        {"title": "", "quote": "x"},
    ],
    "relation_states": [
        {
            "source": "老周",
            "target": "周小明",
            "relation_type": "family",
            "polarity": "mixed",
            "weight": 0.9,
            "is_bidirectional": True,
            "description": "父子",
            "quote": "老周的兒子周小明",
        },
        {
            "source": "老周",
            "target": "路人",
            "relation_type": "other",
            "polarity": "neutral",
            "quote": "老周的兒子",
        },
        {"source": "老周", "relation_type": "other"},
    ],
    "utterances": [
        {
            "speaker": "老周",
            "addressees": ["林默"],
            "kind": "dialogue",
            "quote": "房門從裡面反鎖了",
        },
        {"speaker": "路人", "addressees": [], "kind": "dialogue", "quote": "房門從裡面反鎖了"},
    ],
}
S1B_U1 = {
    "focalization": {
        "focalizer": "林默",
        "type": "internal",
        "person": "third",
        "quote": "偵探林默在清晨抵達莊園",
    },
    "imagery": [
        {"term": "灰燼", "imagery_type": "object", "quote": "壁爐裡積著灰燼"},
        {"term": "灰塵", "imagery_type": "object", "quote": "積著灰燼"},
        {"term": "霧氣", "imagery_type": "nature", "quote": "窗外的霧氣"},
        {"term": "鬼影", "imagery_type": "ghost", "quote": "原文沒有這句"},
    ],
    "book_setting_hints": [{"aspect": "era", "value": "近代", "quote": "莊園"}],
    "signals": [],
}
S1A_U2 = {
    "characters": [
        {"name": "偵探", "kind": "person", "aliases": ["林默"]},
        {"name": "周大明", "kind": "person", "aliases": ["周先生"]},
        {"name": "周先生", "kind": "person", "aliases": []},
        {"name": "老周先生", "kind": "person", "aliases": []},
        {"name": "路人乙", "kind": "person", "aliases": []},
    ],
    "events": [
        {
            "title": "周大明歸來",
            "event_type": "meeting",
            "description": "周大明從城裡回來",
            "participants": ["周大明", "林默"],
            "quote": "周大明從城裡回來",
        },
        {
            "title": "盤問",
            "event_type": "plot",
            "description": "林默盤問周大明",
            "participants": ["林默", "周大明"],
            "quote": "林默問他昨夜身在何處",
        },
    ],
    "relation_states": [],
    "utterances": [
        {
            "speaker": "周大明",
            "addressees": ["林默"],
            "kind": "dialogue",
            "quote": "我整夜都在火車上",
        }
    ],
}
S1B_U2 = {
    "focalization": {
        "focalizer": None,
        "type": "zero",
        "person": "third",
        "quote": "周大明從城裡回來",
    },
    "imagery": [{"term": "灰燼", "imagery_type": "object", "quote": "那把銅鑰匙"}],
    "book_setting_hints": [
        {"aspect": "era", "value": "近代", "quote": "第二天"},
        {"aspect": "place", "value": "莊園與城市", "quote": "從城裡回來"},
    ],
    "signals": [],
}

VECTORS = {"灰燼": [1.0, 0.0, 0.0], "灰塵": [0.95, 0.1, 0.0], "霧氣": [0.0, 1.0, 0.0]}


def fake_embedder(terms: list[str]) -> list[list[float]]:
    return [VECTORS[t] for t in terms]


def make_book() -> Document:
    ids = ["p1", "p2", "p3"], ["p4", "p5"]
    chapters = [
        Chapter(
            number=number,
            paragraphs=[
                Paragraph(id=pid, text=PARAGRAPHS[pid], chapter_number=number, position=i)
                for i, pid in enumerate(pids)
            ],
        )
        for number, pids in enumerate(ids, start=1)
    ]
    return Document(
        id=BOOK_ID,
        title="合成書",
        file_path="/books/synthetic.txt",
        file_type=FileType.TXT,
        language="zh",
        chapters=chapters,
    )


@pytest.fixture
async def sf(tmp_path) -> AsyncIterator[async_sessionmaker]:
    engine = create_engine(tmp_path / "neo.db")
    await init_db(engine)
    factory = make_session_factory(engine)
    async with factory() as session, session.begin():
        await save_book(session, make_book())
    yield factory
    await engine.dispose()


async def store_outputs(sf, outputs: dict[tuple[str, str], object], status: str = "done") -> None:
    """Write S1 outputs for ``(stage, unit_id)`` the way the unit runner leaves them."""
    units = build_units(make_book())
    async with sf() as session, session.begin():
        for stage in ("s1a", "s1b"):
            await seed_units(session, stage, units)
        await session.flush()
        for stage, unit_id in outputs:
            row = await session.get(IngestUnitRow, (BOOK_ID, stage, unit_id))
            row.status = status
            session.add(
                IngestUnitOutputRow(
                    book_id=BOOK_ID,
                    stage=stage,
                    unit_id=unit_id,
                    raw_json=outputs[(stage, unit_id)],
                    model="fake:model",
                    prompt_version="1",
                )
            )


@pytest.fixture
async def stored(sf):
    await store_outputs(
        sf,
        {("s1a", U1): S1A_U1, ("s1b", U1): S1B_U1, ("s1a", U2): S1A_U2, ("s1b", U2): S1B_U2},
    )
    return sf


async def evidence_of(sf, claim_type: str, status: str = "current") -> list[Evidence]:
    async with sf() as session:
        rows = await session.scalars(
            select(Evidence)
            .where(Evidence.claim_type == claim_type, Evidence.status == status)
            .order_by(Evidence.created_at, Evidence.id)
        )
        return list(rows)


async def content_of(sf, claim_type: str, evidence_id: str) -> dict:
    async with sf() as session:
        return await get_content(session, claim_type, evidence_id)


async def characters(sf) -> dict[str, tuple[Evidence, dict]]:
    return {
        (content := await content_of(sf, "character", e.id))["canonical_name"]: (e, content)
        for e in await evidence_of(sf, "character")
    }


class TestRunS2:
    async def test_report_numbers(self, stored):
        report = await run_s2(stored, BOOK_ID, embedder=fake_embedder)

        assert isinstance(report, S2Report)
        assert report.units_used == 2
        assert report.written == {
            "character": 4,
            "event": 4,
            "relation_state": 1,
            "utterance": 2,
            "focalization": 2,
            "imagery_motif": 2,
            "book_setting": 2,
        }
        # S1 項目的引文：events 5、relations 3（缺端那筆沒走到引文）、utterances 3、focalization 2、
        # imagery 5、setting hints 3 ＝ 21；對不上的是「原文沒有這句」三筆與「路人」那筆關係的引文也算。
        assert report.quotes_total == report.quotes_verified + report.dropped["quote_not_found"]
        assert report.dropped["quote_not_found"] == 2
        assert report.quotes_loose == 1
        assert 0.8 < report.verification_rate < 1
        assert report.dropped["malformed_item"] == 4  # 非物件角色、無名角色、無標題事件、缺端關係
        assert report.dropped["name_unresolved"] == 2  # 關係的「路人」、話語的「路人」
        assert report.dropped["character_untagged"] == 2  # 周先生、路人乙
        assert report.field_drops["name_field_unresolved"] == 1  # 事件參與者「不存在的人」
        assert report.field_drops["field_invalid"] == 2  # visibility=loud、polarity=mixed
        assert report.raw_characters == 8 and report.merged_characters == 4
        assert report.warnings

    async def test_everything_is_level_1_extraction_in_one_done_run(self, stored):
        report = await run_s2(stored, BOOK_ID, embedder=fake_embedder)

        async with stored() as session:
            rows = list(await session.scalars(select(Evidence)))
            run = await session.get(Run, report.run_id)
        assert len(rows) == 4 + 4 + 1 + 2 + 2 + 2 + 2
        assert {(e.level, e.source, e.produced_via, e.run_id) for e in rows} == {
            (1, "extraction", "pipeline", report.run_id)
        }
        assert (run.ref_id, run.status, run.book_id) == ("ingest.s2", "done", BOOK_ID)
        assert run.summary_json["written"]["event"] == 4

    async def test_characters_merged_without_merging_family(self, stored):
        await run_s2(stored, BOOK_ID, embedder=fake_embedder)

        chars = await characters(stored)
        assert set(chars) == {"林默", "老周", "周小明", "周大明"}
        hero = chars["林默"][1]
        assert (hero["kind"], hero["mention_count"], hero["first_chapter"], hero["last_chapter"]) == (
            "person", 2, 1, 2,
        )  # fmt: skip
        assert hero["aliases"] == ["偵探"]
        assert sorted(chars["老周"][1]["aliases"]) == sorted(["先生", "周先生", "老周先生", "管家"])
        assert chars["周小明"][1]["last_chapter"] == 1
        assert chars["周大明"][1]["first_chapter"] == 2

    async def test_character_quote_is_first_mention(self, stored):
        await run_s2(stored, BOOK_ID, embedder=fake_embedder)

        chars = await characters(stored)
        async with stored() as session:
            quote = await session.scalar(
                select(EvidenceQuote).where(EvidenceQuote.evidence_id == chars["林默"][0].id)
            )
            texts = await BookParagraphSource(session).get_texts(["p1"])
        # 「偵探」被併進林默，所以首次提及是 p1 開頭的「偵探」，不是後面的「林默」。
        assert (quote.paragraph_id, quote.start, quote.end, quote.text) == ("p1", 0, 2, "偵探")
        assert quote.verified and texts["p1"][quote.start : quote.end] == "偵探"
        assert chars["林默"][0].discourse_paragraph_id == "p1"

    async def test_paragraph_entities_index(self, stored):
        report = await run_s2(stored, BOOK_ID, embedder=fake_embedder)

        chars = await characters(stored)
        async with stored() as session:
            rows = list(await session.scalars(select(ParagraphEntityRow)))
            texts = {r.id: r.text for r in await session.scalars(select(ParagraphRow))}
        assert report.tagged_mentions == len(rows) > 0
        assert all(texts[r.paragraph_id][r.start : r.end] == r.surface for r in rows)
        ids = {e.id for e, _ in chars.values()}
        assert {r.character_id for r in rows} == ids
        by_name = {name: e.id for name, (e, _) in chars.items()}
        old_zhou_in_p1 = [
            (r.start, r.end)
            for r in rows
            if r.paragraph_id == "p1" and r.character_id == by_name["老周"]
        ]
        second = PARAGRAPHS["p1"].rindex("老周")
        assert old_zhou_in_p1 == [(14, 16), (second, second + 2)]

    async def test_event_fields_subjects_quotes_and_text_rank(self, stored):
        await run_s2(stored, BOOK_ID, embedder=fake_embedder)

        events = await evidence_of(stored, "event")
        contents = [await content_of(stored, "event", e.id) for e in events]
        assert [c["title"] for c in contents] == ["房門反鎖", "少年否認", "周大明歸來", "盤問"]
        assert [c["text_rank"] for c in contents] == [1, 2, 3, 4]
        assert [c["chapter"] for c in contents] == [1, 1, 2, 2]
        assert contents[0]["tension_signal"] == "potential"
        assert contents[0]["visibility"] == "public"  # 「loud」不合法，用預設

        chars = await characters(stored)
        async with stored() as session:
            subjects = list(
                await session.scalars(
                    select(EvidenceSubject).where(EvidenceSubject.evidence_id == events[0].id)
                )
            )
            quotes = list(
                await session.scalars(
                    select(EvidenceQuote).where(EvidenceQuote.evidence_id == events[1].id)
                )
            )
        assert {(s.subject_id, s.role) for s in subjects} == {
            (chars["老周"][0].id, "participant"),
            (chars["林默"][0].id, "participant"),
        }
        # 「我沒有碰過那扇門！」靠忽略標點對上；存的是原文裡對到的那一段（不含標點）。
        (quote,) = quotes
        assert (quote.paragraph_id, quote.text, quote.verified) == (
            "p2",
            "我沒有碰過那扇門",
            True,
        )
        assert quote.end - quote.start == 8
        assert events[1].discourse_chapter == 1 and events[1].discourse_paragraph_id == "p2"

    async def test_relation_utterance_focalization(self, stored):
        await run_s2(stored, BOOK_ID, embedder=fake_embedder)
        chars = await characters(stored)
        ids = {name: e.id for name, (e, _) in chars.items()}

        (relation,) = await evidence_of(stored, "relation_state")
        rel = await content_of(stored, "relation_state", relation.id)
        assert (rel["source_id"], rel["target_id"]) == (ids["老周"], ids["周小明"])
        assert (rel["polarity"], rel["weight"], rel["is_bidirectional"]) == ("neutral", 0.9, True)

        utterances = [
            await content_of(stored, "utterance", e.id)
            for e in await evidence_of(stored, "utterance")
        ]
        assert sorted(u["speaker_id"] for u in utterances) == sorted([ids["老周"], ids["周大明"]])
        assert next(u for u in utterances if u["speaker_id"] == ids["老周"]) == {
            "raw_label": None,
            "speaker_id": ids["老周"],
            "kind": "dialogue",
            "text": "房門從裡面反鎖了",
            "addressee_ids": [ids["林默"]],
        }

        focal = {
            e.discourse_chapter: await content_of(stored, "focalization", e.id)
            for e in await evidence_of(stored, "focalization")
        }
        assert focal[1]["focalizer_id"] == ids["林默"] and focal[1]["paragraph_ids"] == [
            "p1",
            "p2",
            "p3",
        ]
        assert focal[2]["focalizer_id"] is None and focal[2]["focalization_type"] == "zero"

    async def test_imagery_clusters_and_settings_merge(self, stored):
        await run_s2(stored, BOOK_ID, embedder=fake_embedder)

        motifs = {
            (c := await content_of(stored, "imagery_motif", e.id))["term"]: (e, c)
            for e in await evidence_of(stored, "imagery_motif")
        }
        assert set(motifs) == {"灰燼", "霧氣"}
        _, ash = motifs["灰燼"]
        assert (ash["aliases"], ash["frequency"], ash["chapter_distribution"]) == (
            ["灰塵"], 3, {"1": 2, "2": 1},
        )  # fmt: skip
        assert motifs["霧氣"][1]["imagery_type"] == "nature"
        async with stored() as session:
            quote_count = await session.scalar(
                select(func.count())
                .select_from(EvidenceQuote)
                .where(EvidenceQuote.evidence_id == motifs["灰燼"][0].id)
            )
        assert quote_count == 3

        settings = {
            (c := await content_of(stored, "book_setting", e.id))["aspect"]: (e, c)
            for e in await evidence_of(stored, "book_setting")
        }
        assert set(settings) == {"era", "place"}
        assert settings["era"][1]["value"] == "近代"
        async with stored() as session:
            era_quotes = list(
                await session.scalars(
                    select(EvidenceQuote).where(EvidenceQuote.evidence_id == settings["era"][0].id)
                )
            )
        assert [q.text for q in era_quotes] == ["莊園", "第二天"]

    async def test_every_stored_quote_is_verified_with_offsets(self, stored):
        await run_s2(stored, BOOK_ID, embedder=fake_embedder)

        async with stored() as session:
            quotes = list(await session.scalars(select(EvidenceQuote)))
            texts = {r.id: r.text for r in await session.scalars(select(ParagraphRow))}
        assert quotes
        for quote in quotes:
            assert quote.verified and quote.start is not None
            assert texts[quote.paragraph_id][quote.start : quote.end] == quote.text

    async def test_second_run_supersedes_the_first_without_duplicates(self, stored):
        first = await run_s2(stored, BOOK_ID, embedder=fake_embedder)
        old_ids = {e.id for e in await evidence_of(stored, "character")}

        second = await run_s2(stored, BOOK_ID, embedder=fake_embedder)

        assert second.run_id != first.run_id
        assert second.written == first.written
        async with stored() as session:
            total = await session.scalar(select(func.count()).select_from(Evidence))
            current = await session.scalar(
                select(func.count()).select_from(Evidence).where(Evidence.status == "current")
            )
            superseded_runs = {
                e.run_id
                for e in await session.scalars(
                    select(Evidence).where(Evidence.status == "superseded")
                )
            }
            mentions = list(await session.scalars(select(ParagraphEntityRow)))
        assert total == 2 * current and superseded_runs == {first.run_id}
        new_ids = {e.id for e in await evidence_of(stored, "character")}
        assert new_ids.isdisjoint(old_ids)
        # 索引表只剩新的一批，沒有重複
        assert {m.character_id for m in mentions} == new_ids
        assert len(mentions) == second.tagged_mentions

    async def test_only_done_units_are_read(self, sf):
        await store_outputs(sf, {("s1a", U1): S1A_U1, ("s1b", U1): S1B_U1}, status="failed")

        report = await run_s2(sf, BOOK_ID, embedder=fake_embedder)

        assert report.units_used == 0 and report.written == {}
        assert report.verification_rate == 1.0

    async def test_garbage_outputs_produce_nothing_instead_of_failing(self, sf):
        await store_outputs(
            sf,
            {
                ("s1a", U1): "not an object",
                ("s1b", U1): {"imagery": "x", "focalization": [1], "book_setting_hints": [None]},
                ("s1a", U2): {"characters": [3, None], "events": {"a": 1}},
                ("s1b", U2): None,
            },
        )

        report = await run_s2(sf, BOOK_ID, embedder=fake_embedder)

        assert report.written == {}
        assert report.warnings
        async with sf() as session:
            run = await session.scalar(select(Run))
        assert run.status == "done"

    async def test_one_unit_with_one_stage_still_counts(self, sf):
        await store_outputs(sf, {("s1b", U2): S1B_U2})

        report = await run_s2(sf, BOOK_ID, embedder=fake_embedder)

        assert report.units_used == 1
        assert report.written == {"focalization": 1, "imagery_motif": 1, "book_setting": 2}

    async def test_unknown_book_raises(self, sf):
        with pytest.raises(LookupError):
            await run_s2(sf, "nope", embedder=fake_embedder)

    async def test_real_s1_sample_shapes_are_accepted(self, sf):
        """tests/fixtures/llm 裡真實的 S1 輸出（解析後）能直接當輸入。"""

        def sample(task: str):
            text = json.loads((FIXTURES / task / "sample.json").read_text(encoding="utf-8"))
            return extract_json_from_text(text["response_text"])[0]

        await store_outputs(
            sf, {("s1a", U1): sample("core_extraction"), ("s1b", U1): sample("signal_tagging")}
        )

        report = await run_s2(sf, BOOK_ID, embedder=lambda terms: [[1.0, 0.0]] * len(terms))

        # 範例的人物與引文來自另一段文字，合成書裡找不到 → 全部丟掉但不失敗
        assert report.units_used == 1
        assert report.raw_characters > 0
        assert report.quotes_total > 0


class TestIngestGraphIntegration:
    BOOK_TEXT = BOOK_TEXT

    class S1Call:
        """產出 S1 形狀的輸出：每單位一個「偵探」與一個事件。"""

        def __init__(self, stage: str) -> None:
            self.stage = stage

        async def __call__(self, unit):
            first = unit.paragraphs[0].text[:8]
            if self.stage == "s1a":
                return {
                    "characters": [{"name": "偵探", "kind": "person", "aliases": []}],
                    "events": [
                        {
                            "title": f"第{unit.chapter}章事件",
                            "event_type": "plot",
                            "description": "d",
                            "participants": ["偵探"],
                            "quote": first,
                        }
                    ],
                    "relation_states": [],
                    "utterances": [],
                }
            return {"focalization": None, "imagery": [], "book_setting_hints": [], "signals": []}

    async def run_job(self, tmp_path, stages):
        from storysphere.ingest.unit_runner import UnitStage

        engine = create_engine(tmp_path / "neo.db")
        await init_db(engine)
        factory = make_session_factory(engine)
        path = tmp_path / "book.txt"
        path.write_text(self.BOOK_TEXT, encoding="utf-8")
        try:
            async with open_checkpointer(tmp_path / "ckpt.db") as saver:
                service = IngestService(
                    factory,
                    saver,
                    stages=[
                        UnitStage(name=n, call=c, model="m", prompt_version="1") for n, c in stages
                    ],
                    retry_delay=0,
                    embedder=fake_embedder,
                )
                job_id = await service.create_job(path)
                await service.run_to_review(job_id)
                async with factory() as session:
                    job = await session.get(Job, job_id)
                await service.submit_review(job.book_id, {})
            async with factory() as session:
                job = await session.get(Job, job_id)
                runs = list(await session.scalars(select(Run)))
                evidence = list(await session.scalars(select(Evidence)))
            return job, runs, evidence
        finally:
            await engine.dispose()

    async def test_s2_runs_after_s1_and_reports_in_the_job(self, tmp_path):
        job, runs, evidence = await self.run_job(
            tmp_path, [("s1a", self.S1Call("s1a")), ("s1b", self.S1Call("s1b"))]
        )

        assert (job.status, job.stage) == ("done", "s2")
        assert [r.ref_id for r in runs] == ["ingest.s2"] and runs[0].job_id == job.id
        assert job.result_json["s2"]["written"] == {"character": 1, "event": 7}
        assert job.result_json["chapterCount"] == 7
        assert {e.claim_type for e in evidence} == {"character", "event"}

    async def test_no_s1_output_skips_s2(self, tmp_path):
        job, runs, evidence = await self.run_job(tmp_path, [])

        assert job.status == "done" and job.stage != "s2"
        assert runs == [] and evidence == []
        assert "s2" not in job.result_json
