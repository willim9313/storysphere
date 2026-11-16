"""Chapter review: apply the reviewer's edits to a ``Document`` and build the review payload.

章節審閱（02「章節審閱」、04 N-02d／N-02e）的純函數部分，從舊 repo 的
`workflows/ingestion.py` 與 `api/routers/book_ingestion.py` 搬過來。這裡不碰資料庫；
讀寫由 `ingest/graph.py` 與 `ingest/service.py` 負責。

段落索引一律是「全書攤平後的順序」（global index），不是章內位置。
"""

from __future__ import annotations

import re
from typing import Any

from storysphere.domain.documents import (
    Chapter,
    ChapterRole,
    Document,
    Paragraph,
    ParagraphRole,
    assign_chapter_numbers,
)

# 句子切分只給審閱畫面挑切點用：英文句號後要有空白，中文句號後直接切。
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+|(?<=[。！？])")


def apply_paragraph_splits(doc: Document, splits: dict[str, list[int]]) -> None:
    """Split paragraphs of *doc* in place at reviewer-chosen char offsets.

    *splits* maps str(global_paragraph_index) — in the same flat order as
    ``rebuild_chapters``, *before* any split — to ascending char offsets within
    that paragraph's text. Must run before ``apply_role_overrides`` and
    ``rebuild_chapters``, whose indices refer to the post-split flat order.

    Invalid entries (bad index, out-of-range/unsorted offsets, or offsets that
    would produce a whitespace-only piece) are ignored rather than failing the
    resume: the reviewer's other edits still apply.
    """
    if not splits:
        return

    def _valid_offsets(text: str, offsets: list[int]) -> list[int] | None:
        if offsets != sorted(set(offsets)):
            return None
        if any(not isinstance(o, int) or o <= 0 or o >= len(text) for o in offsets):
            return None
        bounds = [0, *offsets, len(text)]
        pieces = [text[a:b] for a, b in zip(bounds, bounds[1:], strict=False)]
        if any(not p.strip() for p in pieces):
            return None
        return offsets

    global_idx = 0
    for chapter in doc.chapters:
        new_paras: list[Paragraph] = []
        for para in chapter.paragraphs:
            offsets = splits.get(str(global_idx))
            global_idx += 1
            if offsets is not None:
                offsets = _valid_offsets(para.text, offsets)
            if offsets is None:
                new_paras.append(para)
                continue
            bounds = [0, *offsets, len(para.text)]
            for start, end in zip(bounds, bounds[1:], strict=False):
                span = para.title_span
                if span is not None and (span[0] < start or span[1] > end):
                    span = None  # 標題沒有完整落在這一段裡
                elif span is not None:
                    span = (span[0] - start, span[1] - start)
                new_paras.append(
                    Paragraph(
                        text=para.text[start:end],
                        chapter_number=para.chapter_number,
                        position=0,  # 下面統一重排
                        role=para.role,
                        title_span=span,
                    )
                )
        for pos, para in enumerate(new_paras):
            para.position = pos
        chapter.paragraphs = new_paras


def apply_role_overrides(doc: Document, role_overrides: dict[str, str]) -> None:
    """Mutate paragraph roles in *doc* according to user overrides.

    *role_overrides* maps str(global_paragraph_index) → ParagraphRole value.
    The global index follows the same flat order as ``rebuild_chapters``.
    Unknown indices or role values are ignored.
    """
    if not role_overrides:
        return
    all_paras = [p for ch in doc.chapters for p in ch.paragraphs]
    for idx_str, role_str in role_overrides.items():
        try:
            idx = int(idx_str)
            role = ParagraphRole(role_str)
        except (ValueError, KeyError):
            continue
        if 0 <= idx < len(all_paras):
            all_paras[idx].role = role


def rebuild_chapters(doc: Document, reviewed: list[dict[str, Any]]) -> list[Chapter]:
    """Reconstruct Chapter objects from a reviewed chapter list.

    *reviewed* is the list of ``{"title": str, "role": str,
    "start_paragraph_index": int}`` dicts submitted with the review.
    Paragraphs are re-assigned to new chapters based on the
    ``start_paragraph_index`` boundaries.
    """
    all_paras = [p for ch in doc.chapters for p in ch.paragraphs]
    new_chapters: list[Chapter] = []

    roles: list[ChapterRole] = []
    for rc in reviewed:
        try:
            roles.append(ChapterRole(rc.get("role", "body")))
        except ValueError:
            roles.append(ChapterRole.body)
    # 前後附屬內容不佔故事章號。
    numbers = assign_chapter_numbers(roles)

    for i, rc in enumerate(reviewed):
        ch_num = numbers[i]
        role = roles[i]
        title = rc.get("title") or None
        start = rc["start_paragraph_index"]
        end = reviewed[i + 1]["start_paragraph_index"] if i + 1 < len(reviewed) else len(all_paras)

        ch_paras = [
            p.model_copy(update={"chapter_number": ch_num, "position": pos})
            for pos, p in enumerate(all_paras[start:end])
        ]
        new_chapters.append(Chapter(number=ch_num, title=title, role=role, paragraphs=ch_paras))

    return new_chapters


def apply_review(doc: Document, payload: dict[str, Any]) -> bool:
    """Apply a submitted review to *doc* in place; return whether anything was rebuilt.

    *payload* keys (snake_case): ``chapters`` (optional list of ``{title, role,
    start_paragraph_index}``), ``role_overrides``, ``paragraph_splits``.

    `chapters` 省略或是空清單＝「照系統判斷的結構接受」：什麼都不重建，回傳 False。
    這時 `role_overrides`、`paragraph_splits` 也**不會**套用（與舊版
    `chapter_review_node` 相同）。用空清單重建會得到零章的文件，接著
    `replace_chapters` 會把整本書的章節與段落刪光，所以這個判斷同時是防呆。
    """
    chapters = payload.get("chapters")
    if not chapters:
        return False
    # 先切段：role_overrides 與 chapters 的索引指的是切段之後的攤平順序。
    apply_paragraph_splits(doc, payload.get("paragraph_splits") or {})
    apply_role_overrides(doc, payload.get("role_overrides") or {})
    doc.chapters = rebuild_chapters(doc, chapters)
    return True


def build_review_data(doc: Document) -> dict[str, Any]:
    """Review payload of N-02d (snake_case; the API layer converts to camelCase).

    ``paragraph_index`` is the global flat index that the review submission
    (``start_paragraph_index``, ``role_overrides``, ``paragraph_splits``) refers to.
    """
    global_idx = 0
    chapters: list[dict[str, Any]] = []
    for chapter_idx, chapter in enumerate(doc.chapters):
        paragraphs: list[dict[str, Any]] = []
        for para in chapter.paragraphs:
            sentences = [s for s in _SENTENCE_END.split(para.text) if s.strip()]
            if not sentences:
                sentences = [para.text]
            paragraphs.append(
                {
                    "paragraph_index": global_idx,
                    "text": para.text,
                    "role": para.role.value,
                    "title_span": list(para.title_span) if para.title_span else None,
                    "sentences": sentences,
                }
            )
            global_idx += 1
        chapters.append(
            {
                "chapter_idx": chapter_idx,
                "title": chapter.title,
                "role": chapter.role.value,
                "paragraphs": paragraphs,
            }
        )
    return {"chapters": chapters}
