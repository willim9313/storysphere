"""Characterization tests for ``KnowledgeGraphPipeline.run()``.

``run()`` had no coverage at all — the existing ``test_knowledge_graph.py``
only exercises ``EntityLinker`` and the JSON parsing helpers. These tests pin
the orchestration behaviour so that later refactors of the hot paths inside
``run()`` (mention counting, chapter-entity filtering, relation merging,
executor offloading) are provably behaviour-preserving.

They assert what the code does *today*, not what it ideally would do.
"""

from __future__ import annotations

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
from storysphere.pipelines.knowledge_graph.pipeline import KnowledgeGraphPipeline

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
) -> KnowledgeGraphPipeline:
    """Build a pipeline with every collaborator mocked.

    ``entities_by_call`` yields one list per *paragraph* extraction call;
    ``relations_events`` yields one (relations, events) pair per *chapter*.
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
