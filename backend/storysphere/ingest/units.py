"""Split a book into extraction units (02 §2).

單位＝同一章內連續的正文段落，累積到上限就切；不跨章。每個單位附上前一單位的最後一段
當脈絡（`context_only`，只用來解代名詞，不從中抽取）。
"""

from __future__ import annotations

from dataclasses import dataclass, field

from storysphere.domain.documents import ChapterRole, Document, extract_body_text

CJK_UNIT_LIMIT = 3000
OTHER_UNIT_LIMIT = 8000

_CJK_LANGUAGES = ("zh", "ja", "ko")


@dataclass(frozen=True)
class UnitParagraph:
    id: str
    text: str


@dataclass(frozen=True)
class IngestUnit:
    # `{book_id}:{chapter}:{first_paragraph_position}`
    id: str
    book_id: str
    chapter: int
    language: str
    paragraphs: tuple[UnitParagraph, ...]
    # 前一單位的最後一段；全書第一個單位沒有。
    context_only: UnitParagraph | None = field(default=None)

    @property
    def paragraph_ids(self) -> list[str]:
        return [p.id for p in self.paragraphs]


def unit_limit(language: str) -> int:
    """Character budget of one unit for a book in ``language``."""
    is_cjk = language.lower().startswith(_CJK_LANGUAGES)
    return CJK_UNIT_LIMIT if is_cjk else OTHER_UNIT_LIMIT


def build_units(doc: Document, *, limit: int | None = None) -> list[IngestUnit]:
    """Extraction units of ``doc`` in reading order.

    一段本身就超過上限時自成一個單位，不切開段落。
    """
    budget = limit if limit is not None else unit_limit(doc.language)
    units: list[IngestUnit] = []
    previous_last: UnitParagraph | None = None

    def close(chapter: int, first_position: int, paragraphs: list[UnitParagraph]) -> None:
        nonlocal previous_last
        units.append(
            IngestUnit(
                id=f"{doc.id}:{chapter}:{first_position}",
                book_id=doc.id,
                chapter=chapter,
                language=doc.language,
                paragraphs=tuple(paragraphs),
                context_only=previous_last,
            )
        )
        previous_last = paragraphs[-1]

    for chapter in doc.chapters:
        if chapter.role != ChapterRole.body:
            continue
        current: list[UnitParagraph] = []
        size = 0
        first_position = 0
        for para in chapter.paragraphs:
            text = extract_body_text(para)
            if text is None:
                continue
            if current and size + len(text) > budget:
                close(chapter.number, first_position, current)
                current, size = [], 0
            if not current:
                first_position = para.position
            current.append(UnitParagraph(id=para.id, text=text))
            size += len(text)
        if current:
            close(chapter.number, first_position, current)

    return units
