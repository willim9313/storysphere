"""Characterization tests for ``KnowledgeGraphPipeline.run()``.

``run()`` had no coverage at all — the existing ``test_knowledge_graph.py``
only exercises ``EntityLinker`` and the JSON parsing helpers. These tests pin
the orchestration behaviour so that later refactors of the hot paths inside
``run()`` (mention counting, chapter-entity filtering, relation merging,
executor offloading) are provably behaviour-preserving.

They assert what the code does *today*, not what it ideally would do.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest
from storysphere.domain.documents import (
    Chapter,
    ChapterRole,
    Document,
    FileType,
    Paragraph,
    ParagraphRole,
)
from storysphere.domain.entities import Entity, EntityType
from storysphere.domain.events import Event, EventType
from storysphere.domain.relations import Relation, RelationType
from storysphere.pipelines.knowledge_graph.pipeline import (
    KGExtractionResult,
    KnowledgeGraphPipeline,
)

# ── fixtures / builders ──────────────────────────────────────────────────────


def _para(text: str, chapter: int, position: int, role: ParagraphRole = ParagraphRole.body):
    return Paragraph(text=text, chapter_number=chapter, position=position, role=role)


def _chapter(number: int, texts: list[str], role: ChapterRole = ChapterRole.body) -> Chapter:
    return Chapter(
        number=number,
        title=f"Chapter {number}",
        role=role,
        paragraphs=[_para(t, number, i) for i, t in enumerate(texts)],
    )


def _doc(chapters: list[Chapter], language: str = "en") -> Document:
    return Document(
        id="doc-kg",
        title="KG Test Book",
        file_path="/tmp/kg.pdf",
        file_type=FileType.TXT,
        chapters=chapters,
        language=language,
    )


def _entity(name: str, chapter: int | None = 1, **kw) -> Entity:
    return Entity(
        name=name,
        entity_type=kw.pop("entity_type", EntityType.CHARACTER),
        first_appearance_chapter=chapter,
        **kw,
    )


def _make_pipeline(
    *,
    entities_by_call: list[list[Entity]] | None = None,
    linked: list[Entity] | None = None,
    relations_events: list[tuple[list[Relation], list[Event]]] | None = None,
    kg_service=None,
    concurrency: int | None = 1,
) -> KnowledgeGraphPipeline:
    """Build a pipeline with every collaborator mocked.

    ``entities_by_call`` yields one list per *paragraph* extraction call;
    ``relations_events`` yields one (relations, events) pair per *chapter*.

    ``concurrency`` defaults to 1 so ``entities_by_call``'s pop-in-call-order
    stays meaningful; the concurrency tests below set it explicitly.
    """
    entity_extractor = AsyncMock()
    calls = list(entities_by_call or [])

    def _extract(text, chapter_number, language="en"):
        return calls.pop(0) if calls else []

    entity_extractor.extract.side_effect = _extract

    relation_extractor = AsyncMock()
    rel_calls = list(relations_events or [])

    def _extract_rel(text, entities, chapter_number, language="en"):
        return rel_calls.pop(0) if rel_calls else ([], [])

    relation_extractor.extract.side_effect = _extract_rel

    entity_linker = MagicMock()
    entity_linker.link.side_effect = lambda raw: (
        linked if linked is not None else raw
    )

    pipeline = KnowledgeGraphPipeline(
        entity_extractor=entity_extractor,
        relation_extractor=relation_extractor,
        entity_linker=entity_linker,
        kg_service=kg_service,
        concurrency=concurrency,
    )
    pipeline._paragraph_entity_linker = MagicMock()
    return pipeline


# ── tests ────────────────────────────────────────────────────────────────────


class TestChapterSelection:
    @pytest.mark.asyncio
    async def test_only_body_chapters_are_extracted(self):
        """Non-body chapters are skipped for both entity and relation passes."""
        doc = _doc(
            [
                _chapter(1, ["Alice went home."], role=ChapterRole.preface),
                _chapter(2, ["Bob went home."], role=ChapterRole.body),
                _chapter(3, ["Carol went home."], role=ChapterRole.afterword),
            ]
        )
        pipeline = _make_pipeline(entities_by_call=[[_entity("Bob", 2)]])

        await pipeline.run(doc)

        extracted_texts = [
            c.args[0] for c in pipeline._entity_extractor.extract.call_args_list
        ]
        assert extracted_texts == ["Bob went home."]

        rel_chapters = [
            c.args[2] for c in pipeline._relation_extractor.extract.call_args_list
        ]
        assert rel_chapters == [2]

    @pytest.mark.asyncio
    async def test_non_body_paragraphs_are_excluded(self):
        """Separator paragraphs carry no narrative text and are skipped."""
        chapter = Chapter(
            number=1,
            role=ChapterRole.body,
            paragraphs=[
                _para("Alice spoke.", 1, 0),
                _para("***", 1, 1, role=ParagraphRole.separator),
                _para("Bob replied.", 1, 2),
            ],
        )
        pipeline = _make_pipeline(entities_by_call=[[], []])

        await pipeline.run(_doc([chapter]))

        extracted = [c.args[0] for c in pipeline._entity_extractor.extract.call_args_list]
        assert extracted == ["Alice spoke.", "Bob replied."]

    @pytest.mark.asyncio
    async def test_whitespace_only_chapter_is_skipped(self):
        """A body chapter whose paragraphs are all blank produces no calls."""
        chapter = Chapter(
            number=1,
            role=ChapterRole.body,
            paragraphs=[_para("   ", 1, 0)],
        )
        pipeline = _make_pipeline()

        result = await pipeline.run(_doc([chapter]))

        assert pipeline._entity_extractor.extract.call_count == 0
        assert result.entities == []


class TestMentionCount:
    @pytest.mark.asyncio
    async def test_mention_count_is_case_insensitive_over_whole_chapter(self):
        """Counting spans the full chapter text, not just the source paragraph."""
        doc = _doc([_chapter(1, ["Alice met Bob.", "ALICE left alice behind."])])
        pipeline = _make_pipeline(
            entities_by_call=[[_entity("Alice", 1)], []],
        )

        result = await pipeline.run(doc)

        alice = next(e for e in result.entities if e.name == "Alice")
        # "Alice", "ALICE", "alice" across the joined chapter text
        assert alice.mention_count == 3

    @pytest.mark.asyncio
    async def test_name_split_by_a_pdf_space_is_still_counted(self):
        """B-083 — ``pypdf`` breaks words across lines into ``礁 石``.

        Two thirds of the paragraphs in this repo's PDF-sourced books carry at
        least one such split. Counting on the raw text undercounts silently, and
        ``mention_count`` is not just a display number: ``EntityLinker`` picks
        the canonical name with ``max(group, key=mention_count)``.
        """
        doc = _doc([_chapter(1, ["伊內絲走下了礁 石。", "礁石很滑，伊內 絲扶著它。"])])
        pipeline = _make_pipeline(
            entities_by_call=[[_entity("礁石")], []],
        )

        result = await pipeline.run(doc)

        assert result.entities[0].mention_count == 2

    @pytest.mark.asyncio
    async def test_letter_spaced_display_type_is_counted(self):
        """Colophons come back with a space between every character:
        ``霧  港  文  化 　 F O G  H A R B O R  P R E S S``. Latin is affected
        too, which is why all whitespace goes rather than only CJK gaps."""
        doc = _doc([_chapter(1, ["F O G  H A R B O R  P R E S S"])])
        pipeline = _make_pipeline(entities_by_call=[[_entity("Fog Harbor Press")]])

        result = await pipeline.run(doc)

        assert result.entities[0].mention_count == 1

    @pytest.mark.asyncio
    async def test_mention_count_zero_when_name_absent(self):
        doc = _doc([_chapter(1, ["Nothing here."])])
        pipeline = _make_pipeline(entities_by_call=[[_entity("Ghost", 1)]])

        result = await pipeline.run(doc)

        assert result.entities[0].mention_count == 0


class TestChapterEntityFiltering:
    @pytest.mark.asyncio
    async def test_relation_pass_receives_entities_first_seen_up_to_chapter(self):
        """Entities from later chapters are withheld from earlier chapters."""
        doc = _doc([_chapter(1, ["Alice."]), _chapter(2, ["Bob."])])
        early = _entity("Alice", 1)
        late = _entity("Bob", 2)
        pipeline = _make_pipeline(
            entities_by_call=[[early], [late]],
            linked=[early, late],
        )

        await pipeline.run(doc)

        ch1_entities = pipeline._relation_extractor.extract.call_args_list[0].args[1]
        ch2_entities = pipeline._relation_extractor.extract.call_args_list[1].args[1]
        assert [e.name for e in ch1_entities] == ["Alice"]
        assert [e.name for e in ch2_entities] == ["Alice", "Bob"]

    @pytest.mark.asyncio
    async def test_entities_without_first_appearance_are_excluded(self):
        """first_appearance_chapter=None never passes the filter."""
        doc = _doc([_chapter(1, ["Alice."])])
        floating = _entity("Floating", None)
        pipeline = _make_pipeline(
            entities_by_call=[[floating]],
            linked=[floating],
        )

        await pipeline.run(doc)

        passed = pipeline._relation_extractor.extract.call_args_list[0].args[1]
        assert passed == []


class TestRelationPhaseMerging:
    """``_fill_relation_valid_to`` merges consecutive same-type phases."""

    @pytest.mark.asyncio
    async def test_type_change_sets_valid_to_on_earlier_phase(self):
        doc = _doc([_chapter(1, ["a."]), _chapter(2, ["b."])])
        r1 = Relation(
            source_id="A", target_id="B",
            relation_type=RelationType.FRIENDSHIP, valid_from_chapter=1,
        )
        r2 = Relation(
            source_id="A", target_id="B",
            relation_type=RelationType.ENEMY, valid_from_chapter=2,
        )
        pipeline = _make_pipeline(
            entities_by_call=[[], []],
            relations_events=[([r1], []), ([r2], [])],
        )

        result = await pipeline.run(doc)

        assert len(result.relations) == 2
        assert r1.valid_to_chapter == 2
        assert r2.valid_to_chapter is None

    @pytest.mark.asyncio
    async def test_consecutive_same_type_phases_are_deduplicated(self):
        doc = _doc([_chapter(1, ["a."]), _chapter(2, ["b."])])
        r1 = Relation(
            source_id="A", target_id="B",
            relation_type=RelationType.ALLY, valid_from_chapter=1,
        )
        r2 = Relation(
            source_id="A", target_id="B",
            relation_type=RelationType.ALLY, valid_from_chapter=2,
        )
        pipeline = _make_pipeline(
            entities_by_call=[[], []],
            relations_events=[([r1], []), ([r2], [])],
        )

        result = await pipeline.run(doc)

        assert len(result.relations) == 1
        assert result.relations[0] is r1

    @pytest.mark.asyncio
    async def test_distinct_pairs_do_not_interact(self):
        doc = _doc([_chapter(1, ["a."])])
        ab = Relation(
            source_id="A", target_id="B",
            relation_type=RelationType.ALLY, valid_from_chapter=1,
        )
        cd = Relation(
            source_id="C", target_id="D",
            relation_type=RelationType.ALLY, valid_from_chapter=1,
        )
        pipeline = _make_pipeline(
            entities_by_call=[[]],
            relations_events=[([ab, cd], [])],
        )

        result = await pipeline.run(doc)

        assert len(result.relations) == 2
        assert all(r.valid_to_chapter is None for r in result.relations)


class TestEntityValidTo:
    """``_fill_entity_valid_to`` marks entities absent after a DEATH event."""

    @pytest.mark.asyncio
    async def test_death_event_sets_valid_to_next_chapter(self):
        doc = _doc([_chapter(1, ["a."])])
        victim = _entity("Victim", 1)
        death = Event(
            title="The end", event_type=EventType.DEATH,
            description="dies", chapter=3, participants=[victim.id],
        )
        pipeline = _make_pipeline(
            entities_by_call=[[victim]],
            linked=[victim],
            relations_events=[([], [death])],
        )

        result = await pipeline.run(doc)

        assert result.entities[0].valid_to_chapter == 4

    @pytest.mark.asyncio
    async def test_latest_death_wins(self):
        doc = _doc([_chapter(1, ["a."])])
        victim = _entity("Victim", 1)
        early = Event(
            title="d1", event_type=EventType.DEATH,
            description="", chapter=2, participants=[victim.id],
        )
        late = Event(
            title="d2", event_type=EventType.DEATH,
            description="", chapter=5, participants=[victim.id],
        )
        pipeline = _make_pipeline(
            entities_by_call=[[victim]],
            linked=[victim],
            relations_events=[([], [early, late])],
        )

        result = await pipeline.run(doc)

        assert result.entities[0].valid_to_chapter == 6

    @pytest.mark.asyncio
    async def test_non_death_event_leaves_entity_untouched(self):
        doc = _doc([_chapter(1, ["a."])])
        survivor = _entity("Survivor", 1)
        meeting = Event(
            title="m", event_type=EventType.MEETING,
            description="", chapter=2, participants=[survivor.id],
        )
        pipeline = _make_pipeline(
            entities_by_call=[[survivor]],
            linked=[survivor],
            relations_events=[([], [meeting])],
        )

        result = await pipeline.run(doc)

        assert result.entities[0].valid_to_chapter is None


class TestPersistence:
    @pytest.mark.asyncio
    async def test_document_id_stamped_and_written_to_kg_service(self):
        doc = _doc([_chapter(1, ["Alice."])])
        alice = _entity("Alice", 1)
        rel = Relation(
            source_id="A", target_id="B",
            relation_type=RelationType.ALLY, valid_from_chapter=1,
        )
        evt = Event(
            title="e", event_type=EventType.PLOT,
            description="", chapter=1, participants=[],
        )
        kg = AsyncMock()
        pipeline = _make_pipeline(
            entities_by_call=[[alice]],
            linked=[alice],
            relations_events=[([rel], [evt])],
            kg_service=kg,
        )

        await pipeline.run(doc)

        assert kg.add_entity.await_count == 1
        assert kg.add_relation.await_count == 1
        assert kg.add_event.await_count == 1
        assert alice.document_id == "doc-kg"
        assert rel.document_id == "doc-kg"
        assert evt.document_id == "doc-kg"

    @pytest.mark.asyncio
    async def test_no_kg_service_means_no_persistence(self):
        doc = _doc([_chapter(1, ["Alice."])])
        pipeline = _make_pipeline(
            entities_by_call=[[_entity("Alice", 1)]], kg_service=None
        )

        result = await pipeline.run(doc)

        assert len(result.entities) == 1


class TestRerunIdempotency:
    """B-082 — a second run must replace the first, not stack on top of it.

    Every ``add_*`` keys on the object's own id and that id is a fresh
    ``uuid4`` per extraction, so nothing downstream can tell a re-run's output
    apart from the previous run's. The only thing standing between a re-run and
    a doubled graph is the clear at the top of ``_persist_to_kg``.
    """

    @pytest.mark.asyncio
    async def test_clear_happens_before_any_write(self):
        doc = _doc([_chapter(1, ["Alice."])])
        kg = AsyncMock()
        pipeline = _make_pipeline(
            entities_by_call=[[_entity("Alice", 1)]],
            relations_events=[([], [])],
            kg_service=kg,
        )

        await pipeline.run(doc)

        names = [c[0] for c in kg.mock_calls]
        assert "remove_by_document" in names
        # Ordering is the whole point: clearing after the writes would delete
        # what we just wrote.
        assert names.index("remove_by_document") < names.index("add_entity")
        kg.remove_by_document.assert_awaited_once_with("doc-kg")

    @pytest.mark.asyncio
    async def test_no_document_id_means_no_clear(self):
        """``_persist_to_kg`` is reachable with ``document_id=None``.

        Clearing on a falsy id would target every document at once, so the
        guard is load-bearing rather than defensive.
        """
        kg = AsyncMock()
        pipeline = _make_pipeline(kg_service=kg)

        await pipeline._persist_to_kg(
            KGExtractionResult(entities=[_entity("Alice", 1)]), document_id=None
        )

        kg.remove_by_document.assert_not_awaited()
        assert kg.add_entity.await_count == 1

    @pytest.mark.asyncio
    async def test_second_run_replaces_rather_than_appends(self, tmp_path):
        """The regression itself, against a real ``KGService``."""
        from storysphere.services.kg_service import KGService

        kg = KGService(persistence_path=str(tmp_path / "kg.json"))
        doc = _doc([_chapter(1, ["Alice."])])

        async def _run_once():
            # Fresh objects each run — same content, new uuid4 ids, exactly as a
            # real re-extraction produces.
            alice = _entity("Alice", 1)
            evt = Event(
                title="Alice arrives", event_type=EventType.PLOT,
                description="", chapter=1, participants=[],
            )
            await _make_pipeline(
                entities_by_call=[[alice]],
                linked=[alice],
                relations_events=[([], [evt])],
                kg_service=kg,
            ).run(doc)

        await _run_once()
        after_first = (kg.entity_count, kg.relation_count, kg.event_count)

        await _run_once()

        assert (kg.entity_count, kg.relation_count, kg.event_count) == after_first

    @pytest.mark.asyncio
    async def test_rerunning_one_book_leaves_another_alone(self, tmp_path):
        from storysphere.services.kg_service import KGService

        kg = KGService(persistence_path=str(tmp_path / "kg.json"))

        other = _entity("Bob", 1)
        other.document_id = "other-book"
        await kg.add_entity(other)
        await kg.add_event(
            Event(
                title="Bob leaves", event_type=EventType.PLOT, description="",
                chapter=1, participants=[], document_id="other-book",
            )
        )

        doc = _doc([_chapter(1, ["Alice."])])
        for _ in range(2):
            alice = _entity("Alice", 1)
            await _make_pipeline(
                entities_by_call=[[alice]], linked=[alice],
                relations_events=[([], [])], kg_service=kg,
            ).run(doc)

        survivors = [e for e in kg._entities.values() if e.document_id == "other-book"]
        assert len(survivors) == 1
        assert len(await kg.get_events(document_id="other-book")) == 1
        assert len([e for e in kg._entities.values() if e.document_id == "doc-kg"]) == 1


class TestCallbacks:
    @pytest.mark.asyncio
    async def test_sub_cb_reports_both_passes(self):
        """Progress is reported for the entity pass and the relation pass."""
        doc = _doc([_chapter(1, ["a."]), _chapter(2, ["b."])])
        pipeline = _make_pipeline(entities_by_call=[[], []])
        seen: list[tuple[int, int, str]] = []

        await pipeline.run(doc, sub_cb=lambda cur, tot, label="": seen.append((cur, tot, label)))

        assert (0, 2, "實體抽取") in seen
        assert (2, 2, "實體抽取") in seen
        assert (0, 2, "關係抽取") in seen
        assert (2, 2, "關係抽取") in seen

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("entity_type", "expected"),
        [
            (EntityType.LOCATION, "location"),
            (EntityType.CHARACTER, "character"),
            (EntityType.ORGANIZATION, "org"),
            # No map entry → documented fallback, not a lookup failure.
            (EntityType.OTHER, "topic"),
        ],
    )
    async def test_murmur_type_is_mapped_from_entity_type(self, entity_type, expected):
        """``_ENTITY_TYPE_MAP`` translates the entity type for the murmur stream.

        Regression guard: the lookup must read ``EntityType.value``. Reading
        ``str(entity_type)`` yields ``"EntityType.LOCATION"`` (it is a
        ``(str, Enum)`` mixin, not a ``StrEnum``), which matches no key and
        silently collapses every type to the "topic" fallback.
        """
        doc = _doc([_chapter(1, ["Somewhere."])])
        subject = _entity("Somewhere", 1, entity_type=entity_type)
        pipeline = _make_pipeline(entities_by_call=[[subject]])
        events: list[tuple] = []

        async def _murmur(step_key, murmur_type, content, meta=None):
            events.append((step_key, murmur_type, content))

        await pipeline.run(doc, murmur_cb=_murmur)

        assert events == [("featureExtraction", expected, "Somewhere")]

    @pytest.mark.asyncio
    async def test_murmur_failure_does_not_break_the_run(self):
        doc = _doc([_chapter(1, ["Alice."])])
        pipeline = _make_pipeline(entities_by_call=[[_entity("Alice", 1)]])

        async def _boom(*a, **kw):
            raise RuntimeError("murmur down")

        result = await pipeline.run(doc, murmur_cb=_boom)

        assert len(result.entities) == 1


class TestParagraphEntityLinking:
    @pytest.mark.asyncio
    async def test_linker_called_with_document_and_unique_entities(self):
        doc = _doc([_chapter(1, ["Alice."])])
        alice = _entity("Alice", 1)
        pipeline = _make_pipeline(entities_by_call=[[alice]], linked=[alice])

        await pipeline.run(doc)

        pipeline._paragraph_entity_linker.link.assert_called_once_with(doc, [alice])


class TestEntityExtractionConcurrency:
    """The per-paragraph entity pass runs bounded-concurrently.

    Concurrency applies to the LLM calls only. Everything downstream —
    the murmur stream and the order entities reach EntityLinker — must stay
    in paragraph order, or the canonical-name choice and the user-visible
    stream both become non-deterministic.
    """

    def _chapter_of(self, n: int) -> Chapter:
        return _chapter(1, [f"Paragraph {i}." for i in range(n)])

    @pytest.mark.asyncio
    async def test_calls_are_bounded_by_the_configured_limit(self):
        in_flight = 0
        peak = 0

        async def _extract(text, chapter_number, language="en"):
            nonlocal in_flight, peak
            in_flight += 1
            peak = max(peak, in_flight)
            await asyncio.sleep(0.002)
            in_flight -= 1
            return []

        pipeline = _make_pipeline(concurrency=3)
        pipeline._entity_extractor.extract.side_effect = _extract

        await pipeline.run(_doc([self._chapter_of(12)]))

        assert peak == 3

    @pytest.mark.asyncio
    async def test_concurrency_one_is_sequential(self):
        in_flight = 0
        peak = 0

        async def _extract(text, chapter_number, language="en"):
            nonlocal in_flight, peak
            in_flight += 1
            peak = max(peak, in_flight)
            await asyncio.sleep(0.002)
            in_flight -= 1
            return []

        pipeline = _make_pipeline(concurrency=1)
        pipeline._entity_extractor.extract.side_effect = _extract

        await pipeline.run(_doc([self._chapter_of(6)]))

        assert peak == 1

    @pytest.mark.asyncio
    async def test_murmur_order_follows_paragraphs_not_completion(self):
        """Earlier paragraphs resolve last; the stream must not reorder."""

        async def _extract(text, chapter_number, language="en"):
            index = int(text.split()[1].rstrip("."))
            await asyncio.sleep((5 - index) / 500)  # paragraph 0 is slowest
            return [_entity(f"E{index}", 1)]

        pipeline = _make_pipeline(concurrency=5)
        pipeline._entity_extractor.extract.side_effect = _extract

        emitted: list[str] = []

        async def _murmur(step_key, murmur_type, content, meta=None):
            emitted.append(content)

        await pipeline.run(_doc([self._chapter_of(5)]), murmur_cb=_murmur)

        assert emitted == ["E0", "E1", "E2", "E3", "E4"]

    @pytest.mark.asyncio
    async def test_entity_order_reaching_the_linker_follows_paragraphs(self):
        async def _extract(text, chapter_number, language="en"):
            index = int(text.split()[1].rstrip("."))
            await asyncio.sleep((5 - index) / 500)
            return [_entity(f"E{index}", 1)]

        pipeline = _make_pipeline(concurrency=5)
        pipeline._entity_extractor.extract.side_effect = _extract

        await pipeline.run(_doc([self._chapter_of(5)]))

        linked_arg = pipeline._entity_linker.link.call_args.args[0]
        assert [e.name for e in linked_arg] == ["E0", "E1", "E2", "E3", "E4"]

    @pytest.mark.asyncio
    async def test_extraction_failure_still_aborts_the_step(self):
        """Unchanged from the sequential loop: nothing is swallowed."""

        class RateLimited(Exception):
            pass

        async def _extract(text, chapter_number, language="en"):
            if text.endswith("2."):
                raise RateLimited("429 quota exceeded")
            await asyncio.sleep(0.001)
            return []

        pipeline = _make_pipeline(concurrency=4)
        pipeline._entity_extractor.extract.side_effect = _extract

        with pytest.raises(RateLimited, match="429"):
            await pipeline.run(_doc([self._chapter_of(8)]))

    @pytest.mark.asyncio
    async def test_falls_back_to_settings_when_unset(self, monkeypatch):
        """concurrency=None means read settings at run time, not construction."""
        from types import SimpleNamespace

        import storysphere.config.settings as settings_mod

        monkeypatch.setattr(
            settings_mod,
            "get_settings",
            lambda: SimpleNamespace(ingestion_concurrency=1),
        )
        pipeline = _make_pipeline(concurrency=None)

        assert pipeline._resolve_concurrency() == 1
