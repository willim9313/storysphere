"""Unit tests for the boundary role suggester ("邊界輔助辨識").

The LLM is stubbed with a fake chat model whose ``ainvoke`` returns a scripted
``{"role": ...}`` JSON per call, so the inward paragraph walk, the boundaries it
produces, and the aggregated block roles are tested without a network.
"""

import pytest
from storysphere.domain.documents import (
    Chapter,
    ChapterRole,
    Paragraph,
    ParagraphRole,
)
from storysphere.services.chapter_role_suggester import suggest_boundary_roles


def _chapter(
    number: int,
    paras: list[tuple[str, ParagraphRole]],
    role: ChapterRole = ChapterRole.body,
) -> Chapter:
    return Chapter(
        number=number,
        role=role,
        paragraphs=[
            Paragraph(text=t, chapter_number=number, position=i, role=r)
            for i, (t, r) in enumerate(paras)
        ],
    )


def _body(*texts: str) -> list[tuple[str, ParagraphRole]]:
    return [(t, ParagraphRole.body) for t in texts]


class _FakeResponse:
    def __init__(self, content: str) -> None:
        self.content = content


class _FakeLLM:
    """Returns a scripted role per call. Entries are a ChapterRole value
    ("body"/"toc"/"preface"/"afterword"/"other") or "__bad__" (unparseable)."""

    def __init__(self, roles: list[str]) -> None:
        self._roles = list(roles)
        self.calls = 0

    async def ainvoke(self, messages):
        self.calls += 1
        r = self._roles.pop(0) if self._roles else "body"
        if r == "__bad__":
            return _FakeResponse("not json")
        return _FakeResponse(f'{{"role": "{r}"}}')


class TestSuggestBoundaryRoles:
    @pytest.mark.asyncio
    async def test_empty_chapters(self):
        r = await suggest_boundary_roles([])
        assert r.front_matter_end is None and r.back_matter_start is None

    @pytest.mark.asyncio
    async def test_non_body_chapters_are_skipped(self):
        # A 目錄 chapter (role=toc) whose paragraphs are body-role must NOT be
        # walked — it is already isolated front matter.
        toc = _chapter(1, _body("copyright", "contents"), role=ChapterRole.toc)
        body = _chapter(2, _body("the story begins"))
        llm = _FakeLLM(["body"])  # only the one body paragraph is classified
        r = await suggest_boundary_roles([toc, body], llm=llm)
        assert r.front_matter_end is None
        assert r.back_matter_start is None
        assert llm.calls == 1

    @pytest.mark.asyncio
    async def test_front_matter_fused_into_first_body_chapter(self):
        ch = _chapter(1, _body("copyright page", "story A", "story B"))
        # front: g0 other, g1 body (stop); back: g2 body (stop)
        llm = _FakeLLM(["other", "body", "body"])
        r = await suggest_boundary_roles([ch], llm=llm)
        assert r.front_matter_end == 1
        assert r.front_role == "other"
        assert r.back_matter_start is None

    @pytest.mark.asyncio
    async def test_block_role_aggregates_to_most_specific(self):
        # Front block = [copyright(other), preface] → aggregates to "preface".
        ch = _chapter(1, _body("copyright", "preface note", "story"))
        llm = _FakeLLM(["other", "preface", "body"])
        r = await suggest_boundary_roles([ch], llm=llm)
        assert r.front_matter_end == 2
        assert r.front_role == "preface"

    @pytest.mark.asyncio
    async def test_back_matter_fused_into_last_body_chapter_tail(self):
        chapters = [
            _chapter(1, _body("story 1")),           # gidx 0
            _chapter(2, _body("story 2", "the afterword")),  # gidx 1, 2
        ]
        # front: g0 body → stop. back: g2 afterword, g1 body → stop.
        llm = _FakeLLM(["body", "afterword", "body"])
        r = await suggest_boundary_roles(chapters, llm=llm)
        assert r.back_matter_start == 2
        assert r.back_role == "afterword"
        assert r.front_matter_end is None

    @pytest.mark.asyncio
    async def test_both_edges(self):
        ch = _chapter(1, _body("copyright", "story A", "story B", "afterword"))
        llm = _FakeLLM(["other", "body", "afterword", "body"])
        r = await suggest_boundary_roles([ch], llm=llm)
        assert r.front_matter_end == 1
        assert r.front_role == "other"
        assert r.back_matter_start == 3
        assert r.back_role == "afterword"

    @pytest.mark.asyncio
    async def test_unparseable_response_stops_conservatively(self):
        ch = _chapter(1, _body("p0", "p1", "p2"))
        llm = _FakeLLM(["__bad__", "body"])  # front bad → stop; back body → stop
        r = await suggest_boundary_roles([ch], llm=llm)
        assert r.front_matter_end is None
        assert r.back_matter_start is None

    @pytest.mark.asyncio
    async def test_max_scan_caps_each_edge(self):
        ch = _chapter(1, _body(*[f"p{i}" for i in range(10)]))
        llm = _FakeLLM(["other"] * 10)  # everything looks like matter
        r = await suggest_boundary_roles([ch], max_scan=2, llm=llm)
        # front never finds a body within the cap → no front boundary; back caps
        # after 2 paragraphs at g9,g8 → back_matter_start = g8.
        assert r.front_matter_end is None
        assert r.back_matter_start == 8
        assert llm.calls == 4
