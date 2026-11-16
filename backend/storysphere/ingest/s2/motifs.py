"""不需要角色 id 的第 1 層證據：意象（步驟 5）與書籍背景（步驟 6）。"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

from storysphere.domain.evidence import BookSettingContent, ImageryMotifContent
from storysphere.ingest.s2.common import (
    EXTRACTION_CONFIDENCE,
    UnitView,
    clean_content,
    locate_item_quote,
    short,
)
from storysphere.ingest.s2.imagery import Embedder, cluster_terms, embed_terms
from storysphere.ingest.s2.parse import clean_str, list_items
from storysphere.ingest.s2.report import MALFORMED_ITEM, S2Report
from storysphere.store.evidence_writer import EvidenceDraft, QuoteDraft

_SETTING_ASPECTS = ("era", "place", "social_norms", "world_type", "other")
SETTING_DESCRIPTION_MAX = 500


@dataclass(frozen=True)
class Occurrence:
    """One imagery mention whose quote was found in the unit."""

    term: str
    imagery_type: str
    chapter: int
    quote: QuoteDraft


def collect_occurrences(
    views: list[UnitView], texts: dict[str, str], report: S2Report
) -> list[Occurrence]:
    result: list[Occurrence] = []
    for view in views:
        unit = view.unit
        for item in list_items(view.s1b, "imagery", report, unit.id):
            term = clean_str(item.get("term"))
            if term is None:
                report.drop(MALFORMED_ITEM, f"{unit.id}: imagery without term")
                continue
            quote = locate_item_quote(view, item.get("quote"), texts, report, f"imagery '{term}'")
            if quote is None:
                continue
            kind = clean_str(item.get("imagery_type"))
            result.append(Occurrence(term, kind.lower() if kind else "other", unit.chapter, quote))
    return result


async def imagery_drafts(
    occurrences: list[Occurrence], embedder: Embedder | None, report: S2Report
) -> list[EvidenceDraft]:
    """Cluster the terms by embedding similarity; one `imagery_motif` per cluster."""
    if not occurrences:
        return []
    terms = [o.term for o in occurrences]
    unique = list(dict.fromkeys(terms))
    clusters = cluster_terms(terms, await embed_terms(embedder, unique))

    drafts: list[EvidenceDraft] = []
    for cluster in clusters:
        members = sorted(
            (o for o in occurrences if o.term in cluster.terms), key=lambda o: o.chapter
        )
        votes = Counter(o.imagery_type for o in members)
        imagery_type = votes.most_common(1)[0][0]
        distribution = Counter(str(o.chapter) for o in members)
        content = clean_content(
            ImageryMotifContent,
            {
                "term": cluster.canonical,
                "imagery_type": imagery_type,
                "aliases": cluster.variants,
                "frequency": len(members),
                "chapter_distribution": dict(
                    sorted(distribution.items(), key=lambda kv: int(kv[0]))
                ),
            },
            report,
            f"imagery '{cluster.canonical}'",
        )
        if content is None:
            continue
        quotes = list(dict.fromkeys((o.quote.paragraph_id, o.quote.text) for o in members))
        drafts.append(
            EvidenceDraft(
                claim_type="imagery_motif",
                summary=cluster.canonical,
                confidence=EXTRACTION_CONFIDENCE,
                content=content,
                quotes=[QuoteDraft(paragraph_id=p, text=t) for p, t in quotes],
                discourse_chapter=members[0].chapter,
                discourse_paragraph_id=members[0].quote.paragraph_id,
            )
        )
    return drafts


def setting_drafts(
    views: list[UnitView], texts: dict[str, str], report: S2Report
) -> list[EvidenceDraft]:
    """Merge the hints of one `aspect` into one `book_setting` (02 §4 步驟 6)."""
    by_aspect: dict[str, list[tuple[int, str, QuoteDraft]]] = {}
    unknown_aspects: list[str] = []
    for view in views:
        unit = view.unit
        for item in list_items(view.s1b, "book_setting_hints", report, unit.id):
            value = clean_str(item.get("value"))
            if value is None:
                report.drop(MALFORMED_ITEM, f"{unit.id}: setting hint without value")
                continue
            aspect = (clean_str(item.get("aspect")) or "other").lower()
            quote = locate_item_quote(view, item.get("quote"), texts, report, f"setting '{aspect}'")
            if quote is None:
                continue
            key = aspect if aspect in _SETTING_ASPECTS else "other"
            if key != aspect and aspect not in unknown_aspects:
                unknown_aspects.append(aspect)
            by_aspect.setdefault(key, []).append((unit.chapter, value, quote))

    drafts: list[EvidenceDraft] = []
    for aspect, hints in by_aspect.items():
        counts = Counter(value for _, value, _ in hints)
        # 最常出現的說法當 value（同次數取先出現的）；其餘說法併進 description。
        value = max(counts, key=lambda v: counts[v])
        others = [v for v in counts if v != value]
        content = clean_content(
            BookSettingContent,
            {
                "aspect": aspect,
                "value": value,
                "description": "；".join(others)[:SETTING_DESCRIPTION_MAX],
                # 不在枚舉內的 aspect 併進 other，原字串留在 raw_label（01 §6）。
                **(
                    {"raw_label": " | ".join(unknown_aspects)}
                    if aspect == "other" and unknown_aspects
                    else {}
                ),
            },
            report,
            f"setting '{aspect}'",
        )
        if content is None:
            continue
        quotes = list(dict.fromkeys((q.paragraph_id, q.text) for _, _, q in hints))
        first_chapter, _, first_quote = hints[0]
        drafts.append(
            EvidenceDraft(
                claim_type="book_setting",
                summary=f"{aspect}：{short(value, 80)}",
                confidence=EXTRACTION_CONFIDENCE,
                content=content,
                quotes=[QuoteDraft(paragraph_id=p, text=t) for p, t in quotes],
                discourse_chapter=first_chapter,
                discourse_paragraph_id=first_quote.paragraph_id,
            )
        )
    return drafts
